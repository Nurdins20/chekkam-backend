#!/usr/bin/env node
// Applies every supabase/migrations/*.sql file in order against DATABASE_URL,
// tracked in a schema_migrations table. Idempotent (already-applied files are
// skipped) and safe to run on every deploy — no Supabase CLI / local access
// required. Guarded by a Postgres advisory lock in case of overlapping deploys.
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { loadEnv, requireEnv } from "./lib/load-env.mjs";

loadEnv();
requireEnv(["DATABASE_URL"]);

const ADVISORY_LOCK_KEY = 7391001;

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  await client.query("select pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);

  try {
    await client.query(
      "create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())"
    );

    const dir = path.resolve(process.cwd(), "supabase/migrations");
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const { rowCount } = await client.query("select 1 from schema_migrations where name = $1", [file]);
      if (rowCount > 0) {
        console.log(`[migrate] skip ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(dir, file), "utf8");
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`[migrate] applied ${file}`);
      } catch (err) {
        await client.query("rollback");
        throw err;
      }
    }
  } finally {
    await client.query("select pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
    await client.end();
  }
}

main().catch((err) => {
  console.error("[migrate] failed:", err);
  process.exit(1);
});
