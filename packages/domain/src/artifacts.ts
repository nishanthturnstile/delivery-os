import { createHash } from 'node:crypto';

export type CanonicalJsonValue =
  null | boolean | number | string | CanonicalJsonValue[] | { [key: string]: CanonicalJsonValue };

export type ArtifactAudience = 'TEAM_ONLY' | 'CLIENT_VISIBLE';
export type ArtifactState = 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED';
export type ApprovalRequestState =
  'OPEN' | 'APPROVED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'CANCELLED';
export type ApprovalDecisionKind = 'APPROVE' | 'REJECT' | 'CHANGES_REQUESTED';
export type ArtifactRole = 'PM' | 'LEAD' | 'CONTRIBUTOR' | 'VIEWER' | 'CLIENT_STAKEHOLDER';

export interface ArtifactDiffEntry {
  path: string;
  kind: 'ADDED' | 'REMOVED' | 'CHANGED';
  before?: CanonicalJsonValue;
  after?: CanonicalJsonValue;
}

export interface ArtifactDiff {
  entries: ArtifactDiffEntry[];
  summary: string;
}

export interface ArtifactApprovalSlot {
  key: string;
  role: ArtifactRole;
  scope: 'INTERNAL' | 'EXTERNAL_BINDING';
  required: boolean;
}

export interface ArtifactKindAdapter<TBody = unknown> {
  kind: string;
  schemaVersion: string;
  policyVersion: string;
  parse(body: unknown): TBody;
  normalize(body: TBody): CanonicalJsonValue;
  readHistorical(canonicalBody: string): TBody;
  projectAudience(body: TBody, audience: ArtifactAudience): CanonicalJsonValue;
  diff(before: TBody, after: TBody, audience: ArtifactAudience): ArtifactDiff;
  approvalPolicy: readonly ArtifactApprovalSlot[];
}

const forbiddenKeys = new Set(['__proto__', 'constructor', 'prototype']);

function assertValidString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError('Canonical JSON rejects lone high surrogates.');
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError('Canonical JSON rejects lone low surrogates.');
    }
  }
}

function canonicalizeValue(value: CanonicalJsonValue): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') {
    assertValidString(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError('Canonical JSON requires finite numbers and rejects negative zero.');
    }
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError('Canonical JSON rejects integers outside the interoperable safe range.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeValue(item)).join(',')}]`;
  }
  const entries = Object.keys(value)
    .sort()
    .map((key) => {
      assertValidString(key);
      if (forbiddenKeys.has(key)) throw new TypeError(`Canonical JSON rejects key ${key}.`);
      return `${JSON.stringify(key)}:${canonicalizeValue(value[key] as CanonicalJsonValue)}`;
    });
  return `{${entries.join(',')}}`;
}

export function canonicalizeJson(value: CanonicalJsonValue): string {
  return canonicalizeValue(value);
}

export function sha256CanonicalJson(value: CanonicalJsonValue): {
  canonicalBody: string;
  contentHash: string;
} {
  const canonicalBody = canonicalizeJson(value);
  return {
    canonicalBody,
    contentHash: createHash('sha256').update(canonicalBody, 'utf8').digest('hex'),
  };
}

export class ArtifactKindRegistry {
  readonly #entries = new Map<string, ArtifactKindAdapter>();

  register<TBody>(adapter: ArtifactKindAdapter<TBody>): void {
    const key = this.key(adapter.kind, adapter.schemaVersion);
    if (this.#entries.has(key)) {
      throw new Error(`Artifact adapter already registered: ${key}`);
    }
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(adapter.kind)) {
      throw new Error('Artifact kind must be a bounded uppercase key.');
    }
    if (!/^[1-9]\d{0,7}$/.test(adapter.schemaVersion)) {
      throw new Error('Artifact schema version must be a positive decimal string.');
    }
    this.#entries.set(key, adapter);
  }

  get(kind: string, schemaVersion: string): ArtifactKindAdapter {
    const adapter = this.#entries.get(this.key(kind, schemaVersion));
    if (adapter === undefined) {
      throw new Error(`Unknown artifact kind/schema version: ${kind}@${schemaVersion}`);
    }
    return adapter;
  }

  has(kind: string, schemaVersion: string): boolean {
    return this.#entries.has(this.key(kind, schemaVersion));
  }

  private key(kind: string, schemaVersion: string): string {
    return `${kind}@${schemaVersion}`;
  }
}

export function mostRestrictiveAudience(...audiences: ArtifactAudience[]): ArtifactAudience {
  return audiences.includes('TEAM_ONLY') ? 'TEAM_ONLY' : 'CLIENT_VISIBLE';
}

export function effectiveChildAudience(input: {
  artifact: ArtifactAudience;
  target: ArtifactAudience;
  child: ArtifactAudience;
}): ArtifactAudience {
  return mostRestrictiveAudience(input.artifact, input.target, input.child);
}

export function canViewArtifactAudience(
  roles: readonly ArtifactRole[],
  audience: ArtifactAudience,
): boolean {
  if (roles.includes('CLIENT_STAKEHOLDER')) {
    return audience === 'CLIENT_VISIBLE' && roles.length === 1;
  }
  return roles.some((role) => role !== 'CLIENT_STAKEHOLDER');
}

const artifactTransitions: Record<ArtifactState, readonly ArtifactState[]> = {
  DRAFT: ['IN_REVIEW'],
  IN_REVIEW: ['APPROVED', 'CHANGES_REQUESTED'],
  CHANGES_REQUESTED: ['DRAFT', 'IN_REVIEW'],
  APPROVED: [],
};

export function canTransitionArtifact(from: ArtifactState, to: ArtifactState): boolean {
  return artifactTransitions[from].includes(to);
}

export function canTransitionComment(
  from: 'OPEN' | 'RESOLVED' | 'REMOVED',
  to: 'OPEN' | 'RESOLVED' | 'REMOVED',
): boolean {
  return (
    (from === 'OPEN' && (to === 'RESOLVED' || to === 'REMOVED')) ||
    (from === 'RESOLVED' && (to === 'OPEN' || to === 'REMOVED'))
  );
}

export function canTransitionAttachment(
  from: 'PENDING' | 'AVAILABLE' | 'QUARANTINED' | 'FAILED' | 'REMOVED',
  to: 'AVAILABLE' | 'QUARANTINED' | 'FAILED' | 'REMOVED',
  trustedObjectPort: boolean,
): boolean {
  if (to === 'REMOVED') return from !== 'REMOVED';
  if (!trustedObjectPort || from !== 'PENDING') return false;
  return to === 'AVAILABLE' || to === 'QUARANTINED' || to === 'FAILED';
}

export function canTransitionDelta(
  from: 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED' | 'CANCELLED' | 'APPLIED',
  to: 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'REJECTED' | 'CANCELLED' | 'APPLIED',
): boolean {
  if (from === 'DRAFT') return to === 'IN_REVIEW' || to === 'CANCELLED';
  if (from === 'IN_REVIEW') {
    return ['CHANGES_REQUESTED', 'REJECTED', 'CANCELLED', 'APPLIED'].includes(to);
  }
  if (from === 'CHANGES_REQUESTED')
    return to === 'DRAFT' || to === 'IN_REVIEW' || to === 'CANCELLED';
  return false;
}

export function validateDecisionComment(
  decision: ApprovalDecisionKind | 'CANCEL',
  comment: string | null,
): boolean {
  return decision === 'APPROVE' || (comment !== null && comment.trim().length >= 2);
}

export function approvalSlotsSatisfied(
  slots: readonly ArtifactApprovalSlot[],
  decisions: readonly { slotKey: string; decision: ApprovalDecisionKind }[],
): boolean {
  return slots
    .filter((slot) => slot.required)
    .every((slot) =>
      decisions.some(
        (decision) => decision.slotKey === slot.key && decision.decision === 'APPROVE',
      ),
    );
}

function escapePointer(value: string): string {
  return value.replaceAll('~', '~0').replaceAll('/', '~1');
}

export function diffCanonicalJson(
  before: CanonicalJsonValue,
  after: CanonicalJsonValue,
  path = '',
): ArtifactDiff {
  const entries: ArtifactDiffEntry[] = [];
  if (canonicalizeJson(before) === canonicalizeJson(after)) {
    return { entries, summary: 'No changes.' };
  }
  if (
    before !== null &&
    after !== null &&
    typeof before === 'object' &&
    typeof after === 'object' &&
    !Array.isArray(before) &&
    !Array.isArray(after)
  ) {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    for (const key of keys) {
      const nextPath = `${path}/${escapePointer(key)}`;
      if (!(key in before)) {
        const afterValue = after[key];
        if (afterValue === undefined)
          throw new TypeError('Canonical JSON cannot contain undefined.');
        entries.push({ path: nextPath, kind: 'ADDED', after: afterValue });
      } else if (!(key in after)) {
        const beforeValue = before[key];
        if (beforeValue === undefined)
          throw new TypeError('Canonical JSON cannot contain undefined.');
        entries.push({ path: nextPath, kind: 'REMOVED', before: beforeValue });
      } else {
        const beforeValue = before[key];
        const afterValue = after[key];
        if (beforeValue === undefined || afterValue === undefined) {
          throw new TypeError('Canonical JSON cannot contain undefined.');
        }
        entries.push(...diffCanonicalJson(beforeValue, afterValue, nextPath).entries);
      }
    }
  } else {
    entries.push({ path: path || '/', kind: 'CHANGED', before, after });
  }
  return {
    entries,
    summary: `${entries.length} ${entries.length === 1 ? 'change' : 'changes'}.`,
  };
}
