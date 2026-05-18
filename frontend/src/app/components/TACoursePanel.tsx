import { useState } from 'react';
import { motion } from 'motion/react';
import { CoursePublic } from '../api/tutorApi';

interface TACoursePanelProps {
  courses: CoursePublic[];
  activeCourseId: string | null;
  onSelectCourse: (courseId: string) => void;
  onCreateCourse: (title: string, description: string) => Promise<void>;
  onDeleteCourse: (courseId: string) => Promise<void>;
}

export function TACoursePanel({
  courses,
  activeCourseId,
  onSelectCourse,
  onCreateCourse,
  onDeleteCourse,
}: TACoursePanelProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      setIsCreating(true);
      await onCreateCourse(title.trim(), description.trim());
      setTitle('');
      setDescription('');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6">
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="mb-6"
      >
        <h2 className="mb-2">Course Management</h2>
        <p className="text-sm text-muted-foreground">Create and manage course shells.</p>
      </motion.div>

      <div className="space-y-3 mb-6">
        <div>
          <label className="text-sm">Course title</label>
          <input
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Intro to Java"
          />
        </div>
        <div>
          <label className="text-sm">Description</label>
          <textarea
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 min-h-[72px]"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short summary for students"
          />
        </div>
        <button
          onClick={handleCreate}
          disabled={!title.trim() || isCreating}
          className="w-full rounded-md bg-primary text-primary-foreground py-2 disabled:opacity-60"
        >
          {isCreating ? 'Creating...' : 'Create Course'}
        </button>
      </div>

      <div className="space-y-2">
        {courses.length === 0 ? (
          <p className="text-sm text-muted-foreground">No courses yet.</p>
        ) : (
          courses.map((course) => {
            const isActive = course.id === activeCourseId;
            return (
              <div
                key={course.id}
                className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${
                  isActive ? 'border-primary bg-primary/10' : 'border-border'
                }`}
              >
                <button
                  onClick={() => onSelectCourse(course.id)}
                  className="text-left flex-1"
                >
                  <p className="text-sm font-medium">{course.title}</p>
                  <p className="text-xs text-muted-foreground">{course.description || 'No description'}</p>
                </button>
                <button
                  onClick={() => onDeleteCourse(course.id)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Delete
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
