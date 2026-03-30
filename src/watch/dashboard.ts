import { getWireframeScript } from "./wireframe.js";
import { getCanvasRendererScript } from "./canvas-renderer.js";
import { getApiCanvasRendererScript } from "./api-canvas-renderer.js";

export function getDashboardHtml(port: number, filterSessionId?: string): string {
  const wireframeScript = getWireframeScript();
  const apiCanvasScript = getApiCanvasRendererScript();
  const canvasScript = getCanvasRendererScript();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>noob-watch${filterSessionId ? ` — ${filterSessionId.slice(0, 8)}` : ""}</title>
<style>
  :root {
    --bg: #0d1117; --surface: #161b22; --border: #30363d;
    --text: #e6edf3; --dim: #7d8590; --accent: #58a6ff;
    --green: #3fb950; --yellow: #d29922; --red: #f85149;
    --orange: #db6d28; --purple: #bc8cff;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; }
  body { font-family: -apple-system, 'Segoe UI', monospace; background: var(--bg); color: var(--text); }
  .layout { display: flex; height: 100vh; }

  .sidebar { width: 160px; flex-shrink: 0; background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; padding: 0; }
  .sidebar-logo { padding: 16px 14px 12px; border-bottom: 1px solid var(--border); }
  .sidebar-logo h1 { font-size: 15px; color: var(--accent); font-weight: 700; }
  .sidebar-logo .live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); display: inline-block; margin-right: 5px; animation: pulse 2s infinite; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

  .sidebar-nav { flex: 1; padding: 8px 0; overflow-y: auto; }
  .nav-btn { display: block; width: 100%; text-align: left; padding: 6px 14px; font-size: 12px; cursor: pointer; background: none; border: none; border-left: 3px solid transparent; color: var(--dim); transition: all 0.12s; }
  .nav-btn:hover { color: var(--text); background: rgba(88,166,255,0.05); }
  .nav-btn.active { color: var(--accent); border-left-color: var(--accent); background: rgba(88,166,255,0.08); font-weight: 600; }
  .md-content h1 { font-size:16px; color:var(--accent); margin:16px 0 8px; font-weight:700; }
  .md-content h2 { font-size:14px; color:var(--accent); margin:14px 0 6px; font-weight:700; }
  .md-content h3 { font-size:13px; color:var(--text); margin:12px 0 4px; font-weight:700; }
  .md-content h4 { font-size:12px; color:var(--dim); margin:10px 0 4px; font-weight:600; text-transform:uppercase; }
  .md-content p { margin:6px 0; }
  .md-content ul, .md-content ol { padding-left:20px; margin:6px 0; }
  .md-content li { margin:2px 0; }
  .md-content code { background:rgba(88,166,255,0.1); color:var(--accent); padding:1px 4px; border-radius:3px; font-size:11px; }
  .md-content pre { background:var(--bg); padding:10px; border-radius:6px; font-size:11px; overflow-x:auto; margin:8px 0; }
  .md-content pre code { background:none; padding:0; font-size:11px; }
  .md-content strong { color:var(--text); }
  .md-content hr { border:none; border-top:1px solid var(--border); margin:12px 0; }
  .md-content table { width:100%; font-size:12px; border-collapse:collapse; margin:8px 0; }
  .md-content th, .md-content td { padding:6px 8px; border-bottom:1px solid var(--border); text-align:left; }
  .md-content th { color:var(--dim); font-size:11px; text-transform:uppercase; }
  .md-content blockquote { border-left:3px solid var(--accent); padding-left:12px; margin:8px 0; color:var(--dim); }
  .md-content a { color:var(--accent); }

  .nav-group-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--dim); padding: 14px 14px 5px; font-weight: 600; opacity: 0.45; border-top: 1px solid var(--border); margin-top: 4px; }

  .sidebar-stats { padding: 12px 14px; border-top: 1px solid var(--border); }
  .sidebar-stats .stat { display: flex; justify-content: space-between; align-items: center; padding: 3px 0; }
  .sidebar-stats .stat-value { font-size: 14px; font-weight: bold; }
  .sidebar-stats .stat-label { font-size: 10px; color: var(--dim); text-transform: uppercase; }

  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; padding: 12px 16px 0; }

  .stat { text-align: center; }
  .stat-value { font-size: 20px; font-weight: bold; }
  .stat-label { font-size: 10px; color: var(--dim); text-transform: uppercase; }

  .grid { display: grid; grid-template-columns: 2fr 3fr; gap: 12px; overflow: hidden; height: 100%; }
  .grid > .panel { overflow-y: auto; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  .grid.full { grid-template-columns: 1fr; }
  .page-scroll { flex: 1; overflow-y: auto; padding-bottom: 8px; }
  .page-stats { flex-shrink: 0; padding: 8px 0; }

  .panel { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px; }
  .panel-title { font-size: 11px; font-weight: 600; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 6px; }

  .session-card { padding: 10px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; cursor: pointer; transition: border-color 0.15s; }
  .session-card:hover { border-color: var(--accent); }
  .session-card.active { border-left: 3px solid var(--green); }
  .session-card.stale { border-left: 3px solid var(--yellow); }
  .session-card.completed { border-left: 3px solid var(--dim); }
  .session-card.crashed { border-left: 3px solid var(--red); }
  .session-header { display: flex; justify-content: space-between; align-items: center; }
  .session-id { font-family: monospace; font-size: 13px; color: var(--accent); }
  .session-status { font-size: 11px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .session-status.active { background: rgba(63,185,80,0.15); color: var(--green); }
  .session-status.stale { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .session-status.completed { background: rgba(125,133,144,0.15); color: var(--dim); }
  .session-status.crashed { background: rgba(248,81,73,0.15); color: var(--red); }
  .session-task { font-size: 13px; margin-top: 4px; }
  .session-meta { font-size: 11px; color: var(--dim); margin-top: 4px; display: flex; gap: 12px; }

  .issue-row { padding: 8px; border-bottom: 1px solid var(--border); font-size: 13px; }
  .issue-row:last-child { border-bottom: none; }
  .severity { display: inline-block; width: 60px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
  .severity.critical { color: var(--red); }
  .severity.high { color: var(--orange); }
  .severity.medium { color: var(--yellow); }
  .severity.low { color: var(--dim); }
  .severity.info { color: var(--purple); }
  .category { color: var(--accent); font-size: 11px; margin-left: 4px; }
  .issue-title { margin-left: 8px; }
  .issue-location { font-size: 11px; color: var(--dim); margin-left: 70px; }
  .issue-time { font-size: 10px; color: var(--dim); float: right; }

  .action-row { padding: 6px 8px; border-bottom: 1px solid var(--border); font-size: 12px; color: var(--dim); }
  .action-row .agent { color: var(--accent); font-weight: 600; }
  .action-row .phase { color: var(--yellow); }

  .run-card { padding: 8px; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 8px; font-size: 13px; }
  .run-status { font-size: 11px; font-weight: 600; }
  .run-status.completed { color: var(--green); }
  .run-status.failed { color: var(--red); }
  .run-status.running { color: var(--yellow); }

  .empty { color: var(--dim); font-size: 13px; text-align: center; padding: 24px; }
  .tabs { display: flex; gap: 4px; margin-bottom: 12px; }
  .tab { padding: 4px 12px; font-size: 12px; border-radius: 4px; cursor: pointer; background: transparent; border: 1px solid var(--border); color: var(--dim); }
  .tab.active { background: var(--accent); color: var(--bg); border-color: var(--accent); }

  #app { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .page-fixed { flex-shrink: 0; }
  .page-content { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 16px; }
  .page-content:has(.split-view), .page-content:has(.grid), .page-content:has(canvas) { overflow: hidden; display: flex; flex-direction: column; }
  .page-content > .split-view, .page-content > .grid { flex: 1; min-height: 0; }
  .breadcrumb { display: flex; align-items: center; gap: 4px; margin-bottom: 6px; font-size: 12px; flex-wrap: wrap; }
  .breadcrumb-item { padding: 3px 10px; border-radius: 4px; background: rgba(88,166,255,0.08); color: var(--accent); cursor: pointer; transition: all 0.12s; }
  .breadcrumb-item:hover { background: rgba(88,166,255,0.18); }
  .breadcrumb-item.current { background: none; color: var(--text); cursor: default; font-weight: 600; font-size: 15px; padding: 0; }
  .breadcrumb-sep { color: var(--border); font-size: 14px; font-weight: 300; }

  .data-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .data-table th { text-align: left; padding: 6px 10px; border-bottom: 2px solid var(--border); color: var(--dim); font-size: 10px; text-transform: uppercase; cursor: pointer; user-select: none; white-space: nowrap; }
  .data-table th:hover { color: var(--accent); }
  .data-table th .sort-arrow { margin-left: 4px; font-size: 8px; }
  .data-table td { padding: 6px 10px; border-bottom: 1px solid var(--border); vertical-align: top; }
  .data-table tr:hover { background: rgba(88,166,255,0.04); }

  .secret-profile { margin-bottom: 16px; }
  .secret-profile-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .secret-profile-name { font-size: 14px; font-weight: 600; color: var(--accent); }
  .secret-row { display: flex; align-items: center; padding: 8px; border-bottom: 1px solid var(--border); font-size: 13px; gap: 12px; }
  .secret-key { font-family: monospace; color: var(--text); min-width: 180px; }
  .secret-source { font-size: 10px; padding: 2px 6px; border-radius: 8px; font-weight: 600; }
  .secret-source.literal { background: rgba(125,133,144,0.15); color: var(--dim); }
  .secret-source.env { background: rgba(210,153,34,0.15); color: var(--yellow); }
  .secret-source.op { background: rgba(88,166,255,0.15); color: var(--accent); }
  .secret-value { color: var(--dim); font-family: monospace; flex: 1; }
  .secret-reveal { font-size: 11px; color: var(--accent); cursor: pointer; padding: 2px 8px; border: 1px solid var(--border); border-radius: 4px; background: none; }
  .secret-reveal:hover { border-color: var(--accent); }
  .secret-delete { font-size: 11px; color: var(--red); cursor: pointer; padding: 2px 8px; border: 1px solid var(--border); border-radius: 4px; background: none; }
  .secret-delete:hover { border-color: var(--red); }

  .add-form { display: flex; gap: 8px; padding: 12px; background: var(--bg); border: 1px solid var(--border); border-radius: 6px; margin-top: 12px; flex-wrap: wrap; }
  .add-form input, .add-form select { padding: 6px 10px; font-size: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: 4px; color: var(--text); }
  .add-form input { flex: 1; min-width: 120px; }
  .add-form button { padding: 6px 14px; font-size: 12px; background: var(--accent); color: var(--bg); border: none; border-radius: 4px; cursor: pointer; font-weight: 600; }
  .add-form button:hover { opacity: 0.9; }

  .split-view { display: grid; grid-template-columns: 380px 1fr; gap: 12px; overflow: hidden; flex: 1; min-height: 0; }
  .split-view.wide-left { grid-template-columns: 1fr 340px; }
  @media (max-width: 900px) { .split-view, .split-view.wide-left { grid-template-columns: 1fr; } }
  .split-left { overflow-y: auto; min-height: 0; }
  .split-right { overflow-y: auto; min-height: 0; }

  .suite-header { padding: 8px 12px; cursor: pointer; border: 1px solid var(--border); border-radius: 6px; margin-bottom: 6px; transition: border-color 0.15s; }
  .suite-header:hover { border-color: var(--accent); }
  .suite-header.active { border-color: var(--accent); background: rgba(88,166,255,0.05); }
  .suite-name { font-size: 14px; font-weight: 600; color: var(--accent); }
  .suite-meta { font-size: 11px; color: var(--dim); display: flex; gap: 10px; margin-top: 2px; }
  .suite-badge { font-size: 10px; padding: 1px 6px; border-radius: 8px; font-weight: 600; }
  .suite-badge.passed { background: rgba(63,185,80,0.15); color: var(--green); }
  .suite-badge.failed { background: rgba(248,81,73,0.15); color: var(--red); }
  .suite-badge.pending { background: rgba(125,133,144,0.15); color: var(--dim); }
  .suite-badge.claimed { background: rgba(210,153,34,0.15); color: var(--yellow); }

  .type-group { margin-bottom: 16px; }
  .type-group-header { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 6px 0; border-bottom: 1px solid var(--border); margin-bottom: 6px; }
  .type-group-header.direct_functional { color: var(--green); }
  .type-group-header.impact_regression { color: var(--yellow); }
  .type-group-header.general_regression { color: var(--accent); }

  .tc-item { padding: 8px; border: 1px solid var(--border); border-radius: 4px; margin-bottom: 4px; cursor: pointer; font-size: 13px; transition: border-color 0.15s; }
  .tc-item:hover { border-color: var(--accent); }
  .tc-item.selected { border-color: var(--accent); background: rgba(88,166,255,0.08); }
  .tc-status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .tc-status-dot.passed { background: var(--green); }
  .tc-status-dot.failed { background: var(--red); }
  .tc-status-dot.pending { background: var(--dim); }
  .tc-status-dot.claimed, .tc-status-dot.running { background: var(--yellow); }
  .tc-status-dot.skipped { background: var(--purple); }
  .tc-status-dot.blocked { background: var(--orange); }

  .tc-detail-panel { padding: 16px; }
  .tc-detail-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
  .tc-detail-meta { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
  .tc-detail-badge { font-size: 11px; padding: 2px 10px; border-radius: 10px; font-weight: 600; }
  .tc-detail-section { margin-bottom: 16px; }
  .tc-detail-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--dim); letter-spacing: 0.5px; margin-bottom: 6px; }
  .bdd-step { padding: 3px 0; font-size: 13px; font-family: monospace; }
  .bdd-given { color: var(--green); }
  .bdd-when { color: var(--yellow); }
  .bdd-then { color: var(--accent); }
  .trad-step { padding: 4px 0; font-size: 13px; border-bottom: 1px solid var(--border); }
  .trad-step:last-child { border-bottom: none; }
  .trad-step-num { color: var(--accent); font-weight: 600; margin-right: 8px; }
  .trad-expected { color: var(--dim); margin-left: 20px; font-style: italic; }
</style>
</head>
<body>
<div class="layout">
  <div class="sidebar">
    <div class="sidebar-logo">
      <h1><span class="live-dot"></span>noob-tester</h1>
    </div>
    <div class="sidebar-nav">
      <div class="nav-btn active" data-page="dashboard" onclick="switchPage('dashboard')">Dashboard</div>

      <div class="nav-group-label">Testing</div>
      <div class="nav-btn" data-page="runs" onclick="switchPage('runs')">Explore</div>
      <div class="nav-btn" data-page="issues" onclick="switchPage('issues')">Issues</div>

      <div class="nav-group-label">Planning</div>
      <div class="nav-btn" data-page="analyses" onclick="switchPage('analyses')">Analyses</div>
      <div class="nav-btn" data-page="testcases" onclick="switchPage('testcases')">Test Cases</div>
      <div class="nav-btn" data-page="plans" onclick="switchPage('plans')">Plans</div>
      <div class="nav-btn" data-page="blockers" onclick="switchPage('blockers')">Blockers</div>

      <div class="nav-group-label">Infrastructure</div>
      <div class="nav-btn" data-page="coverage" onclick="switchPage('coverage')">Coverage</div>
      <div class="nav-btn" data-page="a11y" onclick="switchPage('a11y')">Accessibility</div>
      <div class="nav-btn" data-page="audit" onclick="switchPage('audit')">Test Audit</div>
      <div class="nav-btn" data-page="repos" onclick="switchPage('repos')">Repos</div>
      <div class="nav-btn" data-page="uimaps" onclick="switchPage('uimaps')">UI Maps</div>
      <div class="nav-btn" data-page="apimaps" onclick="switchPage('apimaps')">API Maps</div>
      <div class="nav-btn" data-page="secrets" onclick="switchPage('secrets')">Secrets</div>

      <div class="nav-group-label">Reporting</div>
      <div class="nav-btn" data-page="reports" onclick="switchPage('reports')">Reports</div>

      <div class="nav-group-label">System</div>
      <div class="nav-btn" data-page="context" onclick="switchPage('context')">Context Cache</div>
      <div class="nav-btn" data-page="metrics" onclick="switchPage('metrics')">Metrics</div>
      <div class="nav-btn" data-page="settings" onclick="switchPage('settings')">Settings</div>
      <div class="nav-btn" data-page="docs" onclick="switchPage('docs')">Docs</div>
    </div>
    <div class="sidebar-stats">
      <div class="stat"><span class="stat-label">Sessions</span><span class="stat-value" style="color:var(--green)" id="stat-sessions">-</span></div>
      <div class="stat"><span class="stat-label">Issues</span><span class="stat-value" style="color:var(--red)" id="stat-issues">-</span></div>
      <div class="stat"><span class="stat-label">Runs</span><span class="stat-value" style="color:var(--accent)" id="stat-runs">-</span></div>
    </div>
  </div>
  <div class="main">
    <div id="app"></div>
  </div>
</div>

<!-- Issue detail modal -->
<div id="issue-modal-overlay" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:200;cursor:pointer" onclick="if(event.target===this){this.style.display='none'}">
  <div id="issue-modal" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:90vw;max-width:1200px;max-height:90vh;border-radius:12px;border:1px solid var(--accent);box-shadow:0 20px 60px rgba(0,0,0,0.6);cursor:default;display:flex;flex-direction:column;overflow:hidden;background:var(--surface)"></div>
</div>

<script>
${wireframeScript}
${canvasScript}
${apiCanvasScript}
const API = "http://localhost:${port}";
let state = null;
let viewingSession = ${filterSessionId ? `"${filterSessionId}"` : "null"};
let activeTab = "issues";
let currentPage = "dashboard";

function switchPage(page) {
  currentPage = page;
  viewingSession = null;
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  render();
}

// SSE connection
const evtSource = new EventSource(API + "/api/stream");
evtSource.onmessage = (e) => {
  state = JSON.parse(e.data);
  // Update sidebar stats always
  const se = document.getElementById("stat-sessions");
  if (se) se.textContent = state.stats.activeSessions;
  const ie = document.getElementById("stat-issues");
  if (ie) ie.textContent = state.stats.totalIssues;
  const re = document.getElementById("stat-runs");
  if (re) re.textContent = state.stats.totalRuns;
  // Only update dashboard list in-place (not when viewing a session detail)
  if (currentPage === "dashboard" && !viewingSession) updateDashboardInPlace();
};

function render() {
  if (!state) return;

  if (currentPage === "issues") {
    renderIssuesPage();
    return;
  }

  if (currentPage === "analyses") {
    renderAnalysesPage();
    return;
  }

  if (currentPage === "runs") {
    renderRunsPage();
    return;
  }

  if (currentPage === "testcases") {
    renderTestCasesPage();
    return;
  }

  if (currentPage === "plans") {
    renderPlansPage();
    return;
  }

  if (currentPage === "blockers") {
    renderBlockersPage();
    return;
  }

  if (currentPage === "context") {
    renderContextCachePage();
    return;
  }

  if (currentPage === "apimaps") {
    renderApiMapsPage();
    return;
  }

  if (currentPage === "repos") {
    renderReposPage();
    return;
  }

  if (currentPage === "uimaps") {
    renderUiMapsPage();
    return;
  }

  if (currentPage === "metrics") {
    renderMetricsPage();
    return;
  }

  if (currentPage === "secrets") {
    renderSecretsPage();
    return;
  }

  if (currentPage === "reports") {
    renderReportsPage();
    return;
  }

  if (currentPage === "coverage") {
    renderCoveragePage();
    return;
  }

  if (currentPage === "a11y") {
    renderA11yPage();
    return;
  }

  if (currentPage === "audit") {
    renderTestAuditPage();
    return;
  }

  if (currentPage === "settings") {
    renderSettingsPage();
    return;
  }

  if (currentPage === "docs") {
    renderDocsPage();
    return;
  }

  if (viewingSession) {
    renderSessionDetail(viewingSession);
  } else {
    renderDashboard();
  }
}

let dashSelectedTicket = "";

function groupSessionsByTicket() {
  const byTicket = {};
  const noTicket = [];
  for (const s of state.sessions) {
    const tickets = s.ticket_refs ? (() => { try { return JSON.parse(s.ticket_refs); } catch { return []; } })() : [];
    if (tickets.length === 0) { noTicket.push(s); continue; }
    for (const t of tickets) {
      if (!byTicket[t]) byTicket[t] = [];
      byTicket[t].push(s);
    }
  }
  return { byTicket, noTicket, ticketIds: Object.keys(byTicket).sort() };
}

function renderDashboard() {
  const { byTicket, noTicket, ticketIds } = groupSessionsByTicket();

  // ── Level 1: Ticket list ──
  if (!dashSelectedTicket) {
    let html = '<div class="panel" style="margin-bottom:8px">';
    html += '<div class="panel-title">Sessions by Ticket</div>';
    const active = state.sessions.filter(s => s.status === "active").length;
    if (state.sessions.length > 0) {
      html += '<div style="display:flex;gap:16px">';
      html += \`<div class="stat"><div class="stat-value">\${ticketIds.length}</div><div class="stat-label">Tickets</div></div>\`;
      html += \`<div class="stat"><div class="stat-value">\${state.sessions.length}</div><div class="stat-label">Sessions</div></div>\`;
      html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${active}</div><div class="stat-label">Active</div></div>\`;
      html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${state.recentIssues.length}</div><div class="stat-label">Issues</div></div>\`;
      html += '</div>';
    }
    html += '</div>';

    html += '<div class="grid">';

    // Left — ticket cards
    html += '<div class="panel" style="overflow-y:auto">';
    if (ticketIds.length === 0 && noTicket.length === 0) {
      html += '<div class="empty">No sessions yet</div>';
    } else {
      const phaseNames = { 0: "Start", 1: "Analyze", 2: "Plan", 3: "Test Cases", 4: "Execute", 5: "Report" };
      const phaseColors = { 0: "var(--dim)", 1: "var(--yellow)", 2: "var(--accent)", 3: "var(--purple)", 4: "var(--green)", 5: "var(--orange, #d2992a)" };
      for (const jid of ticketIds) {
        const sessions = byTicket[jid];
        const jActive = sessions.filter(s => s.status === "active").length;
        const maxPhase = Math.max(...sessions.map(s => s.current_phase || 0));
        const phaseName = phaseNames[maxPhase] || ("Phase " + maxPhase);
        const phaseColor = phaseColors[maxPhase] || "var(--dim)";
        html += \`<div class="session-card" data-ticket="\${esc(jid)}" style="cursor:pointer">
          <div class="session-header">
            <span class="session-id" style="font-size:14px">\${esc(jid)}</span>
            <span style="font-size:11px;color:\${phaseColor};font-weight:600">\${phaseName}</span>
          </div>
          <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
            \${jActive ? \`<span class="suite-badge passed">\${jActive} active</span>\` : ""}
            <span class="suite-badge pending">\${sessions.length - jActive} done</span>
          </div>
        </div>\`;
      }
      if (noTicket.length > 0) {
        html += \`<div class="session-card" data-ticket="__none__" style="cursor:pointer">
          <div class="session-header">
            <span style="font-size:12px;color:var(--dim)">No ticket</span>
            <span style="font-size:11px;color:var(--dim)">\${noTicket.length}</span>
          </div>
        </div>\`;
      }
    }
    html += '</div>';

    // Right — recent issues
    html += '<div class="panel" style="overflow-y:auto">';
    html += '<div class="panel-title">Recent Issues</div>';
    html += '<div id="dash-issues">';
    html += state.recentIssues.length === 0
      ? '<div class="empty">No issues found yet</div>'
      : state.recentIssues.map(i => issueRow(i)).join("");
    html += '</div></div>';

    html += '</div>';
    setPage(html);
    bindDashboardClicks();
    return;
  }

  // ── Level 2: Ticket detail — stats + split (sessions left, issues right) ──
  renderDashboardTicketDetail();
}

async function renderDashboardTicketDetail() {
  const { byTicket, noTicket } = groupSessionsByTicket();
  const sessions = dashSelectedTicket === "__none__" ? noTicket : (byTicket[dashSelectedTicket] || []);
  const ticketLabel = dashSelectedTicket === "__none__" ? "No ticket" : dashSelectedTicket;

  // Fetch issues for this ticket
  let issues = [];
  if (dashSelectedTicket !== "__none__") {
    try {
      const res = await fetch(API + "/api/issues/by-ticket?ticket=" + encodeURIComponent(dashSelectedTicket));
      issues = await res.json();
    } catch {}
  }

  const active = sessions.filter(s => s.status === "active").length;
  const critical = issues.filter(i => i.severity === "critical").length;
  const high = issues.filter(i => i.severity === "high").length;

  let html = '';

  // Stats + breadcrumb
  html += '<div class="panel" style="margin-bottom:8px">';
  html += \`<div class="breadcrumb">
    <span class="breadcrumb-item" onclick="dashSelectedTicket='';renderDashboard()">Dashboard</span>
    <span class="breadcrumb-sep">|</span>
    <span class="breadcrumb-item current">\${esc(ticketLabel)}</span>
  </div>\`;
  if (sessions.length > 0 || issues.length > 0) {
    html += '<div style="display:flex;gap:16px">';
    html += \`<div class="stat"><div class="stat-value">\${sessions.length}</div><div class="stat-label">Sessions</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${active}</div><div class="stat-label">Active</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${issues.length}</div><div class="stat-label">Issues</div></div>\`;
    if (critical) html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${critical}</div><div class="stat-label">Critical</div></div>\`;
    if (high) html += \`<div class="stat"><div class="stat-value" style="color:var(--orange)">\${high}</div><div class="stat-label">High</div></div>\`;
    html += '</div>';
  }
  html += '</div>';

  // Split view: sessions left, issues right
  html += '<div class="split-view">';

  // Left — sessions
  html += '<div class="split-left">';
  if (sessions.length === 0) {
    html += '<div class="empty">No sessions</div>';
  } else {
    for (const s of sessions) html += sessionCard(s);
  }
  html += '</div>';

  // Right — issues
  html += '<div class="split-right panel">';
  if (issues.length === 0) {
    html += '<div class="empty">No issues</div>';
  } else {
    for (const i of issues) html += issueRow(i);
  }
  html += '</div>';

  html += '</div>';
  setPage(html);

  // Bind session clicks
  document.querySelectorAll(".session-card[data-id]").forEach(el => {
    el.addEventListener("click", () => {
      viewingSession = el.dataset.id;
      renderSessionDetail(viewingSession);
    });
  });
}

/** Update dashboard issues in-place (SSE). */
function updateDashboardInPlace() {
  if (!state) return;
  if (dashSelectedTicket) return; // don't interfere with detail view
  const issEl = document.getElementById("dash-issues");
  if (!issEl) { renderDashboard(); return; } // first render
  issEl.innerHTML = state.recentIssues.length === 0
    ? '<div class="empty">No issues found yet</div>'
    : state.recentIssues.map(i => issueRow(i)).join("");
}

function bindDashboardClicks() {
  document.querySelectorAll("[data-ticket]").forEach(el => {
    el.addEventListener("click", () => {
      dashSelectedTicket = el.dataset.ticket;
      renderDashboard();
    });
  });
  document.querySelectorAll(".session-card[data-id]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      viewingSession = el.dataset.id;
      renderSessionDetail(viewingSession);
    });
  });
}

function sessionCard(s) {
  const ago = timeAgo(s.last_heartbeat);
  return \`
    <div class="session-card \${s.status}" data-id="\${s.id}">
      <div class="session-header">
        <span class="session-id">\${s.id.slice(0,8)}</span>
        <span class="session-status \${s.status}">\${s.status}</span>
      </div>
      <div class="session-task">\${s.task_summary || "no task"}</div>
      \${renderSessionLabelsAndTickets(s)}
      <div class="session-meta">
        <span>Phase \${s.current_phase || "-"}</span>
        <span>Heartbeat: \${ago}</span>
        \${s.current_run_id ? \`<span>Run: \${s.current_run_id.slice(0,8)}</span>\` : ""}
      </div>
      \${(s.total_actions || s.estimated_tokens || s.tool_calls) ? \`<div class="session-meta" style="margin-top:4px;font-size:10px">
        \${s.model ? \`<span style="color:var(--dim)">\${s.model.replace("claude-","")}</span>\` : ""}
        \${s.total_actions ? \`<span>\${s.total_actions} actions</span>\` : ""}
        \${s.tool_calls ? \`<span style="color:var(--yellow)">\${s.tool_calls} tools</span>\` : ""}
        \${s.estimated_tokens ? \`<span style="color:var(--purple)">\${s.estimated_tokens.toLocaleString()} tok</span>\` : ""}
        \${calcCost(s) > 0 ? \`<span style="color:var(--red)">\${fmtCost(calcCost(s))}</span>\` : ""}
      </div>\` : ""}
    </div>
  \`;
}

async function deleteSession(sessionId) {
  if (!confirm("Delete session " + sessionId.slice(0,8) + " and all its linked data (runs, issues, actions)?")) return;
  await fetch(API + "/api/session/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: sessionId }),
  });
  // Force fresh state from server (SSE cache is stale)
  const freshRes = await fetch(API + "/api/state");
  state = await freshRes.json();
  viewingSession = null;
  render();
}

function renderSessionLabelsAndTickets(s) {
  let html = '';
  const labels = s.labels ? (() => { try { return JSON.parse(s.labels); } catch { return []; } })() : [];
  const tickets = s.ticket_refs ? (() => { try { return JSON.parse(s.ticket_refs); } catch { return []; } })() : [];
  if (labels.length > 0 || tickets.length > 0) {
    html += '<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">';
    const labelColors = { analyze: "var(--yellow)", plan: "var(--accent)", testcase: "var(--purple)", explore: "var(--green)", report: "var(--dim)" };
    for (const l of labels) {
      const color = labelColors[l] || "var(--dim)";
      html += \`<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(88,166,255,0.1);color:\${color};font-weight:600">\${esc(l)}</span>\`;
    }
    for (const t of tickets) {
      html += \`<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(248,81,73,0.1);color:var(--accent);font-weight:600">\${esc(t)}</span>\`;
    }
    html += '</div>';
  }
  return html;
}

function issueRow(i) {
  return \`
    <div class="issue-row" style="cursor:pointer" onclick="showIssueDetail('\${i.id}')">
      <span class="severity \${i.severity}">\${i.severity}</span>
      <span class="category">[\${i.category}]</span>
      <span class="issue-title">\${esc(i.title)}</span>
      <span class="issue-time">\${timeAgo(i.created_at)}</span>
      \${i.location ? \`<div class="issue-location">@ \${esc(i.location)}</div>\` : ""}
    </div>
  \`;
}

async function showIssueDetail(issueId) {
  const overlay = document.getElementById("issue-modal-overlay");
  const modal = document.getElementById("issue-modal");
  if (!overlay || !modal) return;
  overlay.style.display = "block";
  modal.innerHTML = '<div style="padding:40px;text-align:center;color:var(--dim)">Loading...</div>';

  const res = await fetch(API + "/api/issues/detail?id=" + encodeURIComponent(issueId));
  const data = await res.json();
  const i = data.issue;
  const run = data.run;
  const rpe = data.runpackEntry;
  const techIssues = data.techIssues || [];
  const analyses = data.analyses || [];
  const uimapPage = data.uimapPage;
  const uimapElements = data.uimapElements || [];

  const sevColor = { critical: "var(--red)", high: "var(--orange)", medium: "var(--yellow)", low: "var(--dim)", info: "var(--purple)" };

  let h = '';

  // ── Sticky header ──
  h += '<div style="flex-shrink:0;padding:16px 20px 12px;border-bottom:1px solid var(--border)">';
  h += '<div style="display:flex;justify-content:space-between;align-items:start">';
  h += '<div style="flex:1">';
  h += \`<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
    <span style="color:\${sevColor[i.severity] || "var(--dim)"};font-weight:700;font-size:12px;text-transform:uppercase;padding:3px 10px;border-radius:4px;background:rgba(255,255,255,0.05)">\${esc(i.severity)}</span>
    <span style="color:var(--accent);font-size:12px;padding:3px 10px;border-radius:4px;background:rgba(88,166,255,0.08)">\${esc(i.category)}</span>
  </div>\`;
  h += \`<div style="font-size:16px;font-weight:600">\${esc(i.title)}</div>\`;
  h += '</div>';
  h += '<span style="cursor:pointer;color:var(--dim);font-size:20px;padding:2px 8px;line-height:1" onclick="document.getElementById(\\'issue-modal-overlay\\').style.display=\\'none\\'">&times;</span>';
  h += '</div></div>';

  // ── Two columns, each scrolls independently ──
  h += '<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 20px;overflow:hidden;min-height:0">';

  // ── LEFT COLUMN ──
  h += '<div style="overflow-y:auto;min-height:0">';

  // Description
  if (i.description) {
    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">Description</div>';
    h += \`<div style="font-size:13px;color:var(--text);line-height:1.5">\${esc(i.description)}</div>\`;
    h += '</div>';
  }

  // Location
  if (i.location) {
    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">Location</div>';
    h += \`<div style="font-size:12px;color:var(--accent);word-break:break-all">\${esc(i.location)}</div>\`;
    h += '</div>';
  }

  // Screenshot
  if (i.screenshot_path) {
    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">Screenshot</div>';
    const imgUrl = API + "/api/artifact?path=" + encodeURIComponent(i.screenshot_path);
    h += \`<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;cursor:pointer" onclick="window.open('\${imgUrl}','_blank')">
      <img src="\${imgUrl}" style="width:100%;max-height:300px;object-fit:contain;display:block;background:var(--bg)" onerror="this.parentElement.style.display='none'" />
    </div>\`;
    h += '</div>';
  }

  // Console log (from issue or artifacts)
  if (i.console_log) {
    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">Console Output</div>';
    h += \`<pre style="font-size:11px;color:var(--dim);background:var(--bg);padding:8px;border-radius:4px;overflow-x:auto;max-height:150px;white-space:pre-wrap">\${esc(i.console_log)}</pre>\`;
    h += '</div>';
  }

  // Network data
  if (i.network_data) {
    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">Network Data</div>';
    h += \`<pre style="font-size:11px;color:var(--dim);background:var(--bg);padding:8px;border-radius:4px;overflow-x:auto;max-height:150px;white-space:pre-wrap">\${esc(i.network_data)}</pre>\`;
    h += '</div>';
  }

  // Runpack artifacts (screenshots, videos, HAR, console, traces)
  const allArtifacts = data.artifacts || [];
  if (allArtifacts.length > 0) {
    const byType = {};
    for (const a of allArtifacts) { if (!byType[a.type]) byType[a.type] = []; byType[a.type].push(a); }

    h += '<div style="margin-bottom:16px">';
    h += \`<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">Artifacts (\${allArtifacts.length})</div>\`;

    // Screenshots
    if (byType.screenshot) {
      h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">';
      for (const a of byType.screenshot.slice(0, 6)) {
        const url = API + "/api/artifact?path=" + encodeURIComponent(a.path);
        h += \`<div style="border:1px solid var(--border);border-radius:4px;overflow:hidden;width:120px;cursor:pointer" onclick="window.open('\${url}','_blank')">
          <img src="\${url}" style="width:100%;height:80px;object-fit:cover;display:block" onerror="this.style.display='none'" />
          <div style="padding:2px 4px;font-size:9px;color:var(--dim)">\${esc(a.label || "step " + (a.step || ""))}</div>
        </div>\`;
      }
      h += '</div>';
    }

    // Videos
    if (byType.video) {
      for (const a of byType.video.slice(0, 2)) {
        const url = API + "/api/artifact?path=" + encodeURIComponent(a.path);
        h += \`<div style="margin-bottom:8px"><video src="\${url}" controls style="width:100%;max-height:200px;border-radius:4px"></video>
          <div style="font-size:9px;color:var(--dim)">\${esc(a.label || "video")}</div></div>\`;
      }
    }

    // Console logs from artifacts
    if (byType.console) {
      for (const a of byType.console.slice(0, 2)) {
        const url = API + "/api/artifact?path=" + encodeURIComponent(a.path);
        h += \`<div style="margin-bottom:8px">
          <div style="font-size:10px;color:var(--dim);margin-bottom:2px">Console: <a href="\${url}" target="_blank" style="color:var(--accent)">\${esc(a.label || "log")}</a></div>
        </div>\`;
      }
    }

    // HAR from artifacts
    if (byType.har) {
      for (const a of byType.har.slice(0, 2)) {
        const url = API + "/api/artifact?path=" + encodeURIComponent(a.path);
        h += \`<div style="margin-bottom:8px">
          <div style="font-size:10px;color:var(--dim);margin-bottom:2px">HAR: <a href="\${url}" target="_blank" style="color:var(--accent)">\${esc(a.label || "network trace")}</a></div>
        </div>\`;
      }
    }

    // Traces
    if (byType.trace) {
      for (const a of byType.trace.slice(0, 2)) {
        const url = API + "/api/artifact?path=" + encodeURIComponent(a.path);
        h += \`<div style="margin-bottom:8px">
          <div style="font-size:10px;color:var(--dim)">Trace: <a href="\${url}" target="_blank" style="color:var(--accent)">\${esc(a.label || "trace")}</a></div>
        </div>\`;
      }
    }

    h += '</div>';
  }

  // Raw output
  if (i.raw_output) {
    h += '<div style="margin-bottom:16px">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">Raw Output</div>';
    h += \`<pre style="font-size:10px;color:var(--dim);background:var(--bg);padding:8px;border-radius:4px;overflow-x:auto;max-height:200px;white-space:pre-wrap">\${esc(i.raw_output.slice(0, 2000))}</pre>\`;
    h += '</div>';
  }

  h += '</div>'; // end left

  // ── RIGHT COLUMN ──
  h += '<div style="overflow-y:auto;min-height:0">';

  // Run info
  if (run) {
    h += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:6px">Run</div>';
    h += \`<div style="font-size:12px"><span style="color:var(--accent)">\${run.input_ref}</span> <span style="color:var(--dim)">(\${run.input_type})</span></div>\`;
    if (run.target_url) h += \`<div style="font-size:11px;color:var(--dim);margin-top:2px">\${esc(run.target_url)}</div>\`;
    h += \`<div style="font-size:11px;color:var(--dim);margin-top:2px">Status: <span style="color:\${run.status === 'completed' ? 'var(--green)' : run.status === 'failed' ? 'var(--red)' : 'var(--yellow)'}">\${run.status}</span> · Phase \${run.phase} · ID: \${run.id.slice(0,8)}</div>\`;
    h += '</div>';
  }

  // Test case (from runpack entry)
  if (rpe) {
    h += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:6px">Test Case</div>';
    h += \`<div style="font-size:12px;color:var(--text)">\${esc(rpe.tc_title || "Untitled")}</div>\`;
    h += \`<div style="font-size:11px;color:var(--dim);margin-top:2px">\${esc(rpe.tc_type || "")} · \${esc(rpe.tc_format || "")} · \${esc((rpe.tc_layer || "ui").toUpperCase())} · Status: <span style="color:\${rpe.status === 'passed' ? 'var(--green)' : rpe.status === 'failed' ? 'var(--red)' : 'var(--yellow)'}">\${rpe.status}</span></div>\`;
    h += '</div>';
  }

  // Analyses
  if (analyses.length > 0) {
    h += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:6px">Analyses</div>';
    for (const a of analyses) {
      h += \`<div style="font-size:11px;padding:2px 0;border-bottom:1px solid var(--border)">
        <span style="color:var(--accent)">\${esc(a.analysis_type)}</span>
        \${a.summary ? \`<span style="color:var(--dim);margin-left:8px">\${esc(a.summary.slice(0, 80))}</span>\` : ""}
      </div>\`;
    }
    h += '</div>';
  }

  // Tech issues
  if (techIssues.length > 0) {
    h += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">';
    h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:6px">Technical Issues</div>';
    for (const t of techIssues) {
      const tStatusColor = t.status === "resolved" ? "var(--green)" : t.status === "workaround_found" ? "var(--yellow)" : "var(--red)";
      h += \`<div style="font-size:11px;padding:4px 0;border-bottom:1px solid var(--border)">
        <span style="color:\${tStatusColor};font-weight:600;font-size:9px;text-transform:uppercase">\${esc(t.status)}</span>
        <span style="margin-left:6px">\${esc(t.title)}</span>
        \${t.workaround ? \`<div style="font-size:10px;color:var(--green);margin-top:2px">Workaround: \${esc(t.workaround.slice(0, 100))}</div>\` : ""}
      </div>\`;
    }
    h += '</div>';
  }

  // UI Map — mini sitemap canvas with affected page highlighted
  if (data.uimapFull) {
    h += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">';
    h += \`<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">UI Map — \${esc(uimapPage?.map_name || "")}</div>\`;
    h += \`<div style="font-size:11px;color:var(--accent);margin-bottom:6px">Affected: \${esc(uimapPage?.url_pattern || "")} \${uimapPage?.page_title ? "· " + esc(uimapPage.page_title) : ""}</div>\`;
    h += '<canvas id="issue-uimap-canvas" style="width:100%;height:280px;display:block;border-radius:4px;border:1px solid var(--border);cursor:grab"></canvas>';
    if (uimapElements.length > 0) {
      h += \`<div style="font-size:10px;color:var(--dim);margin-top:6px">\${uimapElements.length} elements on this page:</div>\`;
      h += '<div style="margin-top:4px;max-height:100px;overflow-y:auto">';
      for (const e of uimapElements.slice(0, 8)) {
        const elColor = e.status === "working" ? "var(--green)" : e.status === "flaky" ? "var(--yellow)" : "var(--red)";
        h += \`<div style="font-size:10px;padding:1px 0">
          <span style="color:\${elColor};font-size:8px;font-weight:600">\${esc(e.status).toUpperCase()}</span>
          <span style="color:var(--accent);margin-left:4px">\${esc(e.element_type)}</span>
          <span style="margin-left:4px">\${esc(e.element_text || "")}</span>
        </div>\`;
      }
      if (uimapElements.length > 8) h += \`<div style="font-size:10px;color:var(--dim)">+\${uimapElements.length - 8} more</div>\`;
      h += '</div>';
    }
    h += '</div>';
  }

  // Metadata
  h += '<div style="margin-bottom:16px;padding:12px;background:var(--bg);border-radius:6px;border:1px solid var(--border)">';
  h += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:6px">Metadata</div>';
  h += \`<div style="font-size:11px;color:var(--dim)">Issue ID: \${i.id}</div>\`;
  h += \`<div style="font-size:11px;color:var(--dim)">Run ID: \${i.run_id}</div>\`;
  if (i.step_id) h += \`<div style="font-size:11px;color:var(--dim)">Step ID: \${i.step_id}</div>\`;
  h += \`<div style="font-size:11px;color:var(--dim)">Created: \${i.created_at}</div>\`;
  if (i.is_retry) h += \`<div style="font-size:11px;color:var(--yellow)">Retry #\${i.retry_count}</div>\`;
  h += '</div>';

  h += '</div>'; // end right
  h += '</div>'; // end grid

  modal.innerHTML = h;

  // Render full force-directed sitemap with highlighted page
  if (data.uimapFull) {
    requestAnimationFrame(() => {
      drawUiMapCanvas(
        data.uimapFull.pages,
        data.uimapFull.elements,
        data.uimapFull.navigations,
        [],
        "issue-uimap-canvas",
        data.uimapFull.highlightPageId
      );
    });
  }
}

async function renderSessionDetail(sessionId) {
  const res = await fetch(API + "/api/session?id=" + sessionId);
  const detail = await res.json();
  const app = document.getElementById("app");

  if (!detail.session) {
    app.innerHTML = '<div class="empty">Session not found</div>';
    return;
  }

  const s = detail.session;
  const sessionTickets = s.ticket_refs ? (() => { try { return JSON.parse(s.ticket_refs); } catch { return []; } })() : [];
  const sessionTicket = sessionTickets.length > 0 ? sessionTickets[0] : null;

  setPage(\`
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden">
    <div class="panel" style="margin-bottom:8px;flex-shrink:0">
      <div class="breadcrumb">
        <span class="breadcrumb-item" id="back-btn">Dashboard</span>
        \${sessionTicket ? \`<span class="breadcrumb-sep">|</span>
        <span class="breadcrumb-item" onclick="viewingSession=null;dashSelectedTicket='\${esc(sessionTicket)}';render()">\${esc(sessionTicket)}</span>\` : ""}
        <span class="breadcrumb-sep">|</span>
        <span class="breadcrumb-item current">\${s.id.slice(0,8)}</span>
      </div>
      <div class="session-header" style="margin-bottom:8px">
        <span class="session-id" style="font-size:16px">\${s.id}</span>
        <span class="session-status \${s.status}">\${s.status}</span>
        <button onclick="deleteSession('\${s.id}')" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;margin-left:auto" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete Session</button>
      </div>
      <div class="session-task" style="font-size:15px;margin-bottom:8px">\${s.task_summary || "no task"}</div>
      \${renderSessionLabelsAndTickets(s)}
      <div class="session-meta" style="margin-top:6px">
        <span>Phase \${s.current_phase || "-"}</span>
        <span>PID: \${s.pid || "-"}</span>
        <span>Host: \${s.hostname || "-"}</span>
        <span>Heartbeat: \${timeAgo(s.last_heartbeat)}</span>
        <span>Started: \${s.created_at}</span>
      </div>
      <div class="session-meta" style="margin-top:6px">
        \${s.model ? \`<span style="color:var(--dim)">\${s.model.replace("claude-","")}</span>\` : ""}
        <span style="color:var(--text)">Actions: \${s.total_actions || 0}</span>
        <span style="color:var(--red)">Issues: \${s.total_issues || 0}</span>
        <span style="color:var(--yellow)">Tools: \${s.tool_calls || 0}</span>
        <span style="color:var(--purple)">Tokens: \${(s.estimated_tokens || 0).toLocaleString()}</span>
        \${s.estimated_cost_usd ? \`<span style="color:var(--red)">Cost: $\${s.estimated_cost_usd.toFixed(2)}</span>\` : ""}
        <span style="color:var(--green)">Duration: \${s.total_duration_ms ? Math.round(s.total_duration_ms / 1000) + "s" : "-"}</span>
      </div>
    </div>

    <div class="tabs" style="flex-shrink:0">
      <div class="tab active" data-tab="issues">Issues (\${detail.issues.length})</div>
      <div class="tab" data-tab="actions">Actions (\${detail.actions.length})</div>
      <div class="tab" data-tab="runs">Runs (\${detail.runs.length})</div>
      <div class="tab" data-tab="analyses">Analyses (\${detail.analyses.length})</div>
      \${detail.phaseTransitions && detail.phaseTransitions.length > 0 ? \`<div class="tab" data-tab="phases">Phases (\${detail.phaseTransitions.length})</div>\` : ""}
    </div>
    <div class="panel" id="tab-content" style="flex:1;overflow-y:auto"></div>
    </div>
  \`);

  // Tab switching
  function renderTab() {
    const content = document.getElementById("tab-content");
    document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === activeTab));

    if (activeTab === "issues") {
      content.innerHTML = detail.issues.length === 0
        ? '<div class="empty">No issues</div>'
        : detail.issues.map(i => issueRow(i)).join("");
    } else if (activeTab === "actions") {
      content.innerHTML = detail.actions.length === 0
        ? '<div class="empty">No actions logged</div>'
        : detail.actions.map(a => \`
          <div class="action-row">
            <span class="phase">P\${a.phase}</span>
            <span class="agent">\${a.agent_name}</span>
            \${esc(a.prompt_text.slice(0, 120))}
            <span style="float:right;font-size:10px;color:var(--dim)">\${timeAgo(a.created_at)}</span>
            \${a.outcome_summary ? \`<div style="font-size:11px;color:var(--green);margin-top:2px">↳ \${esc(a.outcome_summary)}</div>\` : ""}
          </div>
        \`).join("");
    } else if (activeTab === "runs") {
      content.innerHTML = detail.runs.length === 0
        ? '<div class="empty">No runs</div>'
        : detail.runs.map(r => \`
          <div class="run-card">
            <span style="font-family:monospace;color:var(--accent)">\${r.id.slice(0,8)}</span>
            <span class="run-status \${r.status}">\${r.status}</span>
            <span style="color:var(--dim);margin-left:8px">\${r.input_type}: \${esc(r.input_ref.slice(0,60))}</span>
            <span style="float:right;color:var(--dim);font-size:11px">\${r.created_at}</span>
            \${r.reuse_run_id ? \`<div style="font-size:11px;margin-top:4px"><span style="color:var(--purple)">Reusing from:</span> <span style="font-family:monospace;color:var(--accent);cursor:pointer" onclick="viewingSession=null;fetch(API+'/api/state').then(r=>r.json()).then(d=>{state=d;render()})">\${r.reuse_run_id.slice(0,8)}</span> <span style="color:var(--dim)">(Phase 1 & 2 skipped)</span></div>\` : ""}
            \${r.summary ? \`<div style="font-size:12px;color:var(--dim);margin-top:4px">\${esc(r.summary)}</div>\` : ""}
          </div>
        \`).join("");
    } else if (activeTab === "analyses") {
      if (detail.analyses.length === 0) {
        content.innerHTML = '<div class="empty">No analyses</div>';
      } else {
        const typeColors = { gap: "var(--yellow)", requirements: "var(--accent)", feasibility: "var(--green)", impact: "var(--red)" };
        const typeLabels = { gap: "Gap Analysis", requirements: "Requirements", feasibility: "Feasibility", impact: "Impact Analysis" };
        content.innerHTML = detail.analyses.map(a => {
          const color = typeColors[a.analysis_type] || "var(--dim)";
          const label = typeLabels[a.analysis_type] || a.analysis_type;
          let body = "";
          try {
            const parsed = JSON.parse(repairJson(a.content_json));
            body = renderAnalysisContent(a.analysis_type, parsed);
          } catch {
            body = '<pre style="font-size:11px;color:var(--dim);margin-top:6px;max-height:200px;overflow:auto;white-space:pre-wrap">' + esc(a.content_json) + '</pre>';
          }
          return \`<div class="run-card" style="margin-bottom:16px">
            <div style="color:\${color};font-weight:600;font-size:14px;margin-bottom:4px">\${label}</div>
            \${a.summary ? \`<div style="font-size:12px;color:var(--dim);margin-bottom:8px">\${esc(a.summary)}</div>\` : ""}
            \${body}
          </div>\`;
        }).join("");
      }
    } else if (activeTab === "phases") {
      const transitions = detail.phaseTransitions || [];
      if (transitions.length === 0) {
        content.innerHTML = '<div class="empty">No phase transitions recorded</div>';
      } else {
        const phaseNames = { 0: "Start", 1: "Analyze", 2: "Plan", 3: "Test Cases", 4: "Execute", 5: "Report" };
        const phaseColors = { 0: "var(--dim)", 1: "var(--yellow)", 2: "var(--accent)", 3: "var(--purple)", 4: "var(--green)", 5: "var(--orange, #d2992a)" };
        let ph = '<table class="data-table"><thead><tr><th style="text-align:left">Time</th><th style="text-align:center">From</th><th></th><th style="text-align:center">To</th><th style="text-align:left">Run</th></tr></thead><tbody>';
        for (const t of transitions) {
          const fromName = phaseNames[t.from_phase] || ("Phase " + t.from_phase);
          const toName = phaseNames[t.to_phase] || ("Phase " + t.to_phase);
          const fromColor = phaseColors[t.from_phase] || "var(--dim)";
          const toColor = phaseColors[t.to_phase] || "var(--accent)";
          ph += '<tr>';
          ph += '<td style="font-size:11px;color:var(--dim);white-space:nowrap">' + esc(t.transitioned_at) + '</td>';
          ph += '<td style="text-align:center"><span style="font-size:13px;font-weight:600;color:' + fromColor + '">' + esc(fromName) + '</span></td>';
          ph += '<td style="text-align:center;color:var(--accent)">→</td>';
          ph += '<td style="text-align:center"><span style="font-size:13px;font-weight:600;color:' + toColor + '">' + esc(toName) + '</span></td>';
          ph += '<td style="font-family:monospace;font-size:11px;color:var(--dim)">' + (t.run_id ? t.run_id.slice(0, 8) : "-") + '</td>';
          ph += '</tr>';
        }
        ph += '</tbody></table>';
        content.innerHTML = ph;
      }
    }
  }

  document.querySelectorAll(".tab").forEach(t => {
    t.addEventListener("click", () => { activeTab = t.dataset.tab; renderTab(); });
  });
  document.getElementById("back-btn").addEventListener("click", () => {
    viewingSession = null;
    dashSelectedTicket = "";
    activeTab = "issues";
    render();
  });
  renderTab();
}

function timeAgo(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr + "Z");
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 5) return "just now";
  if (diff < 60) return Math.floor(diff) + "s ago";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}

async function renderSettingsPage() {
  const res = await fetch(API + "/api/settings");
  const settings = await res.json();
  const app = document.getElementById("app");

  const providers = ["github", "gitlab", "bitbucket"];
  const currentProvider = (settings.repo_provider || "").toLowerCase();

  let html = '<div class="panel" style="margin-bottom:16px">';
  html += '<div class="panel-title">Settings</div>';
  html += '</div>';

  // Repository Provider
  html += '<div class="panel">';
  html += '<div style="margin-bottom:12px;font-weight:600;color:var(--fg)">Repository Provider</div>';
  html += '<div style="display:flex;gap:12px;margin-bottom:16px">';
  for (const p of providers) {
    const selected = currentProvider === p;
    const style = selected
      ? 'background:var(--accent);color:var(--bg);border:1px solid var(--accent)'
      : 'background:var(--bg);color:var(--dim);border:1px solid var(--border);cursor:pointer';
    html += \`<div onclick="saveRepoProvider('\${p}')" style="padding:12px 24px;border-radius:8px;\${style};font-size:14px;font-weight:500;text-transform:capitalize;transition:all 0.15s ease">
      \${p === 'github' ? '&#9679; GitHub' : p === 'gitlab' ? '&#9679; GitLab' : '&#9679; Bitbucket'}
    </div>\`;
  }
  html += '</div>';
  if (currentProvider) {
    html += \`<div style="font-size:12px;color:var(--dim)">Current: <span style="color:var(--green)">\${currentProvider}</span></div>\`;
  } else {
    html += '<div style="font-size:12px;color:var(--yellow)">No repository provider selected. Choose one above.</div>';
  }
  html += '</div>';

  // All settings table
  const allKeys = Object.keys(settings);
  if (allKeys.length > 0) {
    html += '<div class="panel" style="margin-top:16px">';
    html += '<div style="margin-bottom:12px;font-weight:600;color:var(--fg)">All Settings</div>';
    html += '<table class="data-table"><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>';
    for (const key of allKeys) {
      html += \`<tr><td style="color:var(--accent)">\${esc(key)}</td><td>\${esc(settings[key])}</td></tr>\`;
    }
    html += '</tbody></table></div>';
  }

  app.innerHTML = html;
}

window.saveRepoProvider = async function(provider) {
  await fetch(API + "/api/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: "repo_provider", value: provider })
  });
  renderSettingsPage();
};

async function renderDocsPage() {
  const res = await fetch(API + "/api/docs");
  const html = await res.text();
  const app = document.getElementById("app");
  app.style.display = "flex";
  app.style.flexDirection = "column";
  app.style.overflow = "hidden";
  app.innerHTML = html;
}

function esc(s) {
  if (!s) return "";
  return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// ── JSON repair for truncated LLM output ──
function repairJson(raw) {
  const trimmed = raw.trim();
  try { JSON.parse(trimmed); return trimmed; } catch {}
  let braces = 0, brackets = 0, inString = false, esc2 = false;
  for (const ch of trimmed) {
    if (esc2) { esc2 = false; continue; }
    if (ch === "\\\\") { esc2 = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++; else if (ch === "}") braces--;
    else if (ch === "[") brackets++; else if (ch === "]") brackets--;
  }
  let repaired = trimmed;
  if (inString) repaired += '"';
  while (brackets-- > 0) repaired += "]";
  while (braces-- > 0) repaired += "}";
  try { JSON.parse(repaired); return repaired; } catch { return trimmed; }
}

// ── Cost calculation (mirrors server-side logic) ──
const MODEL_PRICING = {
  "claude-opus-4-6":   { input: 5,  output: 25, cacheRead: 0.5,  cacheCreate: 6.25 },
  "claude-opus-4":     { input: 15, output: 75, cacheRead: 1.5,  cacheCreate: 18.75 },
  "claude-sonnet-4-6": { input: 3,  output: 15, cacheRead: 0.3,  cacheCreate: 3.75 },
  "claude-sonnet-4":   { input: 3,  output: 15, cacheRead: 0.3,  cacheCreate: 3.75 },
  "claude-haiku-4-5":  { input: 1,  output: 5,  cacheRead: 0.1,  cacheCreate: 1.25 },
  opus:   { input: 5,  output: 25, cacheRead: 0.5,  cacheCreate: 6.25 },
  sonnet: { input: 3,  output: 15, cacheRead: 0.3,  cacheCreate: 3.75 },
  haiku:  { input: 1,  output: 5,  cacheRead: 0.1,  cacheCreate: 1.25 },
};

function lookupPricing(model) {
  if (!model) return MODEL_PRICING.sonnet;
  return MODEL_PRICING[model]
    || Object.entries(MODEL_PRICING).find(([k]) => model.startsWith(k))?.[1]
    || MODEL_PRICING.sonnet;
}

function calcCost(s) {
  // Use DB cost if already calculated
  if (s.estimated_cost_usd) return s.estimated_cost_usd;
  // Recalculate from tokens + model if available
  if (!s.model || !s.estimated_tokens) return 0;
  const p = lookupPricing(s.model);
  if (s.input_tokens || s.output_tokens || s.cache_read_tokens || s.cache_create_tokens) {
    return ((s.input_tokens || 0) / 1e6) * p.input
         + ((s.output_tokens || 0) / 1e6) * p.output
         + ((s.cache_read_tokens || 0) / 1e6) * p.cacheRead
         + ((s.cache_create_tokens || 0) / 1e6) * p.cacheCreate;
  }
  // Fallback: blended from total
  return (s.estimated_tokens / 1e6) * (p.input * 0.3 + p.output * 0.7);
}

function fmtCost(v) { return v > 0 ? "$" + v.toFixed(2) : "-"; }

function renderMd(s) {
  if (!s) return "";
  if (typeof marked !== "undefined" && marked.parse) return marked.parse(s);
  return '<pre style="white-space:pre-wrap">' + esc(s) + '</pre>';
}

/** Set #app content. Splits into fixed header (breadcrumb + stats) and scrollable content. */
function setPage(html) {
  const app = document.getElementById("app");
  // Reset any inline styles from special pages (docs)
  app.style.display = "";
  app.style.flexDirection = "";
  app.style.overflow = "";
  // Parse into a temp container to split fixed vs scrollable
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const children = Array.from(tmp.children);

  let fixedHtml = "";
  let contentHtml = "";
  let fixedDone = false;

  for (const child of children) {
    if (!fixedDone) {
      const isBack = child.classList && child.classList.contains("detail-back");
      const isStatsPanel = child.classList && child.classList.contains("panel") && child.querySelector(".stat, .stat-value, .breadcrumb");
      if (isBack || isStatsPanel) {
        fixedHtml += child.outerHTML;
        fixedDone = true;
        continue;
      }
    }
    contentHtml += child.outerHTML;
  }

  if (fixedHtml) {
    app.innerHTML = '<div class="page-fixed">' + fixedHtml + '</div><div class="page-content">' + contentHtml + '</div>';
  } else {
    app.innerHTML = '<div class="page-content">' + html + '</div>';
  }
}

// ── Issues Page ──

let issuesSelectedTicket = "";
let issuesSortCol = "severity";
let issuesSortDir = 1; // 1 = asc, -1 = desc
let issuesData = [];

async function renderIssuesPage() {
  const app = document.getElementById("app");

  const ticketsRes = await fetch(API + "/api/issues/tickets");
  const tickets = await ticketsRes.json();

  if (tickets.length === 0 && !issuesSelectedTicket) {
    app.innerHTML = '<div class="panel"><div class="empty">No issues found yet. Run /noob-explore (UI tests) or /noob-api-explore (API tests) to find issues.</div></div>';
    return;
  }

  let html = "";

  // ── Level 1: Ticket list ──
  if (!issuesSelectedTicket) {
    const totalIssues = tickets.reduce((s, t) => s + t.total, 0);
    const totalCritical = tickets.reduce((s, t) => s + t.critical, 0);
    const totalHigh = tickets.reduce((s, t) => s + t.high, 0);

    html += '<div class="panel" style="margin-bottom:8px">';
    html += '<div class="panel-title">Issues by Ticket</div>';
    html += '<div style="display:flex;gap:16px;margin-bottom:4px">';
    html += \`<div class="stat"><div class="stat-value">\${tickets.length}</div><div class="stat-label">Tickets</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${totalIssues}</div><div class="stat-label">Issues</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${totalCritical}</div><div class="stat-label">Critical</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--orange)">\${totalHigh}</div><div class="stat-label">High</div></div>\`;
    html += '</div></div>';

    html += '<div class="panel">';
    for (const t of tickets) {
      html += \`<div class="session-card" onclick="issuesSelectedTicket='\${esc(t.ticket)}';renderIssuesPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(t.ticket)}</span>
          <span style="font-size:12px;color:var(--dim)">\${t.total} issues</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          \${t.critical ? \`<span class="suite-badge failed">\${t.critical} critical</span>\` : ""}
          \${t.high ? \`<span class="suite-badge" style="background:rgba(219,109,40,0.15);color:var(--orange)">\${t.high} high</span>\` : ""}
          \${t.medium ? \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">\${t.medium} medium</span>\` : ""}
          \${t.low ? \`<span class="suite-badge pending">\${t.low} low</span>\` : ""}
          \${t.info ? \`<span class="suite-badge" style="background:rgba(188,140,255,0.15);color:var(--purple)">\${t.info} info</span>\` : ""}
        </div>
        <div class="session-meta"><span>\${t.last_issue || ""}</span></div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // ── Level 2: Issues for a ticket — sortable table ──
  const issuesRes = await fetch(API + "/api/issues/by-ticket?ticket=" + encodeURIComponent(issuesSelectedTicket));
  issuesData = await issuesRes.json();

  renderIssuesTable();
}

function renderIssuesTable() {
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sorted = [...issuesData].sort((a, b) => {
    let va, vb;
    if (issuesSortCol === "severity") {
      va = sevOrder[a.severity] ?? 5;
      vb = sevOrder[b.severity] ?? 5;
    } else if (issuesSortCol === "category") {
      va = a.category || "";
      vb = b.category || "";
    } else if (issuesSortCol === "title") {
      va = a.title || "";
      vb = b.title || "";
    } else if (issuesSortCol === "location") {
      va = a.location || "";
      vb = b.location || "";
    } else if (issuesSortCol === "created_at") {
      va = a.created_at || "";
      vb = b.created_at || "";
    } else {
      va = a[issuesSortCol] || "";
      vb = b[issuesSortCol] || "";
    }
    if (va < vb) return -1 * issuesSortDir;
    if (va > vb) return 1 * issuesSortDir;
    return 0;
  });

  const total = issuesData.length;
  const critical = issuesData.filter(i => i.severity === "critical").length;
  const high = issuesData.filter(i => i.severity === "high").length;
  const medium = issuesData.filter(i => i.severity === "medium").length;

  const sevColor = (s) => s === "critical" ? "var(--red)" : s === "high" ? "var(--orange)" : s === "medium" ? "var(--yellow)" : s === "low" ? "var(--dim)" : "var(--purple)";
  const arrow = (col) => issuesSortCol === col ? (issuesSortDir === 1 ? " ▲" : " ▼") : "";

  let html = '';

  // Stats + breadcrumb
  html += '<div class="panel" style="margin-bottom:8px">';
  html += \`<div class="breadcrumb">
    <span class="breadcrumb-item" onclick="issuesSelectedTicket='';renderIssuesPage()">Issues</span>
    <span class="breadcrumb-sep">|</span>
    <span class="breadcrumb-item current">\${esc(issuesSelectedTicket)}</span>
  </div>\`;
  html += '<div style="display:flex;gap:16px">';
  html += \`<div class="stat"><div class="stat-value">\${total}</div><div class="stat-label">Total</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${critical}</div><div class="stat-label">Critical</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--orange)">\${high}</div><div class="stat-label">High</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--yellow)">\${medium}</div><div class="stat-label">Medium</div></div>\`;
  html += '</div></div>';

  // Table — sticky header, scrollable body
  html += '<div class="panel" style="padding:0;overflow-y:auto;flex:1;min-height:0">';
  html += '<table class="data-table">';
  html += '<thead style="position:sticky;top:0;z-index:1;background:var(--surface)"><tr>';
  html += \`<th onclick="sortIssues('severity')">Severity\${arrow("severity")}</th>\`;
  html += \`<th onclick="sortIssues('category')">Category\${arrow("category")}</th>\`;
  html += \`<th onclick="sortIssues('title')" style="width:40%">Title\${arrow("title")}</th>\`;
  html += \`<th onclick="sortIssues('location')">Location\${arrow("location")}</th>\`;
  html += \`<th onclick="sortIssues('created_at')">Time\${arrow("created_at")}</th>\`;
  html += '<th style="width:40px"></th>';
  html += '</tr></thead><tbody>';

  for (const i of sorted) {
    html += \`<tr style="cursor:pointer" onclick="showIssueDetail('\${i.id}')">
      <td><span style="color:\${sevColor(i.severity)};font-weight:700;font-size:10px;text-transform:uppercase">\${esc(i.severity)}</span></td>
      <td><span style="color:var(--accent);font-size:11px">\${esc(i.category)}</span></td>
      <td>
        <div style="font-size:12px">\${esc(i.title)}</div>
        \${i.description ? \`<div style="font-size:10px;color:var(--dim);margin-top:2px;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${esc(i.description.slice(0, 120))}</div>\` : ""}
      </td>
      <td><span style="font-size:10px;color:var(--dim);word-break:break-all">\${esc(i.location || "—")}</span></td>
      <td><span style="font-size:10px;color:var(--dim);white-space:nowrap">\${esc(i.created_at || "")}</span></td>
      <td><button onclick="event.stopPropagation();deleteIssue('\${i.id}')" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:2px 6px;cursor:pointer" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">&times;</button></td>
    </tr>\`;
  }

  html += '</tbody></table></div>';
  setPage(html);
}

function sortIssues(col) {
  if (issuesSortCol === col) {
    issuesSortDir *= -1;
  } else {
    issuesSortCol = col;
    issuesSortDir = 1;
  }
  renderIssuesTable();
}

function deleteIssue(issueId) {
  if (!confirm("Delete this issue? This cannot be undone.")) return;
  fetch(API + "/api/issues/delete?id=" + encodeURIComponent(issueId), { method: "DELETE" })
    .then(r => r.json())
    .then(data => {
      if (data.deleted) {
        issuesData = issuesData.filter(i => i.id !== issueId);
        renderIssuesTable();
      }
    });
}

// ── Analyses Page ──

let analysisSelectedRun = "";
let analysisSelectedId = "";

async function renderAnalysesPage() {
  const res = await fetch(API + "/api/analyses");
  const allAnalyses = await res.json();
  const app = document.getElementById("app");

  // Group by run
  const byRun = {};
  for (const a of allAnalyses) {
    const key = a.run_id;
    if (!byRun[key]) byRun[key] = { ref: a.input_ref || a.run_id.slice(0,8), targetUrl: a.target_url, runId: key, items: [] };
    byRun[key].items.push(a);
  }

  const typeColors = { gap: "var(--yellow)", requirements: "var(--accent)", feasibility: "var(--green)", impact: "var(--red)" };
  const typeLabels = { gap: "Gap Analysis", requirements: "Requirements", feasibility: "Feasibility", impact: "Impact Analysis" };

  // Stats bar — context-aware
  const statsItems = analysisSelectedRun ? (byRun[analysisSelectedRun]?.items || []) : allAnalyses;
  const statsLabel = analysisSelectedRun ? (byRun[analysisSelectedRun]?.ref || analysisSelectedRun.slice(0,8)) : "All Analyses";

  const byType = {};
  for (const a of statsItems) byType[a.analysis_type] = (byType[a.analysis_type] || 0) + 1;

  if (allAnalyses.length === 0) {
    setPage('<div class="panel"><div class="panel-title">Analyses</div><div class="empty">No analyses yet. Use /noob-analyze to generate them.</div></div>');
    return;
  }

  let html = '<div class="panel" style="margin-bottom:16px">';
  html += \`<div class="panel-title">\${esc(statsLabel)}</div>\`;
  html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
  html += \`<div class="stat"><div class="stat-value">\${statsItems.length}</div><div class="stat-label">Total</div></div>\`;
  for (const [type, count] of Object.entries(byType)) {
    const color = typeColors[type] || "var(--dim)";
    const label = typeLabels[type] || type;
    html += \`<div class="stat"><div class="stat-value" style="color:\${color}">\${count}</div><div class="stat-label">\${label}</div></div>\`;
  }
  html += '</div></div>';

  // No run selected — show run cards
  if (!analysisSelectedRun) {
    html += '<div class="panel">';
    for (const [runId, group] of Object.entries(byRun)) {
      const g = group;
      const hasGap = g.items.some(a => a.analysis_type === "gap");
      const hasReq = g.items.some(a => a.analysis_type === "requirements");
      const hasFeas = g.items.some(a => a.analysis_type === "feasibility");
      const hasImpact = g.items.some(a => a.analysis_type === "impact");

      html += \`<div class="session-card" onclick="analysisSelectedRun='\${runId}';analysisSelectedId='';renderAnalysesPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(g.ref)}</span>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:12px;color:var(--dim)">\${g.items.length} analyses</span>
            <button onclick="event.stopPropagation();deleteAnalysesForRun('\${runId}','\${esc(g.ref)}')" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;cursor:pointer" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete</button>
          </div>
        </div>
        \${g.targetUrl ? \`<div style="font-size:12px;color:var(--dim);margin-top:2px">\${esc(g.targetUrl)}</div>\` : ""}
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          \${hasGap ? \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">Gap</span>\` : ""}
          \${hasReq ? \`<span class="suite-badge" style="background:rgba(88,166,255,0.15);color:var(--accent)">Requirements</span>\` : ""}
          \${hasFeas ? \`<span class="suite-badge" style="background:rgba(63,185,80,0.15);color:var(--green)">Feasibility</span>\` : ""}
          \${hasImpact ? \`<span class="suite-badge" style="background:rgba(248,81,73,0.15);color:var(--red)">Impact</span>\` : ""}
        </div>
        <div style="font-size:11px;color:var(--dim);margin-top:4px">Run: \${runId.slice(0,8)}</div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // Run selected — split view: analysis types left, detail right
  const runGroup = byRun[analysisSelectedRun];
  if (!runGroup) {
    analysisSelectedRun = "";
    renderAnalysesPage();
    return;
  }

  html += \`<div class="breadcrumb" style="display:flex;justify-content:space-between;align-items:center">
    <div>
      <span class="breadcrumb-item" onclick="analysisSelectedRun='';analysisSelectedId='';renderAnalysesPage()">Analyses</span>
      <span class="breadcrumb-sep">|</span>
      <span class="breadcrumb-item current">\${esc(runGroup.ref || analysisSelectedRun.slice(0,8))}</span>
    </div>
    <div style="display:flex;gap:6px">
      <button onclick="exportAllAnalysesMd('\${analysisSelectedRun}')" style="font-size:10px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">Export All MD</button>
      <button onclick="exportAllAnalysesPdf('\${analysisSelectedRun}')" style="font-size:10px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">Export All PDF</button>
    </div>
  </div>\`;

  html += '<div class="split-view">';

  // LEFT — analysis types
  html += '<div class="split-left">';
  html += \`<div style="font-size:16px;font-weight:600;color:var(--accent);margin-bottom:4px">\${esc(runGroup.ref)}</div>\`;
  html += \`<div style="font-size:12px;color:var(--dim);margin-bottom:12px">\${runGroup.targetUrl ? esc(runGroup.targetUrl) + " · " : ""}Run: \${analysisSelectedRun.slice(0,8)}</div>\`;

  for (const a of runGroup.items) {
    const isSel = analysisSelectedId === a.id;
    const color = typeColors[a.analysis_type] || "var(--dim)";
    const label = typeLabels[a.analysis_type] || a.analysis_type;
    html += \`<div class="tc-item \${isSel ? 'selected' : ''}" onclick="analysisSelectedId='\${a.id}';renderAnalysesPage()">
      <span style="color:\${color};font-weight:600;font-size:13px">\${label}</span>
      \${a.confidence !== null ? \`<span style="float:right;font-size:10px;color:var(--dim)">\${Math.round(a.confidence * 100)}%</span>\` : ""}
      \${a.summary ? \`<div style="font-size:11px;color:var(--dim);margin-top:2px">\${esc(a.summary)}</div>\` : ""}
    </div>\`;
  }
  html += '</div>';

  // RIGHT — detail
  html += '<div class="split-right panel">';
  const selected = analysisSelectedId ? allAnalyses.find(a => a.id === analysisSelectedId) : null;

  if (!selected) {
    html += '<div class="empty">Select an analysis to view details</div>';
  } else {
    const color = typeColors[selected.analysis_type] || "var(--dim)";
    const label = typeLabels[selected.analysis_type] || selected.analysis_type;

    html += \`<div class="tc-detail-panel">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div class="tc-detail-title" style="color:\${color};margin-bottom:0">\${label}</div>
        <div style="display:flex;gap:6px">
          <button onclick="exportAnalysisMd('\${selected.id}')" style="font-size:10px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">Export MD</button>
          <button onclick="exportAnalysisPdf('\${selected.id}')" style="font-size:10px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">Export PDF</button>
        </div>
      </div>
      \${selected.summary ? \`<div style="font-size:13px;color:var(--dim);margin-bottom:16px">\${esc(selected.summary)}</div>\` : ""}
      <div style="font-size:11px;color:var(--dim);margin-bottom:12px">
        Run: \${selected.run_id.slice(0,8)} · Created: \${selected.created_at}
        \${selected.confidence !== null ? \` · Confidence: \${Math.round(selected.confidence * 100)}%\` : ""}
      </div>\`;

    try {
      const content = JSON.parse(repairJson(selected.content_json));
      html += renderAnalysisContent(selected.analysis_type, content);
    } catch {
      html += \`<pre style="font-size:12px;color:var(--dim);white-space:pre-wrap;max-height:500px;overflow:auto">\${esc(selected.content_json)}</pre>\`;
    }

    // Placeholder for normalized impact areas
    if (selected.analysis_type === "impact") {
      html += '<div id="impact-areas-container"></div>';
    }

    html += '</div>';
  }

  html += '</div></div>';
  setPage(html);

  // Async-load normalized impact areas if viewing impact analysis
  if (selected && selected.analysis_type === "impact") {
    try {
      const iaRes = await fetch(API + "/api/impact-areas?analysis=" + selected.id);
      const impactAreas = await iaRes.json();
      const container = document.getElementById("impact-areas-container");
      if (container && impactAreas.length > 0) {
        const sevColors = { critical: "var(--red)", high: "var(--orange)", medium: "var(--yellow)", low: "var(--dim)" };
        let iaHtml = '<div class="tc-detail-section" style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">';
        iaHtml += '<div class="tc-detail-section-title" style="color:var(--accent)">Normalized Impact Areas (' + impactAreas.length + ')</div>';
        iaHtml += '<table class="data-table" style="font-size:12px"><thead><tr><th>Type</th><th>Severity</th><th>Description</th></tr></thead><tbody>';
        for (const ia of impactAreas) {
          const sc = sevColors[ia.severity] || "var(--dim)";
          iaHtml += '<tr><td style="color:var(--accent);white-space:nowrap">' + esc(ia.area_type) + '</td>';
          iaHtml += '<td style="color:' + sc + ';font-weight:600;white-space:nowrap">' + esc(ia.severity || "-") + '</td>';
          iaHtml += '<td>' + esc(ia.description) + '</td></tr>';
        }
        iaHtml += '</tbody></table></div>';
        container.innerHTML = iaHtml;
      }
    } catch {}
  }
}

// ── Analysis Export ──

let _analysisCache = {};
function cacheAnalysis(id, data) { _analysisCache[id] = data; }

function analysisToMarkdown(type, content, meta) {
  const typeLabels = { gap: "Gap Analysis", requirements: "Requirements Analysis", feasibility: "Feasibility Analysis", impact: "Impact Analysis" };
  let md = "# " + (typeLabels[type] || type) + "\\n\\n";
  if (meta.summary) md += "> " + meta.summary + "\\n\\n";
  md += "**Run:** " + meta.runId + " · **Created:** " + meta.createdAt + "\\n\\n";

  if (type === "gap") {
    const sections = [["known_facts","Known Facts"],["unknowns","Unknowns"],["assumptions","Assumptions"],["blocked_items","Blocked"]];
    for (const [key, label] of sections) {
      const items = content[key] || [];
      if (items.length === 0) continue;
      md += "## " + label + " (" + items.length + ")\\n\\n";
      for (const item of items) md += "- " + item + "\\n";
      md += "\\n";
    }
  } else if (type === "requirements") {
    const sections = [["explicit_requirements","Explicit"],["implicit_requirements","Implicit"],["missing_requirements","Missing"],["ambiguous_requirements","Ambiguous"]];
    for (const [key, label] of sections) {
      const items = content[key] || [];
      if (items.length === 0) continue;
      md += "## " + label + " (" + items.length + ")\\n\\n";
      for (const item of items) md += "- " + item + "\\n";
      md += "\\n";
    }
  } else if (type === "feasibility") {
    md += "## Testable: " + (content.testable ? "Yes" : "No") + "\\n\\n";
    if (content.recommended_approach) {
      md += "## Recommended Approach\\n\\n";
      if (typeof content.recommended_approach === "string") {
        md += content.recommended_approach + "\\n\\n";
      } else {
        const ra = content.recommended_approach;
        const knownStringFields = [
          ["test_strategy", "Strategy"], ["unit_tests", "Unit Tests"], ["integration_tests", "Integration Tests"],
          ["e2e_tests", "E2E Tests"], ["api_tests", "API Tests"], ["test_data", "Test Data"]
        ];
        for (const [fKey, fLabel] of knownStringFields) {
          if (ra[fKey] && typeof ra[fKey] === "string") md += "**" + fLabel + ":** " + ra[fKey] + "\\n\\n";
        }
        for (const [k, label] of [["test_layers","Test Layers"],["test_tools","Test Tools"],["coverage_goals","Coverage Goals"]]) {
          const items = ra[k] || [];
          if (items.length === 0) continue;
          md += "### " + label + "\\n\\n";
          for (const item of items) md += "- " + (typeof item === "string" ? item : JSON.stringify(item)) + "\\n";
          md += "\\n";
        }
        const handled = new Set(["test_strategy","unit_tests","integration_tests","e2e_tests","api_tests","test_data","test_layers","test_tools","coverage_goals"]);
        for (const [k, v] of Object.entries(ra)) {
          if (handled.has(k)) continue;
          const label = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          if (typeof v === "string") { md += "**" + label + ":** " + v + "\\n\\n"; }
          else if (Array.isArray(v)) {
            md += "### " + label + "\\n\\n";
            for (const item of v) md += "- " + (typeof item === "string" ? item : JSON.stringify(item)) + "\\n";
            md += "\\n";
          }
        }
      }
    }
    for (const key of ["blockers", "risks", "risk_areas"]) {
      const items = content[key] || [];
      if (items.length === 0) continue;
      const label = key === "blockers" ? "Blockers" : key === "risks" ? "Risks" : "Risk Areas";
      md += "## " + label + " (" + items.length + ")\\n\\n";
      for (const item of items) {
        if (typeof item === "string") {
          md += "- " + item + "\\n";
        } else {
          const rTitle = item.risk || item.area || item.description || item.reason || "";
          const rSev = item.severity ? " [" + item.severity + "]" : "";
          md += "- **" + rTitle + "**" + rSev + (item.mitigation ? " → _" + item.mitigation + "_" : "") + "\\n";
        }
      }
      md += "\\n";
    }
  } else if (type === "impact") {
    if (content.summary) md += "**Summary:** " + content.summary + "\\n\\n";
    const sections = [["impacted_areas","Impacted Areas"],["dependency_risks","Dependency Risks"],["config_concerns","Config Concerns"],["compatibility_issues","Compatibility Issues"],["infrastructure_concerns","Infrastructure"],["hidden_edge_cases","Hidden Edge Cases"],["existing_test_gaps","Test Gaps"],["regression_risks","Regression Risks"]];
    for (const [key, label] of sections) {
      const items = content[key] || [];
      if (items.length === 0) continue;
      md += "## " + label + " (" + items.length + ")\\n\\n";
      for (const item of items) {
        if (typeof item === "string") { md += "- " + item + "\\n"; }
        else {
          const title = item.area || item.risk || item.concern || item.file || item.description || item.reason || "";
          const detail = item.details || item.impact || item.changes || item.scope || item.description || item.mitigation || "";
          const sev = item.severity || "";
          const files = item.files || item.affected || item.dependencies || null;
          const extra = item.change_type || item.mitigation || null;
          var line = "- ";
          if (sev) line += "[" + sev.toUpperCase() + "] ";
          if (title) line += "**" + title + "**";
          if (detail && detail !== title) line += " — " + detail;
          if (!title && !detail) line += JSON.stringify(item);
          md += line + "\\n";
          if (extra) md += "  - → " + extra + "\\n";
          if (files && Array.isArray(files)) {
            for (var fi of files) md += "  - " + fi + "\\n";
          }
        }
      }
      md += "\\n";
    }
  } else {
    md += "\\n" + JSON.stringify(content, null, 2) + "\\n";
  }
  return md;
}

function fixNewlines(s) {
  return s.split(String.fromCharCode(92) + "n").join(String.fromCharCode(10));
}

function mdToHtml(md) {
  md = fixNewlines(md);
  var lines = md.split(String.fromCharCode(10));
  var html = "";
  var inTable = false;
  var isHeader = true;
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    // Table row
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      // Skip separator row (|---|---|)
      if (line.replace(/[\\|\\-\\s:]/g, "").length === 0) { isHeader = false; continue; }
      if (!inTable) { html += "<table>"; inTable = true; isHeader = true; }
      var cells = line.split("|").filter(function(c, idx) { return idx > 0 && idx < line.split("|").length - 1; });
      var tag = isHeader ? "th" : "td";
      html += "<tr>" + cells.map(function(c) { return "<" + tag + ">" + c.trim() + "</" + tag + ">"; }).join("") + "</tr>";
      if (isHeader) isHeader = false;
      continue;
    }
    if (inTable) { html += "</table>"; inTable = false; }
    // Headings
    if (line.startsWith("# ")) { html += "<h1>" + line.slice(2) + "</h1>"; continue; }
    if (line.startsWith("## ")) { html += "<h2>" + line.slice(3) + "</h2>"; continue; }
    if (line.startsWith("### ")) { html += "<h3>" + line.slice(4) + "</h3>"; continue; }
    // Blockquote
    if (line.startsWith("> ")) { html += "<blockquote>" + line.slice(2) + "</blockquote>"; continue; }
    // Horizontal rule
    if (line.trim() === "---") { html += "<hr>"; continue; }
    // List item
    if (line.startsWith("- ")) { html += "<li>" + line.slice(2) + "</li>"; continue; }
    // Empty line
    if (line.trim() === "") { html += "<br>"; continue; }
    // Paragraph
    html += "<p>" + line + "</p>";
  }
  if (inTable) html += "</table>";
  // Inline formatting
  html = html.replace(/\\*\\*(.+?)\\*\\*/g, "<strong>$1</strong>");
  html = html.replace(/\\*(.+?)\\*/g, "<em>$1</em>");
  html = html.replace(/_(.+?)_/g, "<em>$1</em>");
  // Wrap consecutive <li> in <ul>
  html = html.replace(/(<li>.*?<\\/li>)+/gs, "<ul>$&</ul>");
  return html;
}

var printCss = 'body{font-family:-apple-system,sans-serif;max-width:900px;margin:40px auto;padding:0 20px;line-height:1.6;color:#222}h1{color:#333;border-bottom:2px solid #ddd;padding-bottom:8px}h2{color:#555;margin-top:24px}h3{color:#666;margin-top:16px}ul{padding-left:20px}li{margin-bottom:4px}blockquote{border-left:3px solid #ddd;padding-left:12px;color:#666;margin:12px 0}hr{border:none;border-top:1px solid #ddd;margin:24px 0}strong{color:#333}em{color:#666}table{border-collapse:collapse;width:100%;margin:12px 0}th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:12px}th{background:#f5f5f5;font-weight:600}p{margin:4px 0}';

function downloadFile(filename, content, mimeType) {
  content = fixNewlines(content);
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

async function exportAnalysisMd(id) {
  const res = await fetch(API + "/api/analyses");
  const all = await res.json();
  const analysis = all.find(a => a.id === id);
  if (!analysis) { alert("Analysis not found"); return; }
  try {
    const content = JSON.parse(repairJson(analysis.content_json));
    const md = analysisToMarkdown(analysis.analysis_type, content, {
      summary: analysis.summary,
      runId: analysis.run_id.slice(0, 8),
      createdAt: analysis.created_at,
    });
    const filename = analysis.analysis_type + "-" + analysis.run_id.slice(0, 8) + ".md";
    downloadFile(filename, md, "text/markdown");
  } catch (e) { alert("Export failed: " + e.message); }
}

async function exportAnalysisPdf(id) {
  const res = await fetch(API + "/api/analyses");
  const all = await res.json();
  const analysis = all.find(a => a.id === id);
  if (!analysis) { alert("Analysis not found"); return; }
  try {
    const content = JSON.parse(repairJson(analysis.content_json));
    const md = analysisToMarkdown(analysis.analysis_type, content, {
      summary: analysis.summary,
      runId: analysis.run_id.slice(0, 8),
      createdAt: analysis.created_at,
    });
    const typeLabels2 = { gap: "Gap Analysis", requirements: "Requirements Analysis", feasibility: "Feasibility Analysis", impact: "Impact Analysis" };
    const title = (typeLabels2[analysis.analysis_type] || analysis.analysis_type) + " — " + analysis.run_id.slice(0, 8);
    const printHtml = '<!DOCTYPE html><html><head><title>' + title + '</title><style>' + printCss + '</style></head><body>' + mdToHtml(md) + '</body></html>';
    const win = window.open("", "_blank");
    win.document.write(printHtml);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  } catch (e) { alert("Export failed: " + e.message); }
}

async function deleteAnalysesForRun(runId, ref) {
  if (!confirm("Delete all analyses for " + ref + "?")) return;
  await fetch(API + "/api/analyses/delete?run=" + encodeURIComponent(runId), { method: "DELETE" });
  analysisSelectedRun = "";
  analysisSelectedId = "";
  renderAnalysesPage();
}

async function exportAllAnalysesMd(runId) {
  const res = await fetch(API + "/api/analyses");
  const all = await res.json();
  const runAnalyses = all.filter(a => a.run_id === runId);
  if (runAnalyses.length === 0) { alert("No analyses found for this run"); return; }

  const typeOrder = ["gap", "requirements", "feasibility", "impact"];
  runAnalyses.sort((a, b) => (typeOrder.indexOf(a.analysis_type) - typeOrder.indexOf(b.analysis_type)));

  const ref = runAnalyses[0].input_ref || runId.slice(0, 8);
  let md = "# Analysis Report — " + ref + "\\n\\n";
  md += "**Run:** " + runId.slice(0, 8) + " · **Generated:** " + runAnalyses[0].created_at + "\\n\\n---\\n\\n";

  for (const analysis of runAnalyses) {
    try {
      const content = JSON.parse(repairJson(analysis.content_json));
      md += analysisToMarkdown(analysis.analysis_type, content, {
        summary: analysis.summary,
        runId: analysis.run_id.slice(0, 8),
        createdAt: analysis.created_at,
      });
      md += "\\n---\\n\\n";
    } catch {}
  }

  downloadFile("analysis-" + ref + "-" + runId.slice(0, 8) + ".md", md, "text/markdown");
}

async function exportAllAnalysesPdf(runId) {
  const res = await fetch(API + "/api/analyses");
  const all = await res.json();
  const runAnalyses = all.filter(a => a.run_id === runId);
  if (runAnalyses.length === 0) { alert("No analyses found for this run"); return; }

  const typeOrder = ["gap", "requirements", "feasibility", "impact"];
  runAnalyses.sort((a, b) => (typeOrder.indexOf(a.analysis_type) - typeOrder.indexOf(b.analysis_type)));

  const ref = runAnalyses[0].input_ref || runId.slice(0, 8);
  let md = "# Analysis Report — " + ref + "\\n\\n";
  md += "**Run:** " + runId.slice(0, 8) + " · **Generated:** " + runAnalyses[0].created_at + "\\n\\n---\\n\\n";

  for (const analysis of runAnalyses) {
    try {
      const content = JSON.parse(repairJson(analysis.content_json));
      md += analysisToMarkdown(analysis.analysis_type, content, {
        summary: analysis.summary,
        runId: analysis.run_id.slice(0, 8),
        createdAt: analysis.created_at,
      });
      md += "\\n---\\n\\n";
    } catch {}
  }

  const title = "Analysis Report — " + ref;
  const printHtml = '<!DOCTYPE html><html><head><title>' + title + '</title><style>' + printCss + '</style></head><body>' + mdToHtml(md) + '</body></html>';
  const win = window.open("", "_blank");
  win.document.write(printHtml);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
}

function renderAnalysisContent(type, content) {
  let html = '';

  if (type === "gap") {
    const sections = [
      { key: "known_facts", label: "Known Facts", color: "var(--green)", icon: "✓" },
      { key: "unknowns", label: "Unknowns", color: "var(--yellow)", icon: "?" },
      { key: "assumptions", label: "Assumptions", color: "var(--orange)", icon: "~" },
      { key: "blocked_items", label: "Blocked", color: "var(--red)", icon: "✗" },
    ];
    for (const s of sections) {
      const items = content[s.key] || [];
      if (items.length === 0) continue;
      html += \`<div class="tc-detail-section">
        <div class="tc-detail-section-title" style="color:\${s.color}">\${s.label} (\${items.length})</div>\`;
      for (const item of items) {
        html += \`<div style="font-size:13px;padding:3px 0"><span style="color:\${s.color};margin-right:6px">\${s.icon}</span>\${esc(item)}</div>\`;
      }
      html += '</div>';
    }
  } else if (type === "requirements") {
    const sections = [
      { key: "explicit_requirements", label: "Explicit", color: "var(--green)" },
      { key: "implicit_requirements", label: "Implicit", color: "var(--accent)" },
      { key: "missing_requirements", label: "Missing", color: "var(--red)" },
      { key: "ambiguous_requirements", label: "Ambiguous", color: "var(--yellow)" },
    ];
    for (const s of sections) {
      const items = content[s.key] || [];
      if (items.length === 0) continue;
      html += \`<div class="tc-detail-section">
        <div class="tc-detail-section-title" style="color:\${s.color}">\${s.label} (\${items.length})</div>\`;
      for (const item of items) {
        html += \`<div style="font-size:13px;padding:3px 0">• \${esc(item)}</div>\`;
      }
      html += '</div>';
    }
  } else if (type === "feasibility") {
    const testable = content.testable;
    html += \`<div style="font-size:14px;font-weight:600;margin-bottom:12px;color:\${testable ? 'var(--green)' : 'var(--red)'}">\${testable ? '✓ Testable' : '✗ Not Testable'}</div>\`;
    if (content.recommended_approach) {
      html += '<div class="tc-detail-section"><div class="tc-detail-section-title">Recommended Approach</div>';
      if (typeof content.recommended_approach === "string") {
        html += \`<div style="font-size:13px">\${esc(content.recommended_approach)}</div>\`;
      } else {
        const ra = content.recommended_approach;
        // Render any known string fields as labeled sections
        const knownFields = [
          ["test_strategy", "Strategy"], ["unit_tests", "Unit Tests"], ["integration_tests", "Integration Tests"],
          ["e2e_tests", "E2E Tests"], ["api_tests", "API Tests"], ["test_data", "Test Data"]
        ];
        for (const [fKey, fLabel] of knownFields) {
          if (ra[fKey] && typeof ra[fKey] === "string") {
            html += \`<div style="margin-top:8px;font-size:13px"><strong>\${fLabel}:</strong> \${esc(ra[fKey])}</div>\`;
          }
        }
        // Render any known array fields
        for (const key of ["test_layers", "test_tools", "coverage_goals"]) {
          const items = ra[key] || [];
          if (items.length === 0) continue;
          const label = key === "test_layers" ? "Test Layers" : key === "test_tools" ? "Test Tools" : "Coverage Goals";
          html += \`<div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--dim)">\${label}</div>\`;
          for (const item of items) html += \`<div style="font-size:12px;padding:2px 0">• \${esc(typeof item === "string" ? item : JSON.stringify(item))}</div>\`;
        }
        // Render any remaining keys not already handled
        const handled = new Set(["test_strategy","unit_tests","integration_tests","e2e_tests","api_tests","test_data","test_layers","test_tools","coverage_goals"]);
        for (const [k, v] of Object.entries(ra)) {
          if (handled.has(k)) continue;
          const label = k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          if (typeof v === "string") {
            html += \`<div style="margin-top:8px;font-size:13px"><strong>\${esc(label)}:</strong> \${esc(v)}</div>\`;
          } else if (Array.isArray(v)) {
            html += \`<div style="margin-top:8px;font-size:12px;font-weight:600;color:var(--dim)">\${esc(label)}</div>\`;
            for (const item of v) html += \`<div style="font-size:12px;padding:2px 0">• \${esc(typeof item === "string" ? item : JSON.stringify(item))}</div>\`;
          }
        }
      }
      html += '</div>';
    }
    for (const key of ["blockers", "risks", "risk_areas"]) {
      const items = content[key] || [];
      if (items.length === 0) continue;
      const label = key === "blockers" ? "Blockers" : key === "risks" ? "Risks" : "Risk Areas";
      const color = key === "blockers" ? "var(--red)" : "var(--yellow)";
      html += \`<div class="tc-detail-section"><div class="tc-detail-section-title" style="color:\${color}">\${label} (\${items.length})</div>\`;
      for (const item of items) {
        if (typeof item === "string") {
          html += \`<div style="font-size:13px;padding:3px 0">• \${esc(item)}</div>\`;
        } else {
          const title = item.risk || item.area || item.description || item.reason || "";
          const detail = item.description && item.description !== title ? item.description : "";
          const sev = item.severity || "";
          const sevColor = sev === "high" || sev === "critical" ? "var(--red)" : sev === "medium" ? "var(--yellow)" : sev === "low" ? "var(--dim)" : "";
          html += \`<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
            \${title ? \`<span style="color:var(--accent);font-weight:600">\${esc(title)}</span>\` : ""}
            \${sev ? \`<span style="font-size:10px;padding:1px 5px;border-radius:3px;margin-left:6px;background:rgba(125,133,144,0.1);color:\${sevColor}">\${esc(sev)}</span>\` : ""}
            \${detail ? \`<br>\${esc(detail)}\` : ""}
            \${item.mitigation ? \`<div style="font-size:11px;color:var(--green);margin-top:2px">→ \${esc(item.mitigation)}</div>\` : ""}
          </div>\`;
        }
      }
      html += '</div>';
    }
  } else if (type === "impact") {
    if (content.summary) {
      html += \`<div style="font-size:13px;padding:8px;background:rgba(248,81,73,0.1);border-radius:4px;margin-bottom:16px;color:var(--red)">\${esc(content.summary)}</div>\`;
    }
    const sections = [
      { key: "impacted_areas", label: "Impacted Areas", color: "var(--red)" },
      { key: "dependency_risks", label: "Dependency Risks", color: "var(--orange)" },
      { key: "config_concerns", label: "Config Concerns", color: "var(--yellow)" },
      { key: "compatibility_issues", label: "Compatibility Issues", color: "var(--red)" },
      { key: "infrastructure_concerns", label: "Infrastructure", color: "var(--purple)" },
      { key: "hidden_edge_cases", label: "Hidden Edge Cases", color: "var(--accent)" },
      { key: "existing_test_gaps", label: "Test Gaps", color: "var(--yellow)" },
      { key: "regression_risks", label: "Regression Risks", color: "var(--red)" },
    ];
    for (const s of sections) {
      const items = content[s.key] || [];
      if (items.length === 0) continue;
      html += \`<div class="tc-detail-section"><div class="tc-detail-section-title" style="color:\${s.color}">\${s.label} (\${items.length})</div>\`;
      for (const item of items) {
        if (typeof item === "string") {
          html += \`<div style="font-size:13px;padding:3px 0">• \${esc(item)}</div>\`;
        } else {
          // Handle multiple object shapes from different analysis runs
          const title = item.area || item.risk || item.concern || item.file || item.description || item.reason || "";
          const detail = item.details || item.impact || item.changes || item.scope || item.description || item.mitigation || "";
          const sev = item.severity || "";
          const sevColor = sev === "high" || sev === "critical" ? "var(--red)" : sev === "medium" ? "var(--yellow)" : sev === "low" ? "var(--dim)" : "";
          const files = item.files || item.affected || item.dependencies || null;
          const extra = item.change_type || item.mitigation || null;

          html += \`<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
            \${sev ? \`<span style="color:\${sevColor};font-size:10px;font-weight:600;margin-right:6px">[\${sev.toUpperCase()}]</span>\` : ""}
            \${title ? \`<span style="font-weight:600;color:var(--accent)">\${esc(title)}</span>\` : ""}
            \${detail && detail !== title ? \`<div style="font-size:12px;color:var(--text);margin-top:2px">\${esc(detail)}</div>\` : ""}
            \${extra ? \`<div style="font-size:11px;color:var(--green);margin-top:2px">→ \${esc(extra)}</div>\` : ""}
            \${files ? \`<div style="font-size:10px;color:var(--dim);margin-top:3px;font-family:monospace">\${Array.isArray(files) ? files.map(f => esc(f)).join(", ") : esc(JSON.stringify(files))}</div>\` : ""}
          </div>\`;
        }
      }
      html += '</div>';
    }
  } else {
    // Generic JSON display
    html += \`<pre style="font-size:12px;color:var(--dim);white-space:pre-wrap;max-height:500px;overflow:auto">\${esc(JSON.stringify(content, null, 2))}</pre>\`;
  }

  return html;
}

// ── Plans Page ──

let plansSelectedTicket = "";
let plansSelectedPlan = "";

async function renderPlansPage() {
  const app = document.getElementById("app");

  const ticketsRes = await fetch(API + "/api/plans/tickets");
  const tickets = await ticketsRes.json();

  if (tickets.length === 0 && !plansSelectedTicket) {
    app.innerHTML = '<div class="panel"><div class="empty">No plans yet. Use /noob-plan when a ticket is ready for QA.</div></div>';
    return;
  }

  let html = "";

  // ── Level 1: Ticket list ──
  if (!plansSelectedTicket) {
    const totalPlans = tickets.reduce((s, t) => s + t.plan_count, 0);
    const totalSteps = tickets.reduce((s, t) => s + t.total_steps, 0);

    html += '<div class="panel" style="margin-bottom:8px">';
    html += '<div class="panel-title">Test Plans by Ticket</div>';
    html += '<div style="display:flex;gap:16px">';
    html += \`<div class="stat"><div class="stat-value">\${tickets.length}</div><div class="stat-label">Tickets</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${totalPlans}</div><div class="stat-label">Plans</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${totalSteps}</div><div class="stat-label">Steps</div></div>\`;
    html += '</div></div>';

    html += '<div class="panel">';
    for (const t of tickets) {
      html += \`<div class="session-card" onclick="plansSelectedTicket='\${esc(t.ticket_id)}';plansSelectedPlan='';renderPlansPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(t.ticket_id)}</span>
          <span style="font-size:11px;color:var(--dim)">\${t.plan_count} plan\${t.plan_count > 1 ? "s" : ""}</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
          <span class="suite-badge" style="background:rgba(88,166,255,0.15);color:var(--accent)">\${t.total_steps} steps</span>
          \${t.confident ? \`<span class="suite-badge passed">\${t.confident} confident</span>\` : ""}
          \${t.uncertain ? \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">\${t.uncertain} uncertain</span>\` : ""}
        </div>
        <div class="session-meta"><span>\${t.last_plan || ""}</span></div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // ── Level 2: Plans for a Ticket ──
  if (!plansSelectedPlan) {
    const plansRes = await fetch(API + "/api/plans?ticket=" + encodeURIComponent(plansSelectedTicket));
    const plans = await plansRes.json();

    html += '<div class="panel" style="margin-bottom:8px">';
    html += \`<div class="breadcrumb">
      <span class="breadcrumb-item" onclick="plansSelectedTicket='';plansSelectedPlan='';renderPlansPage()">Plans</span>
      <span class="breadcrumb-sep">|</span>
      <span class="breadcrumb-item current">\${esc(plansSelectedTicket)}</span>
    </div>\`;
    html += '<div style="display:flex;gap:16px">';
    html += \`<div class="stat"><div class="stat-value">\${plans.length}</div><div class="stat-label">Plans</div></div>\`;
    html += '</div></div>';

    html += '<div class="panel">';
    for (const p of plans) {
      html += \`<div class="session-card" onclick="plansSelectedPlan='\${esc(p.id)}';renderPlansPage()">
        <div class="session-header">
          <span class="session-id">\${esc(p.id.slice(0, 8))}</span>
          <span style="font-size:11px;color:var(--dim)">\${p.step_count || 0} steps</span>
        </div>
        \${p.strategy ? \`<div style="font-size:12px;color:var(--dim);margin-top:4px">\${esc(p.strategy.slice(0, 80))}</div>\` : ""}
        <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
          \${p.confident_count ? \`<span class="suite-badge passed">\${p.confident_count} confident</span>\` : ""}
          \${p.uncertain_count ? \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">\${p.uncertain_count} uncertain</span>\` : ""}
        </div>
        <div class="session-meta"><span>\${p.created_at || ""}</span></div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // ── Level 3: Plan detail — steps table ──
  const detailRes = await fetch(API + "/api/plans?id=" + encodeURIComponent(plansSelectedPlan));
  const detail = await detailRes.json();
  const plan = detail.plan;
  const steps = detail.steps || [];

  const blockers = plan.blockers ? (() => { try { return JSON.parse(plan.blockers); } catch { return []; } })() : [];
  const gaps = plan.coverage_gaps ? (() => { try { return JSON.parse(plan.coverage_gaps); } catch { return []; } })() : [];
  const mrRefs = plan.mr_refs ? (() => { try { return JSON.parse(plan.mr_refs); } catch { return []; } })() : [];
  const linkedAnalyses = detail.linkedAnalyses || [];
  const normalizedGaps = detail.coverageGaps || [];
  const normalizedBlockers = detail.blockers || [];

  // Stats + breadcrumb
  html += '<div class="panel" style="margin-bottom:8px">';
  html += \`<div class="breadcrumb">
    <span class="breadcrumb-item" onclick="plansSelectedTicket='';plansSelectedPlan='';renderPlansPage()">Plans</span>
    <span class="breadcrumb-sep">|</span>
    <span class="breadcrumb-item" onclick="plansSelectedPlan='';renderPlansPage()">\${esc(plansSelectedTicket)}</span>
    <span class="breadcrumb-sep">|</span>
    <span class="breadcrumb-item current">\${esc(plansSelectedPlan.slice(0, 8))}</span>
  </div>\`;
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">';
  html += \`<div class="stat"><div class="stat-value">\${steps.length}</div><div class="stat-label">Steps</div></div>\`;
  const confident = steps.filter(s => s.confidence === "confident").length;
  const uncertain = steps.filter(s => s.confidence === "uncertain").length;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${confident}</div><div class="stat-label">Confident</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--yellow)">\${uncertain}</div><div class="stat-label">Uncertain</div></div>\`;
  if (blockers.length) html += \`<span class="suite-badge failed">\${blockers.length} blockers</span>\`;
  if (gaps.length) html += \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">\${gaps.length} gaps</span>\`;
  if (mrRefs.length) html += \`<span class="suite-badge" style="background:rgba(88,166,255,0.15);color:var(--accent)">\${mrRefs.length} MRs</span>\`;
  if (linkedAnalyses.length) html += \`<span class="suite-badge" style="background:rgba(188,140,255,0.15);color:var(--purple)">\${linkedAnalyses.length} linked analyses</span>\`;
  html += \`<button onclick="deletePlan('\${plansSelectedPlan}')" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;margin-left:auto" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete Plan</button>\`;
  html += '</div>';
  // Tabs: Plan | Steps | Blockers | Gaps | Analysis | Notes
  html += '<div style="display:flex;gap:6px;margin-top:8px;align-items:center">';
  html += '<div class="tab active" data-plantab="requirements" onclick="switchPlanTab(this,\\'requirements\\')">Plan</div>';
  html += '<div class="tab" data-plantab="steps" onclick="switchPlanTab(this,\\'steps\\')">Steps (' + steps.length + ')</div>';
  if (normalizedBlockers.length > 0 || blockers.length > 0) html += '<div class="tab" data-plantab="blockers" onclick="switchPlanTab(this,\\'blockers\\')">Blockers (' + (normalizedBlockers.length || blockers.length) + ')</div>';
  if (normalizedGaps.length > 0 || gaps.length > 0) html += '<div class="tab" data-plantab="gaps" onclick="switchPlanTab(this,\\'gaps\\')">Gaps (' + (normalizedGaps.length || gaps.length) + ')</div>';
  if (linkedAnalyses.length > 0) html += '<div class="tab" data-plantab="analysis" onclick="switchPlanTab(this,\\'analysis\\')">Analysis</div>';
  html += '<div class="tab" data-plantab="testnotes" onclick="switchPlanTab(this,\\'testnotes\\')">Notes</div>';
  html += '<div style="margin-left:auto;display:flex;gap:4px">';
  html += '<button onclick="exportPlanTabMd(\\'' + plansSelectedPlan + '\\')" style="font-size:9px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:2px 6px;cursor:pointer" onmouseover="this.style.borderColor=\\'var(--accent)\\'" onmouseout="this.style.borderColor=\\'var(--border)\\'">Tab MD</button>';
  html += '<button onclick="exportPlanTabPdf(\\'' + plansSelectedPlan + '\\')" style="font-size:9px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:2px 6px;cursor:pointer" onmouseover="this.style.borderColor=\\'var(--accent)\\'" onmouseout="this.style.borderColor=\\'var(--border)\\'">Tab PDF</button>';
  html += '<span style="border-left:1px solid var(--border);margin:0 2px"></span>';
  html += '<button onclick="exportPlanMd(\\'' + plansSelectedPlan + '\\')" style="font-size:9px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:2px 6px;cursor:pointer" onmouseover="this.style.borderColor=\\'var(--accent)\\'" onmouseout="this.style.borderColor=\\'var(--border)\\'">All MD</button>';
  html += '<button onclick="exportPlanPdf(\\'' + plansSelectedPlan + '\\')" style="font-size:9px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:2px 6px;cursor:pointer" onmouseover="this.style.borderColor=\\'var(--accent)\\'" onmouseout="this.style.borderColor=\\'var(--border)\\'">All PDF</button>';
  html += '</div>';
  html += '</div>';
  html += '</div>';

  // Parse plan sections from plan_json
  let sections = {};
  try { sections = JSON.parse(plan.plan_json || "{}"); } catch {}

  // Section labels for the planning table
  const sectionDefs = [
    { key: "importance", label: "Feature Importance", color: "var(--accent)" },
    { key: "regressions", label: "Regressions & Affected Areas", color: "var(--orange)" },
    { key: "requirements", label: "Requirements", color: "var(--green)" },
    { key: "functionality", label: "Functionality to Test", color: "var(--accent)" },
    { key: "nonFunctional", label: "Non-Functional Testing", color: "var(--purple)" },
    { key: "automation", label: "Automation Scope", color: "var(--accent)" },
    { key: "testData", label: "Test Data", color: "var(--dim)" },
    { key: "environments", label: "Test Environments", color: "var(--dim)" },
    { key: "platforms", label: "Platforms & Browsers", color: "var(--dim)" },
    { key: "tools", label: "Tools & Helpers", color: "var(--dim)" },
    { key: "featureFlags", label: "Feature Flags", color: "var(--yellow)" },
    { key: "security", label: "Security", color: "var(--red)" },
    { key: "performance", label: "Performance", color: "var(--orange)" },
    { key: "dependencies", label: "Dependencies", color: "var(--accent)" },
    { key: "outOfScope", label: "Out of Scope", color: "var(--dim)" },
    { key: "questions", label: "Questions for Developers", color: "var(--yellow)" },
    { key: "postRelease", label: "Post-Release Checks", color: "var(--green)" },
    { key: "testNotes", label: "Test Notes & Priority", color: "var(--accent)" },
  ];

  const hasSections = sectionDefs.some(s => sections[s.key]) || blockers.length > 0 || gaps.length > 0 || mrRefs.length > 0 || plan.strategy;

  // ── TAB: Requirements (plan sections table) ──
  html += '<div id="plantab-requirements" style="flex:1;min-height:0;overflow-y:auto">';

  if (hasSections) {
    html += '<div class="panel" style="padding:0;margin-bottom:8px">';
    html += '<table class="data-table">';
    html += '<thead style="position:sticky;top:0;z-index:1;background:var(--surface)"><tr>';
    html += '<th style="width:200px">Section</th>';
    html += '<th>Details</th>';
    html += '</tr></thead><tbody>';

    // Strategy as first row
    if (plan.strategy) {
      html += \`<tr>
        <td style="font-weight:600;color:var(--accent);font-size:11px;vertical-align:top">Strategy</td>
        <td style="font-size:12px;color:var(--text);white-space:pre-wrap">\${esc(plan.strategy)}</td>
      </tr>\`;
    }

    for (const sd of sectionDefs) {
      const val = sections[sd.key];
      if (!val) continue;
      const content = typeof val === "string" ? val : Array.isArray(val) ? val.join("; ") : JSON.stringify(val);
      html += \`<tr>
        <td style="font-weight:600;color:\${sd.color};font-size:11px;vertical-align:top">\${esc(sd.label)}</td>
        <td style="font-size:12px;color:var(--text);white-space:pre-wrap">\${esc(content)}</td>
      </tr>\`;
    }

    // Also show blockers, gaps, MRs in the table
    if (blockers.length > 0) {
      html += '<tr><td style="font-weight:600;color:var(--red);font-size:11px;vertical-align:top">Blockers</td>';
      html += '<td style="font-size:12px">' + blockers.map(b => '<div style="color:var(--red);padding:1px 0">' + esc(typeof b === "string" ? b : JSON.stringify(b)) + '</div>').join("") + '</td></tr>';
    }
    if (gaps.length > 0) {
      html += '<tr><td style="font-weight:600;color:var(--yellow);font-size:11px;vertical-align:top">Coverage Gaps</td>';
      html += '<td style="font-size:12px">' + gaps.map(g => '<div style="color:var(--yellow);padding:1px 0">' + esc(typeof g === "string" ? g : JSON.stringify(g)) + '</div>').join("") + '</td></tr>';
    }
    if (mrRefs.length > 0) {
      html += '<tr><td style="font-weight:600;color:var(--accent);font-size:11px;vertical-align:top">MR References</td>';
      html += '<td style="font-size:12px">' + mrRefs.map(m => '<div style="color:var(--accent);padding:1px 0">' + esc(typeof m === "string" ? m : JSON.stringify(m)) + '</div>').join("") + '</td></tr>';
    }

    html += '</tbody></table></div>';
  } else {
    // No sections — show blockers/gaps/MRs as panels (legacy)
    if (blockers.length > 0) {
      html += '<div class="panel" style="margin-bottom:8px"><div class="panel-title" style="color:var(--red)">Blockers</div>';
      for (const b of blockers) html += \`<div style="font-size:11px;color:var(--dim);padding:3px 0;border-bottom:1px solid var(--border)">\${esc(typeof b === "string" ? b : JSON.stringify(b))}</div>\`;
      html += '</div>';
    }
    if (gaps.length > 0) {
      html += '<div class="panel" style="margin-bottom:8px"><div class="panel-title" style="color:var(--yellow)">Coverage Gaps</div>';
      for (const g of gaps) html += \`<div style="font-size:11px;color:var(--dim);padding:3px 0;border-bottom:1px solid var(--border)">\${esc(typeof g === "string" ? g : JSON.stringify(g))}</div>\`;
      html += '</div>';
    }
    if (mrRefs.length > 0) {
      html += '<div class="panel" style="margin-bottom:8px"><div class="panel-title" style="color:var(--accent)">MR References</div>';
      for (const m of mrRefs) html += \`<div style="font-size:11px;color:var(--accent);padding:3px 0">\${esc(typeof m === "string" ? m : JSON.stringify(m))}</div>\`;
      html += '</div>';
    }
  }

  html += '</div>'; // end requirements tab

  // ── TAB: Steps table (hidden by default) ──
  html += '<div id="plantab-steps" style="flex:1;min-height:0;overflow-y:auto;display:none">';
  html += '<div class="panel" style="padding:0">';
  html += '<table class="data-table">';
  html += '<thead style="position:sticky;top:0;z-index:1;background:var(--surface)"><tr>';
  html += '<th style="width:30px">#</th>';
  html += '<th style="width:50%">Description</th>';
  html += '<th style="width:80px">Confidence</th>';
  html += '<th style="width:80px">Category</th>';
  html += '<th style="width:70px">Priority</th>';
  html += '<th style="width:70px">Status</th>';
  html += '<th>Linked To</th>';
  html += '</tr></thead><tbody>';

  for (const s of steps) {
    const confColor = s.confidence === "confident" ? "var(--green)" : "var(--yellow)";
    const statusColor = s.status === "passed" ? "var(--green)" : s.status === "failed" ? "var(--red)" : "var(--dim)";
    html += \`<tr>
      <td style="color:var(--dim)">\${s.step_order}</td>
      <td>
        <div style="font-size:12px">\${esc(s.description)}</div>
        \${s.source ? \`<div style="font-size:9px;color:var(--dim);margin-top:2px">Source: \${esc(s.source)}</div>\` : ""}
        \${s.page_url ? \`<div style="font-size:9px;color:var(--accent);margin-top:1px">@ \${esc(s.page_url)}</div>\` : ""}
      </td>
      <td><span style="color:\${confColor};font-size:10px;font-weight:600">\${esc(s.confidence)}</span></td>
      <td><span style="color:var(--accent);font-size:10px">\${esc(s.category || "—")}</span></td>
      <td><span style="font-size:10px;color:var(--dim)">\${s.priority || "—"}</span></td>
      <td><span style="color:\${statusColor};font-size:10px;font-weight:600">\${esc(s.status).toUpperCase()}</span></td>
      <td style="font-size:10px">
        \${s.tc_title ? \`<div style="color:var(--green)">TC: \${esc(s.tc_title.slice(0, 35))}</div>\` : '<div style="color:var(--dim)">No test case</div>'}
        \${s.mr_ref ? \`<div style="color:var(--accent)">MR: \${esc(s.mr_ref)}</div>\` : ""}
        \${s.uimap_url ? \`<div style="color:var(--purple)">UI: \${esc(s.uimap_url)}</div>\` : ""}
      </td>
    </tr>\`;
  }

  html += '</tbody></table></div>';
  html += '</div>'; // end steps tab

  // ── TAB: Test Notes (hidden by default) ──
  // ── TAB: Blockers (normalized) ──
  html += '<div id="plantab-blockers" style="flex:1;min-height:0;overflow-y:auto;display:none">';
  if (normalizedBlockers.length > 0) {
    html += '<div class="panel" style="padding:0">';
    html += '<table class="data-table"><thead><tr><th>Blocker</th><th>Severity</th><th>Status</th><th>Resolution</th><th></th></tr></thead><tbody>';
    for (const b of normalizedBlockers) {
      const sc = b.severity === "high" || b.severity === "critical" ? "var(--red)" : b.severity === "medium" ? "var(--yellow)" : "var(--dim)";
      const stColor = b.status === "open" ? "var(--red)" : "var(--green)";
      html += '<tr>';
      html += '<td style="font-size:12px">' + esc(b.description) + '</td>';
      html += '<td style="color:' + sc + ';font-weight:600;font-size:11px;white-space:nowrap">' + esc(b.severity || "-") + '</td>';
      html += '<td style="color:' + stColor + ';font-weight:600;font-size:11px;white-space:nowrap">' + esc(b.status) + '</td>';
      html += '<td style="font-size:11px;color:var(--dim)">' + esc(b.resolution || "-") + '</td>';
      if (b.status === "open") {
        html += '<td><button onclick="resolveBlocker(\\'' + b.id + '\\')" style="font-size:10px;color:var(--green);background:none;border:1px solid var(--border);border-radius:3px;padding:2px 6px;cursor:pointer">Resolve</button></td>';
      } else {
        html += '<td style="font-size:10px;color:var(--dim)">' + esc(b.resolved_at || "") + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  } else if (blockers.length > 0) {
    html += '<div class="panel" style="padding:12px">';
    for (const b of blockers) html += '<div style="font-size:12px;color:var(--red);padding:3px 0;border-bottom:1px solid var(--border)">• ' + esc(typeof b === "string" ? b : JSON.stringify(b)) + '</div>';
    html += '</div>';
  } else {
    html += '<div class="panel" style="padding:12px;text-align:center;color:var(--dim)">No blockers identified.</div>';
  }
  html += '</div>';

  // ── TAB: Coverage Gaps (normalized) ──
  html += '<div id="plantab-gaps" style="flex:1;min-height:0;overflow-y:auto;display:none">';
  if (normalizedGaps.length > 0) {
    html += '<div class="panel" style="padding:0">';
    html += '<table class="data-table"><thead><tr><th>Gap</th><th>Severity</th><th>Category</th></tr></thead><tbody>';
    for (const g of normalizedGaps) {
      const sc = g.severity === "high" || g.severity === "critical" ? "var(--red)" : g.severity === "medium" ? "var(--yellow)" : "var(--dim)";
      html += '<tr><td style="font-size:12px">' + esc(g.gap_description) + '</td>';
      html += '<td style="color:' + sc + ';font-weight:600;font-size:11px">' + esc(g.severity || "-") + '</td>';
      html += '<td style="font-size:11px;color:var(--dim)">' + esc(g.category || "-") + '</td></tr>';
    }
    html += '</tbody></table></div>';
  } else if (gaps.length > 0) {
    html += '<div class="panel" style="padding:12px">';
    for (const g of gaps) html += '<div style="font-size:12px;color:var(--yellow);padding:3px 0;border-bottom:1px solid var(--border)">• ' + esc(typeof g === "string" ? g : JSON.stringify(g)) + '</div>';
    html += '</div>';
  } else {
    html += '<div class="panel" style="padding:12px;text-align:center;color:var(--dim)">No coverage gaps identified.</div>';
  }
  html += '</div>';

  // ── TAB: Linked Analysis ──
  html += '<div id="plantab-analysis" style="flex:1;min-height:0;overflow-y:auto;display:none">';
  if (linkedAnalyses.length > 0) {
    const typeColors = { gap: "var(--yellow)", requirements: "var(--accent)", feasibility: "var(--green)", impact: "var(--red)" };
    const typeLabels = { gap: "Gap Analysis", requirements: "Requirements", feasibility: "Feasibility", impact: "Impact Analysis" };
    for (const a of linkedAnalyses) {
      const color = typeColors[a.analysis_type] || "var(--dim)";
      const label = typeLabels[a.analysis_type] || a.analysis_type;
      html += '<div class="panel" style="margin-bottom:8px">';
      html += '<div style="font-size:13px;font-weight:600;color:' + color + ';margin-bottom:4px">' + esc(label) + '</div>';
      if (a.summary) html += '<div style="font-size:12px;color:var(--dim);margin-bottom:8px">' + esc(a.summary) + '</div>';
      try {
        const content = JSON.parse(repairJson(a.content_json));
        html += renderAnalysisContent(a.analysis_type, content);
      } catch {
        html += '<pre style="font-size:11px;color:var(--dim);white-space:pre-wrap;max-height:300px;overflow:auto">' + esc(a.content_json) + '</pre>';
      }
      html += '</div>';
    }
  } else {
    html += '<div class="panel" style="padding:12px;text-align:center;color:var(--dim)">No linked analysis. Set analysis_run_id when creating the plan to link prior analysis.</div>';
  }
  html += '</div>';

  html += '<div id="plantab-testnotes" style="flex:1;min-height:0;overflow-y:auto;display:none">';
  const testNotes = plan.test_notes || "";
  if (testNotes) {
    html += '<div class="panel" style="padding:12px">';
    html += '<pre style="font-size:12px;color:var(--text);white-space:pre-wrap;margin:0;font-family:inherit;line-height:1.6">' + esc(testNotes) + '</pre>';
    html += '</div>';
  } else {
    html += '<div class="panel" style="padding:12px;text-align:center;color:var(--dim)">No test notes available for this plan.</div>';
  }
  html += '</div>'; // end test notes tab

  setPage(html);
}

// ── Plan Export ──

async function exportPlanMd(planId) {
  const planRes = await fetch(API + "/api/plans?id=" + encodeURIComponent(planId));
  const planData = await planRes.json();
  if (!planData || !planData.plan) { alert("Plan not found"); return; }
  const plan = planData.plan;
  const steps = planData.steps || [];
  const blockers = planData.blockers || [];
  const gaps = planData.coverageGaps || planData.gaps || [];
  const ticket = plan.ticket_id || planId.slice(0, 8);

  let md = "# Test Plan — " + ticket + "\\n\\n";
  md += "**Plan ID:** " + planId.slice(0, 8) + " · **Created:** " + plan.created_at + "\\n\\n";

  // Strategy
  if (plan.strategy) md += "## Strategy\\n\\n" + plan.strategy + "\\n\\n";

  // Plan sections
  let sections = {};
  try { sections = JSON.parse(plan.plan_json || "{}"); } catch {}
  const sectionDefs = [
    ["importance","Feature Importance"],["regressions","Regressions & Affected Areas"],["requirements","Requirements"],
    ["functionality","Functionality to Test"],["nonFunctional","Non-Functional Testing"],["automation","Automation Scope"],
    ["testData","Test Data"],["environments","Test Environments"],["platforms","Platforms & Browsers"],
    ["tools","Tools & Helpers"],["featureFlags","Feature Flags"],["security","Security"],
    ["performance","Performance"],["dependencies","Dependencies"],["outOfScope","Out of Scope"],
    ["questions","Questions for Developers"],["postRelease","Post-Release Checks"],["testNotes","Test Notes & Priority"],
  ];
  for (const [key, label] of sectionDefs) {
    const val = sections[key];
    if (!val) continue;
    md += "## " + label + "\\n\\n";
    if (Array.isArray(val)) { for (const item of val) md += "- " + (typeof item === "string" ? item : JSON.stringify(item)) + "\\n"; }
    else if (typeof val === "string") md += val + "\\n";
    else md += JSON.stringify(val, null, 2) + "\\n";
    md += "\\n";
  }

  // Steps
  if (steps.length > 0) {
    md += "## Steps (" + steps.length + ")\\n\\n";
    md += "| # | Description | Confidence | Category | Priority | Status |\\n";
    md += "|---|-------------|------------|----------|----------|--------|\\n";
    for (const s of steps) {
      md += "| " + s.step_order + " | " + (s.description || "").replace(/\\|/g, "/") + " | " + (s.confidence || "-") + " | " + (s.category || "-") + " | " + (s.priority || "-") + " | " + (s.status || "-") + " |\\n";
    }
    md += "\\n";
  }

  // Blockers
  if (blockers.length > 0) {
    md += "## Blockers (" + blockers.length + ")\\n\\n";
    for (const b of blockers) {
      const desc = b.description || (typeof b === "string" ? b : JSON.stringify(b));
      const sev = b.severity ? " [" + b.severity.toUpperCase() + "]" : "";
      const status = b.status ? " (" + b.status + ")" : "";
      md += "- " + sev + " " + desc + status + "\\n";
    }
    md += "\\n";
  }

  // Gaps
  if (gaps.length > 0) {
    md += "## Coverage Gaps (" + gaps.length + ")\\n\\n";
    for (const g of gaps) {
      const desc = g.gap_description || (typeof g === "string" ? g : JSON.stringify(g));
      const sev = g.severity ? " [" + g.severity.toUpperCase() + "]" : "";
      md += "- " + sev + " " + desc + "\\n";
    }
    md += "\\n";
  }

  // Test Notes
  if (plan.test_notes) {
    md += "## Test Notes\\n\\n" + plan.test_notes + "\\n\\n";
  }

  downloadFile("plan-" + ticket + "-" + planId.slice(0, 8) + ".md", md, "text/markdown");
}

async function exportPlanPdf(planId) {
  const planRes = await fetch(API + "/api/plans?id=" + encodeURIComponent(planId));
  const planData = await planRes.json();
  if (!planData || !planData.plan) { alert("Plan not found"); return; }
  const plan = planData.plan;
  const ticket = plan.ticket_id || planId.slice(0, 8);

  // Reuse MD generation then convert to print HTML
  // Temporarily call exportPlanMd logic but capture the md string
  const steps = planData.steps || [];
  const blockers = planData.blockers || [];
  const gaps = planData.coverageGaps || planData.gaps || [];

  let md = "# Test Plan — " + ticket + "\\n\\n";
  md += "**Plan ID:** " + planId.slice(0, 8) + " · **Created:** " + plan.created_at + "\\n\\n";
  if (plan.strategy) md += "## Strategy\\n\\n" + plan.strategy + "\\n\\n";

  let sections = {};
  try { sections = JSON.parse(plan.plan_json || "{}"); } catch {}
  const sectionDefs = [
    ["importance","Feature Importance"],["regressions","Regressions & Affected Areas"],["requirements","Requirements"],
    ["functionality","Functionality to Test"],["nonFunctional","Non-Functional Testing"],["automation","Automation Scope"],
    ["testData","Test Data"],["environments","Test Environments"],["platforms","Platforms & Browsers"],
    ["tools","Tools & Helpers"],["featureFlags","Feature Flags"],["security","Security"],
    ["performance","Performance"],["dependencies","Dependencies"],["outOfScope","Out of Scope"],
    ["questions","Questions for Developers"],["postRelease","Post-Release Checks"],["testNotes","Test Notes & Priority"],
  ];
  for (const [key, label] of sectionDefs) {
    const val = sections[key];
    if (!val) continue;
    md += "## " + label + "\\n\\n";
    if (Array.isArray(val)) { for (const item of val) md += "- " + (typeof item === "string" ? item : JSON.stringify(item)) + "\\n"; }
    else if (typeof val === "string") md += val + "\\n";
    else md += JSON.stringify(val, null, 2) + "\\n";
    md += "\\n";
  }
  if (steps.length > 0) {
    md += "## Steps (" + steps.length + ")\\n\\n";
    md += "| # | Description | Confidence | Category | Priority | Status |\\n";
    md += "|---|-------------|------------|----------|----------|--------|\\n";
    for (const s of steps) {
      md += "| " + s.step_order + " | " + (s.description || "").replace(/\\|/g, "/") + " | " + (s.confidence || "-") + " | " + (s.category || "-") + " | " + (s.priority || "-") + " | " + (s.status || "-") + " |\\n";
    }
    md += "\\n";
  }
  if (blockers.length > 0) {
    md += "## Blockers\\n\\n";
    for (const b of blockers) md += "- " + (b.description || JSON.stringify(b)) + "\\n";
    md += "\\n";
  }
  if (gaps.length > 0) {
    md += "## Coverage Gaps\\n\\n";
    for (const g of gaps) md += "- " + (g.gap_description || JSON.stringify(g)) + "\\n";
    md += "\\n";
  }
  if (plan.test_notes) md += "## Test Notes\\n\\n" + plan.test_notes + "\\n\\n";

  const title = "Test Plan — " + ticket;
  const printHtml = '<!DOCTYPE html><html><head><title>' + title + '</title><style>' + printCss + '</style></head><body>' + mdToHtml(md) + '</body></html>';
  const win = window.open("", "_blank");
  win.document.write(printHtml);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
}

// Track active plan tab for per-tab export
let _activePlanTab = "requirements";

function getPlanTabMd(planData, tab) {
  const plan = planData.plan;
  const steps = planData.steps || [];
  const blockers = planData.blockers || [];
  const gaps = planData.coverageGaps || planData.gaps || [];
  const ticket = plan.ticket_id || "";

  let sections = {};
  try { sections = JSON.parse(plan.plan_json || "{}"); } catch {}

  const sectionDefs = [
    ["importance","Feature Importance"],["regressions","Regressions & Affected Areas"],["requirements","Requirements"],
    ["functionality","Functionality to Test"],["nonFunctional","Non-Functional Testing"],["automation","Automation Scope"],
    ["testData","Test Data"],["environments","Test Environments"],["platforms","Platforms & Browsers"],
    ["tools","Tools & Helpers"],["featureFlags","Feature Flags"],["security","Security"],
    ["performance","Performance"],["dependencies","Dependencies"],["outOfScope","Out of Scope"],
    ["questions","Questions for Developers"],["postRelease","Post-Release Checks"],["testNotes","Test Notes & Priority"],
  ];

  if (tab === "requirements") {
    let md = "# Test Plan — " + ticket + "\\n\\n";
    if (plan.strategy) md += "## Strategy\\n\\n" + plan.strategy + "\\n\\n";
    for (const [key, label] of sectionDefs) {
      const val = sections[key];
      if (!val) continue;
      md += "## " + label + "\\n\\n";
      if (Array.isArray(val)) { for (const item of val) md += "- " + (typeof item === "string" ? item : JSON.stringify(item)) + "\\n"; }
      else if (typeof val === "string") md += val + "\\n";
      else md += JSON.stringify(val, null, 2) + "\\n";
      md += "\\n";
    }
    return { md, filename: "plan-" + ticket };
  }

  if (tab === "steps") {
    let md = "# Test Steps — " + ticket + "\\n\\n";
    md += "| # | Description | Confidence | Category | Priority | Status |\\n";
    md += "|---|-------------|------------|----------|----------|--------|\\n";
    for (const s of steps) {
      md += "| " + s.step_order + " | " + (s.description || "").replace(/\\|/g, "/") + " | " + (s.confidence || "-") + " | " + (s.category || "-") + " | " + (s.priority || "-") + " | " + (s.status || "-") + " |\\n";
    }
    return { md, filename: "steps-" + ticket };
  }

  if (tab === "blockers") {
    let md = "# Blockers — " + ticket + "\\n\\n";
    for (const b of blockers) {
      const desc = b.description || (typeof b === "string" ? b : JSON.stringify(b));
      const sev = b.severity ? " [" + b.severity.toUpperCase() + "]" : "";
      const status = b.status ? " (" + b.status + ")" : "";
      md += "-" + sev + " " + desc + status + "\\n";
    }
    return { md, filename: "blockers-" + ticket };
  }

  if (tab === "gaps") {
    let md = "# Coverage Gaps — " + ticket + "\\n\\n";
    for (const g of gaps) {
      const desc = g.gap_description || (typeof g === "string" ? g : JSON.stringify(g));
      const sev = g.severity ? " [" + g.severity.toUpperCase() + "]" : "";
      md += "-" + sev + " " + desc + "\\n";
    }
    return { md, filename: "gaps-" + ticket };
  }

  if (tab === "testnotes") {
    const notes = plan.test_notes || "No test notes.";
    let md = "# Test Notes — " + ticket + "\\n\\n" + notes + "\\n";
    return { md, filename: "testnotes-" + ticket };
  }

  return { md: "No content for this tab.", filename: "export-" + ticket };
}

async function exportPlanTabMd(planId) {
  const planRes = await fetch(API + "/api/plans?id=" + encodeURIComponent(planId));
  const planData = await planRes.json();
  if (!planData || !planData.plan) { alert("Plan not found"); return; }
  const result = getPlanTabMd(planData, _activePlanTab);
  downloadFile(result.filename + ".md", result.md, "text/markdown");
}

async function exportPlanTabPdf(planId) {
  const planRes = await fetch(API + "/api/plans?id=" + encodeURIComponent(planId));
  const planData = await planRes.json();
  if (!planData || !planData.plan) { alert("Plan not found"); return; }
  const result = getPlanTabMd(planData, _activePlanTab);
  const printHtml = '<!DOCTYPE html><html><head><title>' + result.filename + '</title><style>' + printCss + '</style></head><body>' + mdToHtml(result.md) + '</body></html>';
  const win = window.open("", "_blank");
  win.document.write(printHtml);
  win.document.close();
  setTimeout(() => { win.print(); }, 500);
}

function switchPlanTab(el, tab) {
  _activePlanTab = tab;
  document.querySelectorAll("[data-plantab]").forEach(t => t.classList.toggle("active", t.dataset.plantab === tab));
  const panels = ["requirements", "steps", "blockers", "gaps", "analysis", "testnotes"];
  for (const p of panels) {
    const el = document.getElementById("plantab-" + p);
    if (el) el.style.display = p === tab ? "" : "none";
  }
}

function deletePlan(planId) {
  if (!confirm("Delete this plan and all its steps? This cannot be undone.")) return;
  fetch(API + "/api/plans/delete?id=" + encodeURIComponent(planId), { method: "DELETE" })
    .then(r => r.json())
    .then(data => {
      if (data.deleted) { plansSelectedPlan = ""; renderPlansPage(); }
    });
}

function resolveBlocker(blockerId) {
  const resolution = prompt("Resolution (what unblocked this?):");
  if (resolution === null) return;
  fetch(API + "/api/blockers/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: blockerId, resolution })
  })
    .then(r => r.json())
    .then(() => {
      if (currentPage === "blockers") renderBlockersPage();
      else renderPlansPage();
    });
}

// ── Blockers Page (cross-ticket view) ──

let blockersShowOpen = true;

async function renderBlockersPage() {
  const url = blockersShowOpen ? "/api/blockers?open=true" : "/api/blockers";
  const res = await fetch(API + url);
  const allBlockers = await res.json();

  const openCount = allBlockers.filter(b => b.status === "open").length;
  const resolvedCount = allBlockers.filter(b => b.status === "resolved").length;

  // Group by ticket
  const byTicket = {};
  for (const b of allBlockers) {
    const ticket = b.ticket_id || b.plan_ticket || "Unknown";
    if (!byTicket[ticket]) byTicket[ticket] = [];
    byTicket[ticket].push(b);
  }

  let html = '<div class="panel" style="margin-bottom:8px">';
  html += '<div class="panel-title">Blockers Across All Tickets</div>';
  if (allBlockers.length > 0) {
    html += '<div style="display:flex;gap:16px;align-items:center">';
    html += '<div class="stat"><div class="stat-value" style="color:var(--red)">' + openCount + '</div><div class="stat-label">Open</div></div>';
    html += '<div class="stat"><div class="stat-value" style="color:var(--green)">' + resolvedCount + '</div><div class="stat-label">Resolved</div></div>';
    html += '<div class="stat"><div class="stat-value">' + allBlockers.length + '</div><div class="stat-label">Total</div></div>';
    html += '<div class="stat"><div class="stat-value">' + Object.keys(byTicket).length + '</div><div class="stat-label">Tickets</div></div>';
    html += '<div style="margin-left:auto">';
    html += '<button onclick="blockersShowOpen=' + (!blockersShowOpen) + ';renderBlockersPage()" style="font-size:11px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:4px 10px;cursor:pointer">' + (blockersShowOpen ? "Show All" : "Open Only") + '</button>';
    html += '</div>';
    html += '</div>';
  }
  html += '</div>';

  if (allBlockers.length === 0) {
    html += '<div class="panel"><div class="empty">' + (blockersShowOpen ? "No open blockers. Nice!" : "No blockers recorded yet.") + '</div></div>';
    setPage(html);
    return;
  }

  // Render grouped by ticket
  for (const [ticket, items] of Object.entries(byTicket)) {
    const ticketBlockers = items;
    const ticketOpen = ticketBlockers.filter(b => b.status === "open").length;
    html += '<div class="panel" style="margin-bottom:8px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">';
    html += '<span style="font-size:14px;font-weight:600;color:var(--accent)">' + esc(ticket) + '</span>';
    if (ticketOpen > 0) html += '<span class="suite-badge failed">' + ticketOpen + ' open</span>';
    else html += '<span class="suite-badge passed">all resolved</span>';
    html += '</div>';

    html += '<table class="data-table" style="font-size:12px"><thead><tr><th>Blocker</th><th>Severity</th><th>Status</th><th>Resolution</th><th></th></tr></thead><tbody>';
    for (const b of ticketBlockers) {
      const sc = b.severity === "high" || b.severity === "critical" ? "var(--red)" : b.severity === "medium" ? "var(--yellow)" : "var(--dim)";
      const stColor = b.status === "open" ? "var(--red)" : "var(--green)";
      html += '<tr>';
      html += '<td>' + esc(b.description) + '</td>';
      html += '<td style="color:' + sc + ';font-weight:600;font-size:11px;white-space:nowrap">' + esc(b.severity || "-") + '</td>';
      html += '<td style="color:' + stColor + ';font-weight:600;font-size:11px;white-space:nowrap">' + esc(b.status) + '</td>';
      html += '<td style="font-size:11px;color:var(--dim)">' + esc(b.resolution || "-") + '</td>';
      if (b.status === "open") {
        html += '<td><button onclick="resolveBlocker(\\'' + b.id + '\\')" style="font-size:10px;color:var(--green);background:none;border:1px solid var(--border);border-radius:3px;padding:2px 6px;cursor:pointer">Resolve</button></td>';
      } else {
        html += '<td style="font-size:10px;color:var(--dim)">' + esc(b.resolved_at || "") + '</td>';
      }
      html += '</tr>';
    }
    html += '</tbody></table></div>';
  }

  setPage(html);
}

// ── Context Cache Page ──

let contextSelectedTicket = "";

async function renderContextCachePage() {
  if (!contextSelectedTicket) {
    // Level 1: All tickets with cached context
    const res = await fetch(API + "/api/ticket-context/tickets");
    const tickets = await res.json();

    const totalBytes = tickets.reduce((s, t) => s + (t.total_bytes || 0), 0);
    const totalEntries = tickets.reduce((s, t) => s + (t.entry_count || 0), 0);
    const totalFresh = tickets.reduce((s, t) => s + (t.fresh_count || 0), 0);
    const totalStale = tickets.reduce((s, t) => s + (t.stale_count || 0), 0);

    if (tickets.length === 0) {
      setPage('<div class="panel"><div class="panel-title">Ticket Context Cache</div><div class="empty">No cached context. Skills will populate this as they fetch ticket data.</div></div>');
      return;
    }

    let html = '<div class="panel" style="margin-bottom:8px">';
    html += '<div class="panel-title">Ticket Context Cache</div>';
    html += '<div style="display:flex;gap:16px;align-items:center">';
    html += '<div class="stat"><div class="stat-value">' + tickets.length + '</div><div class="stat-label">Tickets</div></div>';
    html += '<div class="stat"><div class="stat-value">' + totalEntries + '</div><div class="stat-label">Entries</div></div>';
    html += '<div class="stat"><div class="stat-value" style="color:var(--green)">' + totalFresh + '</div><div class="stat-label">Fresh</div></div>';
    html += '<div class="stat"><div class="stat-value" style="color:var(--yellow)">' + totalStale + '</div><div class="stat-label">Stale</div></div>';
    html += '<div class="stat"><div class="stat-value">' + formatBytes(totalBytes) + '</div><div class="stat-label">Size</div></div>';
    html += '<button onclick="purgeContextCache()" style="font-size:11px;color:var(--yellow);background:none;border:1px solid var(--border);border-radius:4px;padding:4px 10px;cursor:pointer;margin-left:auto">Purge Stale</button>';
    html += '</div></div>';

    html += '<div class="panel">';
    for (const t of tickets) {
      const freshPct = t.entry_count > 0 ? Math.round((t.fresh_count / t.entry_count) * 100) : 0;
      html += '<div class="session-card" onclick="contextSelectedTicket=\\'' + esc(t.ticket_id) + '\\';renderContextCachePage()">';
      html += '<div class="session-header">';
      html += '<span class="session-id" style="font-size:14px">' + esc(t.ticket_id) + '</span>';
      html += '<span style="font-size:11px;color:var(--dim)">' + t.entry_count + ' entries · ' + formatBytes(t.total_bytes) + '</span>';
      html += '</div>';
      html += '<div style="display:flex;gap:6px;margin-top:4px">';
      html += '<span class="suite-badge" style="background:rgba(63,185,80,0.15);color:var(--green)">' + t.fresh_count + ' fresh</span>';
      if (t.stale_count > 0) html += '<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">' + t.stale_count + ' stale</span>';
      html += '</div>';
      html += '<div class="session-meta"><span>Last fetched: ' + esc(t.newest || "") + '</span></div>';
      html += '</div>';
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // Level 2: Entries for a specific ticket
  const res = await fetch(API + "/api/ticket-context?ticket=" + encodeURIComponent(contextSelectedTicket));
  const entries = await res.json();

  let html = '<div class="panel" style="margin-bottom:8px">';
  html += '<div class="breadcrumb">';
  html += '<span class="breadcrumb-item" onclick="contextSelectedTicket=\\'\\';renderContextCachePage()">Context Cache</span>';
  html += '<span class="breadcrumb-sep">|</span>';
  html += '<span class="breadcrumb-item current">' + esc(contextSelectedTicket) + '</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:16px;align-items:center">';
  html += '<div class="stat"><div class="stat-value">' + entries.length + '</div><div class="stat-label">Entries</div></div>';
  const freshCount = entries.filter(e => e.cache_status === "fresh").length;
  const staleCount = entries.filter(e => e.cache_status === "stale").length;
  const totalSize = entries.reduce((s, e) => s + (e.size_bytes || 0), 0);
  html += '<div class="stat"><div class="stat-value" style="color:var(--green)">' + freshCount + '</div><div class="stat-label">Fresh</div></div>';
  html += '<div class="stat"><div class="stat-value" style="color:var(--yellow)">' + staleCount + '</div><div class="stat-label">Stale</div></div>';
  html += '<div class="stat"><div class="stat-value">' + formatBytes(totalSize) + '</div><div class="stat-label">Size</div></div>';
  html += '<button onclick="invalidateTicketContext(\\'' + esc(contextSelectedTicket) + '\\')" style="font-size:11px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:4px 10px;cursor:pointer;margin-left:auto">Invalidate All</button>';
  html += '</div></div>';

  html += '<div class="panel" style="padding:0">';
  html += '<table class="data-table"><thead><tr><th>Type</th><th>Status</th><th>Size</th><th>TTL</th><th>Fetched</th><th>Source</th><th></th></tr></thead><tbody>';

  const typeIcons = { ticket_info: "📋", comments: "💬", linked_tickets: "🔗", mr_metadata: "📦", mr_diff: "📝", confluence: "📄" };

  for (const e of entries) {
    const stColor = e.cache_status === "fresh" ? "var(--green)" : "var(--yellow)";
    const baseType = e.context_type.split(":")[0];
    html += '<tr>';
    html += '<td style="font-size:12px;font-weight:600;color:var(--accent)">' + esc(e.context_type) + '</td>';
    html += '<td style="color:' + stColor + ';font-weight:600;font-size:11px">' + esc(e.cache_status) + '</td>';
    html += '<td style="font-size:11px;color:var(--dim)">' + formatBytes(e.size_bytes) + '</td>';
    html += '<td style="font-size:11px;color:var(--dim)">' + e.ttl_minutes + 'm</td>';
    html += '<td style="font-size:11px;color:var(--dim);white-space:nowrap">' + esc(e.fetched_at) + '</td>';
    html += '<td style="font-size:11px;color:var(--dim)">' + esc(e.source || "-") + '</td>';
    html += '<td><button onclick="invalidateTicketContext(\\'' + esc(contextSelectedTicket) + '\\',\\'' + esc(e.context_type) + '\\')" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:3px;padding:2px 6px;cursor:pointer">×</button></td>';
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  setPage(html);
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

function invalidateTicketContext(ticketId, type) {
  const msg = type ? "Invalidate " + type + " for " + ticketId + "?" : "Invalidate ALL cached context for " + ticketId + "?";
  if (!confirm(msg)) return;
  const params = "ticket=" + encodeURIComponent(ticketId) + (type ? "&type=" + encodeURIComponent(type) : "");
  fetch(API + "/api/ticket-context/invalidate?" + params, { method: "DELETE" })
    .then(r => r.json())
    .then(() => renderContextCachePage());
}

function purgeContextCache() {
  if (!confirm("Remove all stale entries?")) return;
  fetch(API + "/api/ticket-context/purge", { method: "POST" })
    .then(r => r.json())
    .then(data => { alert("Purged " + data.purged + " stale entries"); renderContextCachePage(); });
}

// ── API Maps Page ──

let apimapSelectedId = "";
let apimapSelectedEndpoint = "";

async function renderApiMapsPage() {
  if (!apimapSelectedId) {
    // Level 1: List all API maps
    const res = await fetch(API + "/api/apimaps");
    const maps = await res.json();

    if (maps.length === 0) {
      setPage('<div class="panel"><div class="panel-title">API Maps</div><div class="empty">No API maps yet. Use /noob-api-explore to populate them.</div></div>');
      return;
    }

    const totalEndpoints = maps.reduce((s, m) => s + (m.endpoint_count || 0), 0);
    const totalChains = maps.reduce((s, m) => s + (m.chain_count || 0), 0);
    const totalFlaky = maps.reduce((s, m) => s + (m.flaky_count || 0), 0);
    const totalFailing = maps.reduce((s, m) => s + (m.failing_count || 0), 0);

    let html = '<div class="panel" style="margin-bottom:8px">';
    html += '<div class="panel-title">API Maps</div>';
    html += '<div style="display:flex;gap:16px">';
    html += '<div class="stat"><div class="stat-value">' + maps.length + '</div><div class="stat-label">Maps</div></div>';
    html += '<div class="stat"><div class="stat-value">' + totalEndpoints + '</div><div class="stat-label">Endpoints</div></div>';
    html += '<div class="stat"><div class="stat-value">' + totalChains + '</div><div class="stat-label">Chains</div></div>';
    if (totalFlaky) html += '<div class="stat"><div class="stat-value" style="color:var(--yellow)">' + totalFlaky + '</div><div class="stat-label">Flaky</div></div>';
    if (totalFailing) html += '<div class="stat"><div class="stat-value" style="color:var(--red)">' + totalFailing + '</div><div class="stat-label">Failing</div></div>';
    html += '</div></div>';

    html += '<div class="panel">';
    for (const m of maps) {
      html += '<div class="session-card" onclick="apimapSelectedId=\\'' + esc(m.id) + '\\';apimapSelectedEndpoint=\\'\\';renderApiMapsPage()">';
      html += '<div class="session-header">';
      html += '<span class="session-id" style="font-size:14px">' + esc(m.name) + '</span>';
      html += '<span style="font-size:11px;color:var(--dim)">' + (m.endpoint_count || 0) + ' endpoints</span>';
      html += '</div>';
      if (m.base_url) html += '<div style="font-size:12px;color:var(--dim);margin-top:2px">' + esc(m.base_url) + '</div>';
      html += '<div style="display:flex;gap:6px;margin-top:4px">';
      if (m.chain_count) html += '<span class="suite-badge" style="background:rgba(88,166,255,0.15);color:var(--accent)">' + m.chain_count + ' chains</span>';
      if (m.total_calls) html += '<span class="suite-badge" style="background:rgba(63,185,80,0.15);color:var(--green)">' + m.total_calls + ' calls</span>';
      if (m.flaky_count) html += '<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">' + m.flaky_count + ' flaky</span>';
      if (m.failing_count) html += '<span class="suite-badge failed">' + m.failing_count + ' failing</span>';
      html += '</div>';
      html += '<div class="session-meta"><span>' + esc(m.updated_at || "") + '</span></div>';
      html += '</div>';
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // Level 2: API map detail — canvas + endpoint list/detail
  const res = await fetch(API + "/api/apimaps?id=" + encodeURIComponent(apimapSelectedId));
  const data = await res.json();
  if (!data.map) { apimapSelectedId = ""; renderApiMapsPage(); return; }

  const map = data.map;
  const endpoints = data.endpoints || [];
  const allParams = data.params || [];
  const allResponses = data.responses || [];
  const chains = data.chains || [];

  const active = endpoints.filter(e => e.status === "active").length;
  const flaky = endpoints.filter(e => e.status === "flaky").length;
  const failing = endpoints.filter(e => e.status === "failing").length;
  const methodCounts = {};
  for (const e of endpoints) methodCounts[e.method] = (methodCounts[e.method] || 0) + 1;

  let html = '<div class="panel" style="margin-bottom:8px;flex-shrink:0">';
  html += '<div class="breadcrumb">';
  html += '<span class="breadcrumb-item" onclick="apimapSelectedId=\\'\\';apimapSelectedEndpoint=\\'\\';renderApiMapsPage()">API Maps</span>';
  html += '<span class="breadcrumb-sep">|</span>';
  html += '<span class="breadcrumb-item current">' + esc(map.name) + '</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">';
  html += '<div class="stat"><div class="stat-value">' + endpoints.length + '</div><div class="stat-label">Endpoints</div></div>';
  html += '<div class="stat"><div class="stat-value">' + chains.length + '</div><div class="stat-label">Chains</div></div>';
  html += '<div class="stat"><div class="stat-value" style="color:var(--green)">' + active + '</div><div class="stat-label">Active</div></div>';
  if (flaky) html += '<div class="stat"><div class="stat-value" style="color:var(--yellow)">' + flaky + '</div><div class="stat-label">Flaky</div></div>';
  if (failing) html += '<div class="stat"><div class="stat-value" style="color:var(--red)">' + failing + '</div><div class="stat-label">Failing</div></div>';
  for (const [method, count] of Object.entries(methodCounts)) {
    const mc = {GET:"var(--green)",POST:"var(--accent)",PUT:"var(--yellow)",PATCH:"var(--orange)",DELETE:"var(--red)"}[method] || "var(--dim)";
    html += '<span class="suite-badge" style="background:rgba(125,133,144,0.1);color:' + mc + '">' + method + ': ' + count + '</span>';
  }
  html += '</div>';
  if (map.base_url) html += '<div style="font-size:12px;color:var(--dim);margin-top:4px">' + esc(map.base_url) + '</div>';
  html += '</div>';

  // Canvas + endpoint list split
  html += '<div style="display:grid;grid-template-columns:1fr 360px;gap:8px;flex:1;min-height:0;overflow:hidden">';

  // Left: Canvas
  html += '<div class="panel" style="padding:0;overflow:hidden;position:relative">';
  html += '<canvas id="apimap-canvas" style="width:100%;height:100%;display:block"></canvas>';
  html += '</div>';

  // Right: Endpoint list or detail
  html += '<div class="panel" style="overflow-y:auto" id="apimap-right-panel">';

  if (apimapSelectedEndpoint) {
    // Endpoint detail
    const ep = endpoints.find(e => e.id === apimapSelectedEndpoint);
    if (ep) {
      const mc = {GET:"var(--green)",POST:"var(--accent)",PUT:"var(--yellow)",PATCH:"var(--orange)",DELETE:"var(--red)"}[ep.method] || "var(--dim)";
      const epParams = allParams.filter(p => p.endpoint_id === ep.id);
      const epResponses = allResponses.filter(r => r.endpoint_id === ep.id);
      const epChainsFrom = chains.filter(c => c.from_endpoint_id === ep.id);
      const epChainsTo = chains.filter(c => c.to_endpoint_id === ep.id);

      html += '<div style="margin-bottom:8px"><span onclick="apimapSelectedEndpoint=\\'\\';renderApiMapsPage()" style="cursor:pointer;color:var(--accent);font-size:11px">← Back to list</span></div>';
      html += '<div style="font-size:16px;font-weight:700;margin-bottom:4px"><span style="color:' + mc + '">' + esc(ep.method) + '</span> <span style="color:var(--text)">' + esc(ep.path) + '</span></div>';
      if (ep.summary) html += '<div style="font-size:12px;color:var(--dim);margin-bottom:8px">' + esc(ep.summary) + '</div>';

      // Status & stats
      const stColor = ep.status === "failing" ? "var(--red)" : ep.status === "flaky" ? "var(--yellow)" : "var(--green)";
      html += '<div style="display:flex;gap:12px;margin-bottom:12px">';
      html += '<span style="color:' + stColor + ';font-weight:600;font-size:12px">' + esc(ep.status) + '</span>';
      html += '<span style="font-size:11px;color:var(--dim)">Auth: ' + esc(ep.auth_type) + '</span>';
      if (ep.times_called > 0) {
        html += '<span style="font-size:11px;color:var(--dim)">' + ep.times_called + ' calls</span>';
        html += '<span style="font-size:11px;color:var(--dim)">' + Math.round(ep.avg_response_ms) + 'ms avg</span>';
      }
      html += '</div>';

      // Params
      if (epParams.length > 0) {
        html += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">Parameters (' + epParams.length + ')</div>';
        html += '<table class="data-table" style="font-size:11px;margin-bottom:12px"><thead><tr><th>Name</th><th>In</th><th>Type</th><th>Req</th></tr></thead><tbody>';
        for (const p of epParams) {
          html += '<tr><td style="color:var(--accent)">' + esc(p.name) + '</td>';
          html += '<td style="color:var(--dim)">' + esc(p.location) + '</td>';
          html += '<td>' + esc(p.param_type) + '</td>';
          html += '<td>' + (p.required ? '<span style="color:var(--red)">yes</span>' : '<span style="color:var(--dim)">no</span>') + '</td></tr>';
        }
        html += '</tbody></table>';
      }

      // Responses
      if (epResponses.length > 0) {
        html += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:4px">Responses (' + epResponses.length + ')</div>';
        for (const r of epResponses) {
          const sc = r.status_code >= 200 && r.status_code < 300 ? "var(--green)" : r.status_code >= 400 ? "var(--red)" : "var(--yellow)";
          html += '<div style="margin-bottom:6px"><span style="color:' + sc + ';font-weight:600;font-size:12px">' + r.status_code + '</span>';
          if (r.description) html += ' <span style="font-size:11px;color:var(--dim)">' + esc(r.description) + '</span>';
          html += '</div>';
          if (r.schema_json) {
            html += '<pre style="font-size:10px;color:var(--dim);background:var(--bg);padding:6px;border-radius:4px;margin-bottom:6px;max-height:100px;overflow:auto">' + esc(r.schema_json) + '</pre>';
          }
        }
      }

      // Chains
      if (epChainsFrom.length > 0 || epChainsTo.length > 0) {
        html += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin:8px 0 4px">Chains</div>';
        for (const c of epChainsFrom) {
          const target = endpoints.find(e => e.id === c.to_endpoint_id);
          if (target) html += '<div style="font-size:11px;padding:2px 0"><span style="color:var(--accent)">→</span> ' + esc(c.chain_type) + ': <span style="color:var(--accent)">' + esc(target.method + " " + target.path) + '</span></div>';
        }
        for (const c of epChainsTo) {
          const source = endpoints.find(e => e.id === c.from_endpoint_id);
          if (source) html += '<div style="font-size:11px;padding:2px 0"><span style="color:var(--dim)">←</span> ' + esc(c.chain_type) + ': <span style="color:var(--dim)">' + esc(source.method + " " + source.path) + '</span></div>';
        }
      }
    }
  } else {
    // Endpoint list
    html += '<div style="font-size:10px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:8px">Endpoints</div>';
    for (const ep of endpoints) {
      const mc = {GET:"var(--green)",POST:"var(--accent)",PUT:"var(--yellow)",PATCH:"var(--orange)",DELETE:"var(--red)"}[ep.method] || "var(--dim)";
      const stColor = ep.status === "failing" ? "var(--red)" : ep.status === "flaky" ? "var(--yellow)" : "var(--green)";
      html += '<div class="tc-item" style="cursor:pointer" onclick="apimapSelectedEndpoint=\\'' + esc(ep.id) + '\\';apiSelectedEndpointId=\\'' + esc(ep.id) + '\\';renderApiMapsPage()">';
      html += '<div style="display:flex;align-items:center;gap:6px">';
      html += '<span style="color:' + mc + ';font-weight:700;font-size:10px;width:50px;font-family:monospace">' + esc(ep.method) + '</span>';
      html += '<span style="font-size:12px;color:var(--text);flex:1">' + esc(ep.path) + '</span>';
      html += '<span style="width:6px;height:6px;border-radius:50%;background:' + stColor + ';flex-shrink:0"></span>';
      html += '</div>';
      if (ep.times_called > 0) html += '<div style="font-size:10px;color:var(--dim);margin-top:2px">' + ep.times_called + ' calls · ' + Math.round(ep.avg_response_ms) + 'ms · ' + ep.times_succeeded + '/' + ep.times_called + ' ok</div>';
      html += '</div>';
    }
  }

  html += '</div></div>';
  setPage(html);

  // Render canvas
  requestAnimationFrame(() => {
    window.onApiEndpointSelect = function(endpointId) {
      apimapSelectedEndpoint = endpointId;
      renderApiMapsPage();
    };
    drawApiMapCanvas(endpoints, allParams, allResponses, chains, "apimap-canvas");
  });
}

// ── Repos Page ──

async function renderReposPage() {
  const res = await fetch(API + "/api/repos");
  const data = await res.json();
  const app = document.getElementById("app");

  // Stats
  const totalFiles = data.repos.reduce((s, r) => s + (r.indexed_files || 0), 0);
  const totalImports = data.repos.reduce((s, r) => s + (r.indexed_imports || 0), 0);
  const synced = data.repos.filter(r => r.last_synced).length;

  let html = '<div class="panel" style="margin-bottom:16px">';
  html += '<div class="panel-title">Repositories & Codebase Index</div>';
  if (data.repos.length > 0) {
    html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
    html += \`<div class="stat"><div class="stat-value">\${data.repos.length}</div><div class="stat-label">Repos</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${data.groups.length}</div><div class="stat-label">Groups</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${synced}</div><div class="stat-label">Synced</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--accent)">\${totalFiles.toLocaleString()}</div><div class="stat-label">Indexed Files</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--purple)">\${totalImports.toLocaleString()}</div><div class="stat-label">Import Links</div></div>\`;
    html += '</div>';
  }
  html += '</div>';

  // Groups
  if (data.groups.length > 0) {
    html += '<div class="panel" style="margin-bottom:16px">';
    html += '<div class="panel-title">Groups</div>';
    for (const g of data.groups) {
      html += \`<div class="session-card" style="cursor:default">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(g.name)}</span>
          <span style="font-size:12px;color:var(--dim)">\${g.repos.length} repos</span>
        </div>
        \${g.description ? \`<div style="font-size:12px;color:var(--dim);margin-top:2px">\${esc(g.description)}</div>\` : ""}
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          \${g.repos.map(r => \`<span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(88,166,255,0.1);color:var(--accent)">\${esc(r)}</span>\`).join("")}
        </div>
      </div>\`;
    }
    html += '</div>';
  }

  // Repos
  if (data.repos.length === 0) {
    html += '<div class="panel"><div class="empty">No repos registered. Add with: <code>noob-tester repos add &lt;name&gt; &lt;url&gt;</code></div></div>';
  } else {
    html += '<div class="panel">';
    html += '<div class="panel-title">Repositories</div>';
    for (const r of data.repos) {
      const pathMissing = r.local_path && r.path_exists === false;
      const syncStatus = pathMissing
        ? \`<span style="color:var(--red);font-size:11px">path missing — run: noob-tester repos sync \${esc(r.name)}</span>\`
        : r.last_synced
          ? \`<span style="color:var(--green);font-size:11px">synced \${timeAgo(r.last_synced)}</span>\`
          : \`<span style="color:var(--yellow);font-size:11px">not synced</span>\`;
      const indexStale = pathMissing && r.indexed_files > 0;
      const indexStatus = r.indexed_files > 0
        ? \`<span style="color:\${indexStale ? 'var(--yellow)' : 'var(--accent)'};font-size:11px">\${r.indexed_files} files / \${r.indexed_imports} imports\${indexStale ? ' (stale — source missing)' : ''}</span>\`
        : \`<span style="color:var(--dim);font-size:11px">not indexed</span>\`;

      html += \`<div class="session-card" style="cursor:default">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(r.name)}</span>
          <span style="display:flex;gap:12px;align-items:center">
            \${syncStatus} \${indexStatus}
            <button onclick="if(confirm('Delete repo \\\\'\${esc(r.name)}\\\\'? This removes the DB entry, index, AND the local folder in ~/.noob-tester/repos/.')){deleteRepoEntry('\${esc(r.name)}')}" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:2px 6px;cursor:pointer" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">&times;</button>
          </span>
        </div>
        <div style="font-size:12px;color:var(--dim);margin-top:4px;font-family:monospace">\${esc(r.url)}</div>
        \${r.description ? \`<div style="font-size:12px;color:var(--dim);margin-top:2px">\${esc(r.description)}</div>\` : ""}
        \${r.local_path ? \`<div style="font-size:11px;color:var(--dim);margin-top:4px">Local: \${esc(r.local_path)}</div>\` : ""}
      </div>\`;
    }
    html += '</div>';
  }

  // CLI hints
  html += \`<div class="panel" style="margin-top:16px;font-size:12px;color:var(--dim)">
    <div class="panel-title">CLI Commands</div>
    <code>noob-tester repos add &lt;name&gt; &lt;url&gt;</code> — register a repo<br>
    <code>noob-tester repos group add &lt;name&gt; --repos a,b</code> — create a group<br>
    <code>noob-tester repos sync &lt;name&gt;</code> — clone/pull<br>
    <code>noob-tester repos index &lt;name&gt;</code> — build BM25 + import graph<br>
    <code>noob-tester repos search &lt;query&gt; --expand</code> — search indexed code
  </div>\`;

  setPage(html);
}

function exportTestCasesCsv(ticket) {
  const cases = tcAllCases.filter(c => c.ticket_ref === ticket);
  if (cases.length === 0) { alert("No test cases to export"); return; }

  function csvEsc(v) { if (!v) return ""; var s = String(v); return s.includes(",") || s.includes('"') || s.includes(String.fromCharCode(10)) ? '"' + s.replace(/"/g, '""') + '"' : s; }

  var NL = String.fromCharCode(10);
  var header = ["Title","Type","Format","Layer","Priority","Status","Ready","Feature/Scenario","Description","Preconditions","Steps","Expected Result","Impacted Files","Labels","Related MR","Execution Count","Last Executed"].join(",");
  var rows = [header];

  for (var c of cases) {
    var featureScenario = ""; var steps = ""; var expected = "";
    var preconditions = ""; var labels = ""; var files = "";

    if (c.format === "bdd") {
      featureScenario = (c.bdd_feature || "") + (c.bdd_scenario ? " / " + c.bdd_scenario : "");
      var stepLines = [];
      var expectedLines = [];
      try { var g = JSON.parse(c.bdd_given || "[]"); for (var i = 0; i < g.length; i++) stepLines.push("Given " + g[i]); } catch {}
      try { var w = JSON.parse(c.bdd_when || "[]"); for (var i = 0; i < w.length; i++) stepLines.push("When " + w[i]); } catch {}
      try { var t = JSON.parse(c.bdd_then || "[]"); for (var i = 0; i < t.length; i++) expectedLines.push("Then " + t[i]); } catch {}
      steps = stepLines.join(String.fromCharCode(10));
      expected = expectedLines.join(String.fromCharCode(10));
    } else {
      featureScenario = "";
      var stepLines = []; var expectedLines = [];
      try {
        var tradSteps = JSON.parse(c.trad_steps || "[]");
        for (var i = 0; i < tradSteps.length; i++) {
          stepLines.push((i + 1) + ". " + tradSteps[i].step);
          if (tradSteps[i].expected) expectedLines.push((i + 1) + ". " + tradSteps[i].expected);
        }
      } catch {}
      steps = stepLines.join(String.fromCharCode(10));
      expected = expectedLines.join(String.fromCharCode(10));
      if (c.trad_expected && !expected) expected = c.trad_expected;
    }

    try { preconditions = JSON.parse(c.preconditions || "[]").join(String.fromCharCode(10)); } catch {}
    try { labels = JSON.parse(c.labels || "[]").join(", "); } catch {}
    try { files = JSON.parse(c.impacted_files || "[]").join(String.fromCharCode(10)); } catch {}

    rows.push([
      csvEsc(c.title), csvEsc(c.type), csvEsc(c.format), csvEsc(c.test_layer || "ui"),
      c.priority || "", csvEsc(c.status), c.ready ? "Yes" : "No",
      csvEsc(featureScenario), csvEsc(c.description), csvEsc(preconditions),
      csvEsc(steps), csvEsc(expected),
      csvEsc(files), csvEsc(labels),
      csvEsc(c.related_mr), c.execution_count || 0, csvEsc(c.last_executed || "")
    ].join(","));
  }

  downloadFile("testcases-" + ticket + ".csv", rows.join(NL), "text/csv");
}

async function deleteRunPacksByTicket(ticket) {
  if (!confirm("Delete ALL run packs and entries for " + ticket + "? This cannot be undone.")) return;
  await fetch(API + "/api/runpacks/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ticket }),
  });
  rpSelectedTicket = "";
  rpSelectedPack = "";
  rpSelectedEntry = "";
  renderRunsPage();
}

function deleteTestCasesByTicket(ticket) {
  if (!confirm("Delete ALL test cases for " + ticket + "? This cannot be undone.")) return;
  fetch(API + "/api/testcases/delete?ticket=" + encodeURIComponent(ticket), { method: "DELETE" })
    .then(r => r.json())
    .then(data => {
      if (data.deleted > 0) { tcSelectedSuite = ""; tcSelectedId = ""; renderTestCasesPage(); }
    });
}

function deleteRepoEntry(name) {
  fetch(API + "/api/repos/delete?name=" + encodeURIComponent(name), { method: "DELETE" })
    .then(r => r.json())
    .then(data => { if (data.deleted) renderReposPage(); });
}

// ── UI Maps Page ──

let uimapSelectedId = "";
let uimapSelectedPageId = "";

async function deleteUiMap(mapId, mapName) {
  if (!confirm('Delete UI map "' + mapName + '" and ALL its pages, elements, navigations, and forms? This cannot be undone.')) return;
  await fetch(API + "/api/uimaps/delete?id=" + encodeURIComponent(mapId), { method: "DELETE" });
  uimapSelectedId = "";
  uimapSelectedPageId = "";
  renderUiMapsPage();
}

async function renderUiMapsPage() {
  const app = document.getElementById("app");

  const mapsRes = await fetch(API + "/api/uimaps");
  const maps = await mapsRes.json();

  if (maps.length === 0 && !uimapSelectedId) {
    app.innerHTML = '<div class="panel"><div class="empty">No UI maps yet. Use <code>noob-tester uimap create --name "My App" --repos repo1,repo2 --targets url1,url2</code> to create one.</div></div>';
    return;
  }

  let html = "";

  // ── Level 1: Map list ──
  if (!uimapSelectedId) {
    html += '<div class="panel" style="margin-bottom:16px"><div class="panel-title">UI Maps</div>';
    const totalPages = maps.reduce((s, m) => s + m.stats.pages, 0);
    const totalElements = maps.reduce((s, m) => s + m.stats.elements, 0);
    html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
    html += \`<div class="stat"><div class="stat-value">\${maps.length}</div><div class="stat-label">Maps</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${totalPages}</div><div class="stat-label">Pages</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${totalElements}</div><div class="stat-label">Elements</div></div>\`;
    html += '</div></div>';

    html += '<div class="panel">';
    for (const m of maps) {
      const repos = JSON.parse(m.repo_urls || "[]");
      const targets = JSON.parse(m.target_urls || "[]");
      const tix = JSON.parse(m.ticket_ids || "[]");
      html += \`<div class="session-card" onclick="uimapSelectedId='\${esc(m.id)}';uimapSelectedPageId='';renderUiMapsPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(m.name)}</span>
          <span style="font-size:11px;color:var(--dim)">\${m.id.slice(0, 8)}</span>
          <button onclick="event.stopPropagation();deleteUiMap('\${esc(m.id)}','\${esc(m.name)}')" style="margin-left:auto;font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:2px 8px;cursor:pointer" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete</button>
        </div>
        \${m.description ? \`<div style="font-size:12px;color:var(--dim);margin-top:4px">\${esc(m.description)}</div>\` : ""}
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          <span class="suite-badge" style="background:rgba(88,166,255,0.15);color:var(--accent)">\${m.stats.pages} pages</span>
          <span class="suite-badge" style="background:rgba(88,166,255,0.15);color:var(--accent)">\${m.stats.elements} elements</span>
          <span class="suite-badge" style="background:rgba(88,166,255,0.15);color:var(--accent)">\${m.stats.navigations} navs</span>
          <span class="suite-badge" style="background:rgba(88,166,255,0.15);color:var(--accent)">\${m.stats.forms} forms</span>
          \${m.stats.working ? \`<span class="suite-badge passed">\${m.stats.working} working</span>\` : ""}
          \${m.stats.flaky ? \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">\${m.stats.flaky} flaky</span>\` : ""}
          \${m.stats.broken ? \`<span class="suite-badge failed">\${m.stats.broken} broken</span>\` : ""}
        </div>
        <div class="session-meta">
          \${repos.length ? \`<span>repos: \${repos.length}</span>\` : ""}
          \${targets.length ? \`<span>targets: \${targets.length}</span>\` : ""}
          \${tix.length ? \`<span>tickets: \${tix.length}</span>\` : ""}
          <span>\${m.updated_at || ""}</span>
        </div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // ── Level 2: Canvas tree + sidebar ──
  const detailRes = await fetch(API + "/api/uimaps/detail?id=" + encodeURIComponent(uimapSelectedId));
  const detail = await detailRes.json();
  const map = detail.map;
  const pages = detail.pages || [];
  const elements = detail.elements || [];
  const navs = detail.navigations || [];
  const forms = detail.forms || [];

  const repos = JSON.parse(map.repo_urls || "[]");
  const targets = JSON.parse(map.target_urls || "[]");
  const mapTickets = JSON.parse(map.ticket_ids || "[]");

  // ── Full-width stats panel with breadcrumb ──
  const working = elements.filter(e => e.status === "working").length;
  const flaky = elements.filter(e => e.status === "flaky").length;
  const broken = elements.filter(e => e.status === "broken").length;
  const pageTickets = new Set();
  for (const p of pages) { try { for (const j of JSON.parse(p.ticket_ids || "[]")) pageTickets.add(j); } catch {} }

  html += '<div class="panel" style="margin-bottom:8px">';
  html += \`<div class="breadcrumb">
    <span class="breadcrumb-item" onclick="uimapSelectedId='';uimapSelectedPageId='';renderUiMapsPage()">UI Maps</span>
    <span class="breadcrumb-sep">|</span>
    <span class="breadcrumb-item current">\${esc(map.name)}</span>
  </div>\`;

  html += '<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center">';
  html += \`<div class="stat"><div class="stat-value" style="font-size:18px">\${pages.length}</div><div class="stat-label">Pages</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="font-size:18px">\${elements.length}</div><div class="stat-label">Elements</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="font-size:18px">\${navs.length}</div><div class="stat-label">Navs</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="font-size:18px">\${forms.length}</div><div class="stat-label">Forms</div></div>\`;
  html += '<div style="width:1px;height:24px;background:var(--border)"></div>';
  if (working) html += \`<span class="suite-badge passed">\${working} working</span>\`;
  if (flaky) html += \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">\${flaky} flaky</span>\`;
  if (broken) html += \`<span class="suite-badge failed">\${broken} broken</span>\`;
  html += '<div style="width:1px;height:24px;background:var(--border)"></div>';
  for (const j of mapTickets) html += \`<span style="font-size:11px;color:var(--yellow)">\${esc(j)}</span>\`;
  for (const j of pageTickets) { if (!mapTickets.includes(j)) html += \`<span style="font-size:11px;color:var(--dim)">\${esc(j)}</span>\`; }
  if (repos.length) html += \`<span style="font-size:11px;color:var(--accent)">\${repos.length} repo\${repos.length > 1 ? "s" : ""}</span>\`;
  if (targets.length) html += \`<span style="font-size:11px;color:var(--green)">\${targets.length} target\${targets.length > 1 ? "s" : ""}</span>\`;
  html += '</div></div>';

  // ── Canvas fills remaining space ──
  html += '<div class="panel" style="flex:1;min-height:0;position:relative;overflow:hidden">';
  html += '<div style="position:absolute;top:8px;left:12px;z-index:2;display:flex;gap:8px;align-items:center">';
  html += '<span style="font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase">Site Map</span>';
  html += '<input id="uimap-search" type="text" placeholder="Search pages..." style="font-size:11px;padding:3px 8px;background:var(--bg);border:1px solid var(--border);border-radius:4px;color:var(--text);width:160px" oninput="_uimapSearch=this.value" />';
  html += '</div>';
  html += '<canvas id="uimap-canvas" style="width:100%;height:100%;cursor:grab"></canvas>';
  html += '</div>';

  // ── RIGHT: Page detail panel (shown when a node is clicked) ──
  // Modal overlay for page detail (positioned over the canvas)
  html += '<div id="uimap-detail-overlay" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:100;cursor:pointer" onclick="if(event.target===this){this.style.display=\\'none\\'}">';
  html += '<div id="uimap-detail" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:85vw;max-width:1100px;max-height:90vh;border-radius:12px;border:1px solid var(--accent);box-shadow:0 20px 60px rgba(0,0,0,0.6);cursor:default;display:flex;flex-direction:column;overflow:hidden;background:var(--surface)"></div>';
  html += '</div>';

  html += '</div>'; // end flex layout

  setPage(html);

  // ── Canvas rendering ──
  requestAnimationFrame(() => drawUiMapCanvas(pages, elements, navs, forms));
}

// Canvas renderers (drawUiMapCanvas, showUiMapPageDetail, drawPageElementMap)
// are injected via getCanvasRendererScript() above.


// ── Metrics Page ──

let metricsTab = "metrics";

async function renderMetricsPage() {
  const res = await fetch(API + "/api/metrics");
  const data = await res.json();
  const agg = data.aggregate;
  const sessions = data.sessions;

  let html = '<div class="panel" style="margin-bottom:12px">';
  html += '<div class="panel-title">Metrics</div>';

  // Recalculate total cost from per-session data (handles old sessions without DB cost)
  const totalCost = sessions.reduce((sum, s) => sum + calcCost(s), 0);

  // Aggregate stats
  html += '<div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:8px">';
  const stats = [
    { value: agg.sessions, label: "Sessions", color: "var(--accent)" },
    { value: agg.runs, label: "Runs", color: "var(--accent)" },
    { value: agg.testcases, label: "Test Cases", color: "var(--accent)" },
    { value: agg.actions, label: "Actions", color: "var(--text)" },
    { value: agg.issues, label: "Issues", color: "var(--red)" },
    { value: agg.toolCalls, label: "Tool Calls", color: "var(--yellow)" },
    { value: (agg.tokens || 0).toLocaleString(), label: "Total Tokens", color: "var(--purple)" },
    { value: (agg.inputTokens || 0).toLocaleString(), label: "Input", color: "var(--dim)" },
    { value: (agg.outputTokens || 0).toLocaleString(), label: "Output", color: "var(--dim)" },
    { value: (agg.cacheReadTokens || 0).toLocaleString(), label: "Cache Read", color: "var(--dim)" },
    { value: fmtCost(totalCost), label: "Total Cost", color: "var(--red)" },
    { value: agg.durationMin + "m", label: "Total Time", color: "var(--green)" },
  ];
  for (const s of stats) {
    html += \`<div class="stat"><div class="stat-value" style="color:\${s.color}">\${s.value}</div><div class="stat-label">\${s.label}</div></div>\`;
  }
  html += '</div>';

  // Tabs
  html += '<div style="display:flex;gap:6px;margin-top:8px">';
  html += '<div class="tab ' + (metricsTab === "metrics" ? "active" : "") + '" onclick="metricsTab=\\'metrics\\';renderMetricsPage()">Metrics</div>';
  html += '<div class="tab ' + (metricsTab === "resources" ? "active" : "") + '" onclick="metricsTab=\\'resources\\';renderMetricsPage()">Resources</div>';
  html += '</div>';
  html += '</div>';

  // ── TAB: Metrics ──
  if (metricsTab === "metrics") {
    html += '<div class="panel">';
    html += '<div class="panel-title">Per Session</div>';

    if (sessions.length === 0) {
      html += '<div class="empty">No sessions yet</div>';
    } else {
      html += '<table style="width:100%;font-size:12px;border-collapse:collapse">';
      const thBase = "padding:6px;font-size:11px;color:var(--dim);text-transform:uppercase;border-bottom:1px solid var(--border)";
      html += '<tr>';
      html += \`<th style="\${thBase};text-align:left">Session</th>\`;
      html += \`<th style="\${thBase};text-align:left">Task</th>\`;
      html += \`<th style="\${thBase};text-align:center">Model</th>\`;
      html += \`<th style="\${thBase};text-align:right">Input</th>\`;
      html += \`<th style="\${thBase};text-align:right">Output</th>\`;
      html += \`<th style="\${thBase};text-align:right">Cache Read</th>\`;
      html += \`<th style="\${thBase};text-align:right">Cache Write</th>\`;
      html += \`<th style="\${thBase};text-align:right">Total Tokens</th>\`;
      html += \`<th style="\${thBase};text-align:right">Cost</th>\`;
      html += \`<th style="\${thBase};text-align:right">Tools</th>\`;
      html += \`<th style="\${thBase};text-align:right">Duration</th>\`;
      html += \`<th style="\${thBase};text-align:center">Status</th>\`;
      html += '</tr>';

      for (const s of sessions) {
        const statusColor = s.status === "active" ? "var(--green)" : s.status === "stale" ? "var(--yellow)" : "var(--dim)";
        const dur = s.total_duration_ms ? Math.round(s.total_duration_ms / 1000) + "s" : "-";
        const cost = fmtCost(calcCost(s));
        const model = s.model ? s.model.replace("claude-", "") : "-";
        const fmtTok = (v) => v ? v.toLocaleString() : "-";

        html += \`<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px;font-family:monospace;color:var(--accent)">\${s.id.slice(0,8)}</td>
          <td style="padding:6px;max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${esc(s.task_summary || "-")}</td>
          <td style="padding:6px;text-align:center;font-size:10px;color:var(--dim)">\${esc(model)}</td>
          <td style="padding:6px;text-align:right;font-size:11px">\${fmtTok(s.input_tokens)}</td>
          <td style="padding:6px;text-align:right;font-size:11px">\${fmtTok(s.output_tokens)}</td>
          <td style="padding:6px;text-align:right;font-size:11px;color:var(--dim)">\${fmtTok(s.cache_read_tokens)}</td>
          <td style="padding:6px;text-align:right;font-size:11px;color:var(--dim)">\${fmtTok(s.cache_create_tokens)}</td>
          <td style="padding:6px;text-align:right;color:var(--purple)">\${fmtTok(s.estimated_tokens)}</td>
          <td style="padding:6px;text-align:right;color:var(--red)">\${cost}</td>
          <td style="padding:6px;text-align:right;color:var(--yellow)">\${s.tool_calls || 0}</td>
          <td style="padding:6px;text-align:right;color:var(--green)">\${dur}</td>
          <td style="padding:6px;text-align:center;color:\${statusColor}">\${s.status}</td>
        </tr>\`;
      }
      html += '</table>';
    }
    html += '</div>';
  }

  // ── TAB: Resources ──
  if (metricsTab === "resources") {
    const rRes = await fetch(API + "/api/metrics/resources");
    const r = await rRes.json();

    function fmtBytes(b) {
      if (b < 1024) return b + " B";
      if (b < 1024 * 1024) return (b / 1024).toFixed(1) + " KB";
      if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + " MB";
      return (b / (1024 * 1024 * 1024)).toFixed(2) + " GB";
    }

    const ctxBytes = r.ticketContext ? r.ticketContext.bytes : 0;
    const ctxFiles = r.ticketContext ? r.ticketContext.fileCount : 0;
    const ctxEntries = r.ticketContext ? r.ticketContext.entries : 0;
    const ctxTickets = r.ticketContext ? r.ticketContext.tickets : 0;
    const totalDisk = r.database.bytes + r.evidence.bytes + r.repos.bytes + ctxBytes;

    // Disk overview
    html += '<div class="panel" style="margin-bottom:12px">';
    html += '<div class="panel-title">Disk Usage</div>';
    html += '<div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:12px">';
    html += \`<div class="stat"><div class="stat-value" style="color:var(--accent)">\${fmtBytes(totalDisk)}</div><div class="stat-label">Total</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--yellow)">\${fmtBytes(r.database.bytes)}</div><div class="stat-label">Database</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--purple)">\${fmtBytes(r.evidence.bytes)}</div><div class="stat-label">Evidence</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${fmtBytes(r.repos.bytes)}</div><div class="stat-label">Repos</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--orange, #d2992a)">\${fmtBytes(ctxBytes)}</div><div class="stat-label">Context Cache</div></div>\`;
    html += '</div>';

    // Visual bar
    if (totalDisk > 0) {
      const dbPct = Math.max(1, Math.round(r.database.bytes / totalDisk * 100));
      const evPct = Math.max(1, Math.round(r.evidence.bytes / totalDisk * 100));
      const ctxPct = Math.max(ctxBytes > 0 ? 1 : 0, Math.round(ctxBytes / totalDisk * 100));
      const repoPct = Math.max(1, 100 - dbPct - evPct - ctxPct);
      html += \`<div style="display:flex;height:8px;border-radius:4px;overflow:hidden;margin-bottom:8px">
        <div style="width:\${dbPct}%;background:var(--yellow)" title="Database \${fmtBytes(r.database.bytes)}"></div>
        <div style="width:\${evPct}%;background:var(--purple)" title="Evidence \${fmtBytes(r.evidence.bytes)}"></div>
        <div style="width:\${ctxPct}%;background:var(--orange, #d2992a)" title="Context \${fmtBytes(ctxBytes)}"></div>
        <div style="width:\${repoPct}%;background:var(--green)" title="Repos \${fmtBytes(r.repos.bytes)}"></div>
      </div>\`;
      html += '<div style="display:flex;gap:16px;font-size:10px;color:var(--dim)">';
      html += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--yellow);margin-right:4px"></span>Database</span>';
      html += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--purple);margin-right:4px"></span>Evidence</span>';
      html += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--orange, #d2992a);margin-right:4px"></span>Context Cache</span>';
      html += '<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:var(--green);margin-right:4px"></span>Repos</span>';
      html += '</div>';
    }
    html += '</div>';

    // Database
    const tableCount = Object.keys(r.database.tables).length;
    html += '<div class="panel" style="margin-bottom:12px">';
    html += \`<div class="panel-title">Database <span style="font-size:10px;font-weight:400;color:var(--dim);margin-left:8px">\${fmtBytes(r.database.bytes)} · \${tableCount} tables</span></div>\`;
    html += \`<div style="font-size:12px;color:var(--dim)">SQLite database stored in ~/.noob-tester/noob-tester.db</div>\`;
    html += '</div>';

    // Evidence
    html += '<div class="panel" style="margin-bottom:12px">';
    html += \`<div class="panel-title">Evidence <span style="font-size:10px;font-weight:400;color:var(--dim);margin-left:8px">\${fmtBytes(r.evidence.bytes)} · \${r.evidence.fileCount} files</span></div>\`;
    html += '<div style="font-size:12px;color:var(--dim)">Screenshots, snapshots, console logs, HAR files, API request logs stored in ~/.noob-tester/evidence/</div>';
    html += '</div>';

    // Context Cache
    html += '<div class="panel" style="margin-bottom:12px">';
    html += \`<div class="panel-title">Context Cache <span style="font-size:10px;font-weight:400;color:var(--dim);margin-left:8px">\${fmtBytes(ctxBytes)} · \${ctxFiles} files</span></div>\`;
    html += '<div style="display:flex;gap:24px;font-size:12px;color:var(--dim)">';
    html += \`<span>\${ctxEntries} cached entries</span>\`;
    html += \`<span>\${ctxTickets} tickets</span>\`;
    html += '</div>';
    html += '<div style="font-size:12px;color:var(--dim);margin-top:4px">Ticket info, MR diffs, comments, linked tickets cached in ~/.noob-tester/ticket-context/</div>';
    html += '</div>';

    // Repos
    html += '<div class="panel" style="margin-bottom:12px">';
    html += \`<div class="panel-title">Repos <span style="font-size:10px;font-weight:400;color:var(--dim);margin-left:8px">\${fmtBytes(r.repos.bytes)} · \${r.repos.fileCount} files</span></div>\`;
    if (r.repos.repos.length > 0) {
      html += '<table style="width:100%;font-size:12px;border-collapse:collapse">';
      html += '<tr style="border-bottom:1px solid var(--border);color:var(--dim);font-size:11px;text-transform:uppercase"><th style="text-align:left;padding:6px">Repo</th><th style="text-align:right;padding:6px;width:100px">Size</th><th style="text-align:right;padding:6px;width:80px">Files</th></tr>';
      for (const repo of r.repos.repos.sort((a, b) => b.bytes - a.bytes)) {
        const isMissing = repo.bytes < 0;
        const sizeText = isMissing ? '<span style="color:var(--red)">path missing — run repos sync</span>' : fmtBytes(repo.bytes);
        const filesText = isMissing ? '-' : repo.fileCount.toLocaleString();
        html += \`<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:6px;font-family:monospace;color:\${isMissing ? 'var(--red)' : 'var(--green)'}">\${esc(repo.name)}</td>
          <td style="padding:6px;text-align:right">\${sizeText}</td>
          <td style="padding:6px;text-align:right;color:var(--dim)">\${filesText}</td>
        </tr>\`;
      }
      html += '</table>';
    } else {
      html += '<div style="font-size:12px;color:var(--dim)">No repos synced yet</div>';
    }
    html += '</div>';

    // Codebase Index
    html += '<div class="panel" style="margin-bottom:12px">';
    html += '<div class="panel-title">Codebase Index</div>';
    html += '<div style="display:flex;gap:24px;flex-wrap:wrap">';
    html += \`<div class="stat"><div class="stat-value" style="color:var(--accent)">\${r.index.files.toLocaleString()}</div><div class="stat-label">Indexed Files</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--purple)">\${r.index.chunks.toLocaleString()}</div><div class="stat-label">Search Chunks</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${r.index.imports.toLocaleString()}</div><div class="stat-label">Import Links</div></div>\`;
    html += '</div></div>';
  }

  setPage(html);
}

// ── Runs Page (Run Packs) ──

let rpSelectedTicket = "";
let rpSelectedPack = "";
let rpSelectedEntry = "";
let rpRunnerFilter = "all"; // "all" | "ui" | "api"

async function renderRunsPage() {
  const app = document.getElementById("app");

  // Fetch ticket IDs
  const ticketsRes = await fetch(API + "/api/runpacks/tickets");
  const tickets = await ticketsRes.json();

  if (tickets.length === 0) {
    app.innerHTML = '<div class="panel"><div class="empty">No run packs yet. Run <code>/noob-explore</code> (UI tests) or <code>/noob-api-explore</code> (API tests) to create one automatically via <code>runpack resolve</code>.</div></div>';
    return;
  }

  let html = "";

  // ── Level 1: Ticket list ──
  if (!rpSelectedTicket) {
    html += '<div class="panel" style="margin-bottom:16px"><div class="panel-title">Run Packs by Ticket</div>';
    html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
    const totalPacks = tickets.reduce((s, j) => s + j.pack_count, 0);
    const totalEntries = tickets.reduce((s, j) => s + j.total_entries, 0);
    const totalPassed = tickets.reduce((s, j) => s + j.passed, 0);
    const totalFailed = tickets.reduce((s, j) => s + j.failed, 0);
    html += \`<div class="stat"><div class="stat-value">\${tickets.length}</div><div class="stat-label">Tickets</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${totalPacks}</div><div class="stat-label">Run Packs</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${totalPassed}</div><div class="stat-label">Passed</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${totalFailed}</div><div class="stat-label">Failed</div></div>\`;
    html += '</div></div>';

    html += '<div class="panel">';
    for (const j of tickets) {
      html += \`<div class="session-card" onclick="rpSelectedTicket='\${esc(j.ticket_id)}';rpSelectedPack='';rpSelectedEntry='';renderRunsPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(j.ticket_id)}</span>
          <span style="display:flex;gap:6px;align-items:center">
            <span style="font-size:12px;color:var(--dim)">\${j.pack_count} pack\${j.pack_count !== 1 ? 's' : ''}</span>
            <button onclick="event.stopPropagation();deleteRunPacksByTicket('\${esc(j.ticket_id)}')" style="font-size:9px;color:var(--red);background:none;border:1px solid var(--border);border-radius:3px;padding:2px 5px;cursor:pointer" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">&times;</button>
          </span>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          \${j.passed ? \`<span class="suite-badge passed">\${j.passed} passed</span>\` : ""}
          \${j.failed ? \`<span class="suite-badge failed">\${j.failed} failed</span>\` : ""}
          \${j.pending ? \`<span class="suite-badge pending">\${j.pending} pending</span>\` : ""}
          \${j.claimed ? \`<span class="suite-badge claimed">\${j.claimed} running</span>\` : ""}
        </div>
        <div style="display:flex;gap:6px;margin-top:4px;font-size:11px;color:var(--dim)">
          \${j.ui_count ? \`<span style="color:var(--green)">\${j.ui_count} UI</span>\` : ""}
          \${j.api_count ? \`<span style="color:var(--orange, #d2992a)">\${j.api_count} API</span>\` : ""}
        </div>
        <div class="session-meta"><span>Last run: \${j.last_run || "-"}</span></div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // ── Level 2: Run packs for a ticket ──
  if (!rpSelectedPack) {
    const packsRes = await fetch(API + "/api/runpacks?ticket=" + encodeURIComponent(rpSelectedTicket));
    const packs = await packsRes.json();

    // Stats for this ticket — breadcrumb inside the stats panel below
    const totalTests = packs.reduce((s, p) => s + p.total, 0);
    const totalPassed = packs.reduce((s, p) => s + p.passed, 0);
    const totalFailed = packs.reduce((s, p) => s + p.failed, 0);

    html += '<div class="panel" style="margin-bottom:16px">';
    html += \`<div class="breadcrumb" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <span class="breadcrumb-item" onclick="rpSelectedTicket='';rpSelectedPack='';rpSelectedEntry='';renderRunsPage()">Explore</span>
        <span class="breadcrumb-sep">|</span>
        <span class="breadcrumb-item current">\${esc(rpSelectedTicket)}</span>
      </div>
      <button onclick="deleteRunPacksByTicket('\${esc(rpSelectedTicket)}')" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete All Packs</button>
    </div>\`;
    html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
    html += \`<div class="stat"><div class="stat-value">\${packs.length}</div><div class="stat-label">Run Packs</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${totalTests}</div><div class="stat-label">Total Tests</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${totalPassed}</div><div class="stat-label">Passed</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${totalFailed}</div><div class="stat-label">Failed</div></div>\`;
    html += '</div></div>';

    html += '<div class="panel">';
    if (packs.length === 0) {
      html += '<div class="empty">No run packs for this ticket.</div>';
    }
    for (const p of packs) {
      const pctDone = p.total > 0 ? Math.round(((p.passed + p.failed + p.skipped + p.blocked) / p.total) * 100) : 0;
      const badge = p.fresh_or_existing === "fresh"
        ? '<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(88,166,255,0.15);color:var(--accent);font-weight:600">FRESH</span>'
        : '<span style="font-size:10px;padding:2px 8px;border-radius:8px;background:rgba(125,133,144,0.15);color:var(--dim);font-weight:600">EXISTING</span>';

      // Capture config badges
      let captureBadges = "";
      if (p.capture_config) {
        try {
          const caps = JSON.parse(p.capture_config);
          if (Array.isArray(caps)) {
            captureBadges = caps.map(c => \`<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(188,140,255,0.1);color:var(--purple)">\${esc(c)}</span>\`).join("");
          }
        } catch {}
      }

      const pDate = p.created_at ? new Date(p.created_at.replace(" ", "T")) : null;
      const pTimeStr = pDate ? pDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + pDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";

      html += \`<div class="session-card" onclick="rpSelectedPack='\${esc(p.run_pack_id)}';rpSelectedEntry='';renderRunsPage()">
        <div class="session-header">
          <span class="session-id">\${esc(p.run_pack_id.slice(0, 8))}</span>
          <span style="display:flex;gap:6px;align-items:center">
            <span style="font-size:10px;color:var(--dim)">\${pTimeStr}</span>
            \${badge}
          </span>
        </div>
        \${p.target_url ? \`<div style="font-size:11px;color:var(--accent);margin-top:4px">\${esc(p.target_url)}</div>\` : ""}
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          \${p.passed ? \`<span class="suite-badge passed">\${p.passed} passed</span>\` : ""}
          \${p.failed ? \`<span class="suite-badge failed">\${p.failed} failed</span>\` : ""}
          \${p.pending ? \`<span class="suite-badge pending">\${p.pending} pending</span>\` : ""}
          \${p.claimed ? \`<span class="suite-badge claimed">\${p.claimed} running</span>\` : ""}
          \${p.skipped ? \`<span class="suite-badge" style="background:rgba(188,140,255,0.15);color:var(--purple)">\${p.skipped} skipped</span>\` : ""}
          \${p.blocked ? \`<span class="suite-badge" style="background:rgba(219,109,40,0.15);color:var(--orange)">\${p.blocked} blocked</span>\` : ""}
          \${p.ui_count ? \`<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(63,185,80,0.1);color:var(--green)">\${p.ui_count} UI</span>\` : ""}
          \${p.api_count ? \`<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(210,153,34,0.15);color:var(--orange, #d2992a)">\${p.api_count} API</span>\` : ""}
          \${p.secret_target ? \`<span style="font-size:9px;padding:1px 5px;border-radius:4px;background:rgba(63,185,80,0.1);color:var(--green)">creds: \${esc(p.secret_target)}</span>\` : ""}
          \${captureBadges}
        </div>
        <div style="margin-top:8px;background:rgba(125,133,144,0.08);border-radius:4px;height:4px;overflow:hidden">
          <div style="height:100%;width:\${pctDone}%;background:\${p.failed > 0 ? 'var(--red)' : 'var(--green)'};transition:width 0.3s"></div>
        </div>
        <div class="session-meta">
          <span>\${p.total} tests · \${pctDone}% complete</span>
        </div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // ── Level 3: Run pack detail — split view: test cases left, detail right ──
  const entriesRes = await fetch(API + "/api/runpacks?pack=" + encodeURIComponent(rpSelectedPack));
  const packData = await entriesRes.json();
  const entries = packData.entries || packData;
  const packMeta = packData.meta || null;

  // Stats for this pack
  const passed = entries.filter(e => e.status === "passed").length;
  const failed = entries.filter(e => e.status === "failed").length;
  const pending = entries.filter(e => e.status === "pending").length;

  html += '<div class="panel" style="margin-bottom:16px">';
  html += \`<div class="breadcrumb">
    <span class="breadcrumb-item" onclick="rpSelectedTicket='';rpSelectedPack='';rpSelectedEntry='';renderRunsPage()">Explore</span>
    <span class="breadcrumb-sep">|</span>
    <span class="breadcrumb-item" onclick="rpSelectedPack='';rpSelectedEntry='';renderRunsPage()">\${esc(rpSelectedTicket)}</span>
    <span class="breadcrumb-sep">|</span>
    <span class="breadcrumb-item current">\${esc(rpSelectedPack.slice(0, 8))}</span>
  </div>\`;
  // Pack metadata — target, credentials, capture config
  if (packMeta) {
    html += '<div style="display:flex;gap:12px;margin-bottom:10px;flex-wrap:wrap;font-size:12px">';
    if (packMeta.target_url) html += \`<span style="color:var(--accent)">Target: \${esc(packMeta.target_url)}</span>\`;
    if (packMeta.secret_target) html += \`<span style="color:var(--green)">Creds: \${esc(packMeta.secret_target)}\${packMeta.secret_role && packMeta.secret_role !== "default" ? "/" + esc(packMeta.secret_role) : ""}</span>\`;
    if (packMeta.capture_config) {
      try {
        const caps = JSON.parse(packMeta.capture_config);
        if (Array.isArray(caps)) html += \`<span style="color:var(--purple)">Capture: \${caps.map(c => esc(c)).join(", ")}</span>\`;
      } catch {}
    }
    html += '</div>';
  }
  html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
  const uiEntries = entries.filter(e => (e.runner || "ui") === "ui").length;
  const apiEntries = entries.filter(e => e.runner === "api").length;
  html += \`<div class="stat"><div class="stat-value">\${entries.length}</div><div class="stat-label">Tests</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${passed}</div><div class="stat-label">Passed</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${failed}</div><div class="stat-label">Failed</div></div>\`;
  html += \`<div class="stat"><div class="stat-value">\${pending}</div><div class="stat-label">Pending</div></div>\`;
  if (uiEntries > 0) html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${uiEntries}</div><div class="stat-label">UI</div></div>\`;
  if (apiEntries > 0) html += \`<div class="stat"><div class="stat-value" style="color:var(--orange, #d2992a)">\${apiEntries}</div><div class="stat-label">API</div></div>\`;

  // RCA stats (if available)
  try {
    const rcaRes = await fetch(API + "/api/rca/summary?pack=" + encodeURIComponent(rpSelectedPack));
    const rca = await rcaRes.json();
    if (rca.total > 0) {
      const classColors = { actual_bug: "var(--red)", env_issue: "var(--yellow)", flaky_selector: "var(--purple)", test_data_issue: "var(--orange, #d2992a)", network: "var(--accent)", auth_issue: "var(--yellow)", timeout: "var(--dim)", unknown: "var(--dim)" };
      html += '<span style="margin-left:16px;border-left:1px solid var(--border);padding-left:16px"></span>';
      for (const item of rca.byClassification) {
        const col = classColors[item.classification] || "var(--dim)";
        const label = item.classification.replace(/_/g, " ");
        html += \`<div class="stat"><div class="stat-value" style="color:\${col}">\${item.c}</div><div class="stat-label">\${label}</div></div>\`;
      }
    }
  } catch {}

  // False positive stats (if available)
  try {
    const fpRes = await fetch(API + "/api/false-positives/stats?pack=" + encodeURIComponent(rpSelectedPack));
    const fp = await fpRes.json();
    if (fp.retried > 0) {
      html += '<span style="margin-left:16px;border-left:1px solid var(--border);padding-left:16px"></span>';
      html += \`<div class="stat"><div class="stat-value" style="color:var(--yellow)">\${fp.falsePositives}</div><div class="stat-label">False Pos</div></div>\`;
      html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${fp.confirmedFailures}</div><div class="stat-label">Confirmed</div></div>\`;
    }
  } catch {}

  html += '</div></div>';

  html += '<div class="split-view">';

  // LEFT — test case entries list with runner filter
  html += '<div class="split-left">';

  // Filter tabs: All | UI | API
  if (uiEntries > 0 && apiEntries > 0) {
    html += '<div style="display:flex;gap:4px;margin-bottom:8px;padding:0 4px">';
    html += \`<div class="tab \${rpRunnerFilter === 'all' ? 'active' : ''}" style="font-size:10px;padding:3px 10px" onclick="rpRunnerFilter='all';renderRunsPage()">All (\${entries.length})</div>\`;
    html += \`<div class="tab \${rpRunnerFilter === 'ui' ? 'active' : ''}" style="font-size:10px;padding:3px 10px" onclick="rpRunnerFilter='ui';renderRunsPage()">UI (\${uiEntries})</div>\`;
    html += \`<div class="tab \${rpRunnerFilter === 'api' ? 'active' : ''}" style="font-size:10px;padding:3px 10px" onclick="rpRunnerFilter='api';renderRunsPage()">API (\${apiEntries})</div>\`;
    html += '</div>';
  }

  // Apply runner filter
  const filteredEntries = rpRunnerFilter === "all" ? entries
    : rpRunnerFilter === "api" ? entries.filter(e => e.runner === "api")
    : entries.filter(e => (e.runner || "ui") === "ui");

  const types = { direct_functional: [], impact_regression: [], general_regression: [] };
  for (const e of filteredEntries) (types[e.tc_type] || types.general_regression).push(e);
  // Sort each group: most recently executed first (completed_at or started_at), pending last
  for (const group of Object.values(types)) {
    group.sort((a, b) => {
      const aTime = a.completed_at || a.started_at || "";
      const bTime = b.completed_at || b.started_at || "";
      if (!aTime && !bTime) return 0;
      if (!aTime) return 1;
      if (!bTime) return -1;
      return bTime.localeCompare(aTime);
    });
  }

  for (const [type, group] of Object.entries(types)) {
    if (group.length === 0) continue;
    const typeLabel = type === "direct_functional" ? "Direct Functional" : type === "impact_regression" ? "Impact Regression" : "General Regression";
    html += \`<div class="type-group">
      <div class="type-group-header \${type}">\${typeLabel} (\${group.length})</div>\`;

    for (const e of group) {
      const isSel = rpSelectedEntry === e.id;
      const fmtTag = e.tc_format === "bdd" ? "BDD" : "TRAD";
      const eStatusColor = e.status === "passed" ? "var(--green)" : e.status === "failed" ? "var(--red)" : e.status === "claimed" ? "var(--yellow)" : e.status === "blocked" ? "var(--orange)" : e.status === "skipped" ? "var(--purple)" : "var(--dim)";
      const eStatusLabel = e.status === "claimed" ? "RUNNING" : e.status.toUpperCase();
      const eRunner = e.runner === "api" ? '<span style="font-size:8px;padding:1px 3px;border-radius:2px;background:rgba(210,153,34,0.15);color:var(--orange, #d2992a);font-weight:600;margin-right:3px">API</span>' : "";
      const eFpBadge = e.is_false_positive ? '<span style="font-size:8px;padding:1px 3px;border-radius:2px;background:rgba(210,153,42,0.15);color:var(--yellow);font-weight:600;margin-left:4px">FP</span>' : "";
      const eRetryBadge = e.retry_count > 0 ? \`<span style="font-size:8px;padding:1px 3px;border-radius:2px;background:rgba(125,133,144,0.1);color:var(--dim);margin-left:4px">R×\${e.retry_count}</span>\` : "";
      const eTime = e.completed_at || e.started_at;
      const eTimeStr = eTime ? new Date(eTime.replace(" ", "T")).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
      html += \`<div class="tc-item \${isSel ? 'selected' : ''}" onclick="rpSelectedEntry='\${e.id}';renderRunsPage()">
        <div style="display:flex;align-items:center;gap:4px">
          <span class="tc-status-dot \${e.status}"></span>
          <span style="font-size:8px;font-weight:700;color:\${eStatusColor};margin-right:2px">\${eStatusLabel}</span>
          \${eRunner}
          <span style="font-size:10px;color:var(--dim)">[\${fmtTag}]</span>
          \${eFpBadge}\${eRetryBadge}
          \${eTimeStr ? \`<span style="font-size:9px;color:var(--dim);margin-left:auto;white-space:nowrap">\${eTimeStr}</span>\` : ""}
        </div>
        <div style="font-size:11px;margin-top:2px;padding-left:16px">\${esc(e.tc_title || 'Untitled')}</div>
      </div>\`;
    }
    html += '</div>';
  }
  html += '</div>';

  // RIGHT — entry detail split view (results + logs/observations)
  html += '<div class="split-right panel">';
  const selEntry = rpSelectedEntry ? entries.find(e => e.id === rpSelectedEntry) : null;

  if (!selEntry) {
    html += '<div class="empty">Select a test case to view execution details</div>';
  } else {
    let entryRca = [];
    try {
      const rcaEntryRes = await fetch(API + "/api/rca/entry?entry=" + encodeURIComponent(selEntry.id));
      entryRca = await rcaEntryRes.json();
    } catch {}
    html += renderRunPackEntryDetail(selEntry, entryRca);
  }
  html += '</div>';

  html += '</div>';
  setPage(html);

  // Fetch and render run_artifacts for selected entry — grouped by step as cards in column layout
  if (rpSelectedEntry) {
    fetch(API + "/api/run-artifacts?entry=" + encodeURIComponent(rpSelectedEntry))
      .then(r => r.json())
      .then(artifacts => {
        if (!artifacts || artifacts.length === 0) return;
        const container = document.getElementById("entry-run-artifacts");
        if (!container) return;
        let h = '<div class="tc-detail-section"><div class="tc-detail-section-title">Captured Artifacts (' + artifacts.length + ')</div>';
        // Group by action_index to show step-based cards
        const byStep = {};
        for (const a of artifacts) {
          const key = a.action_index ?? 0;
          if (!byStep[key]) byStep[key] = { desc: a.action_desc || "", pageUrl: a.page_url || "", items: [] };
          byStep[key].items.push(a);
          if (a.action_desc && !byStep[key].desc) byStep[key].desc = a.action_desc;
          if (a.page_url && !byStep[key].pageUrl) byStep[key].pageUrl = a.page_url;
        }
        const stepKeys = Object.keys(byStep).sort((a, b) => Number(a) - Number(b));
        h += '<div style="display:flex;flex-direction:column;gap:10px">';
        for (const key of stepKeys) {
          const step = byStep[key];
          h += '<div style="background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:10px">';
          // Step header
          h += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">';
          h += '<span style="background:var(--accent);color:var(--bg);font-size:10px;font-weight:700;padding:2px 6px;border-radius:3px">Step ' + esc(String(Number(key) + 1)) + '</span>';
          if (step.desc) h += '<span style="font-size:12px;color:var(--fg)">' + esc(step.desc) + '</span>';
          h += '</div>';
          if (step.pageUrl) h += '<div style="font-size:10px;color:var(--dim);margin-bottom:8px;word-break:break-all">@ ' + esc(step.pageUrl) + '</div>';
          // Screenshot for this step
          const screenshots = step.items.filter(a => a.artifact_type === "screenshot" && a.file_path);
          for (const a of screenshots) {
            const url = API + "/api/artifact?path=" + encodeURIComponent(a.file_path);
            h += '<div style="margin-bottom:6px"><img src="' + url + '" style="max-width:100%;max-height:280px;border-radius:4px;border:1px solid var(--border);cursor:pointer" onclick="window.open(this.src,&quot;_blank&quot;)" onerror="this.style.display=&quot;none&quot;" /></div>';
          }
          // Other artifacts for this step (snapshot, console, har, etc.)
          const others = step.items.filter(a => a.artifact_type !== "screenshot");
          if (others.length > 0) {
            h += '<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">';
            for (const a of others) {
              if (a.file_path) {
                const url = API + "/api/artifact?path=" + encodeURIComponent(a.file_path);
                const typeIcon = a.artifact_type === "snapshot" ? "doc" : a.artifact_type === "console" ? "terminal" : a.artifact_type === "har" ? "network" : "file";
                h += '<a href="' + url + '" target="_blank" style="font-size:10px;color:var(--accent);background:rgba(88,166,255,0.08);padding:3px 8px;border-radius:3px;text-decoration:none;border:1px solid rgba(88,166,255,0.15)">' + esc(a.artifact_type) + '</a>';
              } else if (a.content) {
                h += '<pre style="font-size:9px;color:var(--dim);background:var(--bg);padding:4px;border-radius:3px;max-height:60px;overflow:auto;white-space:pre-wrap;width:100%">' + esc(a.content.slice(0, 500)) + '</pre>';
              }
            }
            h += '</div>';
          }
          h += '</div>';
        }
        h += '</div>';
        h += '</div>';
        container.innerHTML = h;
      }).catch(() => {});
  }
}

function renderRunPackEntryDetail(entry, entryRca = []) {
  let html = '<div class="tc-detail-panel">';

  // Title + status badges
  html += \`<div class="tc-detail-title">\${esc(entry.tc_title || "Untitled")}</div>\`;
  html += '<div class="tc-detail-meta">';
  const statusColor = entry.status === "passed" ? "var(--green)" : entry.status === "failed" ? "var(--red)" : entry.status === "claimed" ? "var(--yellow)" : "var(--dim)";
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${statusColor}">\${entry.status.toUpperCase()}</span>\`;
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:var(--accent)">\${(entry.tc_format || "").toUpperCase()}</span>\`;
  const typeColor = entry.tc_type === "direct_functional" ? "var(--green)" : entry.tc_type === "impact_regression" ? "var(--yellow)" : "var(--accent)";
  const typeLabel = entry.tc_type === "direct_functional" ? "Direct Functional" : entry.tc_type === "impact_regression" ? "Impact Regression" : "General Regression";
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${typeColor}">\${typeLabel}</span>\`;
  const freshBadge = entry.fresh_or_existing === "fresh" ? "FRESH" : "EXISTING";
  const freshColor = entry.fresh_or_existing === "fresh" ? "var(--accent)" : "var(--dim)";
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${freshColor}">\${freshBadge}</span>\`;
  const runnerLabel = (entry.runner || "ui").toUpperCase();
  const runnerColor = entry.runner === "api" ? "var(--orange, #d2992a)" : "var(--green)";
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${runnerColor}">Runner: \${runnerLabel}</span>\`;
  if (entry.tc_layer) {
    html += \`<span class="tc-detail-badge" style="background:rgba(188,140,255,0.12);color:var(--purple)">\${entry.tc_layer.toUpperCase()}</span>\`;
  }
  html += '</div>';

  // BDD / Traditional steps (from test case)
  if (entry.tc_format === "bdd") {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Scenario</div>';
    if (entry.bdd_feature) html += \`<div style="font-size:13px;color:var(--dim);margin-bottom:4px">Feature: \${esc(entry.bdd_feature)}</div>\`;
    if (entry.bdd_scenario) html += \`<div style="font-size:13px;color:var(--dim);margin-bottom:8px">Scenario: \${esc(entry.bdd_scenario)}</div>\`;
    try {
      const given = JSON.parse(entry.bdd_given || "[]");
      const when = JSON.parse(entry.bdd_when || "[]");
      const then_ = JSON.parse(entry.bdd_then || "[]");
      for (const g of given) html += \`<div class="bdd-step bdd-given">Given \${esc(g)}</div>\`;
      for (const w of when) html += \`<div class="bdd-step bdd-when">When \${esc(w)}</div>\`;
      for (const t of then_) html += \`<div class="bdd-step bdd-then">Then \${esc(t)}</div>\`;
    } catch {}
    html += '</div>';
  }

  if (entry.tc_format === "traditional" && entry.trad_steps) {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Steps</div>';
    try {
      const steps = JSON.parse(entry.trad_steps);
      for (let i = 0; i < steps.length; i++) {
        html += \`<div class="trad-step"><span class="trad-step-num">\${i + 1}.</span>\${esc(steps[i].step)}<div class="trad-expected">→ \${esc(steps[i].expected)}</div></div>\`;
      }
    } catch {}
    html += '</div>';
  }

  // ── Split area: Results left, Logs+Observations right ──
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">';

  // Results column
  html += '<div>';
  html += '<div class="tc-detail-section">';
  html += '<div class="tc-detail-section-title">Results</div>';
  if (entry.results) {
    try {
      const results = JSON.parse(entry.results);
      // API runner: render step-by-step request/response table
      if (results.runner === "api" && Array.isArray(results.steps)) {
        html += \`<div style="font-size:11px;color:var(--dim);margin-bottom:6px">\${esc(results.summary || "")} · \${results.total_steps} steps · \${(results.total_timing || 0).toFixed(2)}s total</div>\`;
        html += '<table class="data-table" style="font-size:11px"><thead><tr><th>#</th><th>Method</th><th>Path</th><th>Status</th><th>Time</th><th>Result</th></tr></thead><tbody>';
        for (const s of results.steps) {
          const sColor = s.result === "pass" ? "var(--green)" : s.result === "fail" ? "var(--red)" : "var(--dim)";
          const statusColor = s.status >= 200 && s.status < 300 ? "var(--green)" : s.status >= 400 ? "var(--red)" : "var(--yellow)";
          html += \`<tr>
            <td>\${s.step}</td>
            <td style="font-weight:600">\${esc(s.method || "")}</td>
            <td style="font-family:monospace">\${esc(s.path || "")}</td>
            <td style="color:\${s.status ? statusColor : 'var(--dim)'}">\${s.status ?? "—"}\${s.expected_status && s.status !== s.expected_status ? \` <span style="color:var(--dim)">(expected \${s.expected_status})</span>\` : ""}</td>
            <td>\${s.timing != null ? s.timing.toFixed(2) + "s" : "—"}</td>
            <td style="color:\${sColor};font-weight:600">\${(s.result || "—").toUpperCase()}</td>
          </tr>\`;
          if (s.error) html += \`<tr><td></td><td colspan="5" style="color:var(--red);font-size:10px;padding:2px 8px">\${esc(s.error)}</td></tr>\`;
        }
        html += '</tbody></table>';
      } else {
        // Render results as labeled key-value pairs
        const labelColors = {
          error: "var(--red)", root_cause: "var(--orange)", reason: "var(--yellow)",
          expected: "var(--green)", actual: "var(--red)", summary: "var(--accent)",
          details: "var(--dim)", status: "var(--accent)"
        };
        const keys = Object.keys(results);
        const isSimpleObject = typeof results === "object" && !Array.isArray(results) && keys.length > 0 && keys.every(k => typeof results[k] === "string" || typeof results[k] === "number" || typeof results[k] === "boolean");
        if (isSimpleObject) {
          for (const key of keys) {
            const label = key.replace(/_/g, " ").replace(/\\b\\w/g, c => c.toUpperCase());
            const color = labelColors[key] || "var(--dim)";
            html += \`<div style="margin-bottom:8px">
              <div style="font-size:10px;font-weight:600;color:\${color};text-transform:uppercase;margin-bottom:2px">\${esc(label)}</div>
              <div style="font-size:12px;color:var(--text);line-height:1.5">\${esc(String(results[key]))}</div>
            </div>\`;
          }
        } else {
          html += \`<pre style="font-size:11px;color:var(--text);white-space:pre-wrap;max-height:250px;overflow:auto;background:var(--bg);padding:8px;border-radius:4px">\${esc(typeof results === "string" ? results : JSON.stringify(results, null, 2))}</pre>\`;
        }
      }
    } catch {
      html += \`<pre style="font-size:11px;color:var(--text);white-space:pre-wrap;max-height:250px;overflow:auto;background:var(--bg);padding:8px;border-radius:4px">\${esc(entry.results)}</pre>\`;
    }
  } else {
    html += '<div style="font-size:12px;color:var(--dim)">No results recorded yet</div>';
  }
  html += '</div>';

  // Issues
  if (entry.issues) {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Issues Found</div>';
    try {
      const issues = JSON.parse(entry.issues);
      if (Array.isArray(issues)) {
        for (const issue of issues) {
          const sev = issue.severity || "info";
          const sevColor = sev === "critical" ? "var(--red)" : sev === "high" ? "var(--orange)" : sev === "medium" ? "var(--yellow)" : "var(--dim)";
          html += \`<div style="padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:10px;font-weight:700;color:\${sevColor};text-transform:uppercase">\${esc(sev)}</span>
            <span style="font-size:12px;margin-left:6px">\${esc(issue.title || issue)}</span>
          </div>\`;
        }
      } else {
        html += \`<pre style="font-size:11px;color:var(--text);white-space:pre-wrap;max-height:150px;overflow:auto;background:var(--bg);padding:8px;border-radius:4px">\${esc(JSON.stringify(issues, null, 2))}</pre>\`;
      }
    } catch {
      html += \`<pre style="font-size:11px;color:var(--text);white-space:pre-wrap;background:var(--bg);padding:8px;border-radius:4px">\${esc(entry.issues)}</pre>\`;
    }
    html += '</div>';
  }

  // RCA (Root Cause Analysis)
  if (entryRca.length > 0) {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Root Cause Analysis</div>';
    const classColors = { actual_bug: "var(--red)", env_issue: "var(--yellow)", flaky_selector: "var(--purple)", test_data_issue: "var(--orange, #d2992a)", network: "var(--accent)", auth_issue: "var(--yellow)", timeout: "var(--dim)", unknown: "var(--dim)" };
    const actionColors = { retry: "var(--accent)", fix_test: "var(--yellow)", fix_app: "var(--red)", fix_env: "var(--orange, #d2992a)", investigate: "var(--purple)", skip: "var(--dim)" };
    for (const rca of entryRca) {
      const classColor = classColors[rca.classification] || "var(--dim)";
      const classLabel = (rca.classification || "unknown").replace(/_/g, " ");
      const confPct = Math.round((rca.confidence || 0) * 100);
      const confColor = confPct >= 80 ? "var(--green)" : confPct >= 50 ? "var(--yellow)" : "var(--red)";
      html += \`<div style="padding:8px;margin-bottom:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg)">\`;
      html += \`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">\`;
      html += \`<span style="font-size:10px;font-weight:700;color:\${classColor};text-transform:uppercase;padding:2px 6px;border-radius:3px;background:rgba(0,0,0,0.2)">\${esc(classLabel)}</span>\`;
      html += \`<span style="font-size:10px;color:\${confColor};font-weight:600">\${confPct}% confidence</span>\`;
      if (rca.suggested_action) {
        const actColor = actionColors[rca.suggested_action] || "var(--dim)";
        const actLabel = rca.suggested_action.replace(/_/g, " ");
        html += \`<span style="font-size:10px;color:\${actColor};font-weight:600;margin-left:auto">\${esc(actLabel)}</span>\`;
      }
      html += \`</div>\`;
      html += \`<div style="font-size:12px;color:var(--text);line-height:1.5;margin-bottom:4px">\${esc(rca.root_cause)}</div>\`;
      if (rca.evidence_summary) {
        html += \`<div style="font-size:11px;color:var(--dim);line-height:1.4;border-top:1px solid var(--border);padding-top:4px;margin-top:4px">\${esc(rca.evidence_summary)}</div>\`;
      }
      html += \`</div>\`;
    }
    html += '</div>';
  }

  html += '</div>';

  // ── Artifacts (full width below results/logs grid) ──
  if (entry.artifacts) {
    try {
      const artifacts = JSON.parse(entry.artifacts);
      if (Array.isArray(artifacts) && artifacts.length > 0) {
        html += '</div>'; // close the 2-column grid early
        html += '<div class="tc-detail-section" style="margin-top:12px">';
        html += \`<div class="tc-detail-section-title">Artifacts (\${artifacts.length})</div>\`;

        // Group by type
        const byType = {};
        for (const a of artifacts) { if (!byType[a.type]) byType[a.type] = []; byType[a.type].push(a); }

        // Screenshots — render as thumbnails
        if (byType.screenshot) {
          html += '<div style="margin-bottom:12px">';
          html += '<div style="font-size:11px;color:var(--dim);margin-bottom:6px;font-weight:600">Screenshots</div>';
          html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
          for (const a of byType.screenshot) {
            const imgUrl = API + "/api/artifact?path=" + encodeURIComponent(a.path);
            const label = a.label || a.path.split("/").pop() || "screenshot";
            html += \`<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;max-width:280px;cursor:pointer" onclick="window.open('\${imgUrl}','_blank')">
              <img src="\${imgUrl}" style="width:100%;max-height:180px;object-fit:cover;display:block" onerror="this.style.display='none';this.nextSibling.style.display='block'" />
              <div style="display:none;padding:12px;color:var(--dim);font-size:11px">Image not available</div>
              <div style="padding:4px 8px;font-size:10px;color:var(--dim);border-top:1px solid var(--border);display:flex;justify-content:space-between">
                <span>\${esc(label)}</span>
                \${a.step !== undefined ? \`<span>Step \${a.step}</span>\` : ""}
              </div>
            </div>\`;
          }
          html += '</div></div>';
        }

        // Videos — render as playable video elements
        if (byType.video) {
          html += '<div style="margin-bottom:12px">';
          html += '<div style="font-size:11px;color:var(--dim);margin-bottom:6px;font-weight:600">Videos</div>';
          for (const a of byType.video) {
            const vidUrl = API + "/api/artifact?path=" + encodeURIComponent(a.path);
            const label = a.label || a.path.split("/").pop() || "video";
            html += \`<div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;max-width:480px;margin-bottom:8px">
              <video src="\${vidUrl}" controls style="width:100%;max-height:300px;display:block">
                <a href="\${vidUrl}" target="_blank">Download video</a>
              </video>
              <div style="padding:4px 8px;font-size:10px;color:var(--dim);border-top:1px solid var(--border)">\${esc(label)}</div>
            </div>\`;
          }
          html += '</div>';
        }

        // Snapshots (accessibility trees) — collapsible JSON
        if (byType.snapshot) {
          html += '<div style="margin-bottom:12px">';
          html += '<div style="font-size:11px;color:var(--dim);margin-bottom:6px;font-weight:600">Snapshots (\${byType.snapshot.length})</div>';
          for (const a of byType.snapshot) {
            const label = a.label || a.path.split("/").pop() || "snapshot";
            html += \`<div style="border:1px solid var(--border);border-radius:4px;margin-bottom:4px;padding:6px 8px;font-size:11px">
              <span style="color:var(--accent);cursor:pointer" onclick="window.open(API+'/api/artifact?path='+encodeURIComponent('\${esc(a.path)}'),'_blank')">\${esc(label)}</span>
              \${a.step !== undefined ? \`<span style="color:var(--dim);margin-left:8px">Step \${a.step}</span>\` : ""}
            </div>\`;
          }
          html += '</div>';
        }

        // HAR files — link
        if (byType.har) {
          html += '<div style="margin-bottom:12px">';
          html += '<div style="font-size:11px;color:var(--dim);margin-bottom:6px;font-weight:600">Network Traces</div>';
          for (const a of byType.har) {
            const label = a.label || a.path.split("/").pop() || "network.har";
            html += \`<div style="font-size:12px"><a href="\${API}/api/artifact?path=\${encodeURIComponent(a.path)}" target="_blank" style="color:var(--accent)">\${esc(label)}</a></div>\`;
          }
          html += '</div>';
        }

        // Console logs — link
        if (byType.console) {
          html += '<div style="margin-bottom:12px">';
          html += '<div style="font-size:11px;color:var(--dim);margin-bottom:6px;font-weight:600">Console Logs</div>';
          for (const a of byType.console) {
            const label = a.label || a.path.split("/").pop() || "console.log";
            html += \`<div style="font-size:12px"><a href="\${API}/api/artifact?path=\${encodeURIComponent(a.path)}" target="_blank" style="color:var(--accent)">\${esc(label)}</a></div>\`;
          }
          html += '</div>';
        }

        // Traces — link
        if (byType.trace) {
          html += '<div style="margin-bottom:12px">';
          html += '<div style="font-size:11px;color:var(--dim);margin-bottom:6px;font-weight:600">Traces</div>';
          for (const a of byType.trace) {
            const label = a.label || a.path.split("/").pop() || "trace";
            html += \`<div style="font-size:12px"><a href="\${API}/api/artifact?path=\${encodeURIComponent(a.path)}" target="_blank" style="color:var(--accent)">\${esc(label)}</a></div>\`;
          }
          html += '</div>';
        }

        html += '</div>';
        // Re-open a dummy div so the closing tags balance
        html += '<div>';
      }
    } catch {}
  }

  // Logs + Observations column
  html += '<div>';
  html += '<div class="tc-detail-section">';
  html += '<div class="tc-detail-section-title">Logs</div>';
  if (entry.logs) {
    try {
      const logs = JSON.parse(entry.logs);
      if (Array.isArray(logs)) {
        html += '<div style="max-height:250px;overflow:auto;background:var(--bg);padding:8px;border-radius:4px">';
        for (const l of logs) html += \`<div style="font-size:11px;color:var(--dim);padding:2px 0;border-bottom:1px solid var(--border)">\${esc(typeof l === "string" ? l : JSON.stringify(l))}</div>\`;
        html += '</div>';
      } else {
        html += \`<pre style="font-size:11px;color:var(--dim);white-space:pre-wrap;max-height:250px;overflow:auto;background:var(--bg);padding:8px;border-radius:4px">\${esc(JSON.stringify(logs, null, 2))}</pre>\`;
      }
    } catch {
      html += \`<pre style="font-size:11px;color:var(--dim);white-space:pre-wrap;max-height:250px;overflow:auto;background:var(--bg);padding:8px;border-radius:4px">\${esc(entry.logs)}</pre>\`;
    }
  } else {
    html += '<div style="font-size:12px;color:var(--dim)">No logs recorded yet</div>';
  }
  html += '</div>';

  html += '<div class="tc-detail-section">';
  html += '<div class="tc-detail-section-title">Observations</div>';
  if (entry.observations) {
    try {
      const obs = JSON.parse(entry.observations);
      if (Array.isArray(obs)) {
        html += '<div style="max-height:200px;overflow:auto;background:var(--bg);padding:8px;border-radius:4px">';
        for (const o of obs) html += \`<div style="font-size:12px;color:var(--text);padding:4px 0;border-bottom:1px solid var(--border)">\${esc(typeof o === "string" ? o : JSON.stringify(o))}</div>\`;
        html += '</div>';
      } else {
        html += \`<pre style="font-size:11px;color:var(--text);white-space:pre-wrap;max-height:200px;overflow:auto;background:var(--bg);padding:8px;border-radius:4px">\${esc(JSON.stringify(obs, null, 2))}</pre>\`;
      }
    } catch {
      html += \`<pre style="font-size:11px;color:var(--text);white-space:pre-wrap;background:var(--bg);padding:8px;border-radius:4px">\${esc(entry.observations)}</pre>\`;
    }
  } else {
    html += '<div style="font-size:12px;color:var(--dim)">No observations recorded yet</div>';
  }
  html += '</div>';
  html += '</div>';

  html += '</div>'; // end grid

  // Run artifacts placeholder (populated async after render)
  html += '<div id="entry-run-artifacts" style="margin-top:12px"></div>';

  // Timestamps
  html += '<div class="tc-detail-section" style="margin-top:12px">';
  html += '<div class="tc-detail-section-title">Execution Info</div>';
  html += \`<div style="font-size:12px;color:var(--dim)">Created: \${entry.created_at || "-"}</div>\`;
  if (entry.started_at) html += \`<div style="font-size:12px;color:var(--dim)">Started: \${entry.started_at}</div>\`;
  if (entry.completed_at) html += \`<div style="font-size:12px;color:var(--dim)">Completed: \${entry.completed_at}</div>\`;
  if (entry.session_id) html += \`<div style="font-size:12px;color:var(--dim)">Session: \${entry.session_id.slice(0, 8)}</div>\`;
  html += \`<div style="font-size:12px;color:var(--dim)">Entry ID: \${entry.id}</div>\`;
  html += \`<div style="font-size:12px;color:var(--dim)">Test Case ID: \${entry.test_case_id}</div>\`;
  html += '</div>';

  html += '</div>';
  return html;
}

// ── Test Cases Page ──

let tcSelectedSuite = "";
let tcSelectedId = "";
let tcAllCases = [];

async function renderTestCasesPage() {
  const app = document.getElementById("app");

  const statsRes = await fetch(API + "/api/testcases/stats");
  const stats = await statsRes.json();
  const casesRes = await fetch(API + "/api/testcases");
  tcAllCases = await casesRes.json();

  // Group by ticket (suite)
  const suites = {};
  for (const tc of tcAllCases) {
    if (!suites[tc.ticket_ref]) suites[tc.ticket_ref] = [];
    suites[tc.ticket_ref].push(tc);
  }

  // Stats bar — context-aware (global or suite-specific)
  const statsCases = tcSelectedSuite ? (suites[tcSelectedSuite] || []) : tcAllCases;
  const statsLabel = tcSelectedSuite ? tcSelectedSuite : "All Test Cases";

  const localStats = {
    total: statsCases.length,
    ready: statsCases.filter(c => c.ready).length,
    draft: statsCases.filter(c => !c.ready).length,
    byType: {},
    byStatus: {},
  };
  for (const c of statsCases) {
    localStats.byType[c.type] = (localStats.byType[c.type] || 0) + 1;
    localStats.byStatus[c.status] = (localStats.byStatus[c.status] || 0) + 1;
  }

  let html = '<div class="panel" style="margin-bottom:16px">';
  if (tcSelectedSuite) {
    html += \`<div class="breadcrumb">
      <span class="breadcrumb-item" onclick="tcSelectedSuite='';tcSelectedId='';renderTestCasesPage()">Test Cases</span>
      <span class="breadcrumb-sep">|</span>
      <span class="breadcrumb-item current">\${esc(tcSelectedSuite)}</span>
    </div>\`;
  } else {
    html += '<div class="panel-title">All Test Cases</div>';
  }
  if (localStats.total > 0) {
    html += '<div style="display:flex;gap:24px;margin-bottom:8px;align-items:center">';
    if (tcSelectedSuite) {
      html += \`<button onclick="exportTestCasesCsv('\${esc(tcSelectedSuite)}')" style="font-size:10px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;margin-right:4px" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">Export CSV</button>\`;
      html += \`<button onclick="deleteTestCasesByTicket('\${esc(tcSelectedSuite)}')" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;margin-right:8px" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete All</button>\`;
    }
    html += \`<div class="stat"><div class="stat-value">\${localStats.total}</div><div class="stat-label">Total</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${localStats.ready}</div><div class="stat-label">Ready</div></div>\`;
    html += \`<div class="stat"><div class="stat-value" style="color:var(--dim)">\${localStats.draft}</div><div class="stat-label">Draft</div></div>\`;
    for (const [type, count] of Object.entries(localStats.byType)) {
      const label = type === "direct_functional" ? "Direct" : type === "impact_regression" ? "Impact" : "Regression";
      html += \`<div class="stat"><div class="stat-value">\${count}</div><div class="stat-label">\${label}</div></div>\`;
    }
    for (const [status, count] of Object.entries(localStats.byStatus)) {
      const color = status === "passed" ? "var(--green)" : status === "failed" ? "var(--red)" : status === "claimed" ? "var(--yellow)" : "var(--dim)";
      html += \`<div class="stat"><div class="stat-value" style="color:\${color}">\${count}</div><div class="stat-label">\${status}</div></div>\`;
    }
    html += '</div>';
  }
  html += '</div>';

  if (tcAllCases.length === 0) {
    html += '<div class="panel"><div class="empty">No test cases. Use /noob-testcase to generate them.</div></div>';
    setPage(html);
    return;
  }

  // No suite selected — show suite list only
  if (!tcSelectedSuite) {
    html += '<div class="panel">';
    for (const [ticket, cases] of Object.entries(suites)) {
      const passed = cases.filter(c => c.status === "passed").length;
      const failed = cases.filter(c => c.status === "failed").length;
      const pending = cases.filter(c => c.status === "pending").length;
      const claimed = cases.filter(c => c.status === "claimed" || c.status === "running").length;
      const direct = cases.filter(c => c.type === "direct_functional").length;
      const impact = cases.filter(c => c.type === "impact_regression").length;
      const general = cases.filter(c => c.type === "general_regression").length;

      html += \`<div class="session-card" data-id="\${esc(ticket)}" onclick="tcSelectedSuite='\${esc(ticket)}';tcSelectedId='';renderTestCasesPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(ticket)}</span>
          <span style="font-size:12px;color:var(--dim)">\${cases.length} cases</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          \${passed ? \`<span class="suite-badge passed">\${passed} passed</span>\` : ""}
          \${failed ? \`<span class="suite-badge failed">\${failed} failed</span>\` : ""}
          \${claimed ? \`<span class="suite-badge claimed">\${claimed} running</span>\` : ""}
          \${pending ? \`<span class="suite-badge pending">\${pending} pending</span>\` : ""}
        </div>
        <div style="display:flex;gap:8px;margin-top:4px;font-size:11px;color:var(--dim)">
          \${direct ? \`<span style="color:var(--green)">\${direct} functional</span>\` : ""}
          \${impact ? \`<span style="color:var(--yellow)">\${impact} impact</span>\` : ""}
          \${general ? \`<span style="color:var(--accent)">\${general} regression</span>\` : ""}
        </div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // Suite selected — split view: test case list left, detail right
  const suiteCases = suites[tcSelectedSuite] || [];

  html += '<div class="split-view">';

  // LEFT — test cases grouped by type
  html += '<div class="split-left">';

  const types = { direct_functional: [], impact_regression: [], general_regression: [] };
  for (const c of suiteCases) (types[c.type] || types.general_regression).push(c);

  for (const [type, group] of Object.entries(types)) {
    if (group.length === 0) continue;
    const typeLabel = type === "direct_functional" ? "Direct Functional" : type === "impact_regression" ? "Impact Regression" : "General Regression";
    html += \`<div class="type-group">
      <div class="type-group-header \${type}">\${typeLabel} (\${group.length})</div>\`;

    for (const tc of group) {
      const isSel = tcSelectedId === tc.id;
      const fmtTag = tc.format === "bdd" ? "BDD" : "TRAD";
      const readyBadge = tc.ready
        ? '<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(63,185,80,0.15);color:var(--green);font-weight:600;margin-right:4px">READY</span>'
        : '<span style="font-size:8px;padding:1px 4px;border-radius:3px;background:rgba(125,133,144,0.15);color:var(--dim);font-weight:600;margin-right:4px">DRAFT</span>';
      const layerTag = (tc.test_layer || "ui").toUpperCase();
      html += \`<div class="tc-item \${isSel ? 'selected' : ''}" onclick="tcSelectedId='\${tc.id}';renderTestCasesPage()">
        <span class="tc-status-dot \${tc.status}"></span>
        \${readyBadge}
        <span style="font-size:10px;color:var(--dim);margin-right:4px">[\${fmtTag}]</span>
        <span style="font-size:9px;padding:1px 4px;border-radius:3px;background:rgba(188,140,255,0.12);color:var(--purple);font-weight:600;margin-right:4px">\${layerTag}</span>
        \${esc(tc.title)}
        \${tc.risk_score > 0 ? \`<span style="float:right;font-size:9px;padding:1px 5px;border-radius:3px;background:\${tc.risk_score >= 0.6 ? 'rgba(248,81,73,0.15)' : tc.risk_score >= 0.3 ? 'rgba(210,153,42,0.15)' : 'rgba(63,185,80,0.15)'};color:\${tc.risk_score >= 0.6 ? 'var(--red)' : tc.risk_score >= 0.3 ? 'var(--yellow)' : 'var(--green)'}">\${tc.risk_score.toFixed(2)}</span>\` : ""}
        \${tc.claimed_by ? \`<span style="float:right;font-size:10px;color:var(--yellow);margin-right:4px">\${tc.claimed_by.slice(0,8)}</span>\` : ""}
      </div>\`;
    }
    html += '</div>';
  }
  html += '</div>';

  // RIGHT — Detail panel
  html += '<div class="split-right panel">';
  const selectedTc = tcSelectedId ? tcAllCases.find(c => c.id === tcSelectedId) : null;

  if (!selectedTc) {
    html += '<div class="empty">Select a test case to view details</div>';
  } else {
    html += renderTcDetail(selectedTc);
  }
  html += '</div>';

  html += '</div>';
  setPage(html);
}

function renderTcDetail(tc) {
  let html = '<div class="tc-detail-panel">';

  // Title + status
  html += \`<div class="tc-detail-title">\${esc(tc.title)}</div>\`;

  // Badges
  html += '<div class="tc-detail-meta">';
  const statusColor = tc.status === "passed" ? "var(--green)" : tc.status === "failed" ? "var(--red)" : tc.status === "claimed" ? "var(--yellow)" : "var(--dim)";
  const readyColor = tc.ready ? "var(--green)" : "var(--dim)";
  const readyLabel = tc.ready ? "READY" : "DRAFT";
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${readyColor}">\${readyLabel}</span>\`;
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:var(--accent)">\${tc.format.toUpperCase()}</span>\`;
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${statusColor}">\${tc.status.toUpperCase()}</span>\`;
  const typeColor = tc.type === "direct_functional" ? "var(--green)" : tc.type === "impact_regression" ? "var(--yellow)" : "var(--accent)";
  const typeLabel = tc.type === "direct_functional" ? "Direct Functional" : tc.type === "impact_regression" ? "Impact Regression" : "General Regression";
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${typeColor}">\${typeLabel}</span>\`;
  const layerLabel = (tc.test_layer || "ui").toUpperCase();
  html += \`<span class="tc-detail-badge" style="background:rgba(188,140,255,0.12);color:var(--purple)">\${layerLabel}</span>\`;
  if (tc.execution_count > 0) html += \`<span class="tc-detail-badge" style="background:rgba(125,133,144,0.1);color:var(--dim)">Runs: \${tc.execution_count}</span>\`;
  if (tc.plan_step_id) html += \`<span class="tc-detail-badge" style="background:rgba(188,140,255,0.1);color:var(--purple)">Plan Step: \${tc.plan_step_id.slice(0, 8)}</span>\`;
  if (tc.risk_score != null && tc.risk_score > 0) {
    const riskColor = tc.risk_score >= 0.6 ? "var(--red)" : tc.risk_score >= 0.3 ? "var(--yellow)" : "var(--green)";
    html += \`<span class="tc-detail-badge" style="background:rgba(248,81,73,0.1);color:\${riskColor}">Risk: \${tc.risk_score.toFixed(2)}</span>\`;
  }
  html += '</div>';

  // Risk Assessment
  if (tc.risk_score != null && tc.risk_score > 0) {
    const riskPct = Math.round(tc.risk_score * 100);
    const riskColor = tc.risk_score >= 0.6 ? "var(--red)" : tc.risk_score >= 0.3 ? "var(--yellow)" : "var(--green)";
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Risk Assessment</div>';
    html += \`<div style="display:flex;align-items:center;gap:12px;margin-bottom:8px">
      <span style="font-size:24px;font-weight:700;color:\${riskColor}">\${tc.risk_score.toFixed(2)}</span>
      <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="width:\${riskPct}%;height:100%;background:\${riskColor};border-radius:4px"></div>
      </div>
    </div>\`;
    if (tc.risk_factors) {
      try {
        const f = JSON.parse(tc.risk_factors);
        const factors = [
          { label: "Failure Patterns", value: f.failurePatternScore, weight: "30%" },
          { label: "Code Churn", value: f.codeChurnScore, weight: "25%" },
          { label: "Flakiness", value: f.flakinessScore, weight: "20%" },
          { label: "Recency", value: f.recencyScore, weight: "15%" },
          { label: "Historical Failures", value: f.historicalFailureScore, weight: "10%" },
        ];
        for (const fac of factors) {
          const pct = Math.round((fac.value || 0) * 100);
          const col = (fac.value || 0) >= 0.6 ? "var(--red)" : (fac.value || 0) >= 0.3 ? "var(--yellow)" : "var(--green)";
          html += \`<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;font-size:12px">
            <span style="width:130px;color:var(--dim)">\${fac.label} (\${fac.weight})</span>
            <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
              <div style="width:\${pct}%;height:100%;background:\${col};border-radius:3px"></div>
            </div>
            <span style="width:30px;text-align:right;color:\${col}">\${(fac.value || 0).toFixed(2)}</span>
          </div>\`;
        }
      } catch {}
    }
    html += '</div>';
  }

  // Description
  if (tc.description) {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Description</div>';
    html += \`<div style="font-size:13px">\${esc(tc.description)}</div>\`;
    html += '</div>';
  }

  // Preconditions
  if (tc.preconditions) {
    try {
      const preconds = JSON.parse(tc.preconditions);
      if (preconds.length > 0) {
        html += '<div class="tc-detail-section">';
        html += '<div class="tc-detail-section-title">Preconditions</div>';
        for (const p of preconds) html += \`<div style="font-size:13px;color:var(--dim)">• \${esc(p)}</div>\`;
        html += '</div>';
      }
    } catch {}
  }

  // BDD Steps
  if (tc.format === "bdd") {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Scenario</div>';
    if (tc.bdd_feature) html += \`<div style="font-size:13px;color:var(--dim);margin-bottom:4px">Feature: \${esc(tc.bdd_feature)}</div>\`;
    if (tc.bdd_scenario) html += \`<div style="font-size:13px;color:var(--dim);margin-bottom:8px">Scenario: \${esc(tc.bdd_scenario)}</div>\`;
    try {
      const given = JSON.parse(tc.bdd_given || "[]");
      const when = JSON.parse(tc.bdd_when || "[]");
      const then_ = JSON.parse(tc.bdd_then || "[]");
      for (const g of given) html += \`<div class="bdd-step bdd-given">Given \${esc(g)}</div>\`;
      for (const w of when) html += \`<div class="bdd-step bdd-when">When \${esc(w)}</div>\`;
      for (const t of then_) html += \`<div class="bdd-step bdd-then">Then \${esc(t)}</div>\`;
    } catch {}
    html += '</div>';
  }

  // Traditional Steps
  if (tc.format === "traditional" && tc.trad_steps) {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Steps</div>';
    try {
      const steps = JSON.parse(tc.trad_steps);
      for (let i = 0; i < steps.length; i++) {
        html += \`<div class="trad-step">
          <span class="trad-step-num">\${i + 1}.</span>\${esc(steps[i].step)}
          <div class="trad-expected">→ \${esc(steps[i].expected)}</div>
        </div>\`;
      }
    } catch {}
    if (tc.trad_expected) {
      html += \`<div style="margin-top:8px;font-size:13px"><strong>Expected Result:</strong> \${esc(tc.trad_expected)}</div>\`;
    }
    html += '</div>';
  }

  // Labels
  if (tc.labels) {
    try {
      const labels = JSON.parse(tc.labels);
      if (labels.length > 0) {
        html += '<div class="tc-detail-section">';
        html += '<div class="tc-detail-section-title">Labels</div>';
        html += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
        for (const l of labels) html += \`<span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(88,166,255,0.1);color:var(--accent)">\${esc(l)}</span>\`;
        html += '</div></div>';
      }
    } catch {}
  }

  // Impacted files
  if (tc.impacted_files) {
    try {
      const files = JSON.parse(tc.impacted_files);
      if (files.length > 0) {
        html += '<div class="tc-detail-section">';
        html += '<div class="tc-detail-section-title">Impacted Files</div>';
        for (const f of files) html += \`<div style="font-size:12px;font-family:monospace;color:var(--dim)">\${esc(f)}</div>\`;
        html += '</div>';
      }
    } catch {}
  }

  // Code context
  if (tc.code_context) {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Code Context</div>';
    html += \`<pre style="font-size:11px;color:var(--dim);white-space:pre-wrap;max-height:200px;overflow:auto">\${esc(tc.code_context)}</pre>\`;
    html += '</div>';
  }

  // Related MR
  if (tc.related_mr) {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Related MR</div>';
    html += \`<div style="font-size:13px;color:var(--accent)">\${esc(tc.related_mr)}</div>\`;
    html += '</div>';
  }

  // Execution info
  if (tc.claimed_by || tc.executed_at) {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Execution</div>';
    if (tc.claimed_by) html += \`<div style="font-size:12px;color:var(--dim)">Claimed by: \${tc.claimed_by.slice(0,8)} at \${tc.claimed_at || "-"}</div>\`;
    if (tc.executed_at) html += \`<div style="font-size:12px;color:var(--dim)">Last executed: \${tc.executed_at}</div>\`;
    if (tc.last_status) html += \`<div style="font-size:12px;color:var(--dim)">Previous status: \${tc.last_status}</div>\`;
    if (tc.execution_result) {
      html += \`<pre style="font-size:11px;color:var(--dim);white-space:pre-wrap;max-height:150px;overflow:auto;margin-top:4px">\${esc(tc.execution_result)}</pre>\`;
    }
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ── Reports Page ──

let reportSelectedTicket = "";
let reportData = null;
let reportTab = "ai";

async function renderReportsPage() {
  const app = document.getElementById("app");

  if (!reportSelectedTicket) {
    // Level 1: Ticket list
    const res = await fetch(API + "/api/report/tickets");
    const tickets = await res.json();

    let html = '<div class="panel" style="margin-bottom:16px"><div class="panel-title">Reports</div>';
    html += '<div style="font-size:12px;color:var(--dim);margin-bottom:8px">Select a ticket to generate a comprehensive report with insights, patterns, and improvement plan.</div>';
    html += '</div>';

    if (tickets.length === 0) {
      html += '<div class="panel"><div class="empty">No tickets with data yet. Run tests first.</div></div>';
      setPage(html);
      return;
    }

    html += '<div class="panel">';
    for (const t of tickets) {
      html += \`<div class="session-card" onclick="reportSelectedTicket='\${esc(t.ticket)}';reportData=null;renderReportsPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(t.ticket)}</span>
          <span style="font-size:12px;color:var(--dim)">\${t.run_count} run\${t.run_count !== 1 ? "s" : ""}</span>
        </div>
        <div class="session-meta"><span>Last run: \${t.last_run || "-"}</span></div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // Level 2: Full report for a ticket
  if (!reportData) {
    setPage('<div class="panel"><div class="empty">Loading report for ' + esc(reportSelectedTicket) + '...</div></div>');
    const res = await fetch(API + "/api/report?ticket=" + encodeURIComponent(reportSelectedTicket));
    reportData = await res.json();
  }

  // Fetch saved Claude analysis
  const savedRes = await fetch(API + "/api/report/saved?ticket=" + encodeURIComponent(reportSelectedTicket));
  const savedReports = await savedRes.json();
  const latestSaved = Array.isArray(savedReports) && savedReports.length > 0 ? savedReports[0] : null;

  const r = reportData;
  const ins = r.insights || {};
  const sum = r.summary || {};
  const exec = sum.execution || {};

  let html = '<div class="panel" style="margin-bottom:12px">';
  html += \`<div class="breadcrumb">
    <span class="breadcrumb-item" onclick="reportSelectedTicket='';reportData=null;renderReportsPage()">Reports</span>
    <span class="breadcrumb-sep">|</span>
    <span class="breadcrumb-item current">\${esc(reportSelectedTicket)}</span>
  </div>\`;

  // Verdict banner — use saved report verdict if available, otherwise computed
  const activeVerdict = latestSaved ? latestSaved.verdict : ins.verdict;
  const activeSummary = latestSaved ? latestSaved.summary : ins.verdictReason;
  const verdictColor = activeVerdict === "PASS" ? "var(--green)" : activeVerdict === "FAIL" ? "var(--red)" : "var(--yellow)";
  html += \`<div style="display:flex;align-items:center;gap:12px;margin:8px 0 12px">
    <span style="font-size:20px;font-weight:800;color:\${verdictColor}">\${activeVerdict || "—"}</span>
    <span style="font-size:13px;color:var(--dim)">\${esc(activeSummary || "")}</span>
    \${latestSaved ? '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(188,140,255,0.12);color:var(--purple);font-weight:600">AI Analysis</span>' : '<span style="font-size:9px;padding:2px 6px;border-radius:3px;background:rgba(125,133,144,0.12);color:var(--dim);font-weight:600">Auto-computed</span>'}
  </div>\`;

  // Stats row
  html += '<div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:4px">';
  html += \`<div class="stat"><div class="stat-value">\${sum.totalIssues || 0}</div><div class="stat-label">Issues</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${exec.passed || 0}</div><div class="stat-label">Passed</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${exec.failed || 0}</div><div class="stat-label">Failed</div></div>\`;
  html += \`<div class="stat"><div class="stat-value">\${exec.blocked || 0}</div><div class="stat-label">Blocked</div></div>\`;
  if (ins.passRate != null) html += \`<div class="stat"><div class="stat-value" style="color:\${ins.passRate >= 80 ? 'var(--green)' : ins.passRate >= 50 ? 'var(--yellow)' : 'var(--red)'}">\${ins.passRate}%</div><div class="stat-label">Pass Rate</div></div>\`;
  if (exec.uiRuns) html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${exec.uiRuns}</div><div class="stat-label">UI</div></div>\`;
  if (exec.apiRuns) html += \`<div class="stat"><div class="stat-value" style="color:var(--orange, #d2992a)">\${exec.apiRuns}</div><div class="stat-label">API</div></div>\`;
  html += '</div>';
  // Tabs
  html += '<div style="display:flex;gap:6px;margin-top:8px">';
  html += '<div class="tab ' + (reportTab === "ai" ? "active" : "") + '" onclick="reportTab=\\'ai\\';renderReportsPage()">AI Result</div>';
  html += '<div class="tab ' + (reportTab === "runs" ? "active" : "") + '" onclick="reportTab=\\'runs\\';renderReportsPage()">Test Runs</div>';
  html += '<div class="tab ' + (reportTab === "analysis" ? "active" : "") + '" onclick="reportTab=\\'analysis\\';renderReportsPage()">Analysis</div>';
  html += '</div>';
  html += '</div>';

  // ── TAB: AI Result ──
  if (reportTab === "ai") {
    if (latestSaved) {
      html += '<div class="panel" style="margin-bottom:12px;border-left:3px solid var(--purple)">';
      html += '<div class="panel-title" style="color:var(--purple)">Claude Analysis <span style="font-size:9px;font-weight:400;color:var(--dim);margin-left:8px">' + esc(latestSaved.created_at || "") + '</span></div>';
      html += '<div class="md-content" style="font-size:12px;color:var(--text);line-height:1.7">' + renderMd(latestSaved.analysis) + '</div>';
      if (latestSaved.improvements) {
        html += '<div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border)">';
        html += '<div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:6px">Improvement Recommendations</div>';
        html += '<div class="md-content" style="font-size:12px;color:var(--text);line-height:1.7">' + renderMd(latestSaved.improvements) + '</div>';
        html += '</div>';
      }
      html += '</div>';
    } else {
      html += '<div class="panel" style="margin-bottom:12px;border-left:3px solid var(--border);opacity:0.7">';
      html += '<div style="font-size:12px;color:var(--dim);padding:4px 0">No AI analysis yet. Run <code>/noob-report ' + esc(reportSelectedTicket) + '</code> to have Claude analyze the data and write findings.</div>';
      html += '</div>';
    }

    // Test Notes from plan
    if (r.plan && r.plan.testNotes) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title">Test Notes</div>';
      html += \`<pre style="font-size:12px;color:var(--text);white-space:pre-wrap;margin:0;line-height:1.6">\${esc(r.plan.testNotes)}</pre>\`;
      html += '</div>';
    }
  }

  // ── TAB: Test Runs ──
  if (reportTab === "runs") {
    try {
      const packsRes = await fetch(API + "/api/runpacks?ticket=" + encodeURIComponent(reportSelectedTicket));
      const packs = await packsRes.json();

      if (!packs || packs.length === 0) {
        html += '<div class="panel"><div class="empty">No run packs for this ticket yet.</div></div>';
      } else {
        for (const p of packs) {
          const pctDone = p.total > 0 ? Math.round(((p.passed + p.failed + (p.skipped || 0) + (p.blocked || 0)) / p.total) * 100) : 0;
          const pDate = p.created_at ? new Date(p.created_at.replace(" ", "T")) : null;
          const pTimeStr = pDate ? pDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + pDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";

          html += '<div class="panel" style="margin-bottom:12px">';
          html += \`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="font-size:13px;font-weight:600;color:var(--accent)">\${esc(p.run_pack_id.slice(0, 8))}</span>
              <span style="font-size:11px;color:var(--dim)">\${pTimeStr}</span>
            </div>
            <div style="display:flex;gap:6px">
              \${p.passed ? \`<span class="suite-badge passed">\${p.passed} passed</span>\` : ""}
              \${p.failed ? \`<span class="suite-badge failed">\${p.failed} failed</span>\` : ""}
              \${p.blocked ? \`<span class="suite-badge" style="background:rgba(219,109,40,0.15);color:var(--orange)">\${p.blocked} blocked</span>\` : ""}
              \${p.pending ? \`<span class="suite-badge pending">\${p.pending} pending</span>\` : ""}
              <span style="font-size:11px;color:var(--dim)">\${pctDone}%</span>
            </div>
          </div>\`;

          // Progress bar
          html += \`<div style="background:rgba(125,133,144,0.08);border-radius:4px;height:4px;overflow:hidden;margin-bottom:10px">
            <div style="height:100%;width:\${pctDone}%;background:\${p.failed > 0 ? 'var(--red)' : 'var(--green)'};transition:width 0.3s"></div>
          </div>\`;

          // Fetch entries for this pack
          try {
            const entriesRes = await fetch(API + "/api/runpacks?pack=" + encodeURIComponent(p.run_pack_id));
            const packData = await entriesRes.json();
            const entries = packData.entries || packData;

            if (entries.length > 0) {
              html += '<table class="data-table" style="font-size:11px"><thead><tr><th style="width:30px">#</th><th>Status</th><th>Test Case</th><th>Type</th><th>Format</th><th>Time</th></tr></thead><tbody>';
              let idx = 1;
              for (const e of entries) {
                const sColor = e.status === "passed" ? "var(--green)" : e.status === "failed" ? "var(--red)" : e.status === "blocked" ? "var(--orange)" : e.status === "claimed" ? "var(--yellow)" : "var(--dim)";
                const sLabel = e.status === "claimed" ? "RUNNING" : (e.status || "pending").toUpperCase();
                const eTime = e.completed_at || e.started_at || "";
                const eTimeStr = eTime ? new Date(eTime.replace(" ", "T")).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "—";
                const typeLabel = e.tc_type === "direct_functional" ? "Direct" : e.tc_type === "impact_regression" ? "Impact" : "General";
                html += \`<tr>
                  <td style="color:var(--dim)">\${idx++}</td>
                  <td style="color:\${sColor};font-weight:600">\${sLabel}</td>
                  <td>\${esc(e.tc_title || "Untitled")}</td>
                  <td style="color:var(--dim)">\${typeLabel}</td>
                  <td style="color:var(--dim)">\${(e.tc_format || "").toUpperCase()}</td>
                  <td style="color:var(--dim)">\${eTimeStr}</td>
                </tr>\`;
              }
              html += '</tbody></table>';
            }
          } catch {}
          html += '</div>';
        }
      }
    } catch {
      html += '<div class="panel"><div class="empty">Failed to load run packs.</div></div>';
    }
  }

  // ── TAB: Analysis ──
  if (reportTab === "analysis") {
    // Risk Hotspots
    if (ins.riskHotspots && ins.riskHotspots.length > 0) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title" style="color:var(--red)">Risk Hotspots</div>';
      html += '<table class="data-table"><thead><tr><th>Location</th><th>Issues</th><th>Severities</th></tr></thead><tbody>';
      for (const h of ins.riskHotspots) {
        html += \`<tr><td style="font-family:monospace;color:var(--accent)">\${esc(h.location)}</td><td style="font-weight:600;color:var(--red)">\${h.issueCount}</td><td>\${esc(h.severities)}</td></tr>\`;
      }
      html += '</tbody></table></div>';
    }

    // Issue Patterns
    if (ins.issuePatterns && ins.issuePatterns.length > 0) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title" style="color:var(--yellow)">Issue Patterns</div>';
      for (const p of ins.issuePatterns) {
        html += \`<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);color:var(--text)">\${esc(p)}</div>\`;
      }
      html += '</div>';
    }

    // Coverage Gaps
    if (ins.coverageGaps && ins.coverageGaps.length > 0) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title" style="color:var(--orange, #d2992a)">Coverage Gaps</div>';
      for (const g of ins.coverageGaps) {
        html += \`<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);color:var(--yellow)">\${esc(g)}</div>\`;
      }
      html += '</div>';
    }

    // Top Issues
    if (r.issues && r.issues.length > 0) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title">Top Issues (' + r.issues.length + ')</div>';
      html += '<table class="data-table"><thead><tr><th>Severity</th><th>Category</th><th>Title</th><th>Location</th></tr></thead><tbody>';
      for (const i of r.issues.slice(0, 15)) {
        const sevColor = i.severity === "critical" ? "var(--red)" : i.severity === "high" ? "var(--red)" : i.severity === "medium" ? "var(--yellow)" : "var(--dim)";
        html += \`<tr>
          <td style="color:\${sevColor};font-weight:600;font-size:11px">\${(i.severity || "").toUpperCase()}</td>
          <td style="color:var(--accent);font-size:11px">\${esc(i.category || "")}</td>
          <td>\${esc(i.title || "")}</td>
          <td style="font-family:monospace;font-size:10px;color:var(--dim)">\${esc(i.location || "")}</td>
        </tr>\`;
      }
      if (r.issues.length > 15) html += \`<tr><td colspan="4" style="color:var(--dim);text-align:center">... and \${r.issues.length - 15} more</td></tr>\`;
      html += '</tbody></table></div>';
    }

    // Test Stability
    if (ins.testStability && ins.testStability.length > 0) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title">Test Stability</div>';
      for (const s of ins.testStability) {
        html += \`<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);color:var(--yellow)">\${esc(s)}</div>\`;
      }
      html += '</div>';
    }

    // Analysis Accuracy
    if (ins.analysisAccuracy && ins.analysisAccuracy.length > 0) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title">Analysis Accuracy</div>';
      for (const a of ins.analysisAccuracy) {
        html += \`<div style="font-size:12px;padding:4px 0;border-bottom:1px solid var(--border);color:var(--text)">\${esc(a)}</div>\`;
      }
      html += '</div>';
    }

    // Improvement Plan
    if (ins.improvements && ins.improvements.length > 0) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title" style="color:var(--accent)">Improvement Plan</div>';
      html += '<table class="data-table"><thead><tr><th style="width:80px">Priority</th><th>Action</th><th>Reason</th></tr></thead><tbody>';
      for (const imp of ins.improvements) {
        const prioColor = imp.priority === "critical" ? "var(--red)" : imp.priority === "high" ? "var(--yellow)" : imp.priority === "medium" ? "var(--accent)" : "var(--dim)";
        html += \`<tr>
          <td style="color:\${prioColor};font-weight:600;font-size:11px">\${imp.priority.toUpperCase()}</td>
          <td style="font-size:12px">\${esc(imp.action)}</td>
          <td style="font-size:11px;color:var(--dim)">\${esc(imp.reason || "")}</td>
        </tr>\`;
      }
      html += '</tbody></table></div>';
    }
  }

  setPage(html);
}

// ── Secrets Page ──

let secretsSelectedTarget = "";
let secretsSelectedRole = "";

async function renderSecretsPage() {
  const res = await fetch(API + "/api/secrets");
  const data = await res.json();
  const targetNames = Object.keys(data);
  const app = document.getElementById("app");

  // Stats
  let totalSecrets = 0;
  let totalRoles = 0;
  for (const t of Object.values(data)) {
    const roles = Object.keys(t.roles || {});
    totalRoles += roles.length;
    for (const secrets of Object.values(t.roles || {})) totalSecrets += secrets.length;
  }

  let html = '<div class="panel" style="margin-bottom:16px">';
  if (secretsSelectedTarget) {
    const tgt = data[secretsSelectedTarget];
    const tgtRoles = Object.keys(tgt?.roles || {});
    let tgtSecrets = 0;
    for (const secs of Object.values(tgt?.roles || {})) tgtSecrets += secs.length;
    html += \`<div class="breadcrumb">
      <span class="breadcrumb-item" onclick="secretsSelectedTarget='';secretsSelectedRole='';renderSecretsPage()">Secrets</span>
      <span class="breadcrumb-sep">|</span>
      <span class="breadcrumb-item current">\${esc(secretsSelectedTarget)}</span>
    </div>\`;
    html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
    html += \`<div class="stat"><div class="stat-value">\${tgtRoles.length}</div><div class="stat-label">Roles</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${tgtSecrets}</div><div class="stat-label">Secrets</div></div>\`;
    if (tgt?.url) html += \`<div style="font-size:11px;color:var(--dim);align-self:center">\${esc(tgt.url)}</div>\`;
    html += '</div>';
  } else {
    html += '<div class="panel-title">Secrets & Credentials</div>';
    if (targetNames.length > 0) {
      html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
      html += \`<div class="stat"><div class="stat-value">\${targetNames.length}</div><div class="stat-label">Targets</div></div>\`;
      html += \`<div class="stat"><div class="stat-value">\${totalRoles}</div><div class="stat-label">Roles</div></div>\`;
      html += \`<div class="stat"><div class="stat-value">\${totalSecrets}</div><div class="stat-label">Secrets</div></div>\`;
      html += '</div>';
    }
  }
  html += '</div>';

  // No target selected — split view: targets left, add form right
  if (!secretsSelectedTarget) {
    html += '<div class="split-view wide-left">';

    // LEFT — target cards
    html += '<div class="split-left">';
    if (targetNames.length === 0) {
      html += '<div class="empty">No targets configured. Add one using the form.</div>';
    } else {
      for (const targetName of targetNames) {
        const target = data[targetName];
        const roles = Object.keys(target.roles || {});
        const secretCount = roles.reduce((s, r) => s + (target.roles[r]?.length || 0), 0);

        html += \`<div class="session-card" onclick="secretsSelectedTarget='\${esc(targetName)}';secretsSelectedRole='';renderSecretsPage()">
          <div class="session-header">
            <span class="session-id" style="font-size:14px">\${esc(targetName)}</span>
            <span style="font-size:12px;color:var(--dim)">\${secretCount} secrets</span>
          </div>
          \${target.url ? \`<div style="font-size:12px;color:var(--dim);margin-top:2px;font-family:monospace">\${esc(target.url)}</div>\` : ""}
          \${target.description ? \`<div style="font-size:12px;color:var(--dim);margin-top:2px">\${esc(target.description)}</div>\` : ""}
          <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
            \${roles.map(r => \`<span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(210,153,34,0.15);color:var(--yellow)">@\${esc(r)} (\${target.roles[r].length})</span>\`).join("")}
          </div>
        </div>\`;
      }
    }
    html += '</div>';

    // RIGHT — add target form
    html += '<div class="split-right panel">';
    html += \`<div class="panel-title">Add Target</div>
      <div class="add-form" style="flex-direction:column">
        <input id="add-target-name" placeholder="Name (e.g. staging)" />
        <input id="add-target-url" placeholder="URL (e.g. https://staging.app.com)" />
        <input id="add-target-desc" placeholder="Description (optional)" />
        <button onclick="addTargetUI()">Add Target</button>
      </div>
      <div style="margin-top:20px;font-size:12px;color:var(--dim)">
        <div class="panel-title">CLI</div>
        <code>noob-tester secrets target add &lt;name&gt; --url &lt;url&gt;</code>
      </div>
    \`;
    html += '</div>';

    html += '</div>';

    setPage(html);
    return;
  }

  // Target selected — split view: roles+secrets on left, detail/forms on right
  const target = data[secretsSelectedTarget];
  if (!target) { secretsSelectedTarget = ""; renderSecretsPage(); return; }

  html += '<div class="split-view wide-left">';

  // LEFT — roles and secrets
  html += '<div class="split-left">';
  html += \`<div style="margin-bottom:12px"><button class="secret-delete" onclick="deleteTargetUI('\${esc(secretsSelectedTarget)}')">Delete Target</button></div>\`;

  const roles = Object.keys(target.roles || {});
  if (roles.length === 0) {
    html += '<div class="empty">No roles yet. Add a secret to create one.</div>';
  }

  for (const role of roles) {
    const secrets = target.roles[role] || [];
    const isSelected = secretsSelectedRole === role;

    html += \`<div class="suite-header \${isSelected ? 'active' : ''}" onclick="secretsSelectedRole='\${esc(role)}';renderSecretsPage()">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="color:var(--yellow);font-weight:600;font-size:13px">@\${esc(role)}</span>
        <span style="font-size:11px;color:var(--dim)">\${secrets.length} keys</span>
      </div>
    </div>\`;

    if (isSelected) {
      for (const s of secrets) {
        const srcClass = s.source === "1password" ? "op" : s.source;
        const srcLabel = s.source === "1password" ? "op" : s.source;
        html += \`<div class="secret-row" style="margin-left:12px">
          <span class="secret-key">\${esc(s.key)}</span>
          <span class="secret-source \${srcClass}">\${srcLabel}</span>
          <span class="secret-value" id="sv-\${esc(secretsSelectedTarget)}-\${esc(role)}-\${esc(s.key)}">\${esc(s.masked)}</span>
          <button class="secret-reveal" onclick="event.stopPropagation();revealSecret('\${esc(secretsSelectedTarget)}','\${esc(role)}','\${esc(s.key)}')">Reveal</button>
          <button class="secret-delete" onclick="event.stopPropagation();deleteSecretUI('\${esc(secretsSelectedTarget)}','\${esc(role)}','\${esc(s.key)}')">Delete</button>
        </div>\`;
      }
    }
  }
  html += '</div>';

  // RIGHT — forms
  html += '<div class="split-right panel">';

  // Add secret form
  html += \`<div class="panel-title">Add Secret</div>
    <div class="add-form" style="flex-direction:column">
      <div style="display:flex;gap:8px">
        <input id="add-secret-role" placeholder="Role (default)" value="\${esc(secretsSelectedRole || 'default')}" style="flex:1" />
      </div>
      <div style="display:flex;gap:8px">
        <input id="add-secret-key" placeholder="Key (e.g. LOGIN_EMAIL)" style="flex:1" />
      </div>
      <div style="display:flex;gap:8px">
        <select id="add-secret-source">
          <option value="literal">Literal value</option>
          <option value="env">env: variable</option>
          <option value="op">op: 1Password</option>
        </select>
        <input id="add-secret-value" placeholder="Value" style="flex:1" />
      </div>
      <button onclick="addSecretUI()">Add Secret</button>
    </div>
  \`;

  // Import from 1Password
  html += \`<div class="panel-title" style="margin-top:20px">Import from 1Password</div>
    <div class="add-form" style="flex-direction:column">
      <input id="import-op-ref" placeholder="vault/item (e.g. Private/MyApp)" />
      <input id="import-op-role" placeholder="Role (default)" value="\${esc(secretsSelectedRole || 'default')}" />
      <label style="font-size:12px;color:var(--dim);display:flex;align-items:center;gap:4px">
        <input type="checkbox" id="import-op-live" /> Live mode (store as op: references)
      </label>
      <button onclick="importOpUI()">Import All Fields</button>
      <div id="import-op-result"></div>
    </div>
  \`;

  // Delete role button if a role is selected
  if (secretsSelectedRole) {
    html += \`<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
      <button class="secret-delete" onclick="deleteRoleUI('\${esc(secretsSelectedTarget)}','\${esc(secretsSelectedRole)}')">Delete role @\${esc(secretsSelectedRole)} and all its secrets</button>
    </div>\`;
  }

  html += '</div>';
  html += '</div>';

  setPage(html);
}

async function addTargetUI() {
  const name = document.getElementById("add-target-name").value;
  const url = document.getElementById("add-target-url").value;
  const desc = document.getElementById("add-target-desc").value;
  if (!name) { alert("Target name required"); return; }
  await fetch(API + "/api/secrets/target", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, url: url || undefined, description: desc || undefined }),
  });
  renderSecretsPage();
}

async function addSecretUI() {
  const target = secretsSelectedTarget;
  const role = document.getElementById("add-secret-role").value || "default";
  const key = document.getElementById("add-secret-key").value;
  const source = document.getElementById("add-secret-source").value;
  let value = document.getElementById("add-secret-value").value;
  if (!target || !key || !value) { alert("Key and value required"); return; }
  if (source === "env") value = "env:" + value;
  if (source === "op") value = "op:" + value;
  await fetch(API + "/api/secrets", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, role, key, value }),
  });
  secretsSelectedRole = role;
  renderSecretsPage();
}

async function deleteSecretUI(target, role, key) {
  if (!confirm("Delete " + key + "?")) return;
  await fetch(API + "/api/secrets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, role, key }),
  });
  renderSecretsPage();
}

async function deleteRoleUI(target, role) {
  if (!confirm("Delete role " + role + " from " + target + "?")) return;
  await fetch(API + "/api/secrets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target, role }),
  });
  secretsSelectedRole = "";
  renderSecretsPage();
}

async function deleteTargetUI(target) {
  if (!confirm("Delete target " + target + " and ALL its secrets?")) return;
  await fetch(API + "/api/secrets", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ target }),
  });
  secretsSelectedTarget = "";
  secretsSelectedRole = "";
  renderSecretsPage();
}

async function importOpUI() {
  const opRef = document.getElementById("import-op-ref").value;
  const target = secretsSelectedTarget;
  const role = document.getElementById("import-op-role").value || "default";
  const live = document.getElementById("import-op-live").checked;
  const resultEl = document.getElementById("import-op-result");
  if (!opRef || !target) { alert("1Password ref required"); return; }
  resultEl.innerHTML = '<span style="color:var(--dim)">Importing...</span>';
  try {
    const res = await fetch(API + "/api/secrets/import-op", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ opRef, target, role, live }),
    });
    const data = await res.json();
    if (data.error) {
      resultEl.innerHTML = '<span style="color:var(--red)">' + esc(data.error) + '</span>';
      return;
    }
    resultEl.innerHTML = '<span style="color:var(--green)">Imported ' + data.imported.length + ' field(s): ' + data.imported.map(f => esc(f.key)).join(", ") + '</span>';
    setTimeout(() => renderSecretsPage(), 2000);
  } catch (err) {
    resultEl.innerHTML = '<span style="color:var(--red)">Failed: ' + esc(String(err)) + '</span>';
  }
}

async function revealSecret(target, role, key) {
  try {
    const res = await fetch(API + "/api/secrets?resolve=true&target=" + encodeURIComponent(target) + "&role=" + encodeURIComponent(role));
    const data = await res.json();
    const el = document.getElementById("sv-" + target + "-" + role + "-" + key);
    if (el && data[key]) {
      el.textContent = data[key];
      el.style.color = "var(--green)";
      setTimeout(() => { el.textContent = "****"; el.style.color = ""; }, 5000);
    }
  } catch (err) {
    alert("Failed to resolve: " + err);
  }
}

// ── Coverage Page ──

let covSelectedRepo = "";
let covSelectedFile = "";
let covSearch = "";
let covOffset = 0;
let covPageSize = 50;
let covUncoveredCache = [];
let covTotalUncovered = 0;

async function renderCoveragePage() {
  const reposRes = await fetch(API + "/api/coverage/repos");
  const repos = await reposRes.json();

  let html = '<div class="panel" style="margin-bottom:16px">';
  if (covSelectedRepo) {
    html += \`<div class="breadcrumb">
      <span class="breadcrumb-item" onclick="covSelectedRepo='';covSelectedFile='';covSearch='';covOffset=0;renderCoveragePage()">Coverage</span>
      <span class="breadcrumb-sep">|</span>
      <span class="breadcrumb-item current">\${esc(covSelectedRepo)}</span>
    </div>\`;
  } else {
    html += '<div class="panel-title">Code Coverage</div>';
  }
  html += '</div>';

  if (repos.length === 0) {
    html += '<div class="panel"><div class="empty">No coverage data. Run <code>noob-tester coverage build &lt;repo&gt;</code> first.</div></div>';
    setPage(html);
    return;
  }

  if (!covSelectedRepo) {
    html += '<div class="panel">';
    for (const r of repos) {
      const pct = r.coveragePercent;
      const color = pct >= 70 ? "var(--green)" : pct >= 40 ? "var(--yellow)" : "var(--red)";
      const pathWarning = r.path_exists === false ? '<div style="font-size:11px;color:var(--red);margin-top:6px">⚠ Path missing — run: noob-tester repos sync ' + esc(r.name) + '</div>' : "";
      html += \`<div class="session-card" onclick="covSelectedRepo='\${esc(r.name)}';covSelectedFile='';covSearch='';covOffset=0;renderCoveragePage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(r.name)}</span>
          <span style="font-size:20px;font-weight:700;color:\${color}">\${pct}%</span>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;margin-top:8px;overflow:hidden">
          <div style="width:\${pct}%;height:100%;background:\${color};border-radius:3px"></div>
        </div>
        <div style="display:flex;gap:16px;margin-top:8px;font-size:12px;color:var(--dim)">
          <span>\${r.totalFiles} files</span>
          <span style="color:var(--green)">\${r.coveredFiles} covered</span>
          <span style="color:var(--red)">\${r.uncoveredFiles} uncovered</span>
          <span>\${r.totalLinks} links</span>
        </div>
        \${pathWarning}
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // Repo selected — show uncovered files + file detail
  const uncovRes = await fetch(API + "/api/coverage/uncovered?repo=" + encodeURIComponent(covSelectedRepo) + "&limit=" + covPageSize + "&offset=" + covOffset + (covSearch ? "&search=" + encodeURIComponent(covSearch) : ""));
  const uncovData = await uncovRes.json();
  const uncovered = uncovData.files || [];
  covTotalUncovered = uncovData.total || 0;
  covUncoveredCache = uncovered;
  const repoStats = repos.find(r => r.name === covSelectedRepo);

  const repoPathMissing = repoStats && repoStats.path_exists === false;

  if (repoPathMissing) {
    html += \`<div class="panel" style="margin-bottom:12px;border:1px solid var(--yellow);background:rgba(210,153,42,0.05)">
      <div style="font-size:13px;color:var(--yellow);font-weight:600">⚠ Source missing — index data is stale</div>
      <div style="font-size:12px;color:var(--dim);margin-top:4px">The repo folder was deleted from disk. The index and coverage data below are from a prior sync and may be outdated. Run <code style="color:var(--accent)">noob-tester repos sync \${esc(covSelectedRepo)}</code> to re-clone and re-index.</div>
    </div>\`;
  }

  html += '<div style="display:flex;gap:24px;margin-bottom:16px" class="panel">';
  html += \`<div class="stat"><div class="stat-value">\${repoStats?.totalFiles || 0}</div><div class="stat-label">Total Files</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--green)">\${repoStats?.coveredFiles || 0}</div><div class="stat-label">Covered</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:var(--red)">\${repoStats?.uncoveredFiles || 0}</div><div class="stat-label">Uncovered</div></div>\`;
  html += \`<div class="stat"><div class="stat-value">\${repoStats?.totalLinks || 0}</div><div class="stat-label">Links</div></div>\`;
  html += '</div>';

  html += '<div class="split-view">';
  html += '<div class="split-left">';

  // Search + pagination header
  html += '<div style="padding:8px;border-bottom:1px solid var(--border)">';
  html += \`<input type="text" placeholder="Search files..." value="\${esc(covSearch)}"
    style="width:100%;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:5px 8px;border-radius:4px;font-size:11px;font-family:monospace;box-sizing:border-box;margin-bottom:6px"
    onchange="covSearch=this.value;covOffset=0;covSelectedFile='';renderCoveragePage()" />\`;
  html += \`<div style="font-size:11px;color:var(--dim);display:flex;justify-content:space-between;align-items:center">
    <span>Showing \${covOffset + 1}–\${Math.min(covOffset + covPageSize, covTotalUncovered)} of \${covTotalUncovered}</span>
    <span style="display:flex;align-items:center;gap:8px">
      <select style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:2px 4px;border-radius:3px;font-size:10px"
        onchange="covPageSize=parseInt(this.value);covOffset=0;renderCoveragePage()">
        \${[50,100,200,500].map(n => \`<option value="\${n}" \${covPageSize===n?'selected':''}>\${n}/page</option>\`).join("")}
      </select>
      \${covOffset > 0 ? \`<a href="#" onclick="covOffset=Math.max(0,covOffset-covPageSize);renderCoveragePage();return false" style="color:var(--accent)">← Prev</a>\` : ""}
      \${covOffset + covPageSize < covTotalUncovered ? \`<a href="#" onclick="covOffset+=covPageSize;renderCoveragePage();return false" style="color:var(--accent)">Next →</a>\` : ""}
    </span>
  </div>\`;
  html += '</div>';

  for (const f of uncovered) {
    const isSel = covSelectedFile === f.file_path;
    html += \`<div class="tc-item \${isSel ? 'selected' : ''}" onclick="covSelectedFile='\${esc(f.file_path)}';renderCoveragePage()" style="font-family:monospace;font-size:11px">
      <span style="color:var(--red);margin-right:4px">✗</span> \${esc(f.file_path)}
      \${f.importer_count > 0 ? \`<span style="float:right;font-size:10px;color:var(--yellow)">\${f.importer_count} importers</span>\` : ""}
    </div>\`;
  }

  // Load more at bottom
  if (covOffset + covPageSize < covTotalUncovered) {
    html += \`<div style="padding:12px;text-align:center"><a href="#" onclick="covOffset+=covPageSize;renderCoveragePage();return false" style="color:var(--accent);font-size:12px">Load more (\${covTotalUncovered - covOffset - covPageSize} remaining)</a></div>\`;
  }
  html += '</div>';

  html += '<div class="split-right panel">';
  if (covSelectedFile) {
    const byFileRes = await fetch(API + "/api/coverage/by-file?repo=" + encodeURIComponent(covSelectedRepo) + "&file=" + encodeURIComponent(covSelectedFile));
    const links = await byFileRes.json();
    html += \`<div class="panel-title" style="font-family:monospace;font-size:12px">\${esc(covSelectedFile)}</div>\`;
    if (links.length === 0) {
      html += '<div class="empty">No test cases cover this file</div>';
    } else {
      html += '<table class="data-table"><tr><th>Test Case</th><th>Type</th><th>Link</th><th>Confidence</th></tr>';
      for (const l of links) {
        html += \`<tr><td>\${esc(l.title)}</td><td>\${esc(l.type)}</td><td>\${esc(l.link_type)}</td><td>\${Math.round(l.confidence * 100)}%</td></tr>\`;
      }
      html += '</table>';
    }
  } else {
    html += '<div class="empty">Select a file to see coverage details</div>';
  }
  html += '</div></div>';
  setPage(html);
}

// ── Accessibility Page ──

let a11ySelectedRun = "";

let a11ySelectedTicket = "";
let a11ySelectedPack = "";
let a11ySelectedPage = "";

async function renderA11yPage() {
  const queryParam = a11ySelectedPack ? "?pack=" + encodeURIComponent(a11ySelectedPack)
    : a11ySelectedTicket ? "?ticket=" + encodeURIComponent(a11ySelectedTicket)
    : "";
  const summaryRes = await fetch(API + "/api/a11y/summary" + queryParam);
  const summary = await summaryRes.json();

  let html = '<div class="panel" style="margin-bottom:16px">';

  const impactColors = { critical: "var(--red)", serious: "var(--yellow)", moderate: "var(--accent)", minor: "var(--dim)" };

  // Breadcrumb
  html += '<div class="breadcrumb">';
  html += \`<span class="breadcrumb-item\${!a11ySelectedTicket ? ' current' : ''}" onclick="a11ySelectedTicket='';a11ySelectedPack='';a11ySelectedPage='';a11ySelectedRun='';renderA11yPage()">Accessibility</span>\`;
  if (a11ySelectedTicket) {
    html += '<span class="breadcrumb-sep">|</span>';
    html += \`<span class="breadcrumb-item\${!a11ySelectedPack ? ' current' : ''}" onclick="a11ySelectedPack='';a11ySelectedPage='';renderA11yPage()">\${esc(a11ySelectedTicket)}</span>\`;
  }
  if (a11ySelectedPack) {
    html += '<span class="breadcrumb-sep">|</span>';
    html += \`<span class="breadcrumb-item\${!a11ySelectedPage ? ' current' : ''}" onclick="a11ySelectedPage='';renderA11yPage()">\${esc(a11ySelectedPack.slice(0, 8))}</span>\`;
  }
  if (a11ySelectedPage) {
    html += '<span class="breadcrumb-sep">|</span>';
    const shortUrl = a11ySelectedPage.replace(/^https?:[/][/][^/]+/, "");
    html += \`<span class="breadcrumb-item current" style="font-family:monospace;font-size:11px">\${esc(shortUrl)}</span>\`;
  }
  html += '</div>';

  if (summary.total === 0) {
    html += '</div>';
    html += '<div class="panel"><div class="empty">No accessibility issues found. Issues are captured automatically during /noob-explore runs.</div></div>';
    setPage(html);
    return;
  }

  // Stats bar
  html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
  html += \`<div class="stat"><div class="stat-value">\${summary.total}</div><div class="stat-label">Total</div></div>\`;
  html += \`<div class="stat"><div class="stat-value">\${summary.pageCount}</div><div class="stat-label">Pages</div></div>\`;
  for (const item of summary.byImpact || []) {
    const col = impactColors[item.impact] || "var(--dim)";
    html += \`<div class="stat"><div class="stat-value" style="color:\${col}">\${item.c}</div><div class="stat-label">\${item.impact}</div></div>\`;
  }
  html += '</div></div>';

  // ── Level 1: Ticket list ──
  if (!a11ySelectedTicket && summary.tickets) {
    html += '<div class="panel">';
    for (const t of summary.tickets) {
      const ticketLabel = t.ticket_id === "unlinked" ? "Unlinked" : t.ticket_id;
      html += \`<div class="session-card" onclick="a11ySelectedTicket='\${esc(t.ticket_id)}';renderA11yPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(ticketLabel)}</span>
          <span style="font-size:12px;color:var(--dim)">\${t.pages} page\${t.pages > 1 ? "s" : ""}</span>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <span style="font-size:12px;color:var(--dim)">\${t.issue_count} issues</span>
          \${t.critical > 0 ? \`<span class="suite-badge failed">\${t.critical} critical</span>\` : ""}
          \${t.serious > 0 ? \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">\${t.serious} serious</span>\` : ""}
        </div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // ── Level 2: Run packs for a ticket ──
  if (a11ySelectedTicket && !a11ySelectedPack) {
    // Rules overview for this ticket
    if (summary.byRule && summary.byRule.length > 0) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title" style="margin-bottom:8px">Rules Violated</div>';
      html += '<table class="data-table" style="font-size:12px"><tr><th>Rule</th><th>Impact</th><th>Count</th></tr>';
      for (const r of summary.byRule) {
        const col = impactColors[r.impact] || "var(--dim)";
        html += \`<tr>
          <td style="font-family:monospace">\${esc(r.rule_id)}</td>
          <td style="color:\${col};font-weight:600">\${esc(r.impact)}</td>
          <td>\${r.count}</td>
        </tr>\`;
      }
      html += '</table></div>';
    }

    // Run pack cards
    if (summary.packs && summary.packs.length > 0) {
      html += '<div class="panel"><div class="panel-title" style="margin-bottom:8px">Run Packs</div>';
      for (const p of summary.packs) {
        const packLabel = p.run_pack_id ? p.run_pack_id.slice(0, 8) : "unknown";
        const lastDate = p.last_seen ? new Date(p.last_seen.replace(" ", "T")) : null;
        const timeStr = lastDate ? lastDate.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " + lastDate.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
        html += \`<div class="session-card" onclick="a11ySelectedPack='\${esc(p.run_pack_id)}';renderA11yPage()">
          <div class="session-header">
            <span class="session-id">\${esc(packLabel)}</span>
            <span style="font-size:11px;color:var(--dim)">\${timeStr}</span>
          </div>
          <div style="display:flex;gap:6px;margin-top:6px">
            <span style="font-size:12px;color:var(--dim)">\${p.issue_count} issues · \${p.pages} pages</span>
            \${p.critical > 0 ? \`<span class="suite-badge failed">\${p.critical} critical</span>\` : ""}
            \${p.serious > 0 ? \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">\${p.serious} serious</span>\` : ""}
          </div>
        </div>\`;
      }
      html += '</div>';
    }
    setPage(html);
    return;
  }

  // ── Level 3: Pages list for a run pack ──
  if (a11ySelectedPack && !a11ySelectedPage) {
    const issuesRes = await fetch(API + "/api/a11y/issues?pack=" + encodeURIComponent(a11ySelectedPack));
    const issues = await issuesRes.json();

    // Rules summary
    if (summary.byRule && summary.byRule.length > 0) {
      html += '<div class="panel" style="margin-bottom:12px"><div class="panel-title" style="margin-bottom:8px">Rules Violated</div>';
      html += '<table class="data-table" style="font-size:12px"><tr><th>Rule</th><th>Impact</th><th>Count</th></tr>';
      for (const r of summary.byRule) {
        const col = impactColors[r.impact] || "var(--dim)";
        html += \`<tr>
          <td style="font-family:monospace">\${esc(r.rule_id)}</td>
          <td style="color:\${col};font-weight:600">\${esc(r.impact)}</td>
          <td>\${r.count}</td>
        </tr>\`;
      }
      html += '</table></div>';
    }

    // Group by page URL and show as cards
    const byPage = {};
    for (const iss of issues) {
      const key = iss.page_url || "unknown";
      if (!byPage[key]) byPage[key] = [];
      byPage[key].push(iss);
    }

    html += '<div class="panel"><div class="panel-title" style="margin-bottom:8px">Pages</div>';
    for (const [pageUrl, pageIssues] of Object.entries(byPage)) {
      const pIssues = pageIssues;
      const critCount = pIssues.filter(i => i.impact === "critical").length;
      const seriousCount = pIssues.filter(i => i.impact === "serious").length;
      const moderateCount = pIssues.filter(i => i.impact === "moderate").length;
      const shortUrl = pageUrl.replace(/^https?:[/][/][^/]+/, "");
      html += \`<div class="session-card" onclick="a11ySelectedPage='\${esc(pageUrl)}';renderA11yPage()">
        <div style="font-size:12px;color:var(--accent);font-family:monospace;word-break:break-all">\${esc(shortUrl)}</div>
        <div style="display:flex;gap:6px;margin-top:6px">
          <span style="font-size:12px;color:var(--dim)">\${pIssues.length} issues</span>
          \${critCount > 0 ? \`<span class="suite-badge failed">\${critCount} critical</span>\` : ""}
          \${seriousCount > 0 ? \`<span class="suite-badge" style="background:rgba(210,153,34,0.15);color:var(--yellow)">\${seriousCount} serious</span>\` : ""}
          \${moderateCount > 0 ? \`<span class="suite-badge" style="background:rgba(88,166,255,0.15);color:var(--accent)">\${moderateCount} moderate</span>\` : ""}
        </div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // ── Level 4: Issues for a specific page ──
  if (a11ySelectedPage) {
    const issuesRes = await fetch(API + "/api/a11y/issues?pack=" + encodeURIComponent(a11ySelectedPack) + "&page=" + encodeURIComponent(a11ySelectedPage));
    const issues = await issuesRes.json();

    html += \`<div class="panel" style="margin-bottom:12px">
      <div style="font-size:12px;color:var(--accent);font-family:monospace;word-break:break-all;margin-bottom:8px">\${esc(a11ySelectedPage)}</div>
      <div style="font-size:12px;color:var(--dim);margin-bottom:12px">\${issues.length} accessibility issues found</div>
    </div>\`;

    if (issues.length > 0) {
      html += '<div class="panel">';
      html += '<table class="data-table" style="font-size:11px"><thead><tr><th>Impact</th><th>Rule</th><th>Description</th><th>Element</th><th>HTML</th></tr></thead><tbody>';
      for (const iss of issues) {
        const col = impactColors[iss.impact] || "var(--dim)";
        html += \`<tr>
          <td style="color:\${col};font-weight:600;white-space:nowrap">\${esc(iss.impact)}</td>
          <td style="font-family:monospace;white-space:nowrap">\${esc(iss.rule_id)}\${iss.help_url ? \` <a href="\${esc(iss.help_url)}" target="_blank" style="color:var(--accent);text-decoration:none;font-size:10px">?</a>\` : ""}</td>
          <td>\${esc(iss.description)}</td>
          <td style="font-family:monospace;font-size:10px;color:var(--dim);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${esc(iss.selector || "")}</td>
          <td style="font-family:monospace;font-size:10px;color:var(--dim);max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">\${esc(iss.html_snippet || "")}</td>
        </tr>\`;
      }
      html += '</tbody></table></div>';
    }
  }

  setPage(html);
}

// ── Test Audit Page ──

let auditTicket = "";
let auditTab = "overview";


async function renderTestAuditPage() {
  const auditRes = await fetch(API + "/api/test-audit" + (auditTicket ? "?ticket=" + encodeURIComponent(auditTicket) : ""));
  const audit = await auditRes.json();
  const s = audit.stats;

  let html = '<div class="panel" style="margin-bottom:16px">';
  html += '<div class="panel-title" style="margin-bottom:8px">Test Suite Audit</div>';

  // Ticket filter
  html += \`<div style="margin-bottom:12px"><input type="text" placeholder="Filter by ticket (e.g. PROJ-123)" value="\${esc(auditTicket)}"
    style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:6px 10px;border-radius:4px;font-size:12px;width:250px"
    onchange="auditTicket=this.value;renderTestAuditPage()" /></div>\`;

  if (s.total === 0) {
    html += '</div>';
    html += '<div class="panel"><div class="empty">No test cases to audit. Use /noob-testcase to generate them first.</div></div>';
    setPage(html);
    return;
  }

  html += '<div style="display:flex;gap:24px;margin-bottom:12px">';
  html += \`<div class="stat"><div class="stat-value">\${s.total}</div><div class="stat-label">Total</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:\${s.duplicateCount > 0 ? 'var(--yellow)' : 'var(--green)'}">\${s.duplicateCount}</div><div class="stat-label">Duplicate Pairs</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:\${s.neverFailedCount > 0 ? 'var(--yellow)' : 'var(--green)'}">\${s.neverFailedCount}</div><div class="stat-label">Never Failed</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:\${s.orphanedCount > 0 ? 'var(--yellow)' : 'var(--green)'}">\${s.orphanedCount}</div><div class="stat-label">Orphaned</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:\${s.staleCount > 0 ? 'var(--yellow)' : 'var(--green)'}">\${s.staleCount}</div><div class="stat-label">Stale (30d)</div></div>\`;
  html += \`<div class="stat"><div class="stat-value" style="color:\${(s.neverExecutedCount || 0) > 0 ? 'var(--orange)' : 'var(--green)'}">\${s.neverExecutedCount || 0}</div><div class="stat-label">Never Executed</div></div>\`;
  html += '</div>';

  // Tabs
  const tabs = [["overview","Overview"],["duplicates","Duplicates"],["neverFailed","Never Failed"],["orphaned","Orphaned"],["stale","Stale"],["neverExecuted","Never Executed"]];
  html += '<div style="display:flex;gap:8px;margin-bottom:8px">';
  for (const [key, label] of tabs) {
    const active = auditTab === key;
    html += \`<a href="#" class="tab \${active ? 'active' : ''}" onclick="auditTab='\${key}';renderTestAuditPage();return false">\${label}</a>\`;
  }
  html += '</div></div>';

  html += '<div class="panel">';

  if (auditTab === "overview" || auditTab === "duplicates") {
    if (audit.duplicates.length > 0) {
      html += '<div style="font-size:13px;font-weight:600;margin-bottom:8px">Near-Duplicate Pairs</div>';
      html += '<table class="data-table"><tr><th>Similarity</th><th>Test Case A</th><th>Test Case B</th><th>Type</th></tr>';
      for (const d of audit.duplicates.slice(0, auditTab === "overview" ? 5 : 50)) {
        const col = d.similarity >= 0.85 ? "var(--red)" : "var(--yellow)";
        html += \`<tr><td style="color:\${col};font-weight:600">\${Math.round(d.similarity * 100)}%</td><td>\${esc(d.a.title)}</td><td>\${esc(d.b.title)}</td><td>\${esc(d.a.type)}</td></tr>\`;
      }
      html += '</table>';
    } else if (auditTab === "duplicates") {
      html += '<div class="empty">No near-duplicate test cases found.</div>';
    }
  }

  if (auditTab === "overview" || auditTab === "neverFailed") {
    if (audit.neverFailed.length > 0) {
      if (auditTab === "overview" && audit.duplicates.length > 0) html += '<div style="margin-top:16px"></div>';
      html += '<div style="font-size:13px;font-weight:600;margin-bottom:8px">Never-Failed Test Cases</div>';
      html += '<table class="data-table"><tr><th>Title</th><th>Type</th><th>Executions</th></tr>';
      for (const nf of audit.neverFailed.slice(0, auditTab === "overview" ? 5 : 50)) {
        html += \`<tr><td>\${esc(nf.title)}</td><td>\${esc(nf.type)}</td><td>\${nf.execution_count}</td></tr>\`;
      }
      html += '</table>';
    } else if (auditTab === "neverFailed") {
      html += '<div class="empty">All executed test cases have failed at least once.</div>';
    }
  }

  if (auditTab === "overview" || auditTab === "orphaned") {
    if (audit.orphaned.length > 0) {
      if (auditTab === "overview") html += '<div style="margin-top:16px"></div>';
      html += '<div style="font-size:13px;font-weight:600;margin-bottom:8px">Orphaned (no activity 90d)</div>';
      html += '<table class="data-table"><tr><th>Title</th><th>Ticket</th><th>Last Executed</th></tr>';
      for (const o of audit.orphaned.slice(0, auditTab === "overview" ? 5 : 50)) {
        html += \`<tr><td>\${esc(o.title)}</td><td>\${esc(o.ticket_ref)}</td><td>\${o.last_executed || "never"}</td></tr>\`;
      }
      html += '</table>';
    } else if (auditTab === "orphaned") {
      html += '<div class="empty">No orphaned test cases.</div>';
    }
  }

  if (auditTab === "overview" || auditTab === "stale") {
    if (audit.stale.length > 0) {
      if (auditTab === "overview") html += '<div style="margin-top:16px"></div>';
      html += '<div style="font-size:13px;font-weight:600;margin-bottom:8px">Stale (30+ days)</div>';
      html += '<table class="data-table"><tr><th>Title</th><th>Last Executed</th><th>Days Since</th></tr>';
      for (const st of audit.stale.slice(0, auditTab === "overview" ? 5 : 50)) {
        html += \`<tr><td>\${esc(st.title)}</td><td>\${st.last_executed}</td><td>\${st.days_since}d</td></tr>\`;
      }
      html += '</table>';
    } else if (auditTab === "stale") {
      html += '<div class="empty">No stale test cases.</div>';
    }
  }

  if (auditTab === "overview" || auditTab === "neverExecuted") {
    if (audit.neverExecuted && audit.neverExecuted.length > 0) {
      if (auditTab === "overview") html += '<div style="margin-top:16px"></div>';
      html += '<div style="font-size:13px;font-weight:600;margin-bottom:8px">Never Executed (ready but never in a run pack)</div>';
      html += '<table class="data-table"><tr><th>Title</th><th>Type</th><th>Ticket</th><th>Created</th></tr>';
      for (const ne of audit.neverExecuted.slice(0, auditTab === "overview" ? 5 : 50)) {
        html += \`<tr><td>\${esc(ne.title)}</td><td>\${esc(ne.type)}</td><td>\${esc(ne.ticket_ref || "")}</td><td style="color:var(--dim)">\${esc(ne.created_at || "")}</td></tr>\`;
      }
      html += '</table>';
    } else if (auditTab === "neverExecuted") {
      html += '<div class="empty">All ready test cases have been executed at least once.</div>';
    }
  }

  html += '</div>';
  setPage(html);
}
</script>
</body>
</html>`;
}
