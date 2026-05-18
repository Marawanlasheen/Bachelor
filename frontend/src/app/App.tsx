import { useState, useEffect } from 'react';
import { ArrowLeft, FileText, MessageSquare, Upload } from 'lucide-react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { AssignmentsList } from './components/AssignmentsList';
import { AssignmentView } from './components/AssignmentView';
import { PdfUploadManager } from './components/PdfUploadManager';
import { Settings } from './components/Settings';
import { CoursesList } from './components/CoursesList';
import { TACourseAssignmentsPage } from './components/TACourseAssignmentsPage';
import { TACourseDashboard } from './components/TACourseDashboard';
import { TAAssignmentEditor } from './components/TAAssignmentEditor';
import { ToastViewport } from './components/ui/toast';
import { Assignment, ChatConversation, ChatMessage } from './types';
import { clearStoredAuth, getStoredAuth, saveStoredAuth, StoredAuth } from './api/session';
import { changePassword, loginStudent, loginTA, me, signupStudent, signupTA, updateUsername } from './api/auth';
import {
  chat,
  addCourseItem,
  createCourse,
  CoursePdfPublic,
  CoursePublic,
  deleteCourse,
  deleteCourseItem,
  deleteUploadedAssignment,
  deleteChatConversationRemote,
  getTrackerStatus,
  listCoursePdfs,
  listCourses,
  listChatConversationsRemote,
  listUploadedAssignments,
  saveChatConversationRemote,
  setCurrentItem,
  updateCourseItem,
  UploadedAssignment,
  uploadAssignmentPdf,
  uploadCoursePdf,
} from './api/tutorApi';
import { toast } from 'sonner';

type View = 'courses' | 'chat' | 'assignments' | 'assignment-detail' | 'pdf-upload' | 'settings' | 'ta-dashboard' | 'ta-course-detail';

function shortDescription(prompt: string): string {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (normalized.length <= 140) return normalized;
  return `${normalized.slice(0, 137)}...`;
}

function computeProgressPercent(solved: number, total: number): number {
  if (!total) return 0;
  return Math.round((solved / total) * 100);
}

function buildStarterCode(questionTitle: string): string {
  const safeName = (questionTitle || 'Main').replace(/[^A-Za-z0-9_]/g, '') || 'Main';
  const className = /^[A-Za-z_]/.test(safeName) ? safeName : `Task${safeName}`;
  return [
    `public class ${className} {`,
    '    public static void main(String[] args) {',
    '        // TODO: implement your solution here',
    '    }',
    '}',
  ].join('\n');
}

function buildAssignmentsFromCoursePdfs(
  pdfs: CoursePdfPublic[],
  solvedIds: string[],
  drafts: Record<string, string>,
): Assignment[] {
  return pdfs.map((pdf) => {
    const questions = pdf.questions.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.preview?.trim() || shortDescription(q.prompt),
      prompt: q.prompt,
      difficulty: 'Easy' as const,
      solved: solvedIds.includes(q.id),
      starterCode: buildStarterCode(q.title),
      currentCode: drafts[q.id] ?? '',
      chatHistory: [],
    }));
    const solvedCount = questions.filter((q) => q.solved).length;
    return {
      id: pdf.id,
      title: pdf.title,
      description: `${questions.length} problems`,
      dueDate: '',
      progress: computeProgressPercent(solvedCount, questions.length),
      questions,
      pdfUrl: '',
    };
  });
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
  const [roleInput, setRoleInput] = useState<'student' | 'ta'>('student');
  const [usernameInput, setUsernameInput] = useState('');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [activeView, setActiveView] = useState<View>('chat');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [uploadedAssignments, setUploadedAssignments] = useState<UploadedAssignment[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [courses, setCourses] = useState<CoursePublic[]>([]);
  const [activeCourseId, setActiveCourseId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [chatConversations, setChatConversations] = useState<ChatConversation[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const sessionId = auth?.sessionId ?? '';
  const isTA = auth?.role === 'ta';

  const reloadAssignments = async (courseIdOverride?: string | null) => {
    const targetCourseId = courseIdOverride ?? activeCourseId;
    if (!auth || !sessionId) {
      setAssignments([]);
      return;
    }

    if (!targetCourseId) {
      setAssignments([]);
      return;
    }

    try {
      const pdfs = await listCoursePdfs(targetCourseId);
      let solvedIds: string[] = [];
      if (!isTA) {
        try {
          const status = await getTrackerStatus({ sessionId, courseId: targetCourseId });
          solvedIds = status.progress?.solved_ids ?? [];
        } catch {
          solvedIds = [];
        }
      }

      const drafts = loadQuestionDrafts(sessionId);
      setAssignments(buildAssignmentsFromCoursePdfs(pdfs, solvedIds, drafts));
    } catch {
      setAssignments([]);
    }
  };

  const reloadUploadedAssignments = async () => {
    if (!auth || !sessionId) {
      setUploadedAssignments([]);
      return;
    }
    try {
      const uploadedAssignmentsRaw = await listUploadedAssignments();
      setUploadedAssignments(uploadedAssignmentsRaw);
    } catch {
      setUploadedAssignments([]);
    }
  };

  const reloadCourses = async () => {
    if (!auth?.token) {
      setCourses([]);
      setActiveCourseId(null);
      return;
    }
    try {
      const rows = await listCourses();
      setCourses(rows);
      if (rows.length === 0) {
        setActiveCourseId(null);
        return;
      }
      const preferred = activeCourseId && rows.some((c) => c.id === activeCourseId) ? activeCourseId : rows[0].id;
      setActiveCourseId(preferred);
    } catch {
      setCourses([]);
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
          userId: res.user.id,
          username: res.user.username,
          email: res.user.email,
          sessionId: res.user.session_id,
          role: res.user.role,
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
      setCourses([]);
      setActiveCourseId(null);
      return;
    }
    void reloadCourses();
  }, [auth?.token]);

  useEffect(() => {
    if (!auth) return;
    if (isTA && !['ta-dashboard', 'ta-course-detail', 'assignment-detail', 'chat', 'settings'].includes(activeView)) {
      setActiveView('ta-dashboard');
    }
    if (!isTA && ['ta-dashboard', 'ta-course-detail'].includes(activeView)) {
      setActiveView('courses');
    }
  }, [auth, isTA, activeView]);

  useEffect(() => {
    if (!auth) {
      setAssignments([]);
      return;
    }

    void reloadAssignments();
  }, [sessionId, auth, activeCourseId, isTA]);

  useEffect(() => {
    void reloadUploadedAssignments();
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
    if (authLoading) return;
    const username = usernameInput.trim();
    const email = emailInput.trim();
    const password = passwordInput;
    if (authMode === 'signup' && !username) {
      toast.error('Please choose a username.');
      return;
    }
    if (!email || !password) {
      toast.error('Please enter both email and password.');
      return;
    }

    try {
      setAuthLoading(true);
      if (authMode === 'signup') {
        if (roleInput === 'ta') {
          await signupTA(username, email, password);
        } else {
          await signupStudent(username, email, password);
        }
        toast.success('Account created successfully. Please log in to continue.');
        setAuthMode('login');
        setPasswordInput('');
        return;
      }

      const res = roleInput === 'ta'
        ? await loginTA(email, password)
        : await loginStudent(email, password);
      const nextAuth: StoredAuth = {
        token: res.access_token,
        userId: res.user.id,
        username: res.user.username,
        email: res.user.email,
        sessionId: res.user.session_id,
        role: res.user.role,
      };
      saveStoredAuth(nextAuth);
      setAuth(nextAuth);
      setPasswordInput('');
      setActiveView(nextAuth.role === 'ta' ? 'ta-dashboard' : 'chat');
      toast.success(`Welcome back, ${nextAuth.username}.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Authentication failed. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    clearStoredAuth();
    setAuth(null);
    setSelectedAssignmentId(null);
    setSelectedQuestionId(null);
    setAssignments([]);
    setUploadedAssignments([]);
    setCourses([]);
    setActiveCourseId(null);
    setChatConversations([]);
    setActiveChatId(null);
    setActiveView('chat');
  };

  const handleViewChange = (view: View) => {
    setActiveView(view);
    setSelectedAssignmentId(null);
    setSelectedQuestionId(null);
    if (view === 'courses' || view === 'ta-dashboard') {
      void reloadCourses();
    }
    if (view === 'assignments' || view === 'ta-course-detail') {
      void reloadAssignments();
    }
    if (view === 'pdf-upload') {
      void reloadUploadedAssignments();
    }
  };

  const handleSelectCourse = (courseId: string) => {
    setActiveCourseId(courseId);
    setActiveView('assignments');
    void reloadAssignments(courseId);
  };

  const handleTASelectCourse = (courseId: string) => {
    setActiveCourseId(courseId);
    setSelectedAssignmentId(null);
    setSelectedQuestionId(null);
    setActiveView('ta-course-detail');
    void reloadAssignments(courseId);
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
    await reloadUploadedAssignments();
  };

  const handleDeleteUploadedPdf = async (assignmentId: string) => {
    await deleteUploadedAssignment(assignmentId);
    await reloadUploadedAssignments();
  };

  const handlePasswordChange = async (currentPassword: string, newPassword: string): Promise<string> => {
    const result = await changePassword({ currentPassword, newPassword });
    return result.detail || 'Password updated successfully.';
  };

  const handleUsernameChange = async (nextUsername: string): Promise<string> => {
    const res = await updateUsername(nextUsername);
    if (!auth) return 'Profile updated.';
    const nextAuth: StoredAuth = {
      token: res.access_token,
      userId: res.user.id,
      username: res.user.username,
      email: res.user.email,
      sessionId: res.user.session_id,
      role: res.user.role,
    };
    saveStoredAuth(nextAuth);
    setAuth(nextAuth);
    return 'Username updated successfully.';
  };

  const handleAssignmentClick = (id: string) => {
    setSelectedAssignmentId(id);
    setActiveView('assignment-detail');
  };

  const handleQuestionSelect = (questionId: string | null) => {
    setSelectedQuestionId(questionId);
    const isUploaded = (selectedAssignmentId ?? '').startsWith('up_');

    if (questionId) {
      if (activeCourseId && !isUploaded) {
        void setCurrentItem({ sessionId, courseId: activeCourseId, itemId: questionId }).catch(() => undefined);
      }
    } else {
      void reloadAssignments();
    }
  };

  const handleSolutionSubmit = async (questionId: string, code: string, chatHistory: ChatMessage[]) => {
    const assignment = allAssignmentCards.find((a) => a.id === selectedAssignmentId);
    const question = assignment?.questions.find((q) => q.id === questionId);
    const isUploaded = (assignment?.id ?? '').startsWith('up_');

    try {
      if (activeCourseId && !isUploaded) {
        await setCurrentItem({ sessionId, courseId: activeCourseId, itemId: questionId });
      }
      saveQuestionDraft(sessionId, questionId, code);
      const res = await chat({
        sessionId,
        courseId: isUploaded ? null : activeCourseId,
        message: 'Here is my code submission.',
        question: question?.prompt || question?.description || '',
        studentCode: code,
        chatMode: 'mini',
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

  const uploadedAssignmentCards: Assignment[] = uploadedAssignments.map((assignment) => {
    const drafts = loadQuestionDrafts(sessionId);
    const questions = assignment.questions.map((q) => ({
      id: q.id,
      title: q.title,
      description: q.preview?.trim() || shortDescription(q.prompt),
      prompt: q.prompt,
      difficulty: 'Easy' as const,
      solved: false,
      starterCode: buildStarterCode(q.title),
      currentCode: drafts[q.id] ?? '',
      chatHistory: [],
    }));
    return {
      id: assignment.id,
      title: assignment.title,
      description: `${questions.length} uploaded questions`,
      dueDate: '',
      progress: 0,
      questions,
      pdfUrl: '',
    };
  });

  const allAssignmentCards = [...assignments, ...uploadedAssignmentCards];
  const selectedAssignment = allAssignmentCards.find((a) => a.id === selectedAssignmentId);
  const assignmentCourseId = selectedAssignment?.id?.startsWith('up_') ? null : activeCourseId;

  const handleCreateCourse = async (title: string, description: string) => {
    await createCourse({ title, description });
    await reloadCourses();
  };

  const handleDeleteCourse = async (courseId: string) => {
    await deleteCourse(courseId);
    if (activeCourseId === courseId) {
      setActiveCourseId(null);
      setSelectedAssignmentId(null);
      setSelectedQuestionId(null);
      setActiveView('ta-dashboard');
    }
    await reloadCourses();
  };

  const handleUploadCoursePdf = async (file: File, name: string) => {
    if (!activeCourseId) return;
    await uploadCoursePdf({ courseId: activeCourseId, assignmentName: name, file });
    await reloadAssignments();
  };

  const handleUpdateCourseItem = async (itemId: string, title: string, prompt: string) => {
    if (!activeCourseId) return;
    await updateCourseItem({ courseId: activeCourseId, itemId, title, prompt });
    await reloadAssignments();
  };

  const handleAddCourseItem = async (assignmentId: string, title: string, prompt: string) => {
    if (!activeCourseId) return;
    await addCourseItem({ courseId: activeCourseId, pdfId: assignmentId, title, prompt });
    await reloadAssignments();
  };

  const handleDeleteCourseItem = async (itemId: string) => {
    if (!activeCourseId) return;
    await deleteCourseItem({ courseId: activeCourseId, itemId });
    await reloadAssignments();
  };

  if (!auth) {
    return (
      <>
        <ToastViewport />
        <div className="h-screen flex items-center justify-center bg-background p-6">
          <div className="w-full max-w-md bg-card border border-border rounded-xl p-6 space-y-4">
            <h1 className="text-xl">{roleInput === 'ta' ? 'TA Login' : 'Student Login'}</h1>

            <div className="grid grid-cols-2 gap-2">
              <button
                className={`rounded-md border px-3 py-2 text-sm ${roleInput === 'student' ? 'border-primary bg-primary/10' : 'border-border'}`}
                onClick={() => setRoleInput('student')}
                type="button"
              >
                Student
              </button>
              <button
                className={`rounded-md border px-3 py-2 text-sm ${roleInput === 'ta' ? 'border-primary bg-primary/10' : 'border-border'}`}
                onClick={() => setRoleInput('ta')}
                type="button"
              >
                TA
              </button>
            </div>

          {authMode === 'signup' ? (
            <div className="space-y-2">
              <label className="text-sm">Username</label>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2"
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                placeholder="yourname"
              />
            </div>
          ) : null}

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
            <button
              onClick={() => void handleAuthSubmit()}
              disabled={authLoading}
              className="w-full rounded-md bg-primary text-primary-foreground py-2 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {authLoading ? (authMode === 'signup' ? 'Creating account...' : 'Logging in...') : authMode === 'signup' ? 'Create account' : 'Login'}
            </button>

            <button
              onClick={() => {
                setAuthMode((prev) => (prev === 'signup' ? 'login' : 'signup'));
              }}
              disabled={authLoading}
              className="w-full text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
            >
              {authMode === 'signup'
                ? 'Have an account? Login'
                : roleInput === 'ta'
                  ? 'New TA? Sign up'
                  : 'New student? Sign up'}
            </button>
          </div>
        </div>
      </>
    );
  }

  const studentMenuItems = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'courses', label: 'Courses', icon: FileText },
    { id: 'pdf-upload', label: 'My Workspaces', icon: Upload },
  ];

  const taMenuItems = [
    { id: 'ta-dashboard', label: 'TA Dashboard', icon: FileText },
    { id: 'chat', label: 'Chat', icon: MessageSquare },
  ];

  return (
    <div className="h-screen flex bg-background">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        menuItems={isTA ? taMenuItems : studentMenuItems}
        showRecents={!isTA && activeView === 'chat'}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        recents={chatConversations}
        activeRecentId={activeChatId}
        onRecentClick={handleOpenRecentChat}
        onRecentDelete={handleDeleteRecentChat}
        onLogout={handleLogout}
      />

      <div className="flex-1 overflow-hidden">
        <ToastViewport />

        {activeView === 'chat' && (
          <ChatView
            sessionId={sessionId}
            username={auth.username}
            conversations={chatConversations}
            activeConversationId={activeChatId}
            onConversationsChange={handleChatConversationsChange}
            onNewChat={handleNewChat}
          />
        )}

        {!isTA && activeView === 'courses' && (
          <CoursesList
            courses={courses}
            activeCourseId={activeCourseId}
            onSelectCourse={handleSelectCourse}
          />
        )}

        {!isTA && activeView === 'assignments' && (
          <AssignmentsList
            assignments={assignments}
            onAssignmentClick={handleAssignmentClick}
            title={courses.find((course) => course.id === activeCourseId)?.title ?? 'Practice Assignments'}
            subtitle={courses.find((course) => course.id === activeCourseId)?.description || 'Solve problems and practice your Java skills'}
            emptyMessage="No practice assignments have been uploaded for this course yet."
            actionSlot={(
              <button
                type="button"
                onClick={() => {
                  setSelectedAssignmentId(null);
                  setSelectedQuestionId(null);
                  setActiveView('courses');
                  void reloadCourses();
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary/60 transition-colors whitespace-nowrap"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          />
        )}

        {!isTA && activeView === 'pdf-upload' && (
          <PdfUploadManager
            assignmentCards={uploadedAssignmentCards}
            uploadedAssignments={uploadedAssignments}
            onUploadPdf={handleUploadPdf}
            onDeleteUploadedAssignment={handleDeleteUploadedPdf}
            onAssignmentClick={handleAssignmentClick}
          />
        )}

        {!isTA && activeView === 'assignment-detail' && selectedAssignment && (
          <AssignmentView
            assignment={selectedAssignment}
            sessionId={sessionId}
            courseId={assignmentCourseId}
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

        {isTA && activeView === 'ta-dashboard' && (
          <TACourseDashboard
            courses={courses}
            userId={auth.userId}
            onSelectCourse={handleTASelectCourse}
            onCreateCourse={handleCreateCourse}
          />
        )}

        {isTA && activeView === 'ta-course-detail' && courses.find((c) => c.id === activeCourseId) && (
          <TACourseAssignmentsPage
            course={courses.find((c) => c.id === activeCourseId)!}
            assignments={assignments}
            onBack={() => {
              setSelectedAssignmentId(null);
              setActiveView('ta-dashboard');
            }}
            onAssignmentClick={handleAssignmentClick}
            onUploadPdf={handleUploadCoursePdf}
            onDeleteCourse={() => activeCourseId ? handleDeleteCourse(activeCourseId) : Promise.resolve()}
            showProgress={false}
          />
        )}

        {isTA && activeView === 'assignment-detail' && selectedAssignment && (
          <TAAssignmentEditor
            assignment={selectedAssignment}
            onBack={() => {
              setSelectedAssignmentId(null);
              setActiveView('ta-course-detail');
              void reloadAssignments();
            }}
            onUpdateQuestion={handleUpdateCourseItem}
            onAddQuestion={handleAddCourseItem}
            onDeleteQuestion={handleDeleteCourseItem}
          />
        )}

        {activeView === 'settings' && auth && (
          <Settings
            darkMode={darkMode}
            username={auth.username}
            email={auth.email}
            onDarkModeToggle={() => setDarkMode((prev) => !prev)}
            onChangePassword={handlePasswordChange}
            onUpdateUsername={handleUsernameChange}
          />
        )}
      </div>
    </div>
  );
}
