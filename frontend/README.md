# Helix CRM — web client

Next.js 16 (App Router, React 19, Tailwind 4) front end for Helix CRM.

## Run locally

The API must be reachable at `http://localhost:5080` (or set `API_URL`).

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build (standalone output for Docker)
npm start        # serve the production build
npm run lint
```

## Structure

- `src/app/(app)/…` — authenticated workspace routes: dashboard, accounts, contacts, leads, deals, activities, tickets, products, quotes, reports, settings.
- `src/app/login` — sign-in.
- `src/proxy.ts` — cookie guard for app routes (Next 16 renamed `middleware` to `proxy`).
- `src/components/shell` — sidebar, topbar, command palette, workspace provider.
- `src/components/<feature>` — record lists, boards, dialogs and detail panels.
- `src/components/ui` — button, input, select, dialog, tabs, badge, etc.
- `src/lib/api.ts` — fetcher + typed SWR hooks; `types.ts` mirrors API DTOs; `utils.ts` holds formatting helpers.
- `src/app/globals.css` — design tokens exposed to Tailwind via `@theme inline`.

All requests use relative `/api/v1/...` paths; `next.config.ts` rewrites them to the API so the auth cookie stays first-party. See the root `README.md` and `docs/architecture.md` for the full picture.
