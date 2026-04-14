export interface AuthUser {
  email: string;
  session_id: string;
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

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

async function postAuth(path: string, payload: { email: string; password: string }): Promise<AuthResponse> {
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return (await response.json()) as AuthResponse;
}

export async function signup(email: string, password: string): Promise<AuthResponse> {
  return postAuth('/auth/signup', { email, password });
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return postAuth('/auth/login', { email, password });
}

export async function me(token: string): Promise<AuthResponse> {
  const response = await fetch(apiUrl('/auth/me'), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return (await response.json()) as AuthResponse;
}
