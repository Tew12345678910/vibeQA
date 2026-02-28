import { NextResponse } from "next/server";

import { getRunDetails } from "../../../../lib/db/queries";

type Context = {
  params: Promise<{ runId: string }>;
};

export async function GET(_: Request, context: Context) {
  const { runId } = await context.params;
  const id = Number(runId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const details = getRunDetails(id);
  if (!details) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  return NextResponse.json(details);
}
