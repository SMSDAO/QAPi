# Changelog

All notable changes to **QAPi** are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] – 2026-03-15

### Added

- **Neo-Glow dark UI** — full-screen scan-line overlay, neon glow utilities (`glow-cyan`, `glow-purple`, `glow-green`), animated flash badge, float & pulse keyframes across all dashboard pages.
- **7-tab navigation** — responsive top-bar with tabs: Home, Dashboard, Users, Admin, Developer, Settings, Docs. Accessible keyboard navigation, ARIA roles, and mobile hamburger dropdown on all pages.
- **Admin dashboard** (`dashboard/admin.html`) — system health stats, user management with RBAC role table (Admin / Developer / User / Auditor), module health cards, API call tier breakdown, audit log viewer, security compliance panel; auto-refreshes every 15 s.
- **Developer dashboard** (`dashboard/developer.html`) — API playground with key storage and one-click request sender, live log viewer (auto-poll 5 s), integration test runner (5 contract tests), environment variable inspector, deploy diagnostics panel.
- **RBAC role matrix** — Admin, Developer, User, Auditor roles defined and displayed in the Admin dashboard; tier guard (`requireTier`) enforced in API middleware.
- **Service Worker expansion** — `admin.html` and `developer.html` added to the static shell cache manifest in `dashboard/sw.js`.
- **CI – security scan step** — `npm audit --audit-level=high` added to the `test-api` and `test-sdk` jobs; fails the build on high/critical vulnerabilities.
- **Release workflow** (`.github/workflows/release.yml`) — triggers on `v*` tags; runs the full test matrix, then creates a GitHub Release with auto-generated notes.
- **`CHANGELOG.md`** — this file, following Keep-a-Changelog conventions.
- **UI Preview section in README** — embedded screenshots of User (index), Admin, and Developer dashboards from `docs/assets/ui/`.
- **`docs/assets/ui/` directory** — placeholder screenshots committed; Playwright capture wired into CI (`playwright` job in CI workflow).

### Changed

- Navigation in `index.html`, `signup.html`, and `docs.html` updated from 3-link inline bar to 7-tab responsive nav component with active-tab highlighting.
- `vercel.json` secure headers already include `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` — documented explicitly in the Admin dashboard Security panel.
- README updated: architecture diagram unchanged, added UI Preview section, updated Node version badge to ≥ 18, deploy badge updated to point to this repo.
- `.env.example` — existing variables preserved; documentation clarified for `QAPI_BLOB_BASE_URL` and `API_BASE_URL`.

### Fixed

- Mobile overflow (`overflow-x-hidden`) applied consistently across all pages.
- `aria-current="page"` attribute added to the active nav tab on each page for screen-reader accessibility.
- Service worker static shell was missing `admin.html` and `developer.html`; now included.

### Security

- `npm audit` step in CI will flag and fail the build on high/critical dependency vulnerabilities.
- Release workflow gates on a full green CI run before creating the GitHub Release.
- `X-QAPi-Key` header validated against the key store on every protected request; token prefix alone cannot spoof a tier.
- Rate limiting enforced per key ID (not just by IP) to prevent key-sharing abuse.

---

## [0.9.0] – 2026-03-01

### Added

- Initial QAPi Core Service (Express + in-memory key store).
- `@solanar/sdk` — lightweight module-resolver client.
- `@solanar/core-brain` — TypeScript tier-manager, module-resolver, subscription-tiers utilities.
- Dashboard HTML pages: `index.html` (Neo-Glow landing), `signup.html`, `docs.html`.
- GitHub Actions CI: build-core, test-api (Node 18/20/22), test-sdk, test-core, typecheck, build-sdk, validate-schema.
- Vercel deployment config with serverless rewrites and security headers.
- PowerShell bootstrap (`bootstrap.ps1`) for Windows virtual-node orchestration.
- JSON Schema for Module Node metadata (`module-node.schema.json`).
- Service Worker (`dashboard/sw.js`) with cache-first static shell and network-only API passthrough.

[1.0.0]: https://github.com/SMSDAO/QAPi/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/SMSDAO/QAPi/releases/tag/v0.9.0
