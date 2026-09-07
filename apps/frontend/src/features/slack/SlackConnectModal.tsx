import React, { useState } from 'react';
import { X, Slack, CheckCircle2, AlertTriangle, ExternalLink, Loader2, Send, Link as LinkIcon } from 'lucide-react';
import { useSlackStatus, useDisconnectSlack, useSaveSlackWebhook, useSendSlackTest } from '../../hooks/useSlack';

interface SlackConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SlackConnectModal: React.FC<SlackConnectModalProps> = ({ isOpen, onClose }) => {
  const { data: slack, isLoading } = useSlackStatus();
  const disconnectMutation = useDisconnectSlack();
  const saveWebhookMutation = useSaveSlackWebhook();
  const sendTestMutation = useSendSlackTest();

  const [webhookUrl, setWebhookUrl] = useState('');
  const [channelName, setChannelName] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'oauth' | 'webhook'>('oauth');

  if (!isOpen) return null;

  const handleConnectOAuth = () => {
    const token = localStorage.getItem('auth_token');
    const url = token ? `/api/slack/connect?token=${encodeURIComponent(token)}` : '/api/slack/connect';
    window.location.href = url;
  };

  const handleSaveWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    if (!webhookUrl.trim() || !webhookUrl.startsWith('https://hooks.slack.com/')) {
      setSaveError('Please enter a valid Slack webhook URL (must start with https://hooks.slack.com/)');
      return;
    }

    try {
      await saveWebhookMutation.mutateAsync({
        webhookUrl: webhookUrl.trim(),
        channelName: channelName.trim() || undefined,
      });
      setWebhookUrl('');
      setChannelName('');
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save webhook');
    }
  };

  const handleSendTest = async () => {
    setTestResult(null);
    try {
      await sendTestMutation.mutateAsync();
      setTestResult('Test alert sent to your Slack channel!');
      setTimeout(() => setTestResult(null), 5000);
    } catch (err: any) {
      setTestResult(`Failed: ${err?.message || 'Could not send test message'}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card border border-border w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Slack size={20} className="text-primary" />
            <h2 className="text-base font-bold text-foreground">Slack Integration</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Receive automated real-time alerts whenever a sender reaches its hourly limit and emails are rescheduled.
          </p>

          {isLoading ? (
            <div className="py-6 flex justify-center">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : slack?.connected ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Connected to {slack.teamName || 'Workspace'}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Hourly rate-limit alerts are actively posted to your incoming webhook channel.
                  </div>
                </div>
              </div>

              {testResult && (
                <div className={`p-3 rounded-lg text-xs ${testResult.startsWith('Failed') ? 'bg-destructive/10 text-destructive border border-destructive/20' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'}`}>
                  {testResult}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSendTest}
                  disabled={sendTestMutation.isPending}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-colors border border-border disabled:opacity-50"
                >
                  {sendTestMutation.isPending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <Send size={13} />
                  )}
                  <span>Send Test Alert</span>
                </button>

                <button
                  type="button"
                  onClick={() => disconnectMutation.mutate()}
                  disabled={disconnectMutation.isPending}
                  className="py-2 px-4 text-xs font-semibold rounded-xl border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                >
                  {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl border border-amber-500/20 bg-amber-500/10 flex items-start gap-3">
                <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    Not Connected
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Choose either standard OAuth or paste a Slack Incoming Webhook URL.
                  </div>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex rounded-xl bg-secondary/50 p-1 border border-border text-xs">
                <button
                  type="button"
                  onClick={() => setActiveTab('oauth')}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${activeTab === 'oauth' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Slack OAuth Flow
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('webhook')}
                  className={`flex-1 py-1.5 rounded-lg font-medium transition-colors ${activeTab === 'webhook' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  Direct Webhook URL
                </button>
              </div>

              {activeTab === 'oauth' ? (
                <div className="space-y-3 pt-1">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Authorize via Slack to automatically generate a secure webhook for your selected channel.
                  </p>
                  <button
                    type="button"
                    onClick={handleConnectOAuth}
                    className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-xl bg-[#4A154B] hover:bg-[#4A154B]/90 text-white transition-all shadow-md shadow-[#4A154B]/20"
                  >
                    <Slack size={16} />
                    <span>Connect with Slack (OAuth)</span>
                    <ExternalLink size={12} className="opacity-70" />
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSaveWebhook} className="space-y-3 pt-1">
                  {saveError && (
                    <div className="p-2.5 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 text-xs">
                      {saveError}
                    </div>
                  )}
                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                      Incoming Webhook URL <span className="text-destructive">*</span>
                    </label>
                    <div className="relative">
                      <LinkIcon size={14} className="absolute left-3 top-2.5 text-muted-foreground" />
                      <input
                        type="url"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                        placeholder="https://hooks.slack.com/services/T00/B00/XXXX"
                        className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        required
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
                      Channel or Workspace Label (Optional)
                    </label>
                    <input
                      type="text"
                      value={channelName}
                      onChange={(e) => setChannelName(e.target.value)}
                      placeholder="e.g. #email-alerts"
                      className="w-full px-3 py-2 text-xs rounded-xl border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={saveWebhookMutation.isPending}
                    className="w-full py-2.5 px-4 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-all shadow-sm disabled:opacity-50"
                  >
                    {saveWebhookMutation.isPending ? 'Connecting...' : 'Save Webhook & Connect'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

