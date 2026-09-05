import React, { useState } from 'react';
import { CheckCircle2, Clock, XCircle, Users, Activity } from 'lucide-react';
import { useCampaigns, useEmailEvents } from '../../hooks/useEmails';
import { CampaignWithStats } from '../../types';
import { formatDate } from '../../lib/utils';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';

export const RecipientDetailsFolder: React.FC = () => {
  // Listen for real-time SSE updates
  useEmailEvents();

  const { data, isLoading, isError } = useCampaigns(1, 50);
  const [statusFilter, setStatusFilter] = useState<'all' | 'in_progress' | 'completed' | 'failed'>('all');

  if (isLoading) {
    return <LoadingSpinner size={32} text="Loading recipient processing status..." />;
  }

  if (isError) {
    return (
      <div className="p-5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs">
        Failed to load recipient details.
      </div>
    );
  }

  const campaigns = data?.items || [];

  // Filter campaigns
  const filteredCampaigns = campaigns.filter((c) => {
    if (statusFilter === 'all') return true;
    return c.status === statusFilter;
  });

  // Summary counts
  const completedCount = campaigns.filter((c) => c.status === 'completed').length;
  const inProgressCount = campaigns.filter((c) => c.status === 'in_progress').length;
  const failedCount = campaigns.filter((c) => c.status === 'failed').length;

  return (
    <div className="space-y-4">
      {/* Folder Header & Real-time indicator */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <h2 className="text-sm font-bold text-foreground tracking-tight">
            Recipient Details
          </h2>
          <span className="flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Activity size={12} className="animate-spin" />
            <span>Live Sync Active</span>
          </span>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1 rounded-lg font-medium transition-colors ${
              statusFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-secondary/60 hover:bg-secondary text-muted-foreground'
            }`}
          >
            All ({campaigns.length})
          </button>
          <button
            onClick={() => setStatusFilter('in_progress')}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors ${
              statusFilter === 'in_progress'
                ? 'bg-amber-500 text-white shadow-sm'
                : 'bg-secondary/60 hover:bg-secondary text-muted-foreground'
            }`}
          >
            <Clock size={12} />
            <span>In Progress ({inProgressCount})</span>
          </button>
          <button
            onClick={() => setStatusFilter('completed')}
            className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors ${
              statusFilter === 'completed'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-secondary/60 hover:bg-secondary text-muted-foreground'
            }`}
          >
            <CheckCircle2 size={12} />
            <span>Completed ({completedCount})</span>
          </button>
          {failedCount > 0 && (
            <button
              onClick={() => setStatusFilter('failed')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg font-medium transition-colors ${
                statusFilter === 'failed'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'bg-secondary/60 hover:bg-secondary text-muted-foreground'
              }`}
            >
              <XCircle size={12} />
              <span>Failed ({failedCount})</span>
            </button>
          )}
        </div>
      </div>

      {/* Cards List */}
      {filteredCampaigns.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Matching Recipient Batches"
          description={
            statusFilter !== 'all'
              ? `No campaigns currently matching status "${statusFilter.replace('_', ' ')}".`
              : 'No recipient details available yet.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCampaigns.map((campaign: CampaignWithStats) => {
            const statusConfig = {
              completed: {
                label: 'Completed',
                icon: CheckCircle2,
                badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
                borderClass: 'border-emerald-500/30',
                barClass: 'bg-emerald-500',
              },
              in_progress: {
                label: 'In Progress',
                icon: Clock,
                badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
                borderClass: 'border-amber-500/30',
                barClass: 'bg-amber-500',
              },
              failed: {
                label: 'Failed',
                icon: XCircle,
                badgeClass: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
                borderClass: 'border-rose-500/30',
                barClass: 'bg-rose-500',
              },
            }[campaign.status];

            const StatusIcon = statusConfig.icon;

            return (
              <div
                key={campaign.id}
                className={`rounded-2xl border bg-card p-4 shadow-sm transition-all hover:shadow-md ${statusConfig.borderClass} flex flex-col justify-between space-y-3`}
              >
                {/* Top: Campaign Reference & Status Badge */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="truncate pr-2">
                      <div className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                        Campaign Reference
                      </div>
                      <h3 className="text-xs font-bold text-foreground truncate mt-0.5" title={campaign.subject}>
                        {campaign.subject}
                      </h3>
                      <div className="text-[11px] text-muted-foreground truncate">
                        Sender: {campaign.sender_email}
                      </div>
                    </div>

                    {/* Status Badge */}
                    <div
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border shrink-0 ${statusConfig.badgeClass}`}
                    >
                      <StatusIcon size={13} className={campaign.status === 'in_progress' ? 'animate-spin' : ''} />
                      <span>{statusConfig.label}</span>
                    </div>
                  </div>
                </div>

                {/* Middle: Progress and Recipient Metrics */}
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">
                      Processed:{' '}
                      <strong className="text-foreground">
                        {campaign.sent_count + campaign.failed_count}
                      </strong>{' '}
                      / {campaign.total_recipients}
                    </span>
                    <span className="font-bold text-xs text-foreground">
                      {campaign.sent_percentage}%
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${statusConfig.barClass}`}
                      style={{ width: `${Math.min(100, Math.max(0, campaign.sent_percentage))}%` }}
                    />
                  </div>

                  {/* Stats Breakdown */}
                  <div className="grid grid-cols-3 gap-1 pt-1 text-[11px] text-center">
                    <div className="p-1.5 rounded-lg bg-secondary/30 border border-border/40">
                      <div className="text-muted-foreground text-[10px]">Sent</div>
                      <div className="font-bold text-emerald-600 dark:text-emerald-400">{campaign.sent_count}</div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-secondary/30 border border-border/40">
                      <div className="text-muted-foreground text-[10px]">Pending</div>
                      <div className="font-bold text-amber-500">{campaign.pending_count}</div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-secondary/30 border border-border/40">
                      <div className="text-muted-foreground text-[10px]">Failed</div>
                      <div className="font-bold text-rose-500">{campaign.failed_count}</div>
                    </div>
                  </div>
                </div>

                {/* Bottom: Timestamp */}
                <div className="pt-2 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>Last Update: {formatDate(campaign.updated_at || campaign.created_at)}</span>
                  <span className="text-foreground/70">
                    Rate: {campaign.hourly_limit}/hr • {Math.round(campaign.delay_ms / 1000)}s
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
