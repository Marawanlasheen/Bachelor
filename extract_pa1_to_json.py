from __future__ import annotations

import json
import re
from pathlib import Path

from pypdf import PdfReader


def extract_text(pdf_path: Path) -> str:
	reader = PdfReader(str(pdf_path))
	pages_text: list[str] = []
	for page in reader.pages:
		try:
			pages_text.append(page.extract_text() or "")
		except Exception:
			pages_text.append("")
	text = "\n".join(pages_text)
	# Keep newlines but normalize trailing spaces
	lines = [ln.rstrip() for ln in text.splitlines()]
	return "\n".join(lines)


def split_exercises(normalized: str) -> list[str]:
	pattern = re.compile(
		r"(^\s*Exercise\s+\d+\s*[-.]\s*\d+\b.*$)",
		flags=re.IGNORECASE | re.MULTILINE,
	)
	starts = [m.start() for m in pattern.finditer(normalized)]
	if not starts:
		return [normalized.strip()] if normalized.strip() else []

	starts.append(len(normalized))
	sections: list[str] = []
	for a, b in zip(starts, starts[1:]):
		sec = normalized[a:b].strip()
		if sec:
			sections.append(sec)
	return sections


def parse_exercise_section(section: str) -> dict | None:
	header_match = re.search(
		r"^\s*Exercise\s+(\d+\s*[-.]\s*\d+)\s+(.*)$",
		section,
		flags=re.IGNORECASE | re.MULTILINE,
	)
	if not header_match:
		return None

	num = re.sub(r"\s+", "", header_match.group(1)).replace(".", "-")
	item_id = f"E{num}"
	title = header_match.group(2).strip()

	sec_lines = [ln.rstrip() for ln in section.splitlines()]
	prompt_lines: list[str] = []
	solution_lines: list[str] = []
	skipping = False

	part_re = re.compile(r"^\s*[a-z]\)\s+", re.IGNORECASE)
	sol_re = re.compile(r"^\s*Solution\s*:\s*$", re.IGNORECASE)

	for ln in sec_lines:
		if sol_re.match(ln.strip()):
			skipping = True
			solution_lines.append(ln)
			continue

		if skipping:
			if part_re.match(ln):
				skipping = False
				prompt_lines.append(ln)
			else:
				solution_lines.append(ln)
			continue

		prompt_lines.append(ln)

	prompt = "\n".join([ln for ln in prompt_lines if ln.strip()]).strip()
	solution_text = "\n".join([ln for ln in solution_lines if ln.strip()]).strip()

	return {
		"item_id": item_id,
		"title": title,
		"prompt": prompt,
		"solution_text": solution_text,
	}


def main() -> None:
	pdf_path = Path("pas/PA1.pdf")
	out_path = Path("pas_bank.local.json")

	if not pdf_path.exists():
		raise SystemExit(f"Missing {pdf_path}")

	normalized = extract_text(pdf_path)
	sections = split_exercises(normalized)
	problems = []
	for sec in sections:
		problem = parse_exercise_section(sec)
		if problem:
			problems.append(problem)

	out_path.write_text(json.dumps(problems, ensure_ascii=False, indent=2), encoding="utf-8")
	print(f"Wrote {out_path} with {len(problems)} problems")
	print("First IDs:", [p["item_id"] for p in problems[:5]])


if __name__ == "__main__":
	main()
