import React from 'react';
import { User, LogOut, Layers, Slack, ExternalLink } from 'lucide-react';
import { useCurrentUser, useLogout } from '../../hooks/useAuth';
import { useSlackStatus } from '../../hooks/useSlack';
import { ThemeToggle } from './ThemeToggle';

interface NavbarProps {
  onOpenSlackModal?: () => void;
  onOpenSenderModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenSlackModal, onOpenSenderModal }) => {
  const { data: user } = useCurrentUser();
  const { data: slack } = useSlackStatus();
  const logout = useLogout();

  const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const bullBoardUrl = import.meta.env.VITE_BULL_BOARD_URL || (isLocal ? 'http://localhost:4000/admin/queues' : 'https://email-scheduler-tehc.onrender.com/admin/queues');

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-blue-400 flex items-center justify-center text-white shadow-lg shadow-primary/25">
            <Layers size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text">
                ReachInbox
              </span>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                Scheduler
              </span>
            </div>
          </div>
        </div>

        {/* Center / Actions */}
        <div className="flex items-center gap-3">
          {/* Senders button */}
          <button
            onClick={onOpenSenderModal}
            className="text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-colors"
          >
            Manage Senders
          </button>

          {/* Bull Board link */}
          <a
            href={bullBoardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-colors"
            title="Open Bull Board live queue monitoring"
          >
            <span>Bull Board</span>
            <ExternalLink size={12} className="text-muted-foreground" />
          </a>

          {/* Slack status / Connect */}
          <button
            onClick={onOpenSlackModal}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-accent text-foreground transition-colors"
          >
            <Slack size={14} className={slack?.connected ? 'text-emerald-500' : 'text-muted-foreground'} />
            <span>{slack?.connected ? `Slack: ${slack.teamName || 'Connected'}` : 'Connect Slack'}</span>
            <span
              className={`w-2 h-2 rounded-full ${
                slack?.connected ? 'bg-emerald-500 shadow-sm shadow-emerald-500/50' : 'bg-muted-foreground/40'
              }`}
            />
          </button>

          <ThemeToggle />

          {/* User profile & logout */}
          {user && (
            <div className="flex items-center gap-3 pl-3 border-l border-border">
              <div className="flex items-center gap-2.5">
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.name}
                    className="w-8 h-8 rounded-full border border-border object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-medium text-xs border border-primary/20">
                    <User size={14} />
                  </div>
                )}
                <div className="hidden sm:block text-left">
                  <div className="text-xs font-semibold text-foreground leading-none">{user.name}</div>
                  <div className="text-[11px] text-muted-foreground leading-none mt-1">{user.email}</div>
                </div>
              </div>

              <button
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
