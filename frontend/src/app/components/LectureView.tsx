import { ArrowLeft, Clock, CheckCircle2 } from 'lucide-react';
import { motion } from 'motion/react';
import { Lecture } from '../types';

interface LectureViewProps {
  lecture: Lecture;
  onBack: () => void;
}

export function LectureView({ lecture, onBack }: LectureViewProps) {
  return (
    <div className="h-full flex flex-col bg-background">
      <motion.div
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="border-b border-border bg-card"
      >
        <div className="p-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="p-2 hover:bg-secondary/50 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1>{lecture.title}</h1>
              <p className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                <Clock className="w-4 h-4" />
                {lecture.duration}
              </p>
            </div>
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
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3>Progress</h3>
              {lecture.completed && (
                <div className="flex items-center gap-2 text-success">
                  <CheckCircle2 className="w-5 h-5" />
                  <span className="text-sm">Completed</span>
                </div>
              )}
            </div>
            <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${lecture.progress}%` }}
                transition={{ duration: 1, delay: 0.3, ease: 'easeOut' }}
                className="bg-primary h-3 rounded-full"
              />
            </div>
            <p className="text-sm text-muted-foreground mt-2">{lecture.progress}% Complete</p>
          </div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="bg-card border border-border rounded-xl p-6"
          >
            <h3 className="mb-4">Description</h3>
            <p className="text-muted-foreground">{lecture.description}</p>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <h3 className="mb-4">Subtopics</h3>
            <div className="space-y-3">
              {lecture.subtopics.map((subtopic, index) => (
                <motion.div
                  key={subtopic.id}
                  initial={{ x: -20, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.3, delay: 0.4 + index * 0.05 }}
                  className="bg-card border border-border rounded-xl p-5 hover:shadow-lg hover:scale-[1.02] transition-all"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                      <span className="text-sm text-primary font-semibold">{index + 1}</span>
                    </div>
                    <div className="flex-1">
                      <h4 className="mb-1">{subtopic.title}</h4>
                      <p className="text-sm text-muted-foreground">{subtopic.description}</p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.5 }}
            className="bg-secondary/50 border border-border rounded-xl p-6"
          >
            <p className="text-sm text-muted-foreground text-center">
              These subtopics are for informational purposes only and are not tracked individually.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
