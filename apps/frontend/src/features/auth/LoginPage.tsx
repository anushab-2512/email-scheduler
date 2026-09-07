import React, { useState, useEffect, useRef } from 'react';
import { Layers, ShieldCheck, Zap, RefreshCw, Send, AlertCircle, Loader2, CheckCircle2, Server, Clock } from 'lucide-react';

type ServerState = 'checking' | 'ready' | 'waking' | 'offline';

export const LoginPage: React.FC = () => {
  const searchParams = new URLSearchParams(window.location.search);
  const error = searchParams.get('error');

  const [serverStatus, setServerStatus] = useState<ServerState>('checking');
  const [isWakingUp, setIsWakingUp] = useState(false);
  const [pendingAction, setPendingAction] = useState<'google' | 'demo' | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Ping backend health
  const checkHealth = async (): Promise<boolean> => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);
      const res = await fetch('/api/health', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        setServerStatus('ready');
        return true;
      }
      setServerStatus('waking');
      return false;
    } catch {
      setServerStatus('waking');
      return false;
    }
  };

  // Pre-flight check on mount
  useEffect(() => {
    let isMounted = true;
    let pollInterval: NodeJS.Timeout | null = null;

    const runInitialCheck = async () => {
      const isOk = await checkHealth();
      if (!isOk && isMounted) {
        // Poll every 3 seconds until server responds
        pollInterval = setInterval(async () => {
          const ok = await checkHealth();
          if (ok && pollInterval) {
            clearInterval(pollInterval);
          }
        }, 3000);
      }
    };

    runInitialCheck();

    return () => {
      isMounted = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, []);

  // Timer for cold-start progress
  useEffect(() => {
    if (isWakingUp) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsedSeconds(0);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isWakingUp]);

  // Handle redirect once server becomes ready
  useEffect(() => {
    if (serverStatus === 'ready' && pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      setIsWakingUp(false);
      if (action === 'google') {
        window.location.href = '/api/auth/google';
      } else if (action === 'demo') {
        window.location.href = '/api/auth/demo-login';
      }
    }
  }, [serverStatus, pendingAction]);

  // User initiated action
  const handleAction = async (action: 'google' | 'demo') => {
    if (serverStatus === 'ready') {
      // Re-verify quickly
      const stillOk = await checkHealth();
      if (stillOk) {
        window.location.href = action === 'google' ? '/api/auth/google' : '/api/auth/demo-login';
        return;
      }
    }

    // Server is asleep / waking up: show cold-start loader and poll
    setPendingAction(action);
    setIsWakingUp(true);

    const poll = async () => {
      const ok = await checkHealth();
      if (!ok) {
        setTimeout(poll, 2500);
      }
    };
    poll();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 relative overflow-hidden">
      {/* Background glow accents */}
      <div className="absolute top-1/4 -left-32 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-blue-500/15 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl backdrop-blur-xl">
          {/* Logo & Header */}
          <div className="text-center mb-6">
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

          {/* Cloud Server Status Badge */}
          <div className="mb-6 flex items-center justify-center">
            {serverStatus === 'ready' && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Cloud Backend: Online & Ready</span>
              </div>
            )}
            {serverStatus === 'waking' && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium">
                <Loader2 size={12} className="animate-spin text-amber-500" />
                <span>Cloud Backend: Waking up from sleep (~20s)...</span>
              </div>
            )}
            {serverStatus === 'checking' && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary text-muted-foreground text-xs font-medium border border-border/50">
                <Loader2 size={12} className="animate-spin" />
                <span>Checking cloud server status...</span>
              </div>
            )}
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

          {/* Waking Up Modal / Card Overlay */}
          {isWakingUp ? (
            <div className="p-6 mb-6 rounded-xl bg-secondary/50 border border-primary/20 space-y-4 animate-in fade-in zoom-in-95">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Server size={22} className="animate-pulse" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Starting Cloud Backend
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Render free-tier sleeps when inactive. Booting up instance...
                  </p>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="space-y-1.5">
                <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-primary to-blue-400 h-full rounded-full transition-all duration-1000 ease-out animate-pulse"
                    style={{
                      width: `${Math.min(95, Math.max(15, elapsedSeconds * 4))}%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Clock size={11} /> {elapsedSeconds}s elapsed
                  </span>
                  <span>Auto-redirecting when ready</span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => checkHealth()}
                  className="text-xs text-primary hover:underline font-medium flex items-center gap-1"
                >
                  <RefreshCw size={12} /> Check status now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsWakingUp(false);
                    setPendingAction(null);
                  }}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
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
                onClick={() => handleAction('google')}
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
                <span>Continue with Google</span>
              </button>

              {/* Demo Sign-in Button */}
              <div className="mt-3">
                <button
                  type="button"
                  onClick={() => handleAction('demo')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-secondary/60 hover:bg-secondary text-xs font-semibold text-muted-foreground hover:text-foreground transition-all"
                >
                  <CheckCircle2 size={14} className="text-primary" />
                  <span>Instant Demo Access (Seeded User)</span>
                </button>
              </div>
            </>
          )}

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-6">
            <ShieldCheck size={14} className="text-emerald-500" />
            <span>Secure session backed by HTTP-only cookies</span>
          </div>
        </div>
      </div>
    </div>
  );
};

