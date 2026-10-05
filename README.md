# TaskHub API

A multi-tenant SaaS-style backend for task and project management, built to practice
production-grade backend engineering: authentication, RBAC, tenant isolation, caching,
background jobs, testing, and CI/CD.

> **Status:** Phase 0 complete (project scaffolding). Work in progress.

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20+ |
| Language | TypeScript (strict, ESM, `NodeNext`) |
| Framework | Express |
| Database | PostgreSQL 16 |
| Cache / Queues | Redis 7 |
| Validation | Zod |
| Logging | pino |
| Tooling | ESLint, Prettier, tsx |
| Infra (local) | Docker Compose |

Planned: Prisma, JWT auth, BullMQ, Vitest + Supertest, OpenAPI docs, GitHub Actions.

## Prerequisites

- [Node.js](https://nodejs.org) 20 or newer
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (WSL 2 backend recommended on Windows)
- Git

## Getting Started

All commands below are for **Windows PowerShell**. macOS/Linux equivalents are noted.

### 1. Clone and install

```powershell
git clone <your-repo-url>
cd taskhub-api
npm install
```

### 2. Configure environment variables

```powershell
Copy-Item .env.example .env          # macOS/Linux: cp .env.example .env
```

Generate two different secrets and paste them into `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` in `.env`:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

### 3. Start Postgres and Redis

```powershell
docker compose up -d
docker compose ps
```

### 4. Run the API

```powershell
npm run dev
```

Check it: <http://localhost:3000/ping> should return `{"message":"pong"}`.

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `NODE_ENV` | `development`, `test`, or `production` | `development` |
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://taskhub:taskhub@localhost:5432/taskhub` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `JWT_ACCESS_SECRET` | Secret for access tokens (min 32 chars) | generated |
| `JWT_REFRESH_SECRET` | Secret for refresh tokens (min 32 chars) | generated |

The app validates these at startup and exits with a clear error if any are missing or invalid.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the server with auto-reload (tsx) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run the compiled build |
| `npm run typecheck` | Type-check without emitting files |
| `npm run lint` | Lint with ESLint |
| `npm run format` | Format with Prettier |

## Docker Commands

```powershell
docker compose up -d          # start Postgres + Redis in the background
docker compose ps             # check status
docker compose logs -f postgres
docker compose down           # stop (data is kept)
docker compose down -v        # stop AND delete all database data
```

Open a SQL shell:

```powershell
docker compose exec postgres psql -U taskhub
```

## Troubleshooting

- **"Invalid environment variables" on startup:** `.env` is missing. Only `.env.example`
  is committed; copy it to `.env`.
- **Port 5432 already in use:** a local Postgres is running. Change the mapping in
  `docker-compose.yml` to `"5433:5432"` and use port `5433` in `DATABASE_URL`.
- **`docker compose` can't connect to the daemon:** start Docker Desktop and wait for it
  to report "running".
- **`ERR_MODULE_NOT_FOUND`:** a relative import is missing its `.js` extension
  (required under ESM), e.g. `import { app } from './app.js'`.

## Project Structure

```
src/
  config/        # validated env config
  lib/           # shared clients (Prisma, Redis)
  middleware/    # auth, validation, error handling
  modules/       # feature modules: auth, organizations, projects, tasks, audit
  jobs/          # background queues and workers
  utils/         # shared helpers
  app.ts         # builds the Express app (no listen)
  server.ts      # starts the HTTP server
tests/
  unit/
  integration/
```

## Roadmap

- [x] Phase 0: Setup (TypeScript, linting, Docker, env validation)
- [x] Phase 1: Foundation (Prisma, error handling, logging, validation)
- [x] Phase 2: Authentication (JWT access + refresh tokens)
- [ ] Phase 3: Organizations and RBAC
- [ ] Phase 4: Core CRUD, pagination, filtering, search
- [ ] Phase 5: Transactions and audit logs
- [ ] Phase 6: Redis (rate limiting, caching)
- [ ] Phase 7: Background jobs
- [ ] Phase 8: Testing hardening
- [ ] Phase 9: API docs and CI/CD
- [ ] Phase 10: Polish and deployment

See [DECISIONS.md](./DECISIONS.md) for the reasoning behind key design choices.