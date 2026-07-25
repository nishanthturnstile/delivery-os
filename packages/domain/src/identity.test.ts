import { describe, expect, it } from 'vitest';

import {
  canAcceptInvitation,
  hasRecentTotpStepUp,
  invitationExpiresAt,
  isValidIanaTimeZone,
  normalizeEmail,
  wouldRemoveLastAdmin,
} from './identity';

describe('identity policies', () => {
  const now = new Date('2026-07-24T12:00:00.000Z');

  it('normalizes email without inferring tenancy', () => {
    expect(normalizeEmail(' Person@Example.COM ')).toBe('person@example.com');
  });

  it('uses an exact seven-day invitation lifetime', () => {
    expect(invitationExpiresAt(now).toISOString()).toBe('2026-07-31T12:00:00.000Z');
  });

  it('requires pending, unexpired, email-matched invitation acceptance', () => {
    expect(
      canAcceptInvitation({
        invitationEmail: 'client@personal.example',
        verifiedEmail: 'CLIENT@personal.example',
        state: 'PENDING',
        expiresAt: new Date('2026-07-24T12:00:01.000Z'),
        now,
      }),
    ).toBe(true);
    expect(
      canAcceptInvitation({
        invitationEmail: 'client@personal.example',
        verifiedEmail: 'other@personal.example',
        state: 'PENDING',
        expiresAt: new Date('2026-07-24T12:00:01.000Z'),
        now,
      }),
    ).toBe(false);
    expect(
      canAcceptInvitation({
        invitationEmail: 'client@personal.example',
        verifiedEmail: 'client@personal.example',
        state: 'PENDING',
        expiresAt: now,
        now,
      }),
    ).toBe(false);
  });

  it('accepts only TOTP step-up from the last ten minutes', () => {
    expect(hasRecentTotpStepUp('2026-07-24T11:50:00.000Z', now)).toBe(true);
    expect(hasRecentTotpStepUp('2026-07-24T11:49:59.999Z', now)).toBe(false);
    expect(hasRecentTotpStepUp('not-a-date', now)).toBe(false);
  });

  it('protects the last active Admin', () => {
    expect(
      wouldRemoveLastAdmin({
        activeAdminCount: 1,
        targetIsActiveAdmin: true,
        nextRole: 'MEMBER',
      }),
    ).toBe(true);
    expect(
      wouldRemoveLastAdmin({
        activeAdminCount: 2,
        targetIsActiveAdmin: true,
        deactivate: true,
      }),
    ).toBe(false);
  });

  it('validates IANA time zones', () => {
    expect(isValidIanaTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidIanaTimeZone('example/not-real')).toBe(false);
  });
});
