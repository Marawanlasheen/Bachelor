import re
import subprocess
import tempfile
from pathlib import Path

DEFAULT_TIMEOUT_SEC = 4.0
MAX_OUTPUT_CHARS = 12000


def _truncate(text: str) -> str:
    if len(text) <= MAX_OUTPUT_CHARS:
        return text
    return text[:MAX_OUTPUT_CHARS] + "\n...[output truncated]"


def _detect_class_name(code: str) -> str:
    public_match = re.search(r"\bpublic\s+class\s+([A-Za-z_]\w*)", code)
    if public_match:
        return public_match.group(1)

    class_match = re.search(r"\bclass\s+([A-Za-z_]\w*)", code)
    if class_match:
        return class_match.group(1)

    return "Main"


def compile_and_run_java(code: str, timeout_sec: float = DEFAULT_TIMEOUT_SEC) -> dict[str, object]:
    class_name = _detect_class_name(code)
    timeout = max(1.0, min(timeout_sec, 10.0))

    with tempfile.TemporaryDirectory(prefix="java-compile-") as temp_dir:
        work_dir = Path(temp_dir)
        source_file = work_dir / f"{class_name}.java"
        source_file.write_text(code, encoding="utf-8")

        try:
            compile_proc = subprocess.run(
                ["javac", str(source_file.name)],
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=timeout,
                shell=False,
            )
        except FileNotFoundError:
            return {
                "compile_success": False,
                "run_success": False,
                "class_name": class_name,
                "stdout": "",
                "stderr": "javac command was not found. Please install a JDK and ensure javac is in PATH.",
                "exit_code": None,
            }
        except subprocess.TimeoutExpired:
            return {
                "compile_success": False,
                "run_success": False,
                "class_name": class_name,
                "stdout": "",
                "stderr": f"Compilation timed out after {timeout:.1f} seconds.",
                "exit_code": None,
            }

        compile_stdout = _truncate(compile_proc.stdout or "")
        compile_stderr = _truncate(compile_proc.stderr or "")

        if compile_proc.returncode != 0:
            return {
                "compile_success": False,
                "run_success": False,
                "class_name": class_name,
                "stdout": compile_stdout,
                "stderr": compile_stderr,
                "exit_code": compile_proc.returncode,
            }

        try:
            run_proc = subprocess.run(
                ["java", "-cp", str(work_dir), class_name],
                cwd=work_dir,
                capture_output=True,
                text=True,
                timeout=timeout,
                shell=False,
            )
        except FileNotFoundError:
            return {
                "compile_success": True,
                "run_success": False,
                "class_name": class_name,
                "stdout": compile_stdout,
                "stderr": "java command was not found. Please install a JDK and ensure java is in PATH.",
                "exit_code": None,
            }
        except subprocess.TimeoutExpired:
            return {
                "compile_success": True,
                "run_success": False,
                "class_name": class_name,
                "stdout": compile_stdout,
                "stderr": f"Program execution timed out after {timeout:.1f} seconds.",
                "exit_code": None,
            }

        run_stdout = _truncate(run_proc.stdout or "")
        run_stderr = _truncate(run_proc.stderr or "")

        combined_stdout = "\n".join([part for part in [compile_stdout, run_stdout] if part]).strip()
        combined_stderr = "\n".join([part for part in [compile_stderr, run_stderr] if part]).strip()

        return {
            "compile_success": True,
            "run_success": run_proc.returncode == 0,
            "class_name": class_name,
            "stdout": combined_stdout,
            "stderr": combined_stderr,
            "exit_code": run_proc.returncode,
        }
