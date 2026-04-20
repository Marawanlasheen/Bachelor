import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { AssignmentsList } from './components/AssignmentsList';
import { AssignmentView } from './components/AssignmentView';
import { Assignment, ChatConversation, ChatMessage } from './types';
import { clearStoredAuth, getStoredAuth, saveStoredAuth, StoredAuth } from './api/session';
import { login, me, signup } from './api/auth';
import {
  chat,
  deleteChatConversationRemote,
  getTrackerStatus,
  listBankItems,
  listChatConversationsRemote,
  listUploadedAssignments,
  saveChatConversationRemote,
  setCurrentItem,
  uploadAssignmentPdf,
} from './api/tutorApi';

type View = 'chat' | 'assignments' | 'assignment-detail';

function shortDescription(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 137)}...`;
}

function computeProgressPercent(solved: number, total: number): number {
  if (!total) return 0;
  return Math.round((solved / total) * 100);
}

function parseItemId(itemId: string): { pa: number; q: number } | null {
  const m = itemId.trim().match(/^E\s*(\d+)\s*[-.]\s*(\d+)$/i);
  if (!m) return null;
  return { pa: Number(m[1]), q: Number(m[2]) };
}

function questionDraftsKey(sessionId: string): string {
  return `question_code_drafts_${sessionId}`;
}

function loadQuestionDrafts(sessionId: string): Record<string, string> {
  if (!sessionId) return {};
  try {
    const raw = localStorage.getItem(questionDraftsKey(sessionId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveQuestionDraft(sessionId: string, questionId: string, code: string): void {
  if (!sessionId || !questionId) return;
  const drafts = loadQuestionDrafts(sessionId);
  drafts[questionId] = code;
  localStorage.setItem(questionDraftsKey(sessionId), JSON.stringify(drafts));
}

function clearQuestionDraft(sessionId: string, questionId: string): void {
  if (!sessionId || !questionId) return;
  const drafts = loadQuestionDrafts(sessionId);
  if (!(questionId in drafts)) return;
  delete drafts[questionId];
  localStorage.setItem(questionDraftsKey(sessionId), JSON.stringify(drafts));
}

export default function App() {
  const [auth, setAuth] = useState<StoredAuth | null>(() => getStoredAuth());
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authError, setAuthError] = useState('');
  const [activeView, setActiveView] = useState<View>('chat');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatConversations, setChatConversations] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const sessionId = auth?.sessionId ?? '';

  const reloadAssignments = async () => {
    if (!auth || !sessionId) {
      setAssignments([]);
      return;
    }

    try {
      const items = await listBankItems();
      let solvedIds: string[] = [];
      try {
        const status = await getTrackerStatus(sessionId);
        solvedIds = status.progress?.solved_ids ?? [];
      } catch {
        solvedIds = [];
      }

      const drafts = loadQuestionDrafts(sessionId);

      let uploadedAssignmentsRaw: Awaited<ReturnType<typeof listUploadedAssignments>> = [];
      try {
        uploadedAssignmentsRaw = await listUploadedAssignments();
      } catch {
        uploadedAssignmentsRaw = [];
      }

      const questions = items.map((it) => ({
        id: it.item_id,
        title: it.title,
        description: shortDescription(it.prompt),
        prompt: it.prompt,
        difficulty: 'Easy' as const,
        solved: solvedIds.includes(it.item_id),
        starterCode: '',
        currentCode: drafts[it.item_id] ?? '',
        chatHistory: [],
      }));

      const grouped = new Map<number, Assignment>();
      for (const q of questions) {
        const parsed = parseItemId(q.id);
        const paNumber = parsed?.pa ?? 1;
        const existing = grouped.get(paNumber);
        if (!existing) {
          grouped.set(paNumber, {
            id: `pa${paNumber}`,
            title: `PA${paNumber}`,
            description: `Practice Assignment ${paNumber}`,
            dueDate: '',
            progress: 0,
            questions: [q],
            pdfUrl: '',
          });
        } else {
          existing.questions.push(q);
        }
      }

      const sortedAssignments = Array.from(grouped.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, assignment]) => {
          assignment.questions.sort((a, b) => {
            const aParsed = parseItemId(a.id);
            const bParsed = parseItemId(b.id);
            if (!aParsed || !bParsed) return a.id.localeCompare(b.id);
            return aParsed.q - bParsed.q;
          });
          const solvedCount = assignment.questions.filter((q) => q.solved).length;
          return {
            ...assignment,
            progress: computeProgressPercent(solvedCount, assignment.questions.length),
          };
        });

      const uploadedAssignments: Assignment[] = uploadedAssignmentsRaw.map((assignment) => {
        const questions = assignment.questions.map((q) => ({
          id: q.id,
          title: q.title,
          description: q.preview?.trim() || shortDescription(q.prompt),
          prompt: q.prompt,
          difficulty: 'Easy' as const,
          solved: false,
          starterCode: '',
          currentCode: drafts[q.id] ?? '',
          chatHistory: [],
        }));
        const solvedCount = questions.filter((q) => q.solved).length;

        return {
          id: assignment.id,
          title: assignment.title,
          description: `${questions.length} uploaded questions`,
          dueDate: '',
          progress: computeProgressPercent(solvedCount, questions.length),
          questions,
          pdfUrl: '',
        };
      });

      setAssignments([...uploadedAssignments, ...sortedAssignments]);
    } catch {
      setAssignments([]);
    }
  };

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    if (!auth?.token) return;

    const hydrate = async () => {
      try {
        const res = await me(auth.token);
        const refreshed: StoredAuth = {
          token: res.access_token,
          email: res.user.email,
          sessionId: res.user.session_id,
        };
        saveStoredAuth(refreshed);
        setAuth(refreshed);
      } catch {
        clearStoredAuth();
        setAuth(null);
      }
    };

    void hydrate();
  }, []);

  useEffect(() => {
    if (!auth) {
      setAssignments([]);
      return;
    }

    void reloadAssignments();
  }, [sessionId, auth]);

  useEffect(() => {
    if (!sessionId) {
      setChatConversations([]);
      setActiveChatId(null);
      return;
    }

    const hydrateConversations = async () => {
      try {
        const remote = await listChatConversationsRemote();
        const mapped: ChatConversation[] = remote.map((conversation) => ({
          id: conversation.id,
          title: conversation.title,
          messages: conversation.messages,
          updatedAt: conversation.updated_at,
        }));
        const sorted = mapped.sort((a, b) => b.updatedAt - a.updatedAt);
        setChatConversations(sorted);
        setActiveChatId(null);
      } catch {
        setChatConversations([]);
        setActiveChatId(null);
      }
    };

    void hydrateConversations();
  }, [sessionId]);

  const handleAuthSubmit = async () => {
    setAuthError('');
    const email = emailInput.trim();
    const password = passwordInput;
    if (!email || !password) {
      setAuthError('Email and password are required.');
      return;
    }

    try {
      const res = authMode === 'signup' ? await signup(email, password) : await login(email, password);
      const nextAuth: StoredAuth = {
        token: res.access_token,
        email: res.user.email,
        sessionId: res.user.session_id,
      };
      saveStoredAuth(nextAuth);
      setAuth(nextAuth);
      setPasswordInput('');
      setAuthError('');
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : 'Authentication failed');
    }
  };

  const handleLogout = () => {
    clearStoredAuth();
    setAuth(null);
    setSelectedAssignmentId(null);
    setSelectedQuestionId(null);
    setAssignments([]);
    setChatConversations([]);
    setActiveChatId(null);
    setActiveView('chat');
  };

  const handleViewChange = (view: 'chat' | 'assignments') => {
    setActiveView(view);
    setSelectedAssignmentId(null);
    setSelectedQuestionId(null);
    if (view === 'assignments') {
      void reloadAssignments();
    }
  };

  const handleChatConversationsChange = (nextConversations: ChatConversation[], nextActiveId: string | null) => {
    const sorted = [...nextConversations].sort((a, b) => b.updatedAt - a.updatedAt);
    setChatConversations(sorted);
    setActiveChatId(nextActiveId);

    const targetConversation =
      sorted.find((conversation) => conversation.id === nextActiveId) ?? sorted[0] ?? null;
    if (targetConversation) {
      void saveChatConversationRemote({
        conversationId: targetConversation.id,
        title: targetConversation.title,
        messages: targetConversation.messages,
        updatedAt: targetConversation.updatedAt,
      }).catch(() => undefined);
    }
  };

  const handleNewChat = () => {
    setActiveView('chat');
    setActiveChatId(null);
  };

  const handleOpenRecentChat = (conversationId: string) => {
    setActiveView('chat');
    setActiveChatId(conversationId);
    setSelectedAssignmentId(null);
    setSelectedQuestionId(null);
  };

  const handleDeleteRecentChat = (conversationId: string) => {
    setChatConversations((prev) => prev.filter((conversation) => conversation.id !== conversationId));
    if (activeChatId === conversationId) {
      setActiveChatId(null);
    }
    void deleteChatConversationRemote(conversationId).catch(() => undefined);
  };

  const handleUploadPdf = async (file: File, assignmentName: string) => {
    await uploadAssignmentPdf({ assignmentName, file });
    await reloadAssignments();
  };

  const handleAssignmentClick = (id: string) => {
    setSelectedAssignmentId(id);
    setActiveView('assignment-detail');
  };

  const handleQuestionSelect = (questionId: string | null) => {
    setSelectedQuestionId(questionId);

    if (questionId) {
      void setCurrentItem({ sessionId, itemId: questionId }).catch(() => undefined);
    } else {
      void reloadAssignments();
    }
  };

  const handleSolutionSubmit = async (questionId: string, code: string, chatHistory: ChatMessage[]) => {
    const assignment = assignments.find((a) => a.id === selectedAssignmentId);
    const question = assignment?.questions.find((q) => q.id === questionId);

    try {
      await setCurrentItem({ sessionId, itemId: questionId });
      saveQuestionDraft(sessionId, questionId, code);
      const res = await chat({
        sessionId,
        message: 'Here is my code submission.',
        question: question?.prompt || question?.description || '',
        studentCode: code,
      });

      const solvedIds = res.progress?.solved_ids ?? [];
      setAssignments((prev) =>
        prev.map((a) => {
          const updatedQuestions = a.questions.map((q) => ({
            ...q,
            solved: solvedIds.includes(q.id),
            currentCode: q.id === questionId ? code : q.currentCode,
            solution: q.id === questionId ? code : q.solution,
            chatHistory: q.id === questionId ? chatHistory : q.chatHistory,
          }));
          const solvedCount = updatedQuestions.filter((q) => q.solved).length;
          return { ...a, questions: updatedQuestions, progress: computeProgressPercent(solvedCount, updatedQuestions.length) };
        })
      );

      return res.result.response;
    } catch (e) {
      return e instanceof Error ? `Error: ${e.message}` : 'Error submitting solution';
    }
  };

  const handleQuestionReset = (questionId: string) => {
    clearQuestionDraft(sessionId, questionId);
    setAssignments((prev) =>
      prev.map((assignment) => {
        if (assignment.id !== selectedAssignmentId) return assignment;

        const updatedQuestions = assignment.questions.map((q) =>
          q.id === questionId ? { ...q, solution: undefined, currentCode: q.starterCode || '', chatHistory: [] } : q
        );

        return {
          ...assignment,
          questions: updatedQuestions,
        };
      })
    );
  };

  const handleToggleQuestionSolved = (questionId: string) => {
    setAssignments((prev) =>
      prev.map((assignment) => {
        if (assignment.id !== selectedAssignmentId) return assignment;

        const updatedQuestions = assignment.questions.map((q) =>
          q.id === questionId ? { ...q, solved: !q.solved } : q
        );

        const solvedCount = updatedQuestions.filter((q) => q.solved).length;
        const progress = Math.round((solvedCount / updatedQuestions.length) * 100);

        return {
          ...assignment,
          questions: updatedQuestions,
          progress,
        };
      })
    );
  };

  const handleCodeChange = (questionId: string, code: string) => {
    saveQuestionDraft(sessionId, questionId, code);
    setAssignments((prev) =>
      prev.map((assignment) => {
        if (assignment.id !== selectedAssignmentId) return assignment;

        const updatedQuestions = assignment.questions.map((q) =>
          q.id === questionId ? { ...q, currentCode: code } : q
        );

        return {
          ...assignment,
          questions: updatedQuestions,
        };
      })
    );
  };

  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId);

  if (!auth) {
    return (
      <div className="h-screen flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 space-y-4">
          <h1 className="text-xl">Student Login</h1>

          <div className="space-y-2">
            <label className="text-sm">Email</label>
            <input
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder="student@example.com"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm">Password</label>
            <input
              type="password"
              className="w-full rounded-md border border-border bg-background px-3 py-2"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              placeholder="At least 6 characters"
            />
          </div>

          {authError ? <p className="text-sm text-red-500">{authError}</p> : null}

          <button
            onClick={() => void handleAuthSubmit()}
            className="w-full rounded-md bg-primary text-primary-foreground py-2"
          >
            {authMode === 'signup' ? 'Create account' : 'Login'}
          </button>

          <button
            onClick={() => setAuthMode((prev) => (prev === 'signup' ? 'login' : 'signup'))}
            className="w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
          >
            {authMode === 'signup' ? 'Have an account? Login' : 'New student? Sign up'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-background">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        recents={chatConversations}
        activeRecentId={activeChatId}
        onRecentClick={handleOpenRecentChat}
        onRecentDelete={handleDeleteRecentChat}
        onLogout={handleLogout}
      />

      <div className="flex-1 overflow-hidden">
        <div className="border-b border-border px-4 py-2 flex items-center justify-between text-sm text-muted-foreground">
          <span>{auth.email}</span>
        </div>

        {activeView === 'chat' && (
          <ChatView
            sessionId={sessionId}
            conversations={chatConversations}
            activeConversationId={activeChatId}
            onConversationsChange={handleChatConversationsChange}
            onNewChat={handleNewChat}
          />
        )}

        {activeView === 'assignments' && (
          <AssignmentsList
            assignments={assignments}
            onAssignmentClick={handleAssignmentClick}
            onUploadPdf={handleUploadPdf}
          />
        )}

        {activeView === 'assignment-detail' && selectedAssignment && (
          <AssignmentView
            assignment={selectedAssignment}
            sessionId={sessionId}
            onBack={() => {
              setActiveView('assignments');
              void reloadAssignments();
            }}
            onQuestionSelect={handleQuestionSelect}
            onSolutionSubmit={handleSolutionSubmit}
            onCodeChange={handleCodeChange}
            onQuestionReset={handleQuestionReset}
            onToggleQuestionSolved={handleToggleQuestionSolved}
            selectedQuestionId={selectedQuestionId}
          />
        )}
      </div>
    </div>
  );
}
