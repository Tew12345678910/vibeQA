import type { AuditRequest } from "../contracts";

import type { CloudAuditPayload, CloudBrowserClient, CloudStartResponse } from "./types";

function readField<T>(raw: Record<string, unknown>, keys: string[]): T | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

function resolveBaseUrl(): string {
  const raw = process.env.CLOUD_BROWSER_API_BASE_URL;
  if (!raw) {
    throw new Error("CLOUD_BROWSER_API_BASE_URL is required");
  }
  return raw.replace(/\/$/, "");
}

function resolveHeaders(): Record<string, string> {
  const apiKey = process.env.CLOUD_BROWSER_API_KEY;
  if (!apiKey) {
    throw new Error("CLOUD_BROWSER_API_KEY is required");
  }

  return {
    "content-type": "application/json",
    authorization: `Bearer ${apiKey}`,
  };
}

async function requestJson(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const response = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...resolveHeaders(),
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Cloud Browser API ${response.status}: ${text}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

export const cloudBrowserClient: CloudBrowserClient = {
  async startAudit(payload: AuditRequest): Promise<CloudStartResponse> {
    const raw = await requestJson("/audits", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const externalRunId = readField<string>(raw, ["externalRunId", "id", "runId", "auditId"]);
    if (!externalRunId) {
      throw new Error("Cloud Browser API response missing run id");
    }

    const status = readField<string>(raw, ["status", "state"]) ?? "queued";
    return {
      externalRunId,
      status,
    };
  },

  async getAudit(externalRunId: string): Promise<CloudAuditPayload> {
    return requestJson(`/audits/${externalRunId}`, {
      method: "GET",
    });
  },

  async cancelAudit(externalRunId: string): Promise<void> {
    await requestJson(`/audits/${externalRunId}/cancel`, {
      method: "POST",
    });
  },
};
