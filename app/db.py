import json
import os
import time
import uuid
from typing import Any

import jwt
from passlib.context import CryptContext
from sqlalchemy import BigInteger, Column, Integer, MetaData, String, Table, Text, create_engine, insert, select, update

from .schemas import SessionProgress


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
