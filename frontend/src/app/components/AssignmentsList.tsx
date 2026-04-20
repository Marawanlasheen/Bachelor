import { useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import { Assignment } from '../types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

interface AssignmentsListProps {
  assignments: Assignment[];
  onAssignmentClick: (id: string) => void;
  onUploadPdf: (file: File, assignmentName: string) => Promise<void>;
}

export function AssignmentsList({ assignments, onAssignmentClick, onUploadPdf }: AssignmentsListProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignmentName, setAssignmentName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetUploadState = () => {
    setAssignmentName('');
    setSelectedFile(null);
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      setUploadError('Please choose a PDF file.');
      return;
    }
    const trimmedName = assignmentName.trim();
    if (!trimmedName) {
      setUploadError('Please enter an assignment title.');
      return;
    }

    try {
      setUploading(true);
      setUploadError('');
      await onUploadPdf(selectedFile, trimmedName);
      setUploadOpen(false);
      resetUploadState();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
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
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="mb-2">Practice Assignments</h1>
              <p className="text-muted-foreground">Solve problems and practice your Java skills</p>
            </div>

            <Dialog
              open={uploadOpen}
              onOpenChange={(open) => {
                setUploadOpen(open);
                if (!open) {
                  resetUploadState();
                }
              }}
            >
              <DialogTrigger asChild>
                <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all whitespace-nowrap">
                  <Upload className="w-4 h-4" />
                  Upload PDF
                </button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Assignment PDF</DialogTitle>
                  <DialogDescription>
                    Provide a custom assignment title and choose a PDF to extract questions.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Assignment Title</label>
                    <input
                      value={assignmentName}
                      onChange={(e) => setAssignmentName(e.target.value)}
                      placeholder="Test Assignment"
                      className="w-full rounded-md border border-border bg-background px-3 py-2"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">PDF File</label>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      className="w-full rounded-md border border-border bg-background px-3 py-2"
                    />
                    {selectedFile && (
                      <p className="text-xs text-muted-foreground truncate">Selected: {selectedFile.name}</p>
                    )}
                  </div>

                  {uploadError ? <p className="text-sm text-red-500">{uploadError}</p> : null}
                </div>

                <DialogFooter>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadOpen(false);
                      resetUploadState();
                    }}
                    className="px-4 py-2 rounded-md border border-border hover:bg-secondary/60 transition-colors"
                    disabled={uploading}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUploadSubmit}
                    className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-60"
                    disabled={uploading}
                  >
                    {uploading ? 'Uploading...' : 'Upload'}
                  </button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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
                <div className="p-6">
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

                  <button
                    onClick={() => onAssignmentClick(assignment.id)}
                    className="w-full py-2.5 px-4 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-all"
                  >
                    {isComplete ? 'Review Assignment' : 'Continue Assignment'}
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
