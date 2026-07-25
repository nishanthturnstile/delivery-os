import {
  AcceptWorkspaceInvitation,
  ChangeWorkspaceMembership,
  CreateWorkspace,
  IssueWorkspaceInvitation,
  SwitchWorkspace,
  UpdateProfile,
  UpdateWorkspace,
  type IdentityCommandStore,
} from './identity';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it, vi } from 'vitest';

function store(): IdentityCommandStore {
  return {
    createWorkspace: vi.fn(),
    updateWorkspace: vi.fn(),
    issueInvitation: vi.fn(),
    acceptInvitation: vi.fn(),
    changeMembership: vi.fn(),
    switchWorkspace: vi.fn(),
    updateProfile: vi.fn(),
  };
}

describe('identity application gates', () => {
  it('blocks privileged commands without a recent step-up', () => {
    const adapter = store();
    const command = {
      schemaVersion: '1' as const,
      invitationId: uuidv7(),
      workspaceId: uuidv7(),
      actorId: uuidv7(),
      expectedRevision: 0,
      idempotencyKey: uuidv7(),
      correlationId: uuidv7(),
      mfaVerifiedAt: null,
      command: {
        email: 'client@example.net',
        role: 'MEMBER' as const,
        tokenDigest: 'a'.repeat(64),
        expiresAt: new Date(Date.now() + 1_000).toISOString(),
      },
    };
    expect(() => new IssueWorkspaceInvitation(adapter).execute(command)).toThrow(
      expect.objectContaining({ code: 'MFA_REQUIRED' }),
    );
    // eslint-disable-next-line @typescript-eslint/unbound-method -- asserting a Vitest method mock
    expect(vi.mocked(adapter.issueInvitation)).not.toHaveBeenCalled();
  });

  it('blocks expired step-up and empty membership changes', () => {
    const adapter = store();
    const base = {
      schemaVersion: '1' as const,
      workspaceId: uuidv7(),
      actorId: uuidv7(),
      expectedRevision: 1,
      idempotencyKey: uuidv7(),
      correlationId: uuidv7(),
      mfaVerifiedAt: '2020-01-01T00:00:00.000Z',
    };
    expect(() =>
      new UpdateWorkspace(adapter).execute({
        ...base,
        command: {
          name: 'Workspace',
          logoUrl: null,
          primaryColor: '#5146e5',
          timeZone: 'UTC',
          defaultWorkingHours: { days: [1], start: '09:00', end: '17:00' },
        },
      }),
    ).toThrow(expect.objectContaining({ code: 'MFA_REQUIRED' }));

    expect(() =>
      new ChangeWorkspaceMembership(adapter).execute({
        ...base,
        mfaVerifiedAt: new Date().toISOString(),
        command: { targetUserId: uuidv7() },
      }),
    ).toThrow(expect.objectContaining({ code: 'VALIDATION_FAILED' }));
  });

  it('delegates the allowed identity command set', async () => {
    const adapter = store();
    const workspaceId = uuidv7();
    const actorId = uuidv7();
    const common = {
      schemaVersion: '1' as const,
      workspaceId,
      actorId,
      expectedRevision: 0,
      idempotencyKey: uuidv7(),
      correlationId: uuidv7(),
    };
    await new CreateWorkspace(adapter).execute({
      ...common,
      command: {
        name: 'Workspace',
        logoUrl: null,
        primaryColor: '#5146e5',
        timeZone: 'UTC',
        defaultWorkingHours: { days: [1], start: '09:00', end: '17:00' },
      },
    });
    await new AcceptWorkspaceInvitation(adapter).execute({
      ...common,
      command: {
        invitationId: uuidv7(),
        tokenDigest: 'a'.repeat(64),
        verifiedEmail: 'member@example.com',
      },
    });
    await new ChangeWorkspaceMembership(adapter).execute({
      ...common,
      mfaVerifiedAt: new Date().toISOString(),
      command: { targetUserId: uuidv7(), role: 'MEMBER' },
    });
    await new SwitchWorkspace(adapter).execute({
      schemaVersion: '1',
      actorId,
      workspaceId,
      correlationId: uuidv7(),
    });
    await new UpdateProfile(adapter).execute({
      schemaVersion: '1',
      actorId,
      correlationId: uuidv7(),
      command: {
        displayName: 'Member',
        avatarUrl: null,
        emailNotifications: true,
      },
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method -- asserting a Vitest method mock
    expect(vi.mocked(adapter.createWorkspace)).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- asserting a Vitest method mock
    expect(vi.mocked(adapter.acceptInvitation)).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- asserting a Vitest method mock
    expect(vi.mocked(adapter.changeMembership)).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- asserting a Vitest method mock
    expect(vi.mocked(adapter.switchWorkspace)).toHaveBeenCalledOnce();
    // eslint-disable-next-line @typescript-eslint/unbound-method -- asserting a Vitest method mock
    expect(vi.mocked(adapter.updateProfile)).toHaveBeenCalledOnce();
  });
});
