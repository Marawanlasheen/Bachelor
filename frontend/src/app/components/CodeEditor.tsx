import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Resizable } from 're-resizable';
import Editor from '@monaco-editor/react';
import { Play, Check } from 'lucide-react';
import { Question, ChatMessage } from '../types';
import { compileJava } from '../api/tutorApi';

interface CodeEditorProps {
  question: Question;
  onSolutionSubmit: (questionId: string, code: string, chatHistory: ChatMessage[]) => Promise<string | null>;
  onCodeChange: (questionId: string, code: string) => void;
  viewingSolution?: boolean;
}

export function CodeEditor({ question, onSolutionSubmit, onCodeChange, viewingSolution }: CodeEditorProps) {
  const [code, setCode] = useState(question.currentCode || question.solution || question.starterCode || '');
  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(question.chatHistory || []);

  useEffect(() => {
    if (viewingSolution && question.solution) {
      setCode(question.solution);
      return;
    }

    setCode(question.currentCode || question.solution || question.starterCode || '');
  }, [viewingSolution, question.id, question.currentCode, question.solution, question.starterCode]);

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

  const isDarkMode = document.documentElement.classList.contains('dark');
  const editorTitle = `Coding Workspace - ${question.id}`;

  return (
    <div className="h-full flex flex-col">
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-card border-b border-border p-4 flex items-center justify-between"
      >
		<h3>{editorTitle}</h3>
		<div className="flex items-center gap-2 ml-3">
          <button
            onClick={handleRun}
            disabled={isRunning || viewingSolution}
            className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50 ml-2"
          >
            <Play className="w-4 h-4" />
            <span className="text-sm">{isRunning ? 'Running...' : 'Run'}</span>
          </button>
          <button
            onClick={handleSubmit}
            disabled={viewingSolution || isSubmitting}
            className="px-3 py-2 rounded-lg bg-success text-white hover:opacity-90 transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
            <span className="text-sm">{isSubmitting ? 'Submitting...' : 'Submit'}</span>
          </button>
        </div>
      </motion.div>

      <div className="flex-1 overflow-hidden">
        <Resizable
          defaultSize={{
            height: '60%',
            width: '100%',
          }}
          minHeight="30%"
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
              onChange={(value) => {
                if (viewingSolution) return;
                const nextCode = value || '';
                setCode(nextCode);
                onCodeChange(question.id, nextCode);
              }}
              theme={isDarkMode ? 'vs-dark' : 'vs-light'}
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                automaticLayout: true,
                readOnly: viewingSolution,
              }}
            />
          </motion.div>
        </Resizable>

        <motion.div
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
          className="h-full bg-[#1e1e1e] text-gray-100 p-4 overflow-auto"
          style={{ height: 'calc(100% - 60%)' }}
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
