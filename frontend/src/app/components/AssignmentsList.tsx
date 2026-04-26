import { motion } from 'motion/react';
import { Assignment } from '../types';

interface AssignmentsListProps {
  assignments: Assignment[];
  onAssignmentClick: (id: string) => void;
}

export function AssignmentsList({ assignments, onAssignmentClick }: AssignmentsListProps) {

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
              <h1 className="mb-2">Practice Assignments</h1>
              <p className="text-muted-foreground">Solve problems and practice your Java skills</p>
            </div>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {assignments.map((assignment, index) => {
            const solvedCount = assignment.questions.filter(q => q.solved).length;
            const totalCount = assignment.questions.length;
            const isComplete = assignment.progress === 100;
            const assignmentNumber = index + 1;

            return (
              <motion.div
                key={assignment.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.4, delay: index * 0.05 }}
                className="bg-card rounded-xl border border-border overflow-hidden hover:bg-secondary/30 hover:shadow-xl transition-all"
              >
                <button
                  type="button"
                  onClick={() => onAssignmentClick(assignment.id)}
                  className="w-full text-left p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <motion.div
                        initial={{ scale: 0, rotate: -180 }}
                        animate={{ scale: 1, rotate: 0 }}
                        transition={{ duration: 0.5, delay: 0.2 + index * 0.05, type: 'spring' }}
                        className="w-12 h-12 rounded-lg flex items-center justify-center bg-primary/10"
                      >
                        <span className="font-semibold text-primary">PA{assignmentNumber}</span>
                      </motion.div>
                      <div>
                        <h3 className="mb-1">{assignment.title}</h3>
                        <p className="text-sm text-muted-foreground">
                          {solvedCount}/{totalCount} problems solved
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 mb-4">
                    <div className="w-full bg-secondary rounded-full h-3 overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${assignment.progress}%` }}
                        transition={{ duration: 1, delay: 0.4 + index * 0.05, ease: 'easeOut' }}
                        className="bg-primary h-3 rounded-full"
                      />
                    </div>
                    <div className="text-center">
                      <span className="text-sm font-medium">{assignment.progress}% Complete</span>
                    </div>
                  </div>

                  <div className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground text-center">
                    {isComplete ? 'Review Assignment' : 'Continue Assignment'}
                  </div>
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
