"use client";

import {
  Activity,
  AlertTriangle,
  ArrowDown,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Database,
  Eye,
  FileSearch,
  GitMerge,
  Globe,
  Layers,
  Lock,
  MonitorCheck,
  MousePointerClick,
  Radio,
  Shield,
  Wrench,
  Zap,
} from "lucide-react";

/* ─── Pill label ──────────────────────────────────────────────── */
function Pill({
  color,
  children,
}: {
  color: "red" | "emerald" | "violet" | "sky";
  children: React.ReactNode;
}) {
  const map = {
    red: "border-red-500/30 bg-red-500/10 text-red-400",
    emerald: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    violet: "border-violet-500/30 bg-violet-500/10 text-violet-400",
    sky: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide ${map[color]}`}
    >
      {children}
    </span>
  );
}

/* ─── Problem row ─────────────────────────────────────────────── */
/* ─── Problem group ───────────────────────────────────────────── */
function PGroup({
  icon: Icon,
  label,
  accent,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  accent: string;
  badge?: string;
}) {
  return (
    <div className={`rounded-xl border bg-slate-900/50 p-3.5 ${accent}`}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span className="text-xs font-bold text-slate-100">{label}</span>
        {badge && (
          <span className="ml-auto rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400">
            {badge}
          </span>
        )}
      </div>
    </div>
  );
}

/* ─── Issue card section ──────────────────────────────────────── */
function ISection({
  icon: Icon,
  label,
  accent = "text-slate-400",
  children,
}: {
  icon: React.ElementType;
  label: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-2.5">
      <div className={`mb-1.5 flex items-center gap-1.5 ${accent}`}>
        <Icon className="h-3 w-3 shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-widest">
          {label}
        </span>
      </div>
      <div className="text-[11px] leading-relaxed text-slate-300">
        {children}
      </div>
    </div>
  );
}

/* ─── Pipeline node ───────────────────────────────────────────── */
function PNode({
  icon: Icon,
  label,
  sub,
  color = "sky",
}: {
  icon: React.ElementType;
  label: string;
  sub?: string;
  color?: "sky" | "violet" | "amber" | "emerald" | "pink";
}) {
  const c = {
    sky: "border-sky-500/40 bg-sky-500/10 text-sky-400",
    violet: "border-violet-500/40 bg-violet-500/10 text-violet-400",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-400",
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400",
    pink: "border-pink-500/40 bg-pink-500/10 text-pink-400",
  }[color];
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl border ${c}`}
      >
        <Icon className="h-4.5 w-4.5" />
      </div>
      <span className="text-xs font-semibold text-slate-200 text-center leading-tight">
        {label}
      </span>
      {sub && (
        <span className="text-[11px] text-slate-500 text-center leading-tight">
          {sub}
        </span>
      )}
    </div>
  );
}

/* ─── Main page ───────────────────────────────────────────────── */
export function TldrPage() {
  return (
    <div className="fixed inset-0 flex flex-col bg-slate-950 text-slate-100 overflow-hidden">
      <div className="tldr-bg-grid" aria-hidden />
      {/* Nav ─────────────────────────────────────────────────── */}
      <nav className="flex shrink-0 items-center justify-between border-b border-slate-800 px-5 py-2.5">
        <a
          href="https://tryvibeqa.vercel.app"
          className="group flex items-center gap-2"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-emerald-500 group-hover:bg-emerald-400 transition-colors">
            <Bot className="h-3 w-3 text-slate-950" />
          </div>
          <span className="text-sm font-bold text-slate-100 group-hover:text-white transition-colors">
            Vibe QA
          </span>
        </a>

        <a
          href="https://tryvibeqa.vercel.app"
          className="hidden text-xs font-mono text-slate-400 hover:text-emerald-400 transition-colors md:block"
        >
          tryvibeqa.vercel.app
        </a>
      </nav>

      {/* Three-column body ───────────────────────────────────── */}
      <div className="flex min-h-0 flex-1 divide-x divide-slate-800">
        {/* ── COL 1: PROBLEM ───────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto p-5">
          <div className="shrink-0">
            <Pill color="red">
              <AlertTriangle className="h-3 w-3" />
              The Problem
            </Pill>
            <h2 className="mt-3 text-lg font-bold text-slate-100">
              Vibe coding ships gaps you can&apos;t see.
            </h2>
            {/* 100+ stat */}
            <div className="mt-3 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/80 px-4 py-3">
              <span className="text-3xl font-black text-emerald-400">100+</span>
              <span className="text-xs leading-snug text-slate-400">
                quality checks in our database — most invisible to static
                analysis alone.
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            {/* API Security */}
            <PGroup
              icon={Shield}
              label="API Security & Auth"
              accent="border-red-500/20 text-red-400"
            />

            {/* Script Injection */}
            <PGroup
              icon={Code2}
              label="Script Injection"
              accent="border-orange-500/20 text-orange-400"
              badge="⚠ static scan misses some"
            />

            {/* UI/UX Accessibility */}
            <PGroup
              icon={Eye}
              label="UI / UX Accessibility"
              accent="border-violet-500/20 text-violet-400"
              badge="needs real browser"
            />

            {/* Data Validation & Contracts */}
            <PGroup
              icon={Database}
              label="Data Validation & Contracts"
              accent="border-sky-500/20 text-sky-400"
            />

            {/* Performance & Reliability */}
            <PGroup
              icon={Activity}
              label="Performance & Reliability"
              accent="border-teal-500/20 text-teal-400"
            />

            {/* Error Handling & Observability */}
            <PGroup
              icon={Radio}
              label="Error Handling & Observability"
              accent="border-pink-500/20 text-pink-400"
            />

            {/* Privacy & Compliance */}
            <PGroup
              icon={Lock}
              label="Privacy & Compliance"
              accent="border-indigo-500/20 text-indigo-400"
            />

            {/* Real-user only */}
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5">
              <div className="mb-2 flex items-center gap-2">
                <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                <span className="text-xs font-bold text-amber-300">
                  Cannot be identified from script alone
                </span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-400">
                These issues only surface when a real user (or browser agent)
                interacts with the live app.
              </p>
            </div>
          </div>
        </div>

        {/* ── COL 2: PIPELINE ──────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-0 overflow-y-auto p-5">
          <div className="shrink-0 mb-4">
            <Pill color="emerald">
              <CheckCircle2 className="h-3 w-3" />
              The Pipeline
            </Pill>
            <h2 className="mt-3 text-lg font-bold text-slate-100">
              Scan once. Two paths. One issues view.
            </h2>
          </div>

          {/* Pipeline diagram */}
          <div className="flex flex-1 flex-col items-center gap-0 text-center">
            {/* Entry */}
            <PNode
              icon={FileSearch}
              label="GitHub Repo"
              sub="paste URL"
              color="sky"
            />
            <ArrowDown className="h-3.5 w-3.5 text-slate-700 my-1 shrink-0" />
            <PNode
              icon={BrainCircuit}
              label="Static Scan"
              sub="no code executed"
              color="sky"
            />

            {/* Fork label */}
            <div className="my-2 flex items-center gap-2 w-full">
              <div className="flex-1 h-px bg-slate-800" />
              <span className="text-[11px] font-bold tracking-widest text-slate-500 uppercase shrink-0">
                forks into 2 paths
              </span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Two branches */}
            <div className="flex w-full gap-3 items-start">
              {/* ── LEFT: RAG path ── */}
              <div className="flex flex-1 flex-col items-center gap-1.5 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                <span className="text-xs font-bold tracking-wider text-violet-400 uppercase mb-1">
                  RAG
                </span>
                <PNode
                  icon={Layers}
                  label="Rules Index"
                  sub="semantically indexed"
                  color="violet"
                />
                <ArrowDown className="h-3 w-3 text-slate-700 shrink-0" />
                <PNode
                  icon={BrainCircuit}
                  label="AI Report"
                  sub="GPT-4.1 + retrieval"
                  color="violet"
                />
                <ArrowDown className="h-3 w-3 text-slate-700 shrink-0" />
                <PNode
                  icon={FileSearch}
                  label="Local Cards"
                  sub="P0–P2 issues"
                  color="violet"
                />
              </div>

              {/* ── RIGHT: AI Agent / browser-use path ── */}
              <div className="flex flex-1 flex-col items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <span className="text-xs font-bold tracking-wider text-amber-400 uppercase mb-1">
                  AI Agent
                </span>
                <PNode
                  icon={Globe}
                  label="Test Plan"
                  sub="per endpoint"
                  color="amber"
                />
                <ArrowDown className="h-3 w-3 text-slate-700 shrink-0" />
                <PNode
                  icon={MonitorCheck}
                  label="browser-use"
                  sub="live browser agent"
                  color="amber"
                />
                <ArrowDown className="h-3 w-3 text-slate-700 shrink-0" />
                <PNode
                  icon={CheckCircle2}
                  label="Runtime Cards"
                  sub="real findings"
                  color="amber"
                />
              </div>
            </div>

            {/* Merge label */}
            <div className="my-2 flex items-center gap-2 w-full">
              <div className="flex-1 h-px bg-slate-800" />
              <GitMerge className="h-3 w-3 text-slate-600 shrink-0" />
              <span className="text-[11px] font-bold tracking-widest text-slate-500 uppercase shrink-0">
                merges
              </span>
              <div className="flex-1 h-px bg-slate-800" />
            </div>

            {/* Exit */}
            <PNode
              icon={CheckCircle2}
              label="Unified Issues"
              sub="de-duped · ranked P0–P2"
              color="emerald"
            />
          </div>
        </div>

        {/* ── COL 3: SAMPLE ISSUE CARD ─────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-0 overflow-y-auto p-5">
          <div className="shrink-0 mb-3">
            <Pill color="sky">
              <FileSearch className="h-3 w-3" />
              Sample Issue Card
            </Pill>
            <h2 className="mt-3 text-lg font-bold text-slate-100">
              Learn from your code, not just in it.
            </h2>
          </div>

          {/* Card shell */}
          <div className="flex flex-col gap-2 rounded-xl border border-slate-700 bg-slate-900 p-3">
            {/* ── Header ── */}
            <div className="flex flex-wrap items-start gap-2">
              <span className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-[11px] font-black text-red-400">
                P0
              </span>
              <span className="rounded-md border border-slate-600 bg-slate-800 px-2 py-0.5 text-[11px] font-semibold text-slate-400">
                local
              </span>
              <span className="rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-0.5 text-[11px] font-semibold text-sky-400">
                API Security
              </span>
              <span className="ml-auto rounded border border-slate-700 bg-slate-800/60 px-2 py-0.5 text-[10px] font-mono text-slate-500">
                AUTH-01
              </span>
            </div>

            <p className="text-sm font-bold text-slate-100 leading-snug">
              Missing authentication on{" "}
              <code className="rounded bg-slate-800 px-1 text-red-300">
                /api/users
              </code>
            </p>

            {/* ── Impact ── */}
            <ISection icon={Zap} label="Impact" accent="text-amber-400">
              <div className="flex flex-col gap-1">
                <div className="flex gap-1.5">
                  <span className="shrink-0 text-slate-500">User</span>
                  <span>
                    Any unauthenticated visitor can read all user accounts
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <span className="shrink-0 text-slate-500">Business</span>
                  <span>PII exposure — GDPR liability</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="shrink-0 text-slate-500">Risk</span>
                  <span className="text-red-400 font-semibold">
                    Critical — trivially exploitable
                  </span>
                </div>
              </div>
            </ISection>

            {/* ── Scope ── */}
            <ISection icon={Globe} label="Scope" accent="text-sky-400">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="rounded border border-slate-700 bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                    GET
                  </span>
                  <span className="font-mono text-slate-300">/api/users</span>
                  <span className="text-slate-600">·</span>
                  <span className="text-slate-500">endpoint</span>
                </div>
                <div className="flex items-center gap-1.5 font-mono">
                  <span className="text-slate-400">app/api/users/route.ts</span>
                  <span className="text-slate-600">L12–18</span>
                </div>
              </div>
            </ISection>

            {/* ── Problem ── */}
            <ISection
              icon={AlertTriangle}
              label="Problem"
              accent="text-red-400"
            >
              <div className="flex flex-col gap-1.5">
                <p>GET handler returns all rows with no session check.</p>
                <pre className="rounded-md border border-slate-700 bg-slate-950 p-2 font-mono text-[10px] text-slate-400 overflow-x-auto">
                  {`export async function GET() {
  const users = await db.getAllUsers();
  // ← no auth check
  return NextResponse.json(users);
}`}
                </pre>
              </div>
            </ISection>

            {/* ── Recommendation ── */}
            <ISection
              icon={Wrench}
              label="Recommendation"
              accent="text-emerald-400"
            >
              <div className="flex flex-col gap-1.5">
                <p>Add session validation before querying the database.</p>
                <ol className="flex flex-col gap-0.5 pl-3 list-decimal marker:text-slate-600">
                  <li>
                    Import{" "}
                    <code className="text-slate-300">getServerSession</code>{" "}
                    from next-auth
                  </li>
                  <li>Check session at route entry point</li>
                  <li>
                    Return <code className="text-slate-300">401</code> if
                    session is absent
                  </li>
                </ol>
                <div className="mt-1 flex flex-col gap-0.5">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                    Acceptance criteria
                  </span>
                  {[
                    "Auth header required on every request",
                    "Unauthenticated call returns 401",
                  ].map((c) => (
                    <div key={c} className="flex items-center gap-1.5">
                      <CheckCircle2 className="h-2.5 w-2.5 shrink-0 text-emerald-500" />
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-3 pt-0.5">
                  <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-slate-300">
                    Effort: S
                  </span>
                  <span className="rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                    Confidence: high
                  </span>
                </div>
              </div>
            </ISection>

            {/* ── Education ── */}
            <ISection
              icon={BookOpen}
              label="Why it matters"
              accent="text-violet-400"
            >
              <div className="flex flex-col gap-1">
                <p>
                  Unauthenticated endpoints are the #1 cause of data breaches in
                  API-first apps.
                </p>
                <p className="flex items-start gap-1.5 text-slate-500">
                  <span className="shrink-0 font-bold text-violet-500">
                    Rule
                  </span>
                  Every route touching user data must verify identity first.
                </p>
              </div>
            </ISection>

            {/* ── Status footer ── */}
            <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 pt-2">
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">
                open
              </span>
              <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400">
                backend
              </span>
              <span className="ml-auto font-mono text-[10px] text-slate-600">
                2026-03-01
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer strip ───────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-center border-t border-slate-800 px-5 py-2">
        <a
          href="https://tryvibeqa.vercel.app"
          className="font-mono text-sm font-semibold text-slate-500 hover:text-emerald-400 transition-colors"
        >
          tryvibeqa.vercel.app
        </a>
      </div>
    </div>
  );
}
