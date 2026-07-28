import { v7 as uuidv7 } from 'uuid';

import { bodyRecord, idempotencyKey } from './project-api';

export function artifactEnvelope(input: {
  body: unknown;
  workspaceId: string;
  projectId: string;
  artifactId?: string;
  actorId: string;
  correlationId: string;
  idempotencyHeader: string | null;
}) {
  return {
    ...bodyRecord(input.body),
    schemaVersion: '1',
    workspaceId: input.workspaceId,
    projectId: input.projectId,
    artifactId: input.artifactId ?? uuidv7(),
    actorId: input.actorId,
    idempotencyKey: idempotencyKey(input.idempotencyHeader),
    correlationId: input.correlationId,
  };
}

export function serverId(): string {
  return uuidv7();
}
