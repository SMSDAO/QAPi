// QAPi SDK – esbuild bundle script
// Produces CJS and ESM bundles in dist/
"use strict";

const esbuild = require("esbuild");
const fs = require("node:fs");
const path = require("node:path");

const outdir = path.join(__dirname, "dist");

// Clean dist/
fs.rmSync(outdir, { recursive: true, force: true });
fs.mkdirSync(outdir, { recursive: true });

const entry = path.join(__dirname, "src", "index.js");

async function main() {
  // CommonJS bundle – for Node.js consumers who use require()
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: path.join(outdir, "index.cjs"),
    sourcemap: true,
  });

  // ESM bundle – for bundlers and modern Node.js (import)
  await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: path.join(outdir, "index.mjs"),
    sourcemap: true,
  });

  console.log("[sdk] Build complete → dist/index.cjs, dist/index.mjs");
}

main().catch((err) => {
  console.error("[sdk] Build failed:", err.message);
  process.exit(1);
});
