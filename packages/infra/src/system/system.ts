import { randomUUID } from 'node:crypto';
import { type Clock, type IdGenerator, type Logger } from '@cashpilot/application';
import { LocalDate } from '@cashpilot/domain';

/** "Today" is the calendar date in the company timezone (Africa/Tunis), never the server's. */
export class SystemClock implements Clock {
  constructor(private readonly timeZone = 'Africa/Tunis') {}
  today(): LocalDate {
    return LocalDate.fromInstant(new Date(), this.timeZone);
  }
  now(): Date {
    return new Date();
  }
}

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}

/** Structured JSON logs (one line per event) — easy to ship to any log collector. */
export class JsonLogger implements Logger {
  constructor(private readonly base: Record<string, unknown> = {}) {}

  private write(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>) {
    const line = JSON.stringify({ level, time: new Date().toISOString(), message, ...this.base, ...context });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.info(line);
  }

  info(message: string, context?: Record<string, unknown>) {
    this.write('info', message, context);
  }
  warn(message: string, context?: Record<string, unknown>) {
    this.write('warn', message, context);
  }
  error(message: string, context?: Record<string, unknown>) {
    this.write('error', message, context);
  }
  child(context: Record<string, unknown>): JsonLogger {
    return new JsonLogger({ ...this.base, ...context });
  }
}
