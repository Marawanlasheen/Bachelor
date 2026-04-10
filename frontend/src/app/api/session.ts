const SESSION_KEY = 'tutor_session_id';

function fallbackSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateSessionId(): string {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing && existing.trim()) return existing;

  const created = (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? (globalThis.crypto.randomUUID() as string)
    : fallbackSessionId();

  localStorage.setItem(SESSION_KEY, created);
  return created;
}
