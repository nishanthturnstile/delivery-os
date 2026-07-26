import type { OcrPageResultStore } from '@delivery-os/application';

import type { DatabasePool } from './pool';

export class PostgresOcrPageResultStore implements OcrPageResultStore {
  constructor(private readonly pool: DatabasePool) {}

  async commit(
    input: Parameters<OcrPageResultStore['commit']>[0],
  ): ReturnType<OcrPageResultStore['commit']> {
    const result = await this.pool.query<{ id: string; output_hash: string; inserted: boolean }>(
      `with inserted as (
         insert into ocr_page_results
           (id, workspace_id, project_id, source_generation_id, page_number, input_hash,
            renderer_version, model_version, model_digest, config_version, output_hash,
            minimum_confidence, needs_attention, result_json)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb)
         on conflict
           (source_generation_id, page_number, input_hash, renderer_version, model_digest, config_version)
         do nothing
         returning id, output_hash
       )
       select id, output_hash, true as inserted from inserted
       union all
       select id, output_hash, false as inserted from ocr_page_results
        where source_generation_id = $4 and page_number = $5 and input_hash = $6
          and renderer_version = $7 and model_digest = $9 and config_version = $10
       limit 1`,
      [
        input.id,
        input.workspaceId,
        input.projectId,
        input.sourceGenerationId,
        input.pageNumber,
        input.inputHash,
        input.rendererVersion,
        input.modelVersion,
        input.modelDigest,
        input.configVersion,
        input.outputHash,
        input.minimumConfidence,
        input.needsAttention,
        JSON.stringify(input.result),
      ],
    );
    const row = result.rows[0];
    if (row?.output_hash !== input.outputHash) {
      throw new Error('OCR_DETERMINISM_CONFLICT');
    }
    return { id: row.id, replayed: !row.inserted };
  }
}
