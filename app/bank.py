import re
import time
from typing import Any

from .db import load_all_progress, load_problem_bank as load_problem_bank_db, load_progress, upsert_progress
from .schemas import BankProblem, ProgressItem, SessionProgress
from . import state


def _now_ms() -> int:
	return int(time.time() * 1000)


def _load_problem_bank() -> None:
	try:
		state.PROBLEM_BANK = load_problem_bank_db()
	except Exception:
		state.PROBLEM_BANK = []


def _load_progress_store() -> None:
	try:
		loaded = load_all_progress()
		state.PROGRESS_BY_SESSION.clear()
		state.PROGRESS_BY_SESSION.update(loaded)
	except Exception:
		return


def _save_progress_store() -> None:
	try:
		for sid, progress in state.PROGRESS_BY_SESSION.items():
			upsert_progress(sid, progress)
	except Exception:
		return


def _sync_progress_with_bank(progress: SessionProgress) -> bool:
	"""Ensure progress items match current bank while preserving solved state."""
	existing = {it.item_id.lower(): it for it in progress.items}
	updated_items: list[ProgressItem] = []
	changed = False

	for p in state.PROBLEM_BANK:
		old = existing.get(p.item_id.lower())
		solved = bool(old.solved) if old else False
		updated_items.append(ProgressItem(item_id=p.item_id, title=p.title, solved=solved))
		if old is None or old.title != p.title:
			changed = True

	if len(updated_items) != len(progress.items):
		changed = True

	valid_ids = {it.item_id.lower() for it in updated_items}
	if progress.current_item_id and progress.current_item_id.lower() not in valid_ids:
		progress.current_item_id = None
		changed = True
	if progress.last_submission_item_id and progress.last_submission_item_id.lower() not in valid_ids:
		progress.last_submission_item_id = None
		changed = True

	if changed:
		progress.items = updated_items
		progress.updated_at_ms = _now_ms()

	return changed


def _ensure_session_progress(session_id: str) -> None:
	if not state.PROBLEM_BANK:
		_load_problem_bank()
	if session_id in state.PROGRESS_BY_SESSION:
		progress = state.PROGRESS_BY_SESSION[session_id]
		if _sync_progress_with_bank(progress):
			_save_progress_store()
		return

	loaded = load_progress(session_id)
	if loaded is not None:
		state.PROGRESS_BY_SESSION[session_id] = loaded
		if _sync_progress_with_bank(loaded):
			_save_progress_store()
		return

	items = [ProgressItem(item_id=p.item_id, title=p.title, solved=False) for p in state.PROBLEM_BANK]
	state.PROGRESS_BY_SESSION[session_id] = SessionProgress(
		items=items,
		current_item_id=None,
		current_item_set_ms=0,
		last_submission_item_id=None,
		last_submission_ms=0,
		updated_at_ms=_now_ms(),
	)
	_save_progress_store()


def _progress_summary(session_id: str) -> dict[str, Any] | None:
	progress = state.PROGRESS_BY_SESSION.get(session_id)
	if not progress:
		return None
	solved_items = [it for it in progress.items if it.solved]
	unsolved_items = [it for it in progress.items if not it.solved]
	return {
		"solved": len(solved_items),
		"total": len(progress.items),
		"remaining": len(unsolved_items),
		"solved_ids": [it.item_id for it in solved_items],
		"current_item_id": progress.current_item_id,
	}


def _next_unsolved_item(progress: SessionProgress) -> ProgressItem | None:
	for item in progress.items:
		if not item.solved:
			return item
	return None


def _bank_prompt(item_id: str) -> str | None:
	for p in state.PROBLEM_BANK:
		if p.item_id.lower() == item_id.lower():
			return p.prompt
	return None


def _bank_problem(item_id: str) -> BankProblem | None:
	for p in state.PROBLEM_BANK:
		if p.item_id.lower() == item_id.lower():
			return p
	return None


def _normalize_item_id(text: str) -> str | None:
	# Accept: E1-2, e1.2, 1-2, 1.2
	t = text.strip()
	m = re.fullmatch(r"(?i)E?\s*(\d+)\s*[-.]\s*(\d+)", t)
	if m:
		return f"E{m.group(1)}-{m.group(2)}"
	# Accept: just a number like 2 -> treat as E1-2 if bank is Exercise 1-x
	m2 = re.fullmatch(r"(\d+)", t)
	if m2:
		# Try to resolve by searching for a matching *-N item in the loaded bank.
		needle = m2.group(1)
		for p in state.PROBLEM_BANK:
			if re.fullmatch(rf"(?i)E\d+[-.]\s*{re.escape(needle)}", p.item_id):
				return p.item_id.replace(".", "-")
		return None
	return None


def _mark_solved(session_id: str, item_id: str) -> bool:
	progress = state.PROGRESS_BY_SESSION.get(session_id)
	if not progress:
		return False
	for it in progress.items:
		if it.item_id.lower() == item_id.lower():
			if it.solved:
				return False
			it.solved = True
			progress.updated_at_ms = _now_ms()
			_save_progress_store()
			return True
	return False


def _current_item(progress: SessionProgress) -> ProgressItem | None:
	if not progress.current_item_id:
		return None
	for it in progress.items:
		if it.item_id.lower() == progress.current_item_id.lower():
			return it
	return None
