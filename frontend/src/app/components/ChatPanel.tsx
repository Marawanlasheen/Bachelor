import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User, X } from 'lucide-react';
import { ChatMessage } from '../types';
import { chat, TutorModelResult } from '../api/tutorApi';

interface ChatPanelProps {
  sessionId: string;
  courseId?: string | null;
  questionId?: string;
  questionPrompt?: string;
  currentCode?: string;
  chatHistory?: ChatMessage[];
  viewingHistory?: boolean;
  injectedAssistantMessage?: { id: string; text: string } | null;
  onClose?: () => void;
  onTutorResult?: (result: TutorModelResult) => void;
}

const DEFAULT_MESSAGE: ChatMessage = {
  id: '1',
  sender: 'ai',
  message: "Hi! I can see the code in your Coding Workspace while we chat. Ask me anything about your current code, errors, or the problem, and I will guide you with hints.",
  timestamp: Date.now(),
};

export function ChatPanel({
  sessionId,
  courseId,
  questionId,
  questionPrompt,
  currentCode = '',
  chatHistory = [],
  viewingHistory = false,
  injectedAssistantMessage,
  onClose,
  onTutorResult,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([DEFAULT_MESSAGE]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousQuestionId = useRef(questionId);

  useEffect(() => {
    // Reset messages when question changes
    if (questionId !== previousQuestionId.current) {
      previousQuestionId.current = questionId;
      if (viewingHistory && chatHistory.length > 0) {
        setMessages(chatHistory);
      } else {
        setMessages([DEFAULT_MESSAGE]);
      }
      return;
    }

    // Update messages based on viewing history
    if (viewingHistory && chatHistory.length > 0) {
      setMessages(chatHistory);
    }
  }, [questionId, viewingHistory, chatHistory.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!injectedAssistantMessage?.id || !injectedAssistantMessage.text.trim() || viewingHistory) return;

    const aiMessage: ChatMessage = {
      id: `check-${injectedAssistantMessage.id}`,
      sender: 'ai',
      message: injectedAssistantMessage.text,
      timestamp: Date.now(),
    };
    setMessages((prev) => {
      if (prev.some((msg) => msg.id === aiMessage.id)) return prev;
      return [...prev, aiMessage];
    });
  }, [injectedAssistantMessage, viewingHistory]);

  const handleSend = async () => {
    if (!input.trim() || viewingHistory) return;
    if (isSending) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      message: input,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    try {
      setIsSending(true);
      const result = await chat({
        sessionId,
        courseId,
        message: userMessage.message,
        question: questionPrompt ?? '',
        studentCode: currentCode,
        chatMode: 'mini',
      });
      const modelText = (result.result.response ?? '').trim();
      const visibleMessage = modelText || `Model call failed: ${result.result.error ?? result.result.direct_answer_reason ?? 'unknown error'}`;
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: visibleMessage,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMessage]);
      onTutorResult?.(result.result);
    } catch (e) {
      const friendly = e instanceof Error ? e.message : 'Could not send your message right now.';
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: `I couldn't process that yet. ${friendly}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex flex-col bg-card border-l border-border">
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="p-4 border-b border-border"
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm">Coding Tutor</h3>
            <p className="text-xs text-muted-foreground">
              {viewingHistory ? 'Previous conversation' : 'Ready to help'}
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-secondary/50 rounded-lg transition-colors"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <AnimatePresence>
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`flex gap-3 ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.sender === 'user'
                        ? 'bg-primary'
                        : 'bg-accent'
                    }`}
                  >
                    {message.sender === 'user' ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>
                  <div
                    className={`max-w-[80%] rounded-lg p-3 ${
                      message.sender === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-secondary text-foreground'
                    }`}
                  >
                    <p className="text-sm whitespace-pre-wrap">{message.message}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.2 }}
        className="p-4 border-t border-border"
      >
        {viewingHistory ? (
          <div className="text-center text-sm text-muted-foreground py-2">
            This is the conversation history for this question
          </div>
        ) : (
          <div className="flex gap-2 items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask a question..."
              rows={1}
              className="flex-1 min-h-[42px] max-h-44 resize-y overflow-y-auto px-4 py-2 rounded-lg border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50 disabled:hover:opacity-50 mb-1"
              title="Send (Enter). New line: Shift+Enter"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
