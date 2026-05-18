import { useMemo, useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { CoursePublic } from '../api/tutorApi';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

interface TACourseDashboardProps {
  courses: CoursePublic[];
  userId: number;
  onSelectCourse: (courseId: string) => void;
  onCreateCourse: (title: string, description: string) => Promise<void>;
}

function CourseCard({
  course,
  index,
  onSelectCourse,
}: {
  course: CoursePublic;
  index: number;
  onSelectCourse: (courseId: string) => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      onClick={() => onSelectCourse(course.id)}
      className="bg-card rounded-xl border border-border overflow-hidden hover:bg-secondary/30 hover:shadow-xl transition-all text-left"
    >
      <div className="w-full p-6">
        <div className="flex items-start gap-3 mb-4">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ duration: 0.5, delay: 0.2 + index * 0.05, type: 'spring' }}
            className="w-12 h-12 rounded-lg flex items-center justify-center bg-primary/10"
          >
            <FileText className="w-5 h-5 text-primary" />
          </motion.div>
          <div>
            <h3 className="mb-1">{course.title}</h3>
            <p className="text-sm text-muted-foreground">
              {course.description || 'Practice assignments for this course.'}
            </p>
          </div>
        </div>

        <div className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-center">
          Open Course
        </div>
      </div>
    </motion.button>
  );
}

export function TACourseDashboard({
  courses,
  userId,
  onSelectCourse,
  onCreateCourse,
}: TACourseDashboardProps) {
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creating, setCreating] = useState(false);

  const myCourses = useMemo(
    () => courses.filter((course) => Number(course.owner_user_id) === Number(userId)),
    [courses, userId],
  );

  const reset = () => {
    setTitle('');
    setDescription('');
  };

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      setCreating(true);
      await onCreateCourse(title.trim(), description.trim());
      setCreateOpen(false);
      reset();
    } finally {
      setCreating(false);
    }
  };

  const renderSection = (sectionTitle: string, sectionCourses: CoursePublic[], offset = 0) => (
    <section className="space-y-4">
      <h2>{sectionTitle}</h2>
      {sectionCourses.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8 text-sm text-muted-foreground">
          No courses yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sectionCourses.map((course, index) => (
            <CourseCard
              key={`${sectionTitle}-${course.id}`}
              course={course}
              index={index + offset}
              onSelectCourse={onSelectCourse}
            />
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="mb-2">Courses</h1>
              <p className="text-muted-foreground">Create and manage course workspaces.</p>
            </div>

            <Dialog open={createOpen} onOpenChange={(open) => {
              setCreateOpen(open);
              if (!open) reset();
            }}>
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all whitespace-nowrap">
                  <Plus className="w-4 h-4" />
                  Create Course
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create Course</DialogTitle>
                  <DialogDescription>
                    Add the course title and description. PDFs can be uploaded after opening the course.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Course title</label>
                    <input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2"
                      placeholder="Intro to Java"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Course description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 min-h-[96px]"
                      placeholder="Short summary for students"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    className="px-4 py-2 rounded-md border border-border hover:bg-secondary/60 transition-colors"
                    disabled={creating}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-60"
                    disabled={!title.trim() || creating}
                  >
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </motion.div>

        <div className="space-y-10">
          {renderSection('My Courses', myCourses)}
          {renderSection('All Courses', courses, myCourses.length)}
        </div>
      </div>
    </div>
  );
}
