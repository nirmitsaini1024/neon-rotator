import dotenv from "dotenv";
dotenv.config();

import pkg from "pg";
const { Client } = pkg;
import { createProject } from "./createProject.js";

const LIMIT_MB = 5 * 1024;        // 5GB
const THRESHOLD_MB = LIMIT_MB * 0.9;

async function checkUsage() {

  const client = new Client({
    connectionString: process.env.DATABASE_URL_UNPOOLED,
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const res = await client.query(`
    SELECT pg_database_size(current_database()) as size
  `);

  const bytes = parseInt(res.rows[0].size);
  const mb = (bytes / (1024 * 1024)).toFixed(2);

  console.log(`Database usage: ${mb} MB`);

  if (mb > THRESHOLD_MB) {
    console.log("⚠️ 90% threshold reached → create new DB");
    await createProject({ log: true, revealUrls: true });
  }

  await client.end();
}

checkUsage();