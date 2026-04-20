from pathlib import Path
import json

from app.pdf_parser import extract_pdf_text, split_questions_from_text

pdf_path = r"C:\Users\user\Downloads\GUC_19_59_30982_2023-03-31T22_34_46.pdf"
text = extract_pdf_text(Path(pdf_path).read_bytes())
questions = split_questions_from_text(text)

by_id = {q.get("id"): q for q in questions}
q52 = by_id.get("E5-2", {})
q53 = by_id.get("E5-3", {})

p52 = q52.get("prompt", "")
p53 = q53.get("prompt", "")

checks = {
    "question_count": len(questions),
    "separate_exercises": all(str(q.get("id","")).startswith("E5-") for q in questions),
    "E5_2_exists": bool(q52),
    "E5_2_has_bullets": ("•" in p52) or ("- " in p52) or ("* " in p52),
    "E5_2_has_skeleton_code": ("public" in p52.lower()) or ("{" in p52) or ("max(" in p52.lower()),
    "E5_2_no_solution": "solution:" not in p52.lower(),
    "E5_3_exists": bool(q53),
    "E5_3_has_input_output": ("input:" in p53.lower()) and ("output:" in p53.lower()),
    "E5_3_no_solution_class": not ("solution" in p53.lower() and "class" in p53.lower()),
    "no_trailing_solution_any": not any("solution:" in q.get("prompt", "").lower() for q in questions),
    "preview_max_120": all(len((q.get("preview") or "")) <= 120 for q in questions),
}

summary = {
    "checks": checks,
    "e5_2_title": q52.get("title"),
    "e5_2_preview": q52.get("preview"),
    "e5_3_title": q53.get("title"),
    "e5_3_preview": q53.get("preview"),
}

print(json.dumps(summary, ensure_ascii=False, indent=2))
Path("extraction_preview.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
print("saved extraction_preview.json")
