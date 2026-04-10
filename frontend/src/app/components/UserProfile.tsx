import { ArrowLeft, Mail, User as UserIcon, Calendar } from 'lucide-react';
import { motion } from 'motion/react';

interface UserProfileProps {
  onBack: () => void;
}

export function UserProfile({ onBack }: UserProfileProps) {
  return (
    <div className="h-full flex flex-col bg-background">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="border-b border-border bg-card"
      >
        <div className="p-6 flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-2 hover:bg-accent rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1>User Profile</h1>
            <p className="text-sm text-muted-foreground">View your information</p>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto p-6">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="max-w-4xl mx-auto space-y-6"
        >
          <div className="bg-card border border-border rounded-xl p-6 flex items-center gap-6">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.4, delay: 0.2, type: 'spring' }}
              className="w-24 h-24 rounded-full bg-primary flex items-center justify-center"
            >
              <UserIcon className="w-12 h-12 text-white" />
            </motion.div>
            <div className="flex-1">
              <h2>John Doe</h2>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Mail className="w-4 h-4" />
                <span className="text-sm">john.doe@university.edu</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground mt-1">
                <Calendar className="w-4 h-4" />
                <span className="text-sm">Enrolled: January 2026</span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
