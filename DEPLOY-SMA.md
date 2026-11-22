# HedgeDoc tester environment

Baseline: `1.12.0` — `b9335040716278d029b5872e3825b92821d9cb70` (newest usable
stable GitHub Release, 2026-08-21; 1.12.1 and 1.12.2 are titled `[WITHDRAWN]`
and 2.x is prerelease-only).

Fork: <https://github.com/sma-rl-dev/hedgedoc>, branch `tester-env-baseline` =
upstream 1.12.0 plus one tooling-only commit (the files listed under "Tooling
files"; no upstream file modified). In the corpus this fork is the submodule at
`apps/hedgedoc`, and `app_cli = "tester-env"` is submodule-relative.

The tag ships no Dockerfile, so `Dockerfile.tester-env` adapts the official
`hedgedoc/container` alpine recipe to COPY this editable checkout instead of
cloning it.

## Quick Start

```bash
./tester-env deploy    # Build image from source, start container, create admin user
./tester-env seed      # Create the deterministic note data (8 notes, 3 users)
./tester-env verify    # Assert health, logins, /history and every seeded value
./tester-env reset     # Clean slate (container + both volumes removed)
./tester-env stop      # Stop container, keep volumes
./tester-env logs      # Tail container logs
./tester-env status    # Container, URL, credentials
```

`./tester-env --help` lists options (`--run-id`, `--port`) and caveats.

## Tooling files

`tester-env`, `tester-env-seed.js`, `tester-env-seed.json`,
`tester-env-seed/notes/*.md`, `Dockerfile.tester-env`,
`docker-compose.tester-env.yml`, `.dockerignore`, `DEPLOY-SMA.md`.

## Stack

- One `node:24.22.3-alpine` container, host port `13371` → container port
  `13371`. No database or worker service.
- Build: stage 1 (builder) installs `git jq python3 build-base`, runs the
  vendored `yarn 4.13.0` (`node .yarn/releases/yarn-4.13.0.cjs`) with
  `install --immutable` behind a BuildKit cache mount keyed on
  `package.json yarn.lock .yarnrc.yml .yarn`, then `yarn build`
  (`webpack.prod.js` → `public/build`; webpack 4 needs the md4→sha256 patch in
  `webpack.common.js` on OpenSSL 3). Stage 2 prunes to production dependencies
  with `yarn workspaces focus --production` (sqlite3 5.1.7 has no musl prebuild,
  so python3/build-base stay in that stage). Stage 3 is the runtime as
  unprivileged uid/gid 10000 running `node app.js`.
- State is two named volumes: `/data` (sqlite + session store) and
  `/hedgedoc/public/uploads`. Migrations run automatically at boot.
- `CMD_DB_URL=sqlite:///data/db.hedgedoc.sqlite` (three slashes = absolute path)
  is the verified form. Uploads use `CMD_IMAGE_UPLOAD_TYPE=filesystem`.

## Browser-origin contract

HedgeDoc turns `CMD_DOMAIN` + `CMD_PORT` + `CMD_URL_ADDPORT` into
`config.serverURL`, which is also the socket.io CORS/CSP origin. The app listens
on the *published* port, and the CLI derives `CMD_DOMAIN` from
`TESTER_ENV_BROWSER_ORIGIN` (fallback `127.0.0.1:$PORT`). Without that, socket.io
writes are blocked cross-origin and the editor silently stops saving.

Verified: with `TESTER_ENV_BROWSER_ORIGIN=http://host.docker.internal:13371`,
`/config` reports domain `host.docker.internal`, CSP `script-src` points at
`http://host.docker.internal:13371/build/|/js/|/config` and `connect-src` at
`ws://host.docker.internal:13371`.

## Credentials and determinism

- `admin@tester-env.local` / `HedgeDocAdmin2026!` — created by `deploy` through
  `bin/manage_users --add ... --pass ...` (the CLI tolerates the existing-user
  exit), not by email registration (`CMD_ALLOW_EMAIL_REGISTER=false`).
- `dana@tester-env.local` / `HedgeDocDana2026!` and
  `priya@tester-env.local` / `HedgeDocPriya2026!` — created by `seed`.
- `CMD_SESSION_SECRET` is pinned, so restarts keep sessions.
- Anonymous notes and free-URL aliases are enabled (`CMD_ALLOW_ANONYMOUS`,
  `CMD_ALLOW_ANONYMOUS_EDITS`, `CMD_ALLOW_FREEURL`); no first-run wizard.

## Seed

`./tester-env seed` copies `tester-env-seed.js` + `tester-env-seed/` into the
running container and executes them there. Notes are created through
`POST /new/<alias>` (text/markdown, creator's session) and history through
`POST /history` with a fixed JSON array; permissions, owners, last-change times
and revisions go through the app's Sequelize models because 1.12.0 exposes no
HTTP route for them. One raw `UPDATE Notes SET createdAt = ?` pins creation
dates (Sequelize ignores `createdAt` on instance updates).

Theme: the Atlas Freight platform-engineering handbook. 8 notes with fixed
aliases: `engineering-onboarding`, `release-runbook`, `api-style-guide`,
`q4-hiring-plan`, `postmortem-dispatch-latency`, `weekly-sync-2026-11-17`,
`platform-glossary` (anonymous, no owner), `one-to-one-dana`.

Coverage: all six permissions (freely 1, editable 2, limited 1, locked 1,
protected 1, private 2), 3 accounts, owner vs non-owner vs anonymous access,
headings/lists/task lists/bold/inline code/indented code/tables/links, visible
`###### Tags:` lines on the runbook and postmortem, 10 revisions over 2 notes
with two each (2026-09-15/2026-11-19 and 2026-10-28/2026-11-20) and one fixed
revision on the other six, and `/history` entries for all three users (7 admin /
5 dana / 3 priya) with fixed times, one pinned entry each for admin and dana, and
fixed tags. Every date is a constant (2026-08-11 .. 2026-11-21), so the wall
clock never enters the seeded state.

Re-seeding deletes only the eight owned notes plus their revisions and rewrites
the three users' history, so it is idempotent and leaves unrelated notes alone.
Manifest: `tester-env-seed.json`.

## Verify

`./tester-env verify` always asserts `/_health`, the admin password login, the
signed-in index and `/history`, then runs the seed verifier: the 8 note pages
(title + permission control), the full 8x4 view matrix (anonymous 200 for
freely/editable/locked and 302 to the index for limited/protected/private; 403
for a signed-in non-owner only on private notes), the rendered published view of
every note, every note's revision list and every user's exact history entries —
113 checks. On a freshly deployed stack without the seed the same command fails
19 checks, so the assertions cannot pass on an empty database.

## Reset

`./tester-env reset` runs `docker compose down -v --remove-orphans`: container,
compose network and both named volumes are removed; the image is kept (image
tags are content-addressed and shared, see `docs/APP_CLI_PATTERN.md`). The
schema is re-migrated at the next boot.

## Build cost

Cold build 2m05s (install 34s, webpack 16.7s, focus 8.7s, copies/export ~26s).
Source-edit rebuild ~50-70s because only `yarn build` and `focus` re-run. Image
533 MB. webpack needs ~2 GB RAM.

## Caveats

- Note content saves travel over socket.io: scenarios must assert on the synced
  state, not on the keystroke.
- Login attempts from one IP are limited (`CMD_RATE_LIMIT_USER`, 10 per 5
  minutes). `seed` and `verify` each log in three users, so a third login-heavy
  command on the same running stack within five minutes can return 429;
  reset+deploy restarts the limiter.
- `/history` renders moment.js relative times and published views bump the view
  counter, so assertions key on order, pinned flags, tags and titles.
- `./tester-env status --run-id X` must also be given the same `--port` used at
  deploy time.

## Evidence provenance

- `app-deployer` (2026-11-22): source build, health/login/note-write checks,
  browser-origin/config verification, reset gate on an isolated
  `--run-id smoke` stack (port 13372: deploy+verify+reset, then deploy+verify on
  fresh volumes).
- `seed-engineer` (2026-11-22): seed implementation, 113-check verify, two full
  reset+deploy+seed+verify cycles plus a re-seed with byte-identical canonical
  digests, and `verify` failing 19 checks without the seed.
- `browser-checker` (2026-11-22): browser smoke (login, live markdown preview,
  permission EDITABLE→LOCKED persisted after reload, History card) and seeded-UI
  verification (7-entry pinned-first admin history, 2-revision notes, permission
  labels, private 403 for dana, dana's 5-entry history, guest block/open).
- `fork-integrator`: no browser; the deploy/seed/verify cycle recorded in
  `status/apps/hedgedoc.toml` was re-run from this fork checkout.
