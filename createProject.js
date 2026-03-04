import axios from "axios";
import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";

dotenv.config();

const API = "https://console.neon.tech/api/v2";
const keyRaw = process.env.NEON_API_KEY;
const key = typeof keyRaw === "string" ? keyRaw.trim().replace(/^["']|["']$/g, "") : undefined;

const headers = {
  Authorization: `Bearer ${key}`
};

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function createProject(options = {}) {
  const { log = true, revealUrls = false } = options;
  if (!key) {
    throw new Error("NEON_API_KEY is missing (check your environment or .env).");
  }

  const res = await axios.post(
    `${API}/projects`,
    {
      project: {
        name: `auto-db-${Date.now()}`,
        region_id: "aws-us-east-1",
        pg_version: 16
      }
    },
    { headers }
  );

  const projectId = res.data.project.id;

  if (log) console.log("Project ID:", projectId);

  await sleep(6000);

  // get branch
  const branchRes = await axios.get(
    `${API}/projects/${projectId}/branches`,
    { headers }
  );

  const branchId = branchRes.data.branches[0].id;

  if (log) console.log("Branch:", branchId);

  // get role
  const roleRes = await axios.get(
    `${API}/projects/${projectId}/branches/${branchId}/roles`,
    { headers }
  );

  const role = roleRes.data.roles[0].name;

  if (log) console.log("Role:", role);

  // get database
  const dbRes = await axios.get(
    `${API}/projects/${projectId}/branches/${branchId}/databases`,
    { headers }
  );

  const database = dbRes.data.databases[0].name;

  if (log) console.log("Database:", database);

  // get connection URI
  const conn = await axios.get(
    `${API}/projects/${projectId}/connection_uri`,
    {
      headers,
      params: {
        branch_id: branchId,
        database_name: database,
        role_name: role
      }
    }
  );

  const baseUri = conn.data.uri;

  const DATABASE_URL =
    baseUri + "?sslmode=require&pgbouncer=true&connection_limit=1";

  const DATABASE_URL_UNPOOLED =
    baseUri + "?sslmode=require";

  if (log) {
    console.log("\nPrisma URLs\n");
    console.log("DATABASE_URL=");
    console.log(revealUrls ? DATABASE_URL : "[redacted]");
    console.log("\nDATABASE_URL_UNPOOLED=");
    console.log(revealUrls ? DATABASE_URL_UNPOOLED : "[redacted]");
  }

  return {
    DATABASE_URL,
    DATABASE_URL_UNPOOLED,
    projectId,
    branchId,
    role,
    database,
    baseUri
  };
}

const __filename = fileURLToPath(import.meta.url);
const ranDirectly = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);
if (ranDirectly) {
  createProject({ log: true, revealUrls: true }).catch((err) => {
    console.error(err?.stack || err);
    process.exitCode = 1;
  });
}