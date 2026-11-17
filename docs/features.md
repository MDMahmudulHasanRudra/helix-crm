# Feature matrix

Status legend: **✔ shipped** · **◐ partial** (core flow present, advanced edges later) · **— not in scope yet**

## Sales core

| Capability | Helix | Notes |
| --- | --- | --- |
| Accounts (companies) | ✔ | Search, owner/status filters, sort, pagination, CSV, tags, rich profile |
| Contacts | ✔ | Account roll-up, primary contact, owner, tags, linked deals/tickets |
| Leads | ✔ | Table + kanban by status, score, estimated value, source, qualification notes |
| Lead conversion | ✔ | Creates/links account, contact and deal, records conversion audit |
| Deals | ✔ | Configurable pipelines, kanban drag, table view, probability, close date, won/lost |
| Activities | ✔ | Tasks, calls, meetings, logged emails, notes and replies; due buckets; complete/reopen |
| Products | ✔ | SKU, price, tax rate, category, active flag |
| Quotes | ✔ | Line items, product picker, per-line discount, order discount, tax, status workflow, print view |
| CSV export | ✔ | Accounts, contacts, leads, deals, tickets, quotes, invoices |
| CSV import | ✔ | Accounts, contacts and leads with downloadable template, preview and duplicate skipping |
| Invoices | ✔ | Line items, tax/discount, payments with partial-paid tracking, convert from quote, receivables summary |
| Calendar | ✔ | Month and agenda views of activities and expected deal closes |

## Revenue operations

| Capability | Helix | Notes |
| --- | --- | --- |
| Configurable pipelines & stages | ✔ | Multiple pipelines, default pipeline, stage probability/colour/won/lost, reordering, guarded deletion |
| Pipeline board | ✔ | Column totals, open-deal counts, drag to change stage (auto probability) |
| Deal stage stepper | ✔ | Detail page quick-move with guard rails for won/lost |
| Forecast-style reports | ✔ | Revenue trend, pipeline by stage, leaderboard, top accounts, funnel, sources |
| Quote → deal linkage | ✔ | Quotes appear on deal and account profiles |
| Custom fields | ✔ | Per entity (Account, Contact, Lead, Deal), types, options, required, ordering, active flag |

## Autonomous revenue operations

| Capability | Helix | Notes |
| --- | --- | --- |
| Explainable lead scoring | ✔ | Deterministic 0–100 score from firmographic (40), seniority (30) and completeness (30) signals; every lead stores a factor breakdown shown as “Why this score” |
| Lead auto-routing | ✔ | Leads at/above the workspace threshold are assigned to the least-loaded active rep; low scorers stay in the SDR queue; manual owner assignment always wins |
| Duplicate detection & merge | ✔ | Fuzzy account/contact matching on normalised names, domains, emails and phone tails; surfaced as reviewable pairs, merged atomically with related records relinked |
| Deal velocity guardrails | ✔ | Deals with no stage movement inside the stale window are flagged stalled, probability is penalised, health index drops and a re-engage task is created |
| SLA escalation | ✔ | Breached tickets are marked, priority is raised, escalation level increments and the assignee is notified |
| Data freshness hygiene | ✔ | Account/contact freshness scores decay over time; records past the workspace window are flagged stale |
| Autonomous settings | ✔ | Enable/disable the daemon, routing threshold, stale days, probability penalty and freshness window per workspace |
| Background daemon | ✔ | Hosted service runs SLA sweeps (5 min), routing/velocity/freshness sweeps (60 min) and duplicate scans (360 min) with per-org tenant isolation |
| Autonomous insights | ✔ | Dashboard and Settings panels summarise stalled deals, breaches, stale records, duplicates and unrouted high-score leads with deep links |

## Customer support

| Capability | Helix | Notes |
| --- | --- | --- |
| Shared ticket inbox | ✔ | Table + board, search, status/priority/channel/assignee filters |
| Conversation thread | ✔ | Chronological replies and internal notes with author and timestamp |
| Public reply vs internal note | ✔ | Public replies are queued for SMTP delivery and shown with their delivery status; internal notes stay in-app. Both are auto-logged to the global activity stream |
| Visible SLA breach & escalation state | ✔ | Server-side breach flag and escalation level are shown in the inbox and ticket detail |
| Assignment & status workflow | ✔ | Open → Pending → Resolved → Closed with timestamps |
| Ticket ↔ account/contact link | ✔ | Shown on both profiles |
| Canned responses / macros | ✔ | Categorised replies with `/shortcuts`, managed in Settings, inserted from the ticket reply box |
| Outbound email | ✔ | Per-workspace SMTP mailbox, durable outbox, retry with backoff, daily cap and suppression list, Message-ID threading; `Sent` means the server accepted the message, not a delivery receipt |
| Email ingestion | ◐ | Background IMAP polling matches replies by headers, then by the `[#TCK-…]` subject token. Unmatched mail goes to a review queue for manual linking or dismissal. Provider webhooks are roadmap |
| Quote email | ◐ | Sending a quote queues a plain-text summary and moves Draft → Sent; PDF attachment is roadmap |

## Workspace & platform

| Capability | Helix | Notes |
| --- | --- | --- |
| Auth & sessions | ✔ | Cookie JWT, Bearer support, login/logout, password change, session info |
| Sign-in protection | ✔ | Per-IP fixed-window rate limit on login plus a 5-attempt / 15-minute account lockout; failures are not written to the audit log |
| Multi-tenancy | ✔ | Row-level global filters; `Organization` lookups are explicitly scoped through `HelixDbContext.GetCurrentOrganizationAsync` |
| Roles | ✔ | Admin, Manager, Rep with endpoint-level gates |
| Team management | ✔ | Invite, role change, deactivate/reactivate, remove, avatar initials |
| Audit trail | ✔ | Created/updated/deleted with field diffs, actor and timestamp |
| Global search | ✔ | ⌘K palette across accounts, contacts, leads, deals, tickets |
| Notifications | ✔ | Inbox popover, mark one/all read |
| Dashboard | ✔ | KPIs, revenue trend, pipeline, leaderboard, tasks, recent activity, tickets, top deals |
| Settings | ✔ | Profile, team, pipelines, custom fields, autonomous engines, automations, canned responses, email mailboxes/outbox/review/suppressions, workspace branding/currency/timezone, appearance |
| Workflow automation | ◐ | Rules on lead created / deal won / ticket created / quote accepted that create a task or notify the owner; no conditions yet |
| Dark mode | ✔ | Token-driven, persisted locally |
| CSV exports | ✔ | RFC 4180 with BOM |
| API reference | ✔ | Scalar UI + OpenAPI document |
| Docker packaging | ✔ | Compose with db/api/web; health-checked database |
| Tests | ✔ | 82 unit tests plus a PostgreSQL integration suite (tenancy, duplicate merge, lead conversion, email credentials/threading/suppression/review) that runs when `HELIX_TEST_POSTGRES` is set; no browser E2E yet |

## Deliberate gaps (roadmap)

- Provider email adapters and delivery webhooks (SES/Mailgun/Brevo) with bounce/complaint events; plain SMTP/IMAP is the supported path today
- Email open/click tracking, scheduled send and sequence automation
- Lead capture endpoints, per-organisation API keys and outbound webhooks
- Quote/invoice PDF delivery, public view links, accept/decline and payment links
- File attachments on records
- Ownership-based record visibility for reps
- Email/calendar sync and sequence automation
- Conditional workflow rules and approval chains
- Document storage and e-signature
- Granular field-level permissions and sharing rules
- Bulk edit and column-mapping import wizard
- Realtime presence and live updates
- Mobile app and offline support
- Payment gateway/ERP integrations and accounting sync
- Localisation (i18n) and per-user timezone formatting
