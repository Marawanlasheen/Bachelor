import { Moon, Sun } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { toast } from 'sonner';

interface SettingsProps {
  darkMode: boolean;
  username: string;
  email: string;
  onDarkModeToggle: () => void;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<string>;
  onUpdateUsername: (username: string) => Promise<string>;
}

export function Settings({
  darkMode,
  username,
  email,
  onDarkModeToggle,
  onChangePassword,
  onUpdateUsername,
}: SettingsProps) {
  const [usernameInput, setUsernameInput] = useState(username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [profileSaving, setProfileSaving] = useState(false);

  const [passwordSaving, setPasswordSaving] = useState(false);

  const handleUsernameSave = async () => {
    if (profileSaving) return;
    const nextUsername = usernameInput.trim();
    if (!nextUsername) {
      toast.error('Username cannot be empty.');
      return;
    }

    try {
      setProfileSaving(true);
      const msg = await onUpdateUsername(nextUsername);
      toast.success(msg || 'Username updated successfully.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update your username right now.');
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSave = async () => {
    if (passwordSaving) return;
    if (!currentPassword || !newPassword) {
      toast.error('Please provide your current password and a new password.');
      return;
    }

    try {
      setPasswordSaving(true);
      const msg = await onChangePassword(currentPassword, newPassword);
      toast.success(msg || 'Password updated successfully.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update your password right now.');
    } finally {
      setPasswordSaving(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-background p-8">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="mb-8"
      >
        <h1 className="mb-2">Settings</h1>
        <p className="text-muted-foreground">Manage account and appearance</p>
      </motion.div>

      <div>
        <div className="max-w-2xl mx-auto space-y-6">
          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3>Account</h3>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Email</label>
              <input
                value={email}
                disabled
                className="w-full rounded-md border border-border bg-secondary/40 px-3 py-2 text-muted-foreground"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Username</label>
              <div className="flex gap-2">
                <input
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2"
                  placeholder="yourname"
                />
                <button
                  type="button"
                  onClick={() => void handleUsernameSave()}
                  disabled={profileSaving}
                  className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60"
                >
                  {profileSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </section>

          <section className="bg-card border border-border rounded-xl p-5 space-y-4">
            <h3>Change Password</h3>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Current Password</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </div>
            <button
              type="button"
              onClick={() => void handlePasswordSave()}
              disabled={passwordSaving}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60"
            >
              {passwordSaving ? 'Updating...' : 'Update Password'}
            </button>
          </section>

          <section className="bg-card border border-border rounded-xl p-5">
            <h3 className="mb-4">Appearance</h3>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-secondary">
                  {darkMode ? <Moon className="w-6 h-6 text-primary" /> : <Sun className="w-6 h-6 text-primary" />}
                </div>
                <div>
                  <p className="font-medium">Theme</p>
                  <p className="text-sm text-muted-foreground">{darkMode ? 'Dark mode on' : 'Dark mode off'}</p>
                </div>
              </div>
              <button
                onClick={onDarkModeToggle}
                className={`relative w-14 h-8 rounded-full transition-colors ${darkMode ? 'bg-primary' : 'bg-muted'}`}
              >
                <div className={`absolute top-1 w-6 h-6 bg-white rounded-full shadow-lg ${darkMode ? 'left-7' : 'left-1'}`} />
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
