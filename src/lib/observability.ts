import { randomUUID } from 'node:crypto';

export interface LogContext {
  requestId?: string;
  runId?: string;
  jobId?: string;
  userId?: string;
  workspaceId?: string;
  stage?: string;
}

export function requestId(): string {
  return randomUUID();
}

export function logEvent(event: string, context: LogContext, detail?: Record<string, unknown>): void {
  console.info(JSON.stringify({
    ts: new Date().toISOString(),
    event,
    ...context,
    ...(detail ?? {}),
  }));
}

export function logError(event: string, error: unknown, context: LogContext, detail?: Record<string, unknown>): void {
  console.error(JSON.stringify({
    ts: new Date().toISOString(),
    event,
    message: error instanceof Error ? error.message : String(error),
    ...context,
    ...(detail ?? {}),
  }));
}

export function requestContext(request: Request): LogContext {
  const id = request.headers.get('x-request-id')?.trim() || requestId();
  return { requestId: id };
}
