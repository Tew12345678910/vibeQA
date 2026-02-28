import { NextResponse } from "next/server";

import { exportFormatSchema } from "../../../../../lib/contracts";
import { getAudit } from "../../../../../lib/audits/service";
import { buildAuditMarkdown } from "../../../../../lib/reporting/markdown";

type Context = {
  params: Promise<{ auditId: string }>;
};

export async function GET(request: Request, context: Context) {
  const { auditId } = await context.params;
  const url = new URL(request.url);

  try {
    const format = exportFormatSchema.parse(url.searchParams.get("format") ?? "json");
    const audit = await getAudit(auditId);
    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    if (format === "md") {
      return new NextResponse(buildAuditMarkdown(audit), {
        status: 200,
        headers: {
          "content-type": "text/markdown; charset=utf-8",
          "content-disposition": `attachment; filename="audit-${auditId}.md"`,
        },
      });
    }

    return NextResponse.json(audit, {
      headers: {
        "content-disposition": `attachment; filename="audit-${auditId}.json"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to export audit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
