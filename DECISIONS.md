# Design Decisions

A log of significant technical choices, with context and trade-offs.
New decisions get the next number; superseded ones are marked, not deleted.

---

## 001 - Express over NestJS

**Decision:** Use Express as the HTTP framework.

**Why:** Express has little abstraction, so I have to build middleware, layering, and
dependency wiring myself and learn how they work. I already know it from MERN projects,
which leaves my learning budget for new topics (SQL, Redis, Docker, RBAC).

**Trade-off:** More boilerplate and fewer conventions than NestJS. The folder structure
and layering are my responsibility.

---

## 002 - Shared-schema multi-tenancy

**Decision:** One database, one schema, with an `organization_id` column on every
tenant-owned table.

**Why:** It is the simplest model to operate and the most common in SaaS products. Schema-
per-tenant or database-per-tenant adds migration and connection-management complexity
that isn't justified at this scale.

**Rule:** The `organization_id` for a query always comes from the authenticated user's
membership, never from the request body.

**Trade-off:** Isolation depends on every query filtering correctly. Mitigations: tests
proving Org A cannot read Org B's data, and Postgres Row-Level Security as a later
safety net.

---

## 003 - ESM with NodeNext module resolution

**Decision:** `"type": "module"` in `package.json`, with `module` and `moduleResolution`
set to `NodeNext` in `tsconfig.json`.

**Why:** This matches how Node actually resolves modules and is where the ecosystem is
heading. Tools I plan to use (Vitest, tsx) are ESM-native. This replaced my initial
CommonJS plan.

**Trade-off:** Relative imports need explicit `.js` extensions (`import { app } from
'./app.js'`), and `__dirname` is unavailable (use `import.meta.dirname`).

---

## 004 - Strict TypeScript and explicit `types`

**Decision:** `"strict": true`, and `"types": ["node"]` set explicitly.

**Why:** Strict mode catches whole classes of bugs at compile time. Newer TypeScript
versions no longer auto-include every `@types/*` package, so listing them is required
for Node globals to type-check.

---

## 005 - Validate environment variables at startup with Zod

**Decision:** `src/config/env.ts` parses `process.env` with a Zod schema and exits
immediately if validation fails. The rest of the code imports the typed `env` object and
never reads `process.env` directly.

**Why:** Fail fast with a clear message instead of crashing later with an obscure error.
It also gives typed, coerced config (e.g. `PORT` as a number).

**Trade-off:** The process exits at import time, so tests that import config need a valid
environment (handled later with a `.env.test` file).

---

## 006 - Docker Compose for infrastructure only

**Decision:** Postgres and Redis run in Docker Compose. The Node app runs directly on my
machine during development.

**Why:** Gives everyone identical database versions with one command, while keeping the
edit-run-debug loop fast (no rebuilding images). A production Dockerfile comes in the
CI/CD phase.

**Trade-off:** The app itself isn't containerised yet, so "works on my machine" issues
are possible until the Dockerfile exists.

---

## 007 - Separate `app.ts` and `server.ts`

**Decision:** `app.ts` builds and exports the Express app. `server.ts` imports it and
calls `listen`.

**Why:** Integration tests (Supertest) can import the app without opening a network port,
which makes tests faster and avoids port conflicts.

---

## 008 - `tsx` for development, `tsc` for builds

**Decision:** `npm run dev` uses `tsx watch`. Production runs compiled output from
`tsc` via `node dist/server.js`.

**Why:** `tsx` gives fast reloads without a separate build step. Compiling with `tsc`
for production means the deployed code doesn't depend on a dev-time tool.

---

## 009 - `.env` is local, `.env.example` is the contract

**Decision:** `.env` is git-ignored and holds real secrets. `.env.example` is committed
with placeholder values and documents every variable.

**Why:** Secrets never enter version control, and a new developer can see exactly what
to configure.

---

## 010 - Prisma 7 with the `prisma-client` generator and the pg driver adapter
**Decision:** Prisma for schema, migrations, and queries, using the `@prisma/adapter-pg`
driver adapter. The client is generated into `src/generated/prisma` (git-ignored) and
regenerated on `npm install` via `postinstall`.
**Why:** Prisma 7 requires a driver adapter and an ESM-friendly generator, which fits my
NodeNext setup. Output lives inside `src/` so `tsc` compiles it with the rest of the code.
**Trade-off:** Generated code is not committed, so a fresh clone needs `npm install`
(which triggers generation). Raw SQL via `$queryRaw` stays available for search and
performance work.

---

## 011 - Errors as typed exceptions, handled in one place
**Decision:** Services throw `AppError` (status, machine-readable code, message). A single
error middleware formats every error as `{ error: { code, message, details, requestId } }`.
**Why:** Consistent responses, no duplicated try/catch, and services stay independent of HTTP.
Unknown errors return a generic 500 and are logged in full, so internals never leak.

---

## 012 - Request IDs and structured logging with pino
**Decision:** `pino-http` assigns each request an ID (or reuses a valid incoming
`x-request-id`), returns it as a header, and attaches it to every log line.
Authorization and cookie headers are redacted.
**Why:** One ID traces a request across logs and appears in client-facing errors, making
debugging production issues practical.

---

## 013 - Validate input with Zod at the route boundary
**Decision:** A `validate({ body, query, params })` middleware parses input before
controllers run, replacing `req.body` etc. with typed, coerced values.
**Why:** Controllers and services can trust their input, and every endpoint returns the
same validation error shape.

---

## 014 - Graceful shutdown
**Decision:** On SIGINT/SIGTERM the server stops accepting connections, lets in-flight
requests finish, disconnects Prisma, then exits (forced exit after 10s).
**Why:** Avoids dropped requests and dangling DB connections during deploys.

---

## 015 - Short-lived access JWT + rotating opaque refresh tokens
**Decision:** Access tokens are 15-minute HS256 JWTs carrying only `sub`. Refresh tokens
are random opaque strings (7 days), rotated on every use.
**Why:** JWTs can't be revoked, so they must be short-lived; refresh tokens live in the DB
so sessions can be revoked. Opaque tokens avoid pretending a second JWT adds anything.
**Trade-off:** A deleted or banned user keeps API access until their access token expires
(max 15 min). Acceptable here; a revocation list in Redis could close the gap later.

---

## 016 - Refresh token reuse detection with token families
**Decision:** Each login creates a `familyId`. Presenting an already-revoked refresh token
revokes every token in that family.
**Why:** A reused token means two parties hold it, which signals theft. Killing the family
forces re-authentication for both.

---

## 017 - Store refresh tokens as HMAC-SHA256 hashes
**Decision:** Only `HMAC(JWT_REFRESH_SECRET, token)` is stored. The raw token exists only
on the client.
**Why:** A database leak shouldn't yield usable sessions. A fast keyed hash is sufficient
because tokens are 384 bits of random data (unlike passwords, which need slow hashing).

---

## 018 - argon2id for passwords
**Decision:** Hash passwords with the `argon2` package using its defaults (argon2id).
**Why:** It is the current OWASP-recommended password hashing algorithm and is
memory-hard, which makes GPU cracking expensive.
**Rule:** Login returns the same error for unknown email and wrong password, and runs a
dummy verify for unknown emails, to prevent account enumeration.

---

## 019 - Tokens returned in the JSON body; routes under /api/v1
**Decision:** The refresh token is sent and received in JSON bodies, not cookies. All
API routes live under `/api/v1`.
**Why:** Simplest to test with Postman or tests, and fits a backend-only portfolio
project. Versioning lets breaking changes ship as `/api/v2`.
**Trade-off:** A browser client would need to store the refresh token itself; an
httpOnly cookie would be the safer choice for a web frontend.