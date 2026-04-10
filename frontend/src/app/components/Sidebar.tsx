import { BookOpen, FileText, MessageSquare, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: 'chat' | 'lectures' | 'assignments') => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ activeView, onViewChange, isCollapsed, onToggleCollapse }: SidebarProps) {
  const menuItems = [
    { id: 'chat' as const, label: 'Chat', icon: MessageSquare },
    { id: 'lectures' as const, label: 'Lectures', icon: BookOpen },
    { id: 'assignments' as const, label: 'Assignments', icon: FileText },
  ];

  const normalizedView = ['lecture-detail', 'assignment-detail'].includes(activeView)
    ? activeView.includes('lecture')
      ? 'lectures'
      : 'assignments'
    : activeView;

  return (
    <motion.div
      initial={false}
		animate={{ width: isCollapsed ? 96 : 320 }}
      transition={{ duration: 0.3 }}
      className="bg-card border-r border-border flex flex-col relative"
    >
      <AnimatePresence mode="wait">
        {!isCollapsed && (
          <motion.div
            key="header"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="p-6 border-b border-border"
          >
      <h1 className="font-semibold text-primary">Your CodeBuddy</h1>
          </motion.div>
        )}
      </AnimatePresence>

      <nav className="flex-1 p-4">
        {menuItems.map((item, index) => {
          const Icon = item.icon;
          const isActive = normalizedView === item.id;

          return (
            <motion.button
              key={item.id}
              initial={{ x: -20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all ${
                isActive
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'text-foreground hover:bg-secondary/50'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 flex-shrink-0" />
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.button>
          );
        })}
      </nav>

      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-card border border-border hover:bg-secondary/50 transition-colors flex items-center justify-center"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </motion.div>
  );
}
