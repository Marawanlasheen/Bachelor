import { ArrowLeft, CheckCircle2, Download, Eye, MessageCircle, X } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'motion/react';
import { Resizable } from 're-resizable';
import { Assignment, ChatMessage } from '../types';
import { CodeEditor } from './CodeEditor';
import { ChatPanel } from './ChatPanel';

interface AssignmentViewProps {
  assignment: Assignment;
  sessionId: string;
  onBack: () => void;
  onQuestionSelect: (questionId: string) => void;
  onSolutionSubmit: (questionId: string, code: string, chatHistory: ChatMessage[]) => Promise<string | null>;
  onQuestionReset: (questionId: string) => void;
  onToggleQuestionSolved: (questionId: string) => void;
  selectedQuestionId: string | null;
}

export function AssignmentView({
  assignment,
  sessionId,
  onBack,
  onQuestionSelect,
  onSolutionSubmit,
  onQuestionReset,
  onToggleQuestionSolved,
  selectedQuestionId,
}: AssignmentViewProps) {
  const [viewingSolution, setViewingSolution] = useState(false);
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [chatPanelWidth, setChatPanelWidth] = useState(384);
  const [showSolutionDialog, setShowSolutionDialog] = useState(false);
  const selectedQuestion = assignment.questions.find(q => q.id === selectedQuestionId);

  const codingTitle = selectedQuestion ? `Coding Challenge ${selectedQuestion.id}` : 'Coding Challenge';

  const handleDownload = () => {
    console.log('Downloading PDF for:', assignment.pdfUrl);
  };

  const handleViewSolutionClick = () => {
    if (!viewingSolution) {
      setShowSolutionDialog(true);
    } else {
      setViewingSolution(false);
    }
  };

  const handleConfirmViewSolution = () => {
    setViewingSolution(true);
    setShowSolutionDialog(false);
  };

  const handleTakeHint = () => {
    // TODO: Implement hint functionality
    setShowSolutionDialog(false);
    alert('Hint feature coming soon!');
  };

  const handleReset = () => {
    if (selectedQuestion && window.confirm('Reset this question? Your code will be cleared and you can start fresh.')) {
      onQuestionReset(selectedQuestion.id);
      setViewingSolution(false);
    }
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
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/30 rounded-lg px-2 py-1 mb-4 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Assignments</span>
          </button>

          <div className="flex items-start justify-between">
            <div>
              <h1 className="mb-2">{assignment.title}</h1>
              <p className="text-muted-foreground">
                {assignment.questions.filter(q => q.solved).length}/{assignment.questions.length} problems completed
              </p>
            </div>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary/50 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
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
                      <div className="flex items-start gap-3 flex-1 cursor-pointer" onClick={() => onQuestionSelect(question.id)}>
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
            onQuestionSelect(null as any);
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
              <button
                onClick={handleViewSolutionClick}
                className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-secondary hover:bg-secondary/70 transition-colors"
              >
                <Eye className="w-4 h-4" />
                {viewingSolution ? 'Hide Solution' : 'View Solution'}
              </button>

              {showSolutionDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSolutionDialog(false)}>
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
			  <h2 className="mb-3">{codingTitle}</h2>
			  <p className="text-muted-foreground mb-4 whitespace-pre-line leading-8">{selectedQuestion.prompt || selectedQuestion.description}</p>

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
              onSolutionSubmit={onSolutionSubmit}
              viewingSolution={viewingSolution}
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
                questionId={selectedQuestion.id}
                questionPrompt={selectedQuestion.prompt || selectedQuestion.description}
                chatHistory={selectedQuestion.chatHistory || []}
                viewingHistory={viewingSolution}
                onClose={() => setChatPanelOpen(false)}
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
