import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

import { createProject } from "./createProject.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT_DIR = __dirname; // this repo keeps scripts at root
const ENV_PATH = path.join(ROOT_DIR, ".env");

function cleanEnvValue(v) {
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  return trimmed.replace(/^["']|["']$/g, "");
}

function redactPgUrl(url) {
  try {
    const u = new URL(url);
    if (u.password) u.password = "*****";
    return u.toString();
  } catch {
    return "[unparseable url]";
  }
}

function parseDotEnvFile(contents) {
  const out = {};
  const lines = contents.split(/\r?\n/);
  for (const line of lines) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;

    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;

    const key = m[1];
    let val = m[2] ?? "";

    // Strip inline comments when unquoted: FOO=bar # comment
    const quoted = (val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"));
    if (!quoted) {
      val = val.split(/\s+#/)[0].trim();
    }

    out[key] = cleanEnvValue(val) ?? "";
  }
  return out;
}

function escapeEnvDoubleQuoted(value) {
  // Keep it single-line; URLs should be single-line.
  const oneLine = String(value).replace(/\r?\n/g, "");
  return oneLine.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function upsertEnvVar(envText, key, value) {
  const safeValue = `"${escapeEnvDoubleQuoted(value)}"`;
  const re = new RegExp(`^(\\s*(?:export\\s+)?)${key}\\s*=.*$`, "m");
  if (re.test(envText)) {
    return envText.replace(re, `$1${key}=${safeValue}`);
  }
  const suffix = envText.endsWith("\n") || envText.length === 0 ? "" : "\n";
  return `${envText}${suffix}${key}=${safeValue}\n`;
}

function preflightBinary(name, versionArgs = ["--version"]) {
  try {
    execSync([name, ...versionArgs].join(" "), { stdio: "ignore", cwd: ROOT_DIR });
  } catch {
    throw new Error(`Required binary not found or not runnable: ${name}`);
  }
}

function readEnvFileOrThrow() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`Missing .env file at ${ENV_PATH}`);
  }
  return fs.readFileSync(ENV_PATH, "utf8");
}

async function main() {
  dotenv.config({ path: ENV_PATH });

  // Preflight to fail fast before touching anything.
  preflightBinary("pg_dump");
  preflightBinary("psql");
  preflightBinary("pm2", ["-v"]);

  const envRaw = readEnvFileOrThrow();
  const parsed = parseDotEnvFile(envRaw);

  // Make sure these are available even if dotenv parsing is impacted by formatting.
  const neonKey = cleanEnvValue(process.env.NEON_API_KEY) ?? parsed.NEON_API_KEY;
  if (neonKey) process.env.NEON_API_KEY = neonKey;

  const oldDbUrlUnpooled =
    cleanEnvValue(process.env.DATABASE_URL_UNPOOLED) ?? parsed.DATABASE_URL_UNPOOLED;

  if (!oldDbUrlUnpooled) {
    throw new Error("DATABASE_URL_UNPOOLED is missing (check your .env).");
  }

  console.log("Creating new Neon project...");
  const created = await createProject({ log: true, revealUrls: false });
  console.log("New database created");

  const newDbUrl = created.DATABASE_URL;
  const newDbUrlUnpooled = created.DATABASE_URL_UNPOOLED;

  const dumpPath = path.join(ROOT_DIR, `dump-${Date.now()}.sql`);

  console.log("Dumping old database...");
  console.log(`Using: ${redactPgUrl(oldDbUrlUnpooled)}`);
  execSync(
    `pg_dump "${oldDbUrlUnpooled}" --no-owner --no-acl > "${dumpPath}"`,
    { stdio: "inherit", cwd: ROOT_DIR }
  );
  console.log("Dump complete");

  console.log("Restoring to new database...");
  console.log(`Using: ${redactPgUrl(newDbUrlUnpooled)}`);
  execSync(
    `psql "${newDbUrlUnpooled}" -v ON_ERROR_STOP=1 < "${dumpPath}"`,
    { stdio: "inherit", cwd: ROOT_DIR }
  );
  console.log("Restore complete");

  console.log("Updating .env...");
  const backupPath = path.join(ROOT_DIR, `.env.bak-${Date.now()}`);
  fs.writeFileSync(backupPath, envRaw, "utf8");

  let updated = envRaw;
  updated = upsertEnvVar(updated, "DATABASE_URL", newDbUrl);
  updated = upsertEnvVar(updated, "DATABASE_URL_UNPOOLED", newDbUrlUnpooled);
  fs.writeFileSync(ENV_PATH, updated, "utf8");

  console.log("Restarting server...");
  execSync("pm2 restart all", { stdio: "inherit", cwd: ROOT_DIR });

  console.log("Migration complete.");
  console.log(`Dump saved at: ${dumpPath}`);
  console.log(`.env backup saved at: ${backupPath}`);
}

const ranDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (ranDirectly) {
  main().catch((err) => {
    console.error("\nMigration failed.");
    console.error(err?.stack || err);
    process.exitCode = 1;
  });
}

