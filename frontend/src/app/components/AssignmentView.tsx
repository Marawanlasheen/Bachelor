import { ArrowLeft, CheckCircle2, MessageCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Resizable } from 're-resizable';
import { Assignment, ChatMessage } from '../types';
import { TutorModelResult } from '../api/tutorApi';
import { CodeEditor } from './CodeEditor';
import { ChatPanel } from './ChatPanel';

interface AssignmentViewProps {
  assignment: Assignment;
  sessionId: string;
  courseId?: string | null;
  onBack: () => void;
  onQuestionSelect: (questionId: string | null) => void;
  onSolutionSubmit: (questionId: string, code: string, chatHistory: ChatMessage[]) => Promise<string | null>;
  onCodeChange: (questionId: string, code: string) => void;
  onQuestionReset: (questionId: string) => void;
  onToggleQuestionSolved: (questionId: string) => void;
  selectedQuestionId: string | null;
}

export function AssignmentView({
  assignment,
  sessionId,
  courseId,
  onBack,
  onQuestionSelect,
  onSolutionSubmit,
  onCodeChange,
  onQuestionReset,
  onToggleQuestionSolved,
  selectedQuestionId,
}: AssignmentViewProps) {
  const [viewingSolution, setViewingSolution] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [chatPanelWidth, setChatPanelWidth] = useState(384);
  const [showSolutionDialog, setShowSolutionDialog] = useState(false);
  const [highlightedLines, setHighlightedLines] = useState<number[]>([]);
  const [checkMyCodeMessage, setCheckMyCodeMessage] = useState<{ id: string; text: string } | null>(null);

  const selectedQuestion = assignment.questions.find((q) => q.id === selectedQuestionId);

  const paIdentifier = (() => {
    const m = assignment.title.match(/PA\s*\d+/i);
    return m ? m[0].toUpperCase().replace(/\s+/, '') : assignment.title;
  })();

  const sanitizeExerciseText = (raw: string) => {
    const lines = (raw || '').split('\n');
    const filtered = lines.filter((line) => {
      const lower = line.toLowerCase();
      if (/(download\s+.*\.zip|open\s+jcreator|jcreator\b|to\s+be\s+discussed)/i.test(lower)) {
        return false;
      }
      return true;
    });

    const joined = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!joined) {
      return 'Read the task carefully, write the Java solution in the workspace, run it, and then use Check My Code for quick feedback.';
    }
    return joined;
  };

  const renderExercisePrompt = (raw: string) => {
    const text = sanitizeExerciseText(raw);
    const paragraphs = text.split(/\n\n+/).filter(Boolean);
    const keywordRe = /\b(Task|Input|Output|Constraints|Example|Examples|Note|Hint|Steps)\b:?/gi;

    return (
      <div className="space-y-4 text-[15px] leading-7 text-foreground">
        {paragraphs.map((paragraph, idx) => {
          const withKeywords = paragraph.replace(keywordRe, '##$1##');
          const segments = withKeywords.split(/(##[^#]+##|`[^`]+`)/g).filter(Boolean);
          return (
            <p key={idx} className="whitespace-pre-wrap">
              {segments.map((segment, sidx) => {
                if (segment.startsWith('##') && segment.endsWith('##')) {
                  return (
                    <span key={sidx} className="font-semibold text-foreground">
                      {segment.slice(2, -2)}
                    </span>
                  );
                }
                if (segment.startsWith('`') && segment.endsWith('`')) {
                  return (
                    <code key={sidx} className="px-1.5 py-0.5 rounded bg-secondary font-mono text-sm">
                      {segment.slice(1, -1)}
                    </code>
                  );
                }
                return <span key={sidx}>{segment}</span>;
              })}
            </p>
          );
        })}
      </div>
    );
  };

  useEffect(() => {
    setHighlightedLines([]);
    setCheckMyCodeMessage(null);
  }, [selectedQuestionId]);

  const handleConfirmViewSolution = () => {
    setViewingSolution(true);
    setShowSolutionDialog(false);
  };

  const handleTakeHint = () => {
    setShowSolutionDialog(false);
    alert('Hint feature coming soon!');
  };

  const handleTutorResult = (result: TutorModelResult) => {
    setHighlightedLines(Array.isArray(result.highlighted_lines) ? result.highlighted_lines : []);
  };

  const handleCodeEdited = (editedLines: number[]) => {
    if (!editedLines.length) return;
    const editedSet = new Set(editedLines);
    setHighlightedLines((prev) => prev.filter((line) => !editedSet.has(line)));
  };

  const handleCheckMyCodeFeedback = (message: string) => {
    const text = message.trim();
    if (!text) return;
    setChatPanelOpen(true);
    setCheckMyCodeMessage({ id: `${Date.now()}`, text });
  };

  if (!selectedQuestion) {
    return (
      <div className="h-full flex flex-col bg-background">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="bg-card border-b border-border p-6"
        >
          <div className="grid grid-cols-3 items-center">
            <button
              onClick={onBack}
              className="justify-self-start flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/30 rounded-lg px-2 py-1 transition-all"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Assignments</span>
            </button>
            <h1 className="justify-self-center">{paIdentifier}</h1>
            <div />
          </div>
        </motion.div>

        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="bg-card rounded-xl border border-border p-6 mb-6"
            >
              <h2 className="mb-4">Assignment Overview</h2>
              <div className="w-full bg-secondary rounded-full h-3 mb-2 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${assignment.progress}%` }}
                  transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                  className="bg-primary h-3 rounded-full"
                />
              </div>
              <p className="text-sm text-muted-foreground text-center">{assignment.progress}% Complete</p>
            </motion.div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="bg-card rounded-xl border border-border p-6"
            >
              <h2 className="mb-4">Problems</h2>
              <div className="space-y-3">
                {assignment.questions.map((question, index) => (
                  <motion.div
                    key={question.id}
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
                    className="w-full p-4 rounded-lg border border-border hover:bg-secondary/30 hover:shadow-md transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div
                        className="flex items-start gap-3 flex-1 cursor-pointer"
                        onClick={() => onQuestionSelect(question.id)}
                      >
                        <div className="flex-1">
                          <h4 className="mb-1">{question.title}</h4>
                          <p className="text-sm text-muted-foreground">{question.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleQuestionSolved(question.id);
                          }}
                          className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-all ${
                            question.solved
                              ? 'bg-success border-success hover:bg-success/80'
                              : 'border-muted-foreground hover:border-success hover:bg-success/10'
                          }`}
                          title={question.solved ? 'Mark as Incomplete' : 'Mark as Complete'}
                        >
                          {question.solved && <CheckCircle2 className="w-5 h-5 text-success" />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-card border-b border-border p-4 flex items-center justify-between"
      >
        <button
          onClick={() => {
            onQuestionSelect(null);
            setViewingSolution(false);
          }}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/30 rounded-lg px-2 py-1 transition-all"
        >
          <ArrowLeft className="w-5 h-5" />
          <span>Back to Problems</span>
        </button>

        <div className="flex items-center gap-4">
          {selectedQuestion.solved && (
            <>
              <div className="flex items-center gap-1 text-success">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span className="text-sm">Solved</span>
              </div>

              {showSolutionDialog && (
                <div
                  className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
                  onClick={() => setShowSolutionDialog(false)}
                >
                  <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-card rounded-xl p-6 max-w-md w-full mx-4 border border-border relative"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      onClick={() => setShowSolutionDialog(false)}
                      className="absolute top-4 right-4 p-1 hover:bg-secondary rounded-lg transition-colors"
                    >
                      <X className="w-5 h-5 text-muted-foreground" />
                    </button>
                    <h3 className="mb-3 pr-8">View Solution?</h3>
                    <p className="text-muted-foreground mb-6 text-sm">
                      Would you like to view the solution or take a hint first?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleTakeHint}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-border hover:bg-secondary/50 transition-colors"
                      >
                        Take Hint
                      </button>
                      <button
                        onClick={handleConfirmViewSolution}
                        className="flex-1 px-3 py-2 text-sm rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-colors"
                      >
                        View Solution
                      </button>
                    </div>
                  </motion.div>
                </div>
              )}
            </>
          )}
        </div>
      </motion.div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col border-r border-border overflow-hidden">
          <Resizable
            defaultSize={{
              height: '30%',
              width: '100%',
            }}
            minHeight="15%"
            maxHeight="50%"
            enable={{
              top: false,
              right: false,
              bottom: true,
              left: false,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
          >
            <motion.div
              initial={{ y: -20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="bg-card border-b border-border p-6 overflow-y-auto h-full"
            >
              {renderExercisePrompt(selectedQuestion.prompt || selectedQuestion.description)}

              {selectedQuestion.examples && (
                <div className="space-y-3">
                  <h4>Examples:</h4>
                  {selectedQuestion.examples.map((example, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ x: -20, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      transition={{ duration: 0.3, delay: 0.2 + idx * 0.05 }}
                      className="bg-secondary rounded-lg p-3"
                    >
                      <p className="text-sm mb-1">
                        <span className="font-medium">Input:</span> {example.input}
                      </p>
                      <p className="text-sm">
                        <span className="font-medium">Output:</span> {example.output}
                      </p>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          </Resizable>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            <CodeEditor
              question={selectedQuestion}
              sessionId={sessionId}
              courseId={courseId}
              questionPrompt={selectedQuestion.prompt || selectedQuestion.description}
              onSolutionSubmit={onSolutionSubmit}
              onCodeChange={onCodeChange}
              onCheckMyCodeFeedback={handleCheckMyCodeFeedback}
              onCheckMyCodeResult={handleTutorResult}
              viewingSolution={viewingSolution}
              highlightedLines={highlightedLines}
              onCodeEdited={handleCodeEdited}
            />
          </motion.div>
        </div>

        {chatPanelOpen && (
          <Resizable
            size={{ width: chatPanelWidth, height: '100%' }}
            minWidth={300}
            maxWidth={600}
            enable={{
              top: false,
              right: false,
              bottom: false,
              left: true,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false,
            }}
            onResizeStop={(e, direction, ref, d) => {
              setChatPanelWidth(chatPanelWidth + d.width);
            }}
          >
            <motion.div
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              <ChatPanel
                sessionId={sessionId}
                courseId={courseId}
                questionId={selectedQuestion.id}
                questionPrompt={selectedQuestion.prompt || selectedQuestion.description}
                currentCode={selectedQuestion.currentCode || selectedQuestion.solution || selectedQuestion.starterCode || ''}
                chatHistory={selectedQuestion.chatHistory || []}
                viewingHistory={viewingSolution}
                injectedAssistantMessage={checkMyCodeMessage}
                onClose={() => setChatPanelOpen(false)}
                onTutorResult={handleTutorResult}
              />
            </motion.div>
          </Resizable>
        )}

        {!chatPanelOpen && (
          <motion.button
            onClick={() => setChatPanelOpen(true)}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.1, rotate: 5 }}
            whileTap={{ scale: 0.95 }}
            className="fixed right-8 top-20 w-12 h-12 rounded-full bg-primary text-primary-foreground shadow-2xl hover:shadow-primary/50 transition-shadow flex items-center justify-center z-50"
            title="Open Coding Tutor"
          >
            <MessageCircle className="w-5 h-5" />
          </motion.button>
        )}
      </div>
    </div>
  );
}
