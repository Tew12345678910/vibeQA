import { NextResponse } from "next/server";

import { scanGithubRepo } from "@/lib/pipeline/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await scanGithubRepo(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GitHub scan failed" },
      { status: 400 },
    );
  }
}
