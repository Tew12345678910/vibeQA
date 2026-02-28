import { NextResponse } from "next/server";

import { patchProjectRow, deleteProjectRow, getProjectOwner } from "@/lib/db/repository";
import { getUserFromToken } from "@/lib/auth";

type Context = { params: Promise<{ id: string }> };

function getBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

export async function PATCH(request: Request, context: Context) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const ownerId = await getProjectOwner(id);
    if (ownerId && ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = (await request.json()) as {
      githubRepo?: string;
      websiteUrl?: string;
      name?: string;
      configJson?: Record<string, unknown>;
    };
    await patchProjectRow(id, body, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update project",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, context: Context) {
  const token = getBearerToken(request);
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const user = await getUserFromToken(token);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await context.params;
    const ownerId = await getProjectOwner(id);
    if (ownerId && ownerId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    await deleteProjectRow(id, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to delete project",
      },
      { status: 500 },
    );
  }
}
