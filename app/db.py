import json
import os
import time
import uuid
from typing import Any

import jwt
from dotenv import load_dotenv
from passlib.context import CryptContext
from sqlalchemy import BigInteger, Column, Integer, MetaData, String, Table, Text, create_engine, delete, insert, select, update

from .schemas import BankProblem, SessionProgress


# Ensure DATABASE_URL from .env is available before engine is created.
load_dotenv()


def _now_ms() -> int:
	return int(time.time() * 1000)


def _normalize_db_url(url: str) -> str:
	if url.startswith("postgres://"):
		return "postgresql://" + url[len("postgres://") :]
	return url


DATABASE_URL = _normalize_db_url(os.getenv("DATABASE_URL", "sqlite:///./app.db"))
AUTH_SECRET_KEY = os.getenv("AUTH_SECRET_KEY", "dev-insecure-change-me")
AUTH_ALGORITHM = "HS256"
AUTH_EXPIRE_SECONDS = int(os.getenv("AUTH_EXPIRE_SECONDS", "604800"))

_pwd = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

_engine_kwargs: dict[str, Any] = {"future": True, "pool_pre_ping": True}
if DATABASE_URL.startswith("sqlite"):
	_engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(DATABASE_URL, **_engine_kwargs)
metadata = MetaData()

users_table = Table(
	"users",
	metadata,
	Column("id", Integer, primary_key=True, autoincrement=True),
	Column("email", String(320), nullable=False, unique=True),
	Column("password_hash", Text, nullable=False),
	Column("session_id", String(64), nullable=False, unique=True),
	Column("created_at_ms", BigInteger, nullable=False),
)

progress_sessions_table = Table(
	"progress_sessions",
	metadata,
	Column("session_id", String(64), primary_key=True),
	Column("progress_json", Text, nullable=False),
	Column("updated_at_ms", BigInteger, nullable=False),
)

pas_items_table = Table(
	"pas_items",
	metadata,
	Column("item_id", String(64), primary_key=True),
	Column("position", Integer, nullable=False),
	Column("title", Text, nullable=False),
	Column("prompt", Text, nullable=False),
	Column("solution_text", Text, nullable=False),
	Column("updated_at_ms", BigInteger, nullable=False),
)

chat_messages_table = Table(
	"chat_messages",
	metadata,
	Column("id", Integer, primary_key=True, autoincrement=True),
	Column("session_id", String(64), nullable=False),
	Column("role", String(16), nullable=False),
	Column("content", Text, nullable=False),
	Column("created_at_ms", BigInteger, nullable=False),
)

chat_conversations_table = Table(
	"chat_conversations",
	metadata,
	Column("conversation_id", String(64), primary_key=True),
	Column("session_id", String(64), nullable=False),
	Column("title", Text, nullable=False),
	Column("messages_json", Text, nullable=False),
	Column("updated_at_ms", BigInteger, nullable=False),
)

uploaded_assignments_table = Table(
	"uploaded_assignments",
	metadata,
	Column("assignment_id", String(64), primary_key=True),
	Column("session_id", String(64), nullable=False),
	Column("title", Text, nullable=False),
	Column("questions_json", Text, nullable=False),
	Column("created_at_ms", BigInteger, nullable=False),
	Column("updated_at_ms", BigInteger, nullable=False),
)


def init_db() -> None:
	metadata.create_all(engine)


def _hash_password(password: str) -> str:
	return _pwd.hash(password)


def _verify_password(password: str, password_hash: str) -> bool:
	return _pwd.verify(password, password_hash)


def create_user(email: str, password: str) -> dict[str, Any] | None:
	email_norm = email.strip().lower()
	session_id = "u_" + uuid.uuid4().hex
	created = _now_ms()
	password_hash = _hash_password(password)

	with engine.begin() as conn:
		existing = conn.execute(
			select(users_table.c.id).where(users_table.c.email == email_norm)
		).first()
		if existing:
			return None

		conn.execute(
			insert(users_table).values(
				email=email_norm,
				password_hash=password_hash,
				session_id=session_id,
				created_at_ms=created,
			)
		)

		row = conn.execute(
			select(users_table.c.id, users_table.c.email, users_table.c.session_id).where(users_table.c.email == email_norm)
		).first()

	if not row:
		return None
	m = row._mapping
	return {"id": int(m["id"]), "email": str(m["email"]), "session_id": str(m["session_id"])}


def authenticate_user(email: str, password: str) -> dict[str, Any] | None:
	email_norm = email.strip().lower()
	with engine.begin() as conn:
		row = conn.execute(
			select(
				users_table.c.id,
				users_table.c.email,
				users_table.c.session_id,
				users_table.c.password_hash,
			).where(users_table.c.email == email_norm)
		).first()
	if not row:
		return None
	m = row._mapping
	if not _verify_password(password, str(m["password_hash"])):
		return None
	return {"id": int(m["id"]), "email": str(m["email"]), "session_id": str(m["session_id"])}


def get_user_by_session_id(session_id: str) -> dict[str, Any] | None:
	with engine.begin() as conn:
		row = conn.execute(
			select(users_table.c.id, users_table.c.email, users_table.c.session_id).where(users_table.c.session_id == session_id)
		).first()
	if not row:
		return None
	m = row._mapping
	return {"id": int(m["id"]), "email": str(m["email"]), "session_id": str(m["session_id"])}


def create_access_token(user: dict[str, Any]) -> str:
	now = int(time.time())
	payload = {
		"sub": user["email"],
		"sid": user["session_id"],
		"uid": user["id"],
		"iat": now,
		"exp": now + AUTH_EXPIRE_SECONDS,
	}
	return jwt.encode(payload, AUTH_SECRET_KEY, algorithm=AUTH_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
	return jwt.decode(token, AUTH_SECRET_KEY, algorithms=[AUTH_ALGORITHM])


def load_all_progress() -> dict[str, SessionProgress]:
	loaded: dict[str, SessionProgress] = {}
	with engine.begin() as conn:
		rows = conn.execute(select(progress_sessions_table.c.session_id, progress_sessions_table.c.progress_json)).fetchall()
	for row in rows:
		m = row._mapping
		try:
			raw = json.loads(str(m["progress_json"]))
			loaded[str(m["session_id"])] = SessionProgress(**raw)
		except Exception:
			continue
	return loaded


def load_progress(session_id: str) -> SessionProgress | None:
	with engine.begin() as conn:
		row = conn.execute(
			select(progress_sessions_table.c.progress_json).where(progress_sessions_table.c.session_id == session_id)
		).first()
	if not row:
		return None
	try:
		raw = json.loads(str(row._mapping["progress_json"]))
		return SessionProgress(**raw)
	except Exception:
		return None


def upsert_progress(session_id: str, progress: SessionProgress) -> None:
	progress_json = json.dumps(progress.model_dump(), ensure_ascii=False)
	now_ms = _now_ms()
	with engine.begin() as conn:
		updated = conn.execute(
			update(progress_sessions_table)
			.where(progress_sessions_table.c.session_id == session_id)
			.values(progress_json=progress_json, updated_at_ms=now_ms)
		)
		if int(updated.rowcount or 0) == 0:
			conn.execute(
				insert(progress_sessions_table).values(
					session_id=session_id,
					progress_json=progress_json,
					updated_at_ms=now_ms,
				)
			)


def load_problem_bank() -> list[BankProblem]:
	loaded: list[BankProblem] = []
	with engine.begin() as conn:
		rows = conn.execute(
			select(
				pas_items_table.c.item_id,
				pas_items_table.c.title,
				pas_items_table.c.prompt,
				pas_items_table.c.solution_text,
			)
			.order_by(pas_items_table.c.position.asc(), pas_items_table.c.item_id.asc())
		).fetchall()
	for row in rows:
		m = row._mapping
		try:
			loaded.append(
				BankProblem(
					item_id=str(m["item_id"]),
					title=str(m["title"]),
					prompt=str(m["prompt"]),
					solution_text=str(m["solution_text"]),
				)
			)
		except Exception:
			continue
	return loaded


def replace_problem_bank(problems: list[BankProblem]) -> None:
	now_ms = _now_ms()
	with engine.begin() as conn:
		conn.execute(delete(pas_items_table))
		for idx, p in enumerate(problems, start=1):
			conn.execute(
				insert(pas_items_table).values(
					item_id=p.item_id,
					position=idx,
					title=p.title,
					prompt=p.prompt,
					solution_text=p.solution_text,
					updated_at_ms=now_ms,
				)
			)


def load_chat_messages(session_id: str, limit: int = 100) -> list[dict[str, str]]:
	messages: list[dict[str, str]] = []
	with engine.begin() as conn:
		query = (
			select(chat_messages_table.c.role, chat_messages_table.c.content)
			.where(chat_messages_table.c.session_id == session_id)
			.order_by(chat_messages_table.c.id.desc())
			.limit(max(limit, 1))
		)
		rows = conn.execute(query).fetchall()
	for row in reversed(rows):
		m = row._mapping
		role = str(m.get("role", "")).strip().lower()
		content = str(m.get("content", ""))
		if role not in {"user", "assistant"} or not content:
			continue
		messages.append({"role": role, "content": content})
	return messages


def append_chat_message(session_id: str, role: str, content: str) -> None:
	role_norm = role.strip().lower()
	content_norm = content
	if role_norm not in {"user", "assistant"} or not content_norm:
		return
	with engine.begin() as conn:
		conn.execute(
			insert(chat_messages_table).values(
				session_id=session_id,
				role=role_norm,
				content=content_norm,
				created_at_ms=_now_ms(),
			)
		)


def delete_chat_messages(session_id: str) -> None:
	with engine.begin() as conn:
		conn.execute(delete(chat_messages_table).where(chat_messages_table.c.session_id == session_id))


def list_chat_conversations(session_id: str) -> list[dict[str, Any]]:
	conversations: list[dict[str, Any]] = []
	with engine.begin() as conn:
		rows = conn.execute(
			select(
				chat_conversations_table.c.conversation_id,
				chat_conversations_table.c.title,
				chat_conversations_table.c.messages_json,
				chat_conversations_table.c.updated_at_ms,
			)
			.where(chat_conversations_table.c.session_id == session_id)
			.order_by(chat_conversations_table.c.updated_at_ms.desc())
		).fetchall()

	for row in rows:
		m = row._mapping
		try:
			messages = json.loads(str(m["messages_json"]))
			if not isinstance(messages, list):
				messages = []
		except Exception:
			messages = []

		conversations.append(
			{
				"id": str(m["conversation_id"]),
				"title": str(m["title"]),
				"messages": messages,
				"updated_at": int(m["updated_at_ms"]),
			}
		)

	return conversations


def upsert_chat_conversation(
	session_id: str,
	conversation_id: str,
	title: str,
	messages: list[dict[str, Any]],
	updated_at_ms: int,
) -> None:
	messages_json = json.dumps(messages, ensure_ascii=False)
	with engine.begin() as conn:
		updated = conn.execute(
			update(chat_conversations_table)
			.where(chat_conversations_table.c.conversation_id == conversation_id)
			.where(chat_conversations_table.c.session_id == session_id)
			.values(
				title=title,
				messages_json=messages_json,
				updated_at_ms=updated_at_ms,
			)
		)
		if int(updated.rowcount or 0) == 0:
			conn.execute(
				insert(chat_conversations_table).values(
					conversation_id=conversation_id,
					session_id=session_id,
					title=title,
					messages_json=messages_json,
					updated_at_ms=updated_at_ms,
				)
			)


def delete_chat_conversation(session_id: str, conversation_id: str) -> bool:
	with engine.begin() as conn:
		deleted = conn.execute(
			delete(chat_conversations_table)
			.where(chat_conversations_table.c.session_id == session_id)
			.where(chat_conversations_table.c.conversation_id == conversation_id)
		)
	return int(deleted.rowcount or 0) > 0


def list_uploaded_assignments(session_id: str) -> list[dict[str, Any]]:
	assignments: list[dict[str, Any]] = []
	with engine.begin() as conn:
		rows = conn.execute(
			select(
				uploaded_assignments_table.c.assignment_id,
				uploaded_assignments_table.c.title,
				uploaded_assignments_table.c.questions_json,
				uploaded_assignments_table.c.created_at_ms,
				uploaded_assignments_table.c.updated_at_ms,
			)
			.where(uploaded_assignments_table.c.session_id == session_id)
			.order_by(uploaded_assignments_table.c.created_at_ms.desc())
		).fetchall()

	for row in rows:
		m = row._mapping
		try:
			questions = json.loads(str(m["questions_json"]))
			if not isinstance(questions, list):
				questions = []
		except Exception:
			questions = []

		assignments.append(
			{
				"id": str(m["assignment_id"]),
				"title": str(m["title"]),
				"questions": questions,
				"created_at": int(m["created_at_ms"]),
				"updated_at": int(m["updated_at_ms"]),
			}
		)

	return assignments


def upsert_uploaded_assignment(
	session_id: str,
	assignment_id: str,
	title: str,
	questions: list[dict[str, Any]],
) -> None:
	now_ms = _now_ms()
	questions_json = json.dumps(questions, ensure_ascii=False)
	with engine.begin() as conn:
		updated = conn.execute(
			update(uploaded_assignments_table)
			.where(uploaded_assignments_table.c.assignment_id == assignment_id)
			.where(uploaded_assignments_table.c.session_id == session_id)
			.values(title=title, questions_json=questions_json, updated_at_ms=now_ms)
		)
		if int(updated.rowcount or 0) == 0:
			conn.execute(
				insert(uploaded_assignments_table).values(
					assignment_id=assignment_id,
					session_id=session_id,
					title=title,
					questions_json=questions_json,
					created_at_ms=now_ms,
					updated_at_ms=now_ms,
				)
			)
