import React, { useState } from 'react';
import { Send, Calendar, Mail, AlertCircle, Eye, ChevronLeft, ChevronRight, Trash2, Loader2 } from 'lucide-react';
import { useSentEmails, useDeleteCampaign } from '../../hooks/useEmails';
import { StatusBadge } from '../../components/common/Badge';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { formatDate, truncate } from '../../lib/utils';
import { useToast } from '../../components/common/Toast';
import { EmailPreviewModal } from './EmailPreviewModal';

export const SentEmailsTable: React.FC = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useSentEmails(page, 20);
  const { success: toastSuccess, error: toastError } = useToast();
  const deleteMutation = useDeleteCampaign();
  const [emailToDelete, setEmailToDelete] = useState<any | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [previewEmailId, setPreviewEmailId] = useState<string | null>(null);

  if (isLoading) {
    return <LoadingSpinner size={32} text="Loading delivered emails from MySQL..." />;
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
        <AlertCircle size={18} />
        <span>Failed to load sent emails: {(error as any)?.message || 'Unknown error'}</span>
      </div>
    );
  }

  const emails = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  if (emails.length === 0) {
    return (
      <EmptyState
        icon={Send}
        title="No sent emails yet"
        description="Completed emails will appear here once the worker processes and delivers them via Ethereal SMTP."
      />
    );
  }

  const handleConfirmDelete = async () => {
    if (!emailToDelete) return;
    setDeleteError(null);
    try {
      const targetId = emailToDelete.campaign_id || emailToDelete.id;
      await deleteMutation.mutateAsync(targetId);
      toastSuccess('Sent mail deleted successfully.');
      setEmailToDelete(null);
    } catch (err: any) {
      const errMsg = err?.message || 'Failed to delete sent mail. Please try again.';
      setDeleteError(errMsg);
      toastError(errMsg);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Sent At</th>
                <th className="px-4 py-3">Ethereal Preview</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {emails.map((email) => (
                <tr key={email.id} className="hover:bg-accent/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 font-medium text-foreground">
                      <Mail size={14} className="text-muted-foreground" />
                      <span>{email.recipient_email}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-foreground font-normal">
                    {truncate(email.subject, 50)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Calendar size={13} />
                      <span>{formatDate(email.sent_at || email.updated_at)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <button
                      type="button"
                      onClick={() => setPreviewEmailId(email.id)}
                      className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium cursor-pointer"
                      title="View email preview"
                    >
                      <span>View Preview</span>
                      <Eye size={12} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={email.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError(null);
                        setEmailToDelete(email);
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                      title="Delete sent mail"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination Footer */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
          <span>
            Showing page {page} of {totalPages} ({total} total sent)
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft size={14} />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-border hover:bg-secondary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {emailToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-foreground">Delete Sent Mail?</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {emailToDelete.recipient_email} • {emailToDelete.subject || 'Untitled Mail'}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete this sent mail? This action cannot be undone and will permanently remove all associated records.
            </p>
            {deleteError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  setEmailToDelete(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteMutation.isPending}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-500 hover:bg-rose-600 text-white transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleteMutation.isPending && <Loader2 size={13} className="animate-spin" />}
                <span>{deleteMutation.isPending ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email Preview Modal */}
      <EmailPreviewModal
        emailId={previewEmailId}
        onClose={() => setPreviewEmailId(null)}
      />
    </div>
  );
};
