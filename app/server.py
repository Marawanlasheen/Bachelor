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
	_mark_solved,
	_now_ms,
	_progress_summary,
	_save_progress_store,
)
from .commands import _autograde_current_submission, _handle_local_commands
from .compiler import analyze_java_diagnostics, compile_and_run_java, compile_java_only
from .db import (
	authenticate_user,
	add_course_pdf_item,
	create_access_token,
	create_user,
	create_course,
	delete_course,
	delete_course_item,
	delete_course_pdf,
	delete_course_progress,
	delete_chat_conversation,
	delete_chat_messages,
	delete_uploaded_assignment,
	decode_access_token,
	get_user_by_session_id,
	get_course,
	init_db,
	list_course_items,
	list_course_pdfs,
	list_courses,
	list_chat_conversations,
	list_uploaded_assignments,
	replace_course_pdf_items,
	update_user_password,
	update_course_item,
	update_username,
	upsert_chat_conversation,
	upsert_course_pdf,
	upsert_uploaded_assignment,
)
from .llm import _run_chat_turn, _run_groq_only
from .pdf_parser import extract_pdf_text, split_questions_from_text
from .schemas import (
	AuthResponse,
	AuthUser,
	BankProblem,
	BankItemPublic,
	ChatRequest,
	ChatResponse,
	ChatConversationStored,
	ChatConversationUpsertRequest,
	ChangePasswordRequest,
	CompareRequest,
	CompareResponse,
	JavaCompileRequest,
	CourseCreateRequest,
	CourseItemCreateRequest,
	CourseItemPublic,
	CourseItemUpdateRequest,
	CoursePdfPublic,
	CoursePublic,
	JavaCompileResponse,
	LoginRequest,
	ModelResult,
	ResetSessionRequest,
	SetCurrentRequest,
	SignupRequest,
	UpdateProfileRequest,
	UploadedAssignment,
	UploadedQuestion,
)
from .state import BANK_LOCK, CHAT_SESSIONS, POLICY_TEXT, PROBLEM_BANK_BY_COURSE, PROGRESS_BY_COURSE_SESSION
from .text_rules import _enforce_easy_chat_reply
from .web import home


@asynccontextmanager
async def _lifespan(app: FastAPI):
	init_db()
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


def _slugify(text: str) -> str:
	clean = re.sub(r"[^a-z0-9]+", "-", text.strip().lower())
	clean = re.sub(r"-{2,}", "-", clean).strip("-")
	return clean


def _derive_topic_label(questions: list[dict[str, str]], fallback: str = "practice") -> str:
	stopwords = {
		"the", "and", "with", "from", "that", "this", "write", "program", "create", "implement",
		"using", "into", "for", "your", "java", "question", "exercise", "assignment", "code",
	}
	tokens: list[str] = []
	for q in questions[:6]:
		text = f"{q.get('title', '')} {q.get('prompt', '')}".lower()
		for token in re.findall(r"[a-z]{4,}", text):
			if token not in stopwords:
				tokens.append(token)
	if not tokens:
		return fallback

	counts: dict[str, int] = {}
	for token in tokens:
		counts[token] = counts.get(token, 0) + 1
	best = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0][0]
	return _slugify(best) or fallback


def _generate_workspace_name(questions: list[dict[str, str]]) -> str:
	if not questions:
		return "uploaded-workspace"

	first_id = str(questions[0].get("id", "")).strip()
	m = re.match(r"(?i)^E\s*(\d+)\s*[-.]\s*(\d+)$", first_id)
	if m:
		return f"pa{m.group(1)}-ex{m.group(2)}"

	m = re.match(r"(?i)^Q\s*(\d+)$", first_id)
	if m:
		topic = _derive_topic_label(questions)
		return f"{topic}-ex{m.group(1)}"

	topic = _derive_topic_label(questions)
	return f"{topic}-workspace"


def _normalize_course_item_id(raw: str, fallback_idx: int) -> str:
	text = raw.strip()
	m = re.match(r"(?i)^E\s*(\d+)\s*[-.]\s*(\d+)$", text)
	if m:
		return f"E{m.group(1)}-{m.group(2)}"
	m = re.match(r"(?i)^Q\s*(\d+)$", text)
	if m:
		return f"Q{m.group(1)}"
	return f"Q{fallback_idx}"


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


def _require_ta(user: dict[str, Any] = Depends(_require_user)) -> dict[str, Any]:
	if user.get("role") != "ta":
		raise HTTPException(status_code=403, detail="TA role required")
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


@app.get("/courses", response_model=list[CoursePublic])
def list_courses_route(user: dict[str, Any] = Depends(_require_user)) -> list[CoursePublic]:
	_ = user
	rows = list_courses()
	return [CoursePublic(**row) for row in rows]


@app.post("/courses", response_model=CoursePublic)
def create_course_route(
	payload: CourseCreateRequest,
	user: dict[str, Any] = Depends(_require_ta),
) -> CoursePublic:
	row = create_course(user["id"], payload.title.strip(), payload.description.strip())
	return CoursePublic(**row)


@app.delete("/courses/{course_id}")
def delete_course_route(
	course_id: str,
	user: dict[str, Any] = Depends(_require_ta),
) -> dict[str, Any]:
	_ = user
	deleted = delete_course(course_id)
	if not deleted:
		raise HTTPException(status_code=404, detail="Course not found")
	with BANK_LOCK:
		PROBLEM_BANK_BY_COURSE.pop(course_id, None)
		for key in list(PROGRESS_BY_COURSE_SESSION):
			if key[0] == course_id:
				PROGRESS_BY_COURSE_SESSION.pop(key, None)
	return {"status": "ok", "deleted": True, "course_id": course_id}


@app.get("/courses/{course_id}/items", response_model=list[CourseItemPublic])
def list_course_items_route(
	course_id: str,
	user: dict[str, Any] = Depends(_require_user),
) -> list[CourseItemPublic]:
	_ = user
	items = list_course_items(course_id)
	return [CourseItemPublic(item_id=it.item_id, title=it.title, prompt=it.prompt) for it in items]


@app.patch("/courses/{course_id}/items/{item_id}")
def update_course_item_route(
	course_id: str,
	item_id: str,
	payload: CourseItemUpdateRequest,
	user: dict[str, Any] = Depends(_require_ta),
) -> dict[str, str]:
	_ = user
	updated = update_course_item(course_id, item_id, payload.title.strip(), payload.prompt.strip())
	if not updated:
		raise HTTPException(status_code=404, detail="Course item not found")
	with BANK_LOCK:
		PROBLEM_BANK_BY_COURSE.pop(course_id, None)
	return {"status": "ok"}


@app.post("/courses/{course_id}/pdfs/{pdf_id}/items", response_model=UploadedQuestion)
def add_course_item_route(
	course_id: str,
	pdf_id: str,
	payload: CourseItemCreateRequest,
	user: dict[str, Any] = Depends(_require_ta),
) -> UploadedQuestion:
	course = get_course(course_id)
	if not course:
		raise HTTPException(status_code=404, detail="Course not found")
	if int(course["owner_user_id"]) != int(user["id"]):
		raise HTTPException(status_code=403, detail="Only the course owner can add questions")
	row = add_course_pdf_item(course_id, pdf_id, payload.title.strip(), payload.prompt.strip())
	if row is None:
		raise HTTPException(status_code=404, detail="Practice assignment not found")
	with BANK_LOCK:
		PROBLEM_BANK_BY_COURSE.pop(course_id, None)
		for key in list(PROGRESS_BY_COURSE_SESSION):
			if key[0] == course_id:
				PROGRESS_BY_COURSE_SESSION.pop(key, None)
	return UploadedQuestion(**row)


@app.delete("/courses/{course_id}/items/{item_id}")
def delete_course_item_route(
	course_id: str,
	item_id: str,
	user: dict[str, Any] = Depends(_require_ta),
) -> dict[str, str]:
	course = get_course(course_id)
	if not course:
		raise HTTPException(status_code=404, detail="Course not found")
	if int(course["owner_user_id"]) != int(user["id"]):
		raise HTTPException(status_code=403, detail="Only the course owner can delete questions")
	deleted = delete_course_item(course_id, item_id)
	if not deleted:
		raise HTTPException(status_code=404, detail="Course item not found")
	with BANK_LOCK:
		PROBLEM_BANK_BY_COURSE.pop(course_id, None)
		for key in list(PROGRESS_BY_COURSE_SESSION):
			if key[0] == course_id:
				PROGRESS_BY_COURSE_SESSION.pop(key, None)
	return {"status": "ok"}


@app.get("/courses/{course_id}/pdfs", response_model=list[CoursePdfPublic])
def list_course_pdfs_route(
	course_id: str,
	user: dict[str, Any] = Depends(_require_user),
) -> list[CoursePdfPublic]:
	_ = user
	rows = list_course_pdfs(course_id)
	return [CoursePdfPublic(**row) for row in rows]


@app.delete("/courses/{course_id}/pdfs/{pdf_id}")
def delete_course_pdf_route(
	course_id: str,
	pdf_id: str,
	user: dict[str, Any] = Depends(_require_ta),
) -> dict[str, Any]:
	_ = user
	file_path = delete_course_pdf(course_id, pdf_id)
	if not file_path:
		raise HTTPException(status_code=404, detail="Course PDF not found")
	try:
		if file_path and os.path.exists(file_path):
			os.remove(file_path)
	except Exception:
		pass
	with BANK_LOCK:
		PROBLEM_BANK_BY_COURSE.pop(course_id, None)
		for key in list(PROGRESS_BY_COURSE_SESSION):
			if key[0] == course_id:
				PROGRESS_BY_COURSE_SESSION.pop(key, None)
	return {"status": "ok", "deleted": True, "pdf_id": pdf_id}


@app.post("/courses/{course_id}/upload-pdf", response_model=CoursePdfPublic)
async def upload_course_pdf(
	course_id: str,
	pdf_file: UploadFile = File(...),
	assignment_name: str = Form(""),
	user: dict[str, Any] = Depends(_require_ta),
) -> CoursePdfPublic:
	course = get_course(course_id)
	if not course:
		raise HTTPException(status_code=404, detail="Course not found")
	if int(course["owner_user_id"]) != int(user["id"]):
		raise HTTPException(status_code=403, detail="Only the course owner can upload PDFs")

	filename = (pdf_file.filename or "").lower()
	content_type = (pdf_file.content_type or "").lower()
	if not filename.endswith(".pdf") and content_type not in {"application/pdf", "application/x-pdf"}:
		raise HTTPException(status_code=400, detail="Only PDF files are supported")

	max_pdf_bytes = int(os.getenv("MAX_PDF_UPLOAD_BYTES", str(10 * 1024 * 1024)))
	pdf_bytes = await pdf_file.read()
	if not pdf_bytes:
		raise HTTPException(status_code=400, detail="The uploaded file is empty. Please choose a valid PDF and try again.")
	if len(pdf_bytes) > max_pdf_bytes:
		raise HTTPException(
			status_code=413,
			detail=f"This PDF is too large ({len(pdf_bytes) // (1024 * 1024)} MB). Please upload a file under {max_pdf_bytes // (1024 * 1024)} MB.",
		)

	try:
		extracted_text = extract_pdf_text(pdf_bytes)
	except Exception:
		raise HTTPException(
			status_code=400,
			detail="We couldn't read text from this PDF. Please upload a text-based PDF (not scanned images).",
		)

	questions_raw = split_questions_from_text(extracted_text)
	if not questions_raw:
		raise HTTPException(
			status_code=400,
			detail="No questions were detected in this PDF. Please make sure headings like Exercise 1-1 or Question 1 are visible.",
		)

	pdf_id = f"cp_{uuid.uuid4().hex[:12]}"
	base_dir = os.getenv("COURSE_PDF_DIR", os.path.join("uploads", "course_pdfs"))
	os.makedirs(base_dir, exist_ok=True)
	file_basename = os.path.basename(pdf_file.filename or f"{pdf_id}.pdf")
	safe_basename = re.sub(r"[^A-Za-z0-9._-]", "_", file_basename) or f"{pdf_id}.pdf"
	file_path = os.path.join(base_dir, f"{pdf_id}_{safe_basename}")
	with open(file_path, "wb") as f:
		f.write(pdf_bytes)

	questions: list[dict[str, str]] = []
	used_question_ids: set[str] = set()
	for idx, q in enumerate(questions_raw, start=1):
		q_title = str(q.get("title", "")).strip() or f"Question {idx}"
		q_prompt = str(q.get("prompt", "")).strip()
		q_id_raw = str(q.get("id", "")).strip()
		q_id = _normalize_course_item_id(q_id_raw or f"Q{idx}", idx)
		if q_id.lower() in used_question_ids:
			q_id = f"{q_id}-{idx}"
		used_question_ids.add(q_id.lower())
		item_id = f"{pdf_id}:{q_id}"
		questions.append({"id": item_id, "title": q_title, "prompt": q_prompt, "preview": q_prompt[:180]})

	new_items = [
		BankProblem(item_id=q["id"], title=q["title"], prompt=q["prompt"], solution_text="")
		for q in questions
	]
	replace_course_pdf_items(course_id, pdf_id, new_items)
	with BANK_LOCK:
		PROBLEM_BANK_BY_COURSE.pop(course_id, None)
		for key in list(PROGRESS_BY_COURSE_SESSION):
			if key[0] == course_id:
				PROGRESS_BY_COURSE_SESSION.pop(key, None)
	requested_title = assignment_name.strip()
	name = requested_title if requested_title else (os.path.splitext(file_basename)[0] or "Uploaded PDF")
	upsert_course_pdf(
		course_id=course_id,
		owner_user_id=user["id"],
		pdf_id=pdf_id,
		filename=file_basename,
		title=name,
		file_path=file_path,
		questions=questions,
	)
	return CoursePdfPublic(
		id=pdf_id,
		filename=file_basename,
		title=name,
		questions=[UploadedQuestion(**q) for q in questions],
		created_at=_now_ms(),
		updated_at=_now_ms(),
	)


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
	assignment_name: str = Form(""),
	pdf_file: UploadFile = File(...),
	user: dict[str, Any] = Depends(_require_user),
) -> UploadedAssignment:
	requested_name = assignment_name.strip()

	filename = (pdf_file.filename or "").lower()
	content_type = (pdf_file.content_type or "").lower()
	if not filename.endswith(".pdf") and content_type not in {"application/pdf", "application/x-pdf"}:
		raise HTTPException(status_code=400, detail="Only PDF files are supported")

	max_pdf_bytes = int(os.getenv("MAX_PDF_UPLOAD_BYTES", str(10 * 1024 * 1024)))
	pdf_bytes = await pdf_file.read()
	if not pdf_bytes:
		raise HTTPException(status_code=400, detail="The uploaded file is empty. Please choose a valid PDF and try again.")
	if len(pdf_bytes) > max_pdf_bytes:
		raise HTTPException(
			status_code=413,
			detail=f"This PDF is too large ({len(pdf_bytes) // (1024 * 1024)} MB). Please upload a file under {max_pdf_bytes // (1024 * 1024)} MB.",
		)

	try:
		extracted_text = extract_pdf_text(pdf_bytes)
	except Exception:
		raise HTTPException(
			status_code=400,
			detail="We couldn't read text from this PDF. Please upload a text-based PDF (not scanned images).",
		)

	questions_raw = split_questions_from_text(extracted_text)
	if not questions_raw:
		raise HTTPException(
			status_code=400,
			detail="No questions were detected in this PDF. Please make sure headings like Exercise 1-1 or Question 1 are visible.",
		)

	name = _generate_workspace_name(questions_raw)
	if requested_name and len(_slugify(requested_name)) >= 3:
		name = _slugify(requested_name)

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


@app.delete("/assignments/uploaded/{assignment_id}")
def delete_uploaded_assignment_route(
	assignment_id: str,
	user: dict[str, Any] = Depends(_require_user),
) -> dict[str, str]:
	deleted = delete_uploaded_assignment(user["session_id"], assignment_id)
	if not deleted:
		raise HTTPException(status_code=404, detail="Uploaded assignment not found")
	return {"status": "ok"}


@app.post("/auth/student/signup", response_model=AuthResponse)
def auth_student_signup(payload: SignupRequest) -> AuthResponse:
	user, error = create_user(payload.email, payload.password, payload.username, "student")
	if user is None:
		if error and "already" in error.lower():
			raise HTTPException(status_code=409, detail=error)
		raise HTTPException(status_code=400, detail=error or "Could not create account")
	token = create_access_token(user)
	return AuthResponse(
		access_token=token,
		token_type="bearer",
		user=AuthUser(
			id=int(user["id"]),
			username=user["username"],
			email=user["email"],
			session_id=user["session_id"],
			role=user.get("role", "student"),
		),
		progress=None,
	)


@app.post("/auth/student/login", response_model=AuthResponse)
def auth_student_login(payload: LoginRequest) -> AuthResponse:
	user = authenticate_user(payload.email, payload.password)
	if user is None or user.get("role") != "student":
		raise HTTPException(status_code=401, detail="Invalid email or password")
	token = create_access_token(user)
	return AuthResponse(
		access_token=token,
		token_type="bearer",
		user=AuthUser(
			id=int(user["id"]),
			username=user["username"],
			email=user["email"],
			session_id=user["session_id"],
			role=user.get("role", "student"),
		),
		progress=None,
	)


@app.post("/auth/ta/signup", response_model=AuthResponse)
def auth_ta_signup(payload: SignupRequest) -> AuthResponse:
	user, error = create_user(payload.email, payload.password, payload.username, "ta")
	if user is None:
		if error and "already" in error.lower():
			raise HTTPException(status_code=409, detail=error)
		raise HTTPException(status_code=400, detail=error or "Could not create account")
	token = create_access_token(user)
	return AuthResponse(
		access_token=token,
		token_type="bearer",
		user=AuthUser(
			id=int(user["id"]),
			username=user["username"],
			email=user["email"],
			session_id=user["session_id"],
			role=user.get("role", "ta"),
		),
		progress=None,
	)


@app.post("/auth/ta/login", response_model=AuthResponse)
def auth_ta_login(payload: LoginRequest) -> AuthResponse:
	user = authenticate_user(payload.email, payload.password)
	if user is None or user.get("role") != "ta":
		raise HTTPException(status_code=401, detail="Invalid email or password")
	token = create_access_token(user)
	return AuthResponse(
		access_token=token,
		token_type="bearer",
		user=AuthUser(
			id=int(user["id"]),
			username=user["username"],
			email=user["email"],
			session_id=user["session_id"],
			role=user.get("role", "ta"),
		),
		progress=None,
	)


@app.get("/auth/me", response_model=AuthResponse)
def auth_me(user: dict[str, Any] = Depends(_require_user)) -> AuthResponse:
	token = create_access_token(user)
	return AuthResponse(
		access_token=token,
		token_type="bearer",
		user=AuthUser(
			id=int(user["id"]),
			username=user["username"],
			email=user["email"],
			session_id=user["session_id"],
			role=user.get("role", "student"),
		),
		progress=None,
	)


@app.post("/auth/change-password")
def auth_change_password(payload: ChangePasswordRequest, user: dict[str, Any] = Depends(_require_user)) -> dict[str, str]:
	ok, message = update_user_password(
		session_id=user["session_id"],
		current_password=payload.current_password,
		new_password=payload.new_password,
	)
	if not ok:
		status_code = 401 if "incorrect" in message.lower() else 400
		raise HTTPException(status_code=status_code, detail=message)
	return {"status": "ok", "detail": "Password updated successfully"}


@app.patch("/auth/profile", response_model=AuthResponse)
def auth_update_profile(payload: UpdateProfileRequest, user: dict[str, Any] = Depends(_require_user)) -> AuthResponse:
	updated_user, error = update_username(user["session_id"], payload.username)
	if updated_user is None:
		status_code = 409 if error and "taken" in error.lower() else 400
		raise HTTPException(status_code=status_code, detail=error or "Could not update profile")
	token = create_access_token(updated_user)
	return AuthResponse(
		access_token=token,
		token_type="bearer",
		user=AuthUser(
			id=int(updated_user["id"]),
			username=updated_user["username"],
			email=updated_user["email"],
			session_id=updated_user["session_id"],
			role=updated_user.get("role", "student"),
		),
		progress=None,
	)


@app.post("/tracker/current")
def tracker_set_current(payload: SetCurrentRequest, user: dict[str, Any] = Depends(_require_user)) -> dict[str, Any]:
	session_id = user["session_id"]
	with BANK_LOCK:
		_ensure_session_progress(payload.course_id, session_id)
		progress = PROGRESS_BY_COURSE_SESSION.get((payload.course_id, session_id))
		if not progress:
			raise HTTPException(status_code=404, detail="No progress for session")
		problem = next(
			(p for p in list_course_items(payload.course_id) if p.item_id.lower() == payload.item_id.lower()),
			None,
		)
		if not problem:
			raise HTTPException(status_code=404, detail="Unknown item_id")
		progress.current_item_id = problem.item_id
		progress.current_item_set_ms = _now_ms()
		progress.updated_at_ms = _now_ms()
		_save_progress_store(payload.course_id, session_id, progress)
		return {
			"status": "ok",
			"session_id": session_id,
			"progress": _progress_summary(payload.course_id, session_id),
		}


@app.post("/compare", response_model=CompareResponse)
async def compare_models(payload: CompareRequest) -> CompareResponse:
	if len(payload.question.strip()) < 5 or len(payload.student_code.strip()) < 2:
		raise HTTPException(status_code=400, detail="Question and code are required")

	if payload.session_id:
		raw_result = await _run_chat_turn(
			session_id=payload.session_id,
			course_id=None,
			message="",
			question=payload.question,
			student_code=payload.student_code,
			chat_mode="main",
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
	course_id = (payload.course_id or "").strip()
	chat_mode = payload.chat_mode.strip().lower() if payload.chat_mode else "main"
	if chat_mode not in {"main", "mini"}:
		chat_mode = "main"
	if (
		not payload.message.strip()
		and not payload.question.strip()
		and not payload.student_code.strip()
	):
		raise HTTPException(status_code=400, detail="Provide message, question, or code")

	# If the student submits code, remember it as a submission for the current question.
	if payload.student_code.strip():
		with BANK_LOCK:
			if course_id:
				_ensure_session_progress(course_id, session_id)
				progress_state = PROGRESS_BY_COURSE_SESSION.get((course_id, session_id))
				if progress_state and progress_state.current_item_id:
					progress_state.last_submission_item_id = progress_state.current_item_id
					progress_state.last_submission_ms = _now_ms()
					progress_state.updated_at_ms = _now_ms()
					_save_progress_store(course_id, session_id, progress_state)

	# Local command router first (next question, "second question", etc.)
	# Route local commands from the student's explicit message only.
	# Including payload.question here causes false positives like matching
	# "Exercise 3-8" from the prompt itself.
	local_text = payload.message.strip()
	if course_id:
		local_result, progress = _handle_local_commands(course_id, session_id, local_text)
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
	if course_id:
		graded = await _autograde_current_submission(
			course_id=course_id,
			session_id=session_id,
			message=payload.message,
			student_code=payload.student_code,
		)
		if graded is not None:
			correct, feedback, item_id = graded
			if correct:
				with BANK_LOCK:
					_ensure_session_progress(course_id, session_id)
					_mark_solved(course_id, session_id, item_id)
					progress = _progress_summary(course_id, session_id)
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

	progress: dict[str, Any] | None = None
	with BANK_LOCK:
		if course_id:
			_ensure_session_progress(course_id, session_id)
			progress = _progress_summary(course_id, session_id)
	raw_result = await _run_chat_turn(
		session_id=session_id,
		course_id=course_id if course_id else None,
		message=payload.message,
		question=payload.question,
		student_code=payload.student_code,
		chat_mode=chat_mode,
		temperature=payload.temperature,
	)

	if payload.student_code.strip() and chat_mode == "mini":
		# Compile-only for tutor diagnostics: many student programs require stdin,
		# and running them without input can produce misleading "runtime" errors.
		compile_result = compile_java_only(payload.student_code)
		diagnostics = analyze_java_diagnostics(compile_result)
		if bool(compile_result.get("compile_success")):
			raw_result["error_category"] = None
			raw_result["highlighted_lines"] = []
			raw_result["diagnostic_summary"] = None
			return ChatResponse(
				policy=POLICY_TEXT,
				session_id=session_id,
				result=ModelResult(**raw_result),
				progress=progress,
			)

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
	if not payload.keep_progress and payload.course_id:
		with BANK_LOCK:
			PROGRESS_BY_COURSE_SESSION.pop((payload.course_id, session_id), None)
			delete_course_progress(payload.course_id, session_id)
	return {"status": "ok", "session_id": session_id}


@app.get("/tracker/status")
def tracker_status(course_id: str, user: dict[str, Any] = Depends(_require_user)) -> dict[str, Any]:
	actual_session_id = user["session_id"]
	with BANK_LOCK:
		_ensure_session_progress(course_id, actual_session_id)
		progress = _progress_summary(course_id, actual_session_id)
		if progress is None:
			raise HTTPException(status_code=404, detail="No progress for session")
		return {"status": "ok", "session_id": actual_session_id, "progress": progress}
