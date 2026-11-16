import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const dbDir = path.resolve("./.pglite/axon-erp");
const port = parseInt(process.env.DB_PORT || process.argv[2] || "54332", 10);

const dirs = [
  "pg_notify", "pg_replslot", "pg_serial", "pg_snapshots", "pg_stat", "pg_stat_tmp", "pg_tblspc", "pg_twophase",
  "pg_commit_ts", "pg_dynshmem", "pg_subtrans", "pg_multixact", "pg_logical", "pg_logical/snapshots",
  "pg_logical/mappings", "pg_wal/archive_status", "pg_wal/summaries"
];

for (const d of dirs) {
  fs.mkdirSync(path.join(dbDir, d), { recursive: true });
}

const pidFile = path.join(dbDir, "postmaster.pid");
if (fs.existsSync(pidFile)) {
  const stale = path.join(dbDir, `postmaster.pid.stale.${Date.now()}`);
  try {
    fs.renameSync(pidFile, stale);
    console.log(`Moved stale postmaster.pid to ${path.basename(stale)}`);
  } catch (err) {
    console.warn("Failed to rename stale postmaster.pid:", err.message);
  }
}

console.log(`Starting PGlite socket server on 127.0.0.1:${port}...`);
const serverScript = path.resolve("./node_modules/@electric-sql/pglite-socket/dist/scripts/server.js");
const child = spawn(process.execPath, [
  serverScript,
  `--db=${dbDir}`,
  `--port=${port}`,
  `--host=127.0.0.1`,
  `--max-connections=20`
], {
  stdio: "inherit"
});

child.on("exit", (code) => {
  console.log(`pglite-server exited with code ${code}`);
  process.exit(code ?? 0);
});
