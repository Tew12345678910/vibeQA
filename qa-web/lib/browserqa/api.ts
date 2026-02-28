import type { AuditListItem, AuditStatusResponse, RunStatus } from "@/lib/contracts";

export type AuditListResponse = {
  items: AuditListItem[];
  nextCursor: number | null;
};

type ListQuery = {
  status?: RunStatus;
  baseUrl?: string;
  limit?: number;
  cursor?: number;
  dateFrom?: string;
  dateTo?: string;
};

function buildQuery(query: ListQuery): string {
  const params = new URLSearchParams();

  if (query.status) params.set("status", query.status);
  if (query.baseUrl) params.set("baseUrl", query.baseUrl);
  if (query.limit) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", String(query.cursor));
  if (query.dateFrom) params.set("dateFrom", query.dateFrom);
  if (query.dateTo) params.set("dateTo", query.dateTo);

  const raw = params.toString();
  return raw ? `?${raw}` : "";
}

export async function fetchAudits(query: ListQuery = {}): Promise<AuditListResponse> {
  const response = await fetch(`/api/audits${buildQuery(query)}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 404) {
      return { items: [], nextCursor: null };
    }
    let errorMessage = "Failed to fetch audits";
    try {
      const payload = (await response.json()) as { error?: string };
      errorMessage = payload.error ?? errorMessage;
    } catch {
      // Response body is not JSON (e.g. HTML error page)
    }
    throw new Error(errorMessage);
  }

  let payload: AuditListResponse | { error?: string };
  try {
    payload = (await response.json()) as AuditListResponse | { error?: string };
  } catch {
    return { items: [], nextCursor: null };
  }

  if (!("items" in payload)) {
    throw new Error((payload as { error?: string }).error ?? "Failed to fetch audits");
  }
  return payload;
}

export async function fetchAudit(auditId: string): Promise<AuditStatusResponse> {
  const response = await fetch(`/api/audits/${auditId}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    let errorMessage = "Failed to fetch audit";
    try {
      const payload = (await response.json()) as { error?: string };
      errorMessage = payload.error ?? errorMessage;
    } catch {
      // Response body is not JSON
    }
    throw new Error(errorMessage);
  }

  let payload: AuditStatusResponse | { error?: string };
  try {
    payload = (await response.json()) as AuditStatusResponse | { error?: string };
  } catch {
    throw new Error("Failed to fetch audit: invalid response");
  }

  if (!("auditId" in payload)) {
    throw new Error((payload as { error?: string }).error ?? "Failed to fetch audit");
  }
  return payload;
}

export async function startAudit(input: {
  baseUrl: string;
  routes: string[];
  maxPages: number;
  maxClicksPerPage: number;
  focus: string[];
}): Promise<{ auditId: string; status: RunStatus }> {
  const response = await fetch("/api/audits", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      ...input,
      viewports: [
        { key: "desktop", width: 1440, height: 900 },
        { key: "mobile", width: 390, height: 844 },
      ],
    }),
  });

  const payload = (await response.json()) as
    | { auditId: string; status: RunStatus }
    | { error?: string };

  if (!response.ok || !("auditId" in payload)) {
    throw new Error((payload as { error?: string }).error ?? "Failed to start audit");
  }

  return payload;
}

export async function cancelAudit(auditId: string): Promise<void> {
  const response = await fetch(`/api/audits/${auditId}/cancel`, {
    method: "POST",
  });

  if (!response.ok) {
    let errorMessage = "Failed to cancel audit";
    try {
      const payload = (await response.json()) as { error?: string };
      errorMessage = payload.error ?? errorMessage;
    } catch {
      // Response body is not JSON
    }
    throw new Error(errorMessage);
  }
}
