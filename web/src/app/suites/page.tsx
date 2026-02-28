import Link from "next/link";
import path from "node:path";

import { CreateSuiteForm } from "../../components/CreateSuiteForm";
import { SuiteActions } from "../../components/SuiteActions";
import { listSuitesWithLatestRun } from "../../lib/db/queries";

export const dynamic = "force-dynamic";

function statusChip(status: string | null | undefined) {
  if (!status) {
    return <span className="status-chip">No runs</span>;
  }
  const variant = status === "passed" ? "ok" : status === "running" ? "running" : "fail";
  return <span className={`status-chip ${variant}`}>{status}</span>;
}

function fmt(ts?: number | null) {
  if (!ts) {
    return "-";
  }
  return new Date(ts).toLocaleString();
}

export default function SuitesPage() {
  const suites = listSuitesWithLatestRun();

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <h1>Suites</h1>
      <CreateSuiteForm
        defaultProjectPath={path.resolve(process.cwd(), "../sample_project")}
        defaultBaseUrl="http://localhost:4173"
      />

      <section className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Base URL</th>
              <th>Latest Run</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {suites.length ? (
              suites.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Link href={`/suites/${item.id}`}>{item.name}</Link>
                    <div className="muted" style={{ fontSize: "0.8rem" }}>
                      #{item.id}
                    </div>
                  </td>
                  <td>{item.baseUrl}</td>
                  <td>
                    {statusChip(item.latestRun?.status)}
                    <div className="muted">{item.latestRun ? `Run #${item.latestRun.id}` : "-"}</div>
                  </td>
                  <td>{fmt(item.updatedAt)}</td>
                  <td>
                    <SuiteActions suiteId={item.id} />
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="muted">
                  No suites created yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
