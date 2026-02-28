/**
 * Smoke-test the OpenAI embeddings endpoint using the current .env.local config.
 *   pnpm tsx scripts/test-openai-embed.ts
 */
import fs from "node:fs";
import path from "node:path";

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

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (
    process.env.AI_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small";

  console.log("base_url :", baseUrl);
  console.log("model    :", model);
  console.log("api_key  :", apiKey ? `${apiKey.slice(0, 10)}…` : "MISSING");

  if (!apiKey) {
    console.error("ERROR: AI_API_KEY is not set in .env.local");
    process.exit(1);
  }

  console.log("\nCalling embeddings API …");
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: "test embedding" }),
  });

  const payload = (await res.json()) as Record<string, unknown>;

  if (!res.ok) {
    console.error(`FAIL HTTP ${res.status}:`, JSON.stringify(payload, null, 2));
    process.exit(1);
  }

  const data = payload.data as Array<{ embedding: number[] }> | undefined;
  const embedding = data?.[0]?.embedding;
  if (!Array.isArray(embedding)) {
    console.error(
      "FAIL: response had no embedding array:",
      JSON.stringify(payload, null, 2),
    );
    process.exit(1);
  }

  console.log(`OK — received ${embedding.length}-dimensional vector`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
