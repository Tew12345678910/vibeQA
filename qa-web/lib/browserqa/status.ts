import type { AuditListItem, AuditStatusResponse } from "@/lib/contracts";

export type DisplayRunStatus = "pending" | "running" | "passed" | "failed" | "canceled";

export function mapAuditToDisplayStatus(input: {
  status: string;
  failCount: number;
}): DisplayRunStatus {
  if (input.status === "running") return "running";
  if (input.status === "queued") return "pending";
  if (input.status === "canceled") return "canceled";
  if (input.status === "failed") return "failed";
  if (input.status === "completed") {
    return input.failCount > 0 ? "failed" : "passed";
  }
  return "pending";
}

export function listItemDisplayStatus(item: AuditListItem): DisplayRunStatus {
  return mapAuditToDisplayStatus({
    status: item.status,
    failCount: item.summary.failCount,
  });
}

export function detailDisplayStatus(item: AuditStatusResponse): DisplayRunStatus {
  return mapAuditToDisplayStatus({
    status: item.status,
    failCount: item.summary.failCount,
  });
}
