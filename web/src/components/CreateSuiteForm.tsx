"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  defaultProjectPath: string;
  defaultBaseUrl: string;
};

export function CreateSuiteForm({ defaultProjectPath, defaultBaseUrl }: Props) {
  const router = useRouter();
  const [name, setName] = useState("Main QA Suite");
  const [projectPath, setProjectPath] = useState(defaultProjectPath);
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [guidelinePath, setGuidelinePath] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/suites", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          projectPath,
          baseUrl,
          guidelinePath: guidelinePath || undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string; suite?: { id: number } };
      if (!response.ok) {
        throw new Error(payload.error || "Failed to create suite");
      }

      setMessage(`Suite created (#${payload.suite?.id ?? "?"})`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3>Create Suite</h3>
      <form className="inline" onSubmit={onSubmit}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Suite name" />
        <input
          value={projectPath}
          onChange={(e) => setProjectPath(e.target.value)}
          placeholder="Project path"
        />
        <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Base URL" />
        <input
          value={guidelinePath}
          onChange={(e) => setGuidelinePath(e.target.value)}
          placeholder="Guideline path (optional)"
        />
        <button className="primary" disabled={busy} type="submit">
          {busy ? "Creating..." : "Create"}
        </button>
      </form>
      {message ? <p className="muted">{message}</p> : null}
    </div>
  );
}
