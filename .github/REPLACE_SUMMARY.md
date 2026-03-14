# Change Summary — npm scope and domain migration

## What changed

1. **Domain migration**: `qapi.dev` → `qapi-omega.vercel.app` in all tracked text files.
   - URLs updated: `https://qapi.dev`, `https://vps.qapi.dev`, `https://blobs.qapi.dev`, `https://qapi.github.io`
   - Signup/dashboard links updated throughout docs, HTML, and source comments.

2. **npm scope migration**: `@qapi` → `@solanar` (case-insensitive) in all tracked text files.
   - Package names: `@qapi/sdk` → `@solanar/sdk`, `@qapi/core-brain` → `@solanar/core-brain`, `@qapi/core` → `@solanar/core`, `@qapi/dashboard` → `@solanar/dashboard`
   - Source imports updated in `api/src/middleware/auth.js`, `api/src/routes/modules.js`, `api/src/routes/v1.js`
   - Lock files regenerated (`npm install`) in `api/`, `apps/core/`, `sdk/`, `dashboard/`

3. **Schema `$id` URL** updated: `https://qapi.dev/schemas/...` → `https://qapi-omega.vercel.app/schemas/...`

4. **CORS origin** in `apps/core/vercel.json` updated from `https://qapi.github.io` to `https://qapi-omega.vercel.app`

5. **Module data** updated: `@qapi/vps-module-alpha` → `@solanar/vps-module-alpha` in `api/src/data/moduleStore.js` and test files.

6. **`.env.example`** added with all supported environment variables documented.

## Files affected

- `api/package.json`, `api/package-lock.json`
- `api/src/middleware/auth.js`
- `api/src/routes/modules.js`, `api/src/routes/v1.js`
- `api/src/data/moduleStore.js`
- `api/src/tests/api.test.js`
- `apps/core/package.json`, `apps/core/package-lock.json`
- `apps/core/vercel.json`
- `apps/core/tests/module-resolver.test.ts`
- `sdk/package.json`, `sdk/package-lock.json`
- `sdk/src/index.js`, `sdk/src/tests/sdk.test.js`
- `dashboard/package.json`, `dashboard/package-lock.json`
- `module-node.schema.json`
- `scripts/bootstrap.js`
- `README.md`, `docs/*.md`, `dashboard/*.html`
- `components/dashboard/*.tsx`
- `.env.example` (new file)

## Notes

- All 106 tests pass after the migration.
- Build succeeds (`npm run build`).
- Binary files and untracked files were not modified.
- Lock files were regenerated with `npm install` — review if using a different package manager.
