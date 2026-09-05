import React from 'react';
import { cn } from '../../lib/utils';
import { EmailStatus } from '../../types';

interface BadgeProps {
  status: EmailStatus | string;
  className?: string;
}

export const StatusBadge: React.FC<BadgeProps> = ({ status, className }) => {
  const getStyles = () => {
    switch (status.toLowerCase()) {
      case 'sent':
        return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      case 'scheduled':
        return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      case 'processing':
        return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 animate-pulse';
      case 'failed':
        return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      default:
        return 'bg-muted text-muted-foreground border-border';
    }
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border capitalize',
        getStyles(),
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
};
