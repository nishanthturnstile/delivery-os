import { describe, expect, it } from 'vitest';

import type { CanonicalJsonValue } from './artifacts';
import {
  ArtifactKindRegistry,
  approvalSlotsSatisfied,
  canTransitionAttachment,
  canTransitionArtifact,
  canTransitionComment,
  canTransitionDelta,
  canViewArtifactAudience,
  canonicalizeJson,
  diffCanonicalJson,
  effectiveChildAudience,
  sha256CanonicalJson,
  validateDecisionComment,
} from './artifacts';

describe('artifact canonicalization and registry', () => {
  it('uses deterministic RFC 8785 property ordering and SHA-256', () => {
    const first = sha256CanonicalJson({ z: 1, a: ['x', true, null] });
    const second = sha256CanonicalJson({ a: ['x', true, null], z: 1 });
    expect(first).toEqual(second);
    expect(first.canonicalBody).toBe('{"a":["x",true,null],"z":1}');
    expect(first.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -0, Number.MAX_SAFE_INTEGER + 1])(
    'rejects unsafe number %s',
    (value) => {
      expect(() => canonicalizeJson(value)).toThrow();
    },
  );

  it('rejects lone surrogates and prototype-pollution keys', () => {
    expect(() => canonicalizeJson('\ud800')).toThrow();
    expect(() => canonicalizeJson('\udc00')).toThrow();
    expect(() =>
      canonicalizeJson(JSON.parse('{"__proto__":true}') as CanonicalJsonValue),
    ).toThrow();
  });

  it('serializes every canonical primitive and array branch', () => {
    expect(canonicalizeJson(null)).toBe('null');
    expect(canonicalizeJson(true)).toBe('true');
    expect(canonicalizeJson(false)).toBe('false');
    expect(canonicalizeJson('😀')).toBe('"😀"');
    expect(canonicalizeJson([null, false, 1, 'x'])).toBe('[null,false,1,"x"]');
  });

  it('rejects duplicate adapters and unknown versions', () => {
    const registry = new ArtifactKindRegistry();
    const adapter = {
      kind: 'KERNEL_TEST_ARTIFACT',
      schemaVersion: '1',
      policyVersion: '1',
      parse: (body: unknown) => body,
      normalize: () => ({ title: 'test' }),
      readHistorical: () => ({ title: 'test' }),
      projectAudience: () => ({ title: 'test' }),
      diff: () => ({ entries: [], summary: 'No changes.' }),
      approvalPolicy: [],
    };
    registry.register(adapter);
    registry.register({
      ...adapter,
      kind: 'KERNEL_TEST_COST_TABLE',
      normalize: () => ({ currency: 'USD', rows: [] }),
      projectAudience: () => ({ currency: 'USD', rows: [] }),
    });
    expect(registry.has('KERNEL_TEST_COST_TABLE', '1')).toBe(true);
    expect(() => registry.register(adapter)).toThrow(/already registered/);
    expect(() => registry.get('KERNEL_TEST_ARTIFACT', '2')).toThrow(/Unknown/);
    expect(() => registry.register({ ...adapter, kind: 'bad-kind' })).toThrow(/uppercase/);
    expect(() => registry.register({ ...adapter, kind: 'VALID_KIND', schemaVersion: '0' })).toThrow(
      /positive decimal/,
    );
  });
});

describe('artifact lifecycle policies', () => {
  it('inherits the most restrictive audience', () => {
    expect(
      effectiveChildAudience({
        artifact: 'CLIENT_VISIBLE',
        target: 'CLIENT_VISIBLE',
        child: 'TEAM_ONLY',
      }),
    ).toBe('TEAM_ONLY');
  });

  it('requires rationale for negative decisions', () => {
    expect(validateDecisionComment('REJECT', null)).toBe(false);
    expect(validateDecisionComment('APPROVE', null)).toBe(true);
  });

  it('requires all frozen approval slots', () => {
    const slots = [
      { key: 'pm', role: 'PM' as const, scope: 'INTERNAL' as const, required: true },
      {
        key: 'client',
        role: 'CLIENT_STAKEHOLDER' as const,
        scope: 'EXTERNAL_BINDING' as const,
        required: true,
      },
    ];
    expect(
      approvalSlotsSatisfied(slots, [
        { slotKey: 'pm', decision: 'APPROVE' },
        { slotKey: 'client', decision: 'APPROVE' },
      ]),
    ).toBe(true);
    expect(approvalSlotsSatisfied(slots, [{ slotKey: 'pm', decision: 'APPROVE' }])).toBe(false);
  });

  it('produces stable, path-based diffs', () => {
    expect(diffCanonicalJson({ title: 'Before' }, { title: 'After' })).toEqual({
      entries: [{ path: '/title', kind: 'CHANGED', before: 'Before', after: 'After' }],
      summary: '1 change.',
    });
  });

  it('keeps comments, attachments, and deltas on explicit state edges', () => {
    expect(canTransitionComment('OPEN', 'RESOLVED')).toBe(true);
    expect(canTransitionComment('OPEN', 'REMOVED')).toBe(true);
    expect(canTransitionComment('RESOLVED', 'OPEN')).toBe(true);
    expect(canTransitionComment('RESOLVED', 'REMOVED')).toBe(true);
    expect(canTransitionComment('REMOVED', 'OPEN')).toBe(false);
    expect(canTransitionAttachment('PENDING', 'AVAILABLE', false)).toBe(false);
    expect(canTransitionAttachment('PENDING', 'AVAILABLE', true)).toBe(true);
    expect(canTransitionAttachment('PENDING', 'QUARANTINED', true)).toBe(true);
    expect(canTransitionAttachment('PENDING', 'FAILED', true)).toBe(true);
    expect(canTransitionAttachment('AVAILABLE', 'REMOVED', false)).toBe(true);
    expect(canTransitionAttachment('REMOVED', 'REMOVED', true)).toBe(false);
    expect(canTransitionDelta('DRAFT', 'IN_REVIEW')).toBe(true);
    expect(canTransitionDelta('DRAFT', 'CANCELLED')).toBe(true);
    expect(canTransitionDelta('IN_REVIEW', 'APPLIED')).toBe(true);
    expect(canTransitionDelta('CHANGES_REQUESTED', 'DRAFT')).toBe(true);
    expect(canTransitionDelta('CHANGES_REQUESTED', 'IN_REVIEW')).toBe(true);
    expect(canTransitionDelta('CHANGES_REQUESTED', 'CANCELLED')).toBe(true);
    expect(canTransitionDelta('APPLIED', 'DRAFT')).toBe(false);
  });

  it('keeps artifact reads and transitions audience-safe', () => {
    expect(canViewArtifactAudience(['PM'], 'TEAM_ONLY')).toBe(true);
    expect(canViewArtifactAudience(['CLIENT_STAKEHOLDER'], 'CLIENT_VISIBLE')).toBe(true);
    expect(canViewArtifactAudience(['CLIENT_STAKEHOLDER'], 'TEAM_ONLY')).toBe(false);
    expect(canViewArtifactAudience(['CLIENT_STAKEHOLDER', 'PM'], 'CLIENT_VISIBLE')).toBe(false);
    expect(canViewArtifactAudience([], 'CLIENT_VISIBLE')).toBe(false);
    expect(canTransitionArtifact('DRAFT', 'IN_REVIEW')).toBe(true);
    expect(canTransitionArtifact('APPROVED', 'DRAFT')).toBe(false);
  });

  it('diffs additions, removals, nested objects, and arrays without hidden values', () => {
    expect(diffCanonicalJson({}, { added: true }).entries[0]).toMatchObject({
      path: '/added',
      kind: 'ADDED',
    });
    expect(diffCanonicalJson({ removed: true }, {}).entries[0]).toMatchObject({
      path: '/removed',
      kind: 'REMOVED',
    });
    expect(diffCanonicalJson({ nested: { a: 1 } }, { nested: { a: 2 } }).entries[0]?.path).toBe(
      '/nested/a',
    );
    expect(diffCanonicalJson([1], [2]).entries[0]).toMatchObject({
      path: '/',
      kind: 'CHANGED',
    });
    expect(diffCanonicalJson({ same: true }, { same: true }).summary).toBe('No changes.');
  });
});
