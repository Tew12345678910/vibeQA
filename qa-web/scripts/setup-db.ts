import path from "node:path";

import { ensureSchema } from "@/lib/db/repository";

async function main() {
  try {
    await ensureSchema();
    console.log("Database schema is ready.");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to verify DB schema";
    if (message.includes("Supabase tables are missing")) {
      const sqlPath = path.join(
        process.cwd(),
        "supabase",
        "migrations",
        "20260228_audit_tables.sql",
      );
      console.error(message);
      console.error(`Apply migration SQL in Supabase SQL Editor: ${sqlPath}`);
      process.exit(1);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
