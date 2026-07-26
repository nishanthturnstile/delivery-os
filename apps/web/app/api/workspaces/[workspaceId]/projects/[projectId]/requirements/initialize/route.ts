import { createArtifactCommandSchema } from '@delivery-os/contracts';
import { REQUIREMENT_TEMPLATE_FIELDS } from '@delivery-os/domain';
import { NextResponse, type NextRequest } from 'next/server';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';

import { apiError, requireUser } from '@/lib/api';
import { artifactStore, authPool, requirementStore } from '@/lib/auth';

interface RouteContext {
  params: Promise<{ workspaceId: string; projectId: string }>;
}

const inputSchema = z
  .object({
    title: z.string().trim().min(2).max(200).default('Project Requirement'),
    audience: z.enum(['TEAM_ONLY', 'CLIENT_VISIBLE']).default('TEAM_ONLY'),
  })
  .strict();

export async function POST(request: NextRequest, context: RouteContext) {
  let correlationId = uuidv7();
  try {
    const authContext = await requireUser(request);
    correlationId = authContext.correlationId;
    const actorId = authContext.session.user.id;
    const { workspaceId, projectId } = await context.params;
    const input = inputSchema.parse(await request.json());
    const current = (await artifactStore.listArtifacts(actorId, workspaceId, projectId)).find(
      (artifact) => artifact.kind === 'REQUIREMENT',
    );
    if (current !== undefined) return NextResponse.json(current);

    let template = await authPool.query<{ id: string; template_hash: string }>(
      `select id, template_hash from requirement_template_versions
        where workspace_id = $1 and state = 'PUBLISHED'
        order by version desc limit 1`,
      [workspaceId],
    );
    if (template.rows[0] === undefined) {
      const published = await requirementStore.publishTemplate({
        workspaceId,
        actorId,
        templateVersionId: uuidv7(),
        expectedRevision: 0,
        idempotencyKey: uuidv7(),
        correlationId,
        extension: {
          schemaVersion: '1',
          baseTemplateVersion: '1',
          optionalFields: [],
          applicabilityOverrides: {},
        },
      });
      template = {
        ...template,
        rows: [{ id: published.id, template_hash: published.templateHash }],
      };
    }
    const selected = template.rows[0];
    if (selected === undefined) throw new Error('REQUIREMENT_TEMPLATE_UNAVAILABLE');
    const frozen = await requirementStore.snapshotTemplate({
      workspaceId,
      projectId,
      actorId,
      snapshotId: uuidv7(),
      templateVersionId: selected.id,
      idempotencyKey: uuidv7(),
      correlationId,
    });
    const project = await authPool.query<{
      name: string;
      type: 'INTERNAL' | 'EXTERNAL';
      target_start: string;
      target_end: string;
    }>(
      `select name, type, target_start::text, target_end::text
         from projects where workspace_id = $1 and id = $2`,
      [workspaceId, projectId],
    );
    const facts = project.rows[0];
    const body = {
      templateSnapshotId: frozen.id,
      templateHash: frozen.templateHash,
      fields: REQUIREMENT_TEMPLATE_FIELDS.map((field) => {
        const prefilled =
          field.key === 'project_name'
            ? facts?.name
            : field.key === 'project_type'
              ? facts?.type
              : field.key === 'target_start'
                ? facts?.target_start
                : field.key === 'target_end'
                  ? facts?.target_end
                  : undefined;
        return {
          key: field.key,
          value: prefilled ?? null,
          state: prefilled === undefined ? ('UNRESOLVED' as const) : ('RESOLVED' as const),
          audience: input.audience,
          citationIds: [],
          humanNote: null,
          riskOwnerId: null,
          riskReviewDate: null,
        };
      }),
    };
    const artifactId = uuidv7();
    const result = await artifactStore.createArtifact(
      createArtifactCommandSchema.parse({
        schemaVersion: '1',
        workspaceId,
        projectId,
        artifactId,
        actorId,
        expectedRevision: 0,
        idempotencyKey: uuidv7(),
        correlationId,
        draftRevisionId: uuidv7(),
        audienceRecordId: uuidv7(),
        command: {
          kind: 'REQUIREMENT',
          schemaVersion: '1',
          policyVersion: '1',
          title: input.title,
          audience: input.audience,
          body,
        },
      }),
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return apiError(error, correlationId);
  }
}
