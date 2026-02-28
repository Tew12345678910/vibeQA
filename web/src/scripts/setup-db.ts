import { ensureSchema } from "../lib/db/repository";

async function main() {
  await ensureSchema();
  console.log("Database schema is ready.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
