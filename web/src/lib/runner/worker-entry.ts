import { executeRun } from "./orchestrator";

async function main() {
  const runIdRaw = process.argv[2];
  const runId = Number(runIdRaw);
  if (!Number.isInteger(runId) || runId <= 0) {
    throw new Error(`Invalid run id: ${runIdRaw}`);
  }

  await executeRun(runId);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
