import { execSync } from "node:child_process";

export function restoreDatabase(newUrlUnpooled: string, dumpPath: string, cwd: string): void {
  console.log("Restoring database...");
  execSync(
    `psql "${newUrlUnpooled}" -v ON_ERROR_STOP=1 < "${dumpPath}"`,
    { stdio: "inherit", cwd }
  );
  console.log("Restore complete");
}

