const AUTH_TOKEN_KEY = 'tutor_auth_token';
const AUTH_SESSION_KEY = 'tutor_session_id';
const AUTH_EMAIL_KEY = 'tutor_email';
const AUTH_USERNAME_KEY = 'tutor_username';

export interface StoredAuth {
  token: string;
  sessionId: string;
  username: string;
  email: string;
}

export function getStoredAuth(): StoredAuth | null {
  const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? '';
  const sessionId = localStorage.getItem(AUTH_SESSION_KEY) ?? '';
  const email = localStorage.getItem(AUTH_EMAIL_KEY) ?? '';
  const usernameFromStorage = localStorage.getItem(AUTH_USERNAME_KEY) ?? '';
  const usernameFallback = email.includes('@') ? email.split('@')[0] : '';
  const username = usernameFromStorage || usernameFallback;
  if (!token || !sessionId || !email || !username) return null;
  return { token, sessionId, username, email };
}

export function saveStoredAuth(auth: StoredAuth): void {
  localStorage.setItem(AUTH_TOKEN_KEY, auth.token);
  localStorage.setItem(AUTH_SESSION_KEY, auth.sessionId);
  localStorage.setItem(AUTH_USERNAME_KEY, auth.username);
  localStorage.setItem(AUTH_EMAIL_KEY, auth.email);
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(AUTH_USERNAME_KEY);
  localStorage.removeItem(AUTH_EMAIL_KEY);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}
