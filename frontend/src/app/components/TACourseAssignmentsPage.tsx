import { useRef, useState } from 'react';
import { ArrowLeft, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { CoursePublic } from '../api/tutorApi';
import { Assignment } from '../types';
import { AssignmentsList } from './AssignmentsList';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
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

interface TACourseAssignmentsPageProps {
  course: CoursePublic;
  assignments: Assignment[];
  onBack: () => void;
  onAssignmentClick: (id: string) => void;
  onUploadPdf: (file: File, assignmentName: string) => Promise<void>;
  onDeleteCourse: () => Promise<void>;
  showProgress?: boolean;
}

export function TACourseAssignmentsPage({
  course,
  assignments,
  onBack,
  onAssignmentClick,
  onUploadPdf,
  onDeleteCourse,
  showProgress = false,
}: TACourseAssignmentsPageProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [assignmentName, setAssignmentName] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetUploadState = () => {
    setAssignmentName('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
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

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await onDeleteCourse();
      toast.success('Course deleted.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const actions = (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary/60 transition-colors whitespace-nowrap"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </button>

      <Dialog open={uploadOpen} onOpenChange={(open) => {
        setUploadOpen(open);
        if (!open) resetUploadState();
      }}>
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
              Uploaded files must be PDFs containing programming questions or exercises so the parser can split them into practice problems.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Practice assignment name</label>
              <input
                value={assignmentName}
                onChange={(e) => setAssignmentName(e.target.value)}
                placeholder="Leave blank to use the file name"
                className="w-full rounded-md border border-border bg-background px-3 py-2"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">PDF file</label>
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
              onClick={() => setUploadOpen(false)}
              className="px-4 py-2 rounded-md border border-border hover:bg-secondary/60 transition-colors"
              disabled={uploading}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleUpload()}
              className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-all disabled:opacity-60"
              disabled={uploading}
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-secondary/60 transition-colors whitespace-nowrap">
            <Trash2 className="w-4 h-4" />
            Delete Course
          </button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete course?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {course.title} and every uploaded practice assignment in it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleDelete()} disabled={deleting}>
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );

  return (
    <AssignmentsList
      assignments={assignments}
      onAssignmentClick={onAssignmentClick}
      title={course.title}
      subtitle={course.description || 'Practice assignments for this course.'}
      actionSlot={actions}
      emptyMessage="No PDFs have been uploaded for this course yet."
      showProgress={showProgress}
    />
  );
}
