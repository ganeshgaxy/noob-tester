export function getDocsHtml(): string {
  return `
<div id="docs-header" class="panel" style="margin-bottom:0;border-radius:var(--radius) var(--radius) 0 0">
<div class="panel-title" style="margin-bottom:8px">Documentation</div>
<div style="display:flex;gap:8px;flex-wrap:wrap">
  <a href="#cli" class="tab active" onclick="document.querySelectorAll('.doc-section').forEach(s=>s.style.display='none');document.getElementById('doc-cli').style.display='block';document.querySelectorAll('#docs-header a').forEach(a=>a.classList.remove('active'));this.classList.add('active');return false">CLI Commands</a>
  <a href="#skills" class="tab" onclick="document.querySelectorAll('.doc-section').forEach(s=>s.style.display='none');document.getElementById('doc-skills').style.display='block';document.querySelectorAll('#docs-header a').forEach(a=>a.classList.remove('active'));this.classList.add('active');return false">Skills</a>
  <a href="#concepts" class="tab" onclick="document.querySelectorAll('.doc-section').forEach(s=>s.style.display='none');document.getElementById('doc-concepts').style.display='block';document.querySelectorAll('#docs-header a').forEach(a=>a.classList.remove('active'));this.classList.add('active');return false">Concepts</a>
</div>
</div>
<div id="docs-content" class="panel" style="border-radius:0 0 var(--radius) var(--radius);overflow-y:auto;flex:1;min-height:0">

<!-- CLI COMMANDS -->
<div id="doc-cli" class="doc-section">

<h2 style="margin-bottom:16px">CLI Commands</h2>

<div class="doc-cmd">
<h3>noob-tester repos</h3>
<p>Manage repositories and codebase index. Register repos by name, group them, sync to local disk, and build a searchable BM25 index with import dependency graph.</p>
<table>
<tr><td><code>repos add &lt;name&gt; &lt;url&gt;</code></td><td>Register a repository. <code>--description</code> optional.</td></tr>
<tr><td><code>repos list</code></td><td>List all registered repos with sync status. <code>--json</code> for JSON output.</td></tr>
<tr><td><code>repos delete &lt;name&gt; --yes</code></td><td>Delete a repo and its index data.</td></tr>
<tr><td><code>repos path &lt;name&gt;</code></td><td>Print local path of a synced repo. Use with Glob/Grep/Read.</td></tr>
<tr><td><code>repos group add &lt;name&gt; --repos a,b,c</code></td><td>Create a named group of repos. <code>--description</code> optional.</td></tr>
<tr><td><code>repos group list</code></td><td>List all groups and their member repos.</td></tr>
<tr><td><code>repos group delete &lt;name&gt;</code></td><td>Delete a group (repos themselves are kept).</td></tr>
<tr><td><code>repos discover --ticket &lt;id&gt;</code></td><td><strong>Find all repos for a ticket</strong> from DB (runs, test cases, UI maps) and ensure them. <code>--url</code> to add extra URLs. Uses diff-aware indexing on subsequent runs — only changed files re-indexed.</td></tr>
<tr><td><code>repos ensure &lt;urls...&gt;</code></td><td>Register + clone/pull + index. Accepts URLs or names. Uses <code>glab</code> for GitLab, <code>bb</code> for Bitbucket, <code>git clone</code> for others. All in <code>~/.noob-tester/repos/</code>.</td></tr>
<tr><td><code>repos sync &lt;name&gt;</code></td><td>Git clone or pull a repo (or group). <code>--branch &lt;branch&gt;</code> to checkout a specific branch (e.g. MR source branch). <code>--reindex</code> to auto-re-index if commit changed. Tracks branch + commit for staleness detection.</td></tr>
<tr><td><code>repos index &lt;name&gt;</code></td><td>Diff-aware re-index — only re-indexes files that changed since last indexed commit via <code>git diff</code>. Falls back to full rebuild if no prior commit. <code>--full</code> forces complete rebuild. Records branch + commit + timestamp.</td></tr>
<tr><td><code>repos search &lt;query&gt;</code></td><td>Search indexed code. <code>--expand</code> traces import graph. <code>--repos a,b</code> to filter. <code>--limit N</code>. <code>--json</code>.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester run</h3>
<p>Manage test runs. A run tracks data across all phases of a test.</p>
<table>
<tr><td><code>run resolve</code></td><td><strong>Resume or create.</strong> Reuses existing running/pending run for the same <code>--input-ref</code>. Creates new if none found. <code>--fresh</code> forces new. Required: <code>--input-type</code>, <code>--input-ref</code>. Optional: <code>--target-url</code>, <code>--capture</code>, <code>--secret-target</code>, <code>--secret-role</code>.</td></tr>
<tr><td><code>run create</code></td><td>Always create a new run (CLI only — skills should use <code>resolve</code>). Required: <code>--input-type</code>, <code>--input-ref</code>. Optional: <code>--target-url</code>, <code>--repo</code>, <code>--capture</code>, <code>--secret-target</code>, <code>--secret-role</code>.</td></tr>
<tr><td><code>run update &lt;id&gt;</code></td><td>Update phase (<code>--phase N</code>) or status (<code>--status</code>).</td></tr>
<tr><td><code>run complete &lt;id&gt;</code></td><td>Mark run completed/failed. <code>--status</code> required. <code>--summary</code> optional.</td></tr>
<tr><td><code>run get &lt;id&gt;</code></td><td>Get full run details as JSON.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester session</h3>
<p>Track active testing sessions across Claude Code instances. Sessions auto-expire after 5 minutes without heartbeat.</p>
<table>
<tr><td><code>session start</code></td><td>Register a new session. <code>--task</code> description, <code>--labels</code> (comma-separated: analyze,plan,testcase,explore,report), <code>--tickets</code> (comma-separated ticket IDs).</td></tr>
<tr><td><code>session heartbeat &lt;id&gt;</code></td><td>Keep alive. <code>--phase N</code>, <code>--run-id</code>, <code>--task</code>, <code>--labels</code>, <code>--tickets</code> (merged with existing).</td></tr>
<tr><td><code>session end &lt;id&gt;</code></td><td>Mark session completed. <code>--status</code> optional (default: completed).</td></tr>
<tr><td><code>session get &lt;id&gt;</code></td><td>Get session details as JSON.</td></tr>
<tr><td><code>session link &lt;runId&gt; &lt;sessionId&gt;</code></td><td>Link a run to a session.</td></tr>
<tr><td><code>session list</code></td><td>List all sessions. <code>--active</code> for active only. <code>--json</code>.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester testcase</h3>
<p>Generate, claim, and track test cases in BDD or traditional format. Supports multi-session claim system — different sessions execute different test cases.</p>
<table>
<tr><td><code>testcase create &lt;runId&gt;</code></td><td>Create a test case (draft by default). <code>--ready</code> to mark ready. <code>--layer</code> to set test layer (ui|api|ui_api|database|ai|unit|other, default: ui). Required: <code>--ticket</code>, <code>--type</code>, <code>--format</code>, <code>--title</code>. BDD: <code>--bdd-feature</code>, <code>--bdd-scenario</code>, <code>--bdd-given</code>, <code>--bdd-when</code>, <code>--bdd-then</code>. Traditional: <code>--trad-steps</code>, <code>--trad-expected</code>.</td></tr>
<tr><td><code>testcase mark-ready &lt;id&gt;</code></td><td>Mark a test case as ready for execution.</td></tr>
<tr><td><code>testcase mark-draft &lt;id&gt;</code></td><td>Mark a test case as draft (not executable).</td></tr>
<tr><td><code>testcase ready-all &lt;ticket&gt;</code></td><td>Mark all test cases for a ticket as ready.</td></tr>
<tr><td><code>testcase draft-all &lt;ticket&gt;</code></td><td>Mark all test cases for a ticket as draft.</td></tr>
<tr><td><code>testcase claim &lt;ticket&gt; &lt;sessionId&gt;</code></td><td>Claim next available <strong>ready</strong> test case (priority: direct→impact→regression). <code>--fresh</code> also claims completed cases.</td></tr>
<tr><td><code>testcase result &lt;id&gt;</code></td><td>Record execution result. <code>--status</code> (passed|failed|skipped|blocked), <code>--run &lt;runId&gt;</code>.</td></tr>
<tr><td><code>testcase release &lt;id&gt;</code></td><td>Release a claimed case back to pending.</td></tr>
<tr><td><code>testcase release-session &lt;sessionId&gt;</code></td><td>Release all claims by a session.</td></tr>
<tr><td><code>testcase list</code></td><td>List test cases. <code>--ticket</code> or <code>--run</code> to filter. <code>--json</code>.</td></tr>
<tr><td><code>testcase stats &lt;ticket&gt;</code></td><td>Show counts by type, status, ready/draft.</td></tr>
<tr><td><code>testcase select --repo &lt;name&gt; --diff &lt;branch&gt;</code></td><td>Select test cases affected by code changes via coverage_map + import graph. <code>--ticket</code>, <code>--depth</code>, <code>--json</code>.</td></tr>
<tr><td><code>testcase risk --ticket &lt;ref&gt;</code></td><td>Compute risk scores from failure patterns, code churn, flakiness, recency. Stored on <code>risk_score</code>. <code>--json</code>.</td></tr>
<tr><td><code>testcase audit --ticket &lt;ref&gt;</code></td><td>Full audit: duplicates (Jaccard similarity), never-failed, stale (30+ days), orphaned. <code>--duplicates</code>, <code>--never-failed</code>, <code>--orphaned</code>, <code>--stale</code>, <code>--threshold</code>, <code>--json</code>.</td></tr>
</table>
<h4>Execution Priority</h4>
<ol>
<li><strong style="color:var(--green)">direct_functional</strong> — core feature tests, executed first</li>
<li><strong style="color:var(--yellow)">impact_regression</strong> — tests for impacted dependencies, executed second</li>
<li><strong style="color:var(--accent)">general_regression</strong> — crucial flows not directly touched, executed last</li>
</ol>
<h4>Test Layers</h4>
<p>Each test case has a <code>--layer</code> that determines which runner can execute it:</p>
<table>
<tr><td><code>ui</code></td><td>Pure UI interaction — clicks, forms, navigation (default). Executable by <code>/noob-explore</code>.</td></tr>
<tr><td><code>api</code></td><td>Pure API — request/response, status codes, payloads. Not executable by <code>/noob-explore</code>.</td></tr>
<tr><td><code>ui_api</code></td><td>UI action triggers API call, verify both sides. Executable by <code>/noob-explore</code>.</td></tr>
<tr><td><code>database</code></td><td>Data persistence, queries, migrations, constraints.</td></tr>
<tr><td><code>ai</code></td><td>AI/ML features — prompts, responses, model behavior.</td></tr>
<tr><td><code>unit</code></td><td>Code-level unit test — functions, utilities, pure logic.</td></tr>
<tr><td><code>other</code></td><td>Does not fit above categories.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester secrets</h3>
<p>Manage credentials scoped to targets (environments/apps) and roles. Supports literal values, environment variables (<code>env:</code>), and 1Password (<code>op:</code>).</p>
<table>
<tr><td><code>secrets target add &lt;name&gt;</code></td><td>Register a target. <code>--url</code>, <code>--description</code>.</td></tr>
<tr><td><code>secrets target list</code></td><td>List all targets and their roles. <code>--json</code>.</td></tr>
<tr><td><code>secrets target delete &lt;name&gt; --yes</code></td><td>Delete target and all its secrets.</td></tr>
<tr><td><code>secrets set &lt;key&gt; &lt;value&gt;</code></td><td>Set a secret. <code>--target</code> required, <code>--role</code> (default: "default"). Value can be literal, <code>env:VAR_NAME</code>, or <code>op:vault/item/field</code>.</td></tr>
<tr><td><code>secrets get-profile</code></td><td>Get all resolved secrets. <code>--target</code> or <code>--url</code>, <code>--role</code>.</td></tr>
<tr><td><code>secrets delete &lt;key&gt;</code></td><td>Delete a secret. <code>--target</code>, <code>--role</code>.</td></tr>
<tr><td><code>secrets delete-role</code></td><td>Delete all secrets for a role. <code>--target</code>, <code>--role</code>.</td></tr>
<tr><td><code>secrets list</code></td><td>List all (masked). Filter: <code>--target</code>, <code>--url</code>, <code>--role</code>. <code>--json</code>.</td></tr>
<tr><td><code>secrets find &lt;search&gt;</code></td><td>Find secrets by key or value (e.g. email address).</td></tr>
<tr><td><code>secrets import-op &lt;vault/item&gt;</code></td><td>Import all fields from a 1Password item. <code>--target</code>, <code>--role</code>. <code>--live</code> stores as <code>op://</code> refs. <code>--map label=KEY</code> for custom mapping. <code>--prefix</code> to prefix keys. Vault names with slashes supported (e.g. <code>ENG/Development/MyApp</code>).</td></tr>
</table>
<h4>Value Sources</h4>
<table>
<tr><td><code>literal</code></td><td>Plain text value: <code>"admin@example.com"</code></td></tr>
<tr><td><code>env:</code></td><td>Environment variable: <code>env:MY_PASSWORD</code></td></tr>
<tr><td><code>op:</code></td><td>1Password reference: <code>op:Private/MyApp/password</code></td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester tech-issue</h3>
<p>Track technical difficulties (timeouts, crashes, env issues). Knowledge base for future agents — check before each step, apply workarounds.</p>
<table>
<tr><td><code>tech-issue log &lt;runId&gt;</code></td><td>Log a tech issue. <code>--ticket</code> (required), <code>--title</code>, <code>--description</code>, <code>--category</code> (timeout|crash|network_failure|js_error|element_not_found|auth_issue|env_issue), <code>--severity</code>, <code>--url</code>, <code>--error</code>, <code>--console</code>, <code>--recovery</code> (JSON), <code>--outcome</code> (recovered|failed|skipped).</td></tr>
<tr><td><code>tech-issue resolve &lt;id&gt;</code></td><td><code>--status</code> (workaround_found|resolved|investigating|wont_fix), <code>--workaround</code>, <code>--resolution</code>.</td></tr>
<tr><td><code>tech-issue check</code></td><td>Check known issues before a step. <code>--url</code>, <code>--ticket</code>, <code>--category</code>.</td></tr>
<tr><td><code>tech-issue list</code></td><td>List tech issues. <code>--ticket</code>, <code>--status</code>, <code>--category</code>, <code>--limit</code>.</td></tr>
</table>
<p><code>--ticket</code> is required — every tech issue is tagged to a ticket ID. Dedup is per-ticket: same problem on different tickets tracks separately.</p>
</div>

<div class="doc-cmd">
<h3>noob-tester runpack</h3>
<p>Manage run packs — execution containers for test cases. Each run pack stores target URL, credential references, capture config, and per-entry results with artifacts.</p>
<table>
<tr><td><code>runpack resolve</code></td><td><strong>Resume or create.</strong> Checks for existing packs with pending/failed entries for the ticket. Resumes if found, creates new if not. <code>--fresh</code> forces new. Required: <code>--ticket</code>, <code>--run</code>. Optional: <code>--session</code>, <code>--target-url</code>, <code>--secret-target</code>, <code>--secret-role</code>, <code>--capture</code>.</td></tr>
<tr><td><code>runpack create</code></td><td>Always create a new run pack (CLI only — skills should use <code>resolve</code>). Required: <code>--ticket</code>, <code>--run</code>. Optional: <code>--session</code>, <code>--target-url</code>, <code>--secret-target</code>, <code>--secret-role</code>, <code>--capture</code>.</td></tr>
<tr><td><code>runpack meta &lt;id&gt;</code></td><td>Get run pack metadata — target URL, credentials, capture config.</td></tr>
<tr><td><code>runpack add &lt;packId&gt; &lt;tcId&gt;</code></td><td>Add a specific test case to a pack. <code>--run</code>, <code>--session</code> optional.</td></tr>
<tr><td><code>runpack claim &lt;packId&gt; &lt;sessionId&gt;</code></td><td>Claim next pending entry already in the pack.</td></tr>
<tr><td><code>runpack claim-next &lt;packId&gt; &lt;ticketId&gt; &lt;sessionId&gt;</code></td><td>Auto-pick next test case not yet in the pack, add and claim it. Main entry point for <code>/noob-explore</code>. <code>--run</code> optional. <code>--layer</code> filters by test layer. <code>--runner</code> sets runner type (ui|api).</td></tr>
<tr><td><code>runpack populate &lt;packId&gt; &lt;ticketId&gt;</code></td><td>Bulk-add ready test cases to pack. <code>--status</code> (pending|blocked|skipped). <code>--layer</code> filters by test layer (e.g. <code>--layer api</code>). <code>--runner</code> stamps entries. <code>--reason</code>, <code>--run</code>, <code>--session</code> optional. Used by <code>/noob-api-explore</code> to add all API tests at once.</td></tr>
<tr><td><code>runpack result &lt;entryId&gt;</code></td><td>Record result. <code>--status</code> (passed|failed|skipped|blocked). Optional: <code>--results</code>, <code>--logs</code>, <code>--observations</code>, <code>--issues</code> (all JSON).</td></tr>
<tr><td><code>runpack artifact &lt;entryId&gt;</code></td><td>Attach artifact. <code>--type</code> (screenshot|snapshot|video|har|console|trace), <code>--path</code>. Optional: <code>--label</code>, <code>--step</code>, <code>--metadata</code>.</td></tr>
<tr><td><code>runpack observe &lt;entryId&gt;</code></td><td>Add observation. <code>--text</code>.</td></tr>
<tr><td><code>runpack log &lt;entryId&gt;</code></td><td>Add log entry. <code>--text</code>.</td></tr>
<tr><td><code>runpack list</code></td><td>List run packs. <code>--ticket</code> for a ticket, <code>--pack</code> for entries in a specific pack. <code>--json</code>.</td></tr>
<tr><td><code>runpack release &lt;packId&gt;</code></td><td>Release all claimed entries back to pending.</td></tr>
<tr><td><code>runpack retry</code></td><td>Reset entries for rerun. <code>--entry &lt;id&gt;</code> (one entry), <code>--name &lt;text&gt; --pack &lt;id&gt;</code> (by test case name, substring match), <code>--pack &lt;id&gt;</code> (all failed/blocked), <code>--all &lt;id&gt;</code> (everything including passed).</td></tr>
<tr><td><code>runpack delete</code></td><td><code>--pack</code> or <code>--ticket</code>, <code>--yes</code> required.</td></tr>
<tr><td><code>runpack auto-retry &lt;packId&gt;</code></td><td>Mark all failed/blocked entries for auto-retry (max 1 retry). Resets to pending, increments <code>retry_count</code>.</td></tr>
<tr><td><code>runpack classify-retry &lt;entryId&gt;</code></td><td>Classify retry result. <code>--status</code> (passed → <code>likely_false_positive</code>, failed → confidence level).</td></tr>
<tr><td><code>runpack false-positives &lt;packId&gt;</code></td><td>False positive analysis: total failed, retried, false positives, confirmed, by confidence. <code>--json</code>.</td></tr>
</table>
<h4>Capture Config</h4>
<p>The <code>--capture</code> flag controls what gets recorded per step. Types: <strong>screenshot</strong> (visual evidence), <strong>snapshot</strong> (accessibility tree), <strong>video</strong> (animation/flow recording), <strong>har</strong> (network traces), <strong>console</strong> (JS errors/warnings), <strong>trace</strong> (performance timing). Default: all types.</p>
<h4>Credential Reference</h4>
<p><code>--secret-target</code> and <code>--secret-role</code> store a reference to the secrets profile. On reruns, the same credentials are used without re-specifying.</p>
</div>

<div class="doc-cmd">
<h3>noob-tester uimap</h3>
<p>Persistent UI knowledge base — pages, selectors, navigation paths, forms, reliability tracking. Shared across targets with the same repos. Grows with every <code>/noob-explore</code> session.</p>
<table>
<tr><td><code>uimap create</code></td><td>Create a map. <code>--name</code> (required), <code>--repos</code>, <code>--targets</code>, <code>--tickets</code> (comma-separated).</td></tr>
<tr><td><code>uimap get &lt;id&gt;</code></td><td>Get map details + stats.</td></tr>
<tr><td><code>uimap list</code></td><td>List all maps with stats. <code>--json</code>.</td></tr>
<tr><td><code>uimap resolve</code></td><td>Find map by <code>--ticket</code>, <code>--repo</code>, or <code>--target</code>. Returns first match.</td></tr>
<tr><td><code>uimap update &lt;id&gt;</code></td><td>Add repos/targets/tickets: <code>--add-repos</code>, <code>--add-targets</code>, <code>--add-tickets</code>.</td></tr>
<tr><td><code>uimap page &lt;mapId&gt;</code></td><td>Record/update a page (upserts by URL). <code>--url</code>, <code>--title</code>, <code>--snapshot</code>, <code>--screenshot</code>, <code>--auth-required</code>, <code>--auth-roles</code>, <code>--code</code>, <code>--repos</code>, <code>--tickets</code>, <code>--parity</code>, <code>--run</code>, <code>--session</code>.</td></tr>
<tr><td><code>uimap pages &lt;mapId&gt;</code></td><td>List all pages. <code>--json</code>.</td></tr>
<tr><td><code>uimap element &lt;pageId&gt;</code></td><td>Record/update an element (upserts by selector). <code>--selector</code>, <code>--type</code>, <code>--role</code>, <code>--text</code>, <code>--action</code>, <code>--result</code>, <code>--code</code>, <code>--tickets</code>, <code>--auth-roles</code>, <code>--run</code>, <code>--testcase</code>.</td></tr>
<tr><td><code>uimap elements &lt;pageId&gt;</code></td><td>List elements on a page. <code>--json</code>.</td></tr>
<tr><td><code>uimap lookup</code></td><td>Lookup elements by URL. <code>--map</code>, <code>--url</code>, <code>--type</code>. Returns working selectors sorted by reliability.</td></tr>
<tr><td><code>uimap hit &lt;elementId&gt;</code></td><td>Record selector success. <code>--run</code>.</td></tr>
<tr><td><code>uimap miss &lt;elementId&gt;</code></td><td>Record selector failure. Auto-updates status (working/flaky/broken). <code>--run</code>.</td></tr>
<tr><td><code>uimap alt &lt;elementId&gt;</code></td><td>Add alternative selector. <code>--selector</code>.</td></tr>
<tr><td><code>uimap flaky &lt;mapId&gt;</code></td><td>List flaky/broken elements. <code>--json</code>.</td></tr>
<tr><td><code>uimap nav &lt;mapId&gt;</code></td><td>Record navigation. <code>--from</code>, <code>--to</code> (page IDs), <code>--via</code> (element ID), <code>--type</code>, <code>--conditions</code>.</td></tr>
<tr><td><code>uimap path</code></td><td>Find navigation path. <code>--map</code>, <code>--from</code>, <code>--to</code> (URL patterns). BFS pathfinding.</td></tr>
<tr><td><code>uimap form &lt;pageId&gt;</code></td><td>Record/update a form. <code>--selector</code>, <code>--fields</code> (JSON), <code>--submit</code>, <code>--success</code>, <code>--error</code>, <code>--sample-values</code>.</td></tr>
<tr><td><code>uimap scan &lt;pageId&gt;</code></td><td><strong>Parse accessibility snapshot and bulk-record all elements + forms.</strong> Stores stable selectors: <code>role[name="text"]</code>, <code>role[placeholder="..."]</code>, <code>role[url="..."]</code>, <code>@ref</code> fallback. Each element records its selector strategy. <code>--snapshot</code> (path). <code>--ticket</code>, <code>--run</code>, <code>--session</code> optional.</td></tr>
<tr><td><code>uimap stats &lt;mapId&gt;</code></td><td>Show map statistics.</td></tr>
<tr><td><code>uimap delete &lt;id&gt; --yes</code></td><td>Delete map and all its data.</td></tr>
</table>
<h4>Key Concepts</h4>
<ul>
<li><strong>Map = App, not target</strong> — defined by repos. Multiple targets (staging, prod) share the same map.</li>
<li><strong>Fetchable by ticket, repo, or target</strong> — <code>resolve</code> finds the right map automatically.</li>
<li><strong>Stable selectors</strong> — <code>scan</code> stores elements by role+text (<code>button[name="Sign In"]</code>), role+placeholder, role+url, with <code>@ref</code> as ephemeral fallback. Each element records its selector strategy type.</li>
<li><strong>Upserts everywhere</strong> — pages upsert by URL, elements by selector. Safe to call repeatedly.</li>
<li><strong>Reliability tracking</strong> — <code>hit</code>/<code>miss</code> auto-computes working/flaky/broken status.</li>
<li><strong>Target parity</strong> — <code>--parity</code> tracks what exists on which target.</li>
<li><strong>Audit trail</strong> — every page/element/nav/form tracks created_by and updated_by (run, ticket, session).</li>
</ul>
</div>

<div class="doc-cmd">
<h3>noob-tester capture</h3>
<p>Store per-action artifacts — snapshots, console logs, HAR, screenshots, network errors. Linked to run, runpack entry, page URL, and action number. Stored in <code>run_artifacts</code> table.</p>
<table>
<tr><td><code>capture store</code></td><td>Store an artifact. <code>--run</code> (required), <code>--type</code> (snapshot|screenshot|console|har|video|trace|network_error|api_request). <code>--file</code> or <code>--content</code>. Optional: <code>--pack</code>, <code>--entry</code>, <code>--session</code>, <code>--ticket</code>, <code>--action</code> (step number), <code>--desc</code>, <code>--url</code> (page URL).</td></tr>
<tr><td><code>capture list</code></td><td>List artifacts. <code>--run</code> or <code>--entry</code>. <code>--type</code> to filter. <code>--json</code>.</td></tr>
<tr><td><code>capture stats --run &lt;id&gt;</code></td><td>Show artifact counts by type for a run.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester log</h3>
<p>Record actions, issues, and raw outputs during testing.</p>
<table>
<tr><td><code>log action &lt;runId&gt;</code></td><td>Log an action. <code>--phase</code> (1-4), <code>--agent</code> (analyst|planner|automator|reporter), <code>--description</code>. <code>--details</code> optional.</td></tr>
<tr><td><code>log issue &lt;runId&gt;</code></td><td>Record an issue. <code>--category</code> (ui|accessibility|network|console|visual|layout|content|functional|performance), <code>--severity</code> (critical|high|medium|low|info), <code>--title</code>, <code>--description</code>. Optional: <code>--location</code>, <code>--screenshot</code>, <code>--video</code>, <code>--console-log</code>, <code>--network-data</code>, <code>--step-id</code>, <code>--raw-output</code>.</td></tr>
<tr><td><code>log output &lt;runId&gt;</code></td><td>Save raw output. <code>--source</code> (tool name), <code>--type</code> (screenshot|video|har|console|accessibility_tree|text). <code>--content</code> or <code>--file-path</code>. <code>--metadata</code> JSON.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester query</h3>
<p>Query stored data. All commands support <code>--ticket &lt;TICKET-ID&gt;</code> (finds latest run) or <code>--run &lt;runId&gt;</code> (specific run). Ticket-based lookup means any skill can reuse data from any other skill.</p>
<table>
<tr><td><code>query runs --ticket &lt;ref&gt;</code></td><td>List all runs for a ticket.</td></tr>
<tr><td><code>query issues --ticket &lt;ref&gt;</code></td><td>All issues across all runs for a ticket.</td></tr>
<tr><td><code>query issues --run &lt;id&gt;</code></td><td>Issues for a specific run. Also: <code>--location</code>, <code>--category</code>, <code>--severity</code>, <code>--limit</code>.</td></tr>
<tr><td><code>query failures</code></td><td>Known failure patterns across all runs. <code>--limit</code>.</td></tr>
<tr><td><code>query analysis --ticket &lt;ref&gt;</code></td><td>All analyses for a ticket (latest run).</td></tr>
<tr><td><code>query analysis --ticket &lt;ref&gt; --type &lt;type&gt;</code></td><td>Specific analysis: gap, requirements, feasibility, or impact.</td></tr>
<tr><td><code>query plan --ticket &lt;ref&gt;</code></td><td>Test plan for a ticket.</td></tr>
<tr><td><code>query steps --ticket &lt;ref&gt;</code></td><td>Test steps for a ticket.</td></tr>
<tr><td><code>query codebase &lt;search&gt;</code></td><td>BM25 search + import graph. <code>--expand</code>, <code>--repos</code>, <code>--limit</code>.</td></tr>
<tr><td><code>query repos --ticket &lt;ref&gt;</code></td><td>Repo URLs for a ticket.</td></tr>
<tr><td><code>query context --ticket &lt;ref&gt;</code></td><td>Full prior context dump (analysis + plan + issues + failures).</td></tr>
</table>
<h4>Data Reuse Flow</h4>
<p>All data links through the ticket ref. Skills automatically find each other's data:</p>
<ol>
<li><code>/noob-analyze</code> stores analysis → <code>/noob-testcase</code> reads it via <code>query analysis --ticket</code></li>
<li><code>/noob-testcase</code> stores test cases with layers → <code>/noob-explore</code> claims <code>ui</code>/<code>ui_api</code> one at a time, <code>/noob-api-explore</code> populates all <code>api</code> tests and runs them in one shot</li>
<li><code>/noob-explore</code> and <code>/noob-api-explore</code> share the same run pack. Different execution models: explore = one per invocation, api-explore = all in one invocation</li>
<li><code>/noob-report</code> reads everything via <code>query issues --ticket</code> and <code>runpack list --ticket</code></li>
</ol>
</div>

<div class="doc-cmd">
<h3>noob-tester save</h3>
<p>Store analysis results and test plans.</p>
<table>
<tr><td><code>save analysis &lt;runId&gt;</code></td><td><code>--type</code> (gap|requirements|feasibility|impact), <code>--content</code> (JSON), <code>--confidence</code> (0-1), <code>--summary</code>.</td></tr>
<tr><td><code>save plan &lt;runId&gt;</code></td><td>Save a structured plan. <code>--ticket</code>, <code>--plan</code> (JSON with all sections: strategy, requirements, testNotes, blockers, coverageGaps, mrRefs, targetUrl, etc.).</td></tr>
<tr><td><code>save step &lt;planId&gt;</code></td><td>Add a step. <code>--run</code>, <code>--order</code>, <code>--description</code>, <code>--confidence</code>. Optional: <code>--category</code>, <code>--priority</code>, <code>--testcase</code> (linked TC), <code>--mr</code> (linked MR), <code>--uimap-page</code>, <code>--page-url</code>, <code>--source</code>.</td></tr>
<tr><td><code>save delete-plan</code></td><td>Delete a plan and its steps. <code>--id &lt;planId&gt;</code> or <code>--ticket &lt;id&gt;</code> (all plans for ticket). <code>--yes</code> required.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester metrics</h3>
<p>Track and query usage metrics — duration, estimated tokens, tool calls.</p>
<table>
<tr><td><code>metrics log &lt;sessionId&gt;</code></td><td>Log metrics. <code>--duration</code> (ms), <code>--tokens</code>, <code>--tools</code>, <code>--actions</code>, <code>--issues</code>. Values are additive.</td></tr>
<tr><td><code>metrics get &lt;sessionId&gt;</code></td><td>Get metrics for a session.</td></tr>
<tr><td><code>metrics run &lt;runId&gt;</code></td><td>Get metrics for a run (aggregated from action_log).</td></tr>
<tr><td><code>metrics summary</code></td><td>Aggregate metrics across all sessions. <code>--active</code> for active only. <code>--json</code>.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester watch</h3>
<p>Live web dashboard at localhost. Updates via SSE every 2 seconds.</p>
<table>
<tr><td><code>watch</code></td><td>Open at http://localhost:4040.</td></tr>
<tr><td><code>watch --port &lt;n&gt;</code></td><td>Custom port.</td></tr>
<tr><td><code>watch --session &lt;id&gt;</code></td><td>Focus on a single session.</td></tr>
</table>
<p>Left sidebar navigation. Breadcrumb navigation on detail pages. Split views with independent scroll.</p>
<p>Pages: Dashboard (sessions grouped by ticket → detail with sessions + issues), Issues (sortable table by severity/category, click for full detail modal), Analyses, Explore (run packs with per-action artifacts — both UI and API test results), Test Cases (with layer badges: UI, API, UI_API, etc.), Plans (with Test Notes tab), Repos, UI Maps (force-directed canvas), Metrics, Secrets, Docs.</p>
<p>Issue detail modal: severity, description, screenshot, console, HAR, per-action artifacts from <code>run_artifacts</code>, related run/test case/analyses/tech issues, UI map sitemap canvas with affected page highlighted.</p>
</div>

<div class="doc-cmd">
<h3>noob-tester coverage</h3>
<p>Code-level coverage mapping — link test cases to source files via <code>impacted_files</code> + import graph expansion. Find which source files have no test coverage.</p>
<table>
<tr><td><code>coverage build &lt;repoName&gt;</code></td><td>Build coverage map from test case <code>impacted_files</code> + 1-level import graph expansion.</td></tr>
<tr><td><code>coverage stats &lt;repoName&gt;</code></td><td>Show coverage statistics (total/covered/uncovered files, %). <code>--json</code>.</td></tr>
<tr><td><code>coverage uncovered &lt;repoName&gt;</code></td><td>List files with no test case coverage, sorted by importer count. <code>--limit</code>, <code>--json</code>.</td></tr>
<tr><td><code>coverage file &lt;repoName&gt; &lt;filePath&gt;</code></td><td>Show which test cases cover a specific file (with link type and confidence). <code>--json</code>.</td></tr>
<tr><td><code>coverage clear &lt;repoName&gt;</code></td><td>Clear coverage map for a repo (rebuild with <code>coverage build</code>).</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester rca</h3>
<p>Root cause analysis — classify failures from completed run packs. Used by <code>/noob-rca</code> skill or standalone.</p>
<table>
<tr><td><code>rca save</code></td><td>Save an RCA result. <code>--pack</code>, <code>--entry</code>, <code>--testcase</code>, <code>--classification</code>, <code>--confidence</code>, <code>--cause</code> required. Optional: <code>--evidence</code>, <code>--pattern</code>, <code>--action</code>.</td></tr>
<tr><td><code>rca list --pack &lt;id&gt;</code></td><td>List RCA results for a run pack (joined with test case details). <code>--json</code>.</td></tr>
<tr><td><code>rca summary --pack &lt;id&gt;</code></td><td>Summary counts by classification and suggested action.</td></tr>
<tr><td><code>rca get &lt;entryId&gt;</code></td><td>Get RCA result for a specific run pack entry.</td></tr>
<tr><td><code>rca clear --pack &lt;id&gt;</code></td><td>Clear all RCA results for re-analysis.</td></tr>
</table>
<h4>Classifications</h4>
<table>
<tr><td><code>actual_bug</code></td><td>Real application defect — wrong behavior, unexpected error</td></tr>
<tr><td><code>env_issue</code></td><td>Environment problem — missing config, service down, wrong URL</td></tr>
<tr><td><code>flaky_selector</code></td><td>UI element exists but selector didn't match — timing, renamed</td></tr>
<tr><td><code>test_data_issue</code></td><td>Stale or invalid test data — expired tokens, "user not found"</td></tr>
<tr><td><code>network</code></td><td>Network/connectivity — timeout, DNS, CORS, connection refused</td></tr>
<tr><td><code>auth_issue</code></td><td>Authentication — login failed, session expired, 401/403</td></tr>
<tr><td><code>timeout</code></td><td>Operation timed out — page load, API, element wait</td></tr>
<tr><td><code>unknown</code></td><td>Insufficient evidence to classify</td></tr>
</table>
<h4>Suggested Actions</h4>
<p><code>retry</code> (transient), <code>fix_test</code> (test is wrong), <code>fix_app</code> (actual bug), <code>fix_env</code> (env needs fixing), <code>investigate</code> (needs manual review), <code>skip</code> (known issue).</p>
</div>

<div class="doc-cmd">
<h3>noob-tester a11y</h3>
<p>Accessibility testing — store and query axe-core WCAG audit results. Automatically populated by <code>/noob-explore</code> on every page load.</p>
<table>
<tr><td><code>a11y scan &lt;runId&gt;</code></td><td>Store axe-core violations JSON. <code>--url</code>, <code>--results</code> (JSON array). Optional: <code>--pack</code>, <code>--entry</code>, <code>--page-id</code>.</td></tr>
<tr><td><code>a11y add &lt;runId&gt;</code></td><td>Store a single a11y issue. <code>--url</code>, <code>--rule</code>, <code>--impact</code> (critical|serious|moderate|minor), <code>--description</code>. Optional: <code>--wcag</code>, <code>--level</code>, <code>--selector</code>, <code>--html</code>, <code>--help-url</code>.</td></tr>
<tr><td><code>a11y list</code></td><td>List a11y issues. Filter: <code>--run</code>, <code>--pack</code>, or <code>--page</code>. <code>--json</code>.</td></tr>
<tr><td><code>a11y summary &lt;runId&gt;</code></td><td>Summary by impact level and rule, with page count. <code>--json</code>.</td></tr>
</table>
<h4>Impact Mapping (from axe-core)</h4>
<table>
<tr><td><strong style="color:var(--red)">critical</strong></td><td>No keyboard access, missing form labels, broken ARIA</td></tr>
<tr><td><strong style="color:var(--yellow)">serious</strong></td><td>Color contrast, missing alt text, missing landmarks</td></tr>
<tr><td><strong style="color:var(--accent)">moderate</strong></td><td>Redundant ARIA, tab order issues</td></tr>
<tr><td><strong style="color:var(--dim)">minor</strong></td><td>Best practice violations</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester testcase select / risk</h3>
<p>Test selection by code changes and risk-based prioritization.</p>
<table>
<tr><td><code>testcase select --repo &lt;name&gt; --diff &lt;branch&gt;</code></td><td>Select test cases affected by changed files via coverage_map + import graph. <code>--ticket</code> to scope. <code>--depth</code> for deeper expansion. <code>--json</code>.</td></tr>
<tr><td><code>testcase risk --ticket &lt;ref&gt;</code></td><td>Compute risk scores from failure patterns (30%), code churn (25%), flakiness (20%), recency (15%), historical failures (10%). Stored on <code>test_cases.risk_score</code>. <code>--json</code>.</td></tr>
<tr><td><code>testcase audit --ticket &lt;ref&gt;</code></td><td>Full audit: duplicates (Jaccard similarity), never-failed, stale (30+ days). <code>--duplicates</code>, <code>--never-failed</code>, <code>--orphaned</code>, <code>--stale</code>, <code>--threshold</code>, <code>--json</code>.</td></tr>
</table>
<h4>Risk-based Claim</h4>
<p>Use <code>runpack claim-next ... --risk</code> to claim highest-risk test cases first instead of priority order.</p>
</div>

<div class="doc-cmd">
<h3>noob-tester runpack auto-retry / false-positives</h3>
<p>Auto-retry failed entries to distinguish real failures from transient issues.</p>
<table>
<tr><td><code>runpack auto-retry &lt;packId&gt;</code></td><td>Mark all failed/blocked entries for retry (max 1 retry per entry). Sets status back to pending, increments retry_count.</td></tr>
<tr><td><code>runpack classify-retry &lt;entryId&gt; --status &lt;s&gt;</code></td><td>Classify retry result. If passed → <code>likely_false_positive</code>. If failed → cross-references known patterns for confidence (high/medium/low).</td></tr>
<tr><td><code>runpack false-positives &lt;packId&gt;</code></td><td>Show false positive analysis: total failed, retried, false positives, confirmed failures, breakdown by confidence. <code>--json</code>.</td></tr>
</table>
<h4>Confidence Levels</h4>
<table>
<tr><td><strong style="color:var(--yellow)">likely_false_positive</strong></td><td>Passed on retry — transient failure</td></tr>
<tr><td><strong style="color:var(--green)">low</strong></td><td>Matches known issue or resolved tech issue</td></tr>
<tr><td><strong style="color:var(--dim)">medium</strong></td><td>Matches recurring failure pattern</td></tr>
<tr><td><strong style="color:var(--red)">high</strong></td><td>No matches, first occurrence — likely real failure</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester visual</h3>
<p>Visual regression testing — compare screenshots against baselines per page/viewport. SHA-256 hash for quick matching, Claude vision for detailed diff analysis.</p>
<table>
<tr><td><code>visual baseline</code></td><td>Set baseline. <code>--page</code>, <code>--url</code>, <code>--screenshot</code> required. <code>--viewport</code> (default: 1280x720), <code>--run</code>, <code>--entry</code>.</td></tr>
<tr><td><code>visual compare</code></td><td>Compare screenshot against baseline (hash check). <code>--page</code>, <code>--screenshot</code> required. Returns <code>{ hasBaseline, hashMatch, baselinePath, baselineId }</code>.</td></tr>
<tr><td><code>visual diff-save</code></td><td>Save diff result after vision analysis. <code>--baseline</code>, <code>--run</code>, <code>--current</code> required. <code>--score</code>, <code>--description</code>, <code>--regression</code>, <code>--entry</code>.</td></tr>
<tr><td><code>visual list</code></td><td>List diffs. <code>--run</code>, <code>--unreviewed</code>. <code>--json</code>.</td></tr>
<tr><td><code>visual accept &lt;diffId&gt;</code></td><td>Accept current screenshot as new baseline (not a regression).</td></tr>
<tr><td><code>visual review &lt;diffId&gt;</code></td><td>Mark reviewed: <code>--regression</code> or <code>--ok</code>.</td></tr>
<tr><td><code>visual stats</code></td><td>Baselines, diffs, regressions, reviewed/unreviewed. <code>--run</code>, <code>--json</code>.</td></tr>
</table>
<h4>Workflow</h4>
<ol>
<li><strong>First run</strong>: no baseline exists → <code>visual baseline</code> stores the screenshot as the reference</li>
<li><strong>Subsequent runs</strong>: <code>visual compare</code> checks hash → if different, Claude reads both images → <code>visual diff-save</code> records the analysis</li>
<li><strong>Review</strong>: <code>visual list --unreviewed</code> shows pending diffs → <code>visual review --regression</code> or <code>visual accept</code> (promotes to new baseline)</li>
</ol>
</div>


<div class="doc-cmd">
<h3>noob-tester cleanup</h3>
<p>Clean up data and processes. All destructive commands require <code>--yes</code>.</p>
<table>
<tr><td><code>cleanup watch</code></td><td>Kill dashboard process. <code>--port</code> to specify.</td></tr>
<tr><td><code>cleanup stale --yes</code></td><td>Delete only stale/crashed sessions and their runs — safe to run while active sessions are live.</td></tr>
<tr><td><code>cleanup session &lt;id&gt; --yes</code></td><td>Delete a specific session and all its data.</td></tr>
<tr><td><code>cleanup all --yes</code></td><td>Delete runs, sessions, analyses, test cases, issues, visual data, agent runs, ticket workflow, Datadog cache. <strong>Keeps</strong> secrets, repos, index, page configs.</td></tr>
<tr><td><code>cleanup testcases --yes</code></td><td>Delete test cases. <code>--ticket</code>, <code>--run</code>, <code>--status</code> to filter.</td></tr>
<tr><td><code>cleanup runpacks --yes</code></td><td>Delete run pack entries. <code>--ticket</code>, <code>--pack</code> to filter.</td></tr>
<tr><td><code>cleanup tech-issues --yes</code></td><td>Delete tech issues. <code>--ticket</code>, <code>--status</code> to filter.</td></tr>
<tr><td><code>cleanup secrets --yes</code></td><td>Delete all secrets and targets.</td></tr>
<tr><td><code>cleanup repos --yes</code></td><td>Delete all repos, groups, codebase index (including embeddings), and synced files. <code>--name &lt;repo&gt;</code> for a specific repo.</td></tr>
<tr><td><code>cleanup nuke --yes</code></td><td><strong>Full reset</strong> — deletes everything including secrets, repos, index, synced files.</td></tr>
</table>
<h4>Dashboard cleanup buttons (Settings → Workspaces)</h4>
<p>Each button maps to the same operations above. Additional dashboard-only actions: <strong>Visual Data</strong> (visual runs, comparisons, screenshots, baselines), <strong>Agent Runs</strong> (agent_runs, pool_spawns, execution history), <strong>Ticket Workflow</strong> (ticket_workflow, polling history), <strong>Evidence Files</strong> (deletes evidence directory from disk).</p>
</div>

<div class="doc-cmd">
<h3>noob-tester apimap</h3>
<p>API Maps — register endpoints, parameters, responses, and dependency chains. Track endpoint health across runs. Visualized as a force-directed graph in the dashboard.</p>
<table>
<tr><td><code>apimap resolve &lt;name&gt;</code></td><td>Find or create an API map. <code>--base-url</code>, <code>--tickets</code>, <code>--repos</code>.</td></tr>
<tr><td><code>apimap endpoint &lt;mapId&gt;</code></td><td>Register or update an endpoint. <code>--method</code>, <code>--path</code>, <code>--summary</code>, <code>--auth-type</code>, <code>--auth-roles</code>, <code>--run</code>, <code>--ticket</code>.</td></tr>
<tr><td><code>apimap call &lt;endpointId&gt;</code></td><td>Record an endpoint call. <code>--status</code> (HTTP code), <code>--time</code> (ms), <code>--run</code>. Auto-updates success rate, avg response time, and health status.</td></tr>
<tr><td><code>apimap param &lt;endpointId&gt;</code></td><td>Add a parameter. <code>--name</code>, <code>--in</code> (path/query/body/header), <code>--type</code>, <code>--required</code>, <code>--map</code>.</td></tr>
<tr><td><code>apimap response &lt;endpointId&gt;</code></td><td>Register expected response. <code>--status</code>, <code>--description</code>, <code>--schema</code>, <code>--example</code>, <code>--map</code>.</td></tr>
<tr><td><code>apimap chain &lt;mapId&gt;</code></td><td>Add a dependency chain. <code>--from</code>, <code>--to</code>, <code>--type</code> (depends/creates/reads/updates/deletes/cleanup).</td></tr>
<tr><td><code>apimap lookup &lt;mapId&gt;</code></td><td>Find endpoint by method + path. <code>--method</code>, <code>--path</code>.</td></tr>
<tr><td><code>apimap list</code></td><td>List all API maps.</td></tr>
<tr><td><code>apimap get &lt;name&gt;</code></td><td>Full map data (endpoints, params, responses, chains).</td></tr>
<tr><td><code>apimap stats &lt;name&gt;</code></td><td>Map statistics (total, active, flaky, failing, avg response time).</td></tr>
</table>
<h4>Endpoint Health</h4>
<p>Each <code>apimap call</code> updates the endpoint's health automatically:</p>
<ul>
<li><strong style="color:var(--green)">active</strong> — no failures or low failure rate</li>
<li><strong style="color:var(--yellow)">flaky</strong> — intermittent failures (some succeed, some fail)</li>
<li><strong style="color:var(--red)">failing</strong> — consistently failing (3+ consecutive failures)</li>
</ul>
</div>

<div class="doc-cmd">
<h3>noob-tester ticket-context</h3>
<p>Cache ticket info, MR diffs, and linked data to avoid redundant fetches across skills. Uses hybrid storage: SQLite index + filesystem content in <code>~/.noob-tester/ticket-context/</code>.</p>
<table>
<tr><td><code>ticket-context save &lt;ticket&gt;</code></td><td>Save content to cache. <code>--type</code> (ticket_info, remote_links, comments, parent_issue, grandparent_issue, linked_tickets, mr_metadata, mr_diff:&lt;ref&gt;, confluence:&lt;id&gt;), <code>--content</code>, <code>--ttl &lt;minutes&gt;</code> (default: 1440 / 24h), <code>--source</code>.</td></tr>
<tr><td><code>ticket-context get &lt;ticket&gt;</code></td><td>Get cached content. <code>--type</code> (exact match or prefix). Returns <code>{cached: true/false, content}</code>. <code>--ignore-ttl</code> to return stale data.</td></tr>
<tr><td><code>ticket-context invalidate &lt;ticket&gt;</code></td><td>Delete cached entries. <code>--type</code> for specific type or prefix (e.g. <code>mr_diff</code> deletes all diffs). Omit <code>--type</code> to clear all for ticket.</td></tr>
<tr><td><code>ticket-context list &lt;ticket&gt;</code></td><td>List all cached entries for a ticket (index only).</td></tr>
<tr><td><code>ticket-context tickets</code></td><td>List all tickets with cached context.</td></tr>
<tr><td><code>ticket-context purge</code></td><td>Remove all stale entries past their TTL.</td></tr>
</table>
<h4>Context Types &amp; Default TTLs</h4>
<table>
<tr><td><code>ticket_info</code></td><td>Title, description, AC, status — from <code>getJiraIssue</code> — 24h</td></tr>
<tr><td><code>remote_links</code></td><td>MRs, Confluence pages, external links — from <code>getJiraIssueRemoteIssueLinks</code> — 24h</td></tr>
<tr><td><code>comments</code></td><td>All ticket comments (separate from ticket_info) — 24h</td></tr>
<tr><td><code>parent_issue</code></td><td>Parent epic/story context — from <code>getJiraIssue</code> on parent key — 24h</td></tr>
<tr><td><code>grandparent_issue</code></td><td>Grandparent (parent's parent) context — from <code>getJiraIssue</code> on parent's parent key — 24h. Provides top-level feature context (e.g. "New Course Creation" vs "Edit Course").</td></tr>
<tr><td><code>linked_tickets</code></td><td>Subtasks, blockers, related issues — from issuelinks field — 24h</td></tr>
<tr><td><code>mr_metadata</code></td><td>List of MR/PR refs (repo, branch, ID, provider) — parsed from remote_links — 24h</td></tr>
<tr><td><code>mr_diff:!&lt;id&gt;</code></td><td>Full diff for one MR/PR — from glab/bb — 24h</td></tr>
<tr><td><code>confluence:&lt;id&gt;</code></td><td>Confluence page content — from <code>getConfluencePage</code> — 24h</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester report / history / status / setup</h3>
<table>
<tr><td><code>report --ticket &lt;id&gt;</code></td><td><strong>Comprehensive ticket report</strong> — analyses, plans, test cases, run packs (UI + API results), issues, UI maps, tech issues. <code>--json</code> for structured output.</td></tr>
<tr><td><code>report --run &lt;runId&gt;</code></td><td>Legacy single-run report (issues only).</td></tr>
<tr><td><code>history</code></td><td>List past runs. <code>--json</code>, <code>--limit</code>.</td></tr>
<tr><td><code>status &lt;runId&gt;</code></td><td>Show run details. <code>--json</code>.</td></tr>
<tr><td><code>setup</code></td><td>Full setup check — core CLIs, skills, symlinks, 1Password, MCP, DB. <code>--provider gitlab|bitbucket|both</code> (default: both). Shows exact fix commands for anything missing.</td></tr>
</table>
<h4>Chain Commands (Composite Operations)</h4>
<p>Replace multi-step bash sequences with single commands. Eliminate jq parsing and reduce agent errors.</p>
<table>
<tr><td><code>init --ticket &lt;id&gt;</code></td><td>Create session + run + runpack in one command. <code>--target-url</code>, <code>--labels</code>, <code>--secret-target</code>, <code>--secret-role</code>, <code>--capture</code>, <code>--fresh</code>. Returns <code>{sessionId, runId, runPackId, evidenceDir}</code>.</td></tr>
<tr><td><code>finish --run &lt;id&gt; --session &lt;id&gt;</code></td><td>Complete run + end session. <code>--status</code> (default: completed), <code>--summary</code>.</td></tr>
<tr><td><code>capture-page --run &lt;id&gt; --url &lt;url&gt; --action &lt;n&gt;</code></td><td>Capture snapshot + screenshot + console + HAR, register all artifacts in DB, optionally record in UI map. <code>--pack</code>, <code>--entry</code>, <code>--map</code>, <code>--page-name</code>.</td></tr>
<tr><td><code>claim-smart --pack &lt;id&gt; --ticket &lt;id&gt; --session &lt;id&gt;</code></td><td>Smart claim: retry failed → resume pending → claim new → or report done. <code>--layer</code>, <code>--risk</code>.</td></tr>
<tr><td><code>auth-resolve --pack &lt;id&gt;</code></td><td>Resolve credentials from pack metadata + 1Password/env/literal. Returns <code>{email, password, apiToken, otpSecret}</code>. Also: <code>--target</code>, <code>--role</code>.</td></tr>
<tr><td><code>repos setup-for-ticket --ticket &lt;id&gt;</code></td><td>Discover + sync + index all repos. <code>--url</code> for extra URLs, <code>--branch</code> to switch.</td></tr>
<tr><td><code>api-request --method &lt;M&gt; --url &lt;url&gt;</code></td><td>Execute HTTP request, validate, store artifact, log result. <code>--body</code>, <code>--auth</code>, <code>--expect</code>, <code>--run</code>, <code>--entry</code>.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester auth</h3>
<p>Authenticate with AntTest cloud for data synchronization. Supports API token and interactive email/password login.</p>
<table>
<tr><td><code>login</code></td><td>Authenticate with AntTest. <code>--token &lt;token&gt;</code> for API token login. <code>--url &lt;url&gt;</code> to set server URL (default: https://anttest.app). Without <code>--token</code>, prompts for email/password interactively.</td></tr>
<tr><td><code>logout</code></td><td>Log out from AntTest. Deactivates the current auth session.</td></tr>
<tr><td><code>whoami</code></td><td>Show current login status — user email, organization, server URL, auth method, and login time.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester settings</h3>
<p>Manage application settings (key-value store). Also configurable via Settings → General in the dashboard.</p>
<table>
<tr><td><code>settings set &lt;key&gt; &lt;value&gt;</code></td><td>Set a setting. Validates <code>repo_provider</code> against: bitbucket, gitlab, github.</td></tr>
<tr><td><code>settings get &lt;key&gt;</code></td><td>Get a setting value.</td></tr>
<tr><td><code>settings list</code></td><td>List all settings. <code>--json</code> for JSON output.</td></tr>
<tr><td><code>settings delete &lt;key&gt;</code></td><td>Delete a setting.</td></tr>
</table>
<h4>Known settings keys</h4>
<table>
<tr><td><code>repo_provider</code></td><td>Git provider for ticket MR/PR lookups. Values: <code>github</code>, <code>gitlab</code>, <code>bitbucket</code>.</td></tr>
<tr><td><code>ai_provider</code></td><td>AI provider for agent execution. Currently only <code>claude</code> is supported. Configurable via Settings → General.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester page-config</h3>
<p>Set the default Claude agent and auto-run behaviour for each dashboard page. Also configurable via Settings → General → Default Agents per Page.</p>
<table>
<tr><td><code>page-config set &lt;page&gt; --agent &lt;name&gt;</code></td><td>Set default agent for a page. <code>--auto-run</code> to trigger the agent automatically on page load. <code>--json</code>.</td></tr>
<tr><td><code>page-config get &lt;page&gt;</code></td><td>Show config for a page. <code>--json</code>.</td></tr>
<tr><td><code>page-config list</code></td><td>List all configured pages. <code>--json</code>.</td></tr>
<tr><td><code>page-config clear &lt;page&gt;</code></td><td>Remove config for a page. <code>--json</code>.</td></tr>
</table>
<h4>Valid pages</h4>
<table>
<tr><td><code>explore</code></td><td>Browser-based UI test execution page</td></tr>
<tr><td><code>plan</code></td><td>Test planning &amp; strategy page</td></tr>
<tr><td><code>pool</code></td><td>Parallel agent pool execution page</td></tr>
<tr><td><code>analyze</code></td><td>Ticket analysis &amp; gap detection page</td></tr>
<tr><td><code>visual</code></td><td>Visual regression testing page</td></tr>
<tr><td><code>testcases</code></td><td>Test case generation page</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester sync</h3>
<p>Sync local data to AntTest cloud. Pushes the latest run data (runs, plans, analyses, issues, test cases, run pack entries) for a ticket. Requires authentication via <code>login</code>.</p>
<table>
<tr><td><code>sync push --ticket &lt;ref&gt;</code></td><td>Push latest local data to AntTest. <code>--feature &lt;id&gt;</code> to target a specific feature (auto-creates if omitted). <code>--force</code> to skip confirmation. <code>--dry-run</code> to preview. <code>--json</code>.</td></tr>
<tr><td><code>sync status --ticket &lt;ref&gt;</code></td><td>Show what would be synced — counts of runs, plans, analyses, issues, test cases, test steps, and run pack entries. <code>--json</code>.</td></tr>
</table>
</div>

<div class="doc-cmd">
<h3>noob-tester ticket-workflow</h3>
<p>Manage the lifecycle of tickets in the QA pool. One row per ticket tracks status, current phase, progress, and links to all related data (runs, analyses, plans, issues, test cases, visual test cases, blockers). The <strong>Tickets</strong> page in the dashboard reads from this table.</p>
<table>
<tr><td><code>ticket-workflow add &lt;ticket-id&gt;</code></td><td>Register a ticket (status: <code>new</code>). Idempotent — safe to call multiple times. <code>--notes &lt;text&gt;</code> optional. <code>--status</code> to set a different initial status. <code>--json</code>.</td></tr>
<tr><td><code>ticket-workflow get &lt;ticket-id&gt;</code></td><td>Full workflow summary: status, phase, progress, timestamps, plus live counts for runs, analyses, plans, issues, test cases, visual test cases, and blockers. <code>--json</code>.</td></tr>
<tr><td><code>ticket-workflow list</code></td><td>List all tracked tickets. <code>--status &lt;status&gt;</code> to filter. <code>--active</code> for actively running only. <code>--json</code>.</td></tr>
<tr><td><code>ticket-workflow transition &lt;ticket-id&gt; --status &lt;status&gt;</code></td><td>Move to a new status. Optional <code>--phase &lt;phase&gt;</code>. Auto-sets <code>started_at</code> on first run, <code>completed_at</code> on terminal states. <code>--json</code>.</td></tr>
<tr><td><code>ticket-workflow update &lt;ticket-id&gt;</code></td><td>Update <code>--notes</code>, <code>--progress &lt;0-100&gt;</code>, or <code>--metadata &lt;json&gt;</code>. <code>--json</code>.</td></tr>
<tr><td><code>ticket-workflow remove &lt;ticket-id&gt;</code></td><td>Remove a ticket from workflow tracking.</td></tr>
</table>
<p><strong>Statuses:</strong> <code>new</code> → <code>queued</code> → <code>running</code> → <code>completed</code> / <code>failed</code> / <code>cancelled</code>. Can also be <code>paused</code> at any point.</p>
<p><strong>Phases:</strong> <code>analyze</code> → <code>plan</code> → <code>test</code> → <code>review</code> → <code>done</code>.</p>
</div>

</div>

<!-- SKILLS -->
<div id="doc-skills" class="doc-section" style="display:none">

<h2 style="margin-bottom:16px">Skills</h2>

<p style="color:var(--dim);margin-bottom:16px">Each skill works <strong>standalone</strong> or as part of a pipeline. Every skill MUST start by creating a session and run.</p>
<p style="color:var(--dim);margin-bottom:16px"><strong>Full pipeline:</strong> <code>/noob-workflow</code> (register ticket) → <code>/noob-ticket-cache</code> → <code>/noob-repos-setup</code> → <code>/noob-analyze</code> → <code>/noob-testcase</code> → <code>/noob-plan</code> → <code>/noob-claim</code> → <code>/noob-explore</code> + <code>/noob-api-explore</code> (with a11y + risk ordering) → <code>/noob-rca</code> (classify failures + detect false positives) → <code>/noob-report</code></p>

<div class="doc-cmd">
<h3 style="color:var(--green)">/noob-workflow</h3>
<p>Register a ticket ID into the workflow tracking system. Run this <strong>first</strong> — before any other skill — to create the canonical lifecycle record for a ticket. Idempotent: safe to call again if the ticket already exists.</p>
<h4>What it does</h4>
<ol>
<li>Checks if the ticket already exists in <code>ticket_workflow</code></li>
<li>If new: calls <code>noob-tester ticket-workflow add &lt;TICKET-ID&gt;</code> (status: <code>new</code>)</li>
<li>Calls <code>noob-tester ticket-workflow get &lt;TICKET-ID&gt;</code> and returns the full summary</li>
</ol>
<h4>Output</h4>
<p>Returns the full workflow summary JSON — current status, linked data counts (runs, analyses, plans, test cases, issues, blockers). Downstream skills use this to know where to pick up.</p>
<h4>Status lifecycle</h4>
<p><code>new</code> (just added) → <code>queued</code> (scheduled for processing) → <code>running</code> (active, with phase) → <code>completed</code> / <code>failed</code> / <code>cancelled</code>. Orchestrators and the polling agent drive status transitions via <code>ticket-workflow transition</code>.</p>
</div>

<div class="doc-cmd">
<h3 style="color:var(--accent)">/noob-tester</h3>
<p>Main orchestrator. Routes to the right skill based on what the user asks. Use for full QA test cycles or when unsure which skill to use.</p>
<h4>Workflow</h4>
<ol>
<li>Start session with <code>--labels</code> and <code>--tickets</code></li>
<li>Check active sessions, repos, credentials</li>
<li>Create a run (with <code>--reuse-run</code> to skip analysis)</li>
<li>Run whichever skills are needed</li>
<li>Complete run and end session</li>
</ol>
</div>

<div class="doc-cmd">
<h3 style="color:var(--yellow)">/noob-analyze</h3>
<p>Deep analysis: understand the task, analyze the codebase, produce gap/requirements/feasibility/impact analysis.</p>
<h4>What it does</h4>
<ol>
<li>Reads the task from the ticket (via Atlassian MCP), Confluence, text, or file</li>
<li>Finds repos: from <code>--repo</code> flags, MR links, Confluence, context</li>
<li>Syncs repos, switches to MR source branch, diff-aware re-indexes changed files</li>
<li>Searches codebase for each requirement (<code>query codebase --expand</code>)</li>
<li>Produces 4 analyses:
  <ul>
    <li><strong style="color:var(--yellow)">Gap</strong> — known facts, unknowns, assumptions, blockers</li>
    <li><strong style="color:var(--accent)">Requirements</strong> — explicit, implicit, missing, ambiguous</li>
    <li><strong style="color:var(--green)">Feasibility</strong> — testable? blockers? risks? approach?</li>
    <li><strong style="color:var(--red)">Impact</strong> — impacted areas, dependency risks, config concerns, compatibility issues, infrastructure, hidden edge cases, test gaps, regression risks</li>
  </ul>
</li>
<li>Stops the run if no repo and no target URL found</li>
</ol>
</div>

<div class="doc-cmd">
<h3 style="color:var(--purple)">/noob-testcase</h3>
<p>Generate comprehensive BDD and traditional test cases from tickets with deep codebase analysis.</p>
<h4>Test Case Types (execution priority)</h4>
<ol>
<li><strong style="color:var(--green)">direct_functional</strong> — core feature tests</li>
<li><strong style="color:var(--yellow)">impact_regression</strong> — impacted dependency tests</li>
<li><strong style="color:var(--accent)">general_regression</strong> — crucial app flows not directly touched</li>
</ol>
<h4>What it does</h4>
<ol>
<li>Reads ticket (including epic children, linked MRs)</li>
<li>Finds and indexes repos</li>
<li>Deep codebase analysis: traces full call chains (UI→API→service→DB)</li>
<li>Writes test cases for each requirement — happy path, negative, edge cases</li>
<li>Tags each test case with a <strong>test layer</strong> (ui, api, ui_api, database, ai, unit, other) to determine which runner can execute it</li>
<li>Stores in DB with execution tracking</li>
<li>Reusable by <code>/noob-explore</code> via the claim system (<code>ui</code> and <code>ui_api</code> layers only)</li>
</ol>
</div>

<div class="doc-cmd">
<h3 style="color:var(--accent)">/noob-plan</h3>
<p>Test planning for dev-complete tickets. Runs AFTER dev is done — reads what was actually built, not what was planned.</p>
<h4>What it does</h4>
<ol>
<li>Fetches ticket + linked MRs/PRs — reads the actual code diff</li>
<li>Syncs repos, switches to MR branch, diff-aware re-indexes — searches codebase for changed areas + dependencies</li>
<li>Reads prior context — analysis, existing test cases, UI map, known failures, tech issues</li>
<li>Checks deployed target — verifies accessibility and credentials</li>
<li>Creates ordered test steps: direct changes → impact → regression → edge cases</li>
<li>Classifies each step as confident/uncertain, categorized by type</li>
<li>Generates <strong>Test Notes</strong> — concise plain-text summary with Testing Focus, Priority (P1/P2/P3), and Risk Areas</li>
<li>Identifies coverage gaps between test cases and actual implementation</li>
</ol>
<h4>When to use</h4>
<p><code>/noob-analyze</code> runs early (ticket created). <code>/noob-plan</code> runs late (dev complete, ready for QA). <code>/noob-testcase</code> generates test cases. <code>/noob-explore</code> executes them.</p>
</div>

<div class="doc-cmd">
<h3 style="color:var(--green)">/noob-explore</h3>
<p>Browser automation — execute test cases, follow plans, or explore freely. Uses <strong>run packs</strong> for execution tracking, <strong>UI maps</strong> as a persistent knowledge base, <strong>axe-core</strong> for accessibility audits, <strong>visual regression checks</strong> against baselines, and <strong>risk-based ordering</strong> (<code>--risk</code> flag) on every page.</p>
<h4>Three Modes</h4>
<ol>
<li><strong>From test cases</strong> — resumes or creates a run pack, claims and executes <strong>ONE test case per invocation</strong> via <code>runpack claim</code> (resume) or <code>runpack claim-next</code> (fresh). Only claims <code>ui</code> and <code>ui_api</code> layer tests. Invoke repeatedly for all cases.</li>
<li><strong>From a test plan</strong> — follows steps from <code>/noob-plan</code></li>
<li><strong>Exploration</strong> — no plan or cases, uses dogfood for systematic QA</li>
</ol>
<h4>Resume-First Logic</h4>
<p>Default: checks for existing run packs with pending/failed entries for the ticket. If found, resumes that pack (releases stale claims, picks up where it left off). If nothing to resume, creates a new pack. User can force fresh with "rerun" or "fresh run".</p>
<h4>Run Pack Setup</h4>
<p>Creates a run pack with: <code>--target-url</code>, <code>--secret-target</code>/<code>--secret-role</code> (credential reference), <code>--capture</code> (screenshot, snapshot, video, har, console, trace). All config is stored in the pack for reruns.</p>
<h4>UI Map Learner</h4>
<p>Before execution: resolves or creates a UI map (<code>uimap resolve</code>). Reads known pages, selectors, navigation paths, flaky elements. During execution: 2 commands per page — <code>uimap page</code> + <code>uimap scan</code> (parses accessibility snapshot, bulk-records all elements and auto-detects forms). Tracks selector reliability via <code>hit</code>/<code>miss</code>.</p>
<h4>Deep Inspection</h4>
<p>Checks for: network issues, console errors/warnings, UI bugs, accessibility problems, visual regressions, functional failures, performance issues. Every issue is categorized, rated by severity, and stored with artifacts per run pack entry.</p>
<h4>Failure Recovery — UI Map Stale Check</h4>
<p>When an action fails: first checks if UI map data was used. If yes, retries from a fresh snapshot (ignoring UI map). If fresh retry works → updates UI map with new data, records <code>miss</code>. If still fails → standard recovery (wait, refresh, retry). If all fails → logs tech issue, blocks entry, ends session.</p>
<h4>Tech Issue Auto-Resolution</h4>
<p>Before each step: pulls ALL tech issues for that URL (including resolved — old issues can come back). After a step succeeds: checks if any unresolved/workaround tech issues match what just worked, and auto-resolves them. Match by URL + action + error description.</p>
<h4>Fresh Browser + Login</h4>
<p>Every invocation starts a fresh browser (no persistent cookies). Login happens every time using run pack <code>secret_target</code> credentials. If login fails → records blocker, leaves run open for retry.</p>
</div>

<div class="doc-cmd">
<h3 style="color:var(--orange, #d2992a)">/noob-api-explore</h3>
<p>API test execution — runs <strong>ALL <code>api</code> layer test cases in one invocation</strong> using <code>curl</code>/<code>jq</code>. Reads codebase once, authenticates per role, loops through every test, cleans up per test.</p>
<h4>How it works</h4>
<ol>
<li>Reads ticket + syncs repos (switches to MR branch, diff-aware re-index) + deep codebase analysis (ONCE — not per test)</li>
<li>Creates session + run, resolves run pack</li>
<li>Bulk-adds all <code>api</code> layer test cases via <code>runpack populate --layer api --runner api</code></li>
<li>Groups test cases by required auth role (from preconditions), authenticates once per role</li>
<li>Loops through every test case: translates steps to <code>curl</code> using codebase knowledge, executes, validates, records result, cleans up created resources</li>
<li>Completes the run when all tests are done</li>
</ol>
<h4>What it validates</h4>
<ul>
<li><strong>Functional</strong> — status codes, response structure, data persistence (CRUD lifecycle)</li>
<li><strong>Security</strong> — auth required (401), permission denied (403), input validation (400), no data leaks</li>
<li><strong>Performance</strong> — response time (&gt; 3s flagged), payload size, pagination</li>
<li><strong>Edge cases</strong> — empty body, invalid JSON, missing fields, boundary values, duplicates, not found</li>
</ul>
<h4>Key difference from /noob-explore</h4>
<p><code>/noob-explore</code>: one UI test per invocation (heavy — browser, screenshots, UI map). <code>/noob-api-explore</code>: all API tests in one invocation (lightweight — just curl). <code>ui_api</code> layer belongs to <code>/noob-explore</code> (needs browser). Both share the same run pack.</p>
</div>

<div class="doc-cmd">
<h3 style="color:var(--red)">/noob-rca</h3>
<p>Root cause analysis — analyze failed test entries after execution completes. Classifies each failure, links to known patterns, suggests next actions.</p>
<h4>When to use</h4>
<ul>
<li>After <code>/noob-explore</code> or <code>/noob-api-explore</code> finishes with failures</li>
<li>User asks "why did tests fail?" or "analyze failures"</li>
<li>Automatically triggered in full pipeline before <code>/noob-report</code></li>
</ul>
<h4>What it does</h4>
<ol>
<li>Gets all failed/blocked entries from the run pack</li>
<li>For each failure: reads artifacts (screenshots, console, HAR), checks known failure patterns, checks tech issues</li>
<li>Classifies: actual_bug, env_issue, flaky_selector, test_data_issue, network, auth_issue, timeout, unknown</li>
<li>Assigns confidence (0.0–1.0) and suggested action (retry, fix_test, fix_app, fix_env, investigate, skip)</li>
<li>Updates failure_patterns with classifications</li>
<li>Produces summary: N actual bugs, N env issues, N flaky — which failures matter and which are noise</li>
</ol>
</div>


<div class="doc-cmd">
<h3 style="color:var(--dim)">/noob-report</h3>
<p>Generate comprehensive test report for a ticket. Pulls ALL data — analyses, plans, test cases, UI/API execution results, issues, UI maps, tech issues, <strong>RCA classifications</strong>, <strong>accessibility audit</strong> — and produces a structured report with verdict.</p>
<h4>What it does</h4>
<ol>
<li>Runs <code>noob-tester report --ticket &lt;ID&gt; --json</code> to gather all data in one command</li>
<li>Checks for RCA results — if missing, triggers <code>/noob-rca</code> first. Gathers a11y data and false positive stats</li>
<li>Analyzes: issues by severity, test case results by type/layer/runner, coverage gaps, plan blockers, UI map health, tech issues, RCA classifications, a11y violations, false positives</li>
<li>Determines verdict using <strong>confirmed failures</strong> (excludes false positives): PASS / FAIL / PARTIAL</li>
<li>Writes structured report: verdict, test notes, issues, execution results (UI + API), RCA breakdown, accessibility report, coverage assessment, impact analysis, UI map health, false positive analysis, recommendations</li>
<li>Updates ticket with summary comment (via Atlassian MCP)</li>
<li>Posts to Slack if requested</li>
</ol>
</div>

<div class="doc-cmd">
<h3 style="color:var(--yellow)">/noob-ticket-cache</h3>
<p>Fetch and cache ALL ticket context (Jira, Confluence, MR/PR diffs) in one pass using a cache-first pattern. Run before any skill that needs ticket data — prevents redundant API calls across skills.</p>
<h4>What it does</h4>
<ol>
<li>For each context type: checks cache first (<code>ticket-context get</code>), on miss calls MCP tool, saves immediately (<code>ticket-context save</code>)</li>
<li>Fetches in order: ticket_info → remote_links → comments → parent_issue → grandparent_issue → linked_tickets → mr_metadata → mr_diff per MR → confluence pages</li>
<li>All content is available for downstream skills via <code>ticket-context get</code></li>
</ol>
<h4>Rule</h4>
<p><strong>NEVER call Jira/Confluence MCP tools directly.</strong> Always check cache first, only call MCP on a miss, then save immediately.</p>
</div>

<div class="doc-cmd">
<h3 style="color:var(--accent)">/noob-mr-pr</h3>
<p>Fetch MR/PR details for a ticket. Auto-detects provider (GitHub/GitLab/Bitbucket) from the URL and uses the appropriate CLI tool (<code>gh</code>/<code>glab</code>/<code>bb</code>).</p>
<h4>What it does</h4>
<ol>
<li>Parses the MR/PR URL to detect provider and extract identifiers (owner, repo, number/IID)</li>
<li>Fetches MR/PR metadata and diff using the provider-specific CLI</li>
<li>Returns structured MR/PR details for downstream skills</li>
</ol>
</div>

<div class="doc-cmd">
<h3 style="color:var(--green)">/noob-repos-setup</h3>
<p>Validate and set up a user-provided SSH repo URL for a ticket. Wraps <code>repos setup-for-ticket</code> — discovers, clones, syncs, and indexes the repo in one pass.</p>
<h4>What it does</h4>
<ol>
<li>Validates the SSH repo URL format (<code>git@host:org/repo.git</code>) — stops if invalid</li>
<li>Runs <code>noob-tester repos setup-for-ticket --ticket &lt;ID&gt; --url &lt;url&gt;</code></li>
<li>Returns repo paths for downstream skills to use with Glob/Grep/Read</li>
</ol>
</div>

<div class="doc-cmd">
<h3 style="color:var(--purple)">/noob-claim</h3>
<p>Claim test cases from run packs for execution. Three modes: claim next, claim by name, and retry.</p>
<h4>Modes</h4>
<ol>
<li><strong>Claim next</strong> — uses <code>claim-smart</code> to pick the next unclaimed test case (priority: retry failed → resume pending → claim new)</li>
<li><strong>Claim by name</strong> — claims a specific test case by title (substring match with validation)</li>
<li><strong>Retry</strong> — retries a specific failed/blocked test case</li>
</ol>
<h4>Output</h4>
<p>Returns <code>$ENTRY</code> JSON with the claimed test case (id, title, format, test_case_id, status). Pass to <code>/noob-explore</code> for execution.</p>
</div>

</div>

<!-- CONCEPTS -->
<div id="doc-concepts" class="doc-section" style="display:none">

<h2 style="margin-bottom:16px">Concepts</h2>

<div class="doc-cmd">
<h3>Architecture</h3>
<pre style="color:var(--dim);font-size:12px">noob-tester CLI    →  Data layer (SQLite DB, BM25 index, secrets)
       +
Skills (SKILL.md)  →  Teach Claude Code how to orchestrate QA
       =
Claude Code        →  Does the actual work using your session & credits</pre>
<p>The CLI is a data tool. Claude Code is the intelligence. Skills are the instructions.</p>
</div>

<div class="doc-cmd">
<h3>Codebase Intelligence</h3>
<p><strong>BM25 Search</strong> — full-text search with Porter stemming over all indexed files. Finds code by keyword relevance.</p>
<p><strong>Import Graph</strong> — extracts import/require statements from JS/TS/Python/Go/Java/Ruby/PHP. When search finds a file, <code>--expand</code> traces everything it imports and everything that imports it.</p>
<p>Together they provide: "find this code" + "find everything connected to it".</p>
<p><strong>Branch + Staleness Tracking</strong> — every sync and index records the git branch + commit hash. <code>repos list</code> shows staleness status. <code>repos sync --branch feature/X --reindex</code> switches to an MR branch and auto-re-indexes only changed files.</p>
<p><strong>Diff-Aware Indexing</strong> — <code>repos index</code> uses <code>git diff --name-status &lt;last_commit&gt; HEAD</code> to find exactly which files were added, modified, or deleted. Only those files are re-indexed. Everything else stays untouched. Falls back to full rebuild if the prior commit is unreachable (force push, rebase). Use <code>--full</code> to force a complete rebuild.</p>
</div>

<div class="doc-cmd">
<h3>Session Management</h3>
<p>Every Claude Code instance registers a session. Sessions have labels (what it's doing) and ticket refs (what tickets it's working on). Heartbeats keep sessions alive — 5 minutes without heartbeat = stale.</p>
<p>Multiple sessions run in parallel, sharing the same DB. The test case claim system prevents duplicates.</p>
</div>

<div class="doc-cmd">
<h3>Collective Memory & Data Reuse</h3>
<ul>
<li><strong>Ticket-based lookup</strong> — all data links through ticket refs. Any skill can query any other skill's data via <code>--ticket PROJ-123</code></li>
<li><strong>Failure patterns</strong> — tracked across all runs, surfaced to new sessions</li>
<li><strong>Test cases</strong> — persist and are reusable via the claim system. Each tagged with a <strong>test layer</strong> (ui, api, ui_api, database, ai, unit, other) for runner-specific filtering</li>
<li><strong>Analyses</strong> — reusable by ticket ref or via <code>--reuse-run</code></li>
<li><strong>Codebase index</strong> — persists, no need to re-index unless code changes</li>
<li><strong>UI Maps</strong> — persistent knowledge base of app pages, selectors, navigation paths, forms. Grows with every <code>/noob-explore</code> session. Shared across targets with same repos. Tracks selector reliability (working/flaky/broken) and target parity.</li>
<li><strong>API Maps</strong> — persistent registry of API endpoints, parameters, response schemas, and dependency chains. Grows with every <code>/noob-api-explore</code> session. Tracks endpoint health (active/flaky/failing), average response time, and call counts. Visualized as a force-directed graph in the dashboard.</li>
<li><strong>Run Packs</strong> — execution containers with target URL, credential references, and capture config. Results, artifacts, logs per test case entry.</li>
<li><strong>Ticket Context Cache</strong> — caches ticket info, MR/PR diffs, comments, and linked tickets across skills via <code>ticket-context</code> commands. First skill fetches from Atlassian MCP / glab / bb, saves to cache. Subsequent skills check cache first, skip redundant fetches. Each entry has a TTL (default: 24 hours for all types). Stored as files in <code>~/.noob-tester/ticket-context/</code> with a SQLite index.</li>
<li><strong>Ticket Workflow</strong> — one row per ticket tracks the full lifecycle: status (<code>new → queued → running → completed/failed</code>), current phase (<code>analyze → plan → test → review → done</code>), progress %, and active flag. Linked to runs, sessions, and all data tables. Register tickets with <code>/noob-workflow</code> or via the Tickets page in the dashboard. The polling agent (when ready) will auto-populate this table.</li>
<li><strong>Blockers</strong> — normalized from test plans into a dedicated table. Queryable across tickets, resolvable with resolution notes.</li>
<li><strong>Coverage Map</strong> — links test cases to source files via <code>impacted_files</code> + import graph expansion. Shows which files have no test coverage. Built with <code>coverage build</code>, queried with <code>coverage stats/uncovered/file</code>.</li>
<li><strong>RCA Results</strong> — root cause analysis classifications stored per failed run pack entry. Classifications (actual_bug, env_issue, flaky_selector, etc.) with confidence scores and suggested actions. Used by <code>/noob-report</code> to separate real bugs from noise.</li>
<li><strong>Accessibility Issues</strong> — axe-core WCAG audit results captured on every page load during <code>/noob-explore</code>. Stored per page with rule_id, impact, WCAG criteria, and HTML snippets. Queried with <code>a11y list/summary</code>.</li>
<li><strong>Visual Baselines &amp; Diffs</strong> — per-page/viewport screenshot baselines stored with SHA-256 hashes. On subsequent runs, hash comparison detects changes instantly. Claude vision describes differences. Diffs go through a review workflow (accept as new baseline or flag as regression).</li>
</ul>
<p><strong>Flow:</strong> <code>/noob-workflow</code> (register ticket, status: new) → <code>/noob-analyze</code> (Phase 1: analysis, status: running/analyze) → <code>/noob-plan</code> (Phase 2: planning, status: running/plan) → <code>/noob-testcase</code> (Phase 3: test case generation, status: running/test) → <code>/noob-explore</code> + <code>/noob-api-explore</code> (Phase 4: execution + a11y audit) → <code>/noob-rca</code> (Phase 4.5: failure classification) → <code>/noob-report</code> (Phase 5: reporting, status: completed/failed). Each reads the previous skill's data by ticket ref. Both runners share the same run pack. Ticket info and MR diffs are cached after the first skill fetches them.</p>
</div>

<div class="doc-cmd">
<h3>Parallel Testing</h3>
<pre style="color:var(--dim);font-size:12px">claude "test login using PROJ-123" &amp;
claude "test signup using PROJ-456" &amp;
noob-tester watch</pre>
<p>Each session claims different test cases. Watch dashboard shows all sessions live.</p>
</div>

<div class="doc-cmd">
<h3>Secrets Flow</h3>
<pre style="color:var(--dim);font-size:12px">Target (staging) → Role (admin) → Keys (LOGIN_EMAIL, LOGIN_PASSWORD, API_TOKEN)
                  → Role (user)  → Keys (LOGIN_EMAIL, LOGIN_PASSWORD)
                  → Role (api)   → Keys (API_TOKEN, WEBHOOK_SECRET)

Target (prod)    → Role (admin) → Keys (...)</pre>
<p>Values can be literal, from env vars (<code>env:</code>), or from 1Password (<code>op:</code>). Import all fields from a 1Password item at once with <code>import-op</code>.</p>
</div>

</div>

<style>
.doc-cmd { margin-bottom:16px; padding:16px; background:var(--surface-raised); border-radius:var(--radius-sm); }
.doc-cmd h3 { font-size:14px; font-weight:500; margin-bottom:8px; color:var(--text); }
.doc-cmd h4 { font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:0.4px; margin:14px 0 6px; font-weight:500; }
.doc-cmd p { font-size:13px; color:var(--dim); margin-bottom:8px; line-height:1.6; }
.doc-cmd table { width:100%; font-size:13px; border-collapse:collapse; }
.doc-cmd td { padding:8px 10px; vertical-align:top; }
.doc-cmd tr:hover { background:var(--border); border-radius:var(--radius-xs); }
.doc-cmd td:first-child { white-space:nowrap; color:var(--text); font-family:var(--font-mono); min-width:250px; font-size:12px; }
.doc-cmd td:last-child { color:var(--dim); }
.doc-cmd code { background:var(--surface); color:var(--text); padding:2px 6px; border-radius:3px; font-size:11.5px; font-family:var(--font-mono); }
.doc-cmd pre { background:var(--surface); padding:12px; border-radius:var(--radius-sm); margin:8px 0; overflow-x:auto; font-family:var(--font-mono); font-size:12px; color:var(--dim); }
.doc-cmd ul, .doc-cmd ol { font-size:13px; color:var(--dim); padding-left:20px; line-height:1.6; }
.doc-cmd li { margin-bottom:4px; }
.doc-section h2 { font-size:16px; font-weight:600; margin-bottom:16px; color:var(--text); }
</style>
</div>`;
}
