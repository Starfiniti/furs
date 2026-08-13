import pg from 'pg';
import type { PoolConfig, PoolClient, QueryResultRow } from 'pg';
import { parse as parseConnectionString } from 'pg-connection-string';

export interface SqlResult<TRow> {
  readonly rows: TRow[];
  readonly rowCount?: number | null;
}

export interface SqlClient {
  query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<SqlResult<TRow>>;
}

export interface TransactionalDatabase extends SqlClient {
  transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T>;
}

export class PgPoolDatabase implements TransactionalDatabase {
  readonly #pool: pg.Pool;

  public constructor(pool: pg.Pool) {
    this.#pool = pool;
  }

  public async query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<SqlResult<TRow>> {
    return this.#pool.query<TRow>(text, values as unknown[] | undefined);
  }

  public async transaction<T>(work: (client: SqlClient) => Promise<T>): Promise<T> {
    const client = await this.#pool.connect();
    try {
      await client.query('begin');
      await client.query("set local statement_timeout = '10s'");
      await client.query("set local lock_timeout = '5s'");
      const result = await work(new PgClientAdapter(client));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

class PgClientAdapter implements SqlClient {
  readonly #client: PoolClient;

  public constructor(client: PoolClient) {
    this.#client = client;
  }

  public async query<TRow extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[]
  ): Promise<SqlResult<TRow>> {
    return this.#client.query<TRow>(text, values as unknown[] | undefined);
  }
}

/**
 * node-postgres parses `connectionString` after the other Pool options. When a
 * URL deliberately omits its password, the parser returns an empty password
 * and can overwrite a separately mounted secret. Parse the URL first and then
 * apply the explicit password so it remains non-URL secret material.
 */
export function normalizePostgresPoolConfig(config: PoolConfig): PoolConfig {
  if (typeof config.connectionString !== 'string' || config.password === undefined) {
    return config;
  }
  return {
    ...config,
    ...parseConnectionString(config.connectionString),
    connectionString: undefined,
    password: config.password
  } as PoolConfig;
}

export function createPostgresPool(config: PoolConfig): pg.Pool {
  return new pg.Pool({
    max: 10,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 60_000,
    allowExitOnIdle: true,
    ...normalizePostgresPoolConfig(config)
  });
}
