# db-rotator

![Landing page](./landing-page.png)

`db-rotator` is a **config-based database rotation and migration tool** that can automatically:

- Create a **new Postgres project** on your cloud provider
- **Dump** your existing database
- **Restore** data into the new project
- **Update** your `.env` connection strings
- **Restart** your app

It is provider-agnostic and currently supports:

- **Neon**
- **Supabase**

You can use it both as:

- A **CLI**: `db-rotator rotate`
- A **Node.js SDK**: import and call from your own scripts

---

## Problem

Managed Postgres services often have **free-tier limits** (storage, network transfer, etc.). When you hit those limits, you may want to:

- Spin up a **fresh project**
- Move **all data** into the new project
- Point your app at the **new database** with **minimal downtime**

Doing this manually for each provider is error-prone and repetitive.

## Solution

`db-rotator` provides:

- A **simple config file** (`rotator.config.json`) to define which provider to use and how to restart your app
- A **core rotation engine** that:
  - Creates a new project
  - Dumps your existing DB
  - Restores into the new DB
  - Updates `.env`
  - Restarts your server
- **Pluggable providers** (`Neon`, `Supabase`) with the same interface:
  - `createProject()`
  - `getConnectionStrings()`

---

## Installation

Install from npm:

```bash
npm install db-rotator
```

Or with `pnpm` / `yarn`:

```bash
pnpm add db-rotator
# or
yarn add db-rotator
```

`db-rotator` expects:

- **Node.js** 18+ recommended
- Postgres CLI tools on `PATH`:
  - `pg_dump`
  - `psql`

On Ubuntu/Debian:

```bash
sudo apt-get update
sudo apt-get install -y postgresql-client
```

---

## CLI Usage

### Initialize config

```bash
npx db-rotator init
```

This creates a default `rotator.config.json` in the current directory.

You can choose provider explicitly:

```bash
npx db-rotator init neon
npx db-rotator init supabase
```

### Rotate database

```bash
npx db-rotator rotate
```

What happens:

1. Reads `rotator.config.json`
2. Uses the configured provider to **create a new project**
3. Reads current `DATABASE_URL` and `DATABASE_URL_UNPOOLED` from `.env`
4. Runs `pg_dump` against `DATABASE_URL_UNPOOLED`
5. Restores into the new project using `psql`
6. Updates `.env` with new `DATABASE_URL` + `DATABASE_URL_UNPOOLED`
7. Runs your configured `restartCommand` (e.g. `pm2 restart all`)

### Monitor database size

```bash
npx db-rotator monitor
```

This command:

- Reads `DATABASE_URL_UNPOOLED` from `.env`
- Connects to Postgres
- Prints `pg_database_size(current_database())` in MB

Works for **any Postgres** (Neon, Supabase, self-hosted) as long as the DSN is valid.

---

## Configuration

Configuration file: `rotator.config.json`

### Neon example

```json
{
  "provider": "neon",
  "projectNamePrefix": "auto-db",
  "region": "aws-us-east-1",
  "restartCommand": "pm2 restart all"
}
```

### Supabase example

```json
{
  "provider": "supabase",
  "organizationId": "org-id",
  "projectNamePrefix": "auto-db",
  "region": "us-east-1",
  "restartCommand": "pm2 restart all"
}
```

### Environment variables (`.env`)

`db-rotator` uses `dotenv` and requires:

- `DATABASE_URL`: current pooled URL (Prisma-style)
- `DATABASE_URL_UNPOOLED`: current direct URL (used for `pg_dump`)
- `NEON_API_KEY`: required when `provider = "neon"`
- `SUPABASE_ACCESS_TOKEN`: required when `provider = "supabase"`

Example `.env`:

```bash
DATABASE_URL="postgresql://user:pass@host/db?pgbouncer=true&connection_limit=1&sslmode=require"
DATABASE_URL_UNPOOLED="postgresql://user:pass@host/db?sslmode=require"
NEON_API_KEY="napi_xxx"
SUPABASE_ACCESS_TOKEN="sbp_xxx"
```

Security:

- Keep `.env` **out of version control**.

---

## Providers

### Neon provider

File: `src/providers/neon.ts`

- Uses Neon API:
  - `POST https://console.neon.tech/api/v2/projects`
  - Follows up with branch/role/database queries
  - Fetches a connection URI
- Returns Prisma-style URLs:
  - `DATABASE_URL` (pgbouncer pooled)
  - `DATABASE_URL_UNPOOLED` (direct)

### Supabase provider

File: `src/providers/supabase.ts`

- Uses Supabase Management API:
  - `POST https://api.supabase.com/v1/projects` to create a project
  - `GET https://api.supabase.com/v1/projects/{ref}` to fetch connection details
- Constructs Prisma-style URLs:
  - `DATABASE_URL` (pgbouncer-compatible)
  - `DATABASE_URL_UNPOOLED` (direct)

Both providers expose the same interface:

- `createProject(config)`
- `getConnectionStrings(config, projectIdOrRef)`

---

## Core rotation engine

File: `src/core/rotate.ts`

Responsibilities:

1. **Read config** (`rotator.config.json`)
2. **Load env** (`.env` via `dotenv`)
3. **Validate** required env vars and binaries (`pg_dump`, `psql`)
4. **Create a new project** via the selected provider
5. **Dump** old DB (`pg_dump`)
6. **Restore** into new DB (`psql`)
7. **Update `.env`** (`DATABASE_URL`, `DATABASE_URL_UNPOOLED`)
8. **Restart server** using `restartCommand`

Utilities:

- `src/utils/dump.ts` – runs `pg_dump ... > dump-<timestamp>.sql`
- `src/utils/restore.ts` – runs `psql ... < dump.sql`
- `src/utils/updateEnv.ts` – backs up `.env` and rewrites only the DB URLs

Logs during rotation:

- `Creating new project...`
- `New project created.`
- `Dumping database...`
- `Dump complete`
- `Restoring database...`
- `Restore complete`
- `Updating env...`
- `Env updated.`
- `Restarting server...`
- `Restart complete.`
- `Rotation finished successfully.`

---

## SDK Usage (Node.js)

You can also use `db-rotator` programmatically:

```ts
import { rotate } from "db-rotator";

await rotate(); // uses rotator.config.json in CWD
```

You can also access the providers directly:

```ts
import { neonProvider, supabaseProvider } from "db-rotator";

// Neon
const neonConfig = {
  provider: "neon" as const,
  projectNamePrefix: "auto-db",
  region: "aws-us-east-1"
};
const neonProjectId = await neonProvider.createProject(neonConfig);
const neonConns = await neonProvider.getConnectionStrings(neonConfig, neonProjectId);
```

---

## Safety & rollback

- **Old databases are never deleted** by `db-rotator`.
- Before updating `.env`, the tool creates:
  - `.env.bak-<timestamp>`
- Dumps are written as:
  - `dump-<timestamp>.sql`

To rollback:

1. Restore previous `.env`:

```bash
cp .env.bak-<timestamp> .env
```

2. Restart your app:

```bash
pm2 restart all
```

---
