# Reference analysis

Helix CRM deliberately borrows proven patterns rather than copying code. This document records which ideas came from which product and how they were adapted.

## Twenty

- **Borrowed:** clean record pages, dense tables with inline filters, flexible metadata, command palette, dark-first visual polish.
- **Adapted:** a single opinionated record layout per entity, SWR-based revalidation instead of GraphQL caching, custom fields stored as JSON metadata per entity. Twenty's object/field builder inspired the Settings → Custom fields tab.
- **Not copied:** GraphQL API surface, workspace member invitation emails.

## EspoCRM

- **Borrowed:** explicit entity metadata, role-based access, audit stream per record.
- **Adapted:** metadata is limited to custom fields (type, options, required, order) rather than a full dynamic entity framework; audit is written synchronously in `SaveChanges`.
- **Why:** keeps the schema stable and queries fast while still letting admins tailor forms.

## SuiteCRM / SugarCRM lineage

- **Borrowed:** complete sales coverage (accounts → contacts → leads → opportunities → quotes), lead conversion flow, pipeline stage probabilities, printable quotes.
- **Adapted:** deals replace opportunities, with a configurable pipeline object; quotes are first-class documents with server-side totals.
- **Why:** this is the backbone most sales teams expect; nothing essential is missing from the core loop.

## Frappe CRM

- **Borrowed:** kanban-first deal flow, lightweight lead board, clean forms with a narrow field set, activity timeline.
- **Adapted:** drag-and-drop status/stage changes with optimistic UI, board column value totals, and a shared activity composer.
- **Why:** fast-moving SMB teams work from boards, not settings.

## ERPNext

- **Borrowed:** product catalogue → quotation → line items → taxes/discounts, document-style detail pages.
- **Adapted:** quotes recalculate subtotal/tax/total server-side, support per-line and order-level discounts, and expose a print-friendly layout.
- **Not copied:** full accounting/stock modules; integrations are left to the roadmap.

## Dolibarr

- **Borrowed:** pragmatic breadth — companies, contacts, products, proposals, tickets, activities all in one workspace; simple role model.
- **Adapted:** a single modern shell with consistent tables and filters instead of module-specific pages.
- **Why:** users should not have to relearn navigation between modules.

## Chatwoot

- **Borrowed:** shared inbox metaphor, conversation thread, public reply vs private note, assignee/status/priority filters, SLA cues.
- **Adapted:** tickets reuse the activity model for conversation entries, so replies appear in both the ticket thread and the global activity stream. Email ingestion and multi-channel inboxes are future work.
- **Why:** support conversations and CRM history should be the same timeline.

## DeskcommCRM

- **Borrowed:** customer-support-centric ticket fields (channel, priority, tags, first response, resolution), dashboard emphasis on support health.
- **Adapted:** support metrics sit beside sales metrics on the dashboard and reports rather than in a separate product.

## Cross-cutting decisions

| Decision | Rationale |
| --- | --- |
| Modular monolith | Faster to build and operate than microservices; feature folders keep boundaries clear |
| PostgreSQL + EF Core | Mature migrations, strong JSON support for custom fields and tags, predictable SQL |
| Cookie JWT via same-origin proxy | Simple, secure default for a web app; Bearer remains available for integrations |
| Soft delete + audit | CRM data is valuable; destructive actions must be traceable |
| Server-computed totals | Prevents tampered quotes and keeps exports consistent |
| Tokenised design system | Consistent density and dark mode without a heavyweight component library |
