import { NextResponse } from "next/server";

import { getIssuesReport } from "@/lib/pipeline/service";

type Context = {
  params: Promise<{ runId: string }>;
};

export async function GET(_: Request, context: Context) {
  try {
    const { runId } = await context.params;
    const result = await getIssuesReport(runId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Issues not found" },
      { status: 404 },
    );
  }
}
