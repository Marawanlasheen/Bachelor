from fastapi.responses import HTMLResponse


def home() -> HTMLResponse:
	return HTMLResponse(
		"""
<!doctype html>
<html>
  <head>
	<meta charset="utf-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>Hint-First Groq Tutor</title>
	<style>
	  body { font-family: Arial, sans-serif; max-width: 980px; margin: 20px auto; padding: 0 16px; }
	  textarea, input { width: 100%; margin: 8px 0 16px; padding: 10px; box-sizing: border-box; }
	  button { padding: 10px 14px; cursor: pointer; margin-right: 8px; }
	  .chatbox { border: 1px solid #ddd; border-radius: 8px; padding: 12px; min-height: 220px; max-height: 320px; overflow-y: auto; margin-bottom: 14px; background: #fafafa; }
	  .msg { margin: 10px 0; padding: 10px; border-radius: 8px; white-space: pre-wrap; }
	  .user { background: #e9f2ff; }
	  .assistant { background: #f1f8e9; }
	  .meta { font-size: 13px; color: #444; margin-bottom: 8px; }
	  .grid { display: grid; grid-template-columns: 1fr; gap: 10px; }
	</style>
  </head>
  <body>
	<h2>Conversational Coding Tutor</h2>
	<p>Chat naturally with the tutor. You can send text, question, and code in each turn.</p>

	<h3>Conversation</h3>
	<h3>Progress</h3>
	<div id="progress" class="meta"></div>
	<div id="chatbox" class="chatbox"></div>
	<div id="groq_meta" class="meta"></div>

	<div class="grid">
	  <div>
		<label>Message (normal chat text)</label>
		<textarea id="message" rows="3" placeholder="Ask anything, like: I am stuck, what should I check first?"></textarea>
	  </div>
	  <div>
		<label>Student Code (optional)</label>
		<textarea id="student_code" rows="10" placeholder="Paste student code if needed"></textarea>
	  </div>
	</div>

	<button onclick="sendChat()">Send</button>
	<p id="status"></p>

	<script>
	  let clientSessionId = 'session-' + Math.random().toString(36).slice(2, 10);

	  function randomSessionId() {
		return 'session-' + Math.random().toString(36).slice(2, 10);
	  }

	  function appendMessage(role, text) {
		const box = document.getElementById('chatbox');
		const el = document.createElement('div');
		el.className = 'msg ' + role;
		el.textContent = (role === 'user' ? 'Student: ' : 'Tutor: ') + text;
		box.appendChild(el);
		box.scrollTop = box.scrollHeight;
	  }

	  function newSession() {
		clientSessionId = randomSessionId();
		document.getElementById('chatbox').innerHTML = '';
		document.getElementById('groq_meta').textContent = '';
		document.getElementById('status').textContent = 'Started a new session.';
	  }

	  async function resetSession() {
		const res = await fetch('/chat/reset', {
		  method: 'POST',
		  headers: { 'Content-Type': 'application/json' },
		  body: JSON.stringify({ session_id: clientSessionId })
		});

		if (!res.ok) {
		  document.getElementById('status').textContent = 'Reset failed.';
		  return;
		}

		document.getElementById('chatbox').innerHTML = '';
		document.getElementById('status').textContent = 'Session memory cleared.';
		refreshProgress();
	  }

	  async function sendChat() {
		const status = document.getElementById('status');
		status.textContent = 'Tutor is thinking...';

		const message = document.getElementById('message').value;
		const studentCode = document.getElementById('student_code').value;

		if (!message.trim() && !studentCode.trim()) {
		  status.textContent = 'Write a message or code first.';
		  return;
		}

		appendMessage('user', [message, studentCode].filter(Boolean).join('\\n\\n'));

		const payload = {
		  session_id: clientSessionId,
		  message,
		  student_code: studentCode,
		  temperature: 0.2
		};

		const res = await fetch('/chat', {
		  method: 'POST',
		  headers: { 'Content-Type': 'application/json' },
		  body: JSON.stringify(payload)
		});

		if (!res.ok) {
		  const errText = await res.text();
		  status.textContent = 'Request failed: ' + errText;
		  return;
		}

		const data = await res.json();
		const g = data.result || {};
		const prog = data.progress || null;

		document.getElementById('groq_meta').textContent =
		  `${g.model || ''} | ${g.latency_ms || 0} ms | risk=${g.direct_answer_risk} ${g.error ? '| error=' + g.error : ''}`;

		appendMessage('assistant', g.response || '');
		document.getElementById('message').value = '';
		if (prog) {
			renderProgress(prog);
		} else {
			refreshProgress();
		}

		status.textContent = '';
	  }

	  function renderProgress(prog) {
		const el = document.getElementById('progress');
		if (!prog) { el.textContent = ''; return; }
		const solved = prog.solved ?? 0;
		const total = prog.total ?? 0;
		const remaining = prog.remaining ?? 0;
		const solvedIds = prog.solved_ids ?? [];
		el.textContent = `Solved ${solved}/${total}. Remaining ${remaining}.` + (solvedIds.length ? ` Solved: ${solvedIds.join(', ')}` : '');
	  }

	  async function refreshProgress() {
		try {
			const res = await fetch(`/tracker/status?session_id=${encodeURIComponent(clientSessionId)}`);
			if (!res.ok) return;
			const data = await res.json();
			renderProgress(data.progress || null);
		} catch (e) {
			// ignore
		}
	  }

	  const msgBox = document.getElementById('message');
	  msgBox.addEventListener('keydown', function (event) {
		if (event.key === 'Enter' && !event.shiftKey) {
		  event.preventDefault();
		  sendChat();
		}
	  });

	  document.getElementById('status').textContent = '';
	  refreshProgress();
	</script>
  </body>
</html>
"""
	)
