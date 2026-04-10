import json
import re
import time
from typing import Any

from .schemas import BankProblem, ProgressItem, SessionProgress
from . import state


def _now_ms() -> int:
	return int(time.time() * 1000)


def _load_problem_bank() -> None:
	if not state.BANK_PATH.exists():
		state.PROBLEM_BANK = []
		return
	try:
		raw = json.loads(state.BANK_PATH.read_text(encoding="utf-8"))
		if not isinstance(raw, list):
			state.PROBLEM_BANK = []
			return
		problems: list[BankProblem] = []
		for item in raw:
			try:
				problems.append(BankProblem(**item))
			except Exception:
				continue
		state.PROBLEM_BANK = problems
	except Exception:
		state.PROBLEM_BANK = []


def _ensure_session_progress(session_id: str) -> None:
	if not state.PROBLEM_BANK:
		_load_problem_bank()
	if session_id in state.PROGRESS_BY_SESSION:
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
		return f"E1-{m2.group(1)}"
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
			return True
	return False


def _current_item(progress: SessionProgress) -> ProgressItem | None:
	if not progress.current_item_id:
		return None
	for it in progress.items:
		if it.item_id.lower() == progress.current_item_id.lower():
			return it
	return None
