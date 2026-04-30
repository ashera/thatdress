import { Pool, type PoolClient } from "pg";

declare global {
  var __pgPool: Pool | undefined;
}

function getPool(): Pool {
  if (global.__pgPool) return global.__pgPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  const pool = new Pool({
    connectionString,
    ssl:
      process.env.DATABASE_SSL === "true"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  global.__pgPool = pool;
  return pool;
}

export async function query<T extends Record<string, unknown>>(
  text: string,
  params?: ReadonlyArray<unknown>,
) {
  return getPool().query<T>(text, params as unknown[] | undefined);
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

export function getPoolStats() {
  const pool = global.__pgPool;
  if (!pool) return { total: 0, idle: 0, waiting: 0, initialized: false };
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    initialized: true,
  };
}
