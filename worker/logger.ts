/**
 * Simple structured logger for the worker process.
 * Avoids pulling in heavy dependencies; outputs JSON for structured log ingestion.
 */

import { workerConfig } from './config';

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const currentLevel = LOG_LEVELS[workerConfig.logLevel as LogLevel] ?? LOG_LEVELS.info;

function formatMessage(level: LogLevel, message: string, meta?: Record<string, unknown>): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: 'wipguard-worker',
    message,
    ...meta,
  });
}

export const logger = {
  debug(message: string, meta?: Record<string, unknown>) {
    if (currentLevel <= LOG_LEVELS.debug) {
      console.log(formatMessage('debug', message, meta));
    }
  },
  info(message: string, meta?: Record<string, unknown>) {
    if (currentLevel <= LOG_LEVELS.info) {
      console.log(formatMessage('info', message, meta));
    }
  },
  warn(message: string, meta?: Record<string, unknown>) {
    if (currentLevel <= LOG_LEVELS.warn) {
      console.warn(formatMessage('warn', message, meta));
    }
  },
  error(message: string, meta?: Record<string, unknown>) {
    if (currentLevel <= LOG_LEVELS.error) {
      console.error(formatMessage('error', message, meta));
    }
  },
};
