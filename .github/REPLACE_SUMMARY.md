# This is a placeholder content for commit information and summary of changes.

**Summary of Changes**:

1. Replaced occurrences of the domain `qapi.dev` with `https://qapi-omega.vercel.app`. 
   - Changed links like `http://qapi.dev`, `https://qapi.dev`, and `qapi.dev/docs` to the new domain. 
   - Updated signup/dashboard links specifically to `https://qapi-omega.vercel.app/signup` and `https://qapi-omega.vercel.app/docs` respectively.

2. Updated NPM scope from `@qapi` to `@solanar` in all relevant files.
   - Examples: `@qapi/sdk` to `@solanar/sdk`, `require('@qapi/sdk')` to `require('@solanar/sdk')`, `import "@qapi/..."` to `import "@solanar/..."`.

3. Modified `package.json` files to change `name` fields from `@qapi/*` to `@solanar/*` where applicable.
   - For instance: `"name": "@qapi/sdk"` to `"name": "@solanar/sdk"`.

4. Updated URLs referencing `vps.qapi.dev` to `vps.qapi-omega.vercel.app` where applicable.

5. The changes reflected in documentation, source code imports, comments, tests, and scripts (.ps1/.ps2, etc.).

**Skipped Files**:

- Any ambiguous cases like binary files or vendor files were skipped and will need manual review.

[Detailed diff output placeholder]