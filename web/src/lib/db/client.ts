import path from "node:path";
import fs from "node:fs";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
  db?: ReturnType<typeof drizzle<typeof schema>>;
  migrated?: boolean;
};

function resolveDbPath(): string {
  const envPath = process.env.QA_DB_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }
  return path.resolve(process.cwd(), "../data/qa.db");
}

function ensureDbDir(dbPath: string): void {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

export function getDb() {
  if (!globalForDb.sqlite || !globalForDb.db) {
    const dbPath = resolveDbPath();
    ensureDbDir(dbPath);

    globalForDb.sqlite = new Database(dbPath);
    globalForDb.sqlite.pragma("journal_mode = WAL");
    globalForDb.db = drizzle(globalForDb.sqlite, { schema });
  }

  if (!globalForDb.migrated && globalForDb.db) {
    const migrationsFolder = path.resolve(process.cwd(), "src/lib/db/migrations");
    migrate(globalForDb.db, { migrationsFolder });
    globalForDb.migrated = true;
  }

  return globalForDb.db;
}
