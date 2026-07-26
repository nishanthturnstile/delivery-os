import { describe, expect, it } from 'vitest';

import {
  allowedLifecycleTransitions,
  availabilityRangesOverlap,
  canArchiveClient,
  evaluateProjectReadiness,
  isActiveLifecycleState,
  isProjectReadOnly,
  plannedWeeklyMinutes,
  validateProjectLeadership,
  validateProjectRoles,
  type ProjectReadinessFacts,
} from './projects';

const readyFacts: ProjectReadinessFacts = {
  profileComplete: true,
  activeProjectManagerCount: 1,
  calendarConfigured: true,
  activeInternalMemberCount: 2,
  external: false,
  clientAssigned: false,
  activeClientStakeholderCount: 0,
  requirementsBaselineApproved: true,
  technicalBaselineApprovedOrWaived: true,
  uxBaselineApprovedOrWaived: true,
  moduleMapApproved: true,
  readyWorkItemCount: 1,
  activeSprintCount: 0,
  activeWorkCount: 0,
  completionSummaryPresent: true,
};

describe('M2 project policies', () => {
  it('keeps hold/resume and archive/unarchive targets server-owned', () => {
    expect(allowedLifecycleTransitions('ON_HOLD', 'PLANNING')).toEqual(['PLANNING']);
    expect(allowedLifecycleTransitions('ON_HOLD')).toEqual([]);
    expect(allowedLifecycleTransitions('ON_HOLD', null)).toEqual([]);
    expect(allowedLifecycleTransitions('ARCHIVED', null, 'COMPLETED')).toEqual(['COMPLETED']);
    expect(allowedLifecycleTransitions('ARCHIVED', null, 'CANCELLED')).toEqual(['CANCELLED']);
    expect(allowedLifecycleTransitions('ARCHIVED', null, 'DRAFT')).toEqual([]);
  });

  it('returns stable ordered readiness criteria', () => {
    expect(
      evaluateProjectReadiness(
        'DRAFT',
        'INTAKE',
        {
          ...readyFacts,
          profileComplete: false,
          activeProjectManagerCount: 0,
          calendarConfigured: false,
          activeInternalMemberCount: 0,
          external: true,
          clientAssigned: false,
          activeClientStakeholderCount: 0,
        },
        null,
      ).map((item) => item.code),
    ).toEqual([
      'PROFILE_INCOMPLETE',
      'PM_REQUIRED',
      'CALENDAR_REQUIRED',
      'INTERNAL_MEMBER_REQUIRED',
      'CLIENT_REQUIRED',
      'CLIENT_STAKEHOLDER_REQUIRED',
    ]);
    expect(evaluateProjectReadiness('INTAKE', 'PLANNING', readyFacts, null)).toEqual([]);
    expect(
      evaluateProjectReadiness(
        'INTAKE',
        'PLANNING',
        { ...readyFacts, requirementsBaselineApproved: false },
        null,
      ).map((item) => item.code),
    ).toEqual(['REQUIREMENTS_BASELINE_REQUIRED']);
    expect(
      evaluateProjectReadiness(
        'PLANNING',
        'EXECUTION',
        {
          ...readyFacts,
          technicalBaselineApprovedOrWaived: false,
          uxBaselineApprovedOrWaived: false,
          moduleMapApproved: false,
          readyWorkItemCount: 0,
        },
        null,
      ).map((item) => item.code),
    ).toEqual([
      'TECHNICAL_BASELINE_OR_WAIVER_REQUIRED',
      'UX_BASELINE_OR_WAIVER_REQUIRED',
      'MODULE_MAP_REQUIRED',
      'READY_WORK_ITEM_REQUIRED',
    ]);
    expect(evaluateProjectReadiness('PLANNING', 'EXECUTION', readyFacts, null)).toEqual([]);
  });

  it('requires reason and completion facts for governed transitions', () => {
    expect(
      evaluateProjectReadiness(
        'EXECUTION',
        'COMPLETED',
        {
          ...readyFacts,
          activeSprintCount: 1,
          activeWorkCount: 2,
          completionSummaryPresent: false,
        },
        null,
      ).map((item) => item.code),
    ).toEqual(['ACTIVE_SPRINT_PRESENT', 'ACTIVE_WORK_PRESENT', 'COMPLETION_SUMMARY_REQUIRED']);
    expect(
      evaluateProjectReadiness('COMPLETED', 'ARCHIVED', readyFacts, null).map((item) => item.code),
    ).toEqual(['TRANSITION_REASON_REQUIRED']);
    expect(evaluateProjectReadiness('EXECUTION', 'COMPLETED', readyFacts, null)).toEqual([]);
    expect(
      evaluateProjectReadiness('PLANNING', 'INTAKE', readyFacts, 'short').map((item) => item.code),
    ).toEqual(['TRANSITION_REASON_REQUIRED']);
    expect(
      evaluateProjectReadiness('COMPLETED', 'ARCHIVED', readyFacts, 'Recorded reason'),
    ).toEqual([]);
  });

  it('enforces independent stakeholder and leadership invariants', () => {
    expect(validateProjectRoles(['CLIENT_STAKEHOLDER', 'VIEWER'])).toMatch(/cannot be combined/);
    expect(validateProjectRoles(['PM', 'PM'])).toMatch(/unique/);
    expect(validateProjectRoles(['LEAD', 'CONTRIBUTOR'])).toBeNull();
    expect(
      validateProjectLeadership([
        { active: true, roles: ['PM'] },
        { active: true, roles: ['LEAD'] },
      ]),
    ).toBeNull();
    expect(
      validateProjectLeadership([
        { active: true, roles: ['PM'] },
        { active: true, roles: ['PM'] },
      ]),
    ).toMatch(/exactly one/);
    expect(
      validateProjectLeadership([
        { active: true, roles: ['PM', 'LEAD'] },
        { active: true, roles: ['LEAD'] },
      ]),
    ).toMatch(/at most one/);
  });

  it('calculates capacity and inclusive date overlap deterministically', () => {
    expect(
      plannedWeeklyMinutes({
        workingWeekdays: [1, 2, 3, 4, 5],
        dailyStart: '09:00',
        dailyEnd: '17:00',
        allocationPercent: 50,
      }),
    ).toBe(1_200);
    expect(
      plannedWeeklyMinutes({
        workingWeekdays: [1],
        dailyStart: '17:00',
        dailyEnd: '09:00',
        allocationPercent: 50,
      }),
    ).toBe(0);
    expect(
      plannedWeeklyMinutes({
        workingWeekdays: [1],
        dailyStart: '09:00',
        dailyEnd: '17:00',
        allocationPercent: -1,
      }),
    ).toBe(0);
    expect(
      plannedWeeklyMinutes({
        workingWeekdays: [1],
        dailyStart: '09:00',
        dailyEnd: '17:00',
        allocationPercent: 101,
      }),
    ).toBe(0);
    expect(
      availabilityRangesOverlap(
        { effectiveFrom: '2026-07-01', effectiveTo: '2026-07-15' },
        { effectiveFrom: '2026-07-15', effectiveTo: '2026-07-31' },
      ),
    ).toBe(true);
  });

  it('preserves archive read-only and client archive rules', () => {
    expect(isProjectReadOnly('ARCHIVED')).toBe(true);
    expect(isProjectReadOnly('EXECUTION')).toBe(false);
    expect(isActiveLifecycleState('EXECUTION')).toBe(true);
    expect(isActiveLifecycleState('ARCHIVED')).toBe(false);
    expect(canArchiveClient(['COMPLETED'])).toBe(false);
    expect(canArchiveClient(['ARCHIVED', 'CANCELLED'])).toBe(true);
  });
});
