import { NextResponse } from "next/server";

import { getAudit } from "../../../../lib/audits/service";

type Context = {
  params: Promise<{ auditId: string }>;
};

export async function GET(_: Request, context: Context) {
  const { auditId } = await context.params;

  try {
    const audit = await getAudit(auditId);
    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }
    return NextResponse.json(audit);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch audit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
