import { NextResponse } from "next/server";

import { analyzeGithubRoutesAndFramework } from "@/lib/browserqa/github-route-analysis";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      repoUrl?: unknown;
      projectName?: unknown;
      githubToken?: unknown;
    };

    const repoUrl = typeof body.repoUrl === "string" ? body.repoUrl.trim() : "";
    if (!repoUrl) {
      return NextResponse.json(
        { error: "repoUrl is required" },
        { status: 400 },
      );
    }

    const githubTokenHeader = request.headers.get("x-github-token")?.trim();
    const githubTokenBody =
      typeof body.githubToken === "string" ? body.githubToken.trim() : "";
    const projectName =
      typeof body.projectName === "string" ? body.projectName.trim() : "";

    const analysis = await analyzeGithubRoutesAndFramework({
      repoUrl,
      projectName: projectName || undefined,
      githubToken: githubTokenHeader || githubTokenBody || undefined,
    });

    return NextResponse.json(
      {
        scanId: analysis.scanId,
        status: "completed",
        project: analysis.project,
        routes: analysis.routes,
        routeInsights: analysis.routeInsights,
        endpointCount: analysis.endpointCount,
        cards: [],
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "GitHub analysis failed",
      },
      { status: 400 },
    );
  }
}
