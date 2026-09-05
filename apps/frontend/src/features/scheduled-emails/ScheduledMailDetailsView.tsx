import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Mail,
  Paperclip,
  Users,
  Clock,
  Calendar,
  Gauge,
  Timer,
  CheckCircle2,
  XCircle,
  Download,
  Eye,
  Trash2,
  Loader2,
  AlertCircle,
  Table as TableIcon,
  Activity,
  X,
  FileText,
  File,
  Image as ImageIcon,
} from 'lucide-react';
import { useCampaign, useInfiniteCampaignRecipients, useDeleteCampaign, useEmailEvents } from '../../hooks/useEmails';
import { RecipientItem, EmailAttachment } from '../../types';
import { formatFullDateTime } from '../../lib/utils';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { EmptyState } from '../../components/common/EmptyState';
import { useToast } from '../../components/common/Toast';

interface ScheduledMailDetailsViewProps {
  campaignId?: string;
  onBack?: () => void;
}

export const ScheduledMailDetailsView: React.FC<ScheduledMailDetailsViewProps> = ({
  campaignId: propCampaignId,
  onBack,
}) => {
  const navigate = useNavigate();
  const routeParams = useParams<{ id: string }>();
  const campaignId = propCampaignId || routeParams.id;

  const { success: toastSuccess, error: toastError } = useToast();
  const deleteMutation = useDeleteCampaign();

  // Listen to real-time status updates via SSE
  useEmailEvents();

  // Fetch campaign details with stats & attachments
  const {
    data: campaign,
    isLoading: isCampaignLoading,
    isError: isCampaignError,
    error: campaignError,
  } = useCampaign(campaignId);

  // Fetch paginated recipient rows scoped strictly to this campaign
  const {
    data: recipientsData,
    isLoading: isRecipientsLoading,
    isError: isRecipientsError,
    error: recipientsError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteCampaignRecipients(campaignId, 30);

  // Modals state
  const [previewAttachment, setPreviewAttachment] = useState<EmailAttachment | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  // Infinite scroll observer for recipient table
  const tableObserverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!tableObserverRef.current || !hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );

    observer.observe(tableObserverRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/dashboard');
    }
  };

  const handleDelete = async () => {
    if (!campaignId) return;
    try {
      await deleteMutation.mutateAsync(campaignId);
      toastSuccess('Scheduled mail deleted successfully.');
      setShowDeleteModal(false);
      handleBack();
    } catch (err: any) {
      toastError(err?.message || 'Failed to delete scheduled mail.');
    }
  };

  const handleDownloadAttachment = (att: EmailAttachment) => {
    try {
      const byteCharacters = atob(att.content);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: att.contentType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = att.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch {
      toastError(`Failed to download ${att.filename}`);
    }
  };

  const getAttachmentIcon = (filename: string, contentType: string) => {
    if (contentType?.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename)) {
      return <ImageIcon size={15} className="text-blue-500" />;
    }
    if (filename.endsWith('.pdf') || contentType?.includes('pdf')) {
      return <FileText size={15} className="text-rose-500" />;
    }
    return <File size={15} className="text-muted-foreground" />;
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (!campaignId) {
    return (
      <div className="p-8 text-center space-y-4">
        <p className="text-sm text-destructive">No email campaign specified.</p>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
        >
          <ArrowLeft size={14} />
          <span>Back to Scheduled Mails</span>
        </button>
      </div>
    );
  }

  if (isCampaignLoading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center">
        <LoadingSpinner size={36} text="Loading email details..." />
      </div>
    );
  }

  if (isCampaignError || !campaign) {
    return (
      <div className="space-y-4 p-6 rounded-2xl border border-destructive/20 bg-destructive/10 text-destructive">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <AlertCircle size={18} />
          <span>Failed to load email details: {(campaignError as any)?.message || 'Not found'}</span>
        </div>
        <button
          onClick={handleBack}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-destructive text-white text-xs font-semibold hover:bg-destructive/90 transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Return to Scheduled Mails</span>
        </button>
      </div>
    );
  }

  // Deduplicate and prepare recipient rows
  const allRecipientItems = recipientsData?.pages.flatMap((page) => page.items) || [];
  const uniqueRecipientItems = Array.from(new Map(allRecipientItems.map((item) => [item.id, item])).values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const attachments = campaign.attachments || [];
  const totalRecipients = campaign.total_recipients || 0;
  const sentPercentage = campaign.sent_percentage;
  const delaySec = Math.round(campaign.delay_ms / 1000);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* TOP NAVIGATION / HEADER BAR */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-border bg-card hover:bg-secondary text-foreground text-xs font-semibold transition-all shadow-sm group"
          >
            <ArrowLeft size={15} className="group-hover:-translate-x-0.5 transition-transform" />
            <span>Back to Scheduled Mails</span>
          </button>
          <div className="h-4 w-[1px] bg-border hidden sm:block" />
          <h1 className="text-base sm:text-lg font-extrabold text-foreground tracking-tight flex items-center gap-2">
            <span>EMAIL DETAILS</span>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                campaign.status === 'completed'
                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                  : campaign.status === 'failed'
                  ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
              }`}
            >
              {campaign.status.replace('_', ' ')}
            </span>
          </h1>
        </div>

        <button
          type="button"
          onClick={() => setShowDeleteModal(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white transition-colors text-xs font-semibold self-end sm:self-auto"
        >
          <Trash2 size={14} />
          <span>Delete Mail</span>
        </button>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* SCREEN 2 — SECTION 1: FULL EMAIL DETAILS CARD             */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-6">
        {/* Sender & Metadata bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-border/50 text-xs">
          <div className="space-y-0.5">
            <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              Sender
            </span>
            <div className="flex items-center gap-2 text-foreground font-semibold">
              <Mail size={15} className="text-primary shrink-0" />
              <span>{campaign.sender_email}</span>
              {campaign.sender_name && campaign.sender_name !== campaign.sender_email && (
                <span className="text-muted-foreground font-normal">({campaign.sender_name})</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Calendar size={14} />
            <span>Created: {formatFullDateTime(campaign.created_at, false)}</span>
          </div>
        </div>

        {/* Full Subject */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Subject
          </label>
          <h2 className="text-base sm:text-lg font-bold text-foreground leading-snug">
            {campaign.subject}
          </h2>
        </div>

        {/* Full Body */}
        <div className="space-y-1.5">
          <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
            Body
          </label>
          <div className="p-4 rounded-xl border border-border/70 bg-secondary/15 text-foreground text-xs leading-relaxed whitespace-pre-wrap font-sans">
            {campaign.body}
          </div>
        </div>

        {/* Attachments Section */}
        <div className="space-y-2 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs font-bold text-foreground">
            <Paperclip size={15} className="text-primary" />
            <span>
              Attachments: {attachments.length > 0 ? `📎 ${attachments.length}` : '0'}
            </span>
          </div>

          {attachments.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">No attachments attached to this composed email.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
              {attachments.map((att, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl border border-border bg-secondary/20 hover:bg-secondary/40 transition-colors flex flex-col justify-between space-y-2.5"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-lg bg-card border border-border/60 shrink-0">
                      {getAttachmentIcon(att.filename, att.contentType)}
                    </div>
                    <div className="truncate min-w-0">
                      <div className="text-xs font-semibold text-foreground truncate" title={att.filename}>
                        {att.filename}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {formatFileSize(att.size)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-border/40 text-xs">
                    <button
                      type="button"
                      onClick={() => setPreviewAttachment(att)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border border-border bg-card hover:bg-secondary text-foreground text-[11px] font-medium transition-colors"
                    >
                      <Eye size={13} />
                      <span>View</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadAttachment(att)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-[11px] font-medium transition-colors shadow-sm"
                    >
                      <Download size={13} />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Campaign Metrics Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-border/50 text-xs">
          <div className="p-3 rounded-xl bg-secondary/25 border border-border/40 space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Users size={12} />
              <span>Recipients</span>
            </span>
            <div className="text-sm font-bold text-foreground">
              {totalRecipients}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-secondary/25 border border-border/40 space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Activity size={12} />
              <span>Sent Rate</span>
            </span>
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-foreground">{sentPercentage}%</span>
              <span className="text-[10px] text-muted-foreground">
                ({campaign.sent_count}/{totalRecipients})
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden mt-1">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  campaign.status === 'completed'
                    ? 'bg-emerald-500'
                    : campaign.status === 'failed'
                    ? 'bg-rose-500'
                    : 'bg-primary'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, sentPercentage))}%` }}
              />
            </div>
          </div>

          <div className="p-3 rounded-xl bg-secondary/25 border border-border/40 space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Gauge size={12} />
              <span>Hourly Limit</span>
            </span>
            <div className="text-sm font-bold text-foreground">
              {campaign.hourly_limit}/hr
            </div>
          </div>

          <div className="p-3 rounded-xl bg-secondary/25 border border-border/40 space-y-1">
            <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
              <Timer size={12} />
              <span>Delay</span>
            </span>
            <div className="text-sm font-bold text-foreground">
              {delaySec} sec
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* SCREEN 2 — SECTION 2: RECIPIENT DETAILS (STATUS CARDS)    */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Recipient Details
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Live recipient dispatch status cards updated live via BullMQ &amp; SSE
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <Activity size={13} className="animate-spin text-emerald-500" />
              <span>Live Sync Active</span>
            </span>
          </div>
        </div>

        {/* 3 Dedicated Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
          {/* 1. COMPLETED CARD */}
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                Completed
              </span>
              <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={16} />
              </div>
            </div>

            <div>
              <div className="text-2xl font-extrabold text-foreground tracking-tight">
                {campaign.sent_count}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {totalRecipients > 0
                  ? `${Math.round((campaign.sent_count / totalRecipients) * 100)}% of total recipients`
                  : '0% sent'}
              </p>
            </div>

            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    totalRecipients > 0 ? Math.round((campaign.sent_count / totalRecipients) * 100) : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* 2. IN PROGRESS CARD */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
                In Progress
              </span>
              <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <Clock size={16} className={campaign.pending_count > 0 ? 'animate-spin' : ''} />
              </div>
            </div>

            <div>
              <div className="text-2xl font-extrabold text-foreground tracking-tight">
                {campaign.pending_count}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {totalRecipients > 0
                  ? `${Math.round((campaign.pending_count / totalRecipients) * 100)}% in dispatch queue`
                  : '0 pending'}
              </p>
            </div>

            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-amber-500 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    totalRecipients > 0 ? Math.round((campaign.pending_count / totalRecipients) * 100) : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* 3. FAILED CARD */}
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 space-y-3 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                Failed
              </span>
              <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <XCircle size={16} />
              </div>
            </div>

            <div>
              <div className="text-2xl font-extrabold text-foreground tracking-tight">
                {campaign.failed_count}
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {totalRecipients > 0
                  ? `${Math.round((campaign.failed_count / totalRecipients) * 100)}% delivery errors`
                  : '0 errors'}
              </p>
            </div>

            <div className="w-full h-1.5 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-500"
                style={{
                  width: `${
                    totalRecipients > 0 ? Math.round((campaign.failed_count / totalRecipients) * 100) : 0
                  }%`,
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ────────────────────────────────────────────────────────── */}
      {/* SCREEN 2 — SECTION 3: RECIPIENT TABLE                     */}
      {/* ────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
              <TableIcon size={18} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
                Table
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Recipient-level delivery ledger with exact timestamps and infinite scroll
              </p>
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            Showing <strong className="text-foreground">{uniqueRecipientItems.length}</strong> of{' '}
            <strong className="text-foreground">{totalRecipients}</strong> recipient logs
          </div>
        </div>

        {isRecipientsLoading ? (
          <div className="py-8 flex items-center justify-center">
            <LoadingSpinner size={28} text="Loading recipient records..." />
          </div>
        ) : isRecipientsError ? (
          <div className="p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-xs">
            Failed to load recipient table: {(recipientsError as any)?.message || 'Unknown error'}
          </div>
        ) : uniqueRecipientItems.length === 0 ? (
          <EmptyState
            icon={TableIcon}
            title="No Recipient Records Found"
            description="No recipient records found for this composed email."
          />
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-secondary/40 border-b border-border text-muted-foreground font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="px-5 py-3">Email ID</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Date &amp; Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {uniqueRecipientItems.map((item: RecipientItem) => {
                      const isSent = item.status === 'sent';
                      const isFailed = item.status === 'failed';
                      const isInProgress = !isSent && !isFailed;

                      return (
                        <tr key={item.id} className="hover:bg-accent/40 transition-colors">
                          {/* Email ID */}
                          <td className="px-5 py-3.5 font-medium text-foreground">
                            <div className="flex items-center gap-2">
                              <Mail size={13} className="text-muted-foreground shrink-0" />
                              <span className="font-mono text-xs">{item.recipient_email}</span>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-5 py-3.5">
                            {isSent ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 size={12} />
                                <span>Completed</span>
                              </span>
                            ) : isFailed ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
                                <XCircle size={12} />
                                <span>Failed</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                                <Clock size={12} className="animate-spin" />
                                <span>In Progress</span>
                              </span>
                            )}
                          </td>

                          {/* Date & Time:
                              Completed and Failed: exact date & time with seconds (e.g. 05 Sep 2026, 10:32:45 AM)
                              In Progress: '-'
                          */}
                          <td className="px-5 py-3.5 text-muted-foreground font-mono text-xs whitespace-nowrap">
                            {isInProgress ? '-' : formatFullDateTime(item.sent_at || item.updated_at, true)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Table Infinite Scroll Observer */}
            <div ref={tableObserverRef} className="py-3 flex items-center justify-center">
              {isFetchingNextPage ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 size={14} className="animate-spin text-primary" />
                  <span>Loading more recipient logs...</span>
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
                  All recipient logs loaded for this email ({uniqueRecipientItems.length} total)
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ATTACHMENT PREVIEW MODAL */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-card border border-border w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2 truncate pr-2">
                {getAttachmentIcon(previewAttachment.filename, previewAttachment.contentType)}
                <span className="text-xs font-bold text-foreground truncate">
                  {previewAttachment.filename}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  ({formatFileSize(previewAttachment.size)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadAttachment(previewAttachment)}
                  className="p-1.5 rounded-lg border border-border hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  title="Download file"
                >
                  <Download size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-secondary/20 min-h-[300px]">
              {previewAttachment.contentType?.startsWith('image/') ||
              /\.(png|jpe?g|gif|webp|svg)$/i.test(previewAttachment.filename) ? (
                <img
                  src={`data:${previewAttachment.contentType || 'image/png'};base64,${previewAttachment.content}`}
                  alt={previewAttachment.filename}
                  className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-sm"
                />
              ) : previewAttachment.filename.endsWith('.pdf') || previewAttachment.contentType?.includes('pdf') ? (
                <iframe
                  src={`data:application/pdf;base64,${previewAttachment.content}`}
                  title={previewAttachment.filename}
                  className="w-full h-[70vh] rounded-lg border border-border"
                />
              ) : (
                <div className="text-center space-y-3 p-6">
                  <FileText size={48} className="mx-auto text-muted-foreground opacity-60" />
                  <p className="text-xs text-muted-foreground">
                    Inline preview not supported for this file format.
                  </p>
                  <button
                    type="button"
                    onClick={() => handleDownloadAttachment(previewAttachment)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                  >
                    <Download size={14} />
                    <span>Download to View</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
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
              <span className="font-semibold">{campaign.subject}</span>
              <div className="text-muted-foreground text-[11px] mt-0.5">
                {totalRecipients} recipients • {campaign.sender_email}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 rounded-xl border border-border hover:bg-secondary text-muted-foreground text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleteMutation.isPending}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition-colors shadow-sm disabled:opacity-50"
              >
                {deleteMutation.isPending ? (
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
