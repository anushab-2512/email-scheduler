import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/utils';

interface LoadingSpinnerProps {
  className?: string;
  size?: number;
  text?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  className,
  size = 24,
  text,
}) => {
  return (
    <div className={cn('flex flex-col items-center justify-center p-8 gap-3', className)}>
      <Loader2 size={size} className="animate-spin text-primary" />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
};
