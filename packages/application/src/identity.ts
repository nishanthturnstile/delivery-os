import type {
  AcceptInvitationCommand,
  ChangeMembershipCommand,
  CreateWorkspaceCommand,
  IdentityMutationResult,
  IssueInvitationCommand,
  SwitchWorkspaceCommand,
  UpdateProfileCommand,
  UpdateWorkspaceCommand,
  Workspace,
  WorkspaceInvitation,
  WorkspaceMembership,
  WorkspaceSummary,
} from '@delivery-os/contracts';

import { ApplicationError } from './errors';

export interface IdentityCommandStore {
  createWorkspace(command: CreateWorkspaceCommand): Promise<IdentityMutationResult>;
  updateWorkspace(command: UpdateWorkspaceCommand): Promise<IdentityMutationResult>;
  issueInvitation(command: IssueInvitationCommand): Promise<IdentityMutationResult>;
  acceptInvitation(command: AcceptInvitationCommand): Promise<IdentityMutationResult>;
  changeMembership(command: ChangeMembershipCommand): Promise<IdentityMutationResult>;
  switchWorkspace(command: SwitchWorkspaceCommand): Promise<void>;
  updateProfile(command: UpdateProfileCommand): Promise<void>;
}

export interface IdentityQueryStore {
  listWorkspaces(userId: string): Promise<WorkspaceSummary[]>;
  getWorkspace(userId: string, workspaceId: string): Promise<Workspace>;
  listMemberships(userId: string, workspaceId: string): Promise<WorkspaceMembership[]>;
  listInvitations(userId: string, workspaceId: string): Promise<WorkspaceInvitation[]>;
}

function requireStepUp(
  mfaVerifiedAt: string | null,
  correlationId: string,
  now = new Date(),
): void {
  if (mfaVerifiedAt === null) {
    throw new ApplicationError({
      code: 'MFA_REQUIRED',
      message: 'Confirm this privileged action with your authenticator.',
      correlationId,
    });
  }
  const verifiedAt = new Date(mfaVerifiedAt);
  const elapsed = now.getTime() - verifiedAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 10 * 60 * 1_000) {
    throw new ApplicationError({
      code: 'MFA_REQUIRED',
      message: 'Your security confirmation expired. Verify again to continue.',
      correlationId,
    });
  }
}

export class CreateWorkspace {
  constructor(private readonly store: IdentityCommandStore) {}

  execute(command: CreateWorkspaceCommand): Promise<IdentityMutationResult> {
    return this.store.createWorkspace(command);
  }
}

export class UpdateWorkspace {
  constructor(private readonly store: IdentityCommandStore) {}

  execute(command: UpdateWorkspaceCommand): Promise<IdentityMutationResult> {
    requireStepUp(command.mfaVerifiedAt, command.correlationId);
    return this.store.updateWorkspace(command);
  }
}

export class IssueWorkspaceInvitation {
  constructor(private readonly store: IdentityCommandStore) {}

  execute(command: IssueInvitationCommand): Promise<IdentityMutationResult> {
    requireStepUp(command.mfaVerifiedAt, command.correlationId);
    return this.store.issueInvitation(command);
  }
}

export class AcceptWorkspaceInvitation {
  constructor(private readonly store: IdentityCommandStore) {}

  execute(command: AcceptInvitationCommand): Promise<IdentityMutationResult> {
    return this.store.acceptInvitation(command);
  }
}

export class ChangeWorkspaceMembership {
  constructor(private readonly store: IdentityCommandStore) {}

  execute(command: ChangeMembershipCommand): Promise<IdentityMutationResult> {
    requireStepUp(command.mfaVerifiedAt, command.correlationId);
    if (command.command.role === undefined && command.command.deactivate !== true) {
      throw new ApplicationError({
        code: 'VALIDATION_FAILED',
        message: 'Choose a role change or deactivation.',
        correlationId: command.correlationId,
      });
    }
    return this.store.changeMembership(command);
  }
}

export class SwitchWorkspace {
  constructor(private readonly store: IdentityCommandStore) {}

  execute(command: SwitchWorkspaceCommand): Promise<void> {
    return this.store.switchWorkspace(command);
  }
}

export class UpdateProfile {
  constructor(private readonly store: IdentityCommandStore) {}

  execute(command: UpdateProfileCommand): Promise<void> {
    return this.store.updateProfile(command);
  }
}
