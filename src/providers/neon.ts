import axios from "axios";

export interface ProviderConnectionStrings {
  DATABASE_URL: string;
  DATABASE_URL_UNPOOLED: string;
}

export interface NeonConfig {
  provider: "neon";
  projectNamePrefix: string;
  region: string;
}

const NEON_API = "https://console.neon.tech/api/v2";

function getNeonKey(): string {
  const raw = process.env.NEON_API_KEY;
  if (!raw) {
    throw new Error("NEON_API_KEY is required for Neon provider.");
  }
  return raw.trim().replace(/^["']|["']$/g, "");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createProject(config: NeonConfig): Promise<string> {
  const key = getNeonKey();
  const headers = {
    Authorization: `Bearer ${key}`
  };

  const name = `${config.projectNamePrefix}-${Date.now()}`;

  const res = await axios.post(
    `${NEON_API}/projects`,
    {
      project: {
        name,
        region_id: config.region,
        pg_version: 16
      }
    },
    { headers }
  );

  const projectId: string = res.data.project.id;
  return projectId;
}

export async function getConnectionStrings(config: NeonConfig, projectId: string): Promise<ProviderConnectionStrings> {
  const key = getNeonKey();
  const headers = {
    Authorization: `Bearer ${key}`
  };

  // Wait briefly for Neon to provision resources.
  await sleep(6000);

  // Get branch
  const branchRes = await axios.get(
    `${NEON_API}/projects/${projectId}/branches`,
    { headers }
  );
  const branchId: string = branchRes.data.branches[0].id;

  // Get roles
  const roleRes = await axios.get(
    `${NEON_API}/projects/${projectId}/branches/${branchId}/roles`,
    { headers }
  );
  const role: string = roleRes.data.roles[0].name;

  // Get databases
  const dbRes = await axios.get(
    `${NEON_API}/projects/${projectId}/branches/${branchId}/databases`,
    { headers }
  );
  const database: string = dbRes.data.databases[0].name;

  // Get connection URI
  const conn = await axios.get(
    `${NEON_API}/projects/${projectId}/connection_uri`,
    {
      headers,
      params: {
        branch_id: branchId,
        database_name: database,
        role_name: role
      }
    }
  );

  const baseUri: string = conn.data.uri;

  // Neon already returns a URI that may include query parameters
  // such as sslmode and channel_binding. We normalize them using URL
  // to avoid accidentally appending a second `?sslmode=...`.
  const pooled = new URL(baseUri);
  pooled.searchParams.set("sslmode", "require");
  pooled.searchParams.set("pgbouncer", "true");
  pooled.searchParams.set("connection_limit", "1");

  const unpooled = new URL(baseUri);
  unpooled.searchParams.set("sslmode", "require");

  const DATABASE_URL = pooled.toString();
  const DATABASE_URL_UNPOOLED = unpooled.toString();

  return {
    DATABASE_URL,
    DATABASE_URL_UNPOOLED
  };
}

