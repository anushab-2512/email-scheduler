import React, { useState } from 'react';
import { X, Upload, FileText, CheckCircle2, AlertCircle, Loader2, Paperclip, File, Image as ImageIcon } from 'lucide-react';
import { useSenders } from '../../hooks/useSenders';
import { useScheduleEmails, useParseCsv } from '../../hooks/useEmails';
import { EmailAttachment } from '../../types';

interface ComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface SelectedAttachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  content: string; // Base64
}

export const ComposeModal: React.FC<ComposeModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { data: senders, isLoading: sendersLoading } = useSenders();
  const scheduleMutation = useScheduleEmails();
  const parseCsvMutation = useParseCsv();

  const [senderId, setSenderId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [parsedEmails, setParsedEmails] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<SelectedAttachment[]>([]);
  const [startTime, setStartTime] = useState(() => {
    // Default to 1 minute in future
    const d = new Date(Date.now() + 60000);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  });
  const [delaySec, setDelaySec] = useState(2); // 2 seconds
  const [hourlyLimit, setHourlyLimit] = useState(200); // 200/hr
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);

    try {
      const result = await parseCsvMutation.mutateAsync(file);
      setParsedEmails(result.emails);
      if (result.emails.length === 0) {
        setError('No valid email addresses found in the uploaded file.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to parse file.');
    }
  };

  const handleRemoveFile = () => {
    setFileName(null);
    setParsedEmails([]);
    setError(null);
  };

  const handleAttachmentUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setError(null);
    const newItems: SelectedAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const res = reader.result as string;
            const data = res.split(',')[1] || res;
            resolve(data);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newItems.push({
          id: Math.random().toString(36).substring(2, 9),
          filename: file.name,
          contentType: file.type || 'application/octet-stream',
          size: file.size,
          content: base64,
        });
      } catch {
        setError(`Failed to read attachment: ${file.name}`);
      }
    }

    setAttachments((prev) => [...prev, ...newItems]);
    e.target.value = '';
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getAttachmentIcon = (filename: string, contentType: string) => {
    if (contentType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/i.test(filename)) {
      return <ImageIcon size={14} className="text-blue-500" />;
    }
    if (filename.endsWith('.pdf') || contentType.includes('pdf')) {
      return <FileText size={14} className="text-rose-500" />;
    }
    return <File size={14} className="text-muted-foreground" />;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);

    const selectedSender = senderId || (senders && senders[0]?.id);
    if (!selectedSender) {
      setError('Please select or configure an email sender.');
      return;
    }

    if (parsedEmails.length === 0) {
      setError('Please upload a CSV or text file containing recipient email addresses.');
      return;
    }

    try {
      const payloadAttachments: EmailAttachment[] = attachments.map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        size: a.size,
        content: a.content,
      }));

      await scheduleMutation.mutateAsync({
        sender_id: selectedSender,
        subject,
        body,
        recipients: parsedEmails,
        start_time: new Date(startTime).toISOString(),
        delay_ms: delaySec * 1000,
        hourly_limit: hourlyLimit,
        attachments: payloadAttachments.length > 0 ? payloadAttachments : undefined,
      });

      setSuccessMessage(`Successfully scheduled ${parsedEmails.length} email(s)!`);
      setTimeout(() => {
        onClose();
        if (onSuccess) onSuccess();
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to schedule campaign.');
    }
  };

  const isFormValid =
    subject.trim() !== '' &&
    body.trim() !== '' &&
    parsedEmails.length > 0 &&
    (senderId || (senders && senders.length > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card border border-border w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-foreground">Compose & Schedule Email</h2>
            <p className="text-xs text-muted-foreground">Configure BullMQ delayed jobs with throttling & optional attachments</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 size={16} />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Sender Dropdown */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              From Sender Identity
            </label>
            {sendersLoading ? (
              <div className="text-xs text-muted-foreground">Loading senders...</div>
            ) : senders && senders.length > 0 ? (
              <select
                value={senderId || senders[0]?.id}
                onChange={(e) => setSenderId(e.target.value)}
                className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {senders.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.email})
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-rose-500">
                No active senders found. Please add a sender first via "Manage Senders".
              </p>
            )}
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Email Subject
            </label>
            <input
              type="text"
              placeholder="e.g. Transforming cold email outreach with AI"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Body */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Email Body (HTML supported)
            </label>
            <textarea
              placeholder="Hello, I noticed your team is looking to transform cold email workflows..."
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              className="w-full text-xs rounded-lg border border-input bg-background px-3 py-2 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          {/* Optional Attachments Field */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Paperclip size={13} className="text-muted-foreground" />
                <span>Attachments</span>
                <span className="text-[10px] font-normal text-muted-foreground">(Optional)</span>
              </label>
              <label className="cursor-pointer text-[11px] font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
                <span>+ Add files</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*,.doc,.docx,.txt,.csv,.zip"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
              </label>
            </div>

            {attachments.length === 0 ? (
              <label className="border border-dashed border-border hover:border-primary/40 transition-colors rounded-xl p-3 flex items-center justify-center gap-2 cursor-pointer bg-secondary/10 text-muted-foreground text-xs">
                <Paperclip size={14} />
                <span>Click or drag files here (PDF, Images, Word, etc.) — Optional</span>
                <input
                  type="file"
                  multiple
                  accept=".pdf,image/*,.doc,.docx,.txt,.csv,.zip"
                  onChange={handleAttachmentUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="space-y-1.5">
                <div className="flex flex-wrap gap-2">
                  {attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-secondary/30 text-xs text-foreground group"
                    >
                      {getAttachmentIcon(att.filename, att.contentType)}
                      <span className="max-w-[140px] truncate font-medium">{att.filename}</span>
                      <span className="text-[10px] text-muted-foreground">({formatFileSize(att.size)})</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAttachment(att.id)}
                        className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Remove attachment"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {attachments.length} file(s) attached. You can remove any file before scheduling.
                </p>
              </div>
            )}
          </div>

          {/* CSV Upload */}
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              Recipient Leads (CSV or Text File)
            </label>
            {!fileName ? (
              <label className="border-2 border-dashed border-border hover:border-primary/50 transition-colors rounded-xl p-4 flex flex-col items-center justify-center cursor-pointer bg-secondary/30">
                <Upload size={20} className="text-muted-foreground mb-1" />
                <span className="text-xs font-medium text-foreground">Click to upload leads file</span>
                <span className="text-[11px] text-muted-foreground mt-0.5">.csv, .txt with email addresses</span>
                <input
                  type="file"
                  accept=".csv,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-secondary/40">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">
                    <FileText size={18} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-foreground">{fileName}</div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                      {parseCsvMutation.isPending
                        ? 'Parsing email addresses...'
                        : `${parsedEmails.length} email addresses detected`}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRemoveFile}
                  className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                >
                  <X size={16} />
                </button>
              </div>
            )}
          </div>

          {/* Scheduler Parameters Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
            <div>
              <label className="block text-[11px] font-semibold text-foreground mb-1">
                Start Time
              </label>
              <input
                type="datetime-local"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full text-xs rounded-lg border border-input bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                required
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-foreground mb-1">
                Delay Between Emails (sec)
              </label>
              <input
                type="number"
                min="0"
                max="60"
                value={delaySec}
                onChange={(e) => setDelaySec(parseInt(e.target.value) || 0)}
                className="w-full text-xs rounded-lg border border-input bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-foreground mb-1">
                Hourly Limit (Demo / Prod)
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                value={hourlyLimit}
                onChange={(e) => setHourlyLimit(parseInt(e.target.value) || 1)}
                className="w-full text-xs rounded-lg border border-input bg-background px-2.5 py-1.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-lg border border-border hover:bg-secondary text-muted-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isFormValid || scheduleMutation.isPending}
              className="flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-md shadow-primary/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {scheduleMutation.isPending ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Scheduling Jobs...</span>
                </>
              ) : (
                <span>Schedule Campaign ({parsedEmails.length} emails{attachments.length > 0 ? `, ${attachments.length} attachment(s)` : ''})</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
