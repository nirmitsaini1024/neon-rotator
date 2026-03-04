import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function restoreDatabase(newUrlUnpooled: string, dumpPath: string, cwd: string): void {
  console.log("Restoring database...");

  // Some managed Postgres providers (including Neon) may not recognize
  // certain configuration parameters that older/newer servers emit
  // in dumps (for example, `SET transaction_timeout = ...;`).
  // To make restores more portable, we pre-filter the dump to remove
  // any problematic SET commands that mention transaction_timeout.
  const rawDump = fs.readFileSync(dumpPath, "utf8");
  const cleanedDump = rawDump
    .split(/\r?\n/)
    .filter((line) => !/SET\s+.*transaction_timeout/i.test(line))
    .join(os.EOL);

  const cleanedPath = path.join(
    path.dirname(dumpPath),
    `cleaned-${path.basename(dumpPath)}`
  );
  fs.writeFileSync(cleanedPath, cleanedDump, "utf8");

  execSync(
    `psql "${newUrlUnpooled}" -v ON_ERROR_STOP=1 < "${cleanedPath}"`,
    { stdio: "inherit", cwd }
  );
  console.log("Restore complete");
}


