import postgres, { type Sql } from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __qaSql: Sql | undefined;
}

export function getSql(): Sql {
  if (globalThis.__qaSql) {
    return globalThis.__qaSql;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  globalThis.__qaSql = postgres(databaseUrl, {
    max: 1,
    prepare: false,
    ssl: "require",
    idle_timeout: 20,
    connect_timeout: 15,
  });

  return globalThis.__qaSql;
}
