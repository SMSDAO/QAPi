/**
 * apps/core build script
 *
 * Compiles the shared lib/ TypeScript files to both CJS and ESM so that:
 *   - The Express API (CJS) can require() them at runtime
 *   - Modern ESM consumers can import them
 *
 * Output:
 *   dist/tier-manager.cjs  + dist/tier-manager.mjs
 *   dist/module-resolver.cjs + dist/module-resolver.mjs
 */
import * as esbuild from "esbuild";
import { rmSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outdir = path.join(__dirname, "dist");

// Clean previous build
rmSync(outdir, { recursive: true, force: true });
mkdirSync(outdir, { recursive: true });

const LIB_ENTRIES = [
  "lib/tier-manager.ts",
  "lib/module-resolver.ts",
];

for (const entry of LIB_ENTRIES) {
  const name = path.basename(entry, ".ts");
  const entryPath = path.join(__dirname, entry);

  // CJS — consumed by the Express API (require())
  await esbuild.build({
    entryPoints: [entryPath],
    bundle: false,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: path.join(outdir, `${name}.cjs`),
  });

  // ESM — for bundlers and modern Node.js (import)
  await esbuild.build({
    entryPoints: [entryPath],
    bundle: false,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: path.join(outdir, `${name}.mjs`),
  });
}

console.log("[core-brain] Build complete → dist/tier-manager.{cjs,mjs}  dist/module-resolver.{cjs,mjs}");
