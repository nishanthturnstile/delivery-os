import type {
  ArtifactAudience,
  ArtifactKindAdapter,
  CanonicalJsonValue,
  SubmissionGuardResult,
} from './artifacts';
import { diffCanonicalJson, mostRestrictiveAudience, sha256CanonicalJson } from './artifacts';

export type RequirementSection = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H';
export type RequirementValue = string | string[] | Record<string, string>[];
export type ApplicabilityExpression =
  | { operator: 'all'; operands: ApplicabilityExpression[] }
  | { operator: 'any'; operands: ApplicabilityExpression[] }
  | { operator: 'not'; operand: ApplicabilityExpression }
  | { operator: 'equals'; fieldKey: string; value: string | boolean }
  | { operator: 'present'; fieldKey: string };

export interface RequirementFieldDefinition {
  key: string;
  section: RequirementSection;
  order: number;
  label: string;
  description: string;
  valueType: 'short_text' | 'long_text' | 'string_list' | 'structured_list' | 'date' | 'enum';
  mandatory: boolean;
  acceptedRiskAllowed: boolean;
  citationExpected: boolean;
  applicability: ApplicabilityExpression | null;
  configurableApplicability: boolean;
  system: boolean;
}

export interface RequirementFieldEntry {
  key: string;
  value: RequirementValue | null;
  state: 'UNRESOLVED' | 'RESOLVED' | 'NOT_APPLICABLE' | 'ACCEPTED_RISK';
  audience: ArtifactAudience;
  citationIds: string[];
  humanNote: string | null;
  riskOwnerId: string | null;
  riskReviewDate: string | null;
}

export interface RequirementBody {
  templateSnapshotId: string;
  templateHash: string;
  fields: RequirementFieldEntry[];
}

export interface WorkspaceTemplateExtension {
  optionalFields: RequirementFieldDefinition[];
  applicabilityOverrides: Record<string, ApplicabilityExpression | null>;
}

const externalOnly: ApplicabilityExpression = {
  operator: 'equals',
  fieldKey: 'project_type',
  value: 'EXTERNAL',
};

function field(
  section: RequirementSection,
  order: number,
  key: string,
  label: string,
  valueType: RequirementFieldDefinition['valueType'],
  options: Partial<
    Pick<
      RequirementFieldDefinition,
      | 'mandatory'
      | 'acceptedRiskAllowed'
      | 'citationExpected'
      | 'applicability'
      | 'configurableApplicability'
    >
  > = {},
): RequirementFieldDefinition {
  return {
    key,
    section,
    order,
    label,
    description: label,
    valueType,
    mandatory: options.mandatory ?? true,
    acceptedRiskAllowed: options.acceptedRiskAllowed ?? true,
    citationExpected: options.citationExpected ?? true,
    applicability: options.applicability ?? null,
    configurableApplicability: options.configurableApplicability ?? false,
    system: true,
  };
}

export const REQUIREMENT_TEMPLATE_VERSION = '1';
export const REQUIREMENT_TEMPLATE_FIELDS: readonly RequirementFieldDefinition[] = [
  field('A', 10, 'project_name', 'Project name', 'short_text', {
    acceptedRiskAllowed: false,
    citationExpected: false,
  }),
  field('A', 20, 'project_type', 'Project type', 'enum', {
    acceptedRiskAllowed: false,
    citationExpected: false,
  }),
  field('A', 30, 'client', 'Client', 'short_text', {
    acceptedRiskAllowed: false,
    applicability: externalOnly,
  }),
  field('A', 40, 'sponsor_primary_contact', 'Sponsor / primary contact', 'short_text'),
  field('A', 50, 'team_size_composition', 'Team size and composition', 'long_text'),
  field('A', 60, 'target_start', 'Target start', 'date'),
  field('A', 70, 'target_end', 'Target end', 'date'),
  field('A', 80, 'budget_band', 'Budget band', 'short_text', {
    mandatory: false,
    configurableApplicability: true,
  }),
  field('B', 10, 'problem_summary', 'Problem summary', 'short_text'),
  field('B', 20, 'problem_description', 'Problem description', 'long_text'),
  field('B', 30, 'personas_user_roles', 'Personas / user roles', 'structured_list'),
  field('B', 40, 'pain_points_jobs', 'Current pain points / jobs to be done', 'string_list'),
  field('B', 50, 'business_success_metrics', 'Business success metrics', 'structured_list'),
  field('C', 10, 'in_scope_capabilities', 'In-scope capabilities', 'string_list'),
  field('C', 20, 'out_of_scope_items', 'Explicit out-of-scope items', 'string_list'),
  field('C', 30, 'assumptions', 'Assumptions', 'string_list'),
  field('C', 40, 'constraints', 'Constraints', 'string_list'),
  field('C', 50, 'dependencies', 'Dependencies', 'structured_list'),
  field('D', 10, 'user_journeys', 'User journeys / flows', 'structured_list'),
  field('D', 20, 'feature_list', 'High-level feature list', 'structured_list'),
  field('D', 30, 'data_entities', 'Data entities involved', 'string_list'),
  field('D', 40, 'business_rules', 'Key business rules', 'string_list'),
  field('E', 10, 'performance_scale', 'Performance and scale targets', 'long_text'),
  field('E', 20, 'availability_uptime', 'Availability / uptime expectations', 'long_text'),
  field('E', 30, 'security_requirements', 'Security requirements', 'string_list'),
  field('E', 40, 'compliance_requirements', 'Compliance requirements', 'string_list', {
    configurableApplicability: true,
  }),
  field('E', 50, 'accessibility_requirements', 'Accessibility requirements', 'string_list'),
  field('E', 60, 'localization_requirements', 'Localization / i18n requirements', 'string_list', {
    configurableApplicability: true,
  }),
  field('F', 10, 'external_systems_apis', 'External systems and APIs', 'structured_list', {
    configurableApplicability: true,
  }),
  field('F', 20, 'authentication_sso', 'Authentication / SSO', 'long_text', {
    configurableApplicability: true,
  }),
  field('F', 30, 'payment_providers', 'Payment providers', 'structured_list', {
    configurableApplicability: true,
  }),
  field('F', 40, 'communication_channels', 'Communication channels', 'string_list', {
    configurableApplicability: true,
  }),
  field('F', 50, 'data_import_export', 'Data import/export needs', 'string_list', {
    configurableApplicability: true,
  }),
  field('G', 10, 'deployment_target', 'Deployment target', 'enum'),
  field('G', 20, 'environment_strategy', 'Environment strategy', 'long_text'),
  field('G', 30, 'handover_model', 'Handover model', 'long_text'),
  field('G', 40, 'post_launch_support', 'Post-launch support expectations', 'long_text'),
  field('H', 10, 'known_risks', 'Known risks', 'structured_list'),
  field('H', 20, 'unknowns', 'Unknowns to be resolved', 'string_list'),
  field('H', 30, 'decisions_pending', 'Decisions pending', 'string_list'),
  field('H', 40, 'assumptions_to_validate', 'Assumptions that need validation', 'string_list'),
];

function valuePresent(value: RequirementValue | null | undefined): boolean {
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return false;
}

export function evaluateApplicability(
  expression: ApplicabilityExpression | null,
  values: ReadonlyMap<string, RequirementValue | null>,
  depth = 0,
): boolean {
  if (expression === null) return true;
  if (depth > 16) throw new Error('Applicability expression exceeds the maximum depth.');
  if (expression.operator === 'all') {
    return expression.operands.every((item) => evaluateApplicability(item, values, depth + 1));
  }
  if (expression.operator === 'any') {
    return expression.operands.some((item) => evaluateApplicability(item, values, depth + 1));
  }
  if (expression.operator === 'not') {
    return !evaluateApplicability(expression.operand, values, depth + 1);
  }
  const actual = values.get(expression.fieldKey);
  if (expression.operator === 'present') return valuePresent(actual);
  return actual === expression.value;
}

function assertFieldDefinition(fieldDefinition: RequirementFieldDefinition): void {
  if (!/^[a-z][a-z0-9_]{1,79}$/.test(fieldDefinition.key)) {
    throw new Error(`Invalid Requirement field key: ${fieldDefinition.key}`);
  }
  if (fieldDefinition.label.trim().length === 0) throw new Error('Field label is required.');
  if (fieldDefinition.order < 0 || !Number.isSafeInteger(fieldDefinition.order)) {
    throw new Error('Field order must be a non-negative safe integer.');
  }
}

export function mergeRequirementTemplate(
  extension: WorkspaceTemplateExtension | null,
): RequirementFieldDefinition[] {
  const merged = REQUIREMENT_TEMPLATE_FIELDS.map((item) => ({ ...item }));
  if (extension === null) return merged;
  const byKey = new Map(merged.map((item) => [item.key, item]));
  for (const optionalField of extension.optionalFields) {
    assertFieldDefinition(optionalField);
    if (optionalField.system || optionalField.mandatory) {
      throw new Error('Workspace fields must be optional and workspace-owned.');
    }
    if (byKey.has(optionalField.key)) throw new Error('Workspace field key already exists.');
    byKey.set(optionalField.key, { ...optionalField });
    merged.push({ ...optionalField });
  }
  for (const [key, expression] of Object.entries(extension.applicabilityOverrides)) {
    const existing = byKey.get(key);
    if (!existing?.configurableApplicability) {
      throw new Error(`Applicability is not configurable for field: ${key}`);
    }
    existing.applicability = expression;
  }
  return merged.sort(
    (left, right) =>
      left.section.localeCompare(right.section) ||
      left.order - right.order ||
      left.key.localeCompare(right.key),
  );
}

export function evaluateRequirementReadiness(input: {
  body: RequirementBody;
  template: readonly RequirementFieldDefinition[];
  openConflictIds: readonly string[];
  blockingGapIds: readonly string[];
}): SubmissionGuardResult & { blockingFieldKeys: string[] } {
  const entries = new Map(input.body.fields.map((item) => [item.key, item]));
  const values = new Map(input.body.fields.map((item) => [item.key, item.value]));
  const blockingFieldKeys: string[] = [];
  for (const definition of input.template) {
    if (!definition.mandatory || !evaluateApplicability(definition.applicability, values)) continue;
    const entry = entries.get(definition.key);
    const resolved =
      entry !== undefined &&
      ((entry.state === 'RESOLVED' && valuePresent(entry.value)) ||
        (entry.state === 'NOT_APPLICABLE' &&
          entry.humanNote !== null &&
          entry.humanNote.trim().length >= 8) ||
        (entry.state === 'ACCEPTED_RISK' &&
          definition.acceptedRiskAllowed &&
          entry.humanNote !== null &&
          entry.riskOwnerId !== null &&
          entry.riskReviewDate !== null));
    if (!resolved) blockingFieldKeys.push(definition.key);
  }
  const unmetCriteria = [
    ...blockingFieldKeys.map((key) => ({
      code: 'REQUIREMENT_FIELD_UNRESOLVED',
      message: `Resolve required field: ${key}`,
    })),
    ...input.openConflictIds.map((id) => ({
      code: 'CONFLICT_UNRESOLVED',
      message: `Resolve Requirement conflict ${id}.`,
    })),
    ...input.blockingGapIds.map((id) => ({
      code: 'BLOCKING_GAP',
      message: `Resolve Requirement gap ${id}.`,
    })),
  ];
  return { ready: unmetCriteria.length === 0, unmetCriteria, blockingFieldKeys };
}

export function requirementRecordFingerprint(input: {
  kind: 'CLAIM' | 'CONFLICT' | 'GAP';
  intakeSetId?: string;
  artifactId?: string;
  fieldKey: string;
  value?: RequirementValue;
  claimIds?: readonly string[];
  reason?: string;
}): string {
  return sha256CanonicalJson({
    kind: input.kind,
    intakeSetId: input.intakeSetId ?? null,
    artifactId: input.artifactId ?? null,
    fieldKey: input.fieldKey,
    value:
      input.value === undefined
        ? null
        : (JSON.parse(JSON.stringify(normalizeValue(input.value))) as CanonicalJsonValue),
    claimIds: [...(input.claimIds ?? [])].sort(),
    reason: input.reason ?? null,
  }).contentHash;
}

export function deriveDeterministicGaps(input: {
  body: RequirementBody;
  template: readonly RequirementFieldDefinition[];
}): { fieldKey: string; reason: 'MISSING' | 'CONDITIONALLY_REQUIRED'; blocking: boolean }[] {
  const entries = new Map(input.body.fields.map((entry) => [entry.key, entry]));
  const values = new Map(input.body.fields.map((entry) => [entry.key, entry.value]));
  return input.template.flatMap((definition) => {
    const applicable = evaluateApplicability(definition.applicability, values);
    if (!applicable || !definition.mandatory) return [];
    const entry = entries.get(definition.key);
    if (
      entry !== undefined &&
      (entry.state === 'NOT_APPLICABLE' ||
        entry.state === 'ACCEPTED_RISK' ||
        (entry.state === 'RESOLVED' && valuePresent(entry.value)))
    ) {
      return [];
    }
    return [
      {
        fieldKey: definition.key,
        reason: definition.applicability === null ? 'MISSING' : 'CONDITIONALLY_REQUIRED',
        blocking: true,
      } as const,
    ];
  });
}

function parseRequirementBody(value: unknown): RequirementBody {
  if (typeof value !== 'object' || value === null) throw new Error('Requirement body is invalid.');
  const body = value as Partial<RequirementBody>;
  if (
    typeof body.templateSnapshotId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(body.templateHash ?? '') ||
    !Array.isArray(body.fields)
  ) {
    throw new Error('Requirement body is invalid.');
  }
  const keys = new Set<string>();
  for (const entry of body.fields) {
    if (
      typeof entry !== 'object' ||
      entry === null ||
      typeof entry.key !== 'string' ||
      keys.has(entry.key)
    ) {
      throw new Error('Requirement fields must have unique stable keys.');
    }
    keys.add(entry.key);
  }
  return body as RequirementBody;
}

function normalizeValue(value: RequirementValue | null): CanonicalJsonValue {
  if (value === null || typeof value === 'string') return value;
  return value.map((item) => {
    if (typeof item === 'string') return item;
    return Object.fromEntries(
      Object.entries(item)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, child]),
    );
  });
}

function normalizeRequirementBody(
  body: RequirementBody,
  audience?: ArtifactAudience,
): CanonicalJsonValue {
  const fields = body.fields
    .filter((entry) => audience !== 'CLIENT_VISIBLE' || entry.audience === 'CLIENT_VISIBLE')
    .map((entry) => ({
      key: entry.key,
      value: normalizeValue(entry.value),
      state: entry.state,
      audience:
        audience === undefined ? entry.audience : mostRestrictiveAudience(audience, entry.audience),
      citationIds: [...entry.citationIds].sort(),
      humanNote: entry.humanNote,
      riskOwnerId: entry.riskOwnerId,
      riskReviewDate: entry.riskReviewDate,
    }));
  return {
    templateSnapshotId: body.templateSnapshotId,
    templateHash: body.templateHash,
    fields,
  };
}

export function createRequirementArtifactAdapter(input: {
  externalProject: boolean;
}): ArtifactKindAdapter<RequirementBody> {
  const approvalPolicy = [
    { key: 'pm', role: 'PM' as const, scope: 'INTERNAL' as const, required: true },
    ...(input.externalProject
      ? [
          {
            key: 'client',
            role: 'CLIENT_STAKEHOLDER' as const,
            scope: 'EXTERNAL_BINDING' as const,
            required: true,
          },
        ]
      : []),
  ];
  return {
    kind: 'REQUIREMENT',
    schemaVersion: '1',
    policyVersion: '1',
    parse: parseRequirementBody,
    normalize: (body) => normalizeRequirementBody(body),
    readHistorical: (canonicalBody) => parseRequirementBody(JSON.parse(canonicalBody)),
    projectAudience: (body, audience) => normalizeRequirementBody(body, audience),
    diff: (before, after, audience) =>
      diffCanonicalJson(
        normalizeRequirementBody(before, audience),
        normalizeRequirementBody(after, audience),
      ),
    submissionGuard: () => ({ ready: true, unmetCriteria: [] }),
    approvalPolicy,
  };
}
