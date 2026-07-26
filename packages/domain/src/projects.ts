export type ProjectLifecycleState =
  | 'DRAFT'
  | 'INTAKE'
  | 'PLANNING'
  | 'EXECUTION'
  | 'ON_HOLD'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type ProjectRole = 'PM' | 'LEAD' | 'CONTRIBUTOR' | 'VIEWER' | 'CLIENT_STAKEHOLDER';

export type ReadinessCriterionCode =
  | 'PROFILE_INCOMPLETE'
  | 'PM_REQUIRED'
  | 'CALENDAR_REQUIRED'
  | 'INTERNAL_MEMBER_REQUIRED'
  | 'CLIENT_REQUIRED'
  | 'CLIENT_STAKEHOLDER_REQUIRED'
  | 'REQUIREMENTS_BASELINE_REQUIRED'
  | 'TECHNICAL_BASELINE_OR_WAIVER_REQUIRED'
  | 'UX_BASELINE_OR_WAIVER_REQUIRED'
  | 'MODULE_MAP_REQUIRED'
  | 'READY_WORK_ITEM_REQUIRED'
  | 'ACTIVE_SPRINT_PRESENT'
  | 'ACTIVE_WORK_PRESENT'
  | 'COMPLETION_SUMMARY_REQUIRED'
  | 'TRANSITION_REASON_REQUIRED';

export interface ReadinessCriterion {
  code: ReadinessCriterionCode;
  message: string;
}

const activeStates: ProjectLifecycleState[] = [
  'DRAFT',
  'INTAKE',
  'PLANNING',
  'EXECUTION',
  'COMPLETED',
  'CANCELLED',
];

const forwardTransitions: Record<ProjectLifecycleState, ProjectLifecycleState[]> = {
  DRAFT: ['INTAKE', 'ON_HOLD', 'CANCELLED'],
  INTAKE: ['DRAFT', 'PLANNING', 'ON_HOLD', 'CANCELLED'],
  PLANNING: ['INTAKE', 'EXECUTION', 'ON_HOLD', 'CANCELLED'],
  EXECUTION: ['PLANNING', 'COMPLETED', 'ON_HOLD', 'CANCELLED'],
  ON_HOLD: [],
  COMPLETED: ['EXECUTION', 'ARCHIVED'],
  CANCELLED: ['ARCHIVED'],
  ARCHIVED: [],
};

export interface ProjectReadinessFacts {
  profileComplete: boolean;
  activeProjectManagerCount: number;
  calendarConfigured: boolean;
  activeInternalMemberCount: number;
  external: boolean;
  clientAssigned: boolean;
  activeClientStakeholderCount: number;
  requirementsBaselineApproved: boolean;
  technicalBaselineApprovedOrWaived: boolean;
  uxBaselineApprovedOrWaived: boolean;
  moduleMapApproved: boolean;
  readyWorkItemCount: number;
  activeSprintCount: number;
  activeWorkCount: number;
  completionSummaryPresent: boolean;
}

const readinessMessages: Record<ReadinessCriterion['code'], string> = {
  PROFILE_INCOMPLETE: 'Complete the project profile before continuing.',
  PM_REQUIRED: 'Assign exactly one active Project Manager.',
  CALENDAR_REQUIRED: 'Configure the project working calendar.',
  INTERNAL_MEMBER_REQUIRED: 'Assign at least one active internal project member.',
  CLIENT_REQUIRED: 'Assign a client to the external project.',
  CLIENT_STAKEHOLDER_REQUIRED: 'Activate at least one client stakeholder.',
  REQUIREMENTS_BASELINE_REQUIRED: 'Approve a Requirement baseline before Planning.',
  TECHNICAL_BASELINE_OR_WAIVER_REQUIRED:
    'Approve the Technical baseline or record an authorized waiver.',
  UX_BASELINE_OR_WAIVER_REQUIRED: 'Approve the UX baseline or record an authorized waiver.',
  MODULE_MAP_REQUIRED: 'Approve the Module and Feature map before Execution.',
  READY_WORK_ITEM_REQUIRED: 'Prepare at least one Ready work item before Execution.',
  ACTIVE_SPRINT_PRESENT: 'Close the active sprint before completing the project.',
  ACTIVE_WORK_PRESENT: 'Resolve all In Progress and In Review work before completion.',
  COMPLETION_SUMMARY_REQUIRED: 'Record a completion summary before completing the project.',
  TRANSITION_REASON_REQUIRED: 'Record a reason for this lifecycle transition.',
};

function criterion(code: ReadinessCriterion['code']): ReadinessCriterion {
  return { code, message: readinessMessages[code] };
}

export function allowedLifecycleTransitions(
  current: ProjectLifecycleState,
  resumeState?: ProjectLifecycleState | null,
  preArchiveState?: ProjectLifecycleState | null,
): ProjectLifecycleState[] {
  if (current === 'ON_HOLD') {
    return resumeState === undefined || resumeState === null ? [] : [resumeState];
  }
  if (current === 'ARCHIVED') {
    return preArchiveState === 'COMPLETED' || preArchiveState === 'CANCELLED'
      ? [preArchiveState]
      : [];
  }
  return forwardTransitions[current];
}

export function isBackwardLifecycleTransition(
  from: ProjectLifecycleState,
  to: ProjectLifecycleState,
): boolean {
  const order: ProjectLifecycleState[] = ['DRAFT', 'INTAKE', 'PLANNING', 'EXECUTION', 'COMPLETED'];
  return order.includes(from) && order.includes(to) && order.indexOf(to) < order.indexOf(from);
}

export function evaluateProjectReadiness(
  from: ProjectLifecycleState,
  to: ProjectLifecycleState,
  facts: ProjectReadinessFacts,
  reason: string | null,
): ReadinessCriterion[] {
  const unmet: ReadinessCriterion[] = [];
  if (from === 'DRAFT' && to === 'INTAKE') {
    if (!facts.profileComplete) unmet.push(criterion('PROFILE_INCOMPLETE'));
    if (facts.activeProjectManagerCount !== 1) unmet.push(criterion('PM_REQUIRED'));
    if (!facts.calendarConfigured) unmet.push(criterion('CALENDAR_REQUIRED'));
    if (facts.activeInternalMemberCount < 1) unmet.push(criterion('INTERNAL_MEMBER_REQUIRED'));
    if (facts.external && !facts.clientAssigned) unmet.push(criterion('CLIENT_REQUIRED'));
    if (facts.external && facts.activeClientStakeholderCount < 1) {
      unmet.push(criterion('CLIENT_STAKEHOLDER_REQUIRED'));
    }
  }
  if (from === 'INTAKE' && to === 'PLANNING' && !facts.requirementsBaselineApproved) {
    unmet.push(criterion('REQUIREMENTS_BASELINE_REQUIRED'));
  }
  if (from === 'PLANNING' && to === 'EXECUTION') {
    if (!facts.technicalBaselineApprovedOrWaived) {
      unmet.push(criterion('TECHNICAL_BASELINE_OR_WAIVER_REQUIRED'));
    }
    if (!facts.uxBaselineApprovedOrWaived) {
      unmet.push(criterion('UX_BASELINE_OR_WAIVER_REQUIRED'));
    }
    if (!facts.moduleMapApproved) unmet.push(criterion('MODULE_MAP_REQUIRED'));
    if (facts.readyWorkItemCount < 1) unmet.push(criterion('READY_WORK_ITEM_REQUIRED'));
  }
  if (from === 'EXECUTION' && to === 'COMPLETED') {
    if (facts.activeSprintCount > 0) unmet.push(criterion('ACTIVE_SPRINT_PRESENT'));
    if (facts.activeWorkCount > 0) unmet.push(criterion('ACTIVE_WORK_PRESENT'));
    if (!facts.completionSummaryPresent) unmet.push(criterion('COMPLETION_SUMMARY_REQUIRED'));
  }
  if (
    ((from === 'COMPLETED' || from === 'CANCELLED') && to === 'ARCHIVED') ||
    isBackwardLifecycleTransition(from, to) ||
    to === 'CANCELLED'
  ) {
    if (reason === null || reason.trim().length < 8) {
      unmet.push(criterion('TRANSITION_REASON_REQUIRED'));
    }
  }
  return unmet;
}

export function validateProjectRoles(roles: ProjectRole[]): string | null {
  const unique = new Set(roles);
  if (unique.size !== roles.length) return 'Project roles must be unique.';
  const client = unique.has('CLIENT_STAKEHOLDER');
  if (client && unique.size > 1) {
    return 'Client Stakeholder cannot be combined with an internal project role.';
  }
  return null;
}

export function validateProjectLeadership(
  memberships: { active: boolean; roles: ProjectRole[] }[],
): string | null {
  const active = memberships.filter((membership) => membership.active);
  const projectManagers = active.filter((membership) => membership.roles.includes('PM')).length;
  const leads = active.filter((membership) => membership.roles.includes('LEAD')).length;
  if (projectManagers !== 1) return 'A project requires exactly one active Project Manager.';
  if (leads > 1) return 'A project can have at most one active Lead.';
  return null;
}

export function availabilityRangesOverlap(
  first: { effectiveFrom: string; effectiveTo: string },
  second: { effectiveFrom: string; effectiveTo: string },
): boolean {
  return first.effectiveFrom <= second.effectiveTo && second.effectiveFrom <= first.effectiveTo;
}

export function plannedWeeklyMinutes(input: {
  workingWeekdays: number[];
  dailyStart: string;
  dailyEnd: string;
  allocationPercent: number;
}): number {
  const [startHour = 0, startMinute = 0] = input.dailyStart.split(':').map(Number);
  const [endHour = 0, endMinute = 0] = input.dailyEnd.split(':').map(Number);
  const dailyMinutes = endHour * 60 + endMinute - (startHour * 60 + startMinute);
  if (dailyMinutes <= 0 || input.allocationPercent < 0 || input.allocationPercent > 100) return 0;
  return Math.round(
    (dailyMinutes * new Set(input.workingWeekdays).size * input.allocationPercent) / 100,
  );
}

export function canArchiveClient(projectStates: ProjectLifecycleState[]): boolean {
  return projectStates.every((state) => state === 'ARCHIVED' || state === 'CANCELLED');
}

export function isProjectReadOnly(state: ProjectLifecycleState): boolean {
  return state === 'ARCHIVED';
}

export function isActiveLifecycleState(state: ProjectLifecycleState): boolean {
  return activeStates.includes(state);
}
