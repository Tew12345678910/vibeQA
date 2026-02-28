import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { z } from "zod";

import type { GeneratedManifest } from "../contracts";

const execFileAsync = promisify(execFile);

const manifestSchema = z.object({
  analysisSummary: z.object({
    scannedFiles: z.number(),
    routesFound: z.array(z.string()),
    expectedTextCount: z.number(),
    expectedTitleCount: z.number(),
  }),
  testCases: z.array(
    z.object({
      caseId: z.string(),
      name: z.string(),
      path: z.string(),
      origin: z.union([z.literal("auto"), z.literal("guideline")]),
      assertions: z.array(
        z.object({
          kind: z.union([
            z.literal("url_path_equals"),
            z.literal("text_present"),
            z.literal("text_absent"),
            z.literal("title_contains"),
          ]),
          value: z.string(),
          source: z
            .object({
              file: z.string(),
              line: z.number(),
            })
            .optional(),
        }),
      ),
    }),
  ),
});

export async function generateManifestFromPython(args: {
  projectPath: string;
  guidelinePath?: string | null;
}): Promise<GeneratedManifest> {
  const scriptPath = path.resolve(process.cwd(), "../scripts/generate_manifest.py");

  const cliArgs = ["--project-path", args.projectPath];
  if (args.guidelinePath) {
    cliArgs.push("--guideline", args.guidelinePath);
  }

  const { stdout, stderr } = await execFileAsync("python3", [scriptPath, ...cliArgs], {
    cwd: path.resolve(process.cwd(), ".."),
    maxBuffer: 5 * 1024 * 1024,
  });

  if (stderr?.trim()) {
    // Keep stderr non-fatal as the script may print debug diagnostics.
    console.warn(stderr.trim());
  }

  const parsed = manifestSchema.safeParse(JSON.parse(stdout));
  if (!parsed.success) {
    throw new Error(`Manifest parse failed: ${parsed.error.message}`);
  }

  return parsed.data;
}
