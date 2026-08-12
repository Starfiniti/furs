import { createPostgresPool, PgPoolDatabase } from './database.js';
import { runMigrations } from './migrations.js';
import { readFile } from 'node:fs/promises';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  process.stderr.write('DATABASE_URL is required for migrations.\n');
  process.exitCode = 1;
} else {
  const passwordFile = process.env.DATABASE_PASSWORD_FILE;
  if (!passwordFile) throw new Error('DATABASE_PASSWORD_FILE is required for migrations');
  const password = (await readFile(passwordFile, 'utf8')).replace(/\r?\n$/, '');
  const pool = createPostgresPool({ connectionString, password });
  try {
    await runMigrations(new PgPoolDatabase(pool));
    process.stdout.write('FURS PostgreSQL migrations completed.\n');
  } finally {
    await pool.end();
  }
}
