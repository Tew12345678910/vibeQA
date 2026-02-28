"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { AuditStatusResponse, PageResult } from "@/lib/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  auditId: string;
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (["completed", "ok"].includes(status)) return "default";
  if (["failed", "canceled", "error"].includes(status)) return "destructive";
  if (status === "warning") return "outline";
  return "secondary";
}

function viewportCell(
  route: string,
  viewportKey: "desktop" | "mobile",
  rows: PageResult[],
): PageResult | null {
  return (
    rows.find((r) => r.route === route && r.viewportKey === viewportKey) ?? null
  );
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
    const response = await fetch(`/api/audits/${auditId}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as
      | AuditStatusResponse
      | { error?: string };
    if (!response.ok || !("auditId" in payload)) {
      throw new Error(
        (payload as { error?: string }).error ?? "Failed to fetch audit",
      );
    }
    return payload;
  }, [auditId]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 3000;

    async function tick() {
      if (!active) return;
      try {
        const next = await fetchAudit();
        if (!active) return;
        setAudit(next);
        setError("");
        setLoading(false);
        retryDelay = 3000;
        if (["queued", "running"].includes(next.status)) {
          timer = setTimeout(tick, 3000);
        }
      } catch (fetchError) {
        if (!active) return;
        setLoading(false);
        setError(
          fetchError instanceof Error
            ? fetchError.message
            : "Failed to fetch audit",
        );
        retryDelay = Math.min(15000, retryDelay * 2);
        timer = setTimeout(tick, retryDelay);
      }
    }

    void tick();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [fetchAudit]);

  const routes = useMemo(
    () => unique((audit?.pageResults ?? []).map((r) => r.route)).sort(),
    [audit],
  );

  const evidenceShots = useMemo(() => {
    if (!audit) return [];
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
      const response = await fetch(`/api/audits/${auditId}/cancel`, {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Cancel failed");
      const refreshed = await fetchAudit();
      setAudit(refreshed);
      setError("");
    } catch (cancelError) {
      setError(
        cancelError instanceof Error ? cancelError.message : "Cancel failed",
      );
    } finally {
      setCancelBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      {/* Header card */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="font-mono text-base">
                Audit {auditId.slice(0, 8)}…
              </CardTitle>
              <p className="mt-1 font-mono text-xs text-muted-foreground">
                {auditId}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  void fetchAudit()
                    .then(setAudit)
                    .catch((err: unknown) => setError(String(err)))
                }
              >
                Refresh
              </Button>
              {audit && ["queued", "running"].includes(audit.status) ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onCancel}
                  disabled={cancelBusy}
                >
                  {cancelBusy ? "Canceling…" : "Cancel"}
                </Button>
              ) : null}
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`/api/audits/${auditId}/export?format=json`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Export JSON
                </a>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <a
                  href={`/api/audits/${auditId}/export?format=md`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Export MD
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>

        {loading ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">Loading…</p>
          </CardContent>
        ) : null}
        {error ? (
          <CardContent>
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        ) : null}

        {audit ? (
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                {
                  label: "Status",
                  value: (
                    <Badge variant={statusVariant(audit.status)}>
                      {audit.status}
                    </Badge>
                  ),
                },
                { label: "Pages Audited", value: audit.summary.pagesAudited },
                {
                  label: "Pass / Fail",
                  value: `${audit.summary.passCount} / ${audit.summary.failCount}`,
                },
                { label: "High Risk", value: audit.summary.highRiskCount },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-lg border bg-muted/30 p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 font-semibold">{value}</p>
                </div>
              ))}
            </div>
          </CardContent>
        ) : null}
      </Card>

      {audit ? (
        <>
          {/* Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Progress</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-1 text-sm">
              <p>
                Phase: <strong>{audit.progress.phase}</strong>
              </p>
              <p>
                Completed checks: {audit.progress.completedChecks} /{" "}
                {audit.progress.totalChecks}
              </p>
              <p className="text-muted-foreground">
                Last synced: {formatDate(audit.progress.lastSyncedAt)} |
                Updated: {formatDate(audit.updatedAt)}
              </p>
            </CardContent>
          </Card>

          {/* Matrix */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Route × Viewport Matrix
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route</TableHead>
                    <TableHead>Desktop</TableHead>
                    <TableHead>Mobile</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {routes.length ? (
                    routes.map((route) => {
                      const desktop = viewportCell(
                        route,
                        "desktop",
                        audit.pageResults,
                      );
                      const mobile = viewportCell(
                        route,
                        "mobile",
                        audit.pageResults,
                      );
                      return (
                        <TableRow key={route}>
                          <TableCell className="font-mono text-xs">
                            {route}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={statusVariant(
                                desktop?.status ?? "pending",
                              )}
                            >
                              {desktop?.status ?? "pending"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={statusVariant(
                                mobile?.status ?? "pending",
                              )}
                            >
                              {mobile?.status ?? "pending"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-center text-muted-foreground"
                      >
                        No page results yet.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Issues */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Issues ({audit.issues.length})
              </CardTitle>
            </CardHeader>
            <CardContent>
              {audit.issues.length ? (
                <div className="grid gap-4">
                  {audit.issues.map((issue, index) => (
                    <article
                      key={`${issue.title}-${index}`}
                      className="rounded-lg border bg-card p-4 shadow-sm"
                    >
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            issue.severity === "high"
                              ? "destructive"
                              : issue.severity === "medium"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {issue.severity}
                        </Badge>
                        <Badge variant="outline">{issue.category}</Badge>
                      </div>
                      <h4 className="font-semibold">{issue.title}</h4>
                      <Separator className="my-2" />
                      <dl className="grid gap-1 text-sm">
                        {[
                          ["Symptom", issue.symptom],
                          ["Expected", issue.expected],
                          ["Actual", issue.actual],
                          ["Impact", issue.impact],
                          ["Fix Approach", issue.recommendedFixApproach],
                        ].map(([key, val]) => (
                          <div
                            key={key}
                            className="grid grid-cols-[120px_1fr] gap-2"
                          >
                            <dt className="font-medium text-muted-foreground">
                              {key}
                            </dt>
                            <dd>{val}</dd>
                          </div>
                        ))}
                        {issue.reproSteps.length ? (
                          <div className="grid grid-cols-[120px_1fr] gap-2">
                            <dt className="font-medium text-muted-foreground">
                              Repro Steps
                            </dt>
                            <dd>{issue.reproSteps.join(" → ")}</dd>
                          </div>
                        ) : null}
                        {issue.verificationSteps.length ? (
                          <div className="grid grid-cols-[120px_1fr] gap-2">
                            <dt className="font-medium text-muted-foreground">
                              Verification
                            </dt>
                            <dd>{issue.verificationSteps.join(" → ")}</dd>
                          </div>
                        ) : null}
                        {issue.evidenceLinks.length ? (
                          <div className="grid grid-cols-[120px_1fr] gap-2">
                            <dt className="font-medium text-muted-foreground">
                              Evidence
                            </dt>
                            <dd className="flex flex-wrap gap-2">
                              {issue.evidenceLinks.map((link) => (
                                <a
                                  key={link}
                                  href={link}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-primary underline-offset-4 hover:underline"
                                >
                                  open
                                </a>
                              ))}
                            </dd>
                          </div>
                        ) : null}
                      </dl>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No issues found.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Evidence Gallery */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Evidence Gallery</CardTitle>
            </CardHeader>
            <CardContent>
              {evidenceShots.length ? (
                <div className="gallery-grid">
                  {evidenceShots.map((shot) => (
                    <a
                      key={`${shot.url}-${shot.route}-${shot.viewport}`}
                      href={shot.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <div className="gallery-item">
                        <img
                          src={shot.url}
                          alt={`${shot.route} ${shot.viewport} ${shot.label}`}
                          loading="lazy"
                        />
                        <div className="small">
                          {shot.route} | {shot.viewport} | {shot.label}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No screenshots captured yet.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/audits">← Back to History</Link>
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
