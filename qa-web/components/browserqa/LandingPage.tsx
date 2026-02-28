"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Code2,
  Github,
  Globe,
  Lightbulb,
  MonitorCheck,
  Shield,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";

/* ─── Typewriter ──────────────────────────────────────────────── */
const WORDS = [
  "understand your code.",
  "ship with confidence.",
  "learn as you build.",
  "vibe smarter.",
];

function Typewriter() {
  const [wordIdx, setWordIdx] = useState(0);
  const [displayed, setDisplayed] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const word = WORDS[wordIdx];
    let timeout: ReturnType<typeof setTimeout>;
    if (!deleting && displayed.length < word.length) {
      timeout = setTimeout(
        () => setDisplayed(word.slice(0, displayed.length + 1)),
        60,
      );
    } else if (!deleting && displayed.length === word.length) {
      timeout = setTimeout(() => setDeleting(true), 1900);
    } else if (deleting && displayed.length > 0) {
      timeout = setTimeout(
        () => setDisplayed(word.slice(0, displayed.length - 1)),
        35,
      );
    } else if (deleting && displayed.length === 0) {
      setDeleting(false);
      setWordIdx((i) => (i + 1) % WORDS.length);
    }
    return () => clearTimeout(timeout);
  }, [displayed, deleting, wordIdx]);

  return (
    <span className="text-emerald-400">
      {displayed}
      <span className="animate-pulse">|</span>
    </span>
  );
}

/* ─── Scroll-reveal hook ──────────────────────────────────────── */
function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

/* ─── Background ──────────────────────────────────────────────── */
function BackgroundOrbs() {
  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    >
      <div className="landing-orb landing-orb-1" />
      <div className="landing-orb landing-orb-2" />
      <div className="landing-orb landing-orb-3" />
      <div className="landing-grid" />
    </div>
  );
}

/* ─── Lesson callout ──────────────────────────────────────────── */
function Lesson({
  n,
  title,
  body,
}: {
  n: string;
  title: string;
  body: string;
}) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={[
        "flex gap-5 transition-all duration-700",
        visible ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-6",
      ].join(" ")}
    >
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-xs font-bold text-emerald-400">
        {n}
      </div>
      <div>
        <p className="mb-1 font-semibold text-slate-100">{title}</p>
        <p className="text-sm leading-relaxed text-slate-400">{body}</p>
      </div>
    </div>
  );
}

/* ─── Issue type card ─────────────────────────────────────────── */
function IssueCard({
  priority,
  priorityColor,
  badgeColor,
  category,
  example,
  why,
  delay,
}: {
  priority: string;
  priorityColor: string;
  badgeColor: string;
  category: string;
  example: string;
  why: string;
  delay?: string;
}) {
  const { ref, visible } = useReveal();
  return (
    <div
      ref={ref}
      className={[
        "flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-5 transition-all duration-700",
        "hover:border-slate-600 hover:bg-slate-900/90",
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6",
        delay ?? "",
      ].join(" ")}
    >
      <div className="flex items-center gap-2">
        <span
          className={`rounded px-2 py-0.5 text-xs font-bold text-slate-950 ${badgeColor}`}
        >
          {priority}
        </span>
        <span className={`text-xs font-semibold ${priorityColor}`}>
          {category}
        </span>
      </div>
      <p className="font-mono text-sm text-slate-300">{example}</p>
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
        <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
        <p className="text-xs leading-relaxed text-amber-200/80">{why}</p>
      </div>
    </div>
  );
}

/* ─── Code snippet block ──────────────────────────────────────── */
function CodeBlock({
  lines,
}: {
  lines: Array<{ code: string; annotation?: string; highlight?: boolean }>;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-700/60 bg-slate-950 font-mono text-sm">
      <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/60" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-500/60" />
      </div>
      <div className="space-y-0">
        {lines.map((l, i) => (
          <div
            key={i}
            className={[
              "flex gap-3 px-4 py-1",
              l.highlight ? "bg-red-500/8 border-l-2 border-red-500/60" : "",
            ].join(" ")}
          >
            <span className="w-6 shrink-0 select-none text-slate-600">
              {i + 1}
            </span>
            <span className={l.highlight ? "text-red-300" : "text-slate-400"}>
              {l.code}
            </span>
            {l.annotation && (
              <span className="ml-auto text-xs text-amber-400/70 italic">
                {l.annotation}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Terminal mockup ─────────────────────────────────────────── */
function TerminalMockup() {
  const lines = [
    {
      delay: 0,
      text: "$ vibeqa analyze github.com/my-app",
      color: "text-slate-300",
    },
    {
      delay: 400,
      text: "  ✓ Fetching repo tree (243 files)...",
      color: "text-slate-400",
    },
    {
      delay: 800,
      text: "  ✓ Static checks: endpoints, auth, validation",
      color: "text-slate-400",
    },
    {
      delay: 1200,
      text: "  ✓ AI report generated (GPT-4.1)",
      color: "text-emerald-400",
    },
    {
      delay: 1600,
      text: "  ↳ Browser agent launched at https://my-app.com",
      color: "text-blue-400",
    },
    {
      delay: 2000,
      text: "  ✓ 18 issues found  ·  3 P0  ·  8 P1  ·  7 P2",
      color: "text-amber-400",
    },
    {
      delay: 2400,
      text: "  ✓ Each issue includes: why it matters + fix steps",
      color: "text-emerald-400",
    },
  ];
  const [shown, setShown] = useState(0);
  useEffect(() => {
    lines.forEach((l, i) => {
      setTimeout(() => setShown(i + 1), l.delay + 600);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950 shadow-2xl shadow-black/60">
      <div className="flex items-center gap-1.5 border-b border-slate-800 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-red-500/70" />
        <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
        <span className="h-3 w-3 rounded-full bg-green-500/70" />
        <span className="ml-3 text-xs text-slate-500">vibeqa — analysis</span>
      </div>
      <div className="space-y-1.5 p-6 font-mono text-sm">
        {lines.map((l, i) => (
          <p
            key={i}
            className={[
              l.color,
              "transition-all duration-500",
              i < shown
                ? "opacity-100 translate-x-0"
                : "opacity-0 -translate-x-4",
            ].join(" ")}
          >
            {l.text}
          </p>
        ))}
        {shown >= lines.length && (
          <p className="mt-2 animate-pulse text-slate-500">█</p>
        )}
      </div>
    </div>
  );
}

/* ─── Issue detail mockup ─────────────────────────────────────── */
function IssueDetailMockup() {
  return (
    <div className="w-full overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-950 shadow-2xl shadow-black/60">
      <div className="flex items-center gap-2 border-b border-slate-800 bg-slate-900/80 px-4 py-3">
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-red-500/70" />
          <span className="h-3 w-3 rounded-full bg-yellow-500/70" />
          <span className="h-3 w-3 rounded-full bg-green-500/70" />
        </div>
        <div className="ml-2 flex flex-1 items-center gap-2 rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1">
          <Globe className="h-3 w-3 text-slate-500" />
          <span className="text-xs text-slate-400">
            vibeqa.app / issues / P0-001
          </span>
        </div>
      </div>
      <div className="space-y-4 p-5">
        <div className="flex items-center gap-2">
          <span className="rounded bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
            P0
          </span>
          <span className="text-sm font-semibold text-slate-100">
            Missing CSRF protection on /api/auth/login
          </span>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Why it matters
          </p>
          <p className="text-xs leading-relaxed text-slate-300">
            An attacker can craft a page that silently submits a login form on
            behalf of a visitor, hijacking their session without any
            interaction.
          </p>
        </div>
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Evidence — app/api/auth/login/route.ts:12
          </p>
          <div className="rounded-lg border border-slate-800 bg-slate-900 p-3 font-mono text-xs text-red-300">
            <p>{"export async function POST(req: Request) {"}</p>
            <p className="pl-4 text-slate-400">
              {"// ← no origin / csrf token check"}
            </p>
            <p className="pl-4">
              {"const { email, password } = await req.json();"}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Fix steps
          </p>
          {[
            "Verify Origin / Referer header server-side",
            "Add a CSRF token signed with your session secret",
            "Reject requests where Origin doesn't match your domain",
          ].map((s, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-slate-300"
            >
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
              {s}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Main component ──────────────────────────────────────────── */
export function LandingPage() {
  const heroReveal = useReveal();
  const blindspotReveal = useReveal();

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-950 text-slate-100">
      {/* ── Nav ── */}
      <nav className="fixed inset-x-0 top-0 z-40 border-b border-slate-800/60 bg-slate-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500">
              <Bot className="h-4 w-4 text-slate-950" />
            </div>
            <span className="font-bold text-white">VibeQA</span>
          </div>
          <div className="hidden items-center gap-6 text-sm text-slate-400 sm:flex">
            <a
              href="#the-blind-spot"
              className="transition-colors hover:text-slate-200"
            >
              The blind spot
            </a>
            <a
              href="#what-you-learn"
              className="transition-colors hover:text-slate-200"
            >
              What you learn
            </a>
            <a
              href="#issue-types"
              className="transition-colors hover:text-slate-200"
            >
              Issue types
            </a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button
                variant="ghost"
                size="sm"
                className="text-slate-300 hover:text-white"
              >
                Sign in
              </Button>
            </Link>
            <Link href="/projects/new">
              <Button
                size="sm"
                className="bg-emerald-500 text-slate-950 hover:bg-emerald-400"
              >
                Scan my repo free
              </Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center px-6 pt-14">
        <BackgroundOrbs />
        <div
          ref={heroReveal.ref}
          className={[
            "relative z-10 mx-auto max-w-4xl text-center transition-all duration-1000",
            heroReveal.visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8",
          ].join(" ")}
        >
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-400">
            <BookOpen className="h-3.5 w-3.5" />
            The QA education layer for AI-assisted development
          </div>

          <h1 className="mb-4 text-5xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
            Build fast.
            <br />
            <Typewriter />
          </h1>

          <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-slate-400">
            VibeQA runs two AI agents on every scan — one reads your{" "}
            <span className="text-slate-200">source code</span>, one operates a
            real browser on your{" "}
            <span className="text-slate-200">live site</span> — then explains
            exactly what's wrong and{" "}
            <span className="text-emerald-400">teaches you why it matters</span>
            .
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link href="/projects/new">
              <Button
                size="lg"
                className="gap-2 bg-emerald-500 px-8 text-slate-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
              >
                Scan my repo — it&apos;s free <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <a href="#the-blind-spot">
              <Button
                variant="outline"
                size="lg"
                className="border-slate-700 bg-transparent text-slate-300 hover:border-slate-500 hover:bg-slate-800/60 hover:text-white"
              >
                What am I missing?
              </Button>
            </a>
          </div>
        </div>

        {/* Stats — kept outside the animated container so they don't shift with the typewriter */}
        <div className="absolute bottom-10 left-0 right-0 flex justify-center px-6">
          <div className="grid grid-cols-3 gap-8 border-t border-slate-800/60 pt-8 w-full max-w-2xl">
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl font-bold text-white">2</span>
              <span className="text-sm text-slate-400">
                agents — code + browser
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl font-bold text-white">100+</span>
              <span className="text-sm text-slate-400">
                quality checks explained
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <span className="text-3xl font-bold text-white">0</span>
              <span className="text-sm text-slate-400">
                config files needed
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── The blind spot ── */}
      <section
        id="the-blind-spot"
        className="relative mx-auto max-w-6xl px-6 pb-32"
      >
        <div
          ref={blindspotReveal.ref}
          className={[
            "transition-all duration-700",
            blindspotReveal.visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-8",
          ].join(" ")}
        >
          <div className="mb-10 max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
              <TriangleAlert className="h-3.5 w-3.5" />
              The vibe coding blind spot
            </div>
            <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
              AI writes the code.
              <br />
              <span className="text-amber-400">
                But who checks the code AI writes?
              </span>
            </h2>
            <p className="text-slate-400 leading-relaxed">
              Vibe coding — using AI assistants to generate features at speed —
              is incredibly powerful. But AI models are optimised to make code
              that{" "}
              <em className="text-slate-300 not-italic font-medium">works</em>,
              not code that is secure, observable, and production-ready. Two
              entire coverage gaps are almost always left open.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Gap 1 */}
            <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/30 bg-red-500/15">
                  <Code2 className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-100">
                    Gap 1 — Static code quality
                  </p>
                  <p className="text-xs text-slate-500">
                    What the AI never mentions
                  </p>
                </div>
              </div>
              <div className="space-y-3 text-sm text-slate-400">
                <p>
                  AI assistants generate route handlers, auth flows, and API
                  endpoints — but they routinely skip:
                </p>
                <ul className="ml-4 space-y-1.5 list-disc marker:text-red-400">
                  <li>Input validation on every parameter</li>
                  <li>Rate limiting to prevent abuse</li>
                  <li>CSRF tokens on state-mutating routes</li>
                  <li>Standardised error response shapes</li>
                  <li>Idempotency keys on payment endpoints</li>
                  <li>Request ID logging for debugging</li>
                </ul>
                <p className="pt-1 text-slate-500 italic text-xs">
                  These aren't bugs — the code runs fine. They're the gaps that
                  let attackers in and make production incidents impossible to
                  debug.
                </p>
              </div>
            </div>

            {/* Gap 2 */}
            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-6">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-blue-500/30 bg-blue-500/15">
                  <MonitorCheck className="h-4 w-4 text-blue-400" />
                </div>
                <div>
                  <p className="font-semibold text-slate-100">
                    Gap 2 — Runtime behaviour
                  </p>
                  <p className="text-xs text-slate-500">
                    What only a real browser finds
                  </p>
                </div>
              </div>
              <div className="space-y-3 text-sm text-slate-400">
                <p>
                  Code review tells half the story. A browser agent finds the
                  other half by actually using your app:
                </p>
                <ul className="ml-4 space-y-1.5 list-disc marker:text-blue-400">
                  <li>Images missing alt text (accessibility)</li>
                  <li>Forms that submit with no feedback</li>
                  <li>Loading states that never resolve</li>
                  <li>Mobile layout broken at 375 px</li>
                  <li>Console errors on page load</li>
                  <li>Redirect loops after login</li>
                </ul>
                <p className="pt-1 text-slate-500 italic text-xs">
                  No static analyser can see these. You need a real browser to
                  run the flows a user would actually take.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Live demo ── */}
      <section className="mx-auto max-w-6xl px-6 pb-32">
        <div className="mb-10 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-400">
            See it in action
          </p>
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Both agents, running in parallel
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            One combs your repository. One drives your live site. Every finding
            links back to the code — with a plain-English explanation of the
            risk.
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-400">
              <Code2 className="h-4 w-4 text-emerald-400" /> Code analysis agent
            </p>
            <TerminalMockup />
          </div>
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-400">
              <MonitorCheck className="h-4 w-4 text-blue-400" /> Issue detail —
              with education built in
            </p>
            <IssueDetailMockup />
          </div>
        </div>
      </section>

      {/* ── What you learn ── */}
      <section id="what-you-learn" className="mx-auto max-w-6xl px-6 pb-32">
        <div className="grid gap-14 lg:grid-cols-2 lg:items-start">
          {/* Left: text lessons */}
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-400">
              <BrainCircuit className="h-3.5 w-3.5" />
              What VibeQA teaches you
            </div>
            <h2 className="mb-3 text-3xl font-bold text-white sm:text-4xl">
              Every finding is a lesson,
              <br />
              <span className="text-violet-400">not just a ticket.</span>
            </h2>
            <p className="mb-8 text-slate-400 leading-relaxed">
              Most QA tools hand you a bug list. VibeQA explains the{" "}
              <em className="not-italic font-medium text-slate-200">why</em>{" "}
              behind every issue — so you ship the fix and understand the
              pattern well enough not to repeat it.
            </p>
            <div className="space-y-7">
              <Lesson
                n="01"
                title="Understand the security model behind each check"
                body="Every security finding links to the attack vector it prevents. CSRF, injection, auth bypass — explained in plain English, not CVE numbers."
              />
              <Lesson
                n="02"
                title="See the real user impact before it happens"
                body="Each issue shows the user-facing consequence: 'a visitor sees a blank screen', 'a screen reader can't navigate this page', 'an attacker can brute-force passwords'."
              />
              <Lesson
                n="03"
                title="Get concrete fix steps, not vague advice"
                body="Every P0–P2 issue includes implementation steps and acceptance criteria you can paste into AI assistant prompts to generate the fix."
              />
              <Lesson
                n="04"
                title="Learn the framework-specific best practice"
                body="Checks are tuned to your stack: Next.js App Router, Express, FastAPI. You learn the right pattern for your specific setup, not generic advice."
              />
            </div>
          </div>

          {/* Right: code example */}
          <div className="space-y-5">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                Before — what the AI generated
              </p>
              <CodeBlock
                lines={[
                  { code: "export async function POST(req: Request) {" },
                  {
                    code: "  const { email, password } = await req.json();",
                    highlight: true,
                    annotation: "← no validation",
                  },
                  { code: "  const user = await db.users.findFirst({" },
                  { code: "    where: { email }" },
                  { code: "  });" },
                  {
                    code: "  // ... auth logic",
                    highlight: true,
                    annotation: "← no rate limit",
                  },
                  { code: "}" },
                ]}
              />
              <p className="mt-3 flex items-start gap-2 text-xs text-red-300/80">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-400" />
                Unvalidated input + no rate limit = brute-forceable login
                endpoint
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-800/40 bg-emerald-950/20 p-5">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
                After — following VibeQA guidance
              </p>
              <CodeBlock
                lines={[
                  { code: "export async function POST(req: Request) {" },
                  {
                    code: "  await rateLimit(req, { max: 10, window: '15m' });",
                  },
                  {
                    code: "  const body = LoginSchema.safeParse(await req.json());",
                  },
                  { code: "  if (!body.success)" },
                  {
                    code: "    return NextResponse.json({ error: body.error }, { status: 400 });",
                  },
                  { code: "  // ... auth logic" },
                  { code: "}" },
                ]}
              />
              <p className="mt-3 flex items-start gap-2 text-xs text-emerald-300/80">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                Validated input, rate-limited, standardised error shape
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Issue types ── */}
      <section id="issue-types" className="mx-auto max-w-6xl px-6 pb-32">
        <div className="mb-10 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-semibold text-red-400">
            <AlertTriangle className="h-3.5 w-3.5" />
            Common issue types vibe coders miss
          </div>
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            The patterns AI assistants skip
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-400">
            These aren&apos;t rare edge cases. They appear in the majority of
            AI-generated codebases — and every one of them has a simple fix once
            you know what to look for.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <IssueCard
            priority="P0"
            priorityColor="text-red-400"
            badgeColor="bg-red-500"
            category="Security — Auth"
            example="No rate limit on POST /api/auth/login"
            why="Without a rate limit, any attacker can try millions of password combinations. 10 lines of middleware prevents account takeover."
          />
          <IssueCard
            priority="P0"
            priorityColor="text-red-400"
            badgeColor="bg-red-500"
            category="Security — CSRF"
            example="State-mutating route accepts any Origin"
            why="A malicious site can silently submit forms as your logged-in users. One Origin check blocks the entire attack class."
            delay="[transition-delay:50ms]"
          />
          <IssueCard
            priority="P1"
            priorityColor="text-orange-400"
            badgeColor="bg-orange-400"
            category="Validation"
            example="req.json() used without Zod / schema parse"
            why="Unvalidated input is the root cause of most injection and type-coercion bugs. A 5-line Zod schema eliminates the entire input surface."
            delay="[transition-delay:100ms]"
          />
          <IssueCard
            priority="P1"
            priorityColor="text-orange-400"
            badgeColor="bg-orange-400"
            category="Observability"
            example="No request ID attached to log entries"
            why="Without a request ID you cannot correlate a user complaint to a server error. Every failed request becomes a mystery."
            delay="[transition-delay:150ms]"
          />
          <IssueCard
            priority="P1"
            priorityColor="text-orange-400"
            badgeColor="bg-orange-400"
            category="Accessibility"
            example="<img> tags missing alt attribute"
            why="Screen readers announce 'image' to blind users. Alt text is a 10-second fix that opens your product to millions of users."
            delay="[transition-delay:200ms]"
          />
          <IssueCard
            priority="P2"
            priorityColor="text-yellow-400"
            badgeColor="bg-yellow-400"
            category="API Design"
            example="GET /api/items returns all rows with no limit"
            why="As data grows, this query will time out or OOM your server. Pagination with a max-limit cap is a one-time fix."
            delay="[transition-delay:250ms]"
          />
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-6xl px-6 pb-32">
        <div className="mb-12 text-center">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-400">
            How it works
          </p>
          <h2 className="text-3xl font-bold text-white sm:text-4xl">
            Connect a repo. Get a curriculum.
          </h2>
        </div>
        <div className="relative grid gap-12 md:grid-cols-3">
          {[
            {
              n: "01",
              title: "Drop your GitHub repo",
              body: "Pick from your connected repos. No write access, no OAuth scopes beyond 'read'. The agents fetch the tree and get to work.",
            },
            {
              n: "02",
              title: "Two agents audit in parallel",
              body: "The code agent scans endpoints, patterns, and stack. The browser agent navigates every route of your live site — clicking, submitting, observing.",
              delay: "[transition-delay:150ms]",
            },
            {
              n: "03",
              title: "Read your personalised issue guide",
              body: "Issues arrive prioritised P0–P2, each with: the vulnerability class, user impact, code evidence with line numbers, and step-by-step fix guidance.",
              delay: "[transition-delay:300ms]",
            },
          ].map(({ n, title, body, delay }) => {
            const { ref, visible } = useReveal();
            return (
              <div
                key={n}
                ref={ref}
                className={[
                  "flex flex-col gap-4 transition-all duration-700",
                  visible
                    ? "opacity-100 translate-y-0"
                    : "opacity-0 translate-y-8",
                  delay ?? "",
                ].join(" ")}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-sm font-bold text-emerald-400">
                  {n}
                </div>
                <div>
                  <h3 className="mb-1.5 text-base font-semibold text-slate-100">
                    {title}
                  </h3>
                  <p className="text-sm leading-relaxed text-slate-400">
                    {body}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section className="relative overflow-hidden px-6 pb-32">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="landing-orb landing-orb-cta" />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-sm text-emerald-400">
            <Github className="h-3.5 w-3.5" />
            Free for any public or private GitHub repo
          </div>
          <h2 className="mb-4 text-3xl font-bold text-white sm:text-4xl">
            The fastest way to level up
            <br />
            <span className="text-emerald-400">your vibe-coded projects.</span>
          </h2>
          <p className="mx-auto mb-8 max-w-xl text-slate-400">
            Connect your GitHub repo. In under two minutes, get a full code +
            browser audit — with explanations that make you a better builder,
            not just a faster one.
          </p>

          <div className="mb-10 grid gap-3 sm:grid-cols-3">
            {[
              { icon: Shield, text: "Security patterns explained" },
              { icon: BookOpen, text: "Why each issue matters" },
              { icon: Sparkles, text: "Fix steps you can act on" },
            ].map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="flex items-center justify-center gap-2 text-sm text-slate-300"
              >
                <Icon className="h-4 w-4 shrink-0 text-emerald-400" />
                {text}
              </div>
            ))}
          </div>

          <Link href="/projects/new">
            <Button
              size="lg"
              className="gap-2 bg-emerald-500 px-10 text-slate-950 shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
            >
              Scan my repo — it&apos;s free <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="border-t border-slate-800/60 px-6 py-8 text-sm text-slate-500">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-emerald-500">
              <Bot className="h-3 w-3 text-slate-950" />
            </div>
            <span className="text-slate-400">VibeQA</span>
          </div>
          <p>Code agent + Browser agent — every scan teaches you something.</p>
          <div className="flex items-center gap-4">
            <Link
              href="/login"
              className="transition-colors hover:text-slate-300"
            >
              Sign in
            </Link>
            <Link
              href="/projects/new"
              className="transition-colors hover:text-slate-300"
            >
              Get started
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
