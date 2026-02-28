import fs from "node:fs";
import path from "node:path";

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

function parseProviderError(payload: Record<string, unknown>): string | null {
  if (typeof payload.error === "string") return payload.error;
  if (payload.error && typeof payload.error === "object") {
    const errObj = payload.error as Record<string, unknown>;
    if (typeof errObj.message === "string") return errObj.message;
  }

  return null;
}

async function readJsonSafe(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    const data = (await response.json()) as unknown;
    if (data && typeof data === "object") {
      return data as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

function printInvalid(message: string, status?: number): never {
  const statusPart = typeof status === "number" ? ` (HTTP ${status})` : "";
  console.error(`INVALID API KEY${statusPart}: ${message}`);
  process.exit(1);
}

async function checkViaModels(
  baseUrl: string,
  apiKey: string,
): Promise<boolean> {
  const response = await fetch(`${baseUrl}/models`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (response.ok) {
    return true;
  }

  const payload = await readJsonSafe(response);
  const providerError = payload ? parseProviderError(payload) : null;

  if (response.status === 401 || response.status === 403) {
    printInvalid(providerError ?? "Unauthorized", response.status);
  }

  if (providerError && /api.?key|token|auth|unauthor/i.test(providerError)) {
    printInvalid(providerError, response.status);
  }

  return false;
}

async function checkViaChat(
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<void> {
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_tokens: 8,
      messages: [
        {
          role: "user",
          content: "reply with OK",
        },
      ],
    }),
  });

  const payload = await readJsonSafe(response);
  const providerError = payload ? parseProviderError(payload) : null;

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      printInvalid(providerError ?? "Unauthorized", response.status);
    }

    if (providerError && /api.?key|token|auth|unauthor/i.test(providerError)) {
      printInvalid(providerError, response.status);
    }

    const details = providerError ?? `HTTP ${response.status}`;
    throw new Error(`Unable to verify key: ${details}`);
  }

  if (providerError) {
    if (/api.?key|token|auth|unauthor/i.test(providerError)) {
      printInvalid(providerError, response.status);
    }
    throw new Error(`Unable to verify key: ${providerError}`);
  }
}

async function main(): Promise<void> {
  loadDotEnvLocal();

  const apiKey = process.env.AI_API_KEY;
  const baseUrl = (
    process.env.AI_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.AI_CHAT_MODEL ?? "gpt-4o-mini";

  if (!apiKey) {
    console.error("Missing AI_API_KEY in environment.");
    process.exit(1);
  }

  try {
    const okFromModels = await checkViaModels(baseUrl, apiKey);
    if (!okFromModels) {
      await checkViaChat(baseUrl, apiKey, model);
    }
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log("VALID API KEY: authentication succeeded.");
}

main();
