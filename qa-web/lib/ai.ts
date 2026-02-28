import "server-only";

import { z } from "zod";

import type { AiPlanImprovement } from "@/lib/project-auditor/test-plan";

type AiInput = {
  project: {
    name: string;
    framework: "nextjs";
    router: "app" | "pages" | "unknown";
  };
  summary: {
    score: number;
    p0: number;
    p1: number;
    p2: number;
  };
  endpoints: Array<{
    method: string;
    path: string;
    file: string;
    notes: string;
  }>;
  checks: Array<{
    standard: string;
    status: string;
    severity: string;
    message: string;
    evidence: Array<{
      file: string;
      lineStart: number;
      lineEnd: number;
      snippet: string;
    }>;
    recommendations: string[];
  }>;
  detectedStack: {
    dependencies: string[];
    devDependencies: string[];
    authLibraries: string[];
    validationLibraries: string[];
    rateLimitLibraries: string[];
    loggingLibraries: string[];
  };
  uiRoutes: string[];
};

const aiPlanImprovementSchema = z.object({
  path: z.string(),
  tests: z
    .array(
      z.object({
        category: z.string(),
        goal: z.string(),
        steps: z.array(z.string()).min(1).max(6),
        expected: z.string(),
        severity_if_fail: z.enum(["P0", "P1", "P2"]),
      }),
    )
    .max(6),
});

const aiResponseSchema = z.object({
  executiveSummary: z.string(),
  topIssues: z
    .array(
      z.object({
        title: z.string(),
        severity: z.enum(["P0", "P1", "P2"]),
        why: z.string(),
        fix: z.string(),
      }),
    )
    .max(8),
  whyThisMatters: z.array(z.string()).max(8),
  howToFix: z
    .array(
      z.object({
        title: z.string(),
        steps: z.array(z.string()).min(1).max(8),
      }),
    )
    .max(8),
  browserPlanImprovements: z.array(aiPlanImprovementSchema).max(8).default([]),
});

type AiResponse = z.infer<typeof aiResponseSchema>;

function fallbackMarkdown(input: AiInput): string {
  const topIssues = input.checks
    .filter((check) => check.status === "fail" || check.status === "warn")
    .sort((a, b) => a.severity.localeCompare(b.severity))
    .slice(0, 5);

  const lines: string[] = [];
  lines.push("# Project Standards Auditor Report");
  lines.push("");
  lines.push("## Executive Summary");
  lines.push(
    `Static scan complete for **${input.project.name}**. Score: **${input.summary.score}/100** (P0: ${input.summary.p0}, P1: ${input.summary.p1}, P2: ${input.summary.p2}).`,
  );
  lines.push("");
  lines.push("## Top Issues");
  if (!topIssues.length) {
    lines.push(
      "No high-priority standards gaps were detected from static signals.",
    );
  } else {
    for (const [index, issue] of topIssues.entries()) {
      lines.push(
        `${index + 1}. **[${issue.severity}] ${issue.standard}** - ${issue.message}`,
      );
    }
  }
  lines.push("");
  lines.push("## Why This Matters");
  lines.push(
    "- Strong API contracts reduce integration bugs and speed up client development.",
  );
  lines.push("- Auth/AuthZ and rate limiting lower security and abuse risk.");
  lines.push(
    "- Timeouts, logging, and pagination improve reliability and operability in production.",
  );
  lines.push("");
  lines.push("## How To Fix");
  lines.push(
    "- Introduce shared API helpers for consistent success/error envelopes and status codes.",
  );
  lines.push(
    "- Add schema validation and field-level error mapping on all mutable endpoints.",
  );
  lines.push(
    "- Enforce auth + authorization checks and apply rate limiting to sensitive routes.",
  );
  lines.push(
    "- Add timeout/retry wrappers for outbound calls and structured requestId logging.",
  );
  lines.push("- Standardize pagination with explicit limit caps.");

  return lines.join("\n");
}

function toMarkdown(data: AiResponse): string {
  const lines: string[] = [];
  lines.push("# Project Standards Auditor Report");
  lines.push("");
  lines.push("## Executive Summary");
  lines.push(data.executiveSummary);
  lines.push("");

  lines.push("## Top Issues");
  if (!data.topIssues.length) {
    lines.push("No major issues detected from the sampled static evidence.");
  } else {
    for (const [index, issue] of data.topIssues.entries()) {
      lines.push(`${index + 1}. **[${issue.severity}] ${issue.title}**`);
      lines.push(`   - Why: ${issue.why}`);
      lines.push(`   - Fix: ${issue.fix}`);
    }
  }
  lines.push("");

  lines.push("## Why This Matters");
  if (!data.whyThisMatters.length) {
    lines.push(
      "- Standards consistency reduces regressions and accelerates feature delivery.",
    );
  } else {
    for (const item of data.whyThisMatters) {
      lines.push(`- ${item}`);
    }
  }
  lines.push("");

  lines.push("## How To Fix");
  if (!data.howToFix.length) {
    lines.push("- Prioritize remediation for highest-severity checks first.");
  } else {
    for (const item of data.howToFix) {
      lines.push(`### ${item.title}`);
      for (const step of item.steps) {
        lines.push(`- ${step}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

function parseJsonFromContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (!fenced) {
      throw new Error("Failed to parse AI JSON output");
    }
    return JSON.parse(fenced[1]);
  }
}

export async function generateAiReport(input: AiInput): Promise<{
  markdown: string;
  planImprovements: AiPlanImprovement[];
}> {
  const apiKey = process.env.AI_API_KEY;
  if (!apiKey) {
    return { markdown: fallbackMarkdown(input), planImprovements: [] };
  }

  const baseUrl = (
    process.env.AI_BASE_URL ?? "https://api.openai.com/v1"
  ).replace(/\/$/, "");
  const model = process.env.AI_CHAT_MODEL ?? "gpt-4o-mini";

  const payload = {
    project: input.project,
    summary: input.summary,
    endpoints: input.endpoints.slice(0, 150),
    checks: input.checks.slice(0, 20),
    detectedStack: input.detectedStack,
    uiRoutes: input.uiRoutes.slice(0, 20),
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a principal full-stack auditor. Use only provided evidence; do not invent code. Return strict JSON with keys executiveSummary, topIssues, whyThisMatters, howToFix, browserPlanImprovements.",
        },
        {
          role: "user",
          content: `Generate an educational audit narrative and practical fixes from this static scan payload:\n${JSON.stringify(
            payload,
          )}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    return { markdown: fallbackMarkdown(input), planImprovements: [] };
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return { markdown: fallbackMarkdown(input), planImprovements: [] };
  }

  try {
    const parsed = aiResponseSchema.parse(parseJsonFromContent(content));
    return {
      markdown: toMarkdown(parsed),
      planImprovements: parsed.browserPlanImprovements,
    };
  } catch {
    return { markdown: fallbackMarkdown(input), planImprovements: [] };
  }
}
