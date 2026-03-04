import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import dotenv from "dotenv";

import { dumpDatabase } from "../utils/dump";
import { restoreDatabase } from "../utils/restore";
import { updateEnv } from "../utils/updateEnv";
import * as neonProvider from "../providers/neon";
import * as supabaseProvider from "../providers/supabase";

export type ProviderName = "neon" | "supabase";

export interface BaseConfig {
  provider: ProviderName;
  projectNamePrefix: string;
  region: string;
  restartCommand: string;
  organizationId?: string; // Supabase
}

export interface RotateOptions {
  cwd?: string;
  configPath?: string;
}

function loadConfig(opts: RotateOptions): BaseConfig {
  const cwd = opts.cwd ?? process.cwd();
  const configPath = opts.configPath ?? path.join(cwd, "rotator.config.json");

  if (!fs.existsSync(configPath)) {
    throw new Error(`Config file not found at ${configPath}. Run "db-rotator init" to create one.`);
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const parsed = JSON.parse(raw) as BaseConfig;

  if (!parsed.provider) throw new Error("rotator.config.json: 'provider' is required.");
  if (!parsed.projectNamePrefix) throw new Error("rotator.config.json: 'projectNamePrefix' is required.");
  if (!parsed.region) throw new Error("rotator.config.json: 'region' is required.");
  if (!parsed.restartCommand) throw new Error("rotator.config.json: 'restartCommand' is required.");

  return parsed;
}

function ensureBinaries(cwd: string) {
  const check = (cmd: string, args: string[] = ["--version"]) => {
    try {
      execSync([cmd, ...args].join(" "), { stdio: "ignore", cwd });
    } catch {
      throw new Error(`Required binary not found or not runnable: ${cmd}`);
    }
  };

  check("pg_dump");
  check("psql");
}

function cleanEnvValue(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const trimmed = v.trim();
  return trimmed.replace(/^["']|["']$/g, "");
}

export async function rotate(options: RotateOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const envPath = path.join(cwd, ".env");

  dotenv.config({ path: envPath });

  ensureBinaries(cwd);

  const config = loadConfig(options);

  const oldDbUrl = cleanEnvValue(process.env.DATABASE_URL || "");
  const oldDbUrlUnpooled = cleanEnvValue(process.env.DATABASE_URL_UNPOOLED || "");

  if (!oldDbUrl || !oldDbUrlUnpooled) {
    throw new Error("DATABASE_URL and DATABASE_URL_UNPOOLED are required in environment.");
  }

  console.log("Creating new project...");

  let connectionStrings: neonProvider.ProviderConnectionStrings | supabaseProvider.ProviderConnectionStrings;

  if (config.provider === "neon") {
    const neonConfig: neonProvider.NeonConfig = {
      provider: "neon",
      projectNamePrefix: config.projectNamePrefix,
      region: config.region
    };

    const projectId = await neonProvider.createProject(neonConfig);
    connectionStrings = await neonProvider.getConnectionStrings(neonConfig, projectId);
  } else if (config.provider === "supabase") {
    if (!config.organizationId) {
      throw new Error("rotator.config.json: 'organizationId' is required for Supabase provider.");
    }

    const supabaseConfig: supabaseProvider.SupabaseConfig = {
      provider: "supabase",
      organizationId: config.organizationId,
      projectNamePrefix: config.projectNamePrefix,
      region: config.region
    };

    const projectRef = await supabaseProvider.createProject(supabaseConfig);
    connectionStrings = await supabaseProvider.getConnectionStrings(supabaseConfig, projectRef);
  } else {
    throw new Error(`Unsupported provider: ${config.provider}`);
  }

  console.log("New project created.");

  const dumpPath = dumpDatabase(oldDbUrlUnpooled, cwd);
  restoreDatabase(connectionStrings.DATABASE_URL_UNPOOLED, dumpPath, cwd);

  const { envBackupPath } = updateEnv({
    cwd,
    newDatabaseUrl: connectionStrings.DATABASE_URL,
    newDatabaseUrlUnpooled: connectionStrings.DATABASE_URL_UNPOOLED
  });

  console.log("Restarting server...");
  execSync(config.restartCommand, { stdio: "inherit", cwd });
  console.log("Restart complete.");

  console.log("Rotation finished successfully.");
  console.log(`Previous env backup: ${envBackupPath}`);
  console.log(`Database dump: ${dumpPath}`);
}

