import { describe, expect, it } from 'vitest';

import { migrateDatabase, withTemporaryDatabase } from '../helpers/database';

describe('checked-in PostgreSQL migrations', () => {
  it('applies cleanly to an empty database', async () => {
    await withTemporaryDatabase(async (_databaseUrl, pool) => {
      await migrateDatabase(pool);
      const result = await pool.query<{ name: string | null }>(
        `select to_regclass('public.platform_probes')::text as name`,
      );
      expect(result.rows[0]?.name).toBe('platform_probes');
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
        `select to_regclass('public.outbox_events')::text as name`,
      );
      expect(marker.rows[0]?.version).toBe(0);
      expect(migration.rows[0]?.name).toBe('outbox_events');
    });
  });
});
