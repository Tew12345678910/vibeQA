import { NextResponse } from "next/server";

import { getRunReportBundle } from "../../../../../lib/db/queries";

type Context = {
  params: Promise<{ runId: string }>;
};

export async function GET(_: Request, context: Context) {
  const { runId } = await context.params;
  const id = Number(runId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const report = getRunReportBundle(id);
  if (!report) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(report);
}
