import re
import time
from typing import Any

from .db import list_course_items, load_course_progress, upsert_course_progress
from .schemas import BankProblem, ProgressItem, SessionProgress
from . import state


def _now_ms() -> int:
	return int(time.time() * 1000)


def _load_problem_bank(course_id: str) -> None:
	try:
		state.PROBLEM_BANK_BY_COURSE[course_id] = list_course_items(course_id)
	except Exception:
		state.PROBLEM_BANK_BY_COURSE[course_id] = []


def _save_progress_store(course_id: str, session_id: str, progress: SessionProgress) -> None:
	try:
		upsert_course_progress(course_id, session_id, progress)
	except Exception:
		return


def _sync_progress_with_bank(course_id: str, progress: SessionProgress) -> bool:
	"""Ensure progress items match current bank while preserving solved state."""
	existing = {it.item_id.lower(): it for it in progress.items}
	updated_items: list[ProgressItem] = []
	changed = False

	for p in state.PROBLEM_BANK_BY_COURSE.get(course_id, []):
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


def _ensure_session_progress(course_id: str, session_id: str) -> None:
	if course_id not in state.PROBLEM_BANK_BY_COURSE:
		_load_problem_bank(course_id)
	key = (course_id, session_id)
	if key in state.PROGRESS_BY_COURSE_SESSION:
		progress = state.PROGRESS_BY_COURSE_SESSION[key]
		if _sync_progress_with_bank(course_id, progress):
			_save_progress_store(course_id, session_id, progress)
		return

	loaded = load_course_progress(course_id, session_id)
	if loaded is not None:
		state.PROGRESS_BY_COURSE_SESSION[key] = loaded
		if _sync_progress_with_bank(course_id, loaded):
			_save_progress_store(course_id, session_id, loaded)
		return

	items = [ProgressItem(item_id=p.item_id, title=p.title, solved=False) for p in state.PROBLEM_BANK_BY_COURSE.get(course_id, [])]
	state.PROGRESS_BY_COURSE_SESSION[key] = SessionProgress(
		items=items,
		current_item_id=None,
		current_item_set_ms=0,
		last_submission_item_id=None,
		last_submission_ms=0,
		updated_at_ms=_now_ms(),
	)
	_save_progress_store(course_id, session_id, state.PROGRESS_BY_COURSE_SESSION[key])


def _progress_summary(course_id: str, session_id: str) -> dict[str, Any] | None:
	progress = state.PROGRESS_BY_COURSE_SESSION.get((course_id, session_id))
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


def _bank_prompt(course_id: str, item_id: str) -> str | None:
	for p in state.PROBLEM_BANK_BY_COURSE.get(course_id, []):
		if p.item_id.lower() == item_id.lower():
			return p.prompt
	return None


def _bank_problem(course_id: str, item_id: str) -> BankProblem | None:
	for p in state.PROBLEM_BANK_BY_COURSE.get(course_id, []):
		if p.item_id.lower() == item_id.lower():
			return p
	return None


def _normalize_item_id(course_id: str, text: str) -> str | None:
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
		for p in state.PROBLEM_BANK_BY_COURSE.get(course_id, []):
			if re.fullmatch(rf"(?i)E\d+[-.]\s*{re.escape(needle)}", p.item_id):
				return p.item_id.replace(".", "-")
		return None
	return None


def _mark_solved(course_id: str, session_id: str, item_id: str) -> bool:
	progress = state.PROGRESS_BY_COURSE_SESSION.get((course_id, session_id))
	if not progress:
		return False
	for it in progress.items:
		if it.item_id.lower() == item_id.lower():
			if it.solved:
				return False
			it.solved = True
			progress.updated_at_ms = _now_ms()
			_save_progress_store(course_id, session_id, progress)
			return True
	return False


def _current_item(progress: SessionProgress) -> ProgressItem | None:
	if not progress.current_item_id:
		return None
	for it in progress.items:
		if it.item_id.lower() == progress.current_item_id.lower():
			return it
	return None
