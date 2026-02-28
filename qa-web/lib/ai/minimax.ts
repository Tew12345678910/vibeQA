function requireAiConfig(): {
  apiKey: string;
  baseUrl: string;
  embeddingModel: string;
  chatModel: string;
} {
  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (
    process.env.AI_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const embeddingModel =
    process.env.AI_EMBEDDING_MODEL ?? "text-embedding-3-small";
  const chatModel = process.env.AI_CHAT_MODEL ?? "gpt-4o-mini";

  if (!apiKey) {
    throw new Error("AI_API_KEY is required");
  }

  return { apiKey, baseUrl, embeddingModel, chatModel };
}

function parseProviderError(payload: Record<string, unknown>): string | null {
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object") {
    const errObj = payload.error as Record<string, unknown>;
    const message = errObj.message;
    if (typeof message === "string") return message;
  }

  return null;
}

function parseTextResponse(payload: Record<string, unknown>): string {
  const choices = payload.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    const first = choices[0] as Record<string, unknown>;
    const message = first.message as Record<string, unknown> | undefined;
    const content = message?.content;
    if (typeof content === "string") return content.trim();
  }

  const output = payload.output;
  if (Array.isArray(output)) {
    const text = output
      .flatMap((item) => {
        const row = item as Record<string, unknown>;
        const content = row.content;
        return Array.isArray(content) ? content : [];
      })
      .map((item) => {
        const row = item as Record<string, unknown>;
        if (row.type === "output_text" && typeof row.text === "string") {
          return row.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();

    if (text) return text;
  }

  const text = payload.text;
  if (typeof text === "string") {
    return text.trim();
  }

  return "";
}

function parseEmbedding(payload: Record<string, unknown>): number[] {
  const single = payload.embedding ?? payload.vector;
  if (Array.isArray(single)) {
    return single.map((v) => Number(v));
  }

  const data = payload.data;
  if (Array.isArray(data) && data.length > 0) {
    const first = data[0] as Record<string, unknown>;
    const embedding = first.embedding;
    if (Array.isArray(embedding)) {
      return embedding.map((v) => Number(v));
    }
  }

  const vectors = payload.vectors;
  if (Array.isArray(vectors) && vectors.length > 0) {
    const first = vectors[0] as Record<string, unknown>;
    const embedding = first.embedding ?? first.vector;
    if (Array.isArray(embedding)) {
      return embedding.map((v) => Number(v));
    }
  }

  throw new Error("AI embedding response did not contain vectors");
}

async function withTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function embedText(input: string): Promise<number[]> {
  const { apiKey, baseUrl, embeddingModel } = requireAiConfig();

  const response = await withTimeout(
    `${baseUrl}/embeddings`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: embeddingModel,
        input,
      }),
    },
    30_000,
  );

  if (!response.ok) {
    throw new Error(
      `AI embeddings failed: ${response.status} ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const providerError = parseProviderError(payload);
  if (providerError) {
    throw new Error(providerError);
  }

  const embedding = parseEmbedding(payload);
  if (embedding.length !== 1536) {
    throw new Error(
      `AI embedding dimension mismatch. Expected 1536, got ${embedding.length}`,
    );
  }
  return embedding;
}

export async function generateIssueCard(prompt: string): Promise<string> {
  const { apiKey, baseUrl, chatModel } = requireAiConfig();

  const response = await withTimeout(
    `${baseUrl}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: chatModel,
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "You are a strict static code security auditor. Return only valid JSON or null.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    },
    45_000,
  );

  if (!response.ok) {
    throw new Error(
      `AI generation failed: ${response.status} ${await response.text()}`,
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const providerError = parseProviderError(payload);
  if (providerError) {
    throw new Error(providerError);
  }

  return parseTextResponse(payload);
}
