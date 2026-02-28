import { NextResponse } from "next/server";

// Auth is now fully handled by Supabase. This catch-all route is kept
// as a safety net to avoid 404s from any stale bookmarks.
export function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

export function POST() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
