import { NextResponse } from "next/server";

import { getIssuesReport } from "@/lib/pipeline/service";
import { getProjectRunByRunId } from "@/lib/db/repository";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId")?.trim();
    if (!runId) {
      return NextResponse.json({ error: "runId query parameter is required" }, { status: 400 });
    }

    const dbRun = await getProjectRunByRunId(runId);
    if (dbRun) {
      const cards = (dbRun.issues ?? [])
        .map((issue) => {
          const raw = issue.card_json;
          if (raw && typeof raw === "object") {
            return raw;
          }
          return {
            id: issue.issue_id,
            source: "nextjs-api",
            title: issue.title,
            priority: issue.priority,
            category: issue.category,
            impact: {
              user: "Potential user-facing reliability impact.",
              business: "Potential production incident risk.",
              risk: "Security and correctness controls are not fully enforced.",
            },
            problem: {
              summary: issue.description ?? issue.title,
              evidence: [],
            },
            recommendation: {
              summary: "Apply the relevant standards remediation.",
              implementation_steps: ["Patch the affected route and add regression checks."],
              acceptance_criteria: ["Issue no longer reproduces in static and integration checks."],
              estimated_effort: "S",
              confidence: issue.confidence ?? "medium",
            },
          };
        })
        .filter(Boolean);

      const report = {
        id: dbRun.id,
        project: {
          name: String((dbRun.meta_json?.project_name as string | undefined) ?? "Project"),
          framework: "nextjs" as const,
        },
        generated_at: new Date().toISOString(),
        summary: {
          score: Math.max(0, 100 - (dbRun.count_p0 * 12 + dbRun.count_p1 * 6 + dbRun.count_p2 * 3)),
          p0: dbRun.count_p0,
          p1: dbRun.count_p1,
          p2: dbRun.count_p2,
        },
      };

      const remoteStatusRaw = dbRun.meta_json?.status;
      const remoteStatus =
        remoteStatusRaw === "running" || remoteStatusRaw === "queued"
          ? remoteStatusRaw
          : "completed";

      return NextResponse.json(
        {
          report,
          cards,
          remote: {
            status: remoteStatus,
            error: null,
          },
        },
        { status: 200 },
      );
    }

    const result = await getIssuesReport(runId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Issues not found" },
      { status: 404 },
    );
  }
}
