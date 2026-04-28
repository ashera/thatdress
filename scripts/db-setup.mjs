#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.warn(
    "[db:setup] DATABASE_URL is not set — skipping. Set it and redeploy.",
  );
  process.exit(0);
}

const client = new pg.Client({
  connectionString,
  ssl:
    process.env.DATABASE_SSL === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

const files = ["db/schema.sql", "db/seed.sql"];

try {
  await client.connect();
  for (const relPath of files) {
    const sql = await readFile(join(repoRoot, relPath), "utf8");
    process.stdout.write(`→ ${relPath} ... `);
    await client.query(sql);
    process.stdout.write("ok\n");
  }
} catch (err) {
  console.warn(
    `[db:setup] failed: ${err instanceof Error ? err.message : err}. Continuing without seeding.`,
  );
  process.exit(0);
} finally {
  await client.end().catch(() => {});
}
