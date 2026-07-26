import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { Pool } from 'pg';

export const migrationsFolder = fileURLToPath(
  new URL('../../packages/database/drizzle', import.meta.url),
);

export async function withTemporaryDatabase(
  operation: (databaseUrl: string, pool: Pool) => Promise<void>,
): Promise<void> {
  const baseUrl =
    process.env.TEST_DATABASE_URL ??
    'postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os';
  const parsed = new URL(baseUrl);
  const databaseName = `delivery_os_test_${randomUUID().replaceAll('-', '')}`;
  const adminUrl = new URL(parsed);
  adminUrl.pathname = '/postgres';
  const admin = new Pool({ connectionString: adminUrl.toString(), max: 1 });
  await admin.query(`create database "${databaseName}"`);

  const testUrl = new URL(parsed);
  testUrl.pathname = `/${databaseName}`;
  const pool = new Pool({ connectionString: testUrl.toString(), max: 4 });
  try {
    await operation(testUrl.toString(), pool);
  } finally {
    await pool.end();
    await admin.query(`drop database if exists "${databaseName}"`);
    await admin.end();
  }
}

export async function migrateDatabase(pool: Pool): Promise<void> {
  await migrate(drizzle({ client: pool }), { migrationsFolder });
}

export async function migrateDatabaseThroughW1(pool: Pool): Promise<void> {
  const database = drizzle({ client: pool });
  const migrations = readMigrationFiles({ migrationsFolder }).slice(0, 2);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Drizzle exposes selective migration only through its typed internal dialect/session pair.
  await database.dialect.migrate(migrations, database.session, {});
}

export async function migrateDatabaseThroughM2(pool: Pool): Promise<void> {
  const database = drizzle({ client: pool });
  const migrations = readMigrationFiles({ migrationsFolder }).slice(0, 3);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access -- Drizzle exposes selective migration only through its typed internal dialect/session pair.
  await database.dialect.migrate(migrations, database.session, {});
}
