import { getAuthToken } from './session';

const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? '';

function apiUrl(path: string): string {
  return API_BASE ? `${API_BASE}${path}` : path;
}

export interface TutorModelResult {
  provider: string;
  model: string;
  response: string;
  latency_ms: number;
  direct_answer_risk: boolean;
  direct_answer_reason: string;
  error?: string | null;
}

export interface TutorProgressSummary {
  solved: number;
  total: number;
  remaining: number;
  solved_ids: string[];
  current_item_id: string | null;
}

export interface TutorChatResponse {
  policy: string;
  session_id: string;
  result: TutorModelResult;
  progress?: TutorProgressSummary | null;
}

export interface BankItemPublic {
  item_id: string;
  title: string;
  prompt: string;
}

export interface JavaCompileResponse {
  compile_success: boolean;
  run_success: boolean;
  class_name: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
}

async function parseJsonOrThrow(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
}

function authHeader(): Record<string, string> {
  const token = getAuthToken();
  if (!token) {
    throw new Error('Please login first');
  }
  return { Authorization: `Bearer ${token}` };
}

export async function chat(params: {
  sessionId: string;
  message?: string;
  question?: string;
  studentCode?: string;
  temperature?: number;
}): Promise<TutorChatResponse> {
  const payload = {
    session_id: params.sessionId,
    message: params.message ?? '',
    question: params.question ?? '',
    student_code: params.studentCode ?? '',
    temperature: params.temperature ?? 0.2,
  };

  const response = await fetch(apiUrl('/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return (await response.json()) as TutorChatResponse;
}

export async function getTrackerStatus(sessionId: string): Promise<{ progress: TutorProgressSummary }> {
  const response = await fetch(apiUrl(`/tracker/status?session_id=${encodeURIComponent(sessionId)}`), {
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return (await response.json()) as { progress: TutorProgressSummary };
}

export async function setCurrentItem(params: { sessionId: string; itemId: string }): Promise<{ progress: TutorProgressSummary }>{
  const response = await fetch(apiUrl('/tracker/current'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ session_id: params.sessionId, item_id: params.itemId }),
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(msg);
  }
  return (await response.json()) as { progress: TutorProgressSummary };
}

export async function listBankItems(): Promise<BankItemPublic[]> {
  const response = await fetch(apiUrl('/bank/items'));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return (await response.json()) as BankItemPublic[];
}

export async function compileJava(params: {
  code: string;
  timeoutSec?: number;
}): Promise<JavaCompileResponse> {
  const response = await fetch(apiUrl('/compile/java'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: params.code,
      timeout_sec: params.timeoutSec ?? 4,
    }),
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(msg);
  }

  return (await response.json()) as JavaCompileResponse;
}
