import { NextResponse } from "next/server";

import { insertProjectRun, listProjectRuns } from "@/lib/db/repository";

type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const { id } = await context.params;
    const runs = await listProjectRuns(id);
    return NextResponse.json({ runs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list runs" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id: projectId } = await context.params;
    const body = (await request.json()) as {
      id: string;
      createdAt: string;
      counts: { p0: number; p1: number; p2: number; total: number };
      issues: Array<{
        id: string;
        source: string;
        title: string;
        priority: string;
        category: string;
        description?: string;
      }>;
    };

    if (!body.id || !body.counts) {
      return NextResponse.json(
        { error: "id and counts are required" },
        { status: 400 },
      );
    }

    await insertProjectRun({
      id: body.id,
      projectId,
      createdAt: body.createdAt ?? new Date().toISOString(),
      counts: body.counts,
      issues: body.issues ?? [],
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save run" },
      { status: 500 },
    );
  }
}
