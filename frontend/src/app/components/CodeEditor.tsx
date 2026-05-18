import { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Resizable } from 're-resizable';
import Editor from '@monaco-editor/react';
import { Play, Check, Sparkles } from 'lucide-react';
import { Question, ChatMessage } from '../types';
import { chat, compileJava, TutorModelResult } from '../api/tutorApi';

interface CodeEditorProps {
  question: Question;
  sessionId: string;
  courseId?: string | null;
  questionPrompt: string;
  onSolutionSubmit: (questionId: string, code: string, chatHistory: ChatMessage[]) => Promise<string | null>;
  onCodeChange: (questionId: string, code: string) => void;
  onCheckMyCodeFeedback?: (message: string) => void;
  onCheckMyCodeResult?: (result: TutorModelResult) => void;
  viewingSolution?: boolean;
  highlightedLines?: number[];
  onCodeEdited?: (editedLines: number[]) => void;
}

export function CodeEditor({
  question,
  sessionId,
  courseId,
  questionPrompt,
  onSolutionSubmit,
  onCodeChange,
  onCheckMyCodeFeedback,
  onCheckMyCodeResult,
  viewingSolution,
  highlightedLines = [],
  onCodeEdited,
}: CodeEditorProps) {
  const [code, setCode] = useState(question.currentCode || question.solution || question.starterCode || '');
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingCode, setIsCheckingCode] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(question.chatHistory || []);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const decorationIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (viewingSolution && question.solution) {
      setCode(question.solution);
      return;
    }

    setCode(question.currentCode || question.solution || question.starterCode || '');
  }, [viewingSolution, question.id, question.currentCode, question.solution, question.starterCode]);

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    const maxLine = model ? model.getLineCount() : 0;

    const decorations = highlightedLines
      .filter((line) => Number.isInteger(line) && line > 0 && line <= maxLine)
      .map((line) => ({
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: 'error-line-highlight',
          glyphMarginClassName: 'error-line-glyph',
          linesDecorationsClassName: 'error-line-decoration',
        },
      }));

    decorationIdsRef.current = editor.deltaDecorations(decorationIdsRef.current, decorations);
  }, [highlightedLines, question.id]);

  const handleRun = async () => {
    if (viewingSolution || isRunning) return;

    setIsRunning(true);

    try {
      const result = await compileJava({ code, timeoutSec: 4 });
      const sections: string[] = [];

      if (result.compile_success) {
        sections.push(`// Compiled class: ${result.class_name}`);
      } else {
        sections.push('// Compilation failed');
      }

      if (result.stdout.trim()) {
        sections.push('// Stdout:\n' + result.stdout.trim());
      }

      if (result.stderr.trim()) {
        sections.push('// Stderr:\n' + result.stderr.trim());
      }

      if (!sections.length) {
        sections.push('// No output');
      }

      setOutput(sections.join('\n\n'));
    } catch (e) {
      setOutput(e instanceof Error ? `// Error\n${e.message}` : '// Error running code');
    } finally {
      setIsRunning(false);
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting || viewingSolution) return;
    try {
      setIsSubmitting(true);
      const feedback = await onSolutionSubmit(question.id, code, chatHistory);
      if (feedback && feedback.trim()) {
        setOutput(`// Tutor feedback:\n${feedback}`);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckMyCode = async () => {
    if (viewingSolution || isCheckingCode) return;
    try {
      setIsCheckingCode(true);
      const res = await chat({
        sessionId,
        courseId,
        message: 'Please check my code and tell me if it is likely correct. If not, give one focused hint.',
        question: questionPrompt,
        studentCode: code,
        chatMode: 'mini',
      });
      const feedback = (res.result.response ?? '').trim();
      if (feedback) {
        onCheckMyCodeFeedback?.(feedback);
      }
      onCheckMyCodeResult?.(res.result);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Error checking code';
      onCheckMyCodeFeedback?.(`I couldn't check your code yet. ${errorMessage}`);
    } finally {
      setIsCheckingCode(false);
    }
  };

  const isDarkMode = document.documentElement.classList.contains('dark');
  const editorTitle = 'Workspace';

  return (
    <div className="h-full flex flex-col">
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-card border-b border-border px-4 py-2 flex items-center justify-between"
      >
        <h3 className="text-sm font-medium">{editorTitle}</h3>
        <div className="flex items-center gap-2 ml-3 w-full justify-end">
          <button
            onClick={handleSubmit}
            disabled={viewingSolution || isSubmitting}
            className="px-3 py-2 rounded-lg bg-success text-white hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span className="text-sm">{isSubmitting ? 'Submitting...' : 'Submit'}</span>
          </button>
          <button
            onClick={handleRun}
            disabled={isRunning || viewingSolution}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            <span className="text-sm">{isRunning ? 'Running...' : 'Run'}</span>
          </button>
          <button
            onClick={handleCheckMyCode}
            disabled={isCheckingCode || viewingSolution}
            className="px-3 py-2 rounded-lg border border-border bg-card text-foreground hover:bg-secondary/60 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm">{isCheckingCode ? 'Checking...' : 'Check My Code'}</span>
          </button>
        </div>
      </motion.div>

      <div className="flex-1 overflow-hidden flex flex-col">
        <Resizable
          defaultSize={{
            height: '65%',
            width: '100%',
          }}
          minHeight="35%"
          maxHeight="85%"
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
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="h-full border-b border-border"
          >
            <Editor
              height="100%"
              defaultLanguage="java"
              value={code}
              onMount={(editor, monaco) => {
                editorRef.current = editor;
                monacoRef.current = monaco;
              }}
              onChange={(value, ev) => {
                if (viewingSolution) return;

                const nextCode = value || '';
                setCode(nextCode);
                onCodeChange(question.id, nextCode);

                if (!onCodeEdited || !ev || !Array.isArray(ev.changes)) return;
                const touched = new Set<number>();
                for (const change of ev.changes) {
                  const start = Math.max(1, Number(change.range.startLineNumber || 1));
                  const end = Math.max(start, Number(change.range.endLineNumber || start));
                  for (let line = start; line <= end; line += 1) {
                    touched.add(line);
                  }
                }
                if (touched.size > 0) {
                  onCodeEdited(Array.from(touched));
                }
              }}
              theme={isDarkMode ? 'vs-dark' : 'vs-light'}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: viewingSolution,
                glyphMargin: true,
              }}
            />
          </motion.div>
        </Resizable>

        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="flex-1 min-h-[120px] bg-[#1e1e1e] text-gray-100 p-4 overflow-auto"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-400">Output</span>
          </div>
          <pre className="text-sm font-mono whitespace-pre-wrap">
            {output || '// Run your code to see the output here...'}
          </pre>
        </motion.div>
      </div>
    </div>
  );
}
