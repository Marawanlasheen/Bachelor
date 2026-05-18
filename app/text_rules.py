import re

from .bank import _bank_prompt, _current_item, _ensure_session_progress
from . import state


MAX_QUESTION_CHARS = 900
MAX_CODE_LINES = 80
MAX_CODE_LINE_CHARS = 180


def _clip_text(text: str, max_chars: int) -> str:
	clean = text.strip()
	if len(clean) <= max_chars:
		return clean
	return clean[:max_chars] + "\n...[truncated]"


def _number_code_lines(student_code: str) -> str:
	lines = student_code.strip("\n").splitlines()
	if not lines:
		return "(no code provided)"

	total = len(lines)
	if total <= MAX_CODE_LINES:
		selected = list(enumerate(lines, start=1))
		omitted_msg = ""
	else:
		head_count = MAX_CODE_LINES // 2
		tail_count = MAX_CODE_LINES - head_count
		head = list(enumerate(lines[:head_count], start=1))
		tail_start = total - tail_count + 1
		tail = list(enumerate(lines[-tail_count:], start=tail_start))
		selected = head + tail
		omitted = total - MAX_CODE_LINES
		omitted_msg = f"\n  ... ({omitted} middle lines omitted for brevity)"

	formatted = "\n".join(
		f"{line_no:>3}: {line[:MAX_CODE_LINE_CHARS]}"
		for line_no, line in selected
	)
	return formatted + omitted_msg


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


def _looks_like_explanation_request(text: str) -> bool:
	lower = text.lower()
	return bool(
		re.search(r"\b(explain|why|how\s+does|how\s+to|what\s+is|difference\s+between|concept)\b", lower)
	)


def _build_chat_prompt(message: str, question: str, student_code: str, chat_mode: str = "main") -> str:
	parts: list[str] = []
	if message.strip():
		parts.append(f"Student Message:\n{message.strip()}")
	if question.strip():
		parts.append(f"Student Question:\n{_clip_text(question, MAX_QUESTION_CHARS)}")
	if student_code.strip():
		parts.append(
			"Student Code (read all lines before hinting):\n"
			f"{_number_code_lines(student_code)}"
		)

	if not parts:
		parts.append("Student Message:\nHi tutor, can you help me?")

	combined = " ".join([message.strip(), question.strip()]).strip()
	if chat_mode == "mini":
		parts.append(
			"Mini chat mode: provide hint-only guidance. Give one small next hint and one short follow-up question. "
			"Do not provide full solutions or full rewrites."
		)
	else:
		if _looks_like_explanation_request(combined):
			parts.append(
				"Main chat mode: the student asked for explanation. Give a clear, direct explanation first. "
				"Then add one practical hint. Do not force code fixes unless requested."
			)
		else:
			parts.append(
				"Main chat mode: answer the student's intent directly. "
				"If conceptual, explain. If debugging is requested, guide step-by-step. "
				"Only rewrite code when the student explicitly asks for a fix."
			)
	return "\n\n".join(parts)


def _infer_programming_language(*chunks: str) -> str:
	combined = "\n".join(chunks).lower()
	if re.search(r"\bjava\b|public\s+class\s+|system\.out\.println|public\s+static\s+void\s+main", combined):
		return "Java"
	if re.search(r"\bpython\b|def\s+\w+\(|print\(|if\s+__name__\s*==\s*['\"]__main__['\"]", combined):
		return "Python"
	if re.search(r"\bjavascript\b|\btypescript\b|console\.log|function\s+\w+\(|=>", combined):
		return "JavaScript"
	return "Java"


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
		return ""

	sentences = re.split(r"(?<=[.!?])\s+", cleaned)
	trimmed = " ".join(sentence for sentence in sentences[:4] if sentence)
	if not trimmed.endswith("?") and "?" not in trimmed:
		trimmed = f"{trimmed} What is the first variable you would inspect?"

	return trimmed


def _enforce_easy_chat_reply(text: str) -> str:
	cleaned = " ".join(text.strip().split())
	if not cleaned:
		return ""

	sentences = re.split(r"(?<=[.!?])\s+", cleaned)
	trimmed = " ".join(sentence for sentence in sentences[:3] if sentence)
	return trimmed


def _build_chat_prompt_with_progress(session_id: str, message: str, question: str, student_code: str, chat_mode: str = "main") -> str:
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

	base = _build_chat_prompt(message, question, student_code, chat_mode)
	language = _infer_programming_language(message, question, student_code, "\n\n".join(context_parts))
	language_rule = (
		f"Course language rule: respond in {language} only. "
		f"All code examples, syntax references, and terminology must be {language}. "
		"If the student asks for another language, briefly explain and continue in the course language."
	)
	if not context_parts:
		return "\n\n".join([language_rule, base])
	return "\n\n".join(context_parts + [language_rule, base])
