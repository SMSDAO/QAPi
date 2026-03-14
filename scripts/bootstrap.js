#!/usr/bin/env node
/**
 * QAPi – cross-platform bootstrap script
 *
 * Installs npm dependencies for every workspace package and validates
 * the local development environment (Node.js version, etc.).
 *
 * Usage:
 *   node scripts/bootstrap.js          # install all workspace deps
 *   node scripts/bootstrap.js --check  # validate env only (no install)
 */
"use strict";

const { execSync } = require("node:child_process");
const { existsSync } = require("node:fs");
const path = require("node:path");

// ── Helpers ──────────────────────────────────────────────────────────────────

const ROOT = path.resolve(__dirname, "..");

function log(level, msg) {
  const ts = new Date().toISOString();
  const colours = { info: "\x1b[36m", ok: "\x1b[32m", warn: "\x1b[33m", error: "\x1b[31m" };
  const reset = "\x1b[0m";
  const prefix = colours[level] || "";
  console.log(`${prefix}[bootstrap][${level.toUpperCase()}]${reset} ${ts}  ${msg}`);
}

function run(cmd, cwd) {
  log("info", `$ ${cmd}  (in ./${path.relative(ROOT, cwd) || "."})`);
  execSync(cmd, { cwd, stdio: "inherit" });
}

function checkNodeVersion() {
  const [major] = process.versions.node.split(".").map(Number);
  if (major < 18) {
    log("error", `Node.js >= 18 is required. Found: ${process.versions.node}`);
    process.exit(1);
  }
  log("ok", `Node.js ${process.versions.node} ✓`);
}

// ── Workspace packages to install ────────────────────────────────────────────

const PACKAGES = [
  { name: "@solanar/core",         dir: "api" },
  { name: "@solanar/sdk",          dir: "sdk" },
  { name: "@solanar/core-brain",   dir: "apps/core" },
  { name: "@solanar/dashboard",    dir: "dashboard" },
];

// ── Main ─────────────────────────────────────────────────────────────────────

const checkOnly = process.argv.includes("--check");

log("info", "QAPi bootstrap starting…");
checkNodeVersion();

if (checkOnly) {
  log("ok", "Environment check passed (--check mode, skipping installs).");
  process.exit(0);
}

let failed = 0;
for (const pkg of PACKAGES) {
  const pkgDir = path.join(ROOT, pkg.dir);
  const pkgJson = path.join(pkgDir, "package.json");

  if (!existsSync(pkgJson)) {
    log("warn", `Skipping ${pkg.name} — no package.json found at ./${pkg.dir}`);
    continue;
  }

  try {
    log("info", `Installing ${pkg.name}…`);
    run("npm install", pkgDir);
    log("ok", `${pkg.name} ✓`);
  } catch (err) {
    log("error", `Failed to install ${pkg.name}: ${err.message}`);
    failed++;
  }
}

if (failed > 0) {
  log("error", `Bootstrap finished with ${failed} error(s). Fix the issues above and re-run.`);
  process.exit(1);
}

// Build apps/core so its CJS dist/ is available before the API starts.
// (api/package.json has @solanar/core-brain as a file dep; the dist files must
// exist before the API server or its tests can require() them.)
try {
  log("info", "Building @solanar/core-brain (libs → dist/)…");
  run("npm run build", path.join(ROOT, "apps/core"));
  log("ok", "@solanar/core-brain built ✓");
} catch (err) {
  log("error", `Failed to build @solanar/core-brain: ${err.message}`);
  process.exit(1);
}

log("ok", "Bootstrap complete! All workspace packages are ready.");
log("info", "Run 'npm run dev' to start the API server and Dashboard together.");
