import { NextResponse } from "next/server";

import { getIssuesReport } from "@/lib/pipeline/service";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const runId = url.searchParams.get("runId")?.trim();
    if (!runId) {
      return NextResponse.json({ error: "runId query parameter is required" }, { status: 400 });
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
