import type {
  RequirementBody,
  RequirementFieldDefinition,
  WorkspaceTemplateExtension,
} from '@delivery-os/contracts';

export type RequirementValue = string | string[] | Record<string, string>[];

export interface RequirementMutationEnvelope {
  workspaceId: string;
  projectId: string;
  artifactId: string;
  actorId: string;
  expectedRevision: number;
  idempotencyKey: string;
  correlationId: string;
}

export interface RequirementTemplateStore {
  publishTemplate(input: {
    workspaceId: string;
    actorId: string;
    templateVersionId: string;
    expectedRevision: number;
    idempotencyKey: string;
    correlationId: string;
    extension: WorkspaceTemplateExtension;
  }): Promise<{ id: string; version: number; templateHash: string }>;
  snapshotTemplate(input: {
    workspaceId: string;
    projectId: string;
    actorId: string;
    snapshotId: string;
    templateVersionId: string;
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ id: string; templateHash: string; fields: RequirementFieldDefinition[] }>;
}

export interface RequirementCommandStore {
  saveField(
    input: RequirementMutationEnvelope & {
      fieldRevisionId: string;
      fieldKey: string;
      value: RequirementValue | null;
      state: 'UNRESOLVED' | 'RESOLVED' | 'NOT_APPLICABLE' | 'ACCEPTED_RISK';
      audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
      humanNote: string | null;
      riskOwnerId: string | null;
      riskReviewDate: string | null;
    },
  ): Promise<{ revision: number }>;
  createCitation(input: {
    workspaceId: string;
    projectId: string;
    actorId: string;
    citationId: string;
    sourceGenerationId: string;
    locatorId: string;
    blockIds: string[];
    locatorExcerptHash: string;
    audience: 'TEAM_ONLY' | 'CLIENT_VISIBLE';
    idempotencyKey: string;
    correlationId: string;
  }): Promise<{ id: string }>;
}

export interface RequirementQueryStore {
  getBody(
    actorId: string,
    workspaceId: string,
    projectId: string,
    artifactId: string,
  ): Promise<RequirementBody>;
}
