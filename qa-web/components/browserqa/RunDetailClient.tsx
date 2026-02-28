"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Monitor,
  RefreshCw,
  Smartphone,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cancelAudit, fetchAudit } from "@/lib/browserqa/api";
import { detailDisplayStatus } from "@/lib/browserqa/status";
import { formatDateTime, toPassRate } from "@/lib/browserqa/format";
import { StatusBadge } from "@/components/browserqa/StatusBadge";
import { DetailLoadingState } from "@/components/browserqa/LoadingStates";
import type { AuditStatusResponse, PageResult } from "@/lib/contracts";

type Props = {
  auditId: string;
};

export function RunDetailClient({ auditId }: Props) {
  const router = useRouter();
  const [audit, setAudit] = useState<AuditStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [selectedViewport, setSelectedViewport] = useState<"all" | "desktop" | "mobile">("all");
  const [canceling, setCanceling] = useState(false);

  const load = useCallback(async () => {
    const next = await fetchAudit(auditId);
    setAudit(next);
    return next;
  }, [auditId]);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      if (!active) return;
      try {
        const next = await load();
        if (!active) return;
        setError("");
        setLoading(false);

        if (["queued", "running"].includes(next.status)) {
          timer = setTimeout(() => {
            void tick();
          }, 3000);
        }
      } catch (err) {
        if (!active) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Failed to load run");
        timer = setTimeout(() => {
          void tick();
        }, 5000);
      }
    };

    void tick();

    return () => {
      active = false;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [load]);

  const filteredRows = useMemo(() => {
    const rows = audit?.pageResults ?? [];
    if (selectedViewport === "all") return rows;
    return rows.filter((row) => row.viewportKey === selectedViewport);
  }, [audit, selectedViewport]);

  const summary = useMemo(() => {
    const passed = filteredRows.filter((row) => row.status === "ok").length;
    const failed = filteredRows.filter((row) => row.status === "error").length;
    return {
      total: filteredRows.length,
      passed,
      failed,
      passRate: toPassRate(passed, failed),
    };
  }, [filteredRows]);

  const getCaseKey = (row: PageResult) => `${row.route}:${row.viewportKey}`;

  const onCancel = async () => {
    setCanceling(true);
    setError("");

    try {
      await cancelAudit(auditId);
      const refreshed = await load();
      setAudit(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel run");
    } finally {
      setCanceling(false);
    }
  };

  const copyToClipboard = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setError("Failed to copy text");
    }
  };

  if (loading) {
    return <DetailLoadingState label="Loading run..." />;
  }

  if (!audit) {
    return <p className="text-sm text-red-300">Run not found.</p>;
  }

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-start gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()} className="text-slate-400 hover:bg-slate-800 hover:text-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Button>

        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-100">Run Details</h1>
            <StatusBadge status={detailDisplayStatus(audit)} size="lg" />
          </div>
          <p className="mt-1 text-slate-400">
            {audit.input.baseUrl} • {formatDateTime(audit.startedAt ?? audit.updatedAt)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              void load().catch((err) =>
                setError(err instanceof Error ? err.message : "Refresh failed"),
              );
            }}
            className="bg-slate-800 text-slate-100 hover:bg-slate-700"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>

          {["queued", "running"].includes(audit.status) ? (
            <Button
              variant="outline"
              onClick={() => void onCancel()}
              disabled={canceling}
              className="border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              {canceling ? "Canceling..." : "Cancel"}
            </Button>
          ) : null}

          <Button asChild className="bg-slate-800 text-slate-100 hover:bg-slate-700">
            <a href={`/api/audits/${auditId}/export?format=md`} target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />
              Export
            </a>
          </Button>
        </div>
      </section>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Total Tests</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">{summary.total}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Passed</p>
            <p className="mt-1 text-2xl font-semibold text-emerald-300">{summary.passed}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Failed</p>
            <p className="mt-1 text-2xl font-semibold text-red-300">{summary.failed}</p>
          </CardContent>
        </Card>
        <Card className="border-slate-800 bg-slate-900/70">
          <CardContent className="p-4">
            <p className="text-sm text-slate-400">Pass Rate</p>
            <p
              className={`mt-1 text-2xl font-semibold ${
                summary.passRate >= 80
                  ? "text-emerald-300"
                  : summary.passRate >= 50
                    ? "text-amber-300"
                    : "text-red-300"
              }`}
            >
              {summary.passRate}%
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-400">Filter by viewport:</span>
        <Button
          size="sm"
          variant={selectedViewport === "all" ? "default" : "secondary"}
          onClick={() => setSelectedViewport("all")}
          className={selectedViewport === "all" ? "bg-blue-500 text-slate-950 hover:bg-blue-400" : "bg-slate-800 text-slate-100 hover:bg-slate-700"}
        >
          All
        </Button>
        <Button
          size="sm"
          variant={selectedViewport === "desktop" ? "default" : "secondary"}
          onClick={() => setSelectedViewport("desktop")}
          className={selectedViewport === "desktop" ? "bg-blue-500 text-slate-950 hover:bg-blue-400" : "bg-slate-800 text-slate-100 hover:bg-slate-700"}
        >
          <Monitor className="mr-1 h-4 w-4" />
          Desktop
        </Button>
        <Button
          size="sm"
          variant={selectedViewport === "mobile" ? "default" : "secondary"}
          onClick={() => setSelectedViewport("mobile")}
          className={selectedViewport === "mobile" ? "bg-blue-500 text-slate-950 hover:bg-blue-400" : "bg-slate-800 text-slate-100 hover:bg-slate-700"}
        >
          <Smartphone className="mr-1 h-4 w-4" />
          Mobile
        </Button>
      </section>

      <Card className="border-slate-800 bg-slate-900/70">
        <CardHeader>
          <CardTitle className="text-slate-100">Test Results Matrix</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {filteredRows.length === 0 ? (
            <p className="text-sm text-slate-500">No test rows for this viewport yet.</p>
          ) : (
            filteredRows.map((row) => {
              const key = getCaseKey(row);
              const expanded = expandedCase === key;
              const status = row.status;

              return (
                <div key={key} className="rounded-lg border border-slate-800 bg-slate-800/30">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                    onClick={() => setExpandedCase(expanded ? null : key)}
                  >
                    <div className="flex items-center gap-3">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 text-slate-500" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-500" />
                      )}

                      {status === "ok" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                      ) : status === "error" ? (
                        <XCircle className="h-4 w-4 text-red-300" />
                      ) : (
                        <Clock className="h-4 w-4 text-slate-500" />
                      )}

                      <div>
                        <p className="font-medium text-slate-100">{row.route}</p>
                        <p className="text-xs text-slate-500">{row.viewportKey} • {row.title || "Untitled"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {row.finalUrl ? (
                        <a
                          href={row.finalUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(event) => event.stopPropagation()}
                          className="text-xs text-blue-300 hover:text-blue-200"
                        >
                          Live <ExternalLink className="ml-1 inline h-3 w-3" />
                        </a>
                      ) : null}
                      <StatusBadge
                        status={
                          status === "ok"
                            ? "passed"
                            : status === "error"
                              ? "failed"
                              : status === "running"
                                ? "running"
                                : "pending"
                        }
                        size="sm"
                      />
                    </div>
                  </button>

                  {expanded ? (
                    <div className="space-y-4 border-t border-slate-800 px-4 py-3">
                      <div className="grid gap-2 md:grid-cols-2">
                        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm">
                          <p className="text-xs text-slate-500">Final URL</p>
                          <p className="mt-1 break-all text-slate-200">{row.finalUrl || row.fullUrl}</p>
                        </div>
                        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm">
                          <p className="text-xs text-slate-500">Signals</p>
                          <ul className="mt-1 space-y-1 text-slate-300">
                            <li>CTA above fold: {String(row.signals.ctaAboveFold)}</li>
                            <li>Navigation works: {String(row.signals.navWorks)}</li>
                            <li>Mobile horizontal scroll: {String(row.signals.mobileHorizontalScroll)}</li>
                            <li>Form labeling OK: {String(row.signals.formLabelingOk)}</li>
                          </ul>
                        </div>
                      </div>

                      {row.evidence.notes.length > 0 ? (
                        <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm">
                          <p className="mb-1 text-xs text-slate-500">Notes</p>
                          <ul className="list-disc space-y-1 pl-4 text-slate-300">
                            {row.evidence.notes.map((note, index) => (
                              <li key={`${key}-note-${index}`}>{note}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}

                      {row.evidence.screenshots.length > 0 ? (
                        <div>
                          <p className="mb-2 text-xs text-slate-500">Screenshots</p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {row.evidence.screenshots.map((shot) => (
                              <a
                                key={`${key}-${shot.url}`}
                                href={shot.url}
                                target="_blank"
                                rel="noreferrer"
                                className="overflow-hidden rounded-lg border border-slate-800"
                              >
                                <img src={shot.url} alt={shot.label} className="h-36 w-full object-cover" />
                                <div className="px-2 py-1.5 text-xs text-slate-400">{shot.label}</div>
                              </a>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {audit.issues.length > 0 ? (
        <Card className="border-slate-800 bg-slate-900/70">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <AlertTriangle className="h-5 w-5 text-amber-300" />
              Issues Found ({audit.issues.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {audit.issues.map((issue, index) => (
              <div key={`${issue.title}-${index}`} className="rounded-lg border border-slate-800 bg-slate-800/30 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="font-medium text-slate-100">{issue.title}</p>
                  <span className="rounded-full border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs capitalize text-slate-300">
                    {issue.severity}
                  </span>
                </div>
                <p className="text-sm text-slate-300">{issue.symptom}</p>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-xs text-slate-500">Expected</p>
                    <p className="text-slate-200">{issue.expected}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Actual</p>
                    <p className="text-red-300">{issue.actual}</p>
                  </div>
                </div>

                {issue.reproSteps.length > 0 ? (
                  <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
                    <p className="mb-1 text-xs text-slate-500">Reproduction Steps</p>
                    <pre className="whitespace-pre-wrap text-xs text-slate-300">{issue.reproSteps.join("\n")}</pre>
                  </div>
                ) : null}

                {issue.evidenceLinks.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {issue.evidenceLinks.map((link) => (
                      <a
                        key={link}
                        href={link}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-300 hover:text-blue-200"
                      >
                        Evidence <ExternalLink className="ml-1 inline h-3 w-3" />
                      </a>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <section className="flex items-center gap-2">
        <Button asChild variant="secondary" className="bg-slate-800 text-slate-100 hover:bg-slate-700">
          <Link href="/runs">Back to Runs</Link>
        </Button>

        <Button
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={() => void copyToClipboard(auditId)}
        >
          <Copy className="mr-2 h-4 w-4" />
          Copy Run ID
        </Button>
      </section>
    </div>
  );
}
