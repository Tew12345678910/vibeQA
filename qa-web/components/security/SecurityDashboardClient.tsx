"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Filter,
  Key,
  Lock,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatsCard } from "@/components/browserqa/StatsCard";
import type {
  SecurityFinding,
  SecurityFindingStatus,
  SecurityFindingType,
  SecurityScanConfig,
  SecurityScanSummary,
  SecuritySeverity,
} from "@/lib/security/types";
import {
  getAll,
  getOpenFindings,
  getSummary,
  initSecurityDemoData,
  runScan,
  updateStatus,
} from "@/lib/security/store";
import { getDefaultConfig, getSecurityEducation } from "@/lib/security/scanner";

type SeverityFilter = SecuritySeverity | "all";
type TypeFilter = SecurityFindingType | "all";

const severityStyles: Record<SecuritySeverity, string> = {
  critical:
    "border-red-500/60 bg-red-500/20 text-red-200 hover:bg-red-500/25 hover:text-red-100",
  high: "border-orange-500/60 bg-orange-500/20 text-orange-200 hover:bg-orange-500/25 hover:text-orange-100",
  medium:
    "border-yellow-500/60 bg-yellow-500/20 text-yellow-200 hover:bg-yellow-500/25 hover:text-yellow-100",
  low: "border-blue-500/60 bg-blue-500/20 text-blue-200 hover:bg-blue-500/25 hover:text-blue-100",
  info: "border-gray-500/60 bg-gray-500/20 text-gray-200 hover:bg-gray-500/25 hover:text-gray-100",
};

const typeStyles: Record<SecurityFindingType, string> = {
  secret_leak:
    "border-purple-500/60 bg-purple-500/20 text-purple-200 hover:bg-purple-500/25 hover:text-purple-100",
  pii_exposure:
    "border-pink-500/60 bg-pink-500/20 text-pink-200 hover:bg-pink-500/25 hover:text-pink-100",
  xss_vulnerability:
    "border-red-500/60 bg-red-500/20 text-red-200 hover:bg-red-500/25 hover:text-red-100",
  sql_injection:
    "border-red-500/60 bg-red-500/20 text-red-200 hover:bg-red-500/25 hover:text-red-100",
  insecure_dependency:
    "border-orange-500/60 bg-orange-500/20 text-orange-200 hover:bg-orange-500/25 hover:text-orange-100",
  insecure_header:
    "border-yellow-500/60 bg-yellow-500/20 text-yellow-200 hover:bg-yellow-500/25 hover:text-yellow-100",
  csrf_missing:
    "border-yellow-500/60 bg-yellow-500/20 text-yellow-200 hover:bg-yellow-500/25 hover:text-yellow-100",
};

const statusStyles: Record<SecurityFindingStatus, string> = {
  open: "border-red-500/50 bg-red-500/15 text-red-200",
  resolved: "border-emerald-500/50 bg-emerald-500/15 text-emerald-200",
  false_positive:
    "border-slate-500/50 bg-slate-500/15 text-slate-200",
};

function formatLocation(finding: SecurityFinding): string {
  const { location } = finding;
  if (location.file && typeof location.line === "number") {
    return `${location.file}:${location.line}`;
  }
  if (location.file) return location.file;
  if (location.url) return location.url;
  if (location.requestUrl) return location.requestUrl;
  return "Not specified";
}

function formatDetectedAt(date: Date): string {
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityLabel(severity: SecuritySeverity): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "high":
      return "High";
    case "medium":
      return "Medium";
    case "low":
      return "Low";
    case "info":
      return "Info";
  }
}

function typeLabel(type: SecurityFindingType): string {
  switch (type) {
    case "secret_leak":
      return "Secret Leak";
    case "pii_exposure":
      return "PII Exposure";
    case "xss_vulnerability":
      return "XSS Vulnerability";
    case "sql_injection":
      return "SQL Injection";
    case "insecure_dependency":
      return "Insecure Dependency";
    case "insecure_header":
      return "Insecure Header";
    case "csrf_missing":
      return "Missing CSRF";
  }
}

function statusLabel(status: SecurityFindingStatus): string {
  switch (status) {
    case "open":
      return "Unresolved";
    case "resolved":
      return "Resolved";
    case "false_positive":
      return "False positive";
  }
}

function getDisplayEvidence(
  finding: SecurityFinding,
  isRevealed: boolean,
): string {
  if (isRevealed) {
    return finding.rawEvidence ?? finding.evidence;
  }
  return finding.evidence;
}

export function SecurityDashboardClient() {
  const [findings, setFindings] = useState<SecurityFinding[]>([]);
  const [summary, setSummary] = useState<SecurityScanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] =
    useState<SeverityFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [config, setConfig] = useState<SecurityScanConfig>(
    () => getDefaultConfig(),
  );
  const [scanRunning, setScanRunning] = useState(false);
  const [revealedEvidenceIds, setRevealedEvidenceIds] = useState<
    Record<string, boolean>
  >({});
  const [expandedEducationIds, setExpandedEducationIds] = useState<
    Record<string, boolean>
  >({});

  useEffect(() => {
    initSecurityDemoData();
    const all = getAll();
    const sum = getSummary();
    setFindings(all);
    setSummary(sum);
    if (all.length > 0) {
      setSelectedId(all[0]?.id ?? null);
    }
    setLoading(false);

    // #region agent log
    if (typeof window !== "undefined") {
      fetch("http://127.0.0.1:7243/ingest/ec867638-7ea4-46f0-a075-9f86eb0391a7", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `log_${Date.now()}_security_init`,
          timestamp: Date.now(),
          location: "components/security/SecurityDashboardClient.tsx:useEffect",
          message: "SecurityDashboardClient initialized",
          data: { findingCount: all.length },
          runId: "initial",
          hypothesisId: "H3",
        }),
      }).catch(() => {});
    }
    // #endregion
  }, []);

  const openCount = useMemo(
    () => findings.filter((finding) => finding.status === "open").length,
    [findings],
  );

  const filteredFindings = useMemo(() => {
    let base = findings;

    if (severityFilter !== "all") {
      base = base.filter((finding) => finding.severity === severityFilter);
    }

    if (typeFilter !== "all") {
      base = base.filter((finding) => finding.type === typeFilter);
    }

    if (search.trim()) {
      const term = search.toLowerCase();
      base = base.filter(
        (finding) =>
          finding.name.toLowerCase().includes(term) ||
          finding.description.toLowerCase().includes(term),
      );
    }

    return base.sort(
      (a, b) => b.detectedAt.getTime() - a.detectedAt.getTime(),
    );
  }, [findings, severityFilter, typeFilter, search]);

  const selectedFinding: SecurityFinding | null = useMemo(() => {
    if (!selectedId) return filteredFindings[0] ?? null;
    return (
      filteredFindings.find((finding) => finding.id === selectedId) ??
      filteredFindings[0] ??
      null
    );
  }, [filteredFindings, selectedId]);

  const handleStatusChange = (id: string, status: SecurityFindingStatus) => {
    const updated = updateStatus(id, status);
    if (!updated) return;
    const all = getAll();
    setFindings(all);
    setSummary(getSummary());
    setSelectedId(id);
  };

  const handleRunScan = () => {
    setScanRunning(true);
    try {
      const { findings: updatedFindings, summary: updatedSummary } =
        runScan(config);
      setFindings(updatedFindings);
      setSummary(updatedSummary);
      if (!selectedId && updatedFindings.length > 0) {
        setSelectedId(updatedFindings[0]?.id ?? null);
      }
    } finally {
      setScanRunning(false);
    }
  };

  const riskTone: "green" | "yellow" | "red" =
    (summary?.riskScore ?? 0) >= 80
      ? "red"
      : (summary?.riskScore ?? 0) >= 50
        ? "yellow"
        : "green";

  if (loading) {
    return (
      <p className="text-sm text-slate-400">
        Loading security dashboard…
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <section className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-100">
            <Shield className="h-7 w-7 text-blue-400" />
            Security Audit
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Review security findings, understand their impact, and learn
            how to fix them.
          </p>
        </div>

        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="inline-flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-0.5 text-red-200">
              <CheckCircle2 className="h-3 w-3" />
              <span>{openCount} findings</span>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleRunScan}
            disabled={scanRunning}
            className="bg-blue-500 text-slate-950 hover:bg-blue-400"
          >
            <ShieldAlert className="mr-2 h-4 w-4" />
            {scanRunning ? "Running scan…" : "Run Security Scan"}
          </Button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatsCard
          title="Total Findings"
          value={summary?.totalFindings ?? 0}
          icon={ShieldAlert}
          tone="slate"
        />
        <StatsCard
          title="Critical"
          value={summary?.criticalCount ?? 0}
          icon={TriangleAlert}
          tone="red"
        />
        <StatsCard
          title="High"
          value={summary?.highCount ?? 0}
          icon={AlertCircle}
          tone="yellow"
        />
        <StatsCard
          title="Risk Score"
          value={`${summary?.riskScore ?? 0}/100`}
          icon={ShieldCheck}
          tone={riskTone}
        />
      </section>

      <section className="space-y-4">
        <div className="space-y-4">
          <Card className="border-slate-800 bg-slate-900/70">
            <CardHeader className="flex flex-col gap-3 border-b border-slate-800/80 pb-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-slate-400" />
                <CardTitle className="text-sm text-slate-200">
                  Filters
                </CardTitle>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <Select
                  value={severityFilter}
                  onValueChange={(value) =>
                    setSeverityFilter(value as SeverityFilter)
                  }
                >
                  <SelectTrigger className="w-[140px] border-slate-700 bg-slate-900 text-xs text-slate-100">
                    <SelectValue placeholder="Severity" />
                  </SelectTrigger>
                  <SelectContent className="border-slate-800 bg-slate-900 text-xs text-slate-100">
                    <SelectItem value="all">All severities</SelectItem>
                    <SelectItem value="critical">Critical</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="info">Info</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={typeFilter}
                  onValueChange={(value) =>
                    setTypeFilter(value as TypeFilter)
                  }
                >
                  <SelectTrigger className="w-[170px] border-slate-700 bg-slate-900 text-xs text-slate-100">
                    <SelectValue placeholder="Finding type" />
                  </SelectTrigger>
                  <SelectContent className="border-slate-800 bg-slate-900 text-xs text-slate-100">
                    <SelectItem value="all">All types</SelectItem>
                    <SelectItem value="secret_leak">
                      Secret leaks
                    </SelectItem>
                    <SelectItem value="pii_exposure">
                      PII exposure
                    </SelectItem>
                    <SelectItem value="xss_vulnerability">
                      XSS
                    </SelectItem>
                    <SelectItem value="sql_injection">
                      SQL injection
                    </SelectItem>
                    <SelectItem value="insecure_dependency">
                      Insecure dependency
                    </SelectItem>
                    <SelectItem value="insecure_header">
                      Insecure headers
                    </SelectItem>
                    <SelectItem value="csrf_missing">
                      Missing CSRF
                    </SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative w-full min-w-[180px] max-w-xs">
                  <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
                  <Input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search findings…"
                    className="h-8 border-slate-700 bg-slate-900 pl-8 text-xs text-slate-100 placeholder:text-slate-500"
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {filteredFindings.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-10 text-center text-sm text-slate-500">
                  <EyeOff className="h-5 w-5 text-slate-600" />
                  <p>No findings match the current filters.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-800">
                  {filteredFindings.map((finding) => {
                    const isSelected = finding.id === selectedFinding?.id;
                    const isEvidenceRevealed = Boolean(
                      revealedEvidenceIds[finding.id],
                    );
                    const isEducationExpanded = Boolean(
                      expandedEducationIds[finding.id],
                    );
                    const displayEvidence = getDisplayEvidence(
                      finding,
                      isEvidenceRevealed,
                    );
                    const education = getSecurityEducation(finding.type);
                    return (
                      <div
                        key={finding.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedId(finding.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelectedId(finding.id);
                          }
                        }}
                        className={`relative grid w-full grid-cols-1 items-start gap-3 px-4 py-3 text-left text-sm transition-colors lg:grid-cols-[140px_minmax(0,1fr)] xl:grid-cols-[140px_minmax(0,1fr)_220px] ${
                          isSelected
                            ? "bg-slate-800/60"
                            : "hover:bg-slate-800/40"
                        }`}
                      >
                        <div className="mt-1 flex flex-col items-start gap-2">
                          <Badge
                            variant="outline"
                            className={`px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${severityStyles[finding.severity]}`}
                          >
                            {severityLabel(finding.severity)}
                          </Badge>

                          <Badge
                            variant="outline"
                            className={`px-2 py-0.5 text-[10px] font-medium ${typeStyles[finding.type]}`}
                          >
                            {typeLabel(finding.type)}
                          </Badge>
                        </div>

                        <div className="min-w-0 space-y-2">
                          <p className="text-sm font-semibold text-slate-100 break-words">
                            {finding.name}
                          </p>

                          <p className="min-h-10 text-xs text-slate-400 break-words">
                            {finding.description}
                          </p>

                          <div className="rounded border border-slate-700/70 bg-slate-900/40 px-2 py-1 text-[11px] text-slate-500">
                            <p className="break-all">
                              Location: {formatLocation(finding)}
                            </p>
                          </div>
                        </div>

                        <div className="min-w-0 space-y-2 lg:col-span-2 xl:col-span-1">
                          <div className="flex flex-col items-end gap-1">
                            <Badge
                              variant="outline"
                              className={`px-2 py-0.5 text-[10px] capitalize ${statusStyles[finding.status]}`}
                            >
                              {statusLabel(finding.status)}
                            </Badge>
                            <span className="max-w-full text-right text-xs text-slate-500">
                              {formatDetectedAt(finding.detectedAt)}
                            </span>
                          </div>

                          <div className="flex justify-end">
                            {finding.evidence ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5 text-[10px] text-slate-400">
                                <Key className="h-3 w-3 text-slate-500" />
                                {isEvidenceRevealed
                                  ? "Evidence unmasked"
                                  : "Evidence masked"}
                              </span>
                            ) : null}
                          </div>

                          {displayEvidence ? (
                            <p className="rounded border border-slate-700 bg-slate-900/70 px-2 py-1 font-mono text-[11px] text-slate-300 break-all">
                              {displayEvidence}
                            </p>
                          ) : null}

                          <div className="grid grid-cols-1 gap-2 pt-1 text-xs">
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={!finding.evidence && !finding.rawEvidence}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!finding.evidence && !finding.rawEvidence) {
                                  return;
                                }
                                setRevealedEvidenceIds((prev) => ({
                                  ...prev,
                                  [finding.id]: !prev[finding.id],
                                }));
                              }}
                              className="w-full justify-center whitespace-nowrap border-blue-500/50 bg-blue-500/5 text-blue-300 hover:bg-blue-500/15 disabled:border-slate-700 disabled:bg-slate-800/60 disabled:text-slate-500"
                            >
                              {isEvidenceRevealed ? (
                                <>
                                  <EyeOff className="mr-1 h-3 w-3" />
                                  Hide evidence
                                </>
                              ) : (
                                <>
                                  <Eye className="mr-1 h-3 w-3" />
                                  Show evidence
                                </>
                              )}
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStatusChange(
                                  finding.id,
                                  finding.status === "resolved" ? "open" : "resolved",
                                );
                              }}
                              className="w-full justify-center whitespace-nowrap border-emerald-500/50 bg-emerald-500/5 text-emerald-300 hover:bg-emerald-500/15"
                            >
                              <CheckCircle2 className="mr-1 h-3 w-3" />
                              {finding.status === "resolved"
                                ? "Mark as unresolved"
                                : "Mark as resolved"}
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                handleStatusChange(
                                  finding.id,
                                  finding.status === "false_positive"
                                    ? "open"
                                    : "false_positive",
                                );
                              }}
                              className="w-full justify-center whitespace-nowrap border-slate-500/50 bg-slate-800/40 text-slate-200 hover:bg-slate-800"
                            >
                              <EyeOff className="mr-1 h-3 w-3" />
                              {finding.status === "false_positive"
                                ? "Unmark as false positive"
                                : "Mark as false positive"}
                            </Button>
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedEducationIds((prev) => ({
                                  ...prev,
                                  [finding.id]: !prev[finding.id],
                                }));
                              }}
                              className="w-full justify-center whitespace-nowrap border-purple-500/50 bg-purple-500/5 text-purple-200 hover:bg-purple-500/15"
                            >
                              <ShieldCheck className="mr-1 h-3 w-3" />
                              {isEducationExpanded
                                ? "Hide education"
                                : "Show education"}
                            </Button>
                          </div>

                        </div>

                        {isEducationExpanded ? (
                          <div className="col-span-full mt-1 space-y-2 rounded-lg border border-slate-700 bg-slate-900/90 p-3 text-xs">
                            <p className="font-semibold text-slate-100">
                              {education.title}
                            </p>
                            <div>
                              <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                                What this means
                              </p>
                              <p className="text-slate-300 break-words">
                                {education.explanation}
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                                Impact
                              </p>
                              <p className="text-slate-300 break-words">
                                {education.impact}
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                                Remediation
                              </p>
                              <p className="text-slate-300 break-words">
                                {education.remediation}
                              </p>
                            </div>
                            <div>
                              <p className="mb-1 text-[10px] uppercase tracking-wide text-slate-400">
                                References
                              </p>
                              <ul className="list-inside list-disc space-y-1 text-slate-300">
                                {education.references.map((ref) => (
                                  <li key={`${finding.id}-${ref}`}>
                                    <a
                                      href={ref}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-blue-300 hover:text-blue-200 hover:underline break-all"
                                    >
                                      {ref}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-800 bg-slate-900/70">
            <CardHeader className="border-b border-slate-800/80 pb-4">
              <CardTitle className="flex items-center gap-2 text-sm text-slate-200">
                <Lock className="h-4 w-4 text-slate-400" />
                Scan configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 p-4 text-xs text-slate-300 sm:grid-cols-2">
              <ConfigToggle
                label="Secrets & API keys"
                description="Search for AWS keys, tokens, and hardcoded passwords."
                checked={config.enableSecretsScan}
                onChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    enableSecretsScan: checked,
                  }))
                }
              />
              <ConfigToggle
                label="Personal data (PII)"
                description="Detect emails, phone numbers, and other identifiers."
                checked={config.enablePiiScan}
                onChange={(checked) =>
                  setConfig((prev) => ({ ...prev, enablePiiScan: checked }))
                }
              />
              <ConfigToggle
                label="XSS probes"
                description="Use common payloads to test reflected XSS."
                checked={config.enableXssScan}
                onChange={(checked) =>
                  setConfig((prev) => ({ ...prev, enableXssScan: checked }))
                }
              />
              <ConfigToggle
                label="Dependency check"
                description="Highlight outdated or vulnerable libraries."
                checked={config.enableDependencyScan}
                onChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    enableDependencyScan: checked,
                  }))
                }
              />
              <ConfigToggle
                label="HTTP headers"
                description="Look for missing security headers and cookie flags."
                checked={config.enableHeaderScan}
                onChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    enableHeaderScan: checked,
                  }))
                }
              />
              <ConfigToggle
                label="Fail on critical"
                description="Treat any critical finding as a failed run."
                checked={config.failOnCritical}
                onChange={(checked) =>
                  setConfig((prev) => ({
                    ...prev,
                    failOnCritical: checked,
                  }))
                }
              />
            </CardContent>
          </Card>
        </div>

      </section>
    </div>
  );
}

type ConfigToggleProps = {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

function ConfigToggle({
  label,
  description,
  checked,
  onChange,
}: ConfigToggleProps) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex flex-col gap-1 rounded-lg border px-3 py-2 text-left transition-colors ${
        checked
          ? "border-blue-500/50 bg-blue-500/10"
          : "border-slate-800 bg-slate-900 hover:border-slate-700"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-100">{label}</span>
        <span
          className={`inline-flex h-4 w-7 items-center rounded-full p-0.5 transition-colors ${
            checked ? "bg-blue-500" : "bg-slate-700"
          }`}
        >
          <span
            className={`h-3 w-3 rounded-full bg-slate-950 transition-transform ${
              checked ? "translate-x-3" : "translate-x-0"
            }`}
          />
        </span>
      </div>
      <p className="text-[11px] leading-snug text-slate-400">
        {description}
      </p>
    </button>
  );
}

function SearchIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path
        d="M10.5 4a6.5 6.5 0 0 1 5.154 10.427l3.46 3.459a1 1 0 0 1-1.414 1.415l-3.46-3.46A6.5 6.5 0 1 1 10.5 4Zm0 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z"
        fill="currentColor"
      />
    </svg>
  );
}


