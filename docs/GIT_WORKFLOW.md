# Git Workflow

## Core Rule

Do not push feature work directly to `main`.

Use one branch per task, then merge through a pull request. This avoids Codex and human developers overwriting or racing each other's work.

## Branch Names

Use short, descriptive branches:

```text
codex/<task-name>
dev/<developer-name>/<task-name>
fix/<bug-name>
feature/<feature-name>
```

Examples:

```text
codex/twilio-routing-diagnostics
dev/alex/sales-import
fix/neon-migration-roles
```

## Starting Work

Before changing files:

```bash
git fetch origin
git checkout main
git pull --ff-only origin main
git checkout -b codex/<task-name>
```

Human developers can use `dev/<name>/<task-name>` instead of `codex/...`.

## While Working

Commit only the files related to the task.

Do not stage unrelated local files. The repo may contain local-only scratch files or work from another agent.

Before pushing:

```bash
npm run typecheck
npm run lint
git fetch origin
git rebase origin/main
```

If the rebase conflicts, resolve it deliberately. Do not use broad reset/checkout commands to make the conflict disappear.

## Pushing

Push the task branch:

```bash
git push -u origin <branch-name>
```

Open a pull request into `main`.

The PR should include:

- summary of the change;
- tests/checks run;
- migrations or environment changes;
- deployment notes;
- live verification needed after merge.

## Updating an Existing Branch

If `main` changes while the branch is open:

```bash
git fetch origin
git rebase origin/main
git push --force-with-lease
```

Use `--force-with-lease`, not plain `--force`.

## Merging

Merge only after:

- checks pass;
- migrations are understood;
- deployment impact is clear;
- no unrelated files are included.

During the current development phase, completing a job means deploying it too:
merge the PR, wait for or trigger the Netlify production deploy, then verify
`https://crm[.]epc-improvements[.]co[.]uk/api/build-version` is serving the
merged `main` short commit before handing off. If the build-version check is
still on an older commit, do not
imply the work is live; report that Netlify is still serving the previous
build.

After the project moves from dev to live production operations, this default
may change back to merge-only unless the user explicitly asks for deployment.

## Emergency Direct Pushes

Direct pushes to `main` should be limited to urgent production fixes.

If an emergency direct push is needed:

```bash
git fetch origin
git pull --ff-only origin main
npm run typecheck
npm run lint
git push origin main
```

Immediately update `docs/PROJECT_STATE.md` with the operational impact.
