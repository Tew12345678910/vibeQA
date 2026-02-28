import { NextResponse } from "next/server";

import { getScanPreview } from "@/lib/pipeline/service";

type Context = {
  params: Promise<{ scanId: string }>;
};

export async function GET(_: Request, context: Context) {
  try {
    const { scanId } = await context.params;
    const result = await getScanPreview(scanId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan not found" },
      { status: 404 },
    );
  }
}
