import path from "node:path";
import { spawn } from "node:child_process";

export function spawnRunWorker(runId: number): void {
  const tsxBin = path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );

  const child = spawn(tsxBin, ["src/lib/runner/worker-entry.ts", String(runId)], {
    cwd: process.cwd(),
    stdio: "ignore",
    detached: true,
  });

  child.unref();
}
