import { NextResponse } from "next/server";

import { cancelAuditById } from "@/lib/audits/service";

type Context = {
  params: Promise<{ auditId: string }>;
};

export async function POST(_: Request, context: Context) {
  const { auditId } = await context.params;

  try {
    await cancelAuditById(auditId);
    return NextResponse.json({ ok: true, status: "canceled" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to cancel audit";
    const status = message === "Run not found" ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
