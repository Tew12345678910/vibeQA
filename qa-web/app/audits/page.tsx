import Link from "next/link";

import { listAudits } from "@/lib/audits/service";
import { runStatusSchema, type AuditRequest } from "@/lib/contracts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function asString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function asInt(value: string | string[] | undefined): number | undefined {
  const parsed = Number(asString(value));
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

function retryHref(input: AuditRequest): string {
  const query = new URLSearchParams({
    baseUrl: input.baseUrl,
    routes: input.routes.join(","),
    maxPages: String(input.maxPages),
    maxClicksPerPage: String(input.maxClicksPerPage),
    focus: input.focus.join(","),
  });
  return `/?${query.toString()}`;
}

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "completed") return "default";
  if (status === "failed" || status === "canceled") return "destructive";
  return "secondary";
}

export default async function AuditsPage({ searchParams }: Props) {
  const params = await searchParams;
  const statusParam = asString(params.status);
  const parsedStatus = runStatusSchema.safeParse(statusParam);
  const status = parsedStatus.success ? parsedStatus.data : undefined;

  const baseUrl = asString(params.baseUrl);
  const dateFromRaw = asString(params.dateFrom);
  const dateToRaw = asString(params.dateTo);

  const dateFrom = dateFromRaw
    ? Date.parse(`${dateFromRaw}T00:00:00.000Z`)
    : undefined;
  const dateTo = dateToRaw
    ? Date.parse(`${dateToRaw}T23:59:59.999Z`)
    : undefined;

  const results = await listAudits({
    status,
    baseUrl: baseUrl || undefined,
    cursor: asInt(params.cursor),
    limit: asInt(params.limit) ?? 20,
    dateFrom: Number.isFinite(dateFrom) ? dateFrom : undefined,
    dateTo: Number.isFinite(dateTo) ? dateTo : undefined,
  });

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid grid-cols-2 gap-4 sm:grid-cols-4" method="GET">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="status">Status</Label>
              <select
                title="Filter by audit status"
                id="status"
                name="status"
                defaultValue={status ?? ""}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">All</option>
                {runStatusSchema.options.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="baseUrl">Base URL</Label>
              <Input
                id="baseUrl"
                type="text"
                name="baseUrl"
                defaultValue={baseUrl}
                placeholder="example.com"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateFrom">Date From</Label>
              <Input
                id="dateFrom"
                type="date"
                name="dateFrom"
                defaultValue={dateFromRaw}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="dateTo">Date To</Label>
              <Input
                id="dateTo"
                type="date"
                name="dateTo"
                defaultValue={dateToRaw}
              />
            </div>
            <div className="col-span-2 sm:col-span-4">
              <Button type="submit" size="sm">
                Apply Filters
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Audit</TableHead>
                <TableHead>Base URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Finished</TableHead>
                <TableHead>Pass / Fail</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.items.length ? (
                results.items.map((item) => (
                  <TableRow key={item.auditId}>
                    <TableCell className="font-mono text-xs">
                      {item.auditId.slice(0, 8)}…
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">
                      {item.baseUrl}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(item.status)}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(item.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.finishedAt
                        ? new Date(item.finishedAt).toLocaleString()
                        : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {item.summary.passCount} / {item.summary.failCount}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/audits/${item.auditId}`}>Open</Link>
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={retryHref(item.input)}>Retry</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground"
                  >
                    No audits found for the current filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {results.nextCursor ? (
            <div className="mt-4">
              <Button variant="outline" size="sm" asChild>
                <Link
                  href={`/audits?${new URLSearchParams({
                    status: status ?? "",
                    baseUrl,
                    dateFrom: toDateInput(
                      dateFrom ? new Date(dateFrom).toISOString() : null,
                    ),
                    dateTo: toDateInput(
                      dateTo ? new Date(dateTo).toISOString() : null,
                    ),
                    cursor: String(results.nextCursor),
                  }).toString()}`}
                >
                  Next Page
                </Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
