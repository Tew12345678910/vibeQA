/**
 * index-rules.ts
 *
 * Generates vector embeddings for every enabled rule in `public.rules` and
 * upserts them into `public.control_chunks` so that the RAG pipeline can
 * retrieve relevant rules via semantic search.
 *
 * Run after adding or updating rules:
 *   pnpm rules:index
 *
 * Prerequisites:
 *   - AI_API_KEY, AI_BASE_URL, AI_EMBEDDING_MODEL set in .env.local
 *   - Supabase credentials set in .env.local
 *   - `public.rules` table is populated (run rules:upsert:all first)
 *   - `public.control_chunks` table exists (migration 20260228_rag_vector_tables.sql)
 */

import fs from "node:fs";
import path from "node:path";

import { getDbClient } from "@/lib/db/client";
import { indexRulesIfNeeded } from "@/lib/rag/service";

function loadDotEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex <= 0) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();

  const db = getDbClient();

  // Count rules before indexing so we can report how many will be processed.
  const { count: ruleCount, error: ruleCountError } = await db
    .from("rules")
    .select("id", { count: "exact", head: true })
    .eq("enabled", true);

  if (ruleCountError) {
    throw new Error(`Failed to count rules: ${ruleCountError.message}`);
  }

  console.log(`Found ${ruleCount ?? 0} enabled rules in public.rules.`);

  // Count existing embeddings before indexing.
  const { count: beforeCount, error: beforeError } = await db
    .from("control_chunks")
    .select("id", { count: "exact", head: true });

  if (beforeError) {
    throw new Error(
      `Failed to count existing control_chunks: ${beforeError.message}`,
    );
  }

  console.log(`control_chunks before indexing: ${beforeCount ?? 0} rows.`);
  console.log("Generating embeddings and upserting into control_chunks …");

  await indexRulesIfNeeded();

  // Count after indexing to show what changed.
  const { count: afterCount, error: afterError } = await db
    .from("control_chunks")
    .select("id", { count: "exact", head: true });

  if (afterError) {
    throw new Error(
      `Failed to count control_chunks after indexing: ${afterError.message}`,
    );
  }

  const added = (afterCount ?? 0) - (beforeCount ?? 0);
  console.log(
    `control_chunks after indexing: ${afterCount ?? 0} rows (+${added} new / updated).`,
  );
  console.log("Done. Rules are now indexed in the vector store.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
