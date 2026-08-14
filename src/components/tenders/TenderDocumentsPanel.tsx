"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { format } from "date-fns";
import { FileText, Upload, Trash2 } from "lucide-react";
import { isSuperUser } from "@/lib/roles";
import { useNotify } from "@/components/ui/notification-provider";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Button } from "@/components/ui/Button";

interface TenderDocument {
  document_id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  description: string | null;
  created_at: string;
  uploaded_by_name: string;
  url: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function TenderDocumentsPanel({ tenderId }: { tenderId: number }) {
  const { data: session } = useSession();
  const toast = useNotify();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const roleIds = ((session?.user as any)?.roleIds || []) as number[];
  const isAdmin = isSuperUser(roleIds);

  const [accessible, setAccessible] = useState<boolean | null>(null);
  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tenders/${tenderId}/documents`);
      if (res.status === 403) {
        setAccessible(false);
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      setAccessible(true);
      setDocuments(data.documents || []);
    } catch {
      // Silent — this is a best-effort panel, not the primary page content.
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleUploadClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("tender_id", String(tenderId));
      const res = await fetch("/api/tenders/upload", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Upload failed");
      }
      toast.success(`"${file.name}" uploaded.`);
      await fetchDocuments();
    } catch (err: any) {
      toast.error(err.message || "Couldn't upload the file. Please try again.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: TenderDocument) => {
    if (!(await confirm({ description: `Remove "${doc.file_name}"? Contractors and staff will no longer be able to view it.`, confirmText: "Remove", variant: "destructive" }))) return;

    const previousDocuments = documents;
    setDeletingId(doc.document_id);
    setDocuments((prev) => prev.filter((d) => d.document_id !== doc.document_id));
    try {
      const res = await fetch(`/api/tenders/${tenderId}/documents`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ document_id: doc.document_id }),
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Document removed.");
    } catch {
      setDocuments(previousDocuments);
      toast.error("Couldn't remove the document. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  if (accessible === false) return null; // no access — panel doesn't render at all

  return (
    <div id="documents" className="print:hidden mb-6 p-4 bg-white rounded-lg border border-slate-200 scroll-mt-4">
      <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
        <div>
          <h3 className="flex items-center gap-2 font-semibold text-slate-800">
            <FileText className="w-4 h-4" /> Documents
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Site plans, drawings and other supporting files our team has attached to this tender — download anything here before you submit your bid.
          </p>
        </div>
        {isAdmin && (
          <>
            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileSelected} accept=".pdf,.docx,.xlsx,.jpg,.jpeg,.png,.webp" />
            <Button variant="outline" size="sm" onClick={handleUploadClick} disabled={uploading}>
              <Upload className="w-3.5 h-3.5" />
              {uploading ? "Uploading…" : "Upload"}
            </Button>
          </>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-400 py-4 text-center">Loading documents…</div>
      ) : documents.length === 0 ? (
        <div className="text-sm text-slate-400 py-4 text-center mt-2">No documents have been uploaded for this tender yet — check back closer to the closing date, or contact your project manager if you were expecting one.</div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {documents.map((doc) => (
            <li key={doc.document_id} className="flex items-center justify-between gap-3 py-2.5">
              <a
                href={doc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 text-sm text-slate-700 hover:text-blue-600 hover:underline truncate"
              >
                {doc.file_name}
              </a>
              <span className="text-xs text-slate-400 whitespace-nowrap">
                {formatFileSize(doc.file_size)} · {format(new Date(doc.created_at), "dd/MM/yyyy")}
              </span>
              {isAdmin && (
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={deletingId === doc.document_id}
                  aria-label={`Remove ${doc.file_name}`}
                  className="text-slate-400 hover:text-red-600 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
