const AUTH_TOKEN_KEY = 'tutor_auth_token';
const AUTH_SESSION_KEY = 'tutor_session_id';
const AUTH_EMAIL_KEY = 'tutor_email';
const AUTH_USERNAME_KEY = 'tutor_username';
const AUTH_ROLE_KEY = 'tutor_role';
const AUTH_USER_ID_KEY = 'tutor_user_id';

export interface StoredAuth {
  token: string;
  userId: number;
  sessionId: string;
  username: string;
  email: string;
  role: 'student' | 'ta';
}

export function getStoredAuth(): StoredAuth | null {
  const token = localStorage.getItem(AUTH_TOKEN_KEY) ?? '';
  const sessionId = localStorage.getItem(AUTH_SESSION_KEY) ?? '';
  const email = localStorage.getItem(AUTH_EMAIL_KEY) ?? '';
  const usernameFromStorage = localStorage.getItem(AUTH_USERNAME_KEY) ?? '';
  const roleRaw = localStorage.getItem(AUTH_ROLE_KEY) ?? '';
  const usernameFallback = email.includes('@') ? email.split('@')[0] : '';
  const username = usernameFromStorage || usernameFallback;
  const role = roleRaw === 'ta' ? 'ta' : roleRaw === 'student' ? 'student' : null;
  const userId = Number(localStorage.getItem(AUTH_USER_ID_KEY) ?? '0');
  if (!token || !sessionId || !email || !username || !role) return null;
  return { token, userId, sessionId, username, email, role };
}

export function saveStoredAuth(auth: StoredAuth): void {
  localStorage.setItem(AUTH_TOKEN_KEY, auth.token);
  localStorage.setItem(AUTH_SESSION_KEY, auth.sessionId);
  localStorage.setItem(AUTH_USER_ID_KEY, String(auth.userId));
  localStorage.setItem(AUTH_USERNAME_KEY, auth.username);
  localStorage.setItem(AUTH_EMAIL_KEY, auth.email);
  localStorage.setItem(AUTH_ROLE_KEY, auth.role);
}

export function clearStoredAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_SESSION_KEY);
  localStorage.removeItem(AUTH_USER_ID_KEY);
  localStorage.removeItem(AUTH_USERNAME_KEY);
  localStorage.removeItem(AUTH_EMAIL_KEY);
  localStorage.removeItem(AUTH_ROLE_KEY);
}

export function getAuthToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}
