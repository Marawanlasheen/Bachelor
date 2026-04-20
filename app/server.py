from contextlib import asynccontextmanager
import os
import re
import uuid
from typing import Any

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

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
from .compiler import analyze_java_diagnostics, compile_and_run_java, compile_java_only
from .db import (
	authenticate_user,
	create_access_token,
	create_user,
	delete_chat_conversation,
	delete_chat_messages,
	decode_access_token,
	get_user_by_session_id,
	init_db,
	list_chat_conversations,
	list_uploaded_assignments,
	upsert_chat_conversation,
	upsert_uploaded_assignment,
)
from .llm import _run_chat_turn, _run_groq_only
from .pdf_parser import extract_pdf_text, split_questions_from_text
from .schemas import (
	AuthResponse,
	AuthUser,
	BankItemPublic,
	ChatRequest,
	ChatResponse,
	ChatConversationStored,
	ChatConversationUpsertRequest,
	CompareRequest,
	CompareResponse,
	JavaCompileRequest,
	JavaCompileResponse,
	LoginRequest,
	ModelResult,
	ResetSessionRequest,
	SetCurrentRequest,
	SignupRequest,
	UploadedAssignment,
	UploadedQuestion,
)
from . import state
from .state import BANK_LOCK, CHAT_SESSIONS, POLICY_TEXT, PROGRESS_BY_SESSION
from .text_rules import _enforce_easy_chat_reply
from .web import home


@asynccontextmanager
async def _lifespan(app: FastAPI):
	init_db()
	with BANK_LOCK:
		_load_problem_bank()
		_load_progress_store()
	yield


app = FastAPI(title="Hint-First", version="0.1.0", lifespan=_lifespan)
_bearer = HTTPBearer(auto_error=False)


def _extract_mentioned_lines(text: str) -> list[int]:
	if not text:
		return []
	lines: set[int] = set()
	for m in re.finditer(r"(?i)\bline\s+(\d+)\b", text):
		try:
			line = int(m.group(1))
			if line > 0:
				lines.add(line)
		except Exception:
			continue
	return sorted(lines)


def _require_user(credentials: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict[str, Any]:
	if credentials is None or not credentials.credentials:
		raise HTTPException(status_code=401, detail="Authentication required")
	try:
		payload = decode_access_token(credentials.credentials)
	except Exception:
		raise HTTPException(status_code=401, detail="Invalid or expired token")

	session_id = str(payload.get("sid", "")).strip()
	if not session_id:
		raise HTTPException(status_code=401, detail="Invalid token payload")
	user = get_user_by_session_id(session_id)
	if not user:
		raise HTTPException(status_code=401, detail="User not found")
	return user


# Dev-friendly CORS for the React (Vite) frontend.
_DEV_ALLOWED_ORIGINS = [
	"http://localhost:5173",
	"http://127.0.0.1:5173",
]
_cors_from_env = [s.strip() for s in os.getenv("CORS_ALLOWED_ORIGINS", "").split(",") if s.strip()]
_allowed_origins = _cors_from_env if _cors_from_env else _DEV_ALLOWED_ORIGINS
app.add_middleware(
	CORSMiddleware,
	allow_origins=_allowed_origins,
	allow_credentials=False,
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


@app.get("/assignments/uploaded", response_model=list[UploadedAssignment])
def list_uploaded_assignments_route(user: dict[str, Any] = Depends(_require_user)) -> list[UploadedAssignment]:
	rows = list_uploaded_assignments(user["session_id"])
	result: list[UploadedAssignment] = []
	for row in rows:
		questions = [UploadedQuestion(**q) for q in row.get("questions", []) if isinstance(q, dict)]
		result.append(
			UploadedAssignment(
				id=str(row.get("id", "")),
				title=str(row.get("title", "Uploaded Assignment")),
				questions=questions,
				created_at=int(row.get("created_at", 0) or 0),
				updated_at=int(row.get("updated_at", 0) or 0),
			)
		)
	return result


@app.post("/assignments/upload-pdf", response_model=UploadedAssignment)
async def upload_assignment_pdf(
	assignment_name: str = Form(...),
	pdf_file: UploadFile = File(...),
	user: dict[str, Any] = Depends(_require_user),
) -> UploadedAssignment:
	name = assignment_name.strip()
	if len(name) < 2:
		raise HTTPException(status_code=400, detail="Assignment name is required")

	filename = (pdf_file.filename or "").lower()
	content_type = (pdf_file.content_type or "").lower()
	if not filename.endswith(".pdf") and content_type not in {"application/pdf", "application/x-pdf"}:
		raise HTTPException(status_code=400, detail="Only PDF files are supported")

	max_pdf_bytes = int(os.getenv("MAX_PDF_UPLOAD_BYTES", str(10 * 1024 * 1024)))
	pdf_bytes = await pdf_file.read()
	if not pdf_bytes:
		raise HTTPException(status_code=400, detail="Uploaded PDF is empty")
	if len(pdf_bytes) > max_pdf_bytes:
		raise HTTPException(status_code=413, detail=f"PDF is too large. Max size is {max_pdf_bytes // (1024 * 1024)} MB")

	try:
		extracted_text = extract_pdf_text(pdf_bytes)
	except Exception:
		raise HTTPException(status_code=400, detail="Failed to parse PDF content")

	questions_raw = split_questions_from_text(extracted_text)
	if not questions_raw:
		raise HTTPException(status_code=400, detail="No questions were found in the uploaded PDF")

	assignment_id = f"up_{uuid.uuid4().hex[:12]}"
	questions: list[dict[str, str]] = []
	for idx, q in enumerate(questions_raw, start=1):
		q_title = str(q.get("title", "")).strip() or f"Question {idx}"
		q_prompt = str(q.get("prompt", "")).strip()
		q_id_raw = str(q.get("id", "")).strip() or f"Q{idx}"
		q_id = f"{assignment_id}:{q_id_raw}"
		questions.append({"id": q_id, "title": q_title, "prompt": q_prompt})

	upsert_uploaded_assignment(
		session_id=user["session_id"],
		assignment_id=assignment_id,
		title=name,
		questions=questions,
	)

	return UploadedAssignment(
		id=assignment_id,
		title=name,
		questions=[UploadedQuestion(**q) for q in questions],
	)


@app.post("/auth/signup", response_model=AuthResponse)
def auth_signup(payload: SignupRequest) -> AuthResponse:
	user = create_user(payload.email, payload.password)
	if user is None:
		raise HTTPException(status_code=409, detail="Email is already registered")
	with BANK_LOCK:
		_ensure_session_progress(user["session_id"])
		progress = _progress_summary(user["session_id"])
	token = create_access_token(user)
	return AuthResponse(
		access_token=token,
		token_type="bearer",
		user=AuthUser(email=user["email"], session_id=user["session_id"]),
		progress=progress,
	)


@app.post("/auth/login", response_model=AuthResponse)
def auth_login(payload: LoginRequest) -> AuthResponse:
	user = authenticate_user(payload.email, payload.password)
	if user is None:
		raise HTTPException(status_code=401, detail="Invalid email or password")
	with BANK_LOCK:
		_ensure_session_progress(user["session_id"])
		progress = _progress_summary(user["session_id"])
	token = create_access_token(user)
	return AuthResponse(
		access_token=token,
		token_type="bearer",
		user=AuthUser(email=user["email"], session_id=user["session_id"]),
		progress=progress,
	)


@app.get("/auth/me", response_model=AuthResponse)
def auth_me(user: dict[str, Any] = Depends(_require_user)) -> AuthResponse:
	with BANK_LOCK:
		_ensure_session_progress(user["session_id"])
		progress = _progress_summary(user["session_id"])
	token = create_access_token(user)
	return AuthResponse(
		access_token=token,
		token_type="bearer",
		user=AuthUser(email=user["email"], session_id=user["session_id"]),
		progress=progress,
	)


@app.post("/tracker/current")
def tracker_set_current(payload: SetCurrentRequest, user: dict[str, Any] = Depends(_require_user)) -> dict[str, Any]:
	session_id = user["session_id"]
	with BANK_LOCK:
		_ensure_session_progress(session_id)
		progress = PROGRESS_BY_SESSION.get(session_id)
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
			"session_id": session_id,
			"progress": _progress_summary(session_id),
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
async def chat_with_tutor(payload: ChatRequest, user: dict[str, Any] = Depends(_require_user)) -> ChatResponse:
	session_id = user["session_id"]
	if (
		not payload.message.strip()
		and not payload.question.strip()
		and not payload.student_code.strip()
	):
		raise HTTPException(status_code=400, detail="Provide message, question, or code")

	# If the student submits code, remember it as a submission for the current question.
	if payload.student_code.strip():
		with BANK_LOCK:
			_ensure_session_progress(session_id)
			state = PROGRESS_BY_SESSION.get(session_id)
			if state and state.current_item_id:
				state.last_submission_item_id = state.current_item_id
				state.last_submission_ms = _now_ms()
				state.updated_at_ms = _now_ms()
				_save_progress_store()

	# Local command router first (next question, "second question", etc.)
	# Route local commands from the student's explicit message only.
	# Including payload.question here causes false positives like matching
	# "Exercise 3-8" from the prompt itself.
	local_text = payload.message.strip()
	local_result, progress = _handle_local_commands(session_id, local_text)
	if local_result is not None:
		raw_result = local_result.model_dump()
		return ChatResponse(
			policy=POLICY_TEXT,
			session_id=session_id,
			result=ModelResult(**raw_result),
			progress=progress,
		)

	# Autograde: if they submitted an answer for the current exercise and it's correct,
	# confirm + mark solved immediately.
	graded = await _autograde_current_submission(
		session_id=session_id,
		message=payload.message,
		student_code=payload.student_code,
	)
	if graded is not None:
		correct, feedback, item_id = graded
		if correct:
			with BANK_LOCK:
				_ensure_session_progress(session_id)
				_mark_solved(session_id, item_id)
				progress = _progress_summary(session_id)
			text = f"Correct — marked {item_id} as solved."
			if feedback and feedback.lower() not in {"correct.", "correct"}:
				text = f"Correct — marked {item_id} as solved. {feedback}"
			return ChatResponse(
				policy=POLICY_TEXT,
				session_id=session_id,
				result=ModelResult(
					provider="local",
					model="autograder",
					response=_enforce_easy_chat_reply(text),
					latency_ms=0,
					direct_answer_risk=False,
					direct_answer_reason="Autograder marked correct",
					error_category=None,
					highlighted_lines=[],
					diagnostic_summary=None,
					error=None,
				),
				progress=progress,
			)

	with BANK_LOCK:
		_ensure_session_progress(session_id)
		progress = _progress_summary(session_id)
	raw_result = await _run_chat_turn(
		session_id=session_id,
		message=payload.message,
		question=payload.question,
		student_code=payload.student_code,
		temperature=payload.temperature,
	)

	if payload.student_code.strip():
		# Compile-only for tutor diagnostics: many student programs require stdin,
		# and running them without input can produce misleading "runtime" errors.
		compile_result = compile_java_only(payload.student_code)
		diagnostics = analyze_java_diagnostics(compile_result)
		model_hint = str(raw_result.get("response") or "").strip()
		mentioned_lines = _extract_mentioned_lines(model_hint)
		selected_lines = mentioned_lines if mentioned_lines else diagnostics["highlighted_lines"]
		raw_result["error_category"] = diagnostics["error_category"]
		raw_result["highlighted_lines"] = selected_lines
		raw_result["diagnostic_summary"] = diagnostics["diagnostic_summary"]

		category_label = str(diagnostics["error_category"] or "logical").capitalize()
		lines = selected_lines
		line_text = (
			f"Focus lines: {', '.join(str(line) for line in lines)}. "
			if isinstance(lines, list) and lines
			else ""
		)
		prefix = f"Error type: {category_label}. {line_text}".strip()
		raw_result["response"] = f"{prefix}\n\n{model_hint}".strip()

	return ChatResponse(
		policy=POLICY_TEXT,
		session_id=session_id,
		result=ModelResult(**raw_result),
		progress=progress,
	)


@app.get("/chat/conversations", response_model=list[ChatConversationStored])
def list_chat_conversations_route(user: dict[str, Any] = Depends(_require_user)) -> list[ChatConversationStored]:
	rows = list_chat_conversations(user["session_id"])
	result: list[ChatConversationStored] = []
	for row in rows:
		try:
			result.append(ChatConversationStored(**row))
		except Exception:
			continue
	return result


@app.post("/chat/conversations")
def upsert_chat_conversation_route(
	payload: ChatConversationUpsertRequest,
	user: dict[str, Any] = Depends(_require_user),
) -> dict[str, str]:
	upsert_chat_conversation(
		session_id=user["session_id"],
		conversation_id=payload.conversation_id,
		title=payload.title,
		messages=[m.model_dump() for m in payload.messages],
		updated_at_ms=payload.updated_at,
	)
	return {"status": "ok", "conversation_id": payload.conversation_id}


@app.delete("/chat/conversations/{conversation_id}")
def delete_chat_conversation_route(
	conversation_id: str,
	user: dict[str, Any] = Depends(_require_user),
) -> dict[str, Any]:
	deleted = delete_chat_conversation(user["session_id"], conversation_id)
	return {"status": "ok", "deleted": deleted, "conversation_id": conversation_id}


@app.post("/compile/java", response_model=JavaCompileResponse)
async def compile_java(payload: JavaCompileRequest) -> JavaCompileResponse:
	result = compile_and_run_java(payload.code, payload.timeout_sec)
	result.update(analyze_java_diagnostics(result))
	return JavaCompileResponse(**result)


@app.post("/chat/reset")
def reset_chat_session(payload: ResetSessionRequest, user: dict[str, Any] = Depends(_require_user)) -> dict[str, str]:
	session_id = user["session_id"]
	CHAT_SESSIONS.pop(session_id, None)
	try:
		delete_chat_messages(session_id)
	except Exception:
		pass
	if not payload.keep_progress:
		with BANK_LOCK:
			PROGRESS_BY_SESSION.pop(session_id, None)
			_save_progress_store()
	return {"status": "ok", "session_id": session_id}


@app.get("/tracker/status")
def tracker_status(session_id: str, user: dict[str, Any] = Depends(_require_user)) -> dict[str, Any]:
	_ = session_id
	actual_session_id = user["session_id"]
	with BANK_LOCK:
		_ensure_session_progress(actual_session_id)
		progress = _progress_summary(actual_session_id)
		if progress is None:
			raise HTTPException(status_code=404, detail="No progress for session")
		return {"status": "ok", "session_id": actual_session_id, "progress": progress}
