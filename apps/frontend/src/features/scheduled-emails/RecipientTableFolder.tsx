import React, { useEffect, useRef } from 'react';
import { Mail, CheckCircle2, Clock, XCircle, Loader2, Table as TableIcon } from 'lucide-react';
import { useInfiniteRecipients, useEmailEvents } from '../../hooks/useEmails';
import { RecipientItem } from '../../types';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';

export const RecipientTableFolder: React.FC = () => {
  // Listen for real-time SSE updates so table rows reflect live completions
  useEmailEvents();

  const {
    data,
    isLoading,
    isError,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteRecipients(30);

  const observerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!observerRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(observerRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isLoading) {
    return <LoadingSpinner size={32} text="Loading recipient table..." />;
  }

  if (isError) {
    return (
      <div className="p-5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs">
        Failed to load recipient table: {(error as any)?.message || 'Unknown error'}
      </div>
    );
  }

  // Flatten, deduplicate items, and sort newest first
  const allItems = data?.pages.flatMap((page) => page.items) || [];
  const uniqueItems = Array.from(new Map(allItems.map((item) => [item.id, item])).values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  if (uniqueItems.length === 0) {
    return (
      <EmptyState
        icon={TableIcon}
        title="No Recipient Records"
        description="No recipient logs available. Schedule an email campaign to view recipient logs."
      />
    );
  }

  // Format date with seconds: DD/MM/YYYY HH:mm:ss (e.g. 05/09/2026 10:32:45)
  const formatTableDateTime = (dateString: string | Date | null | undefined): string => {
    if (!dateString) return '-';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return '-';
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
  };

  const getStatusBadge = (status: string) => {
    if (status === 'sent') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <CheckCircle2 size={12} />
          <span>Completed</span>
        </span>
      );
    }
    if (status === 'failed') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          <XCircle size={12} />
          <span>Failed</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
        <Clock size={12} className="animate-spin" />
        <span>In Progress</span>
      </span>
    );
  };

  return (
    <div className="space-y-4">
      {/* Sub-Header info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground pb-1">
        <span className="font-semibold text-foreground">
          {uniqueItems.length} Recipient Record{uniqueItems.length === 1 ? '' : 's'} Loaded
        </span>
        <span>Infinite scroll enabled • Live sync</span>
      </div>

      {/* Table Container */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3.5">Email ID</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5">Date &amp; Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {uniqueItems.map((item: RecipientItem) => {
                const isSentOrFailed = item.status === 'sent' || item.status === 'failed';
                const formattedDate = isSentOrFailed
                  ? formatTableDateTime(item.sent_at || item.updated_at)
                  : '-';

                return (
                  <tr key={item.id} className="hover:bg-accent/40 transition-colors">
                    {/* Email ID */}
                    <td className="px-5 py-3 font-medium text-foreground">
                      <div className="flex items-center gap-2">
                        <Mail size={13} className="text-muted-foreground shrink-0" />
                        <span className="font-mono text-xs">{item.recipient_email}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-5 py-3">
                      {getStatusBadge(item.status)}
                    </td>

                    {/* Date & Time with seconds for Completed/Failed, '-' for In Progress */}
                    <td className="px-5 py-3 text-muted-foreground font-mono text-xs whitespace-nowrap">
                      {formattedDate}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Infinite Scroll Trigger & Loader */}
      <div ref={observerRef} className="py-3 flex items-center justify-center">
        {isFetchingNextPage ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 size={15} className="animate-spin text-primary" />
            <span>Loading more recipient records...</span>
          </div>
        ) : hasNextPage ? (
          <button
            onClick={() => fetchNextPage()}
            className="text-xs font-medium text-primary hover:underline"
          >
            Load more recipient records
          </button>
        ) : (
          <span className="text-[11px] text-muted-foreground">
            All recipient records loaded ({uniqueItems.length} total)
          </span>
        )}
      </div>
    </div>
  );
};
