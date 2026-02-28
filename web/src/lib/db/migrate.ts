import { getDb } from "./client";

function main() {
  getDb();
  console.log("Database migrated.");
}

main();
