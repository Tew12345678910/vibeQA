import { NextResponse } from "next/server";

import { scanGithubRepo } from "@/lib/pipeline/service";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const githubToken = request.headers.get("x-github-token")?.trim();
    const bodyToken =
      typeof body === "object" &&
      body !== null &&
      typeof (body as { githubToken?: unknown }).githubToken === "string"
        ? (body as { githubToken: string }).githubToken.trim()
        : "";
    const result = await scanGithubRepo({
      ...(typeof body === "object" && body !== null ? body : {}),
      githubToken: githubToken || bodyToken || undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GitHub scan failed" },
      { status: 400 },
    );
  }
}
