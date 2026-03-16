# Tinker

> Tinker makes software teams of two feel like teams of twenty.

Tinker is an AI-native development platform that automates the mechanical layer of software engineering — catching regressions before they merge, generating test coverage for new code, surfacing risky deploys, and keeping documentation in sync with reality.

---

## Local Dev Setup

### Prerequisites

- **Node.js** >= 20 (use [nvm](https://github.com/nvm-sh/nvm) or [fnm](https://github.com/Schniz/fnm))
- **pnpm** >= 9 (`npm install -g pnpm`)
- **Docker + Docker Compose** (for local Postgres and Redis)
- **Git** >= 2.40

### Getting Started

```bash
# Clone the repo
git clone https://github.com/tinker-hq/tinker.git
cd tinker

# Install dependencies
pnpm install

# Copy environment template
cp .env.example .env
# → Edit .env with your local values

# Start infrastructure (Postgres, Redis)
docker compose up -d

# Run database migrations
pnpm db:migrate

# Start all services in dev mode
pnpm dev
```

The app will be available at:
- **Web**: http://localhost:3000
- **API**: http://localhost:3001
- **Docs**: http://localhost:3002

### Project Structure

```
tinker/
├── apps/
│   ├── web/          # Next.js frontend
│   ├── api/          # Fastify API server
│   └── docs/         # Product documentation site
├── packages/
│   ├── db/           # Database schema + migrations (Drizzle ORM)
│   ├── core/         # Shared business logic
│   ├── github/       # GitHub integration client
│   └── config/       # Shared TypeScript + ESLint config
├── .github/
│   └── workflows/    # CI/CD pipelines
├── docker-compose.yml
├── pnpm-workspace.yaml
└── package.json
```

### Running Tests

```bash
# All tests
pnpm test

# Watch mode
pnpm test:watch

# With coverage
pnpm test:coverage

# Specific workspace
pnpm --filter api test
```

### Linting & Formatting

```bash
# Lint all packages
pnpm lint

# Fix auto-fixable issues
pnpm lint:fix

# Type-check
pnpm typecheck
```

### Database

```bash
# Generate migration after schema change
pnpm db:generate

# Run pending migrations
pnpm db:migrate

# Reset local DB (drops + recreates + migrates)
pnpm db:reset

# Open Drizzle Studio (visual DB browser)
pnpm db:studio
```

---

## Environment Variables

See `.env.example` for the full list with descriptions. Required for local dev:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection string |
| `GITHUB_APP_ID` | GitHub App ID for integrations |
| `GITHUB_APP_PRIVATE_KEY` | GitHub App private key (PEM) |
| `OPENAI_API_KEY` | LLM provider key |
| `JWT_SECRET` | Auth token signing key |

---

## Branching Strategy

- `main` — production-ready code, protected
- `staging` — pre-prod integration branch
- `feat/*` — feature branches, branch off `main`
- `fix/*` — bug fixes
- `chore/*` — non-functional changes

**All changes via PR.** Direct pushes to `main` and `staging` are blocked.

## Deployment

| Environment | Branch | Trigger |
|-------------|--------|---------|
| Production | `main` | Merge to main (manual approval required) |
| Staging | `staging` | Auto-deploy on merge |
| Preview | `feat/*` | Auto-deploy on PR open/update |

See `.github/workflows/` for pipeline details.

---

## Contributing

1. Branch off `main`: `git checkout -b feat/your-feature`
2. Make changes, write tests
3. `pnpm lint && pnpm test` must pass locally
4. Open a PR — CI runs automatically
5. Get review + approval before merging
