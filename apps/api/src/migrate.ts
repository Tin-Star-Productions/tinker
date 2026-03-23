/**
 * Runs Prisma migrations in production.
 * Called by: flyctl ssh console --command "node apps/api/dist/migrate.js"
 * during the deploy workflow, before new instances start accepting traffic.
 */
import { execSync } from "node:child_process";

console.log("Running database migrations…");
execSync("npx prisma migrate deploy", {
  stdio: "inherit",
  cwd: "/app/packages/db",
  env: { ...process.env },
});
console.log("Migrations complete.");
