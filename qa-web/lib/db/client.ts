import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Using the Neon HTTP serverless driver to avoid TCP CONNECT_TIMEOUT errors
// in serverless/edge environments. Each tagged-template call is an HTTP fetch.
declare global {
  // eslint-disable-next-line no-var
  var __qaSql: NeonQueryFunction<false, false> | undefined;
}

export function getSql(): NeonQueryFunction<false, false> {
  if (globalThis.__qaSql) {
    return globalThis.__qaSql;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  globalThis.__qaSql = neon(databaseUrl);

  return globalThis.__qaSql;
}
