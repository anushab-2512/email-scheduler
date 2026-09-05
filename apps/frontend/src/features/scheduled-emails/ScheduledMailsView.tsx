import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Mail,
  Paperclip,
  Users,
  Calendar,
  Gauge,
  Timer,
  Trash2,
  Loader2,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';
import { useInfiniteCampaigns, useDeleteCampaign, useEmailEvents } from '../../hooks/useEmails';
import { CampaignWithStats } from '../../types';
import { formatFullDateTime } from '../../lib/utils';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';

export const ScheduledMailsView: React.FC = () => {
  const navigate = useNavigate();
  const { success: toastSuccess, error: toastError } = useToast();
  const deleteCampaignMutation = useDeleteCampaign();

  // Delete modal state
  const [campaignToDelete, setCampaignToDelete] = useState<CampaignWithStats | null>(null);

  // Listen to real-time status updates via SSE
  useEmailEvents();

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteCampaigns(6);

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
    return (
      <div className="py-16 flex flex-col items-center justify-center">
        <LoadingSpinner size={36} text="Loading composed emails..." />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs flex items-center gap-2">
        <AlertCircle size={16} />
        <span>Failed to load email listing: {(error as any)?.message || 'Unknown error'}</span>
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
        title="No Composed Emails Found"
        description="No email campaigns have been composed yet. Click 'Compose New Email' above to schedule your first batch."
      />
    );
  }

  // Truncation helpers:
  // Subject: Show at least first 10 characters. If longer, truncate with ellipsis (e.g. "Internship...")
  const truncateSubject = (text: string) => {
    if (!text) return '—';
    if (text.length > 10) {
      return `${text.slice(0, 10)}...`;
    }
    return text;
  };

  // Body: Show approximately 20-30 characters initially. If longer, truncate with ellipsis (e.g. "Hello, I am writing to apply...")
  const truncateBody = (text: string) => {
    if (!text) return '—';
    const plain = text.replace(/<[^>]*>/g, '').trim();
    if (plain.length > 25) {
      return `${plain.slice(0, 25)}...`;
    }
    return plain || '—';
  };

  const totalCampaigns = data?.pages[0]?.total ?? uniqueCampaigns.length;

  const handleDeleteCampaign = async () => {
    if (!campaignToDelete) return;
    try {
      await deleteCampaignMutation.mutateAsync(campaignToDelete.id);
      toastSuccess('Scheduled mail deleted successfully.');
      setCampaignToDelete(null);
    } catch (err: any) {
      toastError(err?.message || 'Failed to delete scheduled mail.');
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-200">
      {/* ────────────────────────────────────────────────────────── */}
      {/* SCREEN 1: SCHEDULED MAILS / EMAIL LISTING HEADER           */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-border/50">
        <div>
          <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
            Email Listing
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Showing {uniqueCampaigns.length} of {totalCampaigns} composed email cards • Newest first
          </p>
        </div>
        <div className="text-[11px] font-medium text-muted-foreground self-end sm:self-auto">
          Batch size: 6 • Infinite scroll enabled
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* RESPONSIVE GRID CARDS                                      */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {uniqueCampaigns.map((campaign: CampaignWithStats, idx: number) => {
          const sentPct = campaign.sent_percentage;
          const delaySec = Math.round(campaign.delay_ms / 1000);
          const attCount = campaign.attachments_count ?? (campaign.attachments?.length || 0);

          return (
            <div
              key={campaign.id}
              onClick={() => navigate(`/scheduled-mails/${campaign.id}`)}
              className="rounded-2xl border border-border bg-card p-4 shadow-sm hover:shadow-md transition-all hover:border-primary/50 cursor-pointer flex flex-col justify-between space-y-3 relative group"
            >
              {/* Header row: Email index badge, status pill, and delete action */}
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
                    {campaign.status.replace('_', ' ')}
                  </span>

                  {/* Delete Button (stops propagation to prevent opening details) */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCampaignToDelete(campaign);
                    }}
                    className="p-1 rounded-md text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Delete scheduled mail"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* 4.1 Sender */}
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Sender
                </div>
                <div className="flex items-center gap-1.5 text-xs text-foreground font-medium truncate">
                  <Mail size={12} className="text-muted-foreground shrink-0" />
                  <span className="truncate">{campaign.sender_email}</span>
                </div>
              </div>

              {/* 4.2 Subject (Truncated: at least first 10 chars with ellipsis) */}
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Subject
                </div>
                <div
                  className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors"
                  title={campaign.subject}
                >
                  {truncateSubject(campaign.subject)}
                </div>
              </div>

              {/* 4.3 Body (Truncated: approx 20–30 chars with ellipsis) */}
              <div className="space-y-0.5">
                <div className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
                  Body
                </div>
                <div className="text-xs text-muted-foreground line-clamp-2">
                  {truncateBody(campaign.body)}
                </div>
              </div>

              {/* Middle Metric Bar: 5. Attachments Display & 6. Recipient Count */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50 text-xs">
                {/* 5. Attachments Count: icon + count (e.g. 📎 0, 📎 2) */}
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium">
                  <Paperclip size={13} className="text-primary shrink-0" />
                  <span>📎 {attCount}</span>
                </div>

                {/* 6. Recipient Count (e.g. "Recipients: 25") */}
                <div className="flex items-center gap-1.5 text-muted-foreground font-medium justify-end">
                  <Users size={13} className="text-emerald-500 shrink-0" />
                  <span>Recipients: {campaign.total_recipients}</span>
                </div>
              </div>

              {/* 7. Email Sent Percentage (with progress bar) */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[11px] text-muted-foreground font-medium">Sent: {sentPct}%</span>
                  <span className="text-[10px] text-muted-foreground">
                    ({campaign.sent_count}/{campaign.total_recipients})
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      campaign.status === 'completed'
                        ? 'bg-emerald-500'
                        : campaign.status === 'failed'
                        ? 'bg-rose-500'
                        : 'bg-primary'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, sentPct))}%` }}
                  />
                </div>
              </div>

              {/* 8. Hourly Limit and Delay */}
              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-2 border-t border-border/50">
                <div className="flex items-center gap-1">
                  <Gauge size={12} className="text-muted-foreground" />
                  <span>Hourly Limit: {campaign.hourly_limit}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Timer size={12} className="text-muted-foreground" />
                  <span>Delay: {delaySec} sec</span>
                </div>
              </div>

              {/* 9. Created Date & View Details Link */}
              <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-1">
                <div className="flex items-center gap-1">
                  <Calendar size={11} />
                  <span>Created: {formatFullDateTime(campaign.created_at, false)}</span>
                </div>
                <span className="text-primary font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                  <span>Details</span>
                  <ChevronRight size={11} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* 11. INFINITE SCROLLING TRIGGER & LOADER                    */}
      {/* ────────────────────────────────────────────────────────── */}
      <div ref={observerRef} className="py-6 flex flex-col items-center justify-center">
        {isFetchingNextPage ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={16} className="animate-spin text-primary" />
            <span>Loading more composed emails...</span>
          </div>
        ) : hasNextPage ? (
          <button
            onClick={() => fetchNextPage()}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Load more composed emails
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">
            All composed emails loaded ({uniqueCampaigns.length} total)
          </span>
        )}
      </div>

      {/* DELETE CONFIRMATION MODAL */}
      {campaignToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-500 shrink-0">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-sm font-bold text-foreground">Delete Scheduled Mail?</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Are you sure you want to permanently delete this composed mail and all associated recipient logs?
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-secondary/30 border border-border/50 text-xs text-foreground">
              <span className="font-semibold">{campaignToDelete.subject}</span>
              <div className="text-muted-foreground text-[11px] mt-0.5">
                {campaignToDelete.total_recipients} recipients • {campaignToDelete.sender_email}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCampaignToDelete(null)}
                className="px-4 py-2 rounded-xl border border-border hover:bg-secondary text-muted-foreground text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteCampaign}
                disabled={deleteCampaignMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {deleteCampaignMutation.isPending ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 size={13} />
                    <span>Confirm Delete</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
