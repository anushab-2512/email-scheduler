import React, { useState, useEffect, useRef } from 'react';
import { Mail, Paperclip, Users, Clock, Calendar, X, FileText, Loader2, Gauge, AlertCircle, Trash2 } from 'lucide-react';
import { useInfiniteCampaigns, useDeleteCampaign } from '../../hooks/useEmails';
import { CampaignWithStats } from '../../types';
import { formatDate } from '../../lib/utils';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';

export const EmailDetailsFolder: React.FC = () => {
  const { success: toastSuccess, error: toastError } = useToast();
  const deleteCampaignMutation = useDeleteCampaign();
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignWithStats | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteCampaigns(6);

  // Modals for complete details
  const [selectedSubject, setSelectedSubject] = useState<{ title: string; full: string } | null>(null);
  const [selectedBody, setSelectedBody] = useState<{ title: string; body: string } | null>(null);
  const [selectedAttachments, setSelectedAttachments] = useState<{ title: string; items: any[] } | null>(null);

  // Infinite scroll intersection observer & window scroll fallback
  const observerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!observerRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: null, rootMargin: '300px', threshold: 0 }
    );

    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Window scroll fallback to guarantee detection across all browser viewports
  useEffect(() => {
    const handleScroll = () => {
      if (!hasNextPage || isFetchingNextPage || !observerRef.current) return;
      const rect = observerRef.current.getBoundingClientRect();
      if (rect.top <= window.innerHeight + 300) {
        fetchNextPage();
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return <LoadingSpinner size={32} text="Loading composed email details..." />;
  }

  if (isError) {
    return (
      <div className="p-5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
        <AlertCircle size={16} />
        <span>Failed to load email details: {(error as any)?.message || 'Unknown error'}</span>
      </div>
    );
  }

  // Flatten campaigns across pages, deduplicate by ID, and sort DESC (newest first)
  const allCampaigns = data?.pages.flatMap((page) => page.items) || [];
  const uniqueCampaigns = Array.from(new Map(allCampaigns.map((c) => [c.id, c])).values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (uniqueCampaigns.length === 0) {
    return (
      <EmptyState
        icon={Mail}
        title="No Composed Emails"
        description="No email campaigns have been composed yet. Click 'Compose New Email' above to schedule your first batch."
      />
    );
  }

  // Truncation helpers:
  // Subject: Show at least 10 chars, if longer than 10 chars truncate with ellipsis
  const truncateSubject = (text: string) => {
    if (!text) return '—';
    if (text.length > 10) {
      return `${text.slice(0, 10)}...`;
    }
    return text;
  };

  // Body: Show approximately 20-30 characters, truncate with ellipsis if longer
  const truncateBody = (text: string) => {
    if (!text) return '—';
    const plain = text.replace(/<[^>]*>/g, '').trim();
    if (plain.length > 25) {
      return `${plain.slice(0, 25)}...`;
    }
    return plain || '—';
  };

  // Compute total available in backend
  const totalCampaigns = data?.pages[0]?.total ?? uniqueCampaigns.length;

  return (
    <div className="space-y-4">
      {/* Sub-Header info bar */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
        <span className="font-semibold text-foreground">
          Showing {uniqueCampaigns.length} of {totalCampaigns} Composed Emails
        </span>
        <span>Batch size: 6 • Infinite scroll</span>
      </div>

      {/* Responsive Grid: 3 columns on desktop, 2 on tablet, 1 on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {uniqueCampaigns.map((campaign: CampaignWithStats, idx: number) => {
          const sentPct = campaign.sent_percentage;
          const delaySec = Math.round(campaign.delay_ms / 1000);
          const attCount = campaign.attachments_count ?? (campaign.attachments?.length || 0);

          return (
            <div
              key={campaign.id}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all hover:border-primary/40 flex flex-col justify-between space-y-3.5 relative group"
            >
              {/* Card Header: Email index badge & Status pill + Delete button */}
              <div className="flex items-center justify-between gap-2 pb-2 border-b border-border/50">
                <span className="text-xs font-bold text-foreground">
                  Email #{uniqueCampaigns.length - idx}
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      campaign.status === 'completed'
                        ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : campaign.status === 'failed'
                        ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                        : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
                    }`}
                  >
                    {campaign.status === 'completed'
                      ? 'Completed'
                      : campaign.status === 'failed'
                      ? 'Failed'
                      : 'In Progress'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setCampaignToDelete(campaign);
                    }}
                    className="p-1 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                    title="Delete scheduled mail"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* 1. SENDER */}
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Sender:
                </div>
                <div
                  className="text-xs font-semibold text-foreground truncate"
                  title={campaign.sender_email}
                >
                  {campaign.sender_email}
                </div>
              </div>

              {/* 2. SUBJECT (Truncated at 10 chars, clickable for full) */}
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Subject:
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedSubject({
                      title: 'Complete Email Subject',
                      full: campaign.subject,
                    })
                  }
                  className="text-left text-xs font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1 group/sub w-full"
                  title="Click to see full subject"
                >
                  <span>{truncateSubject(campaign.subject)}</span>
                  <span className="text-[10px] text-muted-foreground group-hover/sub:text-primary transition-colors font-normal">
                    (view)
                  </span>
                </button>
              </div>

              {/* 3. BODY (Truncated ~25 chars, clickable for full) */}
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Body:
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedBody({
                      title: campaign.subject,
                      body: campaign.body,
                    })
                  }
                  className="text-left text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 group/body w-full"
                  title="Click to see full body"
                >
                  <span>{truncateBody(campaign.body)}</span>
                  <span className="text-[10px] text-primary group-hover/body:underline font-normal">
                    (read)
                  </span>
                </button>
              </div>

              {/* 4. ATTACHMENTS (Attachment icon + count, clickable for list) */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Attachments:
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedAttachments({
                      title: campaign.subject,
                      items: campaign.attachments || [],
                    })
                  }
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-secondary/80 hover:bg-secondary border border-border text-foreground transition-all hover:border-primary/40 shadow-sm"
                  title="Click to view attachment details"
                >
                  <Paperclip
                    size={13}
                    className={attCount > 0 ? 'text-primary' : 'text-muted-foreground'}
                  />
                  <span className="font-semibold">📎 {attCount}</span>
                </button>
              </div>

              {/* 5. RECIPIENT COUNT */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Recipients:
                </span>
                <span className="font-semibold text-foreground flex items-center gap-1">
                  <Users size={12} className="text-muted-foreground" />
                  <span>{campaign.total_recipients} Recipients</span>
                </span>
              </div>

              {/* 6. SENT PERCENTAGE & PROGRESS BAR */}
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                    Sent Status:
                  </span>
                  <span className="font-bold text-xs text-primary">
                    Sent: {sentPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 rounded-full ${
                      sentPct === 100
                        ? 'bg-emerald-500'
                        : sentPct > 0
                        ? 'bg-primary'
                        : 'bg-muted-foreground/30'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, sentPct))}%` }}
                  />
                </div>
              </div>

              {/* 7. HOURLY LIMIT & 8. DELAY */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/30 px-2.5 py-1.5 rounded-xl border border-border/50">
                  <Gauge size={12} className="text-amber-500 shrink-0" />
                  <span>Limit: <strong className="text-foreground">{campaign.hourly_limit}/hr</strong></span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/30 px-2.5 py-1.5 rounded-xl border border-border/50">
                  <Clock size={12} className="text-blue-500 shrink-0" />
                  <span>Delay: <strong className="text-foreground">{delaySec}s</strong></span>
                </div>
              </div>

              {/* 9. CREATED DATE (With time & seconds) */}
              <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar size={12} />
                  <span>Created: {formatDate(campaign.created_at)}</span>
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Infinite Scroll Trigger & Loader */}
      <div ref={observerRef} className="py-4 flex flex-col items-center justify-center min-h-[50px]">
        {isFetchingNextPage ? (
          <div className="flex items-center gap-2 text-xs font-semibold text-primary py-2 animate-in fade-in">
            <Loader2 size={16} className="animate-spin text-primary" />
            <span>Loading more composed emails...</span>
          </div>
        ) : hasNextPage ? (
          <button
            type="button"
            onClick={() => fetchNextPage()}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary/80 hover:bg-secondary text-primary border border-border transition-all hover:scale-[1.01] shadow-sm"
          >
            Load Next Batch (6 Emails)
          </button>
        ) : uniqueCampaigns.length > 0 ? (
          <span className="text-[11px] font-medium text-muted-foreground bg-secondary/30 px-3 py-1.5 rounded-full border border-border/50">
            ✓ All {uniqueCampaigns.length} composed emails loaded
          </span>
        ) : null}
      </div>

      {/* Subject Modal */}
      {selectedSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {selectedSubject.title}
              </h3>
              <button
                onClick={() => setSelectedSubject(null)}
                className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-sm font-bold text-foreground break-words">
              {selectedSubject.full}
            </p>
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedSubject(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Body Modal */}
      {selectedBody && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-lg rounded-2xl p-5 shadow-2xl space-y-3 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Email Body Content
                </h3>
                <p className="text-xs font-bold text-foreground truncate max-w-xs">
                  {selectedBody.title}
                </p>
              </div>
              <button
                onClick={() => setSelectedBody(null)}
                className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>
            <div
              className="text-xs text-foreground/90 overflow-y-auto whitespace-pre-wrap p-3 rounded-xl bg-secondary/30 border border-border flex-1"
              dangerouslySetInnerHTML={{ __html: selectedBody.body }}
            />
            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedBody(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attachments Modal */}
      {selectedAttachments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <div className="flex items-center gap-1.5">
                <Paperclip size={14} className="text-primary" />
                <h3 className="text-xs font-semibold text-foreground">
                  Attachments ({selectedAttachments.items.length})
                </h3>
              </div>
              <button
                onClick={() => setSelectedAttachments(null)}
                className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X size={16} />
              </button>
            </div>

            {selectedAttachments.items.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No attachments were included with this email campaign.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {selectedAttachments.items.map((att: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-border bg-secondary/30 text-xs text-foreground"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileText size={16} className="text-primary shrink-0" />
                      <div className="truncate">
                        <div className="font-semibold truncate">{att.filename}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {att.size ? `${(att.size / 1024).toFixed(1)} KB` : att.contentType || 'file'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedAttachments(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {campaignToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/20 shrink-0">
                <Trash2 size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-foreground">Delete Scheduled Mail?</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {campaignToDelete.subject || 'Untitled Mail'}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Are you sure you want to delete this mail? This action cannot be undone and will permanently remove all associated scheduled data, recipients, and records.
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
                disabled={deleteCampaignMutation.isPending}
                onClick={() => {
                  setCampaignToDelete(null);
                  setDeleteError(null);
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleteCampaignMutation.isPending}
                onClick={async () => {
                  if (!campaignToDelete) return;
                  setDeleteError(null);
                  try {
                    await deleteCampaignMutation.mutateAsync(campaignToDelete.id);
                    toastSuccess('Scheduled mail deleted successfully.');
                    setCampaignToDelete(null);
                  } catch (err: any) {
                    const errMsg = err?.message || 'Failed to delete scheduled mail. Please try again.';
                    setDeleteError(errMsg);
                    toastError(errMsg);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-rose-500 hover:bg-rose-600 text-white transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50"
              >
                {deleteCampaignMutation.isPending && <Loader2 size={13} className="animate-spin" />}
                <span>{deleteCampaignMutation.isPending ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
