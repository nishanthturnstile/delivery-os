import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';

import { platformProbeCommandSchema } from './platform';

describe('platformProbeCommandSchema', () => {
  it('accepts the versioned mutation envelope', () => {
    const workspaceId = uuidv7();
    const parsed = platformProbeCommandSchema.parse({
      schemaVersion: '1',
      aggregateId: uuidv7(),
      expectedRevision: 0,
      idempotencyKey: uuidv7(),
      correlationId: crypto.randomUUID(),
      authorization: {
        userId: uuidv7(),
        workspaceId,
        workspaceRole: 'ADMIN',
        projectRoles: [],
      },
      command: { delta: 1, reason: 'foundation validation' },
    });

    expect(parsed.authorization.workspaceId).toBe(workspaceId);
  });

  it('rejects unknown fields and invalid revisions after strict parsing', () => {
    const parsed = platformProbeCommandSchema.safeParse({
      schemaVersion: '1',
      expectedRevision: -1,
    });

    expect(parsed.success).toBe(false);
  });
});
