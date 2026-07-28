import { describe, expect, it } from 'vitest';

import {
  migrateDatabase,
  migrateDatabaseThroughM2,
  migrateDatabaseThroughS3,
  migrateDatabaseThroughW1,
  withTemporaryDatabase,
} from '../helpers/database';

describe('checked-in PostgreSQL migrations', () => {
  it('applies cleanly to an empty database', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const result = await pool.query<{ projects: string | null; availability: string | null }>(
        `select
           to_regclass('public.projects')::text as projects,
           to_regclass('public.member_availability')::text as availability`,
      );
      expect(result.rows[0]).toEqual({
        projects: 'projects',
        availability: 'member_availability',
      });
    });
  });

  it('preserves the prior-schema marker while applying W0', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await pool.query(
        `create table prior_schema_marker (
           version integer primary key,
           recorded_at timestamptz not null default now()
         )`,
      );
      await pool.query('insert into prior_schema_marker (version) values (0)');

      await migrateDatabase(pool);

      const marker = await pool.query<{ version: number }>(
        'select version from prior_schema_marker',
      );
      const migration = await pool.query<{ name: string | null }>(
        `select to_regclass('public.auth_sessions')::text as name`,
      );
      expect(marker.rows[0]?.version).toBe(0);
      expect(migration.rows[0]?.name).toBe('auth_sessions');
    });
  });

  it('upgrades the validated W1 schema additively to M2', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabaseThroughW1(pool);
      const before = await pool.query<{ workspace: string | null; project: string | null }>(
        `select
           to_regclass('public.workspace_memberships')::text as workspace,
           to_regclass('public.projects')::text as project`,
      );
      expect(before.rows[0]).toEqual({
        workspace: 'workspace_memberships',
        project: null,
      });

      await migrateDatabase(pool);

      const after = await pool.query<{
        project: string | null;
        lifecycle: string | null;
        outcome: string | null;
      }>(
        `select
           to_regclass('public.projects')::text as project,
           to_regclass('public.project_lifecycle_history')::text as lifecycle,
           to_regclass('public.project_outcome_modules')::text as outcome`,
      );
      expect(after.rows[0]).toEqual({
        project: 'projects',
        lifecycle: 'project_lifecycle_history',
        outcome: 'project_outcome_modules',
      });
    });
  });

  it('upgrades the validated M2 schema additively to the artifact kernel', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabaseThroughM2(pool);
      const before = await pool.query<{ project: string | null; artifact: string | null }>(
        `select to_regclass('public.projects')::text as project,
                to_regclass('public.artifacts')::text as artifact`,
      );
      expect(before.rows[0]).toEqual({ project: 'projects', artifact: null });

      await migrateDatabase(pool);
      const after = await pool.query<{
        artifact: string | null;
        snapshot: string | null;
        baseline: string | null;
        immutableTrigger: string | null;
      }>(
        `select
           to_regclass('public.artifacts')::text as artifact,
           to_regclass('public.artifact_review_snapshots')::text as snapshot,
           to_regclass('public.artifact_baselines')::text as baseline,
           (select tgname from pg_trigger
             where tgrelid = 'artifact_review_snapshots'::regclass
               and tgname = 'artifact_review_snapshots_immutable') as "immutableTrigger"`,
      );
      expect(after.rows[0]).toEqual({
        artifact: 'artifacts',
        snapshot: 'artifact_review_snapshots',
        baseline: 'artifact_baselines',
        immutableTrigger: 'artifact_review_snapshots_immutable',
      });
    });
  });

  it('upgrades the validated S3 schema additively to M3 source intake', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabaseThroughS3(pool);
      const before = await pool.query<{ artifact: string | null; source: string | null }>(
        `select to_regclass('public.artifacts')::text as artifact,
                to_regclass('public.source_artifacts')::text as source`,
      );
      expect(before.rows[0]).toEqual({ artifact: 'artifacts', source: null });

      await migrateDatabase(pool);
      const after = await pool.query<{
        source: string | null;
        manifest: string | null;
        immutableTrigger: string | null;
      }>(
        `select
           to_regclass('public.source_artifacts')::text as source,
           to_regclass('public.object_manifests')::text as manifest,
           (select tgname from pg_trigger
             where tgrelid = 'source_generations'::regclass
               and tgname = 'source_generations_evidence_immutable') as "immutableTrigger"`,
      );
      expect(after.rows[0]).toEqual({
        source: 'source_artifacts',
        manifest: 'object_manifests',
        immutableTrigger: 'source_generations_evidence_immutable',
      });
    });
  });
});
