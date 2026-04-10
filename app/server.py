from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .bank import (
	_ensure_session_progress,
	_load_problem_bank,
	_load_progress_store,
	_mark_solved,
	_now_ms,
	_progress_summary,
	_save_progress_store,
)
from .commands import _autograde_current_submission, _handle_local_commands
from .llm import _run_chat_turn, _run_groq_only
from .schemas import (
	BankItemPublic,
	ChatRequest,
	ChatResponse,
	CompareRequest,
	CompareResponse,
	ModelResult,
	ResetSessionRequest,
	SetCurrentRequest,
)
from . import state
from .state import BANK_LOCK, CHAT_SESSIONS, POLICY_TEXT, PROGRESS_BY_SESSION
from .text_rules import _enforce_easy_chat_reply
from .web import home


@asynccontextmanager
async def _lifespan(app: FastAPI):
	with BANK_LOCK:
		_load_problem_bank()
		_load_progress_store()
	yield


app = FastAPI(title="Hint-First", version="0.1.0", lifespan=_lifespan)


# Dev-friendly CORS for the React (Vite) frontend.
_DEV_ALLOWED_ORIGINS = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
]
app.add_middleware(
	CORSMiddleware,
	allow_origins=_DEV_ALLOWED_ORIGINS,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


@app.get("/")
def home_route():
	return home()


@app.get("/health")
def health() -> dict[str, str]:
	return {"status": "ok"}


@app.get("/bank/items", response_model=list[BankItemPublic])
def list_bank_items() -> list[BankItemPublic]:
	with BANK_LOCK:
		# Ensure bank is loaded even if no sessions exist yet.
		if not state.PROBLEM_BANK:
			_load_problem_bank()
		return [
			BankItemPublic(item_id=p.item_id, title=p.title, prompt=p.prompt)
			for p in state.PROBLEM_BANK
		]


@app.post("/tracker/current")
def tracker_set_current(payload: SetCurrentRequest) -> dict[str, Any]:
	with BANK_LOCK:
		_ensure_session_progress(payload.session_id)
		progress = PROGRESS_BY_SESSION.get(payload.session_id)
		if not progress:
			raise HTTPException(status_code=404, detail="No progress for session")
		problem = next(
			(p for p in state.PROBLEM_BANK if p.item_id.lower() == payload.item_id.lower()),
			None,
		)
		if not problem:
			raise HTTPException(status_code=404, detail="Unknown item_id")
		progress.current_item_id = problem.item_id
		progress.current_item_set_ms = _now_ms()
		progress.updated_at_ms = _now_ms()
		_save_progress_store()
		return {
			"status": "ok",
			"session_id": payload.session_id,
			"progress": _progress_summary(payload.session_id),
		}


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

	# If the student submits code, remember it as a submission for the current question.
	if payload.student_code.strip():
		with BANK_LOCK:
			_ensure_session_progress(payload.session_id)
			state = PROGRESS_BY_SESSION.get(payload.session_id)
			if state and state.current_item_id:
				state.last_submission_item_id = state.current_item_id
				state.last_submission_ms = _now_ms()
				state.updated_at_ms = _now_ms()
				_save_progress_store()

	# Local command router first (next question, "second question", etc.)
	local_result, progress = _handle_local_commands(payload.session_id, payload.message)
	if local_result is not None:
		raw_result = local_result.model_dump()
		return ChatResponse(
			policy=POLICY_TEXT,
			session_id=payload.session_id,
			result=ModelResult(**raw_result),
			progress=progress,
		)

	# Autograde: if they submitted an answer for the current exercise and it's correct,
	# confirm + mark solved immediately.
	graded = await _autograde_current_submission(
		session_id=payload.session_id,
		message=payload.message,
		student_code=payload.student_code,
	)
	if graded is not None:
		correct, feedback, item_id = graded
		if correct:
			with BANK_LOCK:
				_ensure_session_progress(payload.session_id)
				_mark_solved(payload.session_id, item_id)
				progress = _progress_summary(payload.session_id)
			text = f"Correct — marked {item_id} as solved."
			if feedback and feedback.lower() not in {"correct.", "correct"}:
				text = f"Correct — marked {item_id} as solved. {feedback}"
			return ChatResponse(
				policy=POLICY_TEXT,
				session_id=payload.session_id,
				result=ModelResult(
					provider="local",
					model="autograder",
					response=_enforce_easy_chat_reply(text),
					latency_ms=0,
					direct_answer_risk=False,
					direct_answer_reason="Autograder marked correct",
					error=None,
				),
				progress=progress,
			)

	with BANK_LOCK:
		_ensure_session_progress(payload.session_id)
		progress = _progress_summary(payload.session_id)
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
		progress=progress,
	)


@app.post("/chat/reset")
def reset_chat_session(payload: ResetSessionRequest) -> dict[str, str]:
	CHAT_SESSIONS.pop(payload.session_id, None)
	if not payload.keep_progress:
		with BANK_LOCK:
			PROGRESS_BY_SESSION.pop(payload.session_id, None)
			_save_progress_store()
	return {"status": "ok", "session_id": payload.session_id}


@app.get("/tracker/status")
def tracker_status(session_id: str) -> dict[str, Any]:
	with BANK_LOCK:
		_ensure_session_progress(session_id)
		progress = _progress_summary(session_id)
		if progress is None:
			raise HTTPException(status_code=404, detail="No progress for session")
		return {"status": "ok", "session_id": session_id, "progress": progress}
