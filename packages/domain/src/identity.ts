export const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
export const STEP_UP_LIFETIME_MS = 10 * 60 * 1_000;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function invitationExpiresAt(now = new Date()): Date {
  return new Date(now.getTime() + INVITATION_LIFETIME_MS);
}

export function canAcceptInvitation(input: {
  invitationEmail: string;
  verifiedEmail: string;
  state: 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';
  expiresAt: Date;
  now?: Date;
}): boolean {
  const now = input.now ?? new Date();
  return (
    input.state === 'PENDING' &&
    input.expiresAt.getTime() > now.getTime() &&
    normalizeEmail(input.invitationEmail) === normalizeEmail(input.verifiedEmail)
  );
}

export function hasRecentTotpStepUp(
  mfaVerifiedAt: string | Date | null | undefined,
  now = new Date(),
): boolean {
  if (mfaVerifiedAt === null || mfaVerifiedAt === undefined) {
    return false;
  }
  const verifiedAt = mfaVerifiedAt instanceof Date ? mfaVerifiedAt : new Date(mfaVerifiedAt);
  const elapsed = now.getTime() - verifiedAt.getTime();
  return Number.isFinite(elapsed) && elapsed >= 0 && elapsed <= STEP_UP_LIFETIME_MS;
}

export function wouldRemoveLastAdmin(input: {
  activeAdminCount: number;
  targetIsActiveAdmin: boolean;
  nextRole?: 'ADMIN' | 'MEMBER';
  deactivate?: boolean;
}): boolean {
  if (!input.targetIsActiveAdmin || input.activeAdminCount > 1) {
    return false;
  }
  return input.deactivate === true || input.nextRole === 'MEMBER';
}

export function isValidIanaTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}
