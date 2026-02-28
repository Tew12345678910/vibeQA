import { NextResponse } from "next/server";
import { and, eq, notInArray } from "drizzle-orm";

import { getDb } from "../../../../../lib/db/client";
import { suite, testCase } from "../../../../../lib/db/schema";
import { generateManifestFromPython } from "../../../../../lib/runner/manifestBridge";

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

  try {
    const manifest = await generateManifestFromPython({
      projectPath: suiteRow.projectPath,
      guidelinePath: suiteRow.guidelinePath,
    });

    const now = Date.now();
    const externalIds = manifest.testCases.map((item) => item.caseId);

    for (const row of manifest.testCases) {
      const sourceRefs = row.assertions
        .filter((item) => Boolean(item.source))
        .map((item) => item.source);

      db.insert(testCase)
        .values({
          suiteId: id,
          externalCaseId: row.caseId,
          name: row.name,
          path: row.path,
          origin: row.origin,
          assertionsJson: JSON.stringify(row.assertions),
          sourceRefsJson: JSON.stringify(sourceRefs),
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [testCase.suiteId, testCase.externalCaseId],
          set: {
            name: row.name,
            path: row.path,
            origin: row.origin,
            assertionsJson: JSON.stringify(row.assertions),
            sourceRefsJson: JSON.stringify(sourceRefs),
          },
        })
        .run();
    }

    if (externalIds.length) {
      db.delete(testCase)
        .where(
          and(
            eq(testCase.suiteId, id),
            notInArray(testCase.externalCaseId, externalIds),
          ),
        )
        .run();
    } else {
      db.delete(testCase).where(eq(testCase.suiteId, id)).run();
    }

    db.update(suite).set({ updatedAt: now }).where(eq(suite.id, id)).run();

    return NextResponse.json({
      analysisSummary: manifest.analysisSummary,
      syncedCases: manifest.testCases.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Manifest sync failed",
      },
      { status: 500 },
    );
  }
}
