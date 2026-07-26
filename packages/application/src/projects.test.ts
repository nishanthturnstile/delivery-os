import type {
  AcceptProjectInvitationCommand,
  ChangeClientStateCommand,
  CreateClientCommand,
  CreateProjectCommand,
  DeactivateProjectMemberCommand,
  InviteProjectStakeholderCommand,
  SetCalendarExceptionCommand,
  SetMemberAvailabilityCommand,
  SetProjectRolesCommand,
  TransitionProjectLifecycleCommand,
  UpdateClientCommand,
  UpdateProjectCalendarCommand,
  UpdateProjectCommand,
} from '@delivery-os/contracts';
import { describe, expect, it, vi } from 'vitest';

import {
  AcceptProjectInvitation,
  assertRecentMfa,
  ChangeClientState,
  CreateClient,
  CreateProject,
  DeactivateProjectMember,
  InviteProjectStakeholder,
  SetCalendarException,
  SetMemberAvailability,
  SetProjectRoles,
  TransitionProjectLifecycle,
  UpdateClient,
  UpdateProject,
  UpdateProjectCalendar,
  type ProjectCommandStore,
} from './projects';

function commandStore() {
  const calls = {
    createClient: vi.fn(),
    updateClient: vi.fn(),
    changeClientState: vi.fn(),
    createProject: vi.fn(),
    updateProject: vi.fn(),
    setProjectRoles: vi.fn(),
    deactivateProjectMember: vi.fn(),
    inviteProjectStakeholder: vi.fn(),
    acceptProjectInvitation: vi.fn(),
    updateProjectCalendar: vi.fn(),
    setCalendarException: vi.fn(),
    setMemberAvailability: vi.fn(),
    transitionProjectLifecycle: vi.fn(),
  };
  return { calls, store: calls satisfies ProjectCommandStore };
}

describe('M2 project application services', () => {
  it('delegates every command through its explicit port', async () => {
    const { calls, store } = commandStore();
    const createClient = {} as CreateClientCommand;
    const updateClient = {} as UpdateClientCommand;
    const changeClientState = {} as ChangeClientStateCommand;
    const createProject = {} as CreateProjectCommand;
    const updateProject = {} as UpdateProjectCommand;
    const setProjectRoles = {} as SetProjectRolesCommand;
    const deactivateMember = {} as DeactivateProjectMemberCommand;
    const inviteStakeholder = {} as InviteProjectStakeholderCommand;
    const acceptInvitation = {} as AcceptProjectInvitationCommand;
    const updateCalendar = {} as UpdateProjectCalendarCommand;
    const setException = {} as SetCalendarExceptionCommand;
    const setAvailability = {} as SetMemberAvailabilityCommand;
    const transition = {} as TransitionProjectLifecycleCommand;

    await new CreateClient(store).execute(createClient);
    await new UpdateClient(store).execute(updateClient);
    await new ChangeClientState(store).execute(changeClientState);
    await new CreateProject(store).execute(createProject);
    await new UpdateProject(store).execute(updateProject);
    await new SetProjectRoles(store).execute(setProjectRoles);
    await new DeactivateProjectMember(store).execute(deactivateMember);
    await new InviteProjectStakeholder(store).execute(inviteStakeholder);
    await new AcceptProjectInvitation(store).execute(acceptInvitation);
    await new UpdateProjectCalendar(store).execute(updateCalendar);
    await new SetCalendarException(store).execute(setException);
    await new SetMemberAvailability(store).execute(setAvailability);
    await new TransitionProjectLifecycle(store).execute(transition);

    expect(calls.createClient).toHaveBeenCalledWith(createClient);
    expect(calls.updateClient).toHaveBeenCalledWith(updateClient);
    expect(calls.changeClientState).toHaveBeenCalledWith(changeClientState);
    expect(calls.createProject).toHaveBeenCalledWith(createProject);
    expect(calls.updateProject).toHaveBeenCalledWith(updateProject);
    expect(calls.setProjectRoles).toHaveBeenCalledWith(setProjectRoles);
    expect(calls.deactivateProjectMember).toHaveBeenCalledWith(deactivateMember);
    expect(calls.inviteProjectStakeholder).toHaveBeenCalledWith(inviteStakeholder);
    expect(calls.acceptProjectInvitation).toHaveBeenCalledWith(acceptInvitation);
    expect(calls.updateProjectCalendar).toHaveBeenCalledWith(updateCalendar);
    expect(calls.setCalendarException).toHaveBeenCalledWith(setException);
    expect(calls.setMemberAvailability).toHaveBeenCalledWith(setAvailability);
    expect(calls.transitionProjectLifecycle).toHaveBeenCalledWith(transition);
  });

  it('requires a valid recent MFA step-up', () => {
    const now = new Date('2026-07-25T12:00:00.000Z');
    expect(() => assertRecentMfa(null, 'correlation', now)).toThrow(/authenticator/);
    expect(() => assertRecentMfa('invalid', 'correlation', now)).toThrow(/expired/);
    expect(() => assertRecentMfa('2026-07-25T11:49:59.000Z', 'correlation', now)).toThrow(
      /expired/,
    );
    expect(() => assertRecentMfa('2026-07-25T12:01:00.000Z', 'correlation', now)).toThrow(
      /expired/,
    );
    expect(() => assertRecentMfa('2026-07-25T11:55:00.000Z', 'correlation', now)).not.toThrow();
  });
});
