# iD30 CRM Developer Docs

## Project Overview

Closed-access iD30 CRM implementation built on Tail Admin Pro from the CRM boilerplate. The app has no public signup; admins create users.

Use this project for live integration testing. Port reusable implementation decisions back to the boilerplate deliberately.

## Tech Stack

- Next.js App Router with TypeScript
- Tail Admin Pro UI template
- Prisma ORM
- PostgreSQL
- Docker Compose for local OrbStack database
- Cypress for end-to-end UI flows
- Playwright for smoke tests and documentation screenshots
- Pytest for lightweight project/service contract checks

## Local Setup With OrbStack

```bash
cp .env.example .env
docker compose up -d
npm_config_cache=.npm-cache npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open `http://localhost:3001`.

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string.
- `SESSION_COOKIE_NAME`: HTTP-only session cookie name.
- `SESSION_TTL_DAYS`: session lifetime.
- `NEXT_PUBLIC_APP_NAME`: public application name.
- `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_ADMIN_NAME`: seed admin credentials.
  Remote or production-like database seeds require explicit email/password
  values and reject the local fallback password.
- `CREDENTIAL_ENCRYPTION_KEY`: app-level encryption key used to encrypt integration
  credentials saved from Settings > Integrations and profile 2FA secrets.
  Generate with `openssl rand -base64 32`; blank values and unresolved
  placeholders fail preflight.

Change the seeded admin password immediately after first login.

## Database And Prisma

Core commands:

```bash
npm run db:generate
npm run db:migrate
npm run db:seed
npm run db:studio
```

Main models:

- `User`, `Session`, `PasswordResetToken`
- `Company`, `Contact`, `SalesOpportunity`, `Note`, `Task`
- `CrmSettings` for module-level CRM options such as Companies on/off. When Companies is on, contact forms can link existing companies or create a new linked company by name. When Companies is off, contact forms store only plain `Contact.companyName` text.
- `IntegrationConnection`, `FileAsset`, `AuditLog`

## Auth Architecture

- Login is handled by `src/lib/actions/auth.ts`.
- Passwords use bcrypt via `src/lib/password.ts`.
- Sessions are random tokens stored as SHA-256 hashes in PostgreSQL.
- Browser session tokens are stored in HTTP-only, same-site cookies.
- `src/proxy.ts` performs a lightweight protected-route cookie check.
- `src/app/(admin)/layout.tsx` performs full server-side session validation.

## Permissions Model

- `ADMIN`: full access, including user management and developer settings.
- `USER`: standard CRM access, own profile and own password only.

Admin-only checks must remain server-side with `requireAdmin()`.

## Folder Structure

- `src/app/(admin)`: authenticated CRM routes.
- `src/app/(full-width-pages)/(auth)`: login/reset auth pages.
- `src/components/crm-boilerplate`: reusable CRM UI and forms.
- `src/lib`: Prisma, auth, password helpers and server actions.
- `prisma`: schema and seed.
- `cypress/e2e`: Cypress browser flows.
- `tests`: Playwright and Pytest tests.
- `docs`: developer, AI handoff and user documentation.

## Testing Commands

```bash
npm run lint
npm run test:pytest
npm run smoke:routes
npm run test:e2e:audit
npm run playwright
npm run cypress:run
npm run docs:generate
```

`npm run smoke:routes` is the fastest authenticated route check for the
dashboard, Marketing, Sales, System, Integrations and Telephony pages. Cypress
and Playwright assume the database has been migrated and seeded.
`npm run test:e2e:audit` runs the broader authenticated route matrix described
in `docs/E2E_AUTOMATION.md`, collecting render, network, console and responsive
layout findings across the main CRM modules.

## Deployment Notes

- Use managed PostgreSQL in production.
- Set `DATABASE_URL` and session variables in the host environment.
- Run `npm run db:migrate` during deployment.
- Use HTTPS so cookies are marked secure in production.
- Password reset request emails use the saved MailerSend integration. Keep
  MailerSend connected before exposing reset-password support to users.

## Common Development Tasks

- Add a CRM module: create a Prisma model, migration, server page under `src/app/(admin)`, and reusable components under `src/components/crm-boilerplate`.
- Add an admin feature: enforce `requireAdmin()` in the server component or action.
- Add an integration: seed an `IntegrationConnection`, create a settings route, and keep credentials encrypted before production use.
- MailerSend is the email integration for sender/domain setup and inbound
  email routing. Inbound webhooks post to
  `/api/webhooks/mailersend/inbound` and are stored in `EmailMessage`.
- Geoapify powers address autocomplete for contact and company address forms.
  The browser must call the authenticated CRM proxy route; never expose the
  Geoapify API key client-side.
- Twilio is the default communications integration for voice, SMS and WhatsApp settings. Browser calling uses `@twilio/voice-sdk`, `/api/twilio/voice/token`, and `/api/webhooks/twilio/voice`.
- Add file workflows through `FileAsset` metadata plus the storage provider helper. Cloudflare R2 is the default storage provider.
- Update `docs/CODE_SPEC.md` after changing the boilerplate contract.
