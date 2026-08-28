# Agent Instructions

Keep answers concise and action-focused. This repository is the shared memory for humans and Codex agents; do not rely on prior chat context being available.

## Start Here

Before changing code, read:

- `docs/PROJECT_STATE.md`
- `docs/ARCHITECTURE.md`
- The feature-specific doc for the area you are touching.

For telephony/Twilio work, also read:

- `docs/TWILIO_TELEPHONY.md`
- `docs/DEPLOYMENT_GUIDE.md`

For database/schema work, also read:

- `docs/NEON_DATABASE.md`

For git, branch or multi-developer coordination work, also read:

- `docs/GIT_WORKFLOW.md`

For marketing attribution work, also read:

- `docs/MARKETING_ATTRIBUTION.md`
- `docs/ATTRIBUTION_TRACKING.md`

## Project Facts

- Product: iD30 CRM live implementation based on the CRM boilerplate.
- Live URL: `https://crm.epc-improvements.co.uk`.
- Runtime: Netlify Next.js runtime.
- Production database: Neon Postgres.
- ORM: Prisma.
- Frontend/backend: Next.js App Router, TypeScript.
- Telephony/SMS/WhatsApp provider: Twilio.
- File storage integration: Cloudflare R2.
- Integration credentials are encrypted in `IntegrationConnection.config`.
- `CREDENTIAL_ENCRYPTION_KEY` must match the environment that saved encrypted credentials.
- Pushing to GitHub is not the same as verifying live; wait for the Netlify production deploy and confirm `/api/health`.

## Working Rules

- Do not overwrite or revert unrelated dirty files.
- Use `rg` for code search.
- Keep edits scoped to the request.
- Prefer existing components, server actions, Prisma patterns and Tail Admin styling.
- Add Prisma migrations for schema changes.
- Keep secrets out of docs, commits and command output.
- Treat Twilio actions as live/chargeable. Do not buy numbers, release numbers, send messages or place live calls unless explicitly asked.
- Avoid destructive git commands unless explicitly requested.

## Verification

Default checks before handoff:

```bash
npm run typecheck
npm run lint
```

For production-sensitive changes, also consider:

```bash
npm run env:check
npm run production:preflight
npm run db:migrate:status
```

`npm run build` is required for deployment confidence, but this local machine has previously hung in Next's "Creating an optimized production build" phase. If that still happens, report it clearly rather than pretending the build passed.

## Git Workflow

- Do not push feature work directly to `main` during multi-dev work.
- Use branch-per-task: `codex/<short-task-name>` for Codex work, `dev/<name>/<short-task-name>` for human dev work.
- Follow `docs/GIT_WORKFLOW.md` before pushing.
- Keep commits intentional and scoped.
- PR descriptions must include summary, test evidence, migrations/env changes, deployment notes and live verification required.

## Navigation Ownership

- Main sidebar lives in `src/layout/AppSidebar.tsx`.
- Generic settings nav lives in `src/components/crm-boilerplate/SettingsNav.tsx`.
- Current top-level operational groups include Marketing and Telephony.

## Deployment Reminder

Netlify expected settings:

- Install command: `npm ci`
- Build command: `npm run netlify:build`
- Node.js version: 20

After a GitHub push, verify live separately through `https://crm.epc-improvements.co.uk/api/health` and the relevant user workflow. iD30 Prospecting is the Hostinger deployment; do not apply Hostinger deployment assumptions to the CRM.
