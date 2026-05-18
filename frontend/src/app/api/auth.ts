export interface AuthUser {
  id: number;
  username: string;
  email: string;
  session_id: string;
  role: 'student' | 'ta';
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';
const AUTH_REQUEST_TIMEOUT_MS = 15000;

function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
  progress?: {
    solved: number;
    total: number;
    remaining: number;
    solved_ids: string[];
    current_item_id: string | null;
  } | null;
}

async function parseJsonOrThrow(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
}

function normalizeAuthError(message: string): string {
  const normalized = (message || '').trim();
  if (!normalized) return 'Something went wrong. Please try again.';
  if (/already exists|already registered|already taken/i.test(normalized)) return normalized;
  if (/invalid email or password/i.test(normalized)) return 'Your email or password is incorrect. Please try again.';
  if (/http\s*401/i.test(normalized)) return 'Your login details were not accepted. Please check and try again.';
  if (/timed out/i.test(normalized)) return 'Request timed out. Please check your connection and try again.';
  return normalized;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), AUTH_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('Request timed out');
    }
    throw error;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function postAuth(path: string, payload: { username?: string; email: string; password: string }): Promise<AuthResponse> {
  const response = await fetchWithTimeout(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeAuthError(msg));
  }

  return (await response.json()) as AuthResponse;
}

export async function signupStudent(username: string, email: string, password: string): Promise<AuthResponse> {
  return postAuth('/auth/student/signup', { username, email, password });
}

export async function loginStudent(email: string, password: string): Promise<AuthResponse> {
  return postAuth('/auth/student/login', { email, password });
}

export async function signupTA(username: string, email: string, password: string): Promise<AuthResponse> {
  return postAuth('/auth/ta/signup', { username, email, password });
}

export async function loginTA(email: string, password: string): Promise<AuthResponse> {
  return postAuth('/auth/ta/login', { email, password });
}

export async function me(token: string): Promise<AuthResponse> {
  const response = await fetchWithTimeout(apiUrl('/auth/me'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeAuthError(msg));
  }

  return (await response.json()) as AuthResponse;
}

export async function changePassword(params: { currentPassword: string; newPassword: string }): Promise<{ detail: string }> {
  const token = localStorage.getItem('tutor_auth_token');
  if (!token) throw new Error('Please log in again before updating your password.');

  const response = await fetchWithTimeout(apiUrl('/auth/change-password'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      current_password: params.currentPassword,
      new_password: params.newPassword,
    }),
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : 'Could not update password.';
    throw new Error(normalizeAuthError(msg));
  }

  return (await response.json()) as { detail: string };
}

export async function updateUsername(username: string): Promise<AuthResponse> {
  const token = localStorage.getItem('tutor_auth_token');
  if (!token) throw new Error('Please log in again before updating your profile.');

  const response = await fetchWithTimeout(apiUrl('/auth/profile'), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ username }),
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : 'Could not update username.';
    throw new Error(normalizeAuthError(msg));
  }

  return (await response.json()) as AuthResponse;
}
