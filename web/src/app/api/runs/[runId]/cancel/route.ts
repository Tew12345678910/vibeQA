import { NextResponse } from "next/server";

import { cancelRun } from "../../../../../lib/runner/orchestrator";

type Context = {
  params: Promise<{ runId: string }>;
};

export async function POST(_: Request, context: Context) {
  const { runId } = await context.params;
  const id = Number(runId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  await cancelRun(id);
  return NextResponse.json({ ok: true });
}
