type LogLevel = 'info' | 'warn' | 'error' | 'debug';
type LogPrefix = 'API' | 'WORKER' | 'QUEUE' | 'SMTP' | 'REDIS' | 'MYSQL' | 'ELASTICSEARCH' | 'SLACK' | 'AUTH' | 'SCHEDULER' | 'MIGRATION';

function formatMessage(prefix: LogPrefix, message: string, meta?: Record<string, unknown>): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ' ' + Object.entries(meta).map(([k, v]) => `${k}=${v}`).join(' ') : '';
  return `${timestamp} [${prefix}] ${message}${metaStr}`;
}

function log(level: LogLevel, prefix: LogPrefix, message: string, meta?: Record<string, unknown>): void {
  const formatted = formatMessage(prefix, message, meta);
  switch (level) {
    case 'error':
      console.error(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'debug':
      if (process.env.NODE_ENV === 'development') {
        console.debug(formatted);
      }
      break;
    default:
      console.log(formatted);
  }
}

export const logger = {
  info: (prefix: LogPrefix, message: string, meta?: Record<string, unknown>) => log('info', prefix, message, meta),
  warn: (prefix: LogPrefix, message: string, meta?: Record<string, unknown>) => log('warn', prefix, message, meta),
  error: (prefix: LogPrefix, message: string, meta?: Record<string, unknown>) => log('error', prefix, message, meta),
  debug: (prefix: LogPrefix, message: string, meta?: Record<string, unknown>) => log('debug', prefix, message, meta),
};
