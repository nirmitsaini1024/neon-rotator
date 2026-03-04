# Neon Automation (Database Rotation)

![Landing page](./landing-page.png)

This repo contains a small automation toolkit to **rotate/migrate** a Neon Postgres database into a **fresh Neon project** when you’re nearing the free-tier transfer limit.

It is designed to be **manually triggered** when you decide it’s time to rotate (for example, when the Neon dashboard shows **network transfer > 90% of 5GB**).

## What this does (high-level workflow)

When you run `migrate-db.js`, it performs:

1. **Creates a new Neon project** via Neon API (`createProject.js`)
2. **Builds Prisma connection strings** for the new project
3. **Dumps the old database** using `pg_dump`
4. **Restores into the new database** using `psql`
5. **Updates `.env`** to point at the new database (both pooled and unpooled URLs)
6. **Restarts your Node app** with `pm2 restart all`

Important safety notes:

- **The old database is not deleted.**
- The script fails fast: if dump/restore fails, it **will not** update `.env` or restart pm2.
- Before writing, it creates a timestamped **backup** of your `.env`.

## Project structure

```
neon-automation/
  createProject.js
  monitor.js
  migrate-db.js
  scripts/
    migrate-db.sh
  .env
```

## Prerequisites

- **Node.js**: ESM project (`"type": "module"`). Recommended Node 18+.
- **Postgres client tools** installed and available on `PATH`:
  - `pg_dump`
  - `psql`
- **pm2** installed and available on `PATH` (because the script calls `pm2 restart all`)

On Ubuntu/Debian, Postgres tools are typically:

```bash
sudo apt-get update
sudo apt-get install -y postgresql-client
```

pm2 (global install example):

```bash
npm i -g pm2
```

## Environment variables (`.env`)

At minimum:

- `NEON_API_KEY`: Neon API key (used to create a new project)
- `DATABASE_URL_UNPOOLED`: current “source” DB connection string (used for dumping)
- (optional but recommended) `DATABASE_URL`: your pooled Prisma URL (will be updated during migration)

Example:

```bash
NEON_API_KEY="napi_xxx"
DATABASE_URL="postgresql://..."
DATABASE_URL_UNPOOLED="postgresql://..."
```

Security:

- **Do not commit `.env`** (it contains secrets).

## Scripts

### `createProject.js`

Creates a new Neon project using the Neon API and returns Prisma-style URLs:

- `DATABASE_URL` (pooled / pgbouncer)
- `DATABASE_URL_UNPOOLED` (direct connection)

Run directly (prints full URLs):

```bash
node createProject.js
```

Use programmatically (returns URLs and metadata):

```js
import { createProject } from "./createProject.js";

const { DATABASE_URL, DATABASE_URL_UNPOOLED } = await createProject();
```

### `monitor.js` (rough monitoring)

Connects to the current DB and prints size usage (rough signal only).

```bash
node monitor.js
```

### `migrate-db.js` (the migration workflow)

Runs the full rotation workflow described above.

Run with Node:

```bash
node migrate-db.js
```

Or via bash wrapper:

```bash
bash scripts/migrate-db.sh
```

If you want:

```bash
./scripts/migrate-db.sh
```

Make it executable once:

```bash
chmod +x scripts/migrate-db.sh
```

## What gets written/changed

When migration runs successfully, you’ll see:

- A SQL dump file created at repo root:
  - `dump-<timestamp>.sql`
- A backup of your previous `.env`:
  - `.env.bak-<timestamp>`
- Your `.env` is updated to point to the **new** database:
  - `DATABASE_URL=...`
  - `DATABASE_URL_UNPOOLED=...`
- Your Node app is restarted:
  - `pm2 restart all`

## Example output

```text
Creating new Neon project...
New database created

Dumping old database...
Dump complete

Restoring to new database...
Restore complete

Updating .env...
Restarting server...

Migration complete.
```

## Rollback / recovery

If something looks wrong after rotation:

1. Restore the previous `.env`:

```bash
cp .env.bak-<timestamp> .env
```

2. Restart:

```bash
pm2 restart all
```

The old database remains available (this tool does **not** delete it).

## Troubleshooting

- **`Required binary not found`**
  - Install `postgresql-client` (for `pg_dump`/`psql`) and/or install `pm2`.

- **Neon API errors**
  - Confirm `NEON_API_KEY` is valid and has permissions to create projects.

- **Dump/restore fails**
  - The script uses:
    - `pg_dump "<OLD_URL>" --no-owner --no-acl > dump.sql`
    - `psql "<NEW_URL>" -v ON_ERROR_STOP=1 < dump.sql`
  - Check the printed error; `.env` won’t be modified unless dump+restore succeeds.

