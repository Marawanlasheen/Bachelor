import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Bot, User } from 'lucide-react';
import { ChatMessage } from '../types';
import { chat } from '../api/tutorApi';

const DEFAULT_MESSAGE: ChatMessage = {
  id: '1',
  sender: 'ai',
  message: "Hi! I'm Codding Buddy. I'm here to help you with your Java programming questions. What would you like to learn today?",
  timestamp: Date.now(),
};

export function ChatView({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim()) return;
    if (isSending) return;

    if (!hasStartedChat) {
      setHasStartedChat(true);
      setMessages([DEFAULT_MESSAGE]);
    }

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
      const result = await chat({ sessionId, message: userMessage.message });
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: result.result.response,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (e) {
      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'ai',
        message: e instanceof Error ? `Error: ${e.message}` : 'Error sending message',
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, aiMessage]);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!hasStartedChat) {
    return (
      <div className="h-full flex flex-col bg-background items-center justify-center">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-2xl px-8"
        >
          <h1 className="text-center mb-12">What's on your mind today?</h1>

          <div className="flex gap-3 items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Ask anything"
              className="flex-1 px-6 py-4 rounded-full border border-border bg-card focus:outline-none focus:ring-2 focus:ring-primary transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="p-3 rounded-full bg-secondary hover:bg-secondary/70 transition-colors disabled:opacity-50"
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
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message here..."
            className="flex-1 px-6 py-4 rounded-full border border-border bg-background focus:outline-none focus:ring-2 focus:ring-primary transition-all"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isSending}
            className="px-6 py-4 rounded-full bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-50 disabled:hover:opacity-50 flex items-center gap-2"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </motion.div>
    </div>
  );
}
