/**
 * Node.js module hooks that remap `.js` import specifiers to `.ts` when the
 * corresponding `.ts` source file exists. This allows TypeScript source to
 * follow the standard TS convention of using `.js` extensions in imports
 * while still being executed directly by Node.js without a compile step.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

export async function resolve(specifier, context, nextResolve) {
  // Only try to remap relative specifiers that end in .js
  if (specifier.endsWith(".js") && (specifier.startsWith(".") || specifier.startsWith("/"))) {
    const parentDir = context.parentURL
      ? path.dirname(fileURLToPath(context.parentURL))
      : process.cwd();
    const resolved = path.resolve(parentDir, specifier);
    const tsPath = resolved.replace(/\.js$/, ".ts");

    if (!existsSync(resolved) && existsSync(tsPath)) {
      return nextResolve(pathToFileURL(tsPath).href, context);
    }
  }
  return nextResolve(specifier, context);
}
