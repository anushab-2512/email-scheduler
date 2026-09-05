import React, { useState } from 'react';
import { Clock, Calendar, Mail, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useScheduledEmails } from '../../hooks/useEmails';
import { StatusBadge } from '../../components/common/Badge';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { formatDate, truncate } from '../../lib/utils';

export const ScheduledEmailsTable: React.FC = () => {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, error } = useScheduledEmails(page, 20);

  if (isLoading) {
    return <LoadingSpinner size={32} text="Loading scheduled queue from MySQL & BullMQ..." />;
  }

  if (isError) {
    return (
      <div className="p-6 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm flex items-center gap-2">
        <AlertCircle size={18} />
        <span>Failed to load scheduled mails: {(error as any)?.message || 'Unknown error'}</span>
      </div>
    );
  }

  const emails = data?.items || [];
  const total = data?.total || 0;
  const totalPages = data?.totalPages || 1;

  if (emails.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title="No scheduled mails"
        description="There are currently no pending or delayed email jobs in the queue. Click 'Compose New Email' above to schedule your first batch."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Subject</th>
                <th className="px-4 py-3">Scheduled At</th>
                <th className="px-4 py-3">BullMQ Job ID</th>
                <th className="px-4 py-3 text-right">Status</th>
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
                      <span>{formatDate(email.scheduled_at)}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-muted-foreground">
                    {email.bull_job_id || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <StatusBadge status={email.status} />
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
            Showing page {page} of {totalPages} ({total} total scheduled)
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
    </div>
  );
};
