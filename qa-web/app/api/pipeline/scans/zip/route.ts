import { NextResponse } from "next/server";

import { scanZipUpload } from "@/lib/pipeline/service";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const projectName = formData.get("projectName");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing ZIP file" }, { status: 400 });
    }

    const result = await scanZipUpload({
      file,
      projectName: typeof projectName === "string" ? projectName : undefined,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "ZIP scan failed" },
      { status: 400 },
    );
  }
}
