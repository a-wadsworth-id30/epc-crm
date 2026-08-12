# Hosting Setup

This document is for the iD30 CRM at `https://crm.id30.com`.

The CRM deploys to Netlify. iD30 Prospecting is the Hostinger deployment; do
not use Prospecting/Hostinger settings for the CRM.

Target stack:

- GitHub: source control and CI.
- Neon: production Postgres.
- Netlify: Next.js runtime.

## 1. GitHub

Initialise and publish the repo:

```bash
git init -b main
git add .
git commit -m "Prepare CRM hosting"
gh repo create id30-crm --private --source=. --remote=origin --push
```

The included GitHub Actions workflow runs lint, typecheck, Prisma migrations
against Postgres, and a production build on every pull request and `main` push.

## 2. Neon

Create a Neon project and copy the pooled or direct Postgres connection string.
Use SSL:

```text
postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
```

Run production migrations before first launch:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require" npm run db:migrate:deploy
```

Seed the first admin once:

```bash
DATABASE_URL="postgresql://USER:PASSWORD@HOST/neondb?sslmode=require" npm run db:seed
```

Change the seeded admin password after first login.

## 3. Netlify

Create a Netlify site from the GitHub repository.

Recommended settings:

```text
Node.js version: 20
Install command: npm ci
Build command: npm run netlify:build
Healthcheck: /api/health
```

Required environment variables:

```text
DATABASE_URL=postgresql://USER:PASSWORD@HOST/neondb?sslmode=require
APP_BASE_URL=https://crm.id30.com
NEXT_PUBLIC_APP_NAME=iD30 CRM
SESSION_COOKIE_NAME=id30_crm_session
SESSION_TTL_DAYS=7
CREDENTIAL_ENCRYPTION_KEY=<openssl rand -base64 32>
```

Bootstrap-only variables:

```text
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=<strong temporary password>
SEED_ADMIN_NAME=Default Admin
```

Do not leave the bootstrap password in Netlify after seeding.

## 4. Checks

Local preflight:

```bash
npm run env:check
npm run production:preflight
npm run verify
```

Production check:

```text
https://crm.id30.com/api/health
```
