import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "../../../components/AutoRefresh";
import { RunActions } from "../../../components/RunActions";
import { getRunDetails } from "../../../lib/db/queries";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ runId: string }>;
};

function fmt(ts?: number | null) {
  if (!ts) {
    return "-";
  }
  return new Date(ts).toLocaleString();
}

function statusChip(status: string) {
  const variant = status === "passed" ? "ok" : status === "running" ? "running" : "fail";
  return <span className={`status-chip ${variant}`}>{status}</span>;
}

export default async function RunPage({ params }: Props) {
  const { runId } = await params;
  const id = Number(runId);
  if (!Number.isInteger(id) || id <= 0) {
    notFound();
  }

  const details = getRunDetails(id);
  if (!details) {
    notFound();
  }

  const autoRefresh = ["pending", "running"].includes(details.run.status);

  return (
    <div className="grid" style={{ gap: "1rem" }}>
      <AutoRefresh enabled={autoRefresh} />

      <section className="card">
        <h1>Run #{details.run.id}</h1>
        <p>
          Suite: <Link href={`/suites/${details.run.suiteId}`}>{details.run.suiteName}</Link>
        </p>
        <p>
          Status: {statusChip(details.run.status)}
        </p>
        <p>
          Started: {fmt(details.run.startedAt)} | Finished: {fmt(details.run.finishedAt)}
        </p>
        <RunActions runId={details.run.id} runStatus={details.run.status} />
      </section>

      <section className="card">
        <h3>Run Matrix ({details.matrix.length})</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Test Case</th>
              <th>Viewport</th>
              <th>Status</th>
              <th>Links</th>
              <th>Error</th>
            </tr>
          </thead>
          <tbody>
            {details.matrix.map((entry) => (
              <tr key={entry.id}>
                <td>
                  {entry.externalCaseId}
                  <div className="muted">{entry.testCaseName}</div>
                  <div className="muted">{entry.testCasePath}</div>
                </td>
                <td>{entry.viewportKey}</td>
                <td>{statusChip(entry.status)}</td>
                <td>
                  {entry.liveUrl ? (
                    <>
                      <a href={entry.liveUrl} target="_blank" rel="noreferrer">
                        live
                      </a>{" "}
                    </>
                  ) : null}
                  {entry.publicShareUrl ? (
                    <a href={entry.publicShareUrl} target="_blank" rel="noreferrer">
                      share
                    </a>
                  ) : null}
                </td>
                <td>{entry.error || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card">
        <h3>Issues ({details.issues.length})</h3>
        {details.issues.length ? (
          <div className="grid" style={{ gap: "0.8rem" }}>
            {details.issues.map((entry) => (
              <article className="card" key={entry.id}>
                <h4>{entry.title}</h4>
                <p>
                  <strong>Severity:</strong> {entry.severity}
                </p>
                <p>
                  <strong>Symptom:</strong> {entry.symptom}
                </p>
                <p>
                  <strong>Expected:</strong> {entry.expected}
                </p>
                <p>
                  <strong>Actual:</strong> {entry.actual}
                </p>
                <p>
                  <strong>Likely Source Files:</strong>{" "}
                  {entry.fileHints.length
                    ? entry.fileHints.map((hint) => `${hint.file}:${hint.line}`).join(", ")
                    : "(none)"}
                </p>
                <p>
                  <strong>Recommended Fix Approach:</strong> {entry.fixGuidance}
                </p>
                <p>
                  <strong>Verification Steps:</strong> rerun the suite and verify this card disappears.
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted">No issues detected.</p>
        )}
      </section>
    </div>
  );
}
