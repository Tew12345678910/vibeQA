import { betterAuth } from "better-auth";
import { Pool } from "@neondatabase/serverless";

declare global {
  // eslint-disable-next-line no-var
  var __qaAuthPool: Pool | undefined;
}

function getAuthPool(): Pool {
  if (globalThis.__qaAuthPool) {
    return globalThis.__qaAuthPool;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const pool = new Pool({
    connectionString: databaseUrl,
  });

  globalThis.__qaAuthPool = pool;
  return pool;
}

export const auth = betterAuth({
  database: getAuthPool(),
  baseURL: process.env.BETTER_AUTH_URL ?? process.env.APP_BASE_URL ?? "http://localhost:3000",
  secret: process.env.BETTER_AUTH_SECRET ?? "development-only-secret-change-me",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
});
