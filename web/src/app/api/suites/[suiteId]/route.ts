import { NextResponse } from "next/server";

import { getSuiteDetails } from "../../../../lib/db/queries";

type Context = {
  params: Promise<{ suiteId: string }>;
};

export async function GET(_: Request, context: Context) {
  const { suiteId } = await context.params;
  const id = Number(suiteId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid suite id" }, { status: 400 });
  }

  const details = getSuiteDetails(id);
  if (!details) {
    return NextResponse.json({ error: "Suite not found" }, { status: 404 });
  }

  return NextResponse.json(details);
}
