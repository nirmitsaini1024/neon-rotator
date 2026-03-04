import { execSync } from "node:child_process";
import path from "node:path";

export function dumpDatabase(oldUrl: string, cwd: string, dumpFileBasename?: string): string {
  const name = dumpFileBasename ?? `dump-${Date.now()}.sql`;
  const dumpPath = path.join(cwd, name);

  console.log("Dumping database...");
  execSync(
    `pg_dump "${oldUrl}" --no-owner --no-acl > "${dumpPath}"`,
    { stdio: "inherit", cwd }
  );
  console.log("Dump complete");

  return dumpPath;
}

