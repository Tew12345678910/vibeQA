import type { BrowserUseLifecycleStatus } from "../contracts";

export function mapBrowserUseLifecycleToRunCaseStatus(
  status: BrowserUseLifecycleStatus,
): "pending" | "running" | "passed" | "failed" {
  if (status === "created") {
    return "pending";
  }
  if (status === "running") {
    return "running";
  }
  if (status === "finished") {
    return "passed";
  }
  return "failed";
}
