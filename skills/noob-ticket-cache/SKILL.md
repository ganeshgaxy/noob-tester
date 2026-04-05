---
name: noob-ticket-cache
description: Fetch and cache all ticket context (Jira, Confluence) using cache-first pattern. Run before any skill that needs ticket data. Outputs cached context types for downstream skills.
---

# Ticket Context Cache

Fetch and cache ALL ticket context in one pass. Other skills call this first instead of fetching individually.

**Cache-first rule:** NEVER call Jira/Confluence MCP tools directly. Always check cache first, only call MCP on a miss, then save immediately.

## Usage

```bash
# From orchestrator or any skill:
# /noob-ticket-cache <TICKET-ID>
```

## 1. Cache-First Flow (for EVERY context type)

```
1. noob-tester ticket-context get <TICKET-ID> --type <type>
2. If {cached: true} → done, use returned content
3. If {cached: false} → call MCP tool → fetch data
4. noob-tester ticket-context save <TICKET-ID> --type <type> --content '<json>' --source <source>
5. Content is now available for all skills
```

## 2. Fetch All Context Types

Run these in order — later types depend on earlier ones.

### Core Ticket Data

```bash
# Ticket info
CACHED=$(noob-tester ticket-context get <TICKET-ID> --type ticket_info)
# if miss → getJiraIssue with issueKey=<TICKET-ID> → save with --source atlassian_mcp

# Remote links (MR/PR URLs)
CACHED=$(noob-tester ticket-context get <TICKET-ID> --type remote_links)
# if miss → getJiraIssueRemoteIssueLinks with issueKey=<TICKET-ID> → save with --source atlassian_mcp

# Comments (extracted from ticket_info)
CACHED=$(noob-tester ticket-context get <TICKET-ID> --type comments)
# if miss → extract comments array from ticket_info response → save with --source atlassian_mcp
```

### Hierarchy (parent → grandparent → siblings)

```bash
# Parent issue — feature area, user roles, goals
CACHED=$(noob-tester ticket-context get <TICKET-ID> --type parent_issue)
# if miss → get parent key from ticket_info (fields.parent.key) →
#   getJiraIssue with issueKey=<parent-key> → save with --source atlassian_mcp

# Grandparent issue — top-level feature context
CACHED=$(noob-tester ticket-context get <TICKET-ID> --type grandparent_issue)
# if miss → get parent key from parent_issue (fields.parent.key) →
#   getJiraIssue with issueKey=<grandparent-key> → save with --source atlassian_mcp
# NOTE: Not all tickets have grandparents — skip if parent has no parent

# Sibling tickets — other children of the same parent
CACHED=$(noob-tester ticket-context get <TICKET-ID> --type linked_tickets)
# if miss → get parent key from ticket_info →
#   getJiraIssue on parent key → extract subtasks/children from parent response
#   (fields.subtasks or fields.issuelinks) → save
# Do NOT use searchJiraIssuesUsingJql — the parent issue already contains its children.
```

### Confluence Pages (if linked)

```bash
# Check remote_links or ticket description for Confluence URLs
# Extract pageId from URL pattern: /wiki/spaces/.../pages/<pageId>/...
CACHED=$(noob-tester ticket-context get <TICKET-ID> --type confluence:<pageId>)
# if miss → getConfluencePage with pageId=<pageId> → save with --source atlassian_mcp
```

## 3. List What Was Cached

```bash
noob-tester ticket-context list <TICKET-ID>
# Returns array of {ticket_id, context_type, fetched_at, ttl_minutes, source, size_bytes}
```

## 4. Cache Management

```bash
# Force refresh a specific type (invalidate then re-fetch)
noob-tester ticket-context invalidate <TICKET-ID> --type <type>

# Invalidate everything for a ticket
noob-tester ticket-context invalidate <TICKET-ID>

# Purge all expired entries across all tickets
noob-tester ticket-context purge

# List all cached tickets with stats
noob-tester ticket-context tickets

# Ignore TTL (force read even if expired)
noob-tester ticket-context get <TICKET-ID> --type <type> --ignore-ttl
```

## 5. Output

After running, all context types are cached and available to any skill via:
```bash
noob-tester ticket-context get <TICKET-ID> --type <type>
```

Skills should still call `ticket-context get` (not read files directly) — the get command handles TTL validation and returns structured JSON.

## Context Types Reference

| Type | Source | Depends On |
|------|--------|------------|
| `ticket_info` | `getJiraIssue` | — |
| `remote_links` | `getJiraIssueRemoteIssueLinks` | — |
| `comments` | extracted from ticket_info | `ticket_info` |
| `parent_issue` | `getJiraIssue` on parent key | `ticket_info` |
| `grandparent_issue` | `getJiraIssue` on grandparent key | `parent_issue` |
| `linked_tickets` | subtasks from parent response | `ticket_info` |
| `confluence:<pageId>` | `getConfluencePage` | `remote_links` or ticket body |
