import { motion } from 'motion/react';
import { CoursePublic } from '../api/tutorApi';

interface CoursesListProps {
  courses: CoursePublic[];
  activeCourseId: string | null;
  onSelectCourse: (courseId: string) => void;
}

export function CoursesList({ courses, activeCourseId, onSelectCourse }: CoursesListProps) {
  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-5xl mx-auto">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <h1 className="mb-2">Courses</h1>
          <p className="text-muted-foreground">Pick a course to open its assignments.</p>
        </motion.div>

        {courses.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-6">
            <p className="text-muted-foreground">No courses are available yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {courses.map((course, index) => {
              const isActive = activeCourseId === course.id;
              return (
                <motion.button
                  key={course.id}
                  type="button"
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  onClick={() => onSelectCourse(course.id)}
                  className={`w-full text-left p-6 rounded-xl border transition-all ${
                    isActive
                      ? 'border-primary bg-primary/10 shadow-lg shadow-primary/10'
                      : 'border-border bg-card hover:bg-secondary/30'
                  }`}
                >
                  <h3 className="mb-2">{course.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {course.description || 'Practice assignments for this course.'}
                  </p>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
