# Helix CRM — Architecture

## 1. Shape of the system

```
Browser ──► Next.js 16 (port 3000)
              │  rewrites /api/v1/* ──► ASP.NET Core 10 (port 5080)
              │                              │  EF Core 10
              └── httpOnly helix_token cookie └──► PostgreSQL 17 (port 5433)
```

- **Frontend:** Next.js App Router, React Server Components for the shell and route guards, client components for interactive views. Data fetching uses SWR against same-origin `/api/v1` paths.
- **Backend:** A modular monolith. Each business capability is a folder under `Features/` with its own controller, DTOs and query logic. Shared concerns live in `Common/`, `Data/` and `Domain/`.
- **Database:** PostgreSQL with EF Core migrations; JSON columns hold custom-field values and tag arrays.

The rewrite in `frontend/next.config.ts` keeps the browser on one origin, which avoids CORS for normal use and makes the auth cookie first-party. `Cors` is still configured on the API for direct integrations and local tooling.

## 2. Authentication and tenancy

1. `POST /api/v1/auth/login` verifies the PBKDF2 hash (`PasswordHasher`) and issues a JWT signed with `Jwt:Key`.
2. The token carries `sub` (user), `org` (organisation), `email`, `name` and `role` claims. It is written to the `helix_token` cookie (httpOnly, SameSite=Lax) and is also accepted as a Bearer token.
3. `HttpTenantProvider` exposes the current organisation/user from the request principal.
4. `HelixDbContext` applies a **global query filter** to every `OrgEntity`:
   `x.OrganizationId == tenant.OrganizationId && !x.IsDeleted`.
5. Controllers never take an organisation ID from the client; it always comes from the token. This makes IDOR attacks ineffective — a valid ID from another workspace simply resolves to nothing.

`frontend/src/proxy.ts` performs a cheap cookie-existence guard for app routes, while the API remains the authority for every request. Unauthenticated API calls return `401`; the client redirects to `/login`.

## 3. Data model

| Entity | Key relationships |
| --- | --- |
| `Organization` | Root of the tenant. Name, slug, currency, timezone, logo |
| `User` | Belongs to one organisation; role `Admin`, `Manager` or `Rep` |
| `Pipeline` → `Stage` | Configurable sales process; stages carry probability, colour and won/lost flags |
| `Account` | Company; owner, lifecycle status, address, tags |
| `Contact` | Belongs to an account; primary flag, owner |
| `Lead` | Unqualified record; status board, source, score, conversion links |
| `Deal` | Belongs to pipeline/stage/account/contact; amount, probability, close date, status |
| `Activity` | Polymorphic (`RelatedType` + `RelatedId`) task/call/meeting/email/note/reply |
| `Ticket` | Support conversation root; SLA, priority, channel, assignee, tags |
| `Product` | Catalogue item with SKU, price, tax rate, category |
| `Quote` → `QuoteLine` | Optional account/deal/contact; totals computed server-side |
| `CustomFieldDefinition` | Per-entity metadata: key, label, type, options, required, ordering |
| `AuditLog` | Actor, action, entity, changed fields (JSON) |
| `Notification` | Per-user, read/unread |
| `DuplicateCandidate` | Reviewable account/contact duplicate pair with similarity score, reason and status |

Autonomous engines add state to existing entities: organisations carry the engine thresholds; leads carry a score breakdown and routing state; deals carry `LastStageMovedAt`, health/stall flags and a lost reason; tickets carry a server-side breach flag and escalation level; accounts and contacts carry freshness/duplicate flags and enrichment JSON.

Every entity inherits `OrgEntity`: `Id`, `OrganizationId`, `CreatedAt`, `UpdatedAt`, `CreatedById`, `UpdatedById`, `IsDeleted`, plus JSON helpers (`CustomDataJson`, `TagsJson` where relevant).

### Derived values

- Quote `Subtotal`, `TaxTotal` and `Total` are always recalculated on the server from lines, line discount, order discount and tax percent.
- Deal board columns group open deals by stage and sum amounts; won/lost deals are separated by `Status`.
- Ticket SLA state is derived on the client from `SlaDueAt` relative to now (`Overdue`, `Due soon`, `On track`), combined with the server-side `SlaBreached`/`EscalationLevel` written by the escalation worker.
- Dashboards and reports aggregate with LINQ over the tenant-scoped query.
- Lead score breakdowns, deal health indexes and freshness scores are stored server-side so lists stay cheap to render and the numbers are auditable.

## 4. Write pipeline

`HelixDbContext.SaveChangesAsync` wraps every save:

1. Stamp `CreatedAt`/`UpdatedAt` (UTC) and `CreatedById`/`UpdatedById`.
2. Build audit entries for added, modified and soft-deleted `OrgEntity` rows (excluding audit logs, notifications, quote lines and stages). Soft deletes always record the record's display name.
3. Persist everything in the same transaction.

Deletes set `IsDeleted = true`; the query filter hides the row while history remains available for auditing. Deleting a pipeline also soft-deletes its stages.

## 5. Autonomous engines

The self-driving layer lives in `Features/Autonomous/` and runs both inline (on writes) and in the background.

- **Lead scoring (`LeadScoring`)** — deterministic, explainable 0–100 score split across firmographic (40), seniority (30) and completeness (30) budgets. The factor list is serialised to `Lead.ScoreBreakdownJson` and rendered in the lead detail panel. No ML, no external calls, fully reproducible.
- **Lead autopilot (`LeadAutopilot`)** — scores on create/update/import and routes leads at or above `Organization.LeadScoreRoutingThreshold` to the least-loaded active rep, recording `RoutingState` (`AutoRouted`, `SdrQueue`, `Assigned`). An explicit owner always wins.
- **Duplicate detection (`DuplicateDetectionService`)** — normalises names (legal suffixes, accents, punctuation), compares domains, emails and phone tails with Jaro-Winkler similarity, records pending `DuplicateCandidate` pairs, and merges by keeping the older record, relinking contacts/deals/tickets/quotes/invoices/leads/activities and soft-deleting the duplicate. Merges use tracked entity updates so everything commits atomically.
- **Autonomous monitor (`AutonomousMonitor`)** — four sweeps: lead routing (assigns unowned high-intent leads), deal stagnation (flags stalled deals, penalises probability, lowers health, opens a re-engage task), SLA escalation (marks breaches, raises priority, increments escalation level, notifies the assignee) and data freshness (decays account/contact freshness scores, flags stale records).
- **Daemon (`AutonomousDaemon`)** — hosted service started 15s after boot. Intervals are configured through `Autonomous:DaemonEnabled`, `SlaIntervalMinutes` (5), `HygieneIntervalMinutes` (60) and `DuplicateIntervalMinutes` (360).

Background work must run without an HTTP request, so `Data/TenantContext` exposes a mutable per-scope override. `TenantProvider` prefers the override when set; request scopes leave it `null`, so global query filters still isolate the caller's organisation and one tenant's sweep can never touch another's rows.

Endpoints (Admin/Manager for mutations):

| Endpoint | Purpose |
| --- | --- |
| `GET /autonomous/insights` | Counts and actionable items for the dashboard/settings cards |
| `POST /autonomous/run` | Run all workers immediately for the current organisation |
| `POST /autonomous/leads/rescore` | Recompute and persist scores/breakdowns for every lead |
| `GET/PUT /autonomous/settings` | Read or update the workspace thresholds |
| `GET /duplicates` | Paged pending duplicate pairs |
| `POST /duplicates/scan` | Force a scan now |
| `POST /duplicates/{id}/merge` | Merge a pair |
| `POST /duplicates/{id}/dismiss` | Dismiss a suggestion |

## 6. API conventions

- Base path: `/api/v1`.
- JSON is camelCase; `DateTime` inputs are normalised to UTC by `UtcDateTimeConverter` before reaching Npgsql, so clients may send `Z`, offsets, or offset-less timestamps.
- List endpoints return either an array or `{ items, total, page, pageSize, totalPages, hasNext, hasPrevious }` for paged lists. `pageSize` is clamped to 1–200.
- Errors use `{ message, details, traceId }`. Domain errors throw `ApiException(status, message)`; unexpected failures return `500`; database constraint conflicts return `409`.
- Detail endpoints accept only GUID ids and return `404` when the record is missing, soft-deleted, or belongs to another workspace.
- CSV exports stream `text/csv` with a UTF-8 BOM and RFC 4180 escaping.
- Role gates: products, pipelines, custom fields → Admin/Manager. User mutations and organisation settings → Admin. Everything else is available to any authenticated member.

## 7. Frontend architecture

- **Shell:** sidebar + topbar, workspace switcher, notification popover, user menu, ⌘K command palette backed by `/search`.
- **Data layer:** `src/lib/api.ts` contains the fetcher and typed SWR hooks. Keys are relative paths such as `/deals?status=Open`; the fetcher prepends `/api/v1`. Mutations call the API then `mutate` the relevant keys.
- **Design system:** CSS custom properties in `globals.css`, exposed to Tailwind 4 via `@theme inline`. Dark mode is a class on `<html>`; all colours, radii and shadows resolve through tokens.
- **Components:** reusable table/board patterns live beside each feature (`components/accounts`, `components/deals`, …), generic primitives in `components/ui`, and feature-agnostic pieces (page header, empty state, pagination, badges, record dialogs) in `components/shared`.
- **Caching:** SWR keeps lists warm across navigation; mutations revalidate only the affected resources. `cacheComponents` and `partialPrefetching` are enabled in Next.
- **Forms:** controlled dialogs with inline validation, optimistic-feeling toasts via `sonner`, and server errors surfaced as the API's `message`.

## 8. Operational notes

- `Database:AutoMigrate=true` applies migrations and seeds the demo workspace only when the database is empty.
- The seeder preserves historical timestamps so dashboards show a realistic 12-month trend.
- Health endpoint: `GET /health`.
- The autonomous daemon is enabled by default (`Autonomous:DaemonEnabled=true`); existing databases are migrated with feature defaults so engines start on sane thresholds, and every threshold can be changed at runtime from Settings → Autonomous.
- The API reference is served at `/scalar/v1` (OpenAPI JSON at `/openapi/v1.json`).
- `scripts/smoke.ps1` creates, updates, reads and deletes one of every mutable resource and checks CSV exports; run it after deployment to confirm the full stack.
