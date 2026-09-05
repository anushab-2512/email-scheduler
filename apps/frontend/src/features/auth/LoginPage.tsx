import React from 'react';
import { Layers, ShieldCheck, Zap, RefreshCw, Send, AlertCircle } from 'lucide-react';
import { BASE_URL } from '../../lib/api';

export const LoginPage: React.FC = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const error = searchParams.get('error');

  const handleGoogleLogin = () => {
    window.location.href = `${BASE_URL}/auth/google`;
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
          {/* Logo & Header */}
          <div className="text-center mb-8">
            <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-primary to-blue-400 items-center justify-center text-white shadow-xl shadow-primary/30 mb-4">
              <Layers size={30} />
            </div>
            <h1 className="text-2xl font-bold text-foreground tracking-tight">
              ReachInbox Scheduler
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Production-grade distributed email scheduling engine powered by BullMQ and Redis.
            </p>
          </div>

          {/* Error Alert Banner */}
          {error && (
            <div className="flex items-center gap-3 p-3 mb-6 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm animate-in fade-in">
              <AlertCircle size={18} className="shrink-0" />
              <span>
                {error === 'auth_failed'
                  ? 'Google sign-in was not completed or failed. Please try again.'
                  : 'Authentication failed. Please verify your connection.'}
              </span>
            </div>
          )}

          {/* Feature Highlights */}
          <div className="space-y-3 mb-8">
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50 border border-border/50 text-xs">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <RefreshCw size={14} />
              </div>
              <span className="text-muted-foreground font-medium">
                Crash-resilient persistent queueing (No Cron)
              </span>
            </div>
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50 border border-border/50 text-xs">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Zap size={14} />
              </div>
              <span className="text-muted-foreground font-medium">
                Per-sender throttling & hourly rate-limiting
              </span>
            </div>
            <div className="flex items-center gap-3 p-2.5 rounded-lg bg-secondary/50 border border-border/50 text-xs">
              <div className="p-1.5 rounded-md bg-primary/10 text-primary">
                <Send size={14} />
              </div>
              <span className="text-muted-foreground font-medium">
                Real-time Slack alerts & Ethereal SMTP delivery
              </span>
            </div>
          </div>

          {/* Google OAuth Button */}
          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl bg-card hover:bg-accent border border-border shadow-sm text-sm font-semibold text-foreground transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>Sign in with Google</span>
          </button>

          {/* Quick Demo Login */}
          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">or test without oauth</span>
            </div>
          </div>

          <button
            onClick={() => { window.location.href = `${BASE_URL}/auth/demo-login`; }}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-primary/10 hover:bg-primary/20 border border-primary/30 text-sm font-semibold text-primary transition-all hover:scale-[1.01] active:scale-[0.99]"
          >
            <Zap size={16} className="text-amber-500" />
            <span>One-Click Demo Login</span>
          </button>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-6">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Secure session backed by HTTP-only cookies</span>
          </div>
        </div>
      </div>
    </div>
  );
};
