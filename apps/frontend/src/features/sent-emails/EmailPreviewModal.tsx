import React, { useEffect, useRef } from 'react';
import { X, Mail, Calendar, User, AlertCircle, Eye, ArrowLeft } from 'lucide-react';
import { useEmailPreview } from '../../hooks/useEmails';
import { StatusBadge } from '../../components/common/Badge';
import { LoadingSpinner } from '../../components/common/LoadingSpinner';
import { formatDate } from '../../lib/utils';

interface EmailPreviewModalProps {
  emailId: string | null;
  onClose: () => void;
}

export const EmailPreviewModal: React.FC<EmailPreviewModalProps> = ({ emailId, onClose }) => {
  const { data: email, isLoading, isError, error } = useEmailPreview(emailId);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Adjust iframe height dynamically if HTML body is present
  useEffect(() => {
    if (iframeRef.current && email?.body) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        // Inject readable base styling for HTML email rendering
        const isDark = document.documentElement.classList.contains('dark');
        const bg = isDark ? '#18181b' : '#ffffff';
        const color = isDark ? '#f4f4f5' : '#18181b';
        const linkColor = isDark ? '#60a5fa' : '#2563eb';

        const style = doc.createElement('style');
        style.textContent = `
          body {
            margin: 0;
            padding: 16px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 14px;
            line-height: 1.6;
            color: ${color};
            background-color: ${bg};
            word-break: break-word;
          }
          a { color: ${linkColor}; text-decoration: underline; }
          img { max-width: 100%; height: auto; }
          table { max-width: 100%; border-collapse: collapse; }
        `;
        doc.head.appendChild(style);

        // Adjust height after render
        const updateHeight = () => {
          if (iframeRef.current && doc.body) {
            iframeRef.current.style.height = `${Math.max(160, doc.body.scrollHeight + 20)}px`;
          }
        };
        updateHeight();
        setTimeout(updateHeight, 150);
      }
    }
  }, [email?.body]);

  if (!emailId) return null;

  const isHtml = email?.body ? /<[a-z][\s\S]*>/i.test(email.body) : false;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-secondary/30">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
              <Eye size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-foreground">Email Preview</h2>
              <p className="text-xs text-muted-foreground">Direct view of the dispatched email record</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Close preview"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {isLoading ? (
            <div className="py-16 flex flex-col items-center justify-center">
              <LoadingSpinner size={32} text="Fetching email preview from database..." />
            </div>
          ) : isError || !email ? (
            <div className="py-12 px-4 text-center space-y-3">
              <div className="inline-flex p-3 rounded-2xl bg-destructive/10 text-destructive border border-destructive/20">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">
                {(error as any)?.message?.includes('not found') ? 'Email not found.' : 'Preview unavailable for this email.'}
              </h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Unable to load the email details. The record might have been removed or you do not have permission to view it.
              </p>
            </div>
          ) : (
            <>
              {/* Metadata Card */}
              <div className="rounded-xl border border-border bg-secondary/40 p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* To */}
                  <div className="flex items-start gap-2">
                    <Mail size={15} className="text-primary shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <span className="text-muted-foreground font-medium block">To:</span>
                      <span className="text-foreground font-semibold break-all">{email.recipient_email}</span>
                    </div>
                  </div>

                  {/* From (if sender info available) */}
                  {email.sender_email && (
                    <div className="flex items-start gap-2">
                      <User size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <span className="text-muted-foreground font-medium block">From:</span>
                        <span className="text-foreground font-medium break-all">
                          {email.sender_name ? `${email.sender_name} <${email.sender_email}>` : email.sender_email}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Sent Date */}
                  <div className="flex items-start gap-2">
                    <Calendar size={15} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <span className="text-muted-foreground font-medium block">Sent:</span>
                      <span className="text-foreground">
                        {email.sent_at ? formatDate(email.sent_at) : 'Not recorded'}
                      </span>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="flex items-start gap-2">
                    <div className="min-w-0">
                      <span className="text-muted-foreground font-medium block mb-1">Status:</span>
                      <StatusBadge status={email.status} />
                    </div>
                  </div>
                </div>

                {/* Subject */}
                <div className="pt-2 border-t border-border/60">
                  <span className="text-xs text-muted-foreground font-medium block mb-0.5">Subject:</span>
                  <div className="text-sm font-bold text-foreground">
                    {email.subject || '(No Subject)'}
                  </div>
                </div>
              </div>

              {/* Email Body */}
              <div className="space-y-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Email Content
                </span>
                <div className="rounded-xl border border-border bg-card p-4 min-h-[140px] overflow-hidden">
                  {isHtml ? (
                    <iframe
                      ref={iframeRef}
                      srcDoc={email.body}
                      title="Email Body Preview"
                      sandbox="allow-same-origin"
                      className="w-full border-0 bg-transparent min-h-[160px]"
                    />
                  ) : (
                    <div className="text-sm text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                      {email.body || '(Empty email body)'}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-border flex items-center justify-between bg-secondary/20">
          <span className="text-[11px] text-muted-foreground">
            {email?.id ? `Message ID: ${email.id}` : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-all flex items-center gap-1.5"
          >
            <ArrowLeft size={13} />
            <span>Close</span>
          </button>
        </div>
      </div>
    </div>
  );
};
