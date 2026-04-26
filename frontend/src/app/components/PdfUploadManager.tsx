import { useMemo, useRef, useState } from 'react';
import { FileText, MoreVertical, Upload } from 'lucide-react';
import { motion } from 'motion/react';
import { UploadedAssignment } from '../api/tutorApi';
import { Assignment } from '../types';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';

interface PdfUploadManagerProps {
  assignmentCards: Assignment[];
  uploadedAssignments: UploadedAssignment[];
  onUploadPdf: (file: File, assignmentName: string) => Promise<void>;
  onDeleteUploadedAssignment: (assignmentId: string) => Promise<void>;
  onAssignmentClick: (id: string) => void;
}

export function PdfUploadManager({
  assignmentCards,
  uploadedAssignments,
  onUploadPdf,
  onDeleteUploadedAssignment,
  onAssignmentClick,
}: PdfUploadManagerProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignmentName, setAssignmentName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<UploadedAssignment | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sortedAssignments = useMemo(
    () => [...uploadedAssignments].sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0)),
    [uploadedAssignments],
  );

  const resetUploadState = () => {
    setAssignmentName('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile) {
      toast.error('Please choose a PDF file to upload.');
      return;
    }

    try {
      setUploading(true);
      await onUploadPdf(selectedFile, assignmentName.trim());
      toast.success('PDF uploaded successfully.');
      setUploadOpen(false);
      resetUploadState();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!pendingDelete) return;

    try {
      setDeletingId(pendingDelete.id);
      await onDeleteUploadedAssignment(pendingDelete.id);
      toast.success('Uploaded PDF deleted.');
      setPendingDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed. Please try again.');
    } finally {
      setDeletingId(null);
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
              <h1 className="mb-2">My Workspaces</h1>
              <p className="text-muted-foreground">Upload and manage your PDF files in one place.</p>
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
                    Upload only PDFs that contain exercises or questions. This is required so the system can correctly parse and split questions.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <label className="text-sm text-muted-foreground">Workspace Name Override (optional)</label>
                    <input
                      value={assignmentName}
                      onChange={(e) => setAssignmentName(e.target.value)}
                      placeholder="Leave blank to auto-generate"
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
                    {selectedFile ? (
                      <p className="text-xs text-muted-foreground truncate">Selected: {selectedFile.name}</p>
                    ) : null}

                  </div>
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
          {assignmentCards.length === 0 ? (
            <motion.div
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.25 }}
              className="bg-card rounded-xl border border-border p-8 text-sm text-muted-foreground md:col-span-2 lg:col-span-3"
            >
              No uploaded PDFs yet.
            </motion.div>
          ) : (
            assignmentCards.map((assignment, index) => {
              const raw = sortedAssignments.find((item) => item.id === assignment.id);
              const solvedCount = assignment.questions.filter((q) => q.solved).length;
              const totalCount = assignment.questions.length;
              const isComplete = assignment.progress === 100;

              return (
                <motion.div
                  key={assignment.id}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  className="bg-card rounded-xl border border-border overflow-hidden hover:bg-secondary/30 hover:shadow-xl transition-all"
                >
                  <div className="p-3 pb-0 flex justify-end">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          className="p-2 rounded-md hover:bg-secondary/60 transition-colors"
                          title="File options"
                          aria-label={`Options for ${assignment.title}`}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => raw && setPendingDelete(raw)}
                          disabled={deletingId === assignment.id || !raw}
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <button
                    type="button"
                    onClick={() => onAssignmentClick(assignment.id)}
                    className="w-full text-left p-6 pt-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <motion.div
                          initial={{ scale: 0, rotate: -180 }}
                          animate={{ scale: 1, rotate: 0 }}
                          transition={{ duration: 0.5, delay: 0.2 + index * 0.05, type: 'spring' }}
                          className="w-12 h-12 rounded-lg flex items-center justify-center bg-primary/10"
                        >
                          <FileText className="w-5 h-5 text-primary" />
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
            })
          )}
        </div>
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete uploaded PDF?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete
                ? `This will remove "${pendingDelete.title}" from your uploaded files.`
                : 'This will remove the selected uploaded PDF.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingId}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDeleteConfirm()} disabled={!!deletingId}>
              {deletingId ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
