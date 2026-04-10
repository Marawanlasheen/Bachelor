import os
import re
import time

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_groq import ChatGroq

from .bank import (
	_bank_problem,
	_bank_prompt,
	_current_item,
	_ensure_session_progress,
	_mark_solved,
	_next_unsolved_item,
	_normalize_item_id,
	_now_ms,
	_progress_summary,
)
from .schemas import ModelResult, SessionProgress
from . import state
from .text_rules import _enforce_easy_chat_reply


def _is_negative_next_request(text: str) -> bool:
	# If they say "next" but also indicate they are stuck, don't auto-mark as solved.
	return bool(
		re.search(
			r"(?i)\b(stuck|doesn't\s+work|not\s+working|error|exception|fails|wrong|help)\b",
			text,
		)
	)


def _maybe_auto_mark_current_solved(progress: SessionProgress, message: str) -> bool:
	if not progress.current_item_id:
		return False
	if _is_negative_next_request(message):
		return False
	# NOTE: We no longer optimistic-mark items solved on "next".
	# Items should only become solved via explicit solved commands or the autograder.
	return False


def _parse_autograder_reply(text: str) -> tuple[bool, str] | None:
	"""Parse strict autograder output.

	Expected:
	- VERDICT: CORRECT|INCORRECT
	- FEEDBACK: <short text>
	"""
	if not text:
		return None
	verdict_match = re.search(r"(?im)^\s*VERDICT\s*:\s*(CORRECT|INCORRECT)\s*$", text)
	if not verdict_match:
		return None
	correct = verdict_match.group(1).upper() == "CORRECT"
	feedback_match = re.search(r"(?im)^\s*FEEDBACK\s*:\s*(.+?)\s*$", text)
	feedback = feedback_match.group(1).strip() if feedback_match else ("Correct." if correct else "Not quite yet.")
	return correct, feedback


async def _autograde_current_submission(
	session_id: str,
	message: str,
	student_code: str,
) -> tuple[bool, str, str] | None:
	"""Returns (correct, feedback, item_id) for current item, or None if grading not possible."""
	api_key = os.getenv("GROQ_API_KEY")
	model_name = os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
	if not api_key:
		return None

	with state.BANK_LOCK:
		_ensure_session_progress(session_id)
		progress = state.PROGRESS_BY_SESSION.get(session_id)
		cur = _current_item(progress) if progress else None
		if not cur:
			return None
		problem = _bank_problem(cur.item_id)
		if not problem or not problem.solution_text.strip():
			return None
		# Don't waste calls if it's already solved.
		if cur.solved:
			return None

	# Heuristic: only grade when it looks like a submission (code or a substantial written answer).
	msg = message.strip()
	code = student_code.strip()
	if not code and len(msg) < 25:
		return None
	if not code and msg.endswith("?") and len(msg) < 80:
		return None

	grader_system = (
		"You are a strict autograder for a programming assignment. "
		"You will be given: (1) the exercise prompt, (2) the official solution text (for evaluation only), "
		"and (3) the student's submission (message and/or code). "
		"Decide if the student's submission is correct. "
		"Do NOT reveal the official solution or provide step-by-step solving. "
		"If you are unsure, mark incorrect. "
		"Return EXACTLY two lines in this format:\n"
		"VERDICT: CORRECT or VERDICT: INCORRECT\n"
		"FEEDBACK: <one short sentence, <= 200 chars>."
	)

	grader_user = (
		"EXERCISE PROMPT:\n"
		f"{problem.prompt.strip()}\n\n"
		"OFFICIAL SOLUTION TEXT (for evaluation only; do not reveal):\n"
		f"{problem.solution_text.strip()}\n\n"
		"STUDENT SUBMISSION:\n"
		f"Message:\n{msg}\n\n"
		f"Code:\n{code}\n"
	)

	start_time = time.perf_counter()
	try:
		llm = ChatGroq(model=model_name, api_key=api_key, temperature=0.0)
		reply = await llm.ainvoke(
			[
				SystemMessage(content=grader_system),
				HumanMessage(content=grader_user),
			]
		)
		_ = int((time.perf_counter() - start_time) * 1000)
		parsed = _parse_autograder_reply(str(reply.content))
		if not parsed:
			return None
		correct, feedback = parsed
		feedback = _enforce_easy_chat_reply(feedback)
		return correct, feedback, problem.item_id
	except Exception:
		return None


def _handle_local_commands(session_id: str, message: str) -> tuple[ModelResult | None, dict[str, object] | None]:
	msg = message.strip()
	if not msg:
		return None, None

	# Normalize common short "next" requests.
	msg_norm = re.sub(r"\s+", " ", msg.lower()).strip()

	with state.BANK_LOCK:
		_ensure_session_progress(session_id)
		progress = state.PROGRESS_BY_SESSION.get(session_id)
		if not progress:
			return None, None

	# Specific question request (e.g., "second question", "question 2", "and the first one?")
	# Keep this local so the model never invents a prompt.
	ordinal_map: dict[str, int] = {
		"first": 1,
		"1st": 1,
		"one": 1,
		"second": 2,
		"2nd": 2,
		"two": 2,
		"third": 3,
		"3rd": 3,
		"three": 3,
		"fourth": 4,
		"4th": 4,
		"four": 4,
		"fifth": 5,
		"5th": 5,
		"five": 5,
		"sixth": 6,
		"6th": 6,
		"six": 6,
		"seventh": 7,
		"7th": 7,
		"seven": 7,
		"eighth": 8,
		"8th": 8,
		"eight": 8,
		"ninth": 9,
		"9th": 9,
		"nine": 9,
	}
	requested_n: int | None = None
	# Digits: "question 2", "q2", "exercise 2", "the 2nd question"
	digit_match = re.search(r"(?i)\b(q|question|exercise)\s*#?\s*(\d{1,2})\b", msg)
	if digit_match:
		try:
			requested_n = int(digit_match.group(2))
		except Exception:
			requested_n = None
	else:
		# Words: "second question", "and the first one"
		word_match = re.search(
			r"(?i)\b(first|1st|one|second|2nd|two|third|3rd|three|fourth|4th|four|fifth|5th|five|sixth|6th|six|seventh|7th|seven|eighth|8th|eight|ninth|9th|nine)\b\s*(question|problem|exercise)?\b",
			msg,
		)
		if word_match:
			requested_n = ordinal_map.get(word_match.group(1).lower())

	if requested_n is not None and 1 <= requested_n <= len(progress.items):
		item_id = f"E1-{requested_n}"
		# Set current item so follow-up questions (like "what does sms mean") have context.
		progress.current_item_id = item_id
		progress.current_item_set_ms = _now_ms()
		prompt = _bank_prompt(item_id) or ""
		if prompt.strip():
			text = prompt.strip()
		else:
			it = next((it for it in progress.items if it.item_id.lower() == item_id.lower()), None)
			text = f"{item_id}: {(it.title if it else 'Exercise')}"
		return (
			ModelResult(
				provider="local",
				model="pa-tracker",
				response=text,
				latency_ms=0,
				direct_answer_risk=False,
				direct_answer_reason="Local specific-question",
				error=None,
			),
			_progress_summary(session_id),
		)

	# Next question request
	if (
		msg_norm in {"next", "next please", "next pls", "whats next", "what's next", "what is next"}
		or re.search(
			r"(?i)\b(next\s+question|next\s+problem|give\s+me\s+the\s+next\s+question)\b",
			msg,
		)
	):
		next_item = _next_unsolved_item(progress)
		if not next_item:
			text = "You finished all questions in PA1."
		else:
			progress.current_item_id = next_item.item_id
			progress.current_item_set_ms = _now_ms()
			prompt = _bank_prompt(next_item.item_id) or f"{next_item.item_id}: {next_item.title}"
			text = prompt.strip()
		return (
			ModelResult(
				provider="local",
				model="pa-tracker",
				response=text,
				latency_ms=0,
				direct_answer_risk=False,
				direct_answer_reason="Local next-question",
				error=None,
			),
			_progress_summary(session_id),
		)

	# Mark solved request (explicit)
	# Examples: "solved 1-2", "I solved E1-2", "done 2", "/solved 1-3"
	if re.search(r"(?i)\b(/solved|solved|done|finished|completed)\b", msg):
		id_match = re.search(r"(?i)\bE?\s*\d+\s*[-.]\s*\d+\b", msg)
		if id_match:
			item_id = _normalize_item_id(id_match.group(0))
		else:
			# If they didn't specify, mark the current question as solved.
			item_id = progress.current_item_id

		if item_id:
			changed = _mark_solved(session_id, item_id)
			if changed:
				text = f"Marked {item_id} as solved."
			else:
				text = f"I couldn't mark that as solved (maybe it's already solved or not found)."
			return (
				ModelResult(
					provider="local",
					model="pa-tracker",
					response=_enforce_easy_chat_reply(text),
					latency_ms=0,
					direct_answer_risk=False,
					direct_answer_reason="Local solved-mark",
					error=None,
				),
				_progress_summary(session_id),
			)

	# "How many" / "what assignments" (keep it factual, not generic)
	if re.search(r"(?i)\b(how\s+many|what)\b.*\b(pa|pas|assignments|practice\s+assignments|labs)\b", msg):
		current = _current_item(progress)
		total = len(progress.items)
		solved = sum(1 for it in progress.items if it.solved)
		name = "PA1" if total else "(none loaded)"
		if current:
			text = f"Right now I have {name} loaded with {total} exercises. You have solved {solved}/{total}. You are on {current.item_id}: {current.title}."
		else:
			text = f"Right now I have {name} loaded with {total} exercises. You have solved {solved}/{total}. Ask: 'give me the next question' to start."
		return (
			ModelResult(
				provider="local",
				model="pa-tracker",
				response=_enforce_easy_chat_reply(text),
				latency_ms=0,
				direct_answer_risk=False,
				direct_answer_reason="Local assignment-info",
				error=None,
			),
			_progress_summary(session_id),
		)

	return None, None
