import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import {
  createProjectCommandSchema,
  projectListFiltersSchema,
  setMemberAvailabilityCommandSchema,
} from './projects';

function envelope() {
  return {
    schemaVersion: '1',
    workspaceId: uuidv7(),
    actorId: uuidv7(),
    expectedRevision: 0,
    idempotencyKey: uuidv7(),
    correlationId: uuidv7(),
    mfaVerifiedAt: null,
    overrideReason: null,
  };
}

describe('M2 project contracts', () => {
  it('enforces internal and external project creation invariants', () => {
    const base = {
      ...envelope(),
      projectId: uuidv7(),
      outcomeModuleId: uuidv7(),
      projectInvitationId: null,
      workspaceInvitationId: null,
      command: {
        type: 'INTERNAL',
        clientId: null,
        name: 'Internal project',
        shortDescription: 'A governed project.',
        targetStart: '2026-08-01',
        targetEnd: '2026-08-31',
        projectManagerId: uuidv7(),
        leadUserId: null,
        contributorIds: [],
        stakeholderEmail: null,
        stakeholderTokenDigest: null,
        workspaceTokenDigest: null,
        stakeholderExpiresAt: null,
        calendar: {
          timeZone: 'UTC',
          workingWeekdays: [1, 2, 3, 4, 5],
          dailyStart: '09:00',
          dailyEnd: '17:00',
        },
      },
    };
    expect(createProjectCommandSchema.safeParse(base).success).toBe(true);
    expect(
      createProjectCommandSchema.safeParse({
        ...base,
        command: { ...base.command, targetStart: '2026-09-01' },
      }).success,
    ).toBe(false);
    expect(
      createProjectCommandSchema.safeParse({
        ...base,
        command: {
          ...base.command,
          type: 'EXTERNAL',
          clientId: uuidv7(),
          stakeholderEmail: 'client@example.test',
        },
      }).success,
    ).toBe(false);
    expect(
      createProjectCommandSchema.safeParse({
        ...base,
        projectInvitationId: uuidv7(),
      }).success,
    ).toBe(false);
  });

  it('validates cursor pairs, list limits, and availability ranges', () => {
    expect(projectListFiltersSchema.parse({})).toMatchObject({
      search: '',
      limit: 25,
    });
    expect(
      projectListFiltersSchema.safeParse({ cursorUpdatedAt: new Date().toISOString() }).success,
    ).toBe(false);
    expect(projectListFiltersSchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(
      setMemberAvailabilityCommandSchema.safeParse({
        ...envelope(),
        projectId: uuidv7(),
        availabilityId: uuidv7(),
        command: {
          userId: uuidv7(),
          effectiveFrom: '2026-09-01',
          effectiveTo: '2026-08-01',
          allocationPercent: 50,
        },
      }).success,
    ).toBe(false);
  });
});
