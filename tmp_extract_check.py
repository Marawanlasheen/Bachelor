from pathlib import Path
import json

from app.pdf_parser import extract_pdf_text, split_questions_from_text

pdf_path = r"C:\Users\user\Downloads\GUC_19_59_30982_2023-03-31T22_34_46.pdf"
text = extract_pdf_text(Path(pdf_path).read_bytes())
questions = split_questions_from_text(text)
joined = "\n".join(q.get("prompt", "") for q in questions)

checks = {
    "contains_public_static_void_main": "public static void main" in joined.lower(),
    "contains_double_result": "double result = 1.0" in joined.lower(),
    "contains_solution_keyword": "solution:" in joined.lower(),
    "contains_input_keyword": "input:" in joined.lower(),
    "contains_output_keyword": "output:" in joined.lower(),
    "contains_arrow_examples": "->" in joined or "–>" in joined or "—>" in joined,
}

summary = {
    "question_count": len(questions),
    "checks": checks,
    "first_ids": [q.get("id") for q in questions[:13]],
}

print(json.dumps(summary, ensure_ascii=False, indent=2))
Path("extraction_preview.json").write_text(json.dumps(questions, ensure_ascii=False, indent=2), encoding="utf-8")
print("saved extraction_preview.json")
