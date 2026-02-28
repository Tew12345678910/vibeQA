import "server-only";

export const RAG_EMBEDDING_MODEL =
  process.env.RAG_EMBEDDING_MODEL ??
  "embo-01";
export const RAG_EMBEDDING_DIMENSIONS = Number(
  process.env.RAG_EMBEDDING_DIMENSIONS ?? "1536",
);
export const MINIMAX_BASE_URL =
  process.env.MINIMAX_BASE_URL ?? "https://api.minimax.chat/v1";

export type PlainTextTable = string;

export type GuidelineRow = {
  id?: string;
  title: string;
  category?: string;
  problem: string;
  recommendation: string;
};

export type ApplyRagOptions = {
  dimensions?: number;
  minimaxApiKey?: string;
  minimaxGroupId?: string;
  minimaxBaseUrl?: string;
  model?: string;
  type?: "db" | "query";
};

function requireMinimaxConfig(options?: ApplyRagOptions): {
  apiKey: string;
  groupId: string;
  baseUrl: string;
} {
  const apiKey = options?.minimaxApiKey ?? process.env.MINIMAX_API_KEY;
  const groupId = options?.minimaxGroupId ?? process.env.MINIMAX_GROUP_ID;
  const baseUrl = options?.minimaxBaseUrl ?? MINIMAX_BASE_URL;

  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is required for Minimax RAG embeddings.");
  }
  if (!groupId) {
    throw new Error("MINIMAX_GROUP_ID is required for Minimax RAG embeddings.");
  }

  return { apiKey, groupId, baseUrl };
}

function normalizeRagText(input: string): string {
  const text = input.trim();
  if (!text) {
    throw new Error("Cannot generate embedding from empty text input.");
  }
  return text;
}

/**
 * Convert guideline rows into a compact plain-text table string.
 * This can be passed directly to applyRag().
 */
export function toPlainTextGuidelineTable(rows: GuidelineRow[]): PlainTextTable {
  if (!rows.length) return "";

  const lines: string[] = [];
  lines.push("id | category | title | problem | recommendation");
  lines.push("--- | --- | --- | --- | ---");

  for (const row of rows) {
    lines.push(
      [
        row.id ?? "",
        row.category ?? "",
        row.title,
        row.problem,
        row.recommendation,
      ]
        .map((item) => String(item).replace(/\s+/g, " ").trim())
        .join(" | "),
    );
  }

  return lines.join("\n");
}

/**
 * applyRag:
 * Accepts plain text (guideline table text or any assessment query text),
 * and returns a vector embedding for retrieval.
 */
export async function applyRag(
  plainTextTable: PlainTextTable,
  options: ApplyRagOptions = {},
): Promise<number[]> {
  const { apiKey, groupId, baseUrl } = requireMinimaxConfig(options);
  const input = normalizeRagText(plainTextTable);
  const dimensions = options.dimensions ?? RAG_EMBEDDING_DIMENSIONS;
  const model = options.model ?? RAG_EMBEDDING_MODEL;
  const type = options.type ?? "db";

  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/embeddings?GroupId=${encodeURIComponent(groupId)}`,
    {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      texts: [input],
      type,
    }),
    signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Minimax embedding request failed (${response.status}): ${body}`,
    );
  }

  const json = (await response.json()) as {
    vectors?: number[][];
    data?: Array<{ embedding?: number[] }>;
  };

  const embedding = json.vectors?.[0] ?? json.data?.[0]?.embedding;
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error("Embedding response missing vector payload.");
  }
  if (embedding.length !== dimensions) {
    throw new Error(
      `Unexpected embedding size. Expected ${dimensions}, got ${embedding.length}.`,
    );
  }

  return embedding;
}

