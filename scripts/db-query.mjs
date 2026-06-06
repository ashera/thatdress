#!/usr/bin/env node
// Tiny local DB query helper for development/inspection.
//
//   node scripts/db-query.mjs "select count(*) from listings"
//   node scripts/db-query.mjs "update ... where ..."   (writes allowed)
//
// Reads DATABASE_URL from the environment, falling back to .env.local so
// it works the same way `npm run dev` does. Prints rows as JSON. This
// exists so common DB pokes can be allowlisted as a single narrow
// command instead of granting blanket `node -e` execution.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

function resolveDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  try {
    const text = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local */
  }
  return null;
}

const sql = process.argv.slice(2).join(" ").trim();
if (!sql) {
  console.error('usage: node scripts/db-query.mjs "<sql>"');
  process.exit(2);
}
const connectionString = resolveDatabaseUrl();
if (!connectionString) {
  console.error("DATABASE_URL not set and not found in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
try {
  await client.connect();
  const res = await client.query(sql);
  console.log(JSON.stringify(res.rows, null, 2));
  if (res.rowCount != null && res.rows.length === 0) {
    console.log(`(${res.rowCount} row(s) affected)`);
  }
} catch (e) {
  console.error("query failed:", e.message);
  process.exit(1);
} finally {
  await client.end();
}
