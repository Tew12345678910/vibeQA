import Link from "next/link";
import { notFound } from "next/navigation";

import { SuiteActions } from "../../../components/SuiteActions";
import { getSuiteDetails } from "../../../lib/db/queries";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ suiteId: string }>;
};

function fmt(ts?: number | null) {
  if (!ts) {
    return "-";
  }
  return new Date(ts).toLocaleString();
}

export default async function SuiteDetailPage({ params }: Props) {
  const { suiteId } = await params;
  const id = Number(suiteId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const details = getSuiteDetails(id);
  if (!details) {
    notFound();
  }

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <section className="card">
        <h1>{details.suite.name}</h1>
        <p className="muted">Suite #{details.suite.id}</p>
        <p>
          Base URL: <code>{details.suite.baseUrl}</code>
        </p>
        <p>
          Project Path: <code>{details.suite.projectPath}</code>
        </p>
        <p>
          Guideline Path: <code>{details.suite.guidelinePath || "(none)"}</code>
        </p>
        <SuiteActions suiteId={details.suite.id} />
      </section>

      <section className="card">
        <h3>Viewports</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Label</th>
              <th>Size</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {details.viewports.map((viewport) => (
              <tr key={viewport.id}>
                <td>{viewport.key}</td>
                <td>{viewport.label}</td>
                <td>
                  {viewport.width}x{viewport.height}
                </td>
                <td>{viewport.enabled ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Test Cases ({details.tests.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Name</th>
              <th>Path</th>
              <th>Origin</th>
              <th>Assertions</th>
            </tr>
          </thead>
          <tbody>
            {details.tests.length ? (
              details.tests.map((test) => (
                <tr key={test.id}>
                  <td>{test.externalCaseId}</td>
                  <td>{test.name}</td>
                  <td>{test.path}</td>
                  <td>{test.origin}</td>
                  <td>{Array.isArray(test.assertions) ? test.assertions.length : 0}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="muted">
                  No test cases synced yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Run History</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Started</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            {details.runs.length ? (
              details.runs.map((entry) => (
                <tr key={entry.id}>
                  <td>
                    <Link href={`/runs/${entry.id}`}>#{entry.id}</Link>
                  </td>
                  <td>{entry.status}</td>
                  <td>{fmt(entry.startedAt)}</td>
                  <td>{fmt(entry.finishedAt)}</td>
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
    </div>
  );
}
