import { Pool } from 'pg';

export type DatabasePool = Pool;

export function createDatabasePool(databaseUrl: string): DatabasePool {
  return new Pool({
    application_name: 'delivery-os',
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });
}

export async function checkDatabase(pool: DatabasePool): Promise<number> {
  const startedAt = performance.now();
  await pool.query('select 1 as healthy');
  return Math.round((performance.now() - startedAt) * 100) / 100;
}
