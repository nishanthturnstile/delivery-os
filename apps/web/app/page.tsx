import { headers } from 'next/headers';

import { auth } from '@/lib/auth';

import { AuthExperience } from './auth-experience';
import { WorkspaceApp } from './workspace-app';

export const dynamic = 'force-dynamic';

export default async function IdentityPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session === null) return <AuthExperience />;
  const user = session.user as typeof session.user & {
    twoFactorEnabled?: boolean;
    notificationPreferences?: { email?: boolean };
  };
  return (
    <WorkspaceApp
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        avatarUrl: user.image ?? null,
        emailNotifications: user.notificationPreferences?.email ?? true,
        twoFactorEnabled: user.twoFactorEnabled ?? false,
      }}
    />
  );
}
