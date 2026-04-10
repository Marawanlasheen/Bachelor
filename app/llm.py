import os
import time
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from .schemas import ModelResult
from .state import CHAT_SESSIONS, MAX_HISTORY_MESSAGES, POLICY_TEXT
from .text_rules import (
	_build_chat_prompt_with_progress,
	_build_prompt,
	_direct_answer_risk,
	_enforce_easy_chat_reply,
	_enforce_easy_hint,
	_safe_hint_fallback,
)


def _groq_client(temperature: float) -> ChatGroq:
	return ChatGroq(
		model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
		api_key=os.getenv("GROQ_API_KEY"),
		temperature=temperature,
	)


def _history_to_messages(history: list[dict[str, str]]) -> list[Any]:
	messages: list[Any] = []
	for item in history:
		role = item.get("role", "")
		content = item.get("content", "")
		if not content:
			continue
		if role == "assistant":
			messages.append(AIMessage(content=content))
		else:
			messages.append(HumanMessage(content=content))
	return messages


def _trim_history(history: list[dict[str, str]]) -> None:
	if len(history) > MAX_HISTORY_MESSAGES:
		del history[:-MAX_HISTORY_MESSAGES]


async def _run_model(provider: str, model: str, llm: Any, user_prompt: str) -> dict[str, Any]:
	start_time = time.perf_counter()
	try:
		message = await llm.ainvoke(
			[
				SystemMessage(content=POLICY_TEXT),
				HumanMessage(content=user_prompt),
			]
		)
		output_text = str(message.content)
		output_text = _enforce_easy_hint(output_text)
		latency_ms = int((time.perf_counter() - start_time) * 1000)
		risk, reason = _direct_answer_risk(output_text)
		if risk:
			output_text = _safe_hint_fallback()
			risk, reason = _direct_answer_risk(output_text)
		return {
			"provider": provider,
			"model": model,
			"response": output_text,
			"latency_ms": latency_ms,
			"direct_answer_risk": risk,
			"direct_answer_reason": reason,
			"error": None,
		}
	except Exception as exc:
		latency_ms = int((time.perf_counter() - start_time) * 1000)
		return {
			"provider": provider,
			"model": model,
			"response": "",
			"latency_ms": latency_ms,
			"direct_answer_risk": True,
			"direct_answer_reason": "Model call failed",
			"error": str(exc),
		}


async def _run_chat_turn(
	session_id: str,
	message: str,
	question: str,
	student_code: str,
	temperature: float,
) -> dict[str, Any]:
	model_name = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
	api_key = os.getenv("GROQ_API_KEY")
	if not api_key:
		return {
			"provider": "groq",
			"model": model_name,
			"response": "",
			"latency_ms": 0,
			"direct_answer_risk": True,
			"direct_answer_reason": "GROQ_API_KEY is missing",
			"error": "GROQ_API_KEY is not set",
		}

	user_prompt = _build_chat_prompt_with_progress(session_id, message, question, student_code)
	history = CHAT_SESSIONS.setdefault(session_id, [])

	start_time = time.perf_counter()
	try:
		llm = _groq_client(temperature)
		messages: list[Any] = [SystemMessage(content=POLICY_TEXT)]
		messages.extend(_history_to_messages(history))
		messages.append(HumanMessage(content=user_prompt))

		reply = await llm.ainvoke(messages)
		output_text = _enforce_easy_chat_reply(str(reply.content))
		latency_ms = int((time.perf_counter() - start_time) * 1000)
		risk, reason = _direct_answer_risk(output_text)
		if risk:
			output_text = _safe_hint_fallback()
			risk, reason = _direct_answer_risk(output_text)

		history.append({"role": "user", "content": user_prompt})
		history.append({"role": "assistant", "content": output_text})
		_trim_history(history)

		return {
			"provider": "groq",
			"model": model_name,
			"response": output_text,
			"latency_ms": latency_ms,
			"direct_answer_risk": risk,
			"direct_answer_reason": reason,
			"error": None,
		}
	except Exception as exc:
		latency_ms = int((time.perf_counter() - start_time) * 1000)
		return {
			"provider": "groq",
			"model": model_name,
			"response": "",
			"latency_ms": latency_ms,
			"direct_answer_risk": True,
			"direct_answer_reason": "Model call failed",
			"error": str(exc),
		}


async def _run_groq_only(question: str, student_code: str, temperature: float) -> dict[str, Any]:
	model_name = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
	api_key = os.getenv("GROQ_API_KEY")
	if not api_key:
		return {
			"provider": "groq",
			"model": model_name,
			"response": "",
			"latency_ms": 0,
			"direct_answer_risk": True,
			"direct_answer_reason": "GROQ_API_KEY is missing",
			"error": "GROQ_API_KEY is not set",
		}

	prompt = _build_prompt(question, student_code)
	return await _run_model("groq", model_name, _groq_client(temperature), prompt)
