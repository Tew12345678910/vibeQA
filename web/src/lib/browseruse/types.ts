import type { BrowserUseLifecycleStatus } from "../contracts";

export type BrowserUseRunTaskRequest = {
  task: string;
  browser_viewport_width: number;
  browser_viewport_height: number;
  structured_output_json: Record<string, unknown>;
  allowed_domains: string[];
  enable_public_share: boolean;
};

export type BrowserUseTaskResponse = {
  id: string;
  status: BrowserUseLifecycleStatus;
  liveUrl?: string;
  publicShareUrl?: string;
  output?: unknown;
  error?: string;
  raw: Record<string, unknown>;
};

export const TERMINAL_STATUSES: BrowserUseLifecycleStatus[] = [
  "finished",
  "failed",
  "paused",
  "stopped",
];
