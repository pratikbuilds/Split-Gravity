import { env } from '../config/env';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const LOG_PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

export const logAt = (level: LogLevel, event: string, context?: Record<string, unknown>) => {
  if (LOG_PRIORITY[level] > LOG_PRIORITY[env.LOG_LEVEL]) return;

  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...context,
  };
  const line = JSON.stringify(payload);

  if (level === 'error') {
    console.error(line);
    return;
  }

  if (level === 'warn') {
    console.warn(line);
    return;
  }

  console.log(line);
};
