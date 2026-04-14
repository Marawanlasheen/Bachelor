import { CheckCircle2, Circle, FileText } from 'lucide-react';
import { motion } from 'motion/react';
import { Lecture } from '../types';

interface LecturesListProps {
  lectures: Lecture[];
  onLectureClick: (id: string) => void;
  onMarkComplete?: (id: string) => void;
}

export function LecturesList({ lectures, onLectureClick, onMarkComplete }: LecturesListProps) {
  const handleMarkComplete = (e: React.MouseEvent, lectureId: string) => {
    e.stopPropagation();
    if (onMarkComplete) {
      onMarkComplete(lectureId);
    }
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-8 max-w-7xl mx-auto">
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mb-8"
        >
          <h1 className="mb-2">Lectures</h1>
          <p className="text-muted-foreground">Complete lectures to unlock new concepts</p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {lectures.map((lecture, index) => (
            <motion.div
              key={lecture.id}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4, delay: index * 0.05 }}
              className="bg-card rounded-xl border border-border p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 + index * 0.05, type: 'spring' }}
                  className="w-12 h-12 rounded-lg bg-primary flex items-center justify-center"
                >
                  <FileText className="w-6 h-6 text-white" />
                </motion.div>
                <button
                  onClick={(e) => handleMarkComplete(e, lecture.id)}
                  className={`w-6 h-6 rounded flex items-center justify-center border-2 transition-all ${
                    lecture.completed
                      ? 'bg-success border-success hover:bg-success/80'
                      : 'border-muted-foreground hover:border-success hover:bg-success/10'
                  }`}
                  title={lecture.completed ? 'Mark as Incomplete' : 'Mark as Complete'}
                >
                  {lecture.completed && <CheckCircle2 className="w-5 h-5 text-success" />}
                </button>
              </div>

              <h3 className="mb-2">{lecture.title}</h3>
              <p className="text-sm text-muted-foreground mb-4">{lecture.description}</p>

              <div className="space-y-3">
                <div className="w-full text-center px-3 py-2 bg-secondary/30 text-sm rounded-lg text-muted-foreground">
                  Lecture materials are built into the platform
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
