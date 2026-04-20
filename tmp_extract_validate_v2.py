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
all_prompts = "\n".join(q.get("prompt", "") for q in questions)

checks = {
    "exercise_count": len(questions),
    "has_E5_2": "E5-2" in by_id,
    "has_E5_3": "E5-3" in by_id,
    "E5_2_has_skeleton_code_signals": ("public" in p52.lower()) or ("{" in p52) or (";" in p52) or ("max(" in p52.lower()),
    "E5_2_has_solution_label": "solution:" in p52.lower(),
    "E5_3_has_input_or_output_example": ("input" in p53.lower()) or ("output" in p53.lower()),
    "E5_3_has_solution_class": ("solution" in p53.lower() and "class" in p53.lower()),
    "global_contains_public_static_void_main": "public static void main" in all_prompts.lower(),
    "global_contains_double_result": "double result = 1.0" in all_prompts.lower(),
}

sample = {
    "E5_2_title": q52.get("title"),
    "E5_2_preview": q52.get("preview"),
    "E5_2_prompt_head": p52[:500],
    "E5_3_title": q53.get("title"),
    "E5_3_preview": q53.get("preview"),
    "E5_3_prompt_head": p53[:500],
}

print(json.dumps(checks, ensure_ascii=False, indent=2))
print(json.dumps(sample, ensure_ascii=False, indent=2))
Path("extraction_preview.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
print("saved extraction_preview.json")
