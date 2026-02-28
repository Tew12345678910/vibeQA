"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  suiteId: number;
};

export function SuiteActions({ suiteId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<"sync" | "run" | "" | "none">("none");
  const [message, setMessage] = useState("");

  async function callApi(path: string, busyKind: "sync" | "run") {
    setBusy(busyKind);
    setMessage("");
    try {
      const response = await fetch(path, { method: "POST" });
      const payload = (await response.json()) as { error?: string; runId?: number; syncedCases?: number };
      if (!response.ok) {
        throw new Error(payload.error || "Action failed");
      }

      if (busyKind === "run" && payload.runId) {
        window.location.href = `/runs/${payload.runId}`;
        return;
      }

      if (busyKind === "sync") {
        setMessage(`Synced ${payload.syncedCases ?? 0} test cases`);
      }
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setBusy("none");
    }
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
      <button disabled={busy !== "none"} onClick={() => callApi(`/api/suites/${suiteId}/sync`, "sync")}>
        {busy === "sync" ? "Syncing..." : "Sync Test Cases"}
      </button>
      <button
        className="primary"
        disabled={busy !== "none"}
        onClick={() => callApi(`/api/suites/${suiteId}/runs`, "run")}
      >
        {busy === "run" ? "Starting..." : "Run Suite"}
      </button>
      {message ? <span className="muted">{message}</span> : null}
    </div>
  );
}
