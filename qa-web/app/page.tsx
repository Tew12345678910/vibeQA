import { AuditForm } from "@/components/AuditForm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { focusSchema, type Focus } from "@/lib/contracts";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function asString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : (value ?? "");
}

function asInt(value: string | string[] | undefined, fallback: number): number {
  const parsed = Number(asString(value));
  return Number.isInteger(parsed) ? parsed : fallback;
}

function parseFocus(value: string): Focus[] {
  const parts = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const allowed = new Set(focusSchema.options);
  const normalized = parts.filter((entry): entry is Focus => allowed.has(entry as Focus));
  return normalized.length ? normalized : [...focusSchema.options];
}

export default async function HomePage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Run New Audit</CardTitle>
          <CardDescription>
            Enter a hosted HTTPS URL, optional routes, and scan settings. This audit runs in
            desktop and mobile viewports.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AuditForm
            initial={{
              baseUrl: asString(params.baseUrl) || "https://example.com",
              routesText: asString(params.routes).replace(/,/g, "\n"),
              maxPages: Math.min(10, Math.max(1, asInt(params.maxPages, 6))),
              maxClicksPerPage: Math.min(10, Math.max(1, asInt(params.maxClicksPerPage, 6))),
              focus: parseFocus(asString(params.focus)),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}