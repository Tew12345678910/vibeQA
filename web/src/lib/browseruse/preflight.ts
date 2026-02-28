import { getTask, runTask } from "./client";

export async function runConnectivityPreflight(baseUrl: string): Promise<{ ok: boolean; message: string }> {
  try {
    const task = await runTask({
      task: `Open ${baseUrl} and confirm the page responds without DNS or connection errors.`,
      browser_viewport_width: 1280,
      browser_viewport_height: 720,
      structured_output_json: {
        type: "object",
        properties: {
          reachable: { type: "boolean" },
          finalUrl: { type: "string" },
          note: { type: "string" },
        },
        required: ["reachable"],
      },
      allowed_domains: [new URL(baseUrl).hostname],
      enable_public_share: false,
    });

    // Single follow-up poll keeps preflight fast but catches immediate failures.
    const check = await getTask(task.id);
    if (["failed", "stopped", "paused"].includes(check.status)) {
      return { ok: false, message: check.error || `Preflight failed with status '${check.status}'` };
    }

    return { ok: true, message: "Browser-Use preflight task accepted" };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Unknown Browser-Use preflight error",
    };
  }
}
