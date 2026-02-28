import Link from "next/link";

import { getDashboardStats } from "../lib/db/queries";

export const dynamic = "force-dynamic";

function formatDate(ts: number | null) {
  if (!ts) {
    return "-";
  }
  return new Date(ts).toLocaleString();
}

export default function DashboardPage() {
  const stats = getDashboardStats();

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <h1>Dashboard</h1>

      <section className="grid cols-3">
        <div className="card">
          <div className="muted">Suites</div>
          <strong>{stats.suites}</strong>
        </div>
        <div className="card">
          <div className="muted">Runs</div>
          <strong>{stats.runs}</strong>
        </div>
        <div className="card">
          <div className="muted">Recent Failed Runs</div>
          <strong>{stats.failedRuns}</strong>
        </div>
      </section>

      <section className="card">
        <h3>Latest Runs</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Started</th>
              <th>Suite</th>
            </tr>
          </thead>
          <tbody>
            {stats.recentRuns.length ? (
              stats.recentRuns.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/runs/${row.id}`}>#{row.id}</Link>
                  </td>
                  <td>{row.status}</td>
                  <td>{formatDate(row.startedAt)}</td>
                  <td>
                    <Link href={`/suites/${row.suiteId}`}>Suite #{row.suiteId}</Link>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="muted">
                  No runs yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <Link href="/suites">Go to Suites</Link>
      </section>
    </div>
  );
}
