# Roadmap

The core CRM loop and the first generation of autonomous revenue operations are complete. These are the highest-value next steps, ordered by impact on a real revenue and support team.

## Shipped in the autonomous layer

- Explainable lead scoring with a stored factor breakdown, and least-loaded-rep auto-routing above a configurable threshold.
- Fuzzy duplicate detection for accounts and contacts with reviewable pairs and atomic merge/relink.
- Deal stagnation detection with probability penalties, health index and auto-created re-engage tasks.
- Server-side SLA breach/escalation sweeps with priority raises and assignee notifications.
- Data-freshness decay and stale flags for accounts and contacts.
- Per-workspace thresholds, a hosted background daemon and dashboard/settings insight panels.
- Outbound email through a durable SMTP outbox with retry/backoff, Message-ID threading, a daily cap and suppression checks; ticket replies and quote sends flow through it.
- Inbound IMAP polling that matches replies by headers then by the `[#TCK-…]` subject token, with an unmatched-mail review queue.

## Near term

1. **Browser E2E suite** — Playwright coverage of login, record CRUD, kanban moves, ticket replies, quote printing and duplicate merge.
2. **Bulk actions and import** — CSV import with column mapping, reuse the duplicate matcher for import-time de-duplication, and bulk owner/stage/status updates.
3. **Saved views** — per-user filters and column layouts for every list.
4. **Provider email adapters** — SES/Mailgun/Brevo transports and delivery webhooks for bounce/complaint events, plus PDF quote attachments. Plain SMTP/IMAP already ships.
5. **Calendar sync** — read/write activities through Google/Microsoft calendar APIs.
6. **Notifications that matter** — surface the events the autonomous workers already produce (stalled deal, escalation, duplicate ready, lead auto-routed) in the inbox bell and a scheduled digest.

## Mid term

7. **Workflow automation** — trigger/condition/action rules (“when a deal enters Proposal, create a task and notify the owner”), reusing the autonomous event stream.
8. **Approvals** — discount and quote approval chains with comments.
9. **Document storage** — attachments on accounts, deals, tickets and quotes, with virus scanning and signed URLs.
10. **Granular permissions** — field-level visibility, team-based sharing rules, read-only roles.
11. **Realtime updates** — SignalR/WebSocket channel for inbox and board changes, presence indicators.
12. **Localisation** — i18n framework, per-user locale and timezone, translated seed data.
13. **Enrichment integrations** — wire `EnrichmentDataJson` to a real provider (Clearbit/Apollo-style) behind a swappable adapter and a review queue.

## Longer term

14. **Customer portal** — share quotes, tickets and invoices with external users under scoped tokens.
15. **Billing & ERP sync** — invoices, payments, accounting export.
16. **Mobile** — responsive refinements plus an Expo client sharing the API contract.
17. **Data warehouse export** — scheduled snapshots or CDC into a warehouse.
18. **Marketplace** — installable apps built on webhooks + custom fields.
19. **Advanced analytics** — cohort retention, win/loss reasons, SLA compliance trends, custom report builder.

## Engineering health

- Extend unit coverage around quote maths, lead conversion and import edge cases; autonomous scoring, similarity and SLA escalation are covered today.
- Add integration tests against a disposable PostgreSQL container, especially for the duplicate merge transaction and the email pipeline (credentials, threading, suppression and review linking are covered).
- Add structured request logging, OpenTelemetry traces and a `/metrics` endpoint, including daemon sweep timings.
- Introduce an outbox pattern for webhooks (outbound email and the autonomous sweeps already run through durable background queues).
- Harden rate limiting, account lockout and audit-log retention.
