import { ChevronLeft, ChevronRight, LogOut, MoreHorizontal, Settings as SettingsIcon, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatConversation } from '../types';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from './ui/alert-dialog';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  menuItems: Array<{ id: string; label: string; icon: LucideIcon }>;
  showRecents?: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  recents: ChatConversation[];
  activeRecentId: string | null;
  onRecentClick: (conversationId: string) => void;
  onRecentDelete: (conversationId: string) => void;
  onLogout: () => void;
}

export function Sidebar({
  activeView,
  onViewChange,
  menuItems,
  showRecents = true,
  isCollapsed,
  onToggleCollapse,
  recents,
  activeRecentId,
  onRecentClick,
  onRecentDelete,
  onLogout,
}: SidebarProps) {
  const normalizedView = ['assignment-detail', 'assignments'].includes(activeView)
    ? 'courses'
    : activeView === 'ta-course-detail'
      ? 'ta-dashboard'
    : activeView;
  const isSettingsActive = normalizedView === 'settings';

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
            className="px-6 py-2.5 border-b border-border"
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

        <AnimatePresence mode="wait">
          {!isCollapsed && showRecents && (
            <motion.div
              key="recents"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mt-6"
            >
              <p className="px-2 pb-2 text-xs uppercase tracking-wide text-muted-foreground">Recents</p>
              <div className="max-h-72 overflow-y-auto pr-1">
                {recents.length === 0 ? (
                  <p className="px-2 py-2 text-sm text-muted-foreground">No old chats yet</p>
                ) : (
                  recents.map((conversation) => {
                    const isActiveRecent = activeRecentId === conversation.id && normalizedView === 'chat';

                    return (
                      <div
                        key={conversation.id}
                        className={`w-full flex items-center gap-1 px-2 py-1 rounded-lg mb-1 transition-colors text-sm ${
                          isActiveRecent ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                        }`}
                      >
                        <button
                          onClick={() => onRecentClick(conversation.id)}
                          className="flex-1 text-left px-1 py-1 truncate"
                          title={conversation.title}
                        >
                          {conversation.title}
                        </button>

                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button
                              className="p-1 rounded hover:bg-secondary/80 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                              title="Chat options"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => onRecentDelete(conversation.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                              Delete Chat
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <div className="p-4 border-t border-border">
        <button
          onClick={() => onViewChange('settings')}
          className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg mb-2 transition-all ${
            isSettingsActive
              ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
              : 'text-foreground hover:bg-secondary/50'
          }`}
          title={isCollapsed ? 'Settings' : undefined}
        >
          <SettingsIcon className="w-5 h-5 flex-shrink-0" />
          <AnimatePresence>
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: 'auto' }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2 }}
                className="truncate"
              >
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <button
              className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-foreground hover:bg-secondary/50 transition-colors"
              title={isCollapsed ? 'Logout' : undefined}
            >
              <LogOut className="w-5 h-5 flex-shrink-0" />
              <AnimatePresence>
                {!isCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, width: 0 }}
                    animate={{ opacity: 1, width: 'auto' }}
                    exit={{ opacity: 0, width: 0 }}
                    transition={{ duration: 0.2 }}
                    className="truncate"
                  >
                    Logout
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Logout?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to logout?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={onLogout}>Logout</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <button
        onClick={onToggleCollapse}
        className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-card border border-border hover:bg-secondary/50 transition-colors flex items-center justify-center"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </motion.div>
  );
}
