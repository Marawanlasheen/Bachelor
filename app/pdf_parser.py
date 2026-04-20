import re
from io import BytesIO

from pypdf import PdfReader


_HEADING_RE = re.compile(
    r"(?im)^\s*("
    r"E\s*\d+\s*[-.]\s*\d+"
    r"|Exercise\s+\d+\s*[-.]\s*\d+"
    r"|Question\s*\d+"
    r"|Q\s*\d+"
    r"|\d+\s*[\).:-]\s+[A-Za-z]"
    r")\b"
)

_SOLUTION_CUTOFF_RE = re.compile(r"(?im)^\s*solution\s*:")
_INLINE_SOLUTION_RE = re.compile(r"(?i)\bsolution\s*:")
_ONLY_NOISE_RE = re.compile(r"^\s*[-_=~`•·.]{2,}\s*$")
_SPACED_WORD_RE = re.compile(r"\b(?:[A-Za-z]\s+){3,}[A-Za-z]\b")


def _compact_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _fix_spaced_words(text: str) -> str:
    def _join(match: re.Match[str]) -> str:
        return match.group(0).replace(" ", "")

    return _SPACED_WORD_RE.sub(_join, text)


def _normalize_heading_id(raw: str, fallback_idx: int) -> str:
    m = re.match(r"(?i)^\s*(?:exercise\s+|e\s*)(\d+)\s*[-.]\s*(\d+)\b", raw)
    if m:
        return f"E{m.group(1)}-{m.group(2)}"

    m = re.match(r"(?i)^\s*(?:question|q)\s*(\d+)\b", raw)
    if m:
        return f"Q{m.group(1)}"

    m = re.match(r"^\s*(\d+)\s*[\).:-]", raw)
    if m:
        return f"Q{m.group(1)}"

    return f"Q{fallback_idx}"


def _clean_prompt(block: str) -> str:
    lines = [ln.rstrip() for ln in _fix_spaced_words(block).splitlines()]
    cleaned: list[str] = []

    for line in lines:
        raw = line.strip()
        if not raw:
            if cleaned and cleaned[-1] != "":
                cleaned.append("")
            continue

        if _SOLUTION_CUTOFF_RE.match(raw):
            break

        inline_cut = _INLINE_SOLUTION_RE.search(raw)
        if inline_cut:
            raw = raw[: inline_cut.start()].strip()
            if not raw:
                break

        if _ONLY_NOISE_RE.match(raw):
            continue

        cleaned.append(_compact_whitespace(raw))

    while cleaned and cleaned[-1] == "":
        cleaned.pop()

    text = "\n".join(cleaned).strip()
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text


def _build_preview(prompt: str) -> str:
    flat = _compact_whitespace(prompt.replace("\n", " "))
    if not flat:
        return ""

    # Pick first meaningful sentence-like chunk.
    parts = re.split(r"(?<=[.!?])\s+", flat)
    for part in parts:
        p = part.strip()
        if len(p) >= 20:
            return p[:120]

    return flat[:120]


def _make_title(heading: str, prompt: str, idx: int) -> str:
    h = _compact_whitespace(heading)
    if h:
        return h

    first_line = prompt.splitlines()[0].strip() if prompt else ""
    if first_line:
        return first_line[:120]

    return f"Question {idx}"


def extract_pdf_text(pdf_bytes: bytes) -> str:
    reader = PdfReader(BytesIO(pdf_bytes))
    parts: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        if text.strip():
            parts.append(text)
    return "\n\n".join(parts).strip()


def split_questions_from_text(text: str) -> list[dict[str, str]]:
    if not text.strip():
        return []

    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    matches = list(_HEADING_RE.finditer(normalized))

    blocks: list[tuple[str, str]] = []
    if matches:
        for idx, match in enumerate(matches):
            start = match.start()
            end = matches[idx + 1].start() if idx + 1 < len(matches) else len(normalized)
            block = normalized[start:end].strip()
            if not block:
                continue
            heading = block.splitlines()[0].strip()
            blocks.append((heading, block))
    else:
        # Fallback: split by large paragraph breaks.
        for paragraph in [p.strip() for p in re.split(r"\n\s*\n+", normalized) if p.strip()]:
            lines = paragraph.splitlines()
            heading = lines[0].strip() if lines else ""
            blocks.append((heading, paragraph))

    questions: list[dict[str, str]] = []
    for idx, (heading, block) in enumerate(blocks, start=1):
        prompt = _clean_prompt(block)
        if not prompt:
            continue

        qid = _normalize_heading_id(heading, idx)
        title = _make_title(heading, prompt, idx)
        preview = _build_preview(prompt)
        questions.append({"id": qid, "title": title, "prompt": prompt, "preview": preview})

    deduped: list[dict[str, str]] = []
    seen_prompts: set[str] = set()
    for idx, q in enumerate(questions, start=1):
        prompt = q.get("prompt", "").strip()
        if not prompt:
            continue
        prompt_key = _compact_whitespace(prompt).lower()
        if prompt_key in seen_prompts:
            continue
        seen_prompts.add(prompt_key)

        title = q.get("title", "").strip() or f"Question {idx}"
        qid = q.get("id", "").strip() or f"Q{idx}"
        preview = _build_preview(prompt)
        deduped.append({"id": qid, "title": title, "prompt": prompt, "preview": preview})

    return deduped
