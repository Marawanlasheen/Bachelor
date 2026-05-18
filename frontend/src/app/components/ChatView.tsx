import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User } from 'lucide-react';
import { ChatConversation, ChatMessage } from '../types';
import { chat } from '../api/tutorApi';

const DEFAULT_MESSAGE: ChatMessage = {
  id: '1',
  sender: 'ai',
  message: "Hi! I can see the code you share in this workspace and help you debug it. Ask me anything about your code, errors, or assignment steps.",
  timestamp: Date.now(),
};

interface ChatViewProps {
  sessionId: string;
  username: string;
  courseId?: string | null;
  conversations: ChatConversation[];
  activeConversationId: string | null;
  onConversationsChange: (nextConversations: ChatConversation[], nextActiveId: string | null) => void;
  onNewChat: () => void;
}

function summarizeTitle(message: string): string {
  const normalized = message.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'New chat';

  const cleaned = normalized
    .replace(/^(can you|could you|please|i need help with|help me with)\s+/i, '')
    .replace(/[?!.]+$/g, '');

  const stopwords = new Set([
    'the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'about', 'please', 'java', 'code', 'assignment',
    'exercise', 'problem', 'question',
  ]);

  const words = cleaned
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !stopwords.has(w))
    .slice(0, 4);

  if (words.length > 0) {
    const title = words.map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
    return title.length <= 44 ? title : `${title.slice(0, 41)}...`;
  }

  return cleaned.length <= 44 ? cleaned : `${cleaned.slice(0, 41)}...`;
}

function upsertConversation(conversations: ChatConversation[], nextConversation: ChatConversation): ChatConversation[] {
  const others = conversations.filter((conversation) => conversation.id !== nextConversation.id);
  return [nextConversation, ...others];
}

export function ChatView({
  sessionId,
  username,
  courseId,
  conversations,
  activeConversationId,
  onConversationsChange,
  onNewChat,
}: ChatViewProps) {
  const MIN_INPUT_HEIGHT = 56;
  const MAX_INPUT_HEIGHT = 192;
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const initialInputRef = useRef<HTMLTextAreaElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const activeConversation = conversations.find((conversation) => conversation.id === activeConversationId) ?? null;
  const messages = activeConversation?.messages ?? [];
  const hasStartedChat = messages.length > 0;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const resizeInput = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = `${MIN_INPUT_HEIGHT}px`;
    const needsScroll = el.scrollHeight > MAX_INPUT_HEIGHT;
    const nextHeight = Math.min(el.scrollHeight, MAX_INPUT_HEIGHT);
    el.style.height = `${nextHeight}px`;
    el.style.overflowY = needsScroll ? 'auto' : 'hidden';
  };

  useEffect(() => {
    const target = hasStartedChat ? chatInputRef.current : initialInputRef.current;
    resizeInput(target);
  }, [input, hasStartedChat]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    resizeInput(e.target);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    if (isSending) return;

    const messageText = input.trim();

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      message: messageText,
      timestamp: Date.now(),
    };

    const nextConversationId = activeConversation?.id ?? Date.now().toString();
    const conversationTitle = activeConversation?.title ?? summarizeTitle(messageText);
    const baseMessages = activeConversation?.messages?.length ? activeConversation.messages : [DEFAULT_MESSAGE];
    const messagesWithUser = [...baseMessages, userMessage];

    const withUserConversation: ChatConversation = {
      id: nextConversationId,
      title: conversationTitle,
      messages: messagesWithUser,
      updatedAt: Date.now(),
    };

    onConversationsChange(upsertConversation(conversations, withUserConversation), nextConversationId);
    setInput('');

    try {
      setIsSending(true);
      const result = await chat({ sessionId, courseId, message: userMessage.message, chatMode: 'main' });
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: result.result.response,
        timestamp: Date.now(),
      };

      const completedConversation: ChatConversation = {
        ...withUserConversation,
        messages: [...messagesWithUser, aiMessage],
        updatedAt: Date.now(),
      };

      onConversationsChange(upsertConversation(conversations, completedConversation), nextConversationId);
    } catch (e) {
      const friendly = e instanceof Error ? e.message : 'Could not send your message right now.';
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: `I couldn't send that message right now. ${friendly}`,
        timestamp: Date.now(),
      };

      const erroredConversation: ChatConversation = {
        ...withUserConversation,
        messages: [...messagesWithUser, aiMessage],
        updatedAt: Date.now(),
      };

      onConversationsChange(upsertConversation(conversations, erroredConversation), nextConversationId);
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

  if (!hasStartedChat) {
    return (
      <div className="h-full flex flex-col bg-background items-center justify-center">
        <div className="absolute top-4 right-6 text-sm text-muted-foreground">
          {`Hello, ${username}`}
        </div>
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-3xl px-8 text-center"
        >
          <h1 className="mb-6 text-center">What should we debug together today?</h1>

          <div className="flex gap-3 items-end">
            <textarea
              ref={initialInputRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder="Ask anything"
              rows={1}
              className="flex-1 min-h-[56px] max-h-48 resize-none overflow-y-hidden px-6 py-4 rounded-3xl border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="p-3 rounded-full bg-secondary hover:bg-secondary/70 transition-colors disabled:opacity-50 mb-1"
              title="Send (Enter). New line: Shift+Enter"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="border-b border-border bg-card px-6 py-3">
        <div className="w-full flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{`Hello, ${username}`}</p>
          <button
            onClick={onNewChat}
            className="px-3 py-1.5 rounded-md border border-border text-sm hover:bg-secondary/60 transition-colors"
          >
            New Chat
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto w-full">
          <div className="space-y-6 py-8">
            <AnimatePresence>
              {messages.map((message, index) => (
                <motion.div
                  key={message.id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -20, opacity: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`flex gap-4 ${message.sender === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                      message.sender === 'user'
                        ? 'bg-primary'
                        : 'bg-accent'
                    }`}
                  >
                    {message.sender === 'user' ? (
                      <User className="w-5 h-5 text-white" />
                    ) : (
                      <Bot className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div
                    className={`max-w-[70%] rounded-2xl p-4 ${
                      message.sender === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border text-foreground'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.message}</p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={messagesEndRef} />
          </div>
        </div>
      </div>

      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="border-t border-border bg-card p-6"
      >
        <div className="max-w-4xl mx-auto w-full flex gap-3">
          <textarea
            ref={chatInputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            placeholder="Type your message here..."
            rows={1}
            className="flex-1 min-h-[56px] max-h-48 resize-none overflow-y-hidden px-6 py-4 rounded-3xl border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="px-6 py-4 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50 disabled:hover:opacity-50 flex items-center gap-2 self-end"
            title="Send (Enter). New line: Shift+Enter"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
