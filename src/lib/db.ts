import { Pool } from "pg";

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
