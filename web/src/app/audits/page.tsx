import Link from "next/link";

import { listAudits } from "../../lib/audits/service";
import { runStatusSchema, type AuditRequest } from "../../lib/contracts";

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function asString(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : (value ?? "");
}

function asInt(value: string | string[] | undefined): number | undefined {
  const parsed = Number(asString(value));
  return Number.isInteger(parsed) ? parsed : undefined;
}

function toDateInput(iso: string | null): string {
  if (!iso) {
    return "";
  }
  return new Date(iso).toISOString().slice(0, 10);
}

function retryHref(input: AuditRequest): string {
  const query = new URLSearchParams({
    baseUrl: input.baseUrl,
    routes: input.routes.join(","),
    maxPages: String(input.maxPages),
    maxClicksPerPage: String(input.maxClicksPerPage),
    educationLevel: input.educationLevel,
    focus: input.focus.join(","),
  });

  return `/?${query.toString()}`;
}

function statusChip(status: string) {
  const variant = status === "completed" ? "ok" : status === "running" || status === "queued" ? "running" : "fail";
  return <span className={`status-chip ${variant}`}>{status}</span>;
}

export default async function AuditsPage({ searchParams }: Props) {
  const params = await searchParams;
  const statusParam = asString(params.status);
  const parsedStatus = runStatusSchema.safeParse(statusParam);
  const status = parsedStatus.success ? parsedStatus.data : undefined;

  const baseUrl = asString(params.baseUrl);
  const dateFromRaw = asString(params.dateFrom);
  const dateToRaw = asString(params.dateTo);

  const dateFrom = dateFromRaw ? Date.parse(`${dateFromRaw}T00:00:00.000Z`) : undefined;
  const dateTo = dateToRaw ? Date.parse(`${dateToRaw}T23:59:59.999Z`) : undefined;

  const results = await listAudits({
    status,
    baseUrl: baseUrl || undefined,
    cursor: asInt(params.cursor),
    limit: asInt(params.limit) ?? 20,
    dateFrom: Number.isFinite(dateFrom) ? dateFrom : undefined,
    dateTo: Number.isFinite(dateTo) ? dateTo : undefined,
  });

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <section className="card">
        <h1>Audit History</h1>
        <form className="filter-form" method="GET">
          <label>
            Status
            <select name="status" defaultValue={status ?? ""}>
              <option value="">All</option>
              {runStatusSchema.options.map((entry) => (
                <option key={entry} value={entry}>
                  {entry}
                </option>
              ))}
            </select>
          </label>
          <label>
            Base URL
            <input type="text" name="baseUrl" defaultValue={baseUrl} placeholder="example.com" />
          </label>
          <label>
            Date From
            <input type="date" name="dateFrom" defaultValue={dateFromRaw} />
          </label>
          <label>
            Date To
            <input type="date" name="dateTo" defaultValue={dateToRaw} />
          </label>
          <button type="submit">Apply Filters</button>
        </form>
      </section>

      <section className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Audit</th>
                <th>Base URL</th>
                <th>Status</th>
                <th>Created</th>
                <th>Finished</th>
                <th>Pass/Fail</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.items.length ? (
                results.items.map((item) => (
                  <tr key={item.auditId}>
                    <td>{item.auditId.slice(0, 8)}...</td>
                    <td>{item.baseUrl}</td>
                    <td>{statusChip(item.status)}</td>
                    <td>{new Date(item.createdAt).toLocaleString()}</td>
                    <td>{item.finishedAt ? new Date(item.finishedAt).toLocaleString() : "-"}</td>
                    <td>
                      {item.summary.passCount}/{item.summary.failCount}
                    </td>
                    <td>
                      <div className="row-inline">
                        <Link href={`/audits/${item.auditId}`}>Open</Link>
                        <Link href={retryHref(item.input)}>Retry</Link>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="muted">
                    No audits found for the current filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {results.nextCursor ? (
          <div style={{ marginTop: "0.75rem" }}>
            <Link
              href={`/audits?${new URLSearchParams({
                status: status ?? "",
                baseUrl,
                dateFrom: toDateInput(dateFrom ? new Date(dateFrom).toISOString() : null),
                dateTo: toDateInput(dateTo ? new Date(dateTo).toISOString() : null),
                cursor: String(results.nextCursor),
              }).toString()}`}
            >
              Next Page
            </Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}
