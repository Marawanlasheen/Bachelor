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
	message: str = ""
	question: str = ""
	student_code: str = ""
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
	keep_progress: bool = False


class SetCurrentRequest(BaseModel):
	session_id: str = Field(..., min_length=1)
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
	email: str = Field(..., min_length=3)
	password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
	email: str = Field(..., min_length=3)
	password: str = Field(..., min_length=6)


class AuthUser(BaseModel):
	email: str
	session_id: str


class AuthResponse(BaseModel):
	access_token: str
	token_type: str = "bearer"
	user: AuthUser
	progress: dict[str, Any] | None = None
