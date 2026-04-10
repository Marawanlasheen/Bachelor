import { ArrowLeft, Moon, Sun, Bell, Globe } from 'lucide-react';
import { motion } from 'motion/react';

interface SettingsProps {
  darkMode: boolean;
  onDarkModeToggle: () => void;
  onBack: () => void;
}

export function Settings({ darkMode, onDarkModeToggle, onBack }: SettingsProps) {
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
            <h1>Settings</h1>
            <p className="text-sm text-muted-foreground">Manage your preferences</p>
          </div>
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto p-6">
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="max-w-2xl mx-auto space-y-6"
        >
          <div>
            <h3 className="mb-4">Appearance</h3>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.15 }}
              className="bg-card border border-border rounded-xl p-5"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-secondary">
                    {darkMode ? (
                      <Moon className="w-6 h-6 text-primary" />
                    ) : (
                      <Sun className="w-6 h-6 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">Theme</p>
                    <p className="text-sm text-muted-foreground">
                      {darkMode ? 'Light mode' : 'Dark mode'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={onDarkModeToggle}
                  className={`relative w-14 h-8 rounded-full transition-colors ${
                    darkMode ? 'bg-primary' : 'bg-muted'
                  }`}
                >
                  <motion.div
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg ${
                      darkMode ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </motion.div>
          </div>

          <div>
            <h3 className="mb-4">Notifications</h3>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="bg-card border border-border rounded-xl p-5 space-y-4"
            >
              {[
                { label: 'Assignment Reminders', description: 'Get notified about upcoming deadlines' },
                { label: 'New Content', description: 'Alerts when new lectures are available' },
                { label: 'Achievement Unlocked', description: 'Celebrate your milestones' },
              ].map((item, index) => (
                <motion.div
                  key={item.label}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.25 + index * 0.05 }}
                  className="flex items-center justify-between pb-4 border-b border-border last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-4">
                    <Bell className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                  <button
                    className="relative w-12 h-6 rounded-full bg-primary"
                  >
                    <div className="absolute top-0.5 left-6 w-5 h-5 bg-white rounded-full shadow-lg" />
                  </button>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <div>
            <h3 className="mb-4">General</h3>
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.35 }}
              className="bg-card border border-border rounded-xl p-5 space-y-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <Globe className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">Language</p>
                    <p className="text-xs text-muted-foreground">Choose your preferred language</p>
                  </div>
                </div>
                <select className="bg-secondary border border-border rounded-lg px-4 py-2 text-sm">
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                </select>
              </div>
            </motion.div>
          </div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.4 }}
            className="bg-card border border-border rounded-xl p-5"
          >
            <p className="text-sm text-muted-foreground text-center">
              CS Java Course Platform v1.0.0
            </p>
            <p className="text-xs text-muted-foreground text-center mt-2">
              © 2026 University. All rights reserved.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
