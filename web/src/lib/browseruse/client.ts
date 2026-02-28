import { z } from "zod";

import type { BrowserUseLifecycleStatus } from "../contracts";

import type { BrowserUseRunTaskRequest, BrowserUseTaskResponse } from "./types";

const lifecycleStatusSchema = z.union([
  z.literal("created"),
  z.literal("running"),
  z.literal("finished"),
  z.literal("failed"),
  z.literal("stopped"),
  z.literal("paused"),
]);

function resolveBaseUrl(): string {
  return (process.env.BROWSER_USE_BASE_URL || "https://api.browser-use.com").replace(/\/$/, "");
}

function resolveHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (process.env.BROWSER_USE_API_KEY) {
    headers.authorization = `Bearer ${process.env.BROWSER_USE_API_KEY}`;
  }
  return headers;
}

function readField<T = unknown>(raw: Record<string, unknown>, keys: string[]): T | undefined {
  for (const key of keys) {
    const value = raw[key];
    if (value !== undefined && value !== null) {
      return value as T;
    }
  }
  return undefined;
}

function normalizeTaskResponse(raw: Record<string, unknown>): BrowserUseTaskResponse {
  const id = readField<string>(raw, ["id", "task_id", "taskId"]);
  const statusRaw = readField<string>(raw, ["status", "task_status", "state"]);

  if (!id) {
    throw new Error("Browser-Use response missing task id");
  }

  const status = lifecycleStatusSchema.parse(statusRaw) as BrowserUseLifecycleStatus;
  return {
    id,
    status,
    liveUrl: readField(raw, ["live_url", "liveUrl"]),
    publicShareUrl: readField(raw, ["public_share_url", "publicShareUrl"]),
    output: readField(raw, ["structured_output", "output", "result"]),
    error: readField(raw, ["error", "error_message", "message"]),
    raw,
  };
}

async function jsonRequest(
  path: string,
  init: RequestInit,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...resolveHeaders(),
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Browser-Use API ${response.status}: ${text}`);
  }

  return (await response.json()) as Record<string, unknown>;
}

export async function runTask(payload: BrowserUseRunTaskRequest): Promise<BrowserUseTaskResponse> {
  const raw = await jsonRequest("/api/v1/run-task", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return normalizeTaskResponse(raw);
}

export async function getTask(taskId: string): Promise<BrowserUseTaskResponse> {
  const raw = await jsonRequest(`/api/v1/task/${taskId}`, { method: "GET" });
  return normalizeTaskResponse(raw);
}

export async function stopTask(taskId: string): Promise<void> {
  await jsonRequest(`/api/v1/task/${taskId}/stop`, { method: "POST" });
}

export async function pollTaskUntilTerminal(
  taskId: string,
  pollIntervalMs = 2000,
  maxPolls = 180,
): Promise<BrowserUseTaskResponse> {
  let latest = await getTask(taskId);
  let polls = 0;

  while (!["finished", "failed", "stopped", "paused"].includes(latest.status)) {
    if (polls >= maxPolls) {
      throw new Error(`Timed out waiting for Browser-Use task ${taskId}`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    latest = await getTask(taskId);
    polls += 1;
  }

  return latest;
}
