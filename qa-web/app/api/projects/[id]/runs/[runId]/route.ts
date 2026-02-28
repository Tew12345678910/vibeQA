import { NextResponse } from "next/server";

import { getProjectRunById } from "@/lib/db/repository";

// Always query the DB fresh so the poll loop sees live processed_chunks progress.
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; runId: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const { id: projectId, runId } = await context.params;
    const run = await getProjectRunById(projectId, runId);

    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const meta = (run.meta_json ?? {}) as Record<string, unknown>;
    const status = typeof meta.status === "string" ? meta.status : "completed";

    return NextResponse.json(
      {
        run: {
          id: run.id,
          projectId: run.project_id,
          createdAt: run.created_at,
          counts: {
            p0: run.count_p0,
            p1: run.count_p1,
            p2: run.count_p2,
            total: run.count_total,
          },
          meta,
        },
        status,
        counts: {
          p0: run.count_p0,
          p1: run.count_p1,
          p2: run.count_p2,
          total: run.count_total,
        },
        issues: run.issues ?? [],
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch run",
      },
      { status: 500 },
    );
  }
}
