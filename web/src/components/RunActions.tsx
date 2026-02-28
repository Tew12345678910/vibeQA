"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  runId: number;
  runStatus: string;
};

export function RunActions({ runId, runStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function cancelRun() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/runs/${runId}/cancel`, { method: "POST" });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Cancel failed");
      }
      setMessage("Run canceled");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <button onClick={() => router.refresh()}>Refresh</button>
      <a href={`/api/runs/${runId}/report`} target="_blank" rel="noreferrer">
        <button>Download Report JSON</button>
      </a>
      {(runStatus === "running" || runStatus === "pending") && (
        <button disabled={busy} onClick={cancelRun}>
          {busy ? "Canceling..." : "Cancel Run"}
        </button>
      )}
      {message ? <span className="muted">{message}</span> : null}
    </div>
  );
}
