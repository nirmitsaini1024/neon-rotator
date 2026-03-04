import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { Client } from "pg";
import { rotate } from "./core/rotate";

function getCwd(): string {
  return process.cwd();
}

function defaultConfig(provider: "neon" | "supabase") {
  if (provider === "neon") {
    return {
      provider: "neon",
      projectNamePrefix: "auto-db",
      region: "aws-us-east-1"
    };
  }

  return {
    provider: "supabase",
    organizationId: "your-organization-id",
    projectNamePrefix: "auto-db",
    region: "us-east-1"
  };
}

export async function initCommand(providerArg?: string): Promise<void> {
  const cwd = getCwd();
  const configPath = path.join(cwd, "rotator.config.json");

  if (fs.existsSync(configPath)) {
    console.log(`rotator.config.json already exists at ${configPath}`);
    return;
  }

  const provider = (providerArg as "neon" | "supabase") || "neon";
  const config = defaultConfig(provider);

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", "utf8");
  console.log(`Created rotator.config.json for provider "${provider}".`);
}

export async function rotateCommand(): Promise<void> {
  try {
    await rotate();
  } catch (err) {
    console.error("Rotation failed.");
    console.error((err as Error)?.message || err);
    process.exitCode = 1;
  }
}

export async function monitorCommand(): Promise<void> {
  const cwd = getCwd();
  const envPath = path.join(cwd, ".env");
  dotenv.config({ path: envPath });

  const connString = process.env.DATABASE_URL_UNPOOLED;
  if (!connString) {
    console.error("DATABASE_URL_UNPOOLED is required in environment for monitor command.");
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    connectionString: connString,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();

    const res = await client.query("SELECT pg_database_size(current_database()) as size");
    const bytes = parseInt(res.rows[0].size, 10);
    const mb = bytes / (1024 * 1024);

    console.log(`Database usage: ${mb.toFixed(2)} MB`);
  } catch (err) {
    console.error("Monitor failed.");
    console.error((err as Error)?.message || err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

