import os
import time
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from .db import append_chat_message, load_chat_messages
from .schemas import ModelResult
from .state import CHAT_SESSIONS, MAX_HISTORY_MESSAGES, POLICY_TEXT
from .text_rules import (
	_build_chat_prompt_with_progress,
	_build_prompt,
	_direct_answer_risk,
	_enforce_easy_chat_reply,
	_enforce_easy_hint,
)


MAX_HISTORY_TURNS_FOR_MODEL = 6
MAX_HISTORY_ITEM_CHARS = 500


def _compact_history_text(content: str) -> str:
	text = " ".join((content or "").split())
	if not text:
		return ""
	if len(text) <= MAX_HISTORY_ITEM_CHARS:
		return text
	return text[:MAX_HISTORY_ITEM_CHARS] + " ...[truncated]"


def _groq_client(temperature: float) -> ChatGroq:
	return ChatGroq(
		model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
		api_key=os.getenv("GROQ_API_KEY"),
		temperature=temperature,
	)


def _history_to_messages(history: list[dict[str, str]]) -> list[Any]:
	messages: list[Any] = []
	trimmed_history = history[-(MAX_HISTORY_TURNS_FOR_MODEL * 2) :]
	for item in trimmed_history:
		role = item.get("role", "")
		content = _compact_history_text(item.get("content", ""))
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
		if not output_text.strip():
			return {
				"provider": provider,
				"model": model,
				"response": "ERROR: Model returned an empty response.",
				"latency_ms": int((time.perf_counter() - start_time) * 1000),
				"direct_answer_risk": True,
				"direct_answer_reason": "Model returned empty output",
				"error_category": None,
				"highlighted_lines": [],
				"diagnostic_summary": None,
				"error": "Empty model response",
			}
		latency_ms = int((time.perf_counter() - start_time) * 1000)
		risk, reason = _direct_answer_risk(output_text)
		return {
			"provider": provider,
			"model": model,
			"response": output_text,
			"latency_ms": latency_ms,
			"direct_answer_risk": risk,
			"direct_answer_reason": reason,
			"error_category": None,
			"highlighted_lines": [],
			"diagnostic_summary": None,
			"error": None,
		}
	except Exception as exc:
		latency_ms = int((time.perf_counter() - start_time) * 1000)
		return {
			"provider": provider,
			"model": model,
			"response": "ERROR: Model call failed.",
			"latency_ms": latency_ms,
			"direct_answer_risk": True,
			"direct_answer_reason": "Model call failed",
			"error_category": None,
			"highlighted_lines": [],
			"diagnostic_summary": None,
			"error": str(exc),
		}


async def _run_chat_turn(
	session_id: str,
	course_id: str | None,
	message: str,
	question: str,
	student_code: str,
	chat_mode: str,
	temperature: float,
) -> dict[str, Any]:
	model_name = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
	api_key = os.getenv("GROQ_API_KEY")
	if not api_key:
		return {
			"provider": "groq",
			"model": model_name,
			"response": "ERROR: GROQ_API_KEY is not set.",
			"latency_ms": 0,
			"direct_answer_risk": True,
			"direct_answer_reason": "GROQ_API_KEY is missing",
			"error_category": None,
			"highlighted_lines": [],
			"diagnostic_summary": None,
			"error": "GROQ_API_KEY is not set",
		}

	if course_id:
		user_prompt = _build_chat_prompt_with_progress(course_id, session_id, message, question, student_code, chat_mode)
	else:
		user_prompt = _build_prompt(" ".join([message.strip(), question.strip()]).strip(), student_code)
	history = CHAT_SESSIONS.get(session_id)
	if history is None:
		try:
			history = load_chat_messages(session_id, limit=MAX_HISTORY_MESSAGES)
		except Exception:
			history = []
		CHAT_SESSIONS[session_id] = history

	start_time = time.perf_counter()
	try:
		llm = _groq_client(temperature)
		messages: list[Any] = [SystemMessage(content=POLICY_TEXT)]
		messages.extend(_history_to_messages(history))
		messages.append(HumanMessage(content=user_prompt))

		reply = await llm.ainvoke(messages)
		raw_text = str(reply.content).strip()
		if chat_mode == "mini":
			output_text = _enforce_easy_hint(raw_text)
		else:
			output_text = raw_text if raw_text else _enforce_easy_chat_reply(raw_text)
		if not output_text.strip():
			output_text = "ERROR: Model returned an empty response."
		latency_ms = int((time.perf_counter() - start_time) * 1000)
		risk, reason = _direct_answer_risk(output_text)

		compact_user_text = " ".join(message.strip().split()) if message.strip() else "(student requested code help)"
		history.append({"role": "user", "content": compact_user_text})
		history.append({"role": "assistant", "content": output_text})
		_trim_history(history)
		try:
			append_chat_message(session_id, "user", compact_user_text)
			append_chat_message(session_id, "assistant", output_text)
		except Exception:
			pass

		return {
			"provider": "groq",
			"model": model_name,
			"response": output_text,
			"latency_ms": latency_ms,
			"direct_answer_risk": risk,
			"direct_answer_reason": reason,
			"error_category": None,
			"highlighted_lines": [],
			"diagnostic_summary": None,
			"error": None,
		}
	except Exception as exc:
		latency_ms = int((time.perf_counter() - start_time) * 1000)
		return {
			"provider": "groq",
			"model": model_name,
			"response": "ERROR: Model call failed.",
			"latency_ms": latency_ms,
			"direct_answer_risk": True,
			"direct_answer_reason": "Model call failed",
			"error_category": None,
			"highlighted_lines": [],
			"diagnostic_summary": None,
			"error": str(exc),
		}


async def _run_groq_only(question: str, student_code: str, temperature: float) -> dict[str, Any]:
	model_name = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
	api_key = os.getenv("GROQ_API_KEY")
	if not api_key:
		return {
			"provider": "groq",
			"model": model_name,
			"response": "ERROR: GROQ_API_KEY is not set.",
			"latency_ms": 0,
			"direct_answer_risk": True,
			"direct_answer_reason": "GROQ_API_KEY is missing",
			"error_category": None,
			"highlighted_lines": [],
			"diagnostic_summary": None,
			"error": "GROQ_API_KEY is not set",
		}

	prompt = _build_prompt(question, student_code)
	return await _run_model("groq", model_name, _groq_client(temperature), prompt)
