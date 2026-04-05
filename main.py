import os
import re
import time
import uuid
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_groq import ChatGroq
from pydantic import BaseModel, Field

load_dotenv()

app = FastAPI(title="Hint-First", version="0.1.0")


class CompareRequest(BaseModel):
	question: str = Field(..., min_length=5)
	student_code: str = Field(..., min_length=2)
	temperature: float = 0.2
	session_id: str | None = None


class ChatRequest(BaseModel):
	session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
	message: str = ""
	question: str = ""
	student_code: str = ""
	temperature: float = 0.2


class ResetSessionRequest(BaseModel):
	session_id: str = Field(..., min_length=1)


class ModelResult(BaseModel):
	provider: str
	model: str
	response: str
	latency_ms: int
	direct_answer_risk: bool
	direct_answer_reason: str
	error: str | None = None


class CompareResponse(BaseModel):
	policy: str
	result: ModelResult


class ChatResponse(BaseModel):
	policy: str
	session_id: str
	result: ModelResult


POLICY_TEXT = (
	"You are a friendly coding tutor sitting beside a beginner student. "
	"Keep a natural back-and-forth conversation and remember earlier turns in this session. "
	"The student may send plain text, code, or both. "
	"Answer what they asked in simple English and keep replies short. "
	"When code is provided, read all code before deciding the next hint. "
	"Give one small, direct, high-impact hint at a time. "
	"Never provide a full final solution or large ready-to-paste code. "
	"If they ask for full answer, politely refuse and still give one small hint. "
	"Prefer 1-3 short sentences; ask one short follow-up question only when helpful."
)

MAX_HISTORY_MESSAGES = 24
CHAT_SESSIONS: dict[str, list[dict[str, str]]] = {}


def _number_code_lines(student_code: str) -> str:
	lines = student_code.strip("\n").splitlines()
	if not lines:
		return "(no code provided)"
	return "\n".join(f"{index + 1:>3}: {line}" for index, line in enumerate(lines))


def _build_prompt(question: str, student_code: str) -> str:
	numbered_code = _number_code_lines(student_code)
	return (
		"Student Question:\n"
		f"{question.strip()}\n\n"
		"Student Code (read all lines before choosing one hint):\n"
		f"{numbered_code}\n\n"
		"Internal process: first scan all code, then decide the one most important blocker, then write one simple hint. "
		"Output format: 2-4 short sentences, then one short question. "
		"Return exactly one most-important hint for this moment, based on the code above. "
		"The hint must be high-level and must not include exact code replacements or line-by-line edits. "
		"Do not provide a final complete solution."
	)


def _build_chat_prompt(message: str, question: str, student_code: str) -> str:
	parts: list[str] = []
	if message.strip():
		parts.append(f"Student Message:\n{message.strip()}")
	if question.strip():
		parts.append(f"Student Question:\n{question.strip()}")
	if student_code.strip():
		parts.append(
			"Student Code (read all lines before hinting):\n"
			f"{_number_code_lines(student_code)}"
		)

	if not parts:
		parts.append("Student Message:\nHi tutor, can you help me?")

	parts.append(
		"Reply naturally as a tutor. Keep it short and give only one small next hint if needed."
	)
	return "\n\n".join(parts)


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


def _direct_answer_risk(text: str) -> tuple[bool, str]:
	lowered = text.lower()

	if "```" in text and len(text) > 350:
		return True, "Contains a long code block that may be a full solution"

	risk_patterns = [
		r"here('s| is) the (full|complete) (solution|answer)",
		r"final answer",
		r"copy and paste",
		r"use this exact code",
	]
	for pattern in risk_patterns:
		if re.search(pattern, lowered):
			return True, "Uses phrases that suggest direct-answer behavior"

	return False, "No obvious direct-answer pattern detected"


def _too_specific_hint(text: str) -> bool:
	lowered = text.lower()
	patterns = [
		r"change\s+.+\s+to\s+.+",
		r"replace\s+.+\s+with\s+.+",
		r"instead of",
		r"use this code",
		r"\bline\s+\d+\b",
		r"`[^`]+`",
	]
	return any(re.search(pattern, lowered) for pattern in patterns)


def _safe_hint_fallback() -> str:
	return (
		"You are close. Check one variable that should keep its value between loop runs. "
		"Print that value each time and see where it resets."
	)


def _too_complex_for_student(text: str) -> bool:
	words = re.findall(r"[A-Za-z']+", text)
	if not words:
		return True

	long_word_ratio = sum(1 for word in words if len(word) >= 10) / len(words)
	jargon_tokens = {
		"invariant",
		"idempotent",
		"asymptotic",
		"polymorphism",
		"memoization",
		"recursion",
		"instantiate",
		"abstraction",
		"synchronization",
	}
	jargon_count = sum(1 for word in words if word.lower() in jargon_tokens)

	return len(words) > 90 or long_word_ratio > 0.30 or jargon_count >= 2


def _enforce_easy_hint(text: str) -> str:
	cleaned = " ".join(text.strip().split())
	if not cleaned:
		return _safe_hint_fallback()

	sentences = re.split(r"(?<=[.!?])\s+", cleaned)
	trimmed = " ".join(sentence for sentence in sentences[:4] if sentence)
	if not trimmed.endswith("?") and "?" not in trimmed:
		trimmed = f"{trimmed} What is the first variable you would inspect?"

	if _too_specific_hint(trimmed) or _too_complex_for_student(trimmed):
		return _safe_hint_fallback()

	return trimmed


def _enforce_easy_chat_reply(text: str) -> str:
	cleaned = " ".join(text.strip().split())
	if not cleaned:
		return _safe_hint_fallback()

	sentences = re.split(r"(?<=[.!?])\s+", cleaned)
	trimmed = " ".join(sentence for sentence in sentences[:3] if sentence)
	if _too_complex_for_student(trimmed):
		return _safe_hint_fallback()
	return trimmed


def _groq_client(temperature: float) -> ChatGroq:
	return ChatGroq(
		model=os.getenv("GROQ_MODEL", "llama-3.1-8b-instant"),
		api_key=os.getenv("GROQ_API_KEY"),
		temperature=temperature,
	)


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

	user_prompt = _build_chat_prompt(message, question, student_code)
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


@app.get("/", response_class=HTMLResponse)
def home() -> str:
	return """
<!doctype html>
<html>
  <head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Hint-First Groq Tutor</title>
	<style>
	  body { font-family: Arial, sans-serif; max-width: 980px; margin: 20px auto; padding: 0 16px; }
	  textarea, input { width: 100%; margin: 8px 0 16px; padding: 10px; box-sizing: border-box; }
	  button { padding: 10px 14px; cursor: pointer; margin-right: 8px; }
	  .chatbox { border: 1px solid #ddd; border-radius: 8px; padding: 12px; min-height: 220px; max-height: 320px; overflow-y: auto; margin-bottom: 14px; background: #fafafa; }
	  .msg { margin: 10px 0; padding: 10px; border-radius: 8px; white-space: pre-wrap; }
	  .user { background: #e9f2ff; }
	  .assistant { background: #f1f8e9; }
	  .meta { font-size: 13px; color: #444; margin-bottom: 8px; }
	  .grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
	</style>
  </head>
  <body>
	<h2>Conversational Coding Tutor</h2>
	<p>Chat naturally with the tutor. You can send text, question, and code in each turn.</p>

	<h3>Conversation</h3>
	<div id="chatbox" class="chatbox"></div>
	<div id="groq_meta" class="meta"></div>

	<div class="grid">
	  <div>
		<label>Message (normal chat text)</label>
		<textarea id="message" rows="3" placeholder="Ask anything, like: I am stuck, what should I check first?"></textarea>
	  </div>
	  <div>
		<label>Student Code (optional)</label>
		<textarea id="student_code" rows="10" placeholder="Paste student code if needed"></textarea>
	  </div>
	</div>

	<button onclick="sendChat()">Send</button>
	<p id="status"></p>

	<script>
	  let clientSessionId = 'session-' + Math.random().toString(36).slice(2, 10);

	  function randomSessionId() {
		return 'session-' + Math.random().toString(36).slice(2, 10);
	  }

	  function appendMessage(role, text) {
		const box = document.getElementById('chatbox');
		const el = document.createElement('div');
		el.className = 'msg ' + role;
		el.textContent = (role === 'user' ? 'Student: ' : 'Tutor: ') + text;
		box.appendChild(el);
		box.scrollTop = box.scrollHeight;
	  }

	  function newSession() {
		clientSessionId = randomSessionId();
		document.getElementById('chatbox').innerHTML = '';
		document.getElementById('groq_meta').textContent = '';
		document.getElementById('status').textContent = 'Started a new session.';
	  }

	  async function resetSession() {
		const res = await fetch('/chat/reset', {
		  method: 'POST',
		  headers: { 'Content-Type': 'application/json' },
		  body: JSON.stringify({ session_id: clientSessionId })
		});

		if (!res.ok) {
		  document.getElementById('status').textContent = 'Reset failed.';
		  return;
		}

		document.getElementById('chatbox').innerHTML = '';
		document.getElementById('status').textContent = 'Session memory cleared.';
	  }

	  async function sendChat() {
		const status = document.getElementById('status');
		status.textContent = 'Tutor is thinking...';

		const message = document.getElementById('message').value;
		const studentCode = document.getElementById('student_code').value;

		if (!message.trim() && !studentCode.trim()) {
		  status.textContent = 'Write a message or code first.';
		  return;
		}

		appendMessage('user', [message, studentCode].filter(Boolean).join('\\n\\n'));

		const payload = {
		  session_id: clientSessionId,
		  message,
		  student_code: studentCode,
		  temperature: 0.2
		};

		const res = await fetch('/chat', {
		  method: 'POST',
		  headers: { 'Content-Type': 'application/json' },
		  body: JSON.stringify(payload)
		});

		if (!res.ok) {
		  const errText = await res.text();
		  status.textContent = 'Request failed: ' + errText;
		  return;
		}

		const data = await res.json();
		const g = data.result || {};

		document.getElementById('groq_meta').textContent =
		  `${g.model || ''} | ${g.latency_ms || 0} ms | risk=${g.direct_answer_risk} ${g.error ? '| error=' + g.error : ''}`;

		appendMessage('assistant', g.response || '');
		document.getElementById('message').value = '';

		status.textContent = '';
	  }

	  const msgBox = document.getElementById('message');
	  msgBox.addEventListener('keydown', function (event) {
		if (event.key === 'Enter' && !event.shiftKey) {
		  event.preventDefault();
		  sendChat();
		}
	  });

	  document.getElementById('status').textContent = '';
	</script>
  </body>
</html>
"""


@app.get("/health")
def health() -> dict[str, str]:
	return {"status": "ok"}


@app.post("/compare", response_model=CompareResponse)
async def compare_models(payload: CompareRequest) -> CompareResponse:
	if len(payload.question.strip()) < 5 or len(payload.student_code.strip()) < 2:
		raise HTTPException(status_code=400, detail="Question and code are required")

	if payload.session_id:
		raw_result = await _run_chat_turn(
			session_id=payload.session_id,
			message="",
			question=payload.question,
			student_code=payload.student_code,
			temperature=payload.temperature,
		)
	else:
		raw_result = await _run_groq_only(
			question=payload.question,
			student_code=payload.student_code,
			temperature=payload.temperature,
		)

	return CompareResponse(policy=POLICY_TEXT, result=ModelResult(**raw_result))


@app.post("/chat", response_model=ChatResponse)
async def chat_with_tutor(payload: ChatRequest) -> ChatResponse:
	if (
		not payload.message.strip()
		and not payload.question.strip()
		and not payload.student_code.strip()
	):
		raise HTTPException(status_code=400, detail="Provide message, question, or code")

	raw_result = await _run_chat_turn(
		session_id=payload.session_id,
		message=payload.message,
		question=payload.question,
		student_code=payload.student_code,
		temperature=payload.temperature,
	)

	return ChatResponse(
		policy=POLICY_TEXT,
		session_id=payload.session_id,
		result=ModelResult(**raw_result),
	)


@app.post("/chat/reset")
def reset_chat_session(payload: ResetSessionRequest) -> dict[str, str]:
	CHAT_SESSIONS.pop(payload.session_id, None)
	return {"status": "ok", "session_id": payload.session_id}
