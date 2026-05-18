import { useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Assignment } from '../types';

interface TAAssignmentEditorProps {
  assignment: Assignment;
  onBack: () => void;
  onUpdateQuestion: (questionId: string, title: string, prompt: string) => Promise<void>;
  onAddQuestion: (assignmentId: string, title: string, prompt: string) => Promise<void>;
  onDeleteQuestion: (questionId: string) => Promise<void>;
}

export function TAAssignmentEditor({
  assignment,
  onBack,
  onUpdateQuestion,
  onAddQuestion,
  onDeleteQuestion,
}: TAAssignmentEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newPrompt, setNewPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const startEdit = (questionId: string, title: string, prompt: string) => {
    setEditingId(questionId);
    setEditTitle(title);
    setEditPrompt(prompt);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditPrompt('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      setSaving(true);
      await onUpdateQuestion(editingId, editTitle.trim(), editPrompt.trim());
      cancelEdit();
    } finally {
      setSaving(false);
    }
  };

  const addQuestion = async () => {
    if (!newTitle.trim() || !newPrompt.trim()) return;
    try {
      setAdding(true);
      await onAddQuestion(assignment.id, newTitle.trim(), newPrompt.trim());
      setNewTitle('');
      setNewPrompt('');
    } finally {
      setAdding(false);
    }
  };

  const deleteQuestion = async (questionId: string) => {
    try {
      setDeletingId(questionId);
      await onDeleteQuestion(questionId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="p-6 bg-card border-b border-border"
      >
        <div className="grid grid-cols-3 items-center">
          <button
            onClick={onBack}
            className="justify-self-start flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary/30 rounded-lg px-2 py-1 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
            <span>Back to Assignments</span>
          </button>
          <h1 className="justify-self-center">{assignment.title}</h1>
          <div />
        </div>
      </motion.div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="bg-card rounded-xl border border-border p-6"
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2>Problems</h2>
            </div>
            <div className="rounded-lg border border-border p-4 mb-4 space-y-3">
              <h3>Add Question</h3>
              <input
                className="w-full rounded-md border border-border bg-background px-3 py-2"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Question title"
              />
              <textarea
                className="w-full rounded-md border border-border bg-background px-3 py-2 min-h-[120px]"
                value={newPrompt}
                onChange={(e) => setNewPrompt(e.target.value)}
                placeholder="Question prompt"
              />
              <button
                type="button"
                onClick={() => void addQuestion()}
                disabled={!newTitle.trim() || !newPrompt.trim() || adding}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60"
              >
                <Plus className="w-4 h-4" />
                {adding ? 'Adding...' : 'Add Question'}
              </button>
            </div>
            <div className="space-y-3">
              {assignment.questions.map((question, index) => (
                <motion.div
                  key={question.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.3 + index * 0.05 }}
                  className="w-full p-4 rounded-lg border border-border hover:bg-secondary/30 hover:shadow-md transition-all"
                >
                  {editingId === question.id ? (
                    <div className="space-y-3">
                      <input
                        className="w-full rounded-md border border-border bg-background px-3 py-2"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                      />
                      <textarea
                        className="w-full rounded-md border border-border bg-background px-3 py-2 min-h-[140px]"
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                      />
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void saveEdit()}
                          disabled={!editTitle.trim() || !editPrompt.trim() || saving}
                          className="px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60"
                        >
                          {saving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          disabled={saving}
                          className="px-3 py-2 rounded-md border border-border"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <h3 className="mb-2">{question.title}</h3>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {question.prompt || question.description}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(question.id, question.title, question.prompt || question.description)}
                          className="px-3 py-2 rounded-md border border-border hover:bg-secondary/60 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteQuestion(question.id)}
                          disabled={deletingId === question.id}
                          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border hover:bg-secondary/60 transition-colors disabled:opacity-60"
                        >
                          <Trash2 className="w-4 h-4" />
                          {deletingId === question.id ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
