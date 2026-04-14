const AUTH_TOKEN_KEY = 'tutor_auth_token';
const AUTH_SESSION_KEY = 'tutor_session_id';
const AUTH_EMAIL_KEY = 'tutor_email';

export interface StoredAuth {
  token: string;
  sessionId: string;
  email: string;
}

export function getStoredAuth(): StoredAuth | null {
  const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? '';
  const sessionId = localStorage.getItem(AUTH_SESSION_KEY) ?? '';
  const email = localStorage.getItem(AUTH_EMAIL_KEY) ?? '';
  if (!token || !sessionId || !email) return null;
  return { token, sessionId, email };
}

export function saveStoredAuth(auth: StoredAuth): void {
  localStorage.setItem(AUTH_TOKEN_KEY, auth.token);
  localStorage.setItem(AUTH_SESSION_KEY, auth.sessionId);
  localStorage.setItem(AUTH_EMAIL_KEY, auth.email);
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(AUTH_EMAIL_KEY);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}
