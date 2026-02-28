import { NextResponse } from "next/server";
import { z } from "zod";

import { runStatusSchema } from "@/lib/contracts";
import {
  listAudits,
  parseAndValidateAuditRequest,
  startAudit,
} from "@/lib/audits/service";

const listQuerySchema = z.object({
  status: runStatusSchema.optional(),
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  baseUrl: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
});

function dateStringToEpoch(
  raw: string | undefined,
  endOfDay: boolean,
): number | undefined {
  if (!raw) return undefined;
  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const value = Date.parse(`${raw}${suffix}`);
  return Number.isFinite(value) ? value : undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const input = parseAndValidateAuditRequest(body);
    const started = await startAudit(input);
    return NextResponse.json(started, { status: 202 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to start audit";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const parsed = listQuerySchema.parse({
      status: url.searchParams.get("status") ?? undefined,
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      baseUrl: url.searchParams.get("baseUrl") ?? undefined,
      dateFrom: url.searchParams.get("dateFrom") ?? undefined,
      dateTo: url.searchParams.get("dateTo") ?? undefined,
    });

    const results = await listAudits({
      status: parsed.status,
      cursor: parsed.cursor,
      limit: parsed.limit,
      baseUrl: parsed.baseUrl,
      dateFrom: dateStringToEpoch(parsed.dateFrom, false),
      dateTo: dateStringToEpoch(parsed.dateTo, true),
    });

    return NextResponse.json(results);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list audits";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
