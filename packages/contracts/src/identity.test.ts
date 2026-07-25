import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import {
  createWorkspaceCommandSchema,
  issueInvitationCommandSchema,
  workingHoursSchema,
} from './identity';

describe('identity contracts', () => {
  it('defaults a safe workspace profile', () => {
    const parsed = createWorkspaceCommandSchema.parse({
      schemaVersion: '1',
      workspaceId: uuidv7(),
      actorId: uuidv7(),
      expectedRevision: 0,
      idempotencyKey: uuidv7(),
      correlationId: uuidv7(),
      command: { name: 'Northstar' },
    });
    expect(parsed.command.timeZone).toBe('UTC');
    expect(parsed.command.primaryColor).toBe('#5146e5');
    expect(parsed.command.defaultWorkingHours.days).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects inverted working hours', () => {
    expect(() => workingHoursSchema.parse({ days: [1], start: '17:00', end: '09:00' })).toThrow();
  });

  it('normalizes invitation email and requires a digest', () => {
    const parsed = issueInvitationCommandSchema.parse({
      schemaVersion: '1',
      invitationId: uuidv7(),
      workspaceId: uuidv7(),
      actorId: uuidv7(),
      expectedRevision: 0,
      idempotencyKey: uuidv7(),
      correlationId: uuidv7(),
      mfaVerifiedAt: new Date().toISOString(),
      command: {
        email: ' Client@Personal.Example ',
        role: 'MEMBER',
        tokenDigest: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 1_000).toISOString(),
      },
    });
    expect(parsed.command.email).toBe('client@personal.example');
  });
});
