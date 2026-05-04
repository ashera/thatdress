#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error(
    "[db:setup] DATABASE_URL is not set — aborting. Set it and redeploy.",
  );
  process.exit(1);
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
  // pg errors often have empty .message but useful .code / .detail / .stack.
  // Dump everything we can so the deploy log shows the real cause.
  console.error("[db:setup] failed");
  if (err && typeof err === "object") {
    const e = err;
    if (e.message) console.error("  message:", e.message);
    if (e.code) console.error("  code:", e.code);
    if (e.detail) console.error("  detail:", e.detail);
    if (e.hint) console.error("  hint:", e.hint);
    if (e.where) console.error("  where:", e.where);
    if (e.position) console.error("  position:", e.position);
    if (e.routine) console.error("  routine:", e.routine);
    if (e.stack) console.error("  stack:", e.stack);
  } else {
    console.error("  err:", err);
  }
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
