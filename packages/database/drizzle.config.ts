import { defineConfig } from 'drizzle-kit';

const databaseUrl =
  process.env.DATABASE_URL ??
  'postgresql://delivery_os:delivery_os_local@127.0.0.1:55432/delivery_os';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: databaseUrl,
  },
  migrations: {
    schema: 'delivery_os_migrations',
    table: '__drizzle_migrations',
  },
  strict: true,
  verbose: true,
});
