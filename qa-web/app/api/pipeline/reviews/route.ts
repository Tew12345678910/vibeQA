import { NextResponse } from "next/server";

import { confirmProjectReview } from "@/lib/pipeline/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await confirmProjectReview(body);
    return NextResponse.json(result, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start review" },
      { status: 400 },
    );
  }
}
