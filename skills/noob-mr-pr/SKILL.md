---
name: noob-mr-pr
description: Take a ticket ID and MR/PR link from the user, detect the provider (GitHub/Bitbucket/GitLab), and fetch MR/PR details using the appropriate CLI tool (gh/bb/glab).
---

# MR/PR Fetch

Fetch MR/PR details for a ticket using a user-provided MR/PR link.

## Usage

```bash
# /noob-mr-pr <TICKET-ID> --url <mr-or-pr-url>
```

## 1. Detect Provider from URL

Parse the user-provided MR/PR URL to determine the provider and extract identifiers:

**GitHub** — URL contains `github.com`
```
https://github.com/<owner>/<repo>/pull/<number>
```
Extract: `owner`, `repo`, `number`
CLI tool: `gh`

**GitLab** — URL contains `gitlab.com`
```
https://gitlab.com/<org>/<group>/<repo>/-/merge_requests/<iid>
```
Extract: `org/group/repo` (project path), `iid`
CLI tool: `glab`

**Bitbucket** — URL contains `bitbucket.org`
```
https://bitbucket.org/<workspace>/<repo>/pull-requests/<id>
```
Extract: `workspace`, `repo`, `id`
CLI tool: `bb`

If the URL does not match any of the above patterns → **STOP. Ask the user to provide a valid MR/PR URL. Do NOT proceed.**

## 2. Verify CLI Auth

Run the auth check for the detected provider:

```bash
# GitHub
gh auth status

# GitLab
glab auth status

# Bitbucket
bb auth status
```

If auth fails → **STOP. Tell the user to authenticate with the detected CLI tool first.**

## 3. Fetch MR/PR Details

**GitHub:**
```bash
gh pr view <number> --repo <owner>/<repo> --json number,title,state,headRefName,baseRefName,url,body,additions,deletions,files
```

**GitLab:**
```bash
glab mr view <iid> --repo <org/group/repo> --json iid,title,state,source_branch,target_branch,web_url,description,changes_count
```

**Bitbucket:**
```bash
bb pr view <id> -R <workspace>/<repo>
```

## 4. Fetch MR/PR Diff

**GitHub:**
```bash
gh pr diff <number> --repo <owner>/<repo>
```

**GitLab:**
```bash
glab mr diff <iid> --repo <org/group/repo>
```

**Bitbucket:**
```bash
bb pr diff <id> -R <workspace>/<repo> --raw
```

## 5. Cache Results

Save the fetched metadata and diff to ticket context:

```bash
# Save MR/PR metadata
noob-tester ticket-context save <TICKET-ID> --type mr_metadata --content '<json>' --source <gh|glab|bb>

# Save MR/PR diff
noob-tester ticket-context save <TICKET-ID> --type mr_diff:!<mr-or-pr-id> --content '<diff>' --source <gh|glab|bb>
```

## 6. Output

Return:
- Provider detected (`github`, `gitlab`, `bitbucket`)
- MR/PR title, state, source branch, target branch
- Diff summary (files changed, additions, deletions)
- Confirmation that results are cached under ticket context
