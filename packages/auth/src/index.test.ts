import { authorizationContextSchema } from '@delivery-os/contracts';
import { describe, expect, it } from 'vitest';
import { v7 as uuidv7 } from 'uuid';

import { canRunPlatformProbe, hasFreshStepUp } from './index';

function context(mfaVerifiedAt?: string) {
  return authorizationContextSchema.parse({
    userId: uuidv7(),
    workspaceId: uuidv7(),
    workspaceRole: 'ADMIN',
    projectRoles: [],
    ...(mfaVerifiedAt === undefined ? {} : { mfaVerifiedAt }),
  });
}

describe('authorization helpers', () => {
  it('permits only an administrator to run the W0 probe', () => {
    const admin = context();
    expect(canRunPlatformProbe(admin)).toBe(true);
    expect(canRunPlatformProbe({ ...admin, workspaceRole: 'MEMBER' })).toBe(false);
  });

  it('requires a valid TOTP step-up within ten minutes', () => {
    const now = new Date('2026-07-24T10:00:00.000Z');
    expect(hasFreshStepUp(context('2026-07-24T09:55:00.000Z'), now)).toBe(true);
    expect(hasFreshStepUp(context('2026-07-24T09:49:59.000Z'), now)).toBe(false);
    expect(hasFreshStepUp(context('2026-07-24T10:00:01.000Z'), now)).toBe(false);
    expect(hasFreshStepUp(context(), now)).toBe(false);
  });
});
