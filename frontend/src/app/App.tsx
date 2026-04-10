import { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ChatView } from './components/ChatView';
import { LecturesList } from './components/LecturesList';
import { AssignmentsList } from './components/AssignmentsList';
import { AssignmentView } from './components/AssignmentView';
import { LectureView } from './components/LectureView';
import { mockLectures } from './data/mockData';
import { Lecture, Assignment } from './types';
import { getOrCreateSessionId } from './api/session';
import { chat, getTrackerStatus, listBankItems, setCurrentItem } from './api/tutorApi';

type View = 'chat' | 'lectures' | 'lecture-detail' | 'assignments' | 'assignment-detail';

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

export default function App() {
  const [sessionId] = useState<string>(() => getOrCreateSessionId());
  const [activeView, setActiveView] = useState<View>('chat');
  const [lectures, setLectures] = useState<Lecture[]>(mockLectures);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedLectureId, setSelectedLectureId] = useState<string | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  useEffect(() => {
    const load = async () => {
      try {
        const items = await listBankItems();
        let solvedIds: string[] = [];
        try {
          const status = await getTrackerStatus(sessionId);
          solvedIds = status.progress?.solved_ids ?? [];
        } catch {
          solvedIds = [];
        }

        const questions = items.map((it) => ({
          id: it.item_id,
          title: it.title,
          description: shortDescription(it.prompt),
          prompt: it.prompt,
          difficulty: 'Easy' as const,
          solved: solvedIds.includes(it.item_id),
          starterCode: '',
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

        setAssignments(sortedAssignments);
      } catch {
        setAssignments([]);
      }
    };

    void load();
  }, [sessionId]);

  const handleViewChange = (view: 'chat' | 'lectures' | 'assignments') => {
    setActiveView(view);
    setSelectedLectureId(null);
    setSelectedAssignmentId(null);
    setSelectedQuestionId(null);
  };

  const handleLectureClick = (id: string) => {
    // Lectures are no longer clickable to open
  };

  const handleMarkLectureComplete = (id: string) => {
    setLectures((prev) =>
      prev.map((lecture) =>
        lecture.id === id
          ? { ...lecture, completed: !lecture.completed, progress: lecture.completed ? 0 : 100 }
          : lecture
      )
    );
  };

  const handleAssignmentClick = (id: string) => {
    setSelectedAssignmentId(id);
    setActiveView('assignment-detail');
  };

  const handleQuestionSelect = (questionId: string) => {
    setSelectedQuestionId(questionId);

    if (questionId) {
      void setCurrentItem({ sessionId, itemId: questionId }).catch(() => undefined);
    }
  };

  const handleSolutionSubmit = async (questionId: string, code: string, chatHistory: any[]) => {
    const assignment = assignments.find((a) => a.id === selectedAssignmentId);
    const question = assignment?.questions.find((q) => q.id === questionId);

    try {
      await setCurrentItem({ sessionId, itemId: questionId });
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
    setAssignments((prev) =>
      prev.map((assignment) => {
        if (assignment.id !== selectedAssignmentId) return assignment;

        const updatedQuestions = assignment.questions.map((q) =>
          q.id === questionId ? { ...q, solution: undefined, chatHistory: [] } : q
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

  const selectedLecture = lectures.find((l) => l.id === selectedLectureId);
  const selectedAssignment = assignments.find((a) => a.id === selectedAssignmentId);

  return (
    <div className="h-screen flex bg-background">
      <Sidebar
        activeView={activeView}
        onViewChange={handleViewChange}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 overflow-hidden">
        {activeView === 'chat' && <ChatView sessionId={sessionId} />}

        {activeView === 'lectures' && (
          <LecturesList
            lectures={lectures}
            onLectureClick={handleLectureClick}
            onMarkComplete={handleMarkLectureComplete}
          />
        )}

        {activeView === 'assignments' && (
          <AssignmentsList assignments={assignments} onAssignmentClick={handleAssignmentClick} />
        )}

        {activeView === 'assignment-detail' && selectedAssignment && (
          <AssignmentView
            assignment={selectedAssignment}
            sessionId={sessionId}
            onBack={() => setActiveView('assignments')}
            onQuestionSelect={handleQuestionSelect}
            onSolutionSubmit={handleSolutionSubmit}
            onQuestionReset={handleQuestionReset}
            onToggleQuestionSolved={handleToggleQuestionSolved}
            selectedQuestionId={selectedQuestionId}
          />
        )}
      </div>
    </div>
  );
}
