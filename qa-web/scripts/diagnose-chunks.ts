/**
 * Diagnostics: checks Supabase table counts + does one end-to-end embed insert test.
 *   pnpm tsx scripts/diagnose-chunks.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadDotEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const secretKey =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const aiApiKey = process.env.AI_API_KEY!;
  const baseUrl = (
    process.env.AI_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const embeddingModel =
    process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  console.log("=== Config ===");
  console.log("supabase_url   :", supabaseUrl);
  console.log("secret_key     :", secretKey?.slice(0, 15) + "…");
  console.log("ai_base_url    :", baseUrl);
  console.log("embedding_model:", embeddingModel);
  console.log("");

  const db = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── Table counts ──────────────────────────────────────────────────────────
  const tables = [
    "rules",
    "control_chunks",
    "code_chunks",
    "project_runs",
    "run_issues",
  ];
  console.log("=== Table row counts ===");
  for (const table of tables) {
    const { count, error } = await db
      .from(table)
      .select("*", { count: "exact", head: true });
    if (error) {
      console.log(`  ${table}: ERROR — ${error.message}`);
    } else {
      console.log(`  ${table}: ${count ?? 0} rows`);
    }
  }

  // ── Check control_chunks embedding_model ─────────────────────────────────
  console.log("\n=== Sample control_chunk metadata ===");
  const { data: sampleChunks } = await db
    .from("control_chunks")
    .select("control_id, metadata")
    .limit(3);
  for (const row of sampleChunks ?? []) {
    const r = row as { control_id: string; metadata?: Record<string, unknown> };
    console.log(
      `  ${r.control_id}: embedding_model=${r.metadata?.embedding_model ?? "MISSING"}`,
    );
  }

  // ── Check code_chunks per repo/commit ─────────────────────────────────────
  console.log("\n=== code_chunks by repo ===");
  const { data: codeChunkMeta } = await db
    .from("code_chunks")
    .select("repo, commit_sha, metadata")
    .limit(5);
  if (!codeChunkMeta || codeChunkMeta.length === 0) {
    console.log("  (empty — no code chunks indexed yet)");
  } else {
    for (const row of codeChunkMeta) {
      const r = row as {
        repo: string;
        commit_sha: string;
        metadata?: Record<string, unknown>;
      };
      console.log(
        `  ${r.repo} @ ${r.commit_sha.slice(0, 8)}: embedding_model=${r.metadata?.embedding_model ?? "MISSING"}`,
      );
    }
  }

  // ── Test embed + insert into code_chunks ─────────────────────────────────
  console.log("\n=== Test embed + insert into code_chunks ===");
  const testText =
    "FILE: test/sample.ts\nLINES: 1-5\n\nconst x = require('express');\n";
  let embedding: number[];
  try {
    const res = await fetch(`${baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${aiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: embeddingModel, input: testText }),
    });
    const payload = (await res.json()) as {
      data?: Array<{ embedding: number[] }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      console.log("  embed FAIL:", payload.error?.message ?? res.status);
      process.exit(1);
    }
    embedding = payload.data?.[0]?.embedding ?? [];
    console.log(`  embed OK — ${embedding.length} dims`);
  } catch (err) {
    console.log(
      "  embed FAIL:",
      err instanceof Error ? err.message : String(err),
    );
    process.exit(1);
  }

  const TEST_REPO = "__diag_test__";
  const TEST_SHA = "test-sha-0000";

  const { error: insertErr } = await db.from("code_chunks").insert({
    repo: TEST_REPO,
    commit_sha: TEST_SHA,
    path: "test/sample.ts",
    line_start: 1,
    line_end: 5,
    chunk_text: testText,
    metadata: { embedding_model: embeddingModel, ref: "diag" },
    embedding,
  });

  if (insertErr) {
    console.log("  insert FAIL:", insertErr.message);
  } else {
    console.log("  insert OK");
    // Clean up test row
    await db.from("code_chunks").delete().eq("repo", TEST_REPO);
    console.log("  cleanup OK");
  }

  console.log("\nDone.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
