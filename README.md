# Helix CRM

Helix CRM is a complete, self-hosted CRM workspace built with **.NET 10**, **Next.js 16 / React 19**, and **PostgreSQL 17**. It brings the strongest ideas from the open-source CRM world — Twenty's clean record views, EspoCRM's configurable metadata, SuiteCRM's sales coverage, Frappe CRM's kanban flow, ERPNext's quotes, Chatwoot's shared inbox, and Dolibarr's pragmatic breadth — into one coherent product.

![stack](https://img.shields.io/badge/.NET-10-512BD4) ![stack](https://img.shields.io/badge/Next.js-16-000000) ![stack](https://img.shields.io/badge/PostgreSQL-17-4169E1)

## What is included

| Area | Highlights |
| --- | --- |
| Accounts | Dense list with search, owner/status filters, CSV export, full company profile with contacts, deals, tickets, quotes and audit trail |
| Contacts | Directory, account roll-up, primary contact, activity history, per-contact deals and tickets |
| Leads | Table and drag-and-drop kanban by status, explainable scoring with factor breakdown, auto-routing to the least-loaded rep, qualification notes, one-click conversion to account + contact + deal |
| Deals | Configurable pipelines, kanban and table views, stage stepper with probability, amount/close-date tracking, quotes, activity and audit |
| Activities | Unified timeline of tasks, calls, meetings, manually logged emails, notes and replies, due-date buckets, complete/reopen |
| Support inbox | Ticket inbox with table and board layouts, server-side SLA breach detection and auto-escalation, priority/channel/assignee filters, threaded conversation with public replies and internal notes (email delivery is not wired yet) |
| Autonomous | Background daemon that scores/routes leads, flags stalled deals with health indexes and follow-up tasks, escalates SLA breaches, decays data freshness, and detects/merges duplicate accounts and contacts — configurable per workspace |
| Revenue | Product catalogue, quotes with line items, product picker, per-line and order discounts, tax, status workflow, printable document view |
| Analytics | Executive dashboard plus reports: revenue trend, pipeline by stage, team leaderboard, top accounts, lead funnel and source mix, support volume, activity mix |
| Workspace | Team management with roles, invitation flow, multiple pipelines, per-entity custom fields, branding, currency, timezone, light/dark appearance |
| Platform | JWT auth in an httpOnly cookie, tenant-scoped data access, login rate limiting and account lockout, soft deletes, audit log, global search (⌘K), notifications, CSV exports, Scalar API reference |

See [docs/features.md](docs/features.md) for the full feature matrix and [docs/reference-analysis.md](docs/reference-analysis.md) for how each reference product shaped the design.

## Quick start with Docker

```bash
cp .env.example .env
# Required: paste a unique 32+ character secret, e.g. the output of:
openssl rand -hex 32
docker compose up --build
```

The API refuses to start in Production when `JWT_KEY` is missing, shorter than 32 characters, or still set to a sample value from this repository.

| Service | URL |
| --- | --- |
| Web app | http://localhost:3000 |
| API | http://localhost:5080 |
| API reference | http://localhost:5080/scalar/v1 |
| PostgreSQL | `localhost:5433` (database `helix_crm`, user `helix`) |

The API applies migrations and seeds the **Northstar Labs** demo workspace on first start.

### Demo accounts

| Email | Password | Role |
| --- | --- | --- |
| `avery@helixcrm.dev` | `Admin@123` | Admin |
| `jordan@helixcrm.dev` | `Demo@123` | Manager |
| `sofia@helixcrm.dev` | `Demo@123` | Rep |
| `noah@helixcrm.dev` | `Demo@123` | Rep |
| `maya@helixcrm.dev` | `Demo@123` | Rep |

## Local development

Prerequisites: .NET SDK 10, Node.js 22+, Docker (for PostgreSQL).

```bash
# 1. Database
docker compose up -d db

# 2. API — http://localhost:5080
dotnet run --project backend/src/HelixCrm.Api --urls http://localhost:5080

# 3. Web — http://localhost:3000
cd frontend
npm install
npm run dev
```

The frontend proxies `/api/v1/*` to `http://localhost:5080` (override with `API_URL`), so the browser only ever talks to its own origin and the auth cookie stays first-party.

### Useful commands

```bash
dotnet build backend/src/HelixCrm.Api          # compile the API
dotnet test backend/tests/HelixCrm.Tests       # unit tests (58)
dotnet ef migrations add <Name> --project backend/src/HelixCrm.Api
powershell -File scripts/smoke.ps1             # full API smoke test (auth, CRUD, exports, autonomous)
cd frontend && npm run build                   # production build
cd frontend && npm run lint
```

### Integration tests (real PostgreSQL)

Start the database container, then point the integration suite at it:

```bash
docker compose up -d db
export HELIX_TEST_POSTGRES="Host=localhost;Port=5433;Database=helix_crm;Username=helix;Password=helix_dev_password"
dotnet test backend/tests/HelixCrm.IntegrationTests
```

Each run creates a throwaway database (`helix_it_*`), applies migrations, boots the API with `WebApplicationFactory`, and covers tenant isolation, duplicate merge and lead conversion. Without `HELIX_TEST_POSTGRES` those five tests are reported as skipped, not passed.

> When running EF Core design-time commands set `Database__AutoMigrate=false` so the running app does not race the tooling.

## Repository layout

```
backend/
  src/HelixCrm.Api/
    Common/          DTO helpers, CSV writer, JSON/date converters, paging
    Data/            DbContext (tenancy, audit, soft delete), seeder, migrations
    Domain/          Entities, status constants
    Features/        Auth, Accounts, Contacts, Leads, Deals, Activities,
                     Tickets, Revenue, Dashboard/Reports, Search,
                     Notifications, Users, Config, Autonomous
  tests/HelixCrm.Tests/            Unit tests
  tests/HelixCrm.IntegrationTests/ PostgreSQL integration tests (opt-in via HELIX_TEST_POSTGRES)
frontend/
  src/app/(app)/     Authenticated routes (dashboard, records, reports, settings)
  src/app/login/     Sign-in
  src/components/    Shell, record tables/boards, dialogs, settings, UI primitives
  src/lib/           API client + SWR hooks, types, utilities
scripts/smoke.ps1    End-to-end API smoke test
docs/                Architecture, feature matrix, reference analysis, roadmap
docker-compose.yml   db + api + web
```

## Configuration

| Setting | Default | Purpose |
| --- | --- | --- |
| `ConnectionStrings__Default` | `Host=localhost;Port=5433;...` | PostgreSQL connection |
| `Jwt__Key` | dev key in Development only | JWT signing key — **required in Production**, minimum 32 characters |
| `Jwt__ExpiryDays` | `7` | Session lifetime |
| `Cookie__Secure` | `false` | Set `true` behind HTTPS |
| `Proxy__KnownProxies` | empty | Comma-separated proxy IPs allowed to set `X-Forwarded-For` (required for per-IP limits behind nginx/Caddy) |
| `Proxy__KnownNetworks` | empty | Comma-separated CIDRs trusted as proxies (for example the Docker network) |
| `Database__AutoMigrate` | `true` | Apply migrations + seed at startup |
| `Autonomous__DaemonEnabled` | `true` | Run the autonomous background workers |
| `Autonomous__SlaIntervalMinutes` | `5` | SLA escalation sweep interval |
| `Autonomous__HygieneIntervalMinutes` | `60` | Routing, stagnation and freshness sweep interval |
| `Autonomous__DuplicateIntervalMinutes` | `360` | Duplicate scan interval |
| `Cors__Origins__0` | `http://localhost:3000` | Allowed browser origin |
| `API_URL` (web) | `http://localhost:5080` | Upstream API for the Next proxy |

## Security notes

- Passwords are hashed with PBKDF2-SHA256 (120 000 iterations, per-password salt).
- Sign-in is rate-limited per IP (10 requests/minute) and locks an account for 15 minutes after 5 consecutive failures; successful sign-in resets the counter.
- Forwarded headers are trusted only from proxies listed in `Proxy__KnownProxies` / `Proxy__KnownNetworks`; without an entry, a reverse proxy collapses every user into one rate-limit bucket. Never trust `X-Forwarded-For` from arbitrary clients.
- Sessions use a signed JWT delivered as an `httpOnly`, `SameSite=Lax` cookie; the API also accepts `Authorization: Bearer` for integrations. In Production the API will not start with a missing, short, or sample JWT key.
- Every query is scoped to the signed-in user's organisation through EF Core global query filters; workspace lookups go through a tenant-scoped helper, so IDs alone never grant cross-tenant access.
- Mutations are role-gated (Admin/Manager/Rep) and every create/update/delete is written to an immutable audit log.
- Records are soft-deleted, so exports and dashboards cannot resurrect removed data.

## License

Provided as a reference implementation for evaluation and further development. Review third-party brand names and demo data before production use.
