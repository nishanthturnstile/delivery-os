import type {
  AcceptProjectInvitationCommand,
  ChangeClientStateCommand,
  Client,
  CreateClientCommand,
  CreateProjectCommand,
  DeactivateProjectMemberCommand,
  InviteProjectStakeholderCommand,
  MemberAvailability,
  Project,
  ProjectCalendarException,
  ProjectLifecycleHistory,
  ProjectListFilters,
  ProjectMembership,
  ProjectMutationResult,
  ProjectOutcomeModule,
  ProjectPortfolioItem,
  ProjectReadiness,
  ProjectWorkingCalendar,
  SetCalendarExceptionCommand,
  SetMemberAvailabilityCommand,
  SetProjectRolesCommand,
  TransitionProjectLifecycleCommand,
  UpdateClientCommand,
  UpdateProjectCalendarCommand,
  UpdateProjectCommand,
} from '@delivery-os/contracts';

import { ApplicationError } from './errors';

export interface ProjectCommandStore {
  createClient(command: CreateClientCommand): Promise<ProjectMutationResult>;
  updateClient(command: UpdateClientCommand): Promise<ProjectMutationResult>;
  changeClientState(command: ChangeClientStateCommand): Promise<ProjectMutationResult>;
  createProject(command: CreateProjectCommand): Promise<ProjectMutationResult>;
  updateProject(command: UpdateProjectCommand): Promise<ProjectMutationResult>;
  setProjectRoles(command: SetProjectRolesCommand): Promise<ProjectMutationResult>;
  deactivateProjectMember(command: DeactivateProjectMemberCommand): Promise<ProjectMutationResult>;
  inviteProjectStakeholder(
    command: InviteProjectStakeholderCommand,
  ): Promise<ProjectMutationResult>;
  acceptProjectInvitation(command: AcceptProjectInvitationCommand): Promise<ProjectMutationResult>;
  updateProjectCalendar(command: UpdateProjectCalendarCommand): Promise<ProjectMutationResult>;
  setCalendarException(command: SetCalendarExceptionCommand): Promise<ProjectMutationResult>;
  setMemberAvailability(command: SetMemberAvailabilityCommand): Promise<ProjectMutationResult>;
  transitionProjectLifecycle(
    command: TransitionProjectLifecycleCommand,
  ): Promise<ProjectMutationResult>;
}

export interface ProjectQueryStore {
  listClients(actorId: string, workspaceId: string): Promise<Client[]>;
  getClient(actorId: string, workspaceId: string, clientId: string): Promise<Client>;
  listProjects(
    actorId: string,
    workspaceId: string,
    filters: ProjectListFilters,
  ): Promise<{
    items: ProjectPortfolioItem[];
    nextCursor: { updatedAt: string; id: string } | null;
  }>;
  getProject(actorId: string, workspaceId: string, projectId: string): Promise<Project>;
  listProjectMembers(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectMembership[]>;
  getProjectCalendar(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<{
    calendar: ProjectWorkingCalendar;
    exceptions: ProjectCalendarException[];
  }>;
  listMemberAvailability(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<MemberAvailability[]>;
  getProjectReadiness(
    actorId: string,
    workspaceId: string,
    projectId: string,
    requestedState: Project['lifecycleState'],
  ): Promise<ProjectReadiness>;
  listProjectLifecycleHistory(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectLifecycleHistory[]>;
  getProjectOutcome(
    actorId: string,
    workspaceId: string,
    projectId: string,
  ): Promise<ProjectOutcomeModule>;
  isClientStakeholderOnly(actorId: string, workspaceId: string): Promise<boolean>;
}

export function assertRecentMfa(
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

export class CreateClient {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: CreateClientCommand): Promise<ProjectMutationResult> {
    return this.store.createClient(command);
  }
}

export class UpdateClient {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: UpdateClientCommand): Promise<ProjectMutationResult> {
    return this.store.updateClient(command);
  }
}

export class ChangeClientState {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: ChangeClientStateCommand): Promise<ProjectMutationResult> {
    return this.store.changeClientState(command);
  }
}

export class CreateProject {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: CreateProjectCommand): Promise<ProjectMutationResult> {
    return this.store.createProject(command);
  }
}

export class UpdateProject {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: UpdateProjectCommand): Promise<ProjectMutationResult> {
    return this.store.updateProject(command);
  }
}

export class SetProjectRoles {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: SetProjectRolesCommand): Promise<ProjectMutationResult> {
    return this.store.setProjectRoles(command);
  }
}

export class DeactivateProjectMember {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: DeactivateProjectMemberCommand): Promise<ProjectMutationResult> {
    return this.store.deactivateProjectMember(command);
  }
}

export class InviteProjectStakeholder {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: InviteProjectStakeholderCommand): Promise<ProjectMutationResult> {
    return this.store.inviteProjectStakeholder(command);
  }
}

export class AcceptProjectInvitation {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: AcceptProjectInvitationCommand): Promise<ProjectMutationResult> {
    return this.store.acceptProjectInvitation(command);
  }
}

export class UpdateProjectCalendar {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: UpdateProjectCalendarCommand): Promise<ProjectMutationResult> {
    return this.store.updateProjectCalendar(command);
  }
}

export class SetCalendarException {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: SetCalendarExceptionCommand): Promise<ProjectMutationResult> {
    return this.store.setCalendarException(command);
  }
}

export class SetMemberAvailability {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: SetMemberAvailabilityCommand): Promise<ProjectMutationResult> {
    return this.store.setMemberAvailability(command);
  }
}

export class TransitionProjectLifecycle {
  constructor(private readonly store: ProjectCommandStore) {}
  execute(command: TransitionProjectLifecycleCommand): Promise<ProjectMutationResult> {
    return this.store.transitionProjectLifecycle(command);
  }
}
