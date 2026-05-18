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
  error_category?: 'syntax' | 'runtime' | 'logical' | string | null;
  highlighted_lines?: number[];
  diagnostic_summary?: string | null;
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

export interface CoursePublic {
  id: string;
  title: string;
  description: string;
  owner_user_id: number;
  created_at: number;
  updated_at: number;
}

export interface CourseItemPublic {
  item_id: string;
  title: string;
  prompt: string;
}

export interface CoursePdfPublic {
  id: string;
  filename: string;
  title: string;
  questions: UploadedQuestion[];
  created_at: number;
  updated_at: number;
}

export interface UploadedQuestion {
  id: string;
  title: string;
  prompt: string;
  preview?: string;
}

export interface UploadedAssignment {
  id: string;
  title: string;
  questions: UploadedQuestion[];
  created_at?: number;
  updated_at?: number;
}

export interface StoredChatMessage {
  id: string;
  sender: 'user' | 'ai';
  message: string;
  timestamp: number;
}

export interface StoredChatConversation {
  id: string;
  title: string;
  messages: StoredChatMessage[];
  updated_at: number;
}

export interface JavaCompileResponse {
  compile_success: boolean;
  run_success: boolean;
  class_name: string;
  stdout: string;
  stderr: string;
  exit_code: number | null;
  error_category?: 'syntax' | 'runtime' | 'logical' | string | null;
  highlighted_lines?: number[];
  diagnostic_summary?: string | null;
}

async function parseJsonOrThrow(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `HTTP ${response.status}`);
  }
}

function normalizeApiError(message: string, fallback: string): string {
  const cleaned = (message || '').trim();
  if (!cleaned) return fallback;
  if (/authentication required|invalid or expired token|user not found/i.test(cleaned)) {
    return 'Your session has expired. Please log in again.';
  }
  if (/only pdf files are supported/i.test(cleaned)) {
    return 'Please upload a PDF file. Other file types are not supported.';
  }
  if (/couldn\'t read text|no questions were detected/i.test(cleaned)) {
    return cleaned;
  }
  return cleaned;
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
  courseId?: string | null;
  message?: string;
  question?: string;
  studentCode?: string;
  chatMode?: 'main' | 'mini';
  temperature?: number;
}): Promise<TutorChatResponse> {
  const payload: Record<string, unknown> = {
    session_id: params.sessionId,
    message: params.message ?? '',
    question: params.question ?? '',
    student_code: params.studentCode ?? '',
    chat_mode: params.chatMode ?? 'main',
    temperature: params.temperature ?? 0.2,
  };
  if (params.courseId) {
    payload.course_id = params.courseId;
  }

  const response = await fetch(apiUrl('/chat'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not send your message. Please try again.'));
  }

  return (await response.json()) as TutorChatResponse;
}

export async function getTrackerStatus(params: { sessionId: string; courseId: string }): Promise<{ progress: TutorProgressSummary }> {
  const response = await fetch(
    apiUrl(`/tracker/status?course_id=${encodeURIComponent(params.courseId)}`),
    {
      headers: { ...authHeader() },
    },
  );
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not load your progress right now.'));
  }
  return (await response.json()) as { progress: TutorProgressSummary };
}

export async function setCurrentItem(params: { sessionId: string; courseId: string; itemId: string }): Promise<{ progress: TutorProgressSummary }>{
  const response = await fetch(apiUrl('/tracker/current'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ session_id: params.sessionId, course_id: params.courseId, item_id: params.itemId }),
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not switch questions right now.'));
  }
  return (await response.json()) as { progress: TutorProgressSummary };
}

export async function listCourses(): Promise<CoursePublic[]> {
  const response = await fetch(apiUrl('/courses'), {
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not load courses.'));
  }
  return (await response.json()) as CoursePublic[];
}

export async function createCourse(params: { title: string; description: string }): Promise<CoursePublic> {
  const response = await fetch(apiUrl('/courses'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ title: params.title, description: params.description }),
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not create this course.'));
  }
  return (await response.json()) as CoursePublic;
}

export async function deleteCourse(courseId: string): Promise<void> {
  const response = await fetch(apiUrl(`/courses/${encodeURIComponent(courseId)}`), {
    method: 'DELETE',
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not delete this course.'));
  }
}

export async function listCourseItems(courseId: string): Promise<CourseItemPublic[]> {
  const response = await fetch(apiUrl(`/courses/${encodeURIComponent(courseId)}/items`), {
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not load course items.'));
  }
  return (await response.json()) as CourseItemPublic[];
}

export async function updateCourseItem(params: { courseId: string; itemId: string; title: string; prompt: string }): Promise<void> {
  const response = await fetch(apiUrl(`/courses/${encodeURIComponent(params.courseId)}/items/${encodeURIComponent(params.itemId)}`), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ title: params.title, prompt: params.prompt }),
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not update this assignment.'));
  }
}

export async function addCourseItem(params: { courseId: string; pdfId: string; title: string; prompt: string }): Promise<UploadedQuestion> {
  const response = await fetch(apiUrl(`/courses/${encodeURIComponent(params.courseId)}/pdfs/${encodeURIComponent(params.pdfId)}/items`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({ title: params.title, prompt: params.prompt }),
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not add this question.'));
  }
  return (await response.json()) as UploadedQuestion;
}

export async function deleteCourseItem(params: { courseId: string; itemId: string }): Promise<void> {
  const response = await fetch(apiUrl(`/courses/${encodeURIComponent(params.courseId)}/items/${encodeURIComponent(params.itemId)}`), {
    method: 'DELETE',
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not delete this question.'));
  }
}

export async function listCoursePdfs(courseId: string): Promise<CoursePdfPublic[]> {
  const response = await fetch(apiUrl(`/courses/${encodeURIComponent(courseId)}/pdfs`), {
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not load course PDFs.'));
  }
  return (await response.json()) as CoursePdfPublic[];
}

export async function uploadCoursePdf(params: { courseId: string; assignmentName: string; file: File }): Promise<CoursePdfPublic> {
  const formData = new FormData();
  formData.append('assignment_name', params.assignmentName);
  formData.append('pdf_file', params.file);
  const response = await fetch(apiUrl(`/courses/${encodeURIComponent(params.courseId)}/upload-pdf`), {
    method: 'POST',
    headers: { ...authHeader() },
    body: formData,
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'We could not upload this course PDF.'));
  }
  return (await response.json()) as CoursePdfPublic;
}

export async function deleteCoursePdf(params: { courseId: string; pdfId: string }): Promise<void> {
  const response = await fetch(apiUrl(`/courses/${encodeURIComponent(params.courseId)}/pdfs/${encodeURIComponent(params.pdfId)}`), {
    method: 'DELETE',
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not delete this course PDF.'));
  }
}

export async function listUploadedAssignments(): Promise<UploadedAssignment[]> {
  const response = await fetch(apiUrl('/assignments/uploaded'), {
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not load uploaded assignments.'));
  }
  return (await response.json()) as UploadedAssignment[];
}

export async function uploadAssignmentPdf(params: {
  assignmentName: string;
  file: File;
}): Promise<UploadedAssignment> {
  const formData = new FormData();
  formData.append('assignment_name', params.assignmentName);
  formData.append('pdf_file', params.file);

  const response = await fetch(apiUrl('/assignments/upload-pdf'), {
    method: 'POST',
    headers: { ...authHeader() },
    body: formData,
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'We could not upload your PDF. Please try again.'));
  }

  return (await response.json()) as UploadedAssignment;
}

export async function deleteUploadedAssignment(assignmentId: string): Promise<void> {
  const response = await fetch(apiUrl(`/assignments/uploaded/${encodeURIComponent(assignmentId)}`), {
    method: 'DELETE',
    headers: { ...authHeader() },
  });

  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not delete this uploaded PDF.'));
  }
}

export async function listChatConversationsRemote(): Promise<StoredChatConversation[]> {
  const response = await fetch(apiUrl('/chat/conversations'), {
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not load your recent chats.'));
  }
  return (await response.json()) as StoredChatConversation[];
}

export async function saveChatConversationRemote(params: {
  conversationId: string;
  title: string;
  messages: StoredChatMessage[];
  updatedAt: number;
}): Promise<void> {
  const response = await fetch(apiUrl('/chat/conversations'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeader() },
    body: JSON.stringify({
      conversation_id: params.conversationId,
      title: params.title,
      messages: params.messages,
      updated_at: params.updatedAt,
    }),
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not save this chat right now.'));
  }
}

export async function deleteChatConversationRemote(conversationId: string): Promise<void> {
  const response = await fetch(apiUrl(`/chat/conversations/${encodeURIComponent(conversationId)}`), {
    method: 'DELETE',
    headers: { ...authHeader() },
  });
  if (!response.ok) {
    const detail = await parseJsonOrThrow(response).catch(() => null);
    const msg = typeof detail?.detail === 'string' ? detail.detail : `HTTP ${response.status}`;
    throw new Error(normalizeApiError(msg, 'Could not delete this chat right now.'));
  }
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
    throw new Error(normalizeApiError(msg, 'Could not run Java compile at the moment.'));
  }

  return (await response.json()) as JavaCompileResponse;
}
