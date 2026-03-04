import axios from "axios";

export interface ProviderConnectionStrings {
  DATABASE_URL: string;
  DATABASE_URL_UNPOOLED: string;
}

export interface SupabaseConfig {
  provider: "supabase";
  organizationId: string;
  projectNamePrefix: string;
  region: string;
}

const SUPABASE_API = "https://api.supabase.com/v1";

function getSupabaseToken(): string {
  const raw = process.env.SUPABASE_ACCESS_TOKEN;
  if (!raw) {
    throw new Error("SUPABASE_ACCESS_TOKEN is required for Supabase provider.");
  }
  return raw.trim().replace(/^["']|["']$/g, "");
}

export async function createProject(config: SupabaseConfig): Promise<string> {
  const token = getSupabaseToken();

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  const name = `${config.projectNamePrefix}-${Date.now()}`;

  const res = await axios.post(
    `${SUPABASE_API}/projects`,
    {
      organization_id: config.organizationId,
      name,
      db_region: config.region,
      plan: "free"
    },
    { headers }
  );

  const projectRef: string = res.data.ref;
  return projectRef;
}

export async function getConnectionStrings(config: SupabaseConfig, projectRef: string): Promise<ProviderConnectionStrings> {
  const token = getSupabaseToken();

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };

  // Supabase exposes connection info via the metadata endpoint.
  const metaRes = await axios.get(
    `${SUPABASE_API}/projects/${projectRef}`,
    { headers }
  );

  // Shape can change; we defensively read common fields.
  const dbHost: string | undefined = metaRes.data?.database?.host;
  const dbPort: number | undefined = metaRes.data?.database?.port ?? 5432;
  const dbName: string | undefined = metaRes.data?.database?.name ?? "postgres";
  const dbUser: string | undefined = metaRes.data?.database?.user ?? "postgres";
  const dbPassword: string | undefined = metaRes.data?.database?.password;

  if (!dbHost || !dbPassword) {
    throw new Error("Could not resolve Supabase database connection details from management API.");
  }

  const safeUser = dbUser ?? "postgres";
  const safePassword = dbPassword ?? "";

  const base = `postgresql://${encodeURIComponent(safeUser)}:${encodeURIComponent(
    safePassword
  )}@${dbHost}:${dbPort}/${dbName}`;

  const DATABASE_URL = `${base}?pgbouncer=true&connection_limit=1&sslmode=require`;
  const DATABASE_URL_UNPOOLED = `${base}?sslmode=require`;

  return {
    DATABASE_URL,
    DATABASE_URL_UNPOOLED
  };
}

