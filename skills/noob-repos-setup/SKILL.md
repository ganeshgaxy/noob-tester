---
name: noob-repos-setup
description: Validate, clone, sync, and index a user-provided SSH repo URL for a ticket. Runs setup-for-ticket, returns repo paths.
---

# Repos Setup

Validate and set up a user-provided repo for a ticket.

## Usage

```bash
# From orchestrator or any skill:
# /noob-repos-setup <TICKET-ID> --url <ssh-repo-url> [--branch <source-branch>]
```

## 1. Validate SSH Repo URL

The user must provide the repo URL. Validate that it is a cloneable SSH repo link matching the pattern:

```
git@<host>:<org>/<repo>.git
```

Examples of valid SSH URLs:
- `git@github.com:org/repo.git`
- `git@gitlab.com:org/repo.git`
- `git@bitbucket.org:workspace/repo.git`

If the provided URL does **not** match the SSH format → **STOP. Ask the user to provide a valid SSH clone URL (e.g. `git@github.com:org/repo.git`). Do NOT proceed.**

## 2. Setup Repos

```bash
noob-tester repos setup-for-ticket --ticket <TICKET-ID> --url <ssh-repo-url> [--branch <source-branch>]
```

This single command:
- **Discovers** — registers repo URLs in the DB, clones to `~/.noob-tester/repos/<name>/`
- **Syncs** — pulls latest. If `--branch` provided, fetches and checks out that branch
- **Indexes** — runs diff-aware codebase indexing (so `noob-tester query codebase` works)

### Branch Selection

- If MR metadata has a source branch → use `--branch <source-branch>`
- If no branch info (pre-dev analysis) → omit `--branch` (uses default branch)
- **noob-analyze** runs pre-dev — do NOT switch branches, analyze default branch

## 3. Output

After running, repos are available via:
```bash
REPO_PATH=$(noob-tester repos path <repo-name>)
# Use Glob, Grep, Read on $REPO_PATH for deep analysis
# Use noob-tester query codebase "<keyword>" --expand for indexed search
```
