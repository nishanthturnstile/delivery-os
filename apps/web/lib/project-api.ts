import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

export function bodyRecord(body: unknown): Record<string, unknown> {
  return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
}

export function commandRecord(body: unknown): Record<string, unknown> {
  const record = bodyRecord(body);
  return bodyRecord(record.command);
}

export function mfaVerifiedAt(session: unknown): string | null {
  if (typeof session !== 'object' || session === null || !('mfaVerifiedAt' in session)) {
    return null;
  }
  const value = session.mfaVerifiedAt;
  if (value instanceof Date) return value.toISOString();
  return typeof value === 'string' ? value : null;
}

export function idempotencyKey(value: string | null): string {
  const parsed = z.uuidv7().safeParse(value);
  return parsed.success ? parsed.data : uuidv7();
}
