import { NextResponse } from "next/server";

import {
  upsertProject,
  listProjects,
} from "@/lib/db/repository";

export async function GET() {
  try {
    const projects = await listProjects();
    return NextResponse.json({ projects });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list projects" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
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
      { error: error instanceof Error ? error.message : "Failed to save project" },
      { status: 500 },
    );
  }
}
