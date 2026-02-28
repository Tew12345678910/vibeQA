import { NextResponse } from "next/server";

import { upsertProject, listProjectsWithStats } from "@/lib/db/repository";
import { getUserFromToken } from "@/lib/auth";

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export async function GET(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const projects = await listProjectsWithStats(user.id);
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to list projects",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const token = getBearerToken(request);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const user = await getUserFromToken(token);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      id: string;
      name: string;
      sourceType?: string;
      githubRepo?: string;
      websiteUrl?: string;
      baseUrl?: string;
      configJson?: Record<string, unknown>;
    };

    if (!body.id || !body.name) {
      return NextResponse.json(
        { error: "id and name are required" },
        { status: 400 },
      );
    }

    await upsertProject({
      id: body.id,
      userId: user.id,
      name: body.name,
      sourceType: body.sourceType ?? "local",
      githubRepo: body.githubRepo,
      websiteUrl: body.websiteUrl,
      baseUrl: body.baseUrl ?? "",
      configJson: body.configJson,
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to save project",
      },
      { status: 400 },
    );
  }
}
