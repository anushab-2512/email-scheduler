import React from 'react';
import { X, Slack, CheckCircle2, AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';
import { useSlackStatus, useDisconnectSlack } from '../../hooks/useSlack';

interface SlackConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SlackConnectModal: React.FC<SlackConnectModalProps> = ({ isOpen, onClose }) => {
  const { data: slack, isLoading } = useSlackStatus();
  const disconnectMutation = useDisconnectSlack();

  if (!isOpen) return null;

  const handleConnect = () => {
    window.location.href = '/api/slack/connect';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-card border border-border w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col">
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
            Connect your Slack workspace to receive instant notifications whenever an email sender reaches its hourly limit and jobs are rescheduled.
          </p>

          {isLoading ? (
            <div className="py-6 flex justify-center">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          ) : slack?.connected ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-start gap-3">
                <CheckCircle2 size={18} className="text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    Connected to {slack.teamName || 'Workspace'}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Hourly rate-limit alerts are actively posted to your incoming webhook channel.
                  </div>
                </div>
              </div>

              <button
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
                className="w-full py-2 px-3 text-xs font-semibold rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors"
              >
                {disconnectMutation.isPending ? 'Disconnecting...' : 'Disconnect Slack'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/10 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                    Not Connected
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Rate limit hits will not notify Slack until connected.
                  </div>
                </div>
              </div>

              <button
                onClick={handleConnect}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold rounded-xl bg-[#4A154B] hover:bg-[#4A154B]/90 text-white transition-all shadow-md shadow-[#4A154B]/20"
              >
                <Slack size={16} />
                <span>Connect with Slack</span>
                <ExternalLink size={12} className="opacity-70" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
