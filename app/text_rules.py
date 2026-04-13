import re

from .bank import _bank_prompt, _current_item, _ensure_session_progress
from . import state


def _number_code_lines(student_code: str) -> str:
	lines = student_code.strip("\n").splitlines()
	if not lines:
		return "(no code provided)"
	return "\n".join(f"{index + 1:>3}: {line}" for index, line in enumerate(lines))


def _build_prompt(question: str, student_code: str) -> str:
	numbered_code = _number_code_lines(student_code)
	return (
		"Student Question:\n"
		f"{question.strip()}\n\n"
		"Student Code (read all lines before choosing one hint):\n"
		f"{numbered_code}\n\n"
		"Internal process: first scan all code, then decide the one most important blocker, then write one simple hint. "
		"Output format: 2-4 short sentences, then one short question. "
		"Return exactly one most-important hint for this moment, based on the code above. "
		"The hint must be high-level and must not include exact code replacements or line-by-line edits. "
		"Do not provide a final complete solution."
	)


def _build_chat_prompt(message: str, question: str, student_code: str) -> str:
	parts: list[str] = []
	if message.strip():
		parts.append(f"Student Message:\n{message.strip()}")
	if question.strip():
		parts.append(f"Student Question:\n{question.strip()}")
	if student_code.strip():
		parts.append(
			"Student Code (read all lines before hinting):\n"
			f"{_number_code_lines(student_code)}"
		)

	if not parts:
		parts.append("Student Message:\nHi tutor, can you help me?")

	parts.append(
		"Reply naturally as a coding buddy. If the student asks a general coding question, answer that directly and do not force the conversation back to PA exercises. Keep it short and give only one small next hint if needed."
	)
	return "\n\n".join(parts)


def _direct_answer_risk(text: str) -> tuple[bool, str]:
	lowered = text.lower()

	if "```" in text and len(text) > 350:
		return True, "Contains a long code block that may be a full solution"

	risk_patterns = [
		r"here('s| is) the (full|complete) (solution|answer)",
		r"final answer",
		r"copy and paste",
		r"use this exact code",
	]
	for pattern in risk_patterns:
		if re.search(pattern, lowered):
			return True, "Uses phrases that suggest direct-answer behavior"

	return False, "No obvious direct-answer pattern detected"


def _too_specific_hint(text: str) -> bool:
	lowered = text.lower()
	patterns = [
		r"change\s+.+\s+to\s+.+",
		r"replace\s+.+\s+with\s+.+",
		r"instead of",
		r"use this code",
		r"\bline\s+\d+\b",
		r"`[^`]+`",
	]
	return any(re.search(pattern, lowered) for pattern in patterns)


def _safe_hint_fallback() -> str:
	return (
		"You are close. Check one variable that should keep its value between loop runs. "
		"Print that value each time and see where it resets."
	)


def _too_complex_for_student(text: str) -> bool:
	words = re.findall(r"[A-Za-z']+", text)
	if not words:
		return True

	long_word_ratio = sum(1 for word in words if len(word) >= 10) / len(words)
	jargon_tokens = {
		"invariant",
		"idempotent",
		"asymptotic",
		"polymorphism",
		"memoization",
		"recursion",
		"instantiate",
		"abstraction",
		"synchronization",
	}
	jargon_count = sum(1 for word in words if word.lower() in jargon_tokens)

	return len(words) > 90 or long_word_ratio > 0.30 or jargon_count >= 2


def _enforce_easy_hint(text: str) -> str:
	cleaned = " ".join(text.strip().split())
	if not cleaned:
		return _safe_hint_fallback()

	sentences = re.split(r"(?<=[.!?])\s+", cleaned)
	trimmed = " ".join(sentence for sentence in sentences[:4] if sentence)
	if not trimmed.endswith("?") and "?" not in trimmed:
		trimmed = f"{trimmed} What is the first variable you would inspect?"

	if _too_specific_hint(trimmed) or _too_complex_for_student(trimmed):
		return _safe_hint_fallback()

	return trimmed


def _enforce_easy_chat_reply(text: str) -> str:
	cleaned = " ".join(text.strip().split())
	if not cleaned:
		return _safe_hint_fallback()

	sentences = re.split(r"(?<=[.!?])\s+", cleaned)
	trimmed = " ".join(sentence for sentence in sentences[:3] if sentence)
	if _too_complex_for_student(trimmed):
		return _safe_hint_fallback()
	return trimmed


def _build_chat_prompt_with_progress(session_id: str, message: str, question: str, student_code: str) -> str:
	with state.BANK_LOCK:
		_ensure_session_progress(session_id)
		progress = state.PROGRESS_BY_SESSION.get(session_id)

	context_parts: list[str] = []
	if progress and progress.items:
		solved = sum(1 for it in progress.items if it.solved)
		total = len(progress.items)
		pa_numbers = sorted(
			{
				int(m.group(1))
				for it in progress.items
				for m in [re.fullmatch(r"(?i)E\s*(\d+)\s*[-.]\s*(\d+)", it.item_id)]
				if m
			}
		)
		pa_label = ", ".join([f"PA{n}" for n in pa_numbers]) if pa_numbers else "assignments"
		context_parts.append(f"Loaded assignments: {pa_label} ({solved}/{total} solved).")

		msg = " ".join([message.strip(), question.strip()]).lower()
		cur = _current_item(progress)
		# If the student asks for help without naming the PA/exercise (e.g., "I'm stuck"),
		# still attach the current exercise context so the model doesn't guess.
		is_assignment_related = bool(
			re.search(r"\b(pa|assignment|exercise|question|next|solve|solved|done|e\d+[-.]\d+)\b", msg)
			or (cur and re.search(r"\b(stuck|help|confused|not\s+working|doesn't\s+work|error|exception|fails|wrong)\b", msg))
		)
		if is_assignment_related and cur:
			prompt = _bank_prompt(cur.item_id) or ""
			if prompt.strip():
				context_parts.append(f"Current question ({cur.item_id}):\n{prompt.strip()}")
			else:
				context_parts.append(f"Current question: {cur.item_id} - {cur.title}")

	base = _build_chat_prompt(message, question, student_code)
	if not context_parts:
		return base
	return "\n\n".join(context_parts + [base])
