"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AuditStatusResponse, PageResult } from "../lib/contracts";

type Props = {
  auditId: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "-";
  }
  return new Date(value).toLocaleString();
}

function statusClass(status: string): string {
  if (["completed", "ok"].includes(status)) {
    return "ok";
  }
  if (["running", "queued", "pending"].includes(status)) {
    return "running";
  }
  if (status === "warning") {
    return "warn";
  }
  return "fail";
}

function viewportCell(route: string, viewportKey: "desktop" | "mobile", rows: PageResult[]): PageResult | null {
  return rows.find((row) => row.route === route && row.viewportKey === viewportKey) ?? null;
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function AuditDetailClient({ auditId }: Props) {
  const [audit, setAudit] = useState<AuditStatusResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [cancelBusy, setCancelBusy] = useState(false);

  const fetchAudit = useCallback(async () => {
    const response = await fetch(`/api/audits/${auditId}`, { cache: "no-store" });
    const payload = (await response.json()) as AuditStatusResponse | { error?: string };
    if (!response.ok || !("auditId" in payload)) {
      throw new Error((payload as { error?: string }).error ?? "Failed to fetch audit");
    }
    return payload;
  }, [auditId]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 3000;

    async function tick() {
      if (!active) {
        return;
      }

      try {
        const next = await fetchAudit();
        if (!active) {
          return;
        }

        setAudit(next);
        setError("");
        setLoading(false);
        retryDelay = 3000;

        if (["queued", "running"].includes(next.status)) {
          timer = setTimeout(tick, 3000);
        }
      } catch (fetchError) {
        if (!active) {
          return;
        }

        setLoading(false);
        setError(fetchError instanceof Error ? fetchError.message : "Failed to fetch audit");
        retryDelay = Math.min(15000, retryDelay * 2);
        timer = setTimeout(tick, retryDelay);
      }
    }

    void tick();

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [fetchAudit]);

  const routes = useMemo(() => unique((audit?.pageResults ?? []).map((row) => row.route)).sort(), [audit]);

  const evidenceShots = useMemo(() => {
    if (!audit) {
      return [];
    }

    return audit.pageResults.flatMap((row) =>
      row.evidence.screenshots.map((shot) => ({
        route: row.route,
        viewport: row.viewportKey,
        label: shot.label,
        url: shot.url,
      })),
    );
  }, [audit]);

  async function onCancel() {
    setCancelBusy(true);
    try {
      const response = await fetch(`/api/audits/${auditId}/cancel`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Cancel failed");
      }
      const refreshed = await fetchAudit();
      setAudit(refreshed);
      setError("");
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : "Cancel failed");
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <section className="card">
        <div className="row-between">
          <h1>Audit {auditId}</h1>
          <div className="row-inline">
            <button onClick={() => void fetchAudit().then(setAudit).catch((err: unknown) => setError(String(err)))}>
              Refresh
            </button>
            {audit && ["queued", "running"].includes(audit.status) ? (
              <button onClick={onCancel} disabled={cancelBusy}>
                {cancelBusy ? "Canceling..." : "Cancel"}
              </button>
            ) : null}
            <a href={`/api/audits/${auditId}/export?format=json`} target="_blank" rel="noreferrer">
              <button>Export JSON</button>
            </a>
            <a href={`/api/audits/${auditId}/export?format=md`} target="_blank" rel="noreferrer">
              <button>Export MD</button>
            </a>
          </div>
        </div>

        {loading ? <p>Loading...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {audit ? (
          <div className="grid cols-4">
            <div className="metric-card">
              <span>Status</span>
              <strong className={`status-chip ${statusClass(audit.status)}`}>{audit.status}</strong>
            </div>
            <div className="metric-card">
              <span>Pages Audited</span>
              <strong>{audit.summary.pagesAudited}</strong>
            </div>
            <div className="metric-card">
              <span>Pass / Fail</span>
              <strong>
                {audit.summary.passCount} / {audit.summary.failCount}
              </strong>
            </div>
            <div className="metric-card">
              <span>High Risk</span>
              <strong>{audit.summary.highRiskCount}</strong>
            </div>
          </div>
        ) : null}
      </section>

      {audit ? (
        <>
          <section className="card">
            <h3>Progress</h3>
            <p>
              Phase: <strong>{audit.progress.phase}</strong>
            </p>
            <p>
              Completed checks: {audit.progress.completedChecks} / {audit.progress.totalChecks}
            </p>
            <p>
              Last synced: {formatDate(audit.progress.lastSyncedAt)} | Updated: {formatDate(audit.updatedAt)}
            </p>
          </section>

          <section className="card">
            <h3>Matrix (Route x Viewport)</h3>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Route</th>
                    <th>Desktop</th>
                    <th>Mobile</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.length ? (
                    routes.map((route) => {
                      const desktop = viewportCell(route, "desktop", audit.pageResults);
                      const mobile = viewportCell(route, "mobile", audit.pageResults);

                      return (
                        <tr key={route}>
                          <td>{route}</td>
                          <td>
                            <span className={`status-chip ${statusClass(desktop?.status ?? "pending")}`}>
                              {desktop?.status ?? "pending"}
                            </span>
                          </td>
                          <td>
                            <span className={`status-chip ${statusClass(mobile?.status ?? "pending")}`}>
                              {mobile?.status ?? "pending"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={3} className="muted">
                        No page results yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card">
            <h3>Issues ({audit.issues.length})</h3>
            {audit.issues.length ? (
              <div className="grid" style={{ gap: "0.8rem" }}>
                {audit.issues.map((issue, index) => (
                  <article key={`${issue.title}-${index}`} className="issue-card">
                    <div className="row-inline">
                      <span className={`badge ${issue.severity}`}>{issue.severity}</span>
                      <span className="badge category">{issue.category}</span>
                    </div>
                    <h4>{issue.title}</h4>
                    <p>
                      <strong>Symptom:</strong> {issue.symptom}
                    </p>
                    <p>
                      <strong>Expected:</strong> {issue.expected}
                    </p>
                    <p>
                      <strong>Actual:</strong> {issue.actual}
                    </p>
                    <p>
                      <strong>Impact:</strong> {issue.impact}
                    </p>
                    <p>
                      <strong>Fix Approach:</strong> {issue.recommendedFixApproach}
                    </p>
                    <p>
                      <strong>Repro Steps:</strong> {issue.reproSteps.join(" -> ") || "-"}
                    </p>
                    <p>
                      <strong>Verification:</strong> {issue.verificationSteps.join(" -> ") || "-"}
                    </p>
                    {issue.evidenceLinks.length ? (
                      <p>
                        <strong>Evidence:</strong>{" "}
                        {issue.evidenceLinks.map((link) => (
                          <a key={link} href={link} target="_blank" rel="noreferrer">
                            open
                          </a>
                        ))}
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="muted">No issues found.</p>
            )}
          </section>

          <section className="card">
            <h3>Evidence Gallery</h3>
            {evidenceShots.length ? (
              <div className="gallery-grid">
                {evidenceShots.map((shot) => (
                  <a key={`${shot.url}-${shot.route}-${shot.viewport}`} href={shot.url} target="_blank" rel="noreferrer">
                    <div className="gallery-item">
                      <img src={shot.url} alt={`${shot.route} ${shot.viewport} ${shot.label}`} loading="lazy" />
                      <div className="muted small">
                        {shot.route} | {shot.viewport} | {shot.label}
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            ) : (
              <p className="muted">No screenshots captured yet.</p>
            )}
          </section>

          <section className="card">
            <h3>Navigation</h3>
            <p>
              <Link href="/audits">Back to audit history</Link>
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
