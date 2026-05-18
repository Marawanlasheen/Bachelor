import { useState } from 'react';
import { motion } from 'motion/react';
import { CourseItemPublic, CoursePdfPublic, CoursePublic } from '../api/tutorApi';

interface TACourseDetailProps {
  course: CoursePublic | null;
  items: CourseItemPublic[];
  pdfs: CoursePdfPublic[];
  onUploadPdf: (file: File, name: string) => Promise<void>;
  onDeletePdf: (pdfId: string) => Promise<void>;
  onUpdateItem: (itemId: string, title: string, prompt: string) => Promise<void>;
}

export function TACourseDetail({
  course,
  items,
  pdfs,
  onUploadPdf,
  onDeletePdf,
  onUpdateItem,
}: TACourseDetailProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editPrompt, setEditPrompt] = useState('');
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const startEdit = (item: CourseItemPublic) => {
    setEditingId(item.item_id);
    setEditTitle(item.title);
    setEditPrompt(item.prompt);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditTitle('');
    setEditPrompt('');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await onUpdateItem(editingId, editTitle.trim(), editPrompt.trim());
    cancelEdit();
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    try {
      setIsUploading(true);
      await onUploadPdf(uploadFile, uploadName.trim());
      setUploadFile(null);
      setUploadName('');
    } finally {
      setIsUploading(false);
    }
  };

  if (!course) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <p className="text-muted-foreground">Select a course to view details.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-card border border-border rounded-xl p-6"
      >
        <h2 className="mb-2">{course.title}</h2>
        <p className="text-sm text-muted-foreground">{course.description || 'No description provided.'}</p>
      </motion.div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="mb-4">Upload Course PDFs</h3>
        <div className="grid md:grid-cols-[1fr_220px] gap-4 items-end">
          <div>
            <label className="text-sm">Assignment name</label>
            <input
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2"
              value={uploadName}
              onChange={(e) => setUploadName(e.target.value)}
              placeholder="PA1"
            />
          </div>
          <div>
            <label className="text-sm">PDF file</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleUpload}
          disabled={!uploadFile || isUploading}
          className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60"
        >
          {isUploading ? 'Uploading...' : 'Upload PDF'}
        </button>
        <div className="mt-4 space-y-2">
          {pdfs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No PDFs uploaded yet.</p>
          ) : (
            pdfs.map((pdf) => (
              <div key={pdf.id} className="flex items-center justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{pdf.title}</p>
                  <p className="text-xs text-muted-foreground">{pdf.filename}</p>
                </div>
                <button
                  onClick={() => onDeletePdf(pdf.id)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Delete
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="mb-4">Assignments</h3>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No assignments loaded yet.</p>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <div key={item.item_id} className="border border-border rounded-lg p-4">
                {editingId === item.item_id ? (
                  <div className="space-y-3">
                    <input
                      className="w-full rounded-md border border-border bg-background px-3 py-2"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                    />
                    <textarea
                      className="w-full rounded-md border border-border bg-background px-3 py-2 min-h-[120px]"
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveEdit}
                        className="px-3 py-2 rounded-md bg-primary text-primary-foreground"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="px-3 py-2 rounded-md border border-border"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium">{item.item_id}: {item.title}</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap mt-2">{item.prompt}</p>
                    </div>
                    <button
                      onClick={() => startEdit(item)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
