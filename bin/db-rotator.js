#!/usr/bin/env node

const path = require("node:path");

function run() {
  const args = process.argv.slice(2);
  const command = args[0];
  const extra = args.slice(1);

  const distPath = path.join(__dirname, "..", "dist", "cli.js");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const cli = require(distPath);

  if (!command || command === "help" || command === "--help" || command === "-h") {
    console.log("db-rotator <command>");
    console.log("");
    console.log("Commands:");
    console.log("  init [provider]   Initialize rotator.config.json (provider: neon | supabase, default neon)");
    console.log("  rotate            Rotate database using current provider");
    console.log("  monitor           Print current database size");
    process.exit(0);
  }

  if (command === "init") {
    cli.initCommand(extra[0]).then(() => {}).catch(() => {});
    return;
  }

  if (command === "rotate") {
    cli.rotateCommand().then(() => {}).catch(() => {});
    return;
  }

  if (command === "monitor") {
    cli.monitorCommand().then(() => {}).catch(() => {});
    return;
  }

  console.error(`Unknown command: ${command}`);
  process.exitCode = 1;
}

run();

