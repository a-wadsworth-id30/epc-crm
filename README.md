# iD30 CRM

Live-test iD30 CRM implementation based on the iD30 CRM Boilerplate.

Use this project for client-style testing and operational integrations. Generic improvements should be ported back to `iD30 CRM Boilerplate`.

## Quick Start

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

## Default Admin

- Email: configured by `SEED_ADMIN_EMAIL`
- Password: configured by `SEED_ADMIN_PASSWORD`

Change these immediately after first login. You can override them before seeding with `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` and `SEED_ADMIN_NAME`.

## Useful Commands

```bash
npm run lint
npm run build
npm run test:pytest
npm run playwright
npm run cypress:run
npm run docs:generate
```

Install Python test requirements first:

```bash
python3 -m pip install -r requirements-dev.txt
```

## Documentation

- `AGENTS.md`
- `docs/PROJECT_STATE.md`
- `docs/ARCHITECTURE.md`
- `docs/GIT_WORKFLOW.md`
- `docs/NEON_DATABASE.md`
- `docs/TWILIO_TELEPHONY.md`
- `docs/MARKETING_ATTRIBUTION.md`
- `docs/DEVELOPER_DOCS.md`
- `docs/AI_HANDOFF.md`
- `docs/HOSTING_SETUP.md`
- `docs/USER_DOCS.md`

New developers and Codex agents should read `AGENTS.md` and
`docs/PROJECT_STATE.md` before starting work.
