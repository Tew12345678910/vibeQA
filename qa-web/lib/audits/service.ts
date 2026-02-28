import {
  auditListItemSchema,
  auditRequestSchema,
  auditStatusResponseSchema,
  defaultViewports,
  type AuditListItem,
  type AuditRequest,
  type AuditStatusResponse,
  type RunStatus,
} from "@/lib/contracts";
import { cloudBrowserClient } from "@/lib/cloud/client";
import { mapCloudAuditPayload } from "@/lib/cloud/mapper";
import {
  cancelRun,
  createAuditRun,
  getAuditStatusResponse,
  getRunRow,
  listAuditStatusResponses,
  markRunFailed,
  shouldSyncRun,
  updateRunOnStart,
  updateRunWithCloudSnapshot,
} from "@/lib/db/repository";
import { normalizeRoutes, validateHostedHttpsUrl } from "@/lib/utils/urlSafety";

function mapCloudStartStatus(rawStatus: string): RunStatus {
  const normalized = rawStatus.toLowerCase();
  if (["running", "in_progress"].includes(normalized)) return "running";
  if (["completed", "success", "finished", "done"].includes(normalized))
    return "completed";
  if (["failed", "error"].includes(normalized)) return "failed";
  if (["canceled", "cancelled", "stopped"].includes(normalized))
    return "canceled";
  return "queued";
}

export function parseAndValidateAuditRequest(rawBody: unknown): AuditRequest {
  const parsed = auditRequestSchema.parse(rawBody);
  const urlValidation = validateHostedHttpsUrl(parsed.baseUrl);
  if (!urlValidation.valid) {
    throw new Error(urlValidation.message ?? "Invalid hosted URL");
  }

  const routes = normalizeRoutes(parsed.routes);

  return {
    ...parsed,
    baseUrl: parsed.baseUrl.replace(/\/$/, ""),
    routes,
    viewports: defaultViewports,
  };
}

export async function startAudit(
  input: AuditRequest,
): Promise<{ auditId: string; status: RunStatus }> {
  const created = await createAuditRun(input);

  try {
    const started = await cloudBrowserClient.startAudit(input);
    const mappedStatus = mapCloudStartStatus(started.status);

    await updateRunOnStart({
      auditId: created.auditId,
      externalRunId: started.externalRunId,
      status: mappedStatus,
    });

    return { auditId: created.auditId, status: mappedStatus };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start cloud audit";
    await markRunFailed(created.auditId, message);
    throw new Error(message);
  }
}

async function syncAuditSnapshot(auditId: string): Promise<void> {
  const runRow = await getRunRow(auditId);
  if (!runRow || !runRow.external_run_id) return;
  if (!shouldSyncRun(runRow)) return;

  try {
    const cloudRaw = await cloudBrowserClient.getAudit(runRow.external_run_id);
    const mapped = mapCloudAuditPayload({
      raw: cloudRaw,
      baseUrl: runRow.base_url,
    });

    await updateRunWithCloudSnapshot({
      auditId,
      status: mapped.status,
      summary: mapped.summary,
      progress: mapped.progress,
      pageResults: mapped.pageResults,
      issues: mapped.issues,
      artifacts: mapped.artifacts,
      error: mapped.status === "failed" ? "Cloud audit failed" : null,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Cloud status sync failed";
    await markRunFailed(auditId, message);
  }
}

export async function getAudit(
  auditId: string,
): Promise<AuditStatusResponse | null> {
  await syncAuditSnapshot(auditId);
  const response = await getAuditStatusResponse(auditId);
  if (!response) return null;
  return auditStatusResponseSchema.parse(response);
}

export async function listAudits(args: {
  status?: RunStatus;
  cursor?: number;
  limit?: number;
  baseUrl?: string;
  dateFrom?: number;
  dateTo?: number;
}): Promise<{ items: AuditListItem[]; nextCursor: number | null }> {
  const limit = Math.max(1, Math.min(50, args.limit ?? 20));
  const listed = await listAuditStatusResponses({
    status: args.status,
    cursor: args.cursor,
    limit,
    baseUrl: args.baseUrl,
    dateFrom: args.dateFrom,
    dateTo: args.dateTo,
  });

  return {
    items: listed.items.map((item) => auditListItemSchema.parse(item)),
    nextCursor: listed.nextCursor,
  };
}

export async function cancelAuditById(auditId: string): Promise<void> {
  const runRow = await getRunRow(auditId);
  if (!runRow) throw new Error("Run not found");

  if (runRow.external_run_id) {
    try {
      await cloudBrowserClient.cancelAudit(runRow.external_run_id);
    } catch {
      // Best effort cloud cancel.
    }
  }

  await cancelRun(auditId);
}
