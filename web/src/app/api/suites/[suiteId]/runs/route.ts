import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";

import { getDb } from "../../../../../lib/db/client";
import { run, suite } from "../../../../../lib/db/schema";
import { spawnRunWorker } from "../../../../../lib/runner/spawnWorker";

type Context = {
  params: Promise<{ suiteId: string }>;
};

export async function POST(_: Request, context: Context) {
  const { suiteId } = await context.params;
  const id = Number(suiteId);
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Invalid suite id" }, { status: 400 });
  }

  const db = getDb();
  const suiteRow = db.select().from(suite).where(eq(suite.id, id)).all()[0];
  if (!suiteRow) {
    return NextResponse.json({ error: "Suite not found" }, { status: 404 });
  }

  const insertResult = db
    .insert(run)
    .values({
      suiteId: id,
      status: "pending",
      trigger: "manual",
      summaryJson: "{}",
      startedAt: Date.now(),
      finishedAt: null,
    })
    .run();

  const runId = Number(insertResult.lastInsertRowid);
  spawnRunWorker(runId);

  return NextResponse.json({ runId });
}
