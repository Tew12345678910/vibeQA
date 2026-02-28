import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import { runConnectivityPreflight } from "../../../lib/browseruse/preflight";
import { getDb } from "../../../lib/db/client";
import { suite, suiteViewport } from "../../../lib/db/schema";
import { listSuitesWithLatestRun } from "../../../lib/db/queries";
import { DEFAULT_VIEWPORTS } from "../../../lib/runner/matrix";
import {
  isLikelyCloudBrowserUseEndpoint,
  isPrivateOrLocalUrl,
  validateSuiteBaseUrl,
} from "../../../lib/utils/urlClassifier";

const createSuiteSchema = z.object({
  name: z.string().min(1),
  projectPath: z.string().min(1),
  baseUrl: z.string().url(),
  guidelinePath: z.string().optional(),
});

export async function GET() {
  return NextResponse.json({ suites: listSuitesWithLatestRun() });
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = createSuiteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { name, projectPath, baseUrl, guidelinePath } = parsed.data;
  const baseUrlValidation = validateSuiteBaseUrl(baseUrl);
  if (!baseUrlValidation.valid) {
    return NextResponse.json({ error: baseUrlValidation.message }, { status: 400 });
  }

  const needsSelfHosted = isPrivateOrLocalUrl(baseUrl);
  if (
    needsSelfHosted &&
    isLikelyCloudBrowserUseEndpoint(process.env.BROWSER_USE_BASE_URL)
  ) {
    return NextResponse.json(
      {
        error:
          "Private/localhost target URLs require a self-hosted Browser-Use endpoint. Set BROWSER_USE_BASE_URL to your private deployment.",
      },
      { status: 400 },
    );
  }

  if (needsSelfHosted) {
    const preflight = await runConnectivityPreflight(baseUrl);
    if (!preflight.ok) {
      return NextResponse.json(
        {
          error: `Preflight failed for private/localhost URL: ${preflight.message}`,
        },
        { status: 400 },
      );
    }
  }

  const db = getDb();
  const now = Date.now();

  const insertResult = db
    .insert(suite)
    .values({
      name,
      projectPath,
      baseUrl: baseUrl.replace(/\/$/, ""),
      guidelinePath: guidelinePath || null,
      createdAt: now,
      updatedAt: now,
    })
    .run();

  const suiteId = Number(insertResult.lastInsertRowid);
  db.insert(suiteViewport)
    .values(
      DEFAULT_VIEWPORTS.map((viewport) => ({
        suiteId,
        key: viewport.key,
        label: viewport.label,
        width: viewport.width,
        height: viewport.height,
        enabled: viewport.enabled,
      })),
    )
    .run();

  return NextResponse.json({
    suite: db.select().from(suite).where(eq(suite.id, suiteId)).all()[0],
  });
}
