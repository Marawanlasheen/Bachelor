import uuid
from typing import Any

from pydantic import BaseModel, Field


class CompareRequest(BaseModel):
	question: str = Field(..., min_length=5)
	student_code: str = Field(..., min_length=2)
	temperature: float = 0.2
	session_id: str | None = None


class ChatRequest(BaseModel):
	session_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
	course_id: str | None = None
	message: str = ""
	question: str = ""
	student_code: str = ""
	chat_mode: str = "main"
	temperature: float = 0.2


class JavaCompileRequest(BaseModel):
	code: str = Field(..., min_length=1)
	timeout_sec: float = 4.0


class JavaCompileResponse(BaseModel):
	compile_success: bool
	run_success: bool
	class_name: str
	stdout: str
	stderr: str
	exit_code: int | None = None
	error_category: str | None = None
	highlighted_lines: list[int] = Field(default_factory=list)
	diagnostic_summary: str | None = None


class ResetSessionRequest(BaseModel):
	session_id: str = Field(..., min_length=1)
	course_id: str | None = None
	keep_progress: bool = False


class SetCurrentRequest(BaseModel):
	session_id: str = Field(..., min_length=1)
	course_id: str = Field(..., min_length=1)
	item_id: str = Field(..., min_length=1)


class ModelResult(BaseModel):
	provider: str
	model: str
	response: str
	latency_ms: int
	direct_answer_risk: bool
	direct_answer_reason: str
	error: str | None = None
	error_category: str | None = None
	highlighted_lines: list[int] = Field(default_factory=list)
	diagnostic_summary: str | None = None


class CompareResponse(BaseModel):
	policy: str
	result: ModelResult


class ChatResponse(BaseModel):
	policy: str
	session_id: str
	result: ModelResult
	progress: dict[str, Any] | None = None


class BankProblem(BaseModel):
	item_id: str
	title: str
	prompt: str
	solution_text: str = ""


class BankItemPublic(BaseModel):
	item_id: str
	title: str
	prompt: str


class ProgressItem(BaseModel):
	item_id: str
	title: str
	solved: bool = False


class SessionProgress(BaseModel):
	items: list[ProgressItem]
	current_item_id: str | None = None
	current_item_set_ms: int = 0
	last_submission_item_id: str | None = None
	last_submission_ms: int = 0
	updated_at_ms: int = 0


class SignupRequest(BaseModel):
	username: str = Field(..., min_length=3, max_length=40)
	email: str = Field(..., min_length=3)
	password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
	email: str = Field(..., min_length=3)
	password: str = Field(..., min_length=6)


class AuthUser(BaseModel):
	id: int
	username: str
	email: str
	session_id: str
	role: str


class ChangePasswordRequest(BaseModel):
	current_password: str = Field(..., min_length=1)
	new_password: str = Field(..., min_length=6)


class UpdateProfileRequest(BaseModel):
	username: str = Field(..., min_length=3, max_length=40)


class AuthResponse(BaseModel):
	access_token: str
	token_type: str = "bearer"
	user: AuthUser
	progress: dict[str, Any] | None = None


class CourseCreateRequest(BaseModel):
	title: str = Field(..., min_length=2, max_length=120)
	description: str = ""


class CoursePublic(BaseModel):
	id: str
	title: str
	description: str
	owner_user_id: int
	created_at: int
	updated_at: int


class CourseItemPublic(BaseModel):
	item_id: str
	title: str
	prompt: str


class CourseItemUpdateRequest(BaseModel):
	title: str = Field(..., min_length=1, max_length=200)
	prompt: str = Field(..., min_length=1)


class CourseItemCreateRequest(BaseModel):
	title: str = Field(..., min_length=1, max_length=200)
	prompt: str = Field(..., min_length=1)


class UploadedQuestion(BaseModel):
	id: str
	title: str
	prompt: str
	preview: str | None = None


class CoursePdfPublic(BaseModel):
	id: str
	filename: str
	title: str
	questions: list[UploadedQuestion] = Field(default_factory=list)
	created_at: int
	updated_at: int


class ChatMessageStored(BaseModel):
	id: str
	sender: str
	message: str
	timestamp: int


class ChatConversationStored(BaseModel):
	id: str
	title: str
	messages: list[ChatMessageStored] = Field(default_factory=list)
	updated_at: int


class ChatConversationUpsertRequest(BaseModel):
	conversation_id: str = Field(..., min_length=1)
	title: str = Field(..., min_length=1)
	messages: list[ChatMessageStored] = Field(default_factory=list)
	updated_at: int


class UploadedAssignment(BaseModel):
	id: str
	title: str
	questions: list[UploadedQuestion] = Field(default_factory=list)
	created_at: int | None = None
	updated_at: int | None = None
