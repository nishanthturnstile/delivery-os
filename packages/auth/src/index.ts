import type { AuthorizationContext } from '@delivery-os/contracts';

export function canRunPlatformProbe(context: AuthorizationContext): boolean {
  return context.workspaceRole === 'ADMIN';
}

export function hasFreshStepUp(context: AuthorizationContext, now = new Date()): boolean {
  if (context.mfaVerifiedAt === undefined) {
    return false;
  }
  const verifiedAt = new Date(context.mfaVerifiedAt);
  return (
    Number.isFinite(verifiedAt.getTime()) &&
    now.getTime() - verifiedAt.getTime() >= 0 &&
    now.getTime() - verifiedAt.getTime() <= 10 * 60 * 1000
  );
}
