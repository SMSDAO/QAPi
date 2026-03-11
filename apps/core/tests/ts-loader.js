/**
 * Custom Node.js ESM loader that remaps `.js` specifiers to their `.ts`
 * counterparts when the `.ts` file exists but the `.js` file does not.
 *
 * This allows TypeScript source files to import each other using the
 * TypeScript-recommended `.js` extension convention (e.g.
 * `import ... from "./foo.js"`) and still be executed directly by Node.js
 * without a compile step.
 *
 * Usage:
 *   node --import ./tests/ts-loader.js --test tests/*.test.ts
 */
import { register } from "node:module";

register(new URL("./ts-hooks.js", import.meta.url));
