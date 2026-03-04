import fs from "node:fs";
import path from "node:path";

export interface UpdateEnvOptions {
  cwd: string;
  envPath?: string;
  newDatabaseUrl: string;
  newDatabaseUrlUnpooled: string;
}

function escapeEnvDoubleQuoted(value: string): string {
  const oneLine = value.replace(/\r?\n/g, "");
  return oneLine.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function upsertEnvVar(envText: string, key: string, value: string): string {
  const safeValue = `"${escapeEnvDoubleQuoted(value)}"`;
  const re = new RegExp(`^(\\s*(?:export\\s+)?)${key}\\s*=.*$`, "m");
  if (re.test(envText)) {
    return envText.replace(re, `$1${key}=${safeValue}`);
  }
  const suffix = envText.endsWith("\n") || envText.length === 0 ? "" : "\n";
  return `${envText}${suffix}${key}=${safeValue}\n`;
}

export function updateEnv(options: UpdateEnvOptions): { envBackupPath: string } {
  const envPath = options.envPath ?? path.join(options.cwd, ".env");

  if (!fs.existsSync(envPath)) {
    throw new Error(`.env file not found at ${envPath}`);
  }

  const original = fs.readFileSync(envPath, "utf8");
  const backupPath = path.join(options.cwd, `.env.bak-${Date.now()}`);

  console.log("Updating env...");
  fs.writeFileSync(backupPath, original, "utf8");

  let updated = original;
  updated = upsertEnvVar(updated, "DATABASE_URL", options.newDatabaseUrl);
  updated = upsertEnvVar(updated, "DATABASE_URL_UNPOOLED", options.newDatabaseUrlUnpooled);

  fs.writeFileSync(envPath, updated, "utf8");

  console.log("Env updated.");

  return { envBackupPath: backupPath };
}

