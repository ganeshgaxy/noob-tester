import { getWireframeScript } from "./wireframe.js";
import { getCanvasRendererScript } from "./canvas-renderer.js";
import { getApiCanvasRendererScript } from "./api-canvas-renderer.js";
import { getDashboardHelpersScript } from "./dashboard-helpers.js";
import { getCanvasBaseScript } from "./canvas-base.js";

export function getDashboardHtml(
  port: number,
  filterSessionId?: string,
): string {
  const wireframeScript = getWireframeScript();
  const apiCanvasScript = getApiCanvasRendererScript();
  const canvasScript = getCanvasRendererScript();
  const helpersScript = getDashboardHelpersScript();
  const canvasBaseScript = getCanvasBaseScript();
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<link href="https://unpkg.com/@phosphor-icons/web@2.1.1/src/regular/style.css" rel="stylesheet">
<title>noob-watch${filterSessionId ? ` — ${filterSessionId.slice(0, 8)}` : ""}</title>
<style>
  /* ── Design tokens — Vercel-style elevation ── */
  :root {
    --bg: #000000; --surface: #0a0a0a; --surface-raised: #171717;
    --border: #262626; --border-light: #333333;
    --text: #ededed; --dim: #888888; --muted: #666666;
    --accent: #0070f3; --accent-dim: rgba(0,112,243,0.1); --accent-glow: rgba(0,112,243,0.2);
    --green: #00c853; --green-dim: rgba(0,200,83,0.1);
    --yellow: #f5a623; --yellow-dim: rgba(245,166,35,0.1);
    --red: #ee0000; --red-dim: rgba(238,0,0,0.1);
    --orange: #f97316; --orange-dim: rgba(249,115,22,0.1);
    --purple: #7928ca; --purple-dim: rgba(121,40,202,0.1);
    --font-sans: 'Inter', -apple-system, 'Segoe UI', system-ui, sans-serif;
    --font-mono: 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, monospace;
    --radius: 8px; --radius-sm: 6px; --radius-xs: 4px;
    --shadow-sm: 0 1px 2px rgba(0,0,0,0.4);
    --shadow-md: 0 4px 14px rgba(0,0,0,0.5);
    --shadow-lg: 0 16px 48px rgba(0,0,0,0.6);
    --transition: 0.15s ease;
  }

  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; }
  body { font-family: var(--font-sans); background: var(--bg); color: var(--text); font-size: 13px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  .layout { display: flex; height: 100vh; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--muted); }

  /* ── Sidebar ── */
  .sidebar { width: 200px; flex-shrink: 0; background: var(--surface); display: flex; flex-direction: column; }
  .sidebar-logo { padding: 24px 18px 20px; }
  .sidebar-logo h1 { font-size: 17px; color: var(--text); font-weight: 800; letter-spacing: -0.5px; font-family: var(--font-mono); }
  .sidebar-logo h1 .brand-accent { color: var(--accent); }
  .sidebar-logo .version { font-size: 10px; color: var(--muted); font-weight: 500; letter-spacing: 0; margin-left: 6px; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }

  /* ── Workspace Switcher ── */
  .ws-picker { padding: 0 10px 12px; }
  .ws-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); font-weight: 500; margin-bottom: 4px; padding-left: 2px; }
  .ws-row { display: flex; align-items: center; gap: 4px; }
  .ws-row select { flex: 1; min-width: 0; font-size: 12px; font-family: var(--font-mono); font-weight: 500; color: var(--text); background: var(--surface-raised); border: 1px solid var(--border-light); border-radius: var(--radius-sm); padding: 5px 8px; cursor: pointer; outline: none; appearance: none; -webkit-appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%23888'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 8px center; }
  .ws-row select:hover { border-color: var(--accent); }
  .ws-row select:focus { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(99,102,241,0.15); }

  .sidebar-nav { flex: 1; padding: 8px 6px; overflow-y: auto; }
  .nav-btn { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; padding: 8px 12px; font-size: 13px; font-weight: 400; cursor: pointer; background: none; border: none; border-radius: var(--radius-sm); color: var(--dim); transition: color var(--transition), background var(--transition); }
  .nav-btn .nav-icon { font-size: 16px; width: 20px; text-align: center; color: var(--muted); }
  .nav-btn:hover { color: var(--text); background: var(--surface-raised); }
  .nav-btn.active { color: var(--text); background: var(--surface-raised); font-weight: 500; }
  .nav-btn.active .nav-icon { color: var(--accent); }

  .nav-group-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); padding: 20px 12px 6px; font-weight: 500; }

  .sidebar-stats { padding: 14px 18px; border-top: 1px solid var(--border); }
  .sidebar-stats .stat { display: flex; justify-content: space-between; align-items: center; padding: 5px 0; }
  .sidebar-stats .stat-value { font-size: 13px; font-weight: 600; font-family: var(--font-mono); }
  .sidebar-stats .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.3px; }

  /* ── Main content ── */
  .main { flex: 1; display: flex; flex-direction: column; min-width: 0; overflow: hidden; padding: 20px 24px 0; background: var(--bg); }

  /* ── Stats ── */
  .stat { text-align: center; padding: 12px 16px; background: var(--surface); border-radius: var(--radius); }
  .stat-value { font-size: 20px; font-weight: 600; font-family: var(--font-mono); letter-spacing: -0.3px; }
  .stat-label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }

  /* ── Grid ── */
  .grid { display: grid; grid-template-columns: 2fr 3fr; gap: 16px; overflow: hidden; height: 100%; }
  .grid > .panel { overflow-y: auto; }
  @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } }
  .grid.full { grid-template-columns: 1fr; }
  .page-scroll { flex: 1; overflow-y: auto; padding-bottom: 8px; }
  .page-stats { flex-shrink: 0; padding: 8px 0; }

  /* ── Panels ── */
  .panel { background: var(--surface); border-radius: var(--radius); padding: 16px; }
  .panel-title { font-size: 11px; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 10px; }

  /* ── Session cards ── */
  .session-card { padding: 14px; border-radius: var(--radius); margin-bottom: 6px; cursor: pointer; transition: background var(--transition); background: var(--surface-raised); }
  .session-card:hover { background: var(--border); }
  .session-card.active { border-left: 2px solid var(--green); }
  .session-card.stale { border-left: 2px solid var(--yellow); }
  .session-card.completed { border-left: 2px solid var(--muted); }
  .session-card.crashed { border-left: 2px solid var(--red); }
  .session-header { display: flex; justify-content: space-between; align-items: center; }
  .session-id { font-family: var(--font-mono); font-size: 13px; color: var(--text); font-weight: 500; }
  .session-status { font-size: 10px; padding: 3px 8px; border-radius: 99px; font-weight: 500; }
  .session-status.active { background: var(--green-dim); color: var(--green); }
  .session-status.stale { background: var(--yellow-dim); color: var(--yellow); }
  .session-status.completed { background: rgba(136,136,136,0.1); color: var(--dim); }
  .session-status.crashed { background: var(--red-dim); color: var(--red); }
  .session-task { font-size: 13px; margin-top: 6px; color: var(--text); line-height: 1.4; }
  .session-meta { font-size: 11px; color: var(--muted); margin-top: 6px; display: flex; gap: 12px; flex-wrap: wrap; }

  /* ── Issue rows ── */
  .issue-row { padding: 10px 12px; margin-bottom: 2px; font-size: 13px; transition: background var(--transition); border-radius: var(--radius-xs); }
  .issue-row:hover { background: var(--surface-raised); }
  .severity { display: inline-block; width: 60px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
  .severity.critical { color: var(--red); }
  .severity.high { color: var(--orange); }
  .severity.medium { color: var(--yellow); }
  .severity.low { color: var(--dim); }
  .severity.info { color: var(--purple); }
  .category { color: var(--muted); font-size: 11px; margin-left: 4px; }
  .issue-title { margin-left: 8px; }
  .issue-location { font-size: 11px; color: var(--muted); margin-left: 70px; margin-top: 2px; font-family: var(--font-mono); }
  .issue-time { font-size: 10px; color: var(--muted); float: right; font-family: var(--font-mono); }

  /* ── Action rows ── */
  .action-row { padding: 8px 12px; margin-bottom: 1px; font-size: 12px; color: var(--dim); transition: background var(--transition); border-radius: var(--radius-xs); }
  .action-row:hover { background: var(--surface-raised); }
  .action-row .agent { color: var(--text); font-weight: 500; }
  .action-row .phase { color: var(--yellow); font-weight: 500; font-family: var(--font-mono); }

  /* ── Run cards ── */
  .run-card { padding: 12px; border-radius: var(--radius-sm); margin-bottom: 6px; font-size: 13px; background: var(--surface-raised); transition: background var(--transition); }
  .run-card:hover { background: var(--border); }
  .run-status { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.3px; }
  .run-status.completed { color: var(--green); }
  .run-status.failed { color: var(--red); }
  .run-status.running { color: var(--yellow); }

  /* ── Empty states ── */
  .empty { color: var(--muted); font-size: 14px; text-align: center; padding: 40px 24px; line-height: 1.6; }

  /* ── Tabs ── */
  .tabs { display: flex; gap: 0; margin-bottom: 16px; border-bottom: 1px solid var(--border); }
  .tab { padding: 8px 16px; font-size: 13px; cursor: pointer; background: transparent; border: none; border-bottom: 2px solid transparent; color: var(--muted); font-weight: 400; transition: color var(--transition); margin-bottom: -1px; text-decoration: none; }
  .tab:hover { color: var(--text); }
  .tab.active { color: var(--text); border-bottom-color: var(--text); font-weight: 500; }

  /* ── App layout ── */
  #app { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
  .page-fixed { flex-shrink: 0; }
  .page-content { flex: 1; min-height: 0; overflow-y: auto; padding-bottom: 16px; animation: fadeIn 0.2s ease-out; }
  .page-content:has(.split-view), .page-content:has(.grid), .page-content:has(canvas) { overflow: hidden; display: flex; flex-direction: column; }
  .page-content > .split-view, .page-content > .grid { flex: 1; min-height: 0; }

  /* ── Breadcrumbs ── */
  .breadcrumb { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; font-size: 13px; flex-wrap: wrap; }
  .breadcrumb-item { color: var(--muted); cursor: pointer; transition: color var(--transition); }
  .breadcrumb-item:hover { color: var(--text); }
  .breadcrumb-item.current { color: var(--text); cursor: default; font-weight: 600; font-size: 16px; letter-spacing: -0.3px; }
  .breadcrumb-sep { color: var(--border-light); font-size: 14px; font-weight: 300; }

  /* ── Data tables ── */
  .data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .data-table thead { position: sticky; top: 0; z-index: 2; }
  .data-table th { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); color: var(--muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; cursor: pointer; user-select: none; white-space: nowrap; font-weight: 500; background: var(--surface); }
  .data-table th:hover { color: var(--text); }
  .data-table th .sort-arrow { margin-left: 4px; font-size: 8px; }
  .data-table td { padding: 10px 12px; vertical-align: top; }
  .data-table tr { transition: background var(--transition); }
  .data-table tbody tr:hover { background: var(--surface-raised); }

  /* ── Secrets ── */
  .secret-profile { margin-bottom: 16px; }
  .secret-profile-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
  .secret-profile-name { font-size: 14px; font-weight: 600; color: var(--accent); }
  .secret-row { display: flex; align-items: center; padding: 10px 8px; font-size: 13px; gap: 12px; transition: background var(--transition); border-radius: var(--radius-xs); margin-bottom: 2px; }
  .secret-row:hover { background: var(--surface-raised); }
  .secret-key { font-family: var(--font-mono); color: var(--text); min-width: 180px; font-weight: 500; }
  .secret-source { font-size: 10px; padding: 3px 8px; border-radius: 10px; font-weight: 600; }
  .secret-source.literal { background: rgba(100,116,139,0.15); color: var(--dim); }
  .secret-source.env { background: var(--yellow-dim); color: var(--yellow); }
  .secret-source.op { background: var(--accent-dim); color: var(--accent); }
  .secret-value { color: var(--dim); font-family: var(--font-mono); flex: 1; }
  .secret-reveal { font-size: 11px; color: var(--accent); cursor: pointer; padding: 3px 10px; border: 1px solid var(--border); border-radius: var(--radius-xs); background: none; transition: all var(--transition); }
  .secret-reveal:hover { border-color: var(--accent); }
  .secret-delete { font-size: 11px; color: var(--red); cursor: pointer; padding: 3px 10px; border: 1px solid var(--border); border-radius: var(--radius-xs); background: none; transition: border-color var(--transition); }
  .secret-delete:hover { border-color: var(--red); }

  /* ── Forms ── */
  .add-form { display: flex; gap: 8px; padding: 14px; background: var(--surface-raised); border-radius: var(--radius-sm); margin-top: 12px; flex-wrap: wrap; }
  .add-form input, .add-form select { padding: 8px 12px; font-size: 13px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-xs); color: var(--text); font-family: var(--font-sans); transition: border-color var(--transition); outline: none; }
  .add-form input:focus, .add-form select:focus { border-color: var(--text); }
  .add-form input { flex: 1; min-width: 120px; }
  .add-form button { padding: 7px 16px; font-size: 12.5px; background: var(--accent); color: var(--bg); border: none; border-radius: var(--radius-xs); cursor: pointer; font-weight: 600; font-family: var(--font-sans); transition: all var(--transition); }
  .add-form button:hover { opacity: 0.9; }

  /* ── Split view ── */
  .split-view { display: grid; grid-template-columns: 380px 1fr; gap: 14px; overflow: hidden; flex: 1; min-height: 0; }
  .split-view.wide-left { grid-template-columns: 1fr 340px; }
  @media (max-width: 900px) { .split-view, .split-view.wide-left { grid-template-columns: 1fr; } }
  .split-left { overflow-y: auto; min-height: 0; }
  .split-right { overflow-y: auto; min-height: 0; }

  /* ── Suite / test headers ── */
  .suite-header { padding: 12px 14px; cursor: pointer; border-radius: var(--radius-sm); margin-bottom: 4px; transition: background var(--transition); background: var(--surface-raised); }
  .suite-header:hover { background: var(--border); }
  .suite-header.active { background: var(--border); }
  .suite-name { font-size: 14px; font-weight: 500; color: var(--text); }
  .suite-meta { font-size: 11px; color: var(--muted); display: flex; gap: 10px; margin-top: 4px; }
  .suite-badge { font-size: 10px; padding: 2px 8px; border-radius: 99px; font-weight: 500; }
  .suite-badge.passed { background: var(--green-dim); color: var(--green); }
  .suite-badge.failed { background: var(--red-dim); color: var(--red); }
  .suite-badge.pending { background: rgba(136,136,136,0.1); color: var(--dim); }
  .suite-badge.claimed { background: var(--yellow-dim); color: var(--yellow); }

  /* ── Type groups ── */
  .type-group { margin-bottom: 16px; }
  .type-group-header { font-size: 11px; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px 0; border-bottom: 1px solid var(--border); margin-bottom: 8px; }
  .type-group-header.direct_functional { color: var(--green); }
  .type-group-header.impact_regression { color: var(--yellow); }
  .type-group-header.general_regression { color: var(--accent); }

  /* ── Test case items ── */
  .tc-item { padding: 10px 12px; border-radius: var(--radius-xs); margin-bottom: 3px; cursor: pointer; font-size: 13px; transition: background var(--transition); }
  .tc-item:hover { background: var(--surface-raised); }
  .tc-item.selected { background: var(--surface-raised); }
  .tc-status-dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; margin-right: 6px; }
  .tc-status-dot.passed { background: var(--green); color: var(--green); }
  .tc-status-dot.failed { background: var(--red); color: var(--red); }
  .tc-status-dot.pending { background: var(--dim); color: var(--dim); }
  .tc-status-dot.claimed, .tc-status-dot.running { background: var(--yellow); color: var(--yellow); }
  .tc-status-dot.skipped { background: var(--purple); color: var(--purple); }
  .tc-status-dot.blocked { background: var(--orange); color: var(--orange); }

  /* ── Test case detail ── */
  .tc-detail-panel { padding: 18px; }
  .tc-detail-title { font-size: 17px; font-weight: 700; margin-bottom: 14px; letter-spacing: -0.3px; }
  .tc-detail-meta { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
  .tc-detail-badge { font-size: 10.5px; padding: 3px 12px; border-radius: 12px; font-weight: 600; letter-spacing: 0.2px; }
  .tc-detail-section { margin-bottom: 18px; }
  .tc-detail-section-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; color: var(--muted); letter-spacing: 0.6px; margin-bottom: 8px; }
  .bdd-step { padding: 4px 0; font-size: 13px; font-family: var(--font-mono); }
  .bdd-given { color: var(--green); }
  .bdd-when { color: var(--yellow); }
  .bdd-then { color: var(--accent); }
  .trad-step { padding: 5px 0; font-size: 13px; border-bottom: 1px solid var(--border); }
  .trad-step:last-child { border-bottom: none; }
  .trad-step-num { color: var(--accent); font-weight: 600; margin-right: 8px; font-family: var(--font-mono); }
  .trad-expected { color: var(--dim); margin-left: 20px; font-style: italic; }

  /* ── Markdown content ── */
  .md-content h1 { font-size: 18px; color: var(--text); margin: 20px 0 10px; font-weight: 700; letter-spacing: -0.3px; }
  .md-content h2 { font-size: 15px; color: var(--text); margin: 16px 0 8px; font-weight: 700; }
  .md-content h3 { font-size: 13.5px; color: var(--text); margin: 14px 0 6px; font-weight: 600; }
  .md-content h4 { font-size: 12px; color: var(--muted); margin: 10px 0 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
  .md-content p { margin: 8px 0; line-height: 1.6; }
  .md-content ul, .md-content ol { padding-left: 20px; margin: 8px 0; }
  .md-content li { margin: 3px 0; }
  .md-content code { background: var(--accent-dim); color: var(--accent); padding: 2px 6px; border-radius: 4px; font-size: 11.5px; font-family: var(--font-mono); }
  .md-content pre { background: var(--bg); padding: 12px; border-radius: var(--radius-sm); font-size: 12px; overflow-x: auto; margin: 10px 0; border: 1px solid var(--border); }
  .md-content pre code { background: none; padding: 0; font-size: 12px; }
  .md-content strong { color: var(--text); font-weight: 600; }
  .md-content hr { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
  .md-content table { width: 100%; font-size: 12.5px; border-collapse: collapse; margin: 10px 0; }
  .md-content th, .md-content td { padding: 8px 10px; border-bottom: 1px solid var(--border); text-align: left; }
  .md-content th { color: var(--muted); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
  .md-content blockquote { border-left: 3px solid var(--accent); padding-left: 14px; margin: 10px 0; color: var(--dim); font-style: italic; }
  .md-content a { color: var(--accent); text-decoration: none; border-bottom: 1px solid var(--accent-dim); transition: border-color var(--transition); }
  .md-content a:hover { border-bottom-color: var(--accent); }

  /* ── Modal overlay ── */
  .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); z-index: 200; cursor: pointer; }
  .modal-box { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); width: 90vw; max-width: 1200px; max-height: 90vh; border-radius: var(--radius); border: 1px solid var(--border); box-shadow: var(--shadow-lg); cursor: default; display: flex; flex-direction: column; overflow: hidden; background: var(--surface); }
  .modal-close { cursor: pointer; color: var(--muted); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-xs); font-size: 18px; line-height: 1; transition: color var(--transition); }
  .modal-close:hover { color: var(--text); }

  /* ── Shared utility classes ── */
  .section-header { font-size: 10px; color: var(--muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; margin-bottom: 6px; }
  .detail-section { margin-bottom: 18px; }
  .detail-card { margin-bottom: 16px; padding: 14px; background: var(--surface-raised); border-radius: var(--radius-sm); }
  .pre-block { font-size: 12px; color: var(--dim); background: var(--surface-raised); padding: 12px; border-radius: var(--radius-sm); overflow-x: auto; white-space: pre-wrap; font-family: var(--font-mono); }
  .stats-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
  .stats-row.wide { gap: 24px; }
  .inline-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; letter-spacing: 0.2px; }
  .action-btn { font-size: 11px; background: var(--surface-raised); border: none; border-radius: var(--radius-xs); padding: 5px 12px; cursor: pointer; transition: background var(--transition); font-family: var(--font-sans); font-weight: 500; color: var(--dim); }
  .action-btn:hover { background: var(--border); color: var(--text); }
  .mono { font-family: var(--font-mono); }
  .text-xs { font-size: 10px; }
  .text-sm { font-size: 11px; }
  .text-md { font-size: 12px; }
  .text-dim { color: var(--dim); }
  .text-accent { color: var(--accent); }
  .text-green { color: var(--green); }
  .text-red { color: var(--red); }
  .text-yellow { color: var(--yellow); }
  .text-purple { color: var(--purple); }
  .text-bold { font-weight: 600; }
  .flex-row { display: flex; gap: 8px; align-items: center; }
  .flex-wrap { flex-wrap: wrap; }
  .mt-4 { margin-top: 4px; }
  .mt-8 { margin-top: 8px; }
  .mb-8 { margin-bottom: 8px; }
  .mb-16 { margin-bottom: 16px; }

  /* ── Skeleton loading ── */
  .skeleton { background: linear-gradient(90deg, var(--border) 25%, var(--border-light) 50%, var(--border) 75%); background-size: 200% 100%; animation: shimmer 1.5s ease-in-out infinite; border-radius: var(--radius-xs); height: 14px; }

  /* ── Artifact gallery — horizontal filmstrip ── */
  .artifact-gallery { display: flex; gap: 10px; overflow-x: auto; padding: 4px 0 10px; margin-bottom: 8px; scroll-snap-type: x mandatory; }
  .artifact-gallery::-webkit-scrollbar { height: 4px; }
  .artifact-gallery::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 2px; }
  .artifact-thumb { min-width: 240px; max-width: 320px; flex-shrink: 0; border-radius: var(--radius-sm); overflow: hidden; cursor: pointer; transition: opacity var(--transition); background: var(--surface-raised); scroll-snap-align: start; }
  .artifact-thumb:hover { opacity: 0.8; }
  .artifact-thumb.broken { display: none; }
  .artifact-thumb img { width: 100%; height: 180px; object-fit: cover; display: block; background: var(--bg); }
  .artifact-thumb-label { padding: 6px 10px; font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: var(--font-mono); }

  /* ── Artifact video ── */
  .artifact-videos { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .artifact-video { border-radius: var(--radius-sm); overflow: hidden; max-width: 520px; background: #000; }
  .artifact-video video { width: 100%; max-height: 320px; display: block; }
  .artifact-video-label { padding: 6px 10px; font-size: 11px; color: var(--muted); background: var(--surface-raised); display: flex; align-items: center; gap: 6px; }

  /* ── Artifact chips — colored file links ── */
  .artifact-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; margin-top: 4px; }
  .artifact-chip { display: inline-flex; align-items: center; gap: 7px; padding: 6px 12px; border-radius: var(--radius-xs); font-size: 11.5px; text-decoration: none; border: none; color: var(--dim); background: var(--surface-raised); transition: color var(--transition); font-family: var(--font-mono); }
  .artifact-chip:hover { color: var(--text); }
  .artifact-chip-icon { font-size: 15px; line-height: 1; }
  .artifact-chip-label { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .artifact-chip-action { color: var(--muted); font-size: 12px; }
  .artifact-chip[data-type="console"] .artifact-chip-icon { color: var(--yellow); }
  .artifact-chip[data-type="har"] .artifact-chip-icon { color: var(--purple); }
  .artifact-chip[data-type="trace"] .artifact-chip-icon { color: var(--orange); }
  .artifact-chip[data-type="snapshot"] .artifact-chip-icon { color: var(--accent); }

  /* ── Artifact timeline — vertical track ── */
  .artifact-timeline { display: flex; flex-direction: column; gap: 0; padding-left: 4px; }
  .timeline-step { display: flex; gap: 14px; min-height: 60px; }
  .timeline-marker { display: flex; flex-direction: column; align-items: center; flex-shrink: 0; width: 32px; }
  .timeline-dot { width: 28px; height: 28px; border-radius: 50%; background: var(--surface-raised); color: var(--text); font-size: 11px; font-weight: 600; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-family: var(--font-mono); z-index: 1; }
  .timeline-line { flex: 1; width: 1px; background: var(--border); margin: 4px 0; min-height: 16px; }
  .timeline-step:last-child .timeline-line { display: none; }
  .timeline-content { flex: 1; min-width: 0; padding-bottom: 16px; background: var(--surface-raised); border-radius: var(--radius-sm); padding: 12px; margin-bottom: 4px; }
  .timeline-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .timeline-step-num { font-size: 11px; font-weight: 700; color: var(--accent); font-family: var(--font-mono); }
  .timeline-desc { font-size: 12.5px; color: var(--text); }
  .timeline-url { font-size: 10.5px; color: var(--muted); margin-bottom: 8px; word-break: break-all; font-family: var(--font-mono); }

  /* ── Lightbox ── */
  .lightbox-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); z-index: 300; justify-content: center; align-items: center; flex-direction: column; cursor: pointer; }
  .lightbox-img { max-width: 90vw; max-height: 80vh; object-fit: contain; border-radius: 8px; box-shadow: 0 20px 60px rgba(0,0,0,0.5); cursor: default; animation: fadeIn 0.15s ease-out; }
  .lightbox-controls { display: flex; align-items: center; gap: 20px; margin-top: 16px; cursor: default; }
  .lightbox-arrow { width: 40px; height: 40px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 18px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all var(--transition); }
  .lightbox-arrow:hover { background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.3); }
  .lightbox-counter { font-size: 13px; color: rgba(255,255,255,0.6); font-family: var(--font-mono); min-width: 60px; text-align: center; }
  .lightbox-caption { font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 8px; text-align: center; max-width: 600px; font-family: var(--font-mono); }
  .lightbox-close { position: absolute; top: 16px; right: 20px; width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 18px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all var(--transition); }
  .lightbox-close:hover { background: rgba(248,113,113,0.3); border-color: rgba(248,113,113,0.4); }

  /* ── Swarm page ── */
  .swarm-ticket-group { margin-bottom: 28px; }
  .swarm-ticket-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
  .swarm-ticket-label { font-size: 15px; font-weight: 700; color: var(--text); letter-spacing: -0.3px; font-family: var(--font-mono); }
  .swarm-ticket-badge { font-size: 10px; padding: 2px 8px; border-radius: 99px; background: var(--green-dim); color: var(--green); font-weight: 600; }
  .swarm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 14px; }
  .swarm-card { background: var(--surface); border-radius: var(--radius); border: 1px solid var(--border); overflow: hidden; display: flex; flex-direction: column; }
  .swarm-card-header { padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border); background: var(--surface-raised); }
  .swarm-card-id { font-family: var(--font-mono); font-size: 12px; color: var(--text); font-weight: 600; }
  .swarm-card-port { font-size: 10px; padding: 2px 8px; border-radius: 6px; background: var(--accent-dim); color: var(--accent); font-weight: 600; font-family: var(--font-mono); }
  .swarm-card-task { padding: 6px 14px; font-size: 12px; color: var(--dim); border-bottom: 1px solid var(--border); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .swarm-stream-wrap { position: relative; background: #000; aspect-ratio: 4/3; overflow: hidden; }
  .swarm-canvas { width: 100%; height: 100%; display: block; object-fit: contain; }
  .swarm-stream-status { position: absolute; top: 6px; right: 8px; font-size: 10px; padding: 2px 8px; border-radius: 99px; font-weight: 600; }
  .swarm-stream-status.connecting { background: rgba(245,166,35,0.2); color: var(--yellow); }
  .swarm-stream-status.live { background: rgba(0,200,83,0.2); color: var(--green); }
  .swarm-stream-status.disconnected { background: rgba(238,0,0,0.15); color: var(--red); }
  .swarm-no-port { display: flex; align-items: center; justify-content: center; height: 120px; color: var(--muted); font-size: 12px; background: var(--surface-raised); }
  .swarm-empty { padding: 60px 24px; text-align: center; color: var(--muted); font-size: 14px; line-height: 1.6; }

  /* ── Swarm maximize button ── */
  .swarm-maximize-btn { position: absolute; top: 6px; left: 8px; width: 28px; height: 28px; border-radius: 6px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.15); color: #fff; font-size: 14px; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0; transition: opacity 0.15s; z-index: 5; }
  .swarm-stream-wrap:hover .swarm-maximize-btn { opacity: 1; }
  .swarm-maximize-btn:hover { background: rgba(0,0,0,0.7); border-color: rgba(255,255,255,0.3); }

  .swarm-stream-status.ended { background: rgba(160,160,160,0.15); color: var(--muted); }

  /* ── Swarm expand modal ── */
  .swarm-modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); z-index: 400; align-items: center; justify-content: center; }
  .swarm-modal-overlay.open { display: flex; }
  .swarm-modal-box { width: 80vw; max-width: 1200px; height: 75vh; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 24px 80px rgba(0,0,0,0.5); }
  .swarm-modal-header { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .swarm-modal-title { font-family: var(--font-mono); font-size: 12px; font-weight: 700; color: var(--text); }
  .swarm-modal-close { width: 28px; height: 28px; border-radius: 6px; background: var(--surface-raised); border: 1px solid var(--border); color: var(--text); font-size: 14px; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all var(--transition); }
  .swarm-modal-close:hover { background: rgba(248,113,113,0.2); border-color: rgba(248,113,113,0.3); color: var(--red); }
  .swarm-modal-body { flex: 1; display: flex; overflow: hidden; }
  .swarm-modal-stream { flex: 1; background: #000; display: flex; align-items: center; justify-content: center; min-width: 0; }
  .swarm-modal-canvas { max-width: 100%; max-height: 100%; object-fit: contain; }
  .swarm-modal-info { width: 340px; flex-shrink: 0; border-left: 1px solid var(--border); overflow-y: auto; padding: 16px; background: var(--surface); }
  .swarm-info-section { margin-bottom: 16px; }
  .swarm-info-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); margin-bottom: 6px; }
  .swarm-info-value { font-size: 12px; color: var(--text); font-family: var(--font-mono); line-height: 1.5; }
  .swarm-info-value .step-item { padding: 4px 0; border-bottom: 1px solid var(--border); }
  .swarm-info-value .step-item:last-child { border-bottom: none; }
  .swarm-info-badge { display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; }
  .swarm-info-badge.bdd { background: rgba(139,92,246,0.15); color: #a78bfa; }
  .swarm-info-badge.trad { background: rgba(59,130,246,0.15); color: #60a5fa; }
  .swarm-info-badge.passed { background: rgba(34,197,94,0.15); color: #4ade80; }
  .swarm-info-badge.failed { background: rgba(239,68,68,0.15); color: #f87171; }
  .swarm-info-badge.claimed, .swarm-info-badge.running { background: rgba(250,204,21,0.15); color: #facc15; }
  .swarm-info-loading { color: var(--muted); font-size: 12px; font-style: italic; }
</style>
</head>
<body>
<div class="layout">
  <div class="sidebar">
    <div class="sidebar-logo">
      <h1>noob<span class="brand-accent">.</span>tester<span class="version">v0.1</span></h1>
    </div>
    <div class="ws-picker">
      <div class="ws-label">Workspace</div>
      <div class="ws-row">
        <select id="ws-select" onchange="switchWorkspace(this.value)" title="Switch workspace">
          <option value="default">default</option>
        </select>
      </div>
    </div>
    <div class="sidebar-nav">
      <div class="nav-btn active" data-page="dashboard" onclick="switchPage('dashboard')"><i class="ph ph-squares-four nav-icon"></i>Dashboard</div>

      <div class="nav-group-label">Testing</div>
      <div class="nav-btn" data-page="runs" onclick="switchPage('runs')"><i class="ph ph-compass nav-icon"></i>Explore</div>
      <div class="nav-btn" data-page="swarm" onclick="switchPage('swarm')"><i class="ph ph-monitor-play nav-icon"></i>Swarm</div>
      <div class="nav-btn" data-page="issues" onclick="switchPage('issues')"><i class="ph ph-bug nav-icon"></i>Issues</div>
      <div class="nav-btn" data-page="qapool" onclick="switchPage('qapool')"><i class="ph ph-robot nav-icon"></i>Pool</div>
      <div class="nav-btn" data-page="scheduler" onclick="switchPage('scheduler')"><i class="ph ph-timer nav-icon"></i>Scheduler</div>

      <div class="nav-group-label">Planning</div>
      <div class="nav-btn" data-page="analyses" onclick="switchPage('analyses')"><i class="ph ph-magnifying-glass-plus nav-icon"></i>Analyses</div>
      <div class="nav-btn" data-page="testcases" onclick="switchPage('testcases')"><i class="ph ph-check-square nav-icon"></i>Test Cases</div>
      <div class="nav-btn" data-page="visualruns" onclick="switchPage('visualruns')"><i class="ph ph-eye nav-icon"></i>Visual Runs</div>
      <div class="nav-btn" data-page="plans" onclick="switchPage('plans')"><i class="ph ph-list-checks nav-icon"></i>Plans</div>
      <div class="nav-btn" data-page="blockers" onclick="switchPage('blockers')"><i class="ph ph-prohibit nav-icon"></i>Blockers</div>

      <div class="nav-group-label">Infrastructure</div>
      <div class="nav-btn" data-page="coverage" onclick="switchPage('coverage')"><i class="ph ph-chart-pie-slice nav-icon"></i>Coverage</div>
      <div class="nav-btn" data-page="a11y" onclick="switchPage('a11y')"><i class="ph ph-wheelchair nav-icon"></i>Accessibility</div>
      <div class="nav-btn" data-page="audit" onclick="switchPage('audit')"><i class="ph ph-clipboard-text nav-icon"></i>Test Audit</div>
      <div class="nav-btn" data-page="repos" onclick="switchPage('repos')"><i class="ph ph-git-branch nav-icon"></i>Repos</div>
      <div class="nav-btn" data-page="uimaps" onclick="switchPage('uimaps')"><i class="ph ph-browser nav-icon"></i>UI Maps</div>
      <div class="nav-btn" data-page="apimaps" onclick="switchPage('apimaps')"><i class="ph ph-plugs-connected nav-icon"></i>API Maps</div>
      <div class="nav-btn" data-page="secrets" onclick="switchPage('secrets')"><i class="ph ph-key nav-icon"></i>Secrets</div>
      <div class="nav-btn" data-page="files" onclick="switchPage('files')"><i class="ph ph-file-arrow-up nav-icon"></i>Files</div>

      <div class="nav-group-label">Reporting</div>
      <div class="nav-btn" data-page="reports" onclick="switchPage('reports')"><i class="ph ph-file-text nav-icon"></i>Reports</div>

      <div class="nav-group-label">System</div>
      <div class="nav-btn" data-page="context" onclick="switchPage('context')"><i class="ph ph-database nav-icon"></i>Context Cache</div>
      <div class="nav-btn" data-page="metrics" onclick="switchPage('metrics')"><i class="ph ph-chart-bar nav-icon"></i>Metrics</div>
      <div class="nav-btn" data-page="settings" onclick="switchPage('settings')"><i class="ph ph-gear nav-icon"></i>Settings</div>
      <div class="nav-btn" data-page="docs" onclick="switchPage('docs')"><i class="ph ph-book-open nav-icon"></i>Docs</div>
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
<div id="issue-modal-overlay" class="modal-overlay" onclick="if(event.target===this){this.style.display='none'}">
  <div id="issue-modal" class="modal-box"></div>
</div>

<!-- Lightbox -->
<div id="lightbox-overlay" class="lightbox-overlay" onclick="if(event.target===this)closeLightbox()">
  <span class="lightbox-close" onclick="closeLightbox()"><i class="ph ph-x"></i></span>
  <img id="lightbox-img" class="lightbox-img" />
  <div class="lightbox-controls">
    <span id="lightbox-prev" class="lightbox-arrow" onclick="event.stopPropagation();lbPrev()"><i class="ph ph-arrow-left"></i></span>
    <span id="lightbox-counter" class="lightbox-counter"></span>
    <span id="lightbox-next" class="lightbox-arrow" onclick="event.stopPropagation();lbNext()"><i class="ph ph-arrow-right"></i></span>
  </div>
  <div id="lightbox-caption" class="lightbox-caption"></div>
</div>

<script>
${helpersScript}
${canvasBaseScript}
${wireframeScript}
${canvasScript}
${apiCanvasScript}
const API = "http://localhost:${port}";
let state = null;
let viewingSession = ${filterSessionId ? '"' + filterSessionId + '"' : 'null'};
let activeTab = "issues";
let currentPage = "dashboard";

function savePageState() {
  const state = {
    page: currentPage,
    activeTab: activeTab,
    viewingSession: viewingSession,
    schedulerSelectedAgentId: schedulerSelectedAgentId || "",
    dashSelectedTicket: dashSelectedTicket || "",
    qaPoolSelectedTicket: qaPoolSelectedTicket || "",
  };
  sessionStorage.setItem('pageState', JSON.stringify(state));
}

function restorePageState() {
  const saved = sessionStorage.getItem('pageState');
  if (!saved) return;
  try {
    const state = JSON.parse(saved);
    currentPage = state.page || "dashboard";
    activeTab = state.activeTab || "issues";
    viewingSession = state.viewingSession || null;
    schedulerSelectedAgentId = state.schedulerSelectedAgentId || "";
    dashSelectedTicket = state.dashSelectedTicket || "";
    qaPoolSelectedTicket = state.qaPoolSelectedTicket || "";
  } catch (e) {
    console.error("Failed to restore page state:", e);
  }
}

function switchPage(page) {
  // Clean up swarm WebSocket connections when leaving the swarm page
  if (currentPage === "swarm" && page !== "swarm") swarmCleanup();
  currentPage = page;
  viewingSession = null;
  savePageState();
  document.querySelectorAll(".nav-btn").forEach(b => b.classList.toggle("active", b.dataset.page === page));
  render();
}

// ── Workspace switcher ──
function loadWorkspaces() {
  fetch(API + "/api/workspaces")
    .then(r => r.json())
    .then(data => {
      const sel = document.getElementById("ws-select");
      if (!sel) return;
      sel.innerHTML = "";
      (data.workspaces || []).forEach(ws => {
        const opt = document.createElement("option");
        opt.value = ws.name;
        opt.textContent = ws.name;
        if (ws.current) opt.selected = true;
        sel.appendChild(opt);
      });
    })
    .catch(() => {});
}

function switchWorkspace(name) {
  if (!name) return;
  fetch(API + "/api/workspaces/switch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  })
    .then(r => r.json())
    .then(data => {
      if (data.switched) {
        // Reload the page so all data reflects the new workspace
        window.location.reload();
      }
    })
    .catch(() => {});
}

function wsCreate() {
  const name = prompt("New workspace name (a-z, 0-9, -, _):");
  if (!name || !name.trim()) return;
  const trimmed = name.trim();
  fetch(API + "/api/workspaces/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: trimmed })
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) { alert("Error: " + data.error); return; }
      // Switch to the new workspace right away
      switchWorkspace(trimmed);
    })
    .catch(() => alert("Failed to create workspace"));
}

function wsRename() {
  const sel = document.getElementById("ws-select");
  const current = sel ? sel.value : "default";
  if (current === "default") { alert('The "default" workspace cannot be renamed.'); return; }
  const newName = prompt(\`Rename workspace "\${current}" to:\`);
  if (!newName || !newName.trim()) return;
  const trimmed = newName.trim();
  fetch(API + "/api/workspaces/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: current, to: trimmed })
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) { alert("Error: " + data.error); return; }
      // Reload so the dropdown and all data reflects the rename
      window.location.reload();
    })
    .catch(() => alert("Failed to rename workspace"));
}

function wsCopy() {
  const sel = document.getElementById("ws-select");
  const from = sel ? sel.value : "default";
  const to = prompt(\`Copy workspace "\${from}" to a new workspace name (a-z, 0-9, -, _):\`);
  if (!to || !to.trim()) return;
  const trimmed = to.trim();
  if (trimmed === from) { alert("Target workspace must have a different name."); return; }
  fetch(API + "/api/workspaces/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: trimmed, switchAfter: false })
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) { alert("Error: " + data.error); return; }
      const doSwitch = confirm(\`Workspace "\${from}" was copied to "\${trimmed}". Switch to "\${trimmed}" now?\`);
      if (doSwitch) {
        switchWorkspace(trimmed);
      } else {
        // Just refresh the workspace list so the new workspace appears in the dropdown
        loadWorkspaces();
      }
    })
    .catch(() => alert("Failed to copy workspace"));
}

// ── Settings-page workspace actions ──
window.wsSettingsCreate = function() {
  const inp = document.getElementById("ws-new-name");
  const name = inp ? inp.value.trim() : "";
  if (!name) { alert("Enter a workspace name."); return; }
  fetch(API + "/api/workspaces/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) { alert("Error: " + data.error); return; }
      loadWorkspaces();
      const doSwitch = confirm('Workspace "' + name + '" created. Switch to it now?');
      if (doSwitch) { switchWorkspace(name); } else { settingsTab = "workspaces"; renderSettingsPage(); }
    })
    .catch(() => alert("Failed to create workspace"));
};

window.wsSettingsCopy = function() {
  const fromSel = document.getElementById("ws-copy-from");
  const toInp = document.getElementById("ws-copy-to");
  const from = fromSel ? fromSel.value : "";
  const to = toInp ? toInp.value.trim() : "";
  if (!from || !to) { alert("Select a source and enter a target name."); return; }
  if (from === to) { alert("Target must differ from source."); return; }
  fetch(API + "/api/workspaces/copy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, switchAfter: false })
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) { alert("Error: " + data.error); return; }
      loadWorkspaces();
      const doSwitch = confirm('Workspace "' + from + '" copied to "' + to + '". Switch to "' + to + '" now?');
      if (doSwitch) { switchWorkspace(to); } else { settingsTab = "workspaces"; renderSettingsPage(); }
    })
    .catch(() => alert("Failed to copy workspace"));
};

window.wsSettingsRename = function(current) {
  const newName = prompt('Rename workspace "' + current + '" to:');
  if (!newName || !newName.trim()) return;
  const trimmed = newName.trim();
  fetch(API + "/api/workspaces/rename", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: current, to: trimmed })
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) { alert("Error: " + data.error); return; }
      window.location.reload();
    })
    .catch(() => alert("Failed to rename workspace"));
};

window.wsSettingsDelete = function(name) {
  if (!confirm('Delete workspace "' + name + '" and ALL its data? This cannot be undone.')) return;
  fetch(API + "/api/workspaces/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name })
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) { alert("Error: " + data.error); return; }
      loadWorkspaces();
      settingsTab = "workspaces";
      renderSettingsPage();
    })
    .catch(() => alert("Failed to delete workspace"));
};

window.wsCleanup = function(type) {
  const labels = {
    sessions: "Sessions & Runs", testcases: "Test Cases", issues: "Issues",
    analyses: "Analyses", runpacks: "Run Packs", "tech-issues": "Tech Issues",
    secrets: "Secrets", repos: "Repos & Index", all: "ALL data", nuke: "EVERYTHING (nuke)"
  };
  const label = labels[type] || type;
  if (!confirm('Delete ' + label + ' from the active workspace? This cannot be undone.')) return;
  const resultEl = document.getElementById("ws-cleanup-result");
  if (resultEl) resultEl.innerHTML = '<span style="color:var(--yellow);font-size:12px">Cleaning...</span>';
  fetch(API + "/api/workspaces/cleanup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type })
  })
    .then(r => r.json())
    .then(data => {
      if (data.error) {
        if (resultEl) resultEl.innerHTML = '<span style="color:var(--red);font-size:12px">Error: ' + data.error + '</span>';
        return;
      }
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--green);font-size:12px">\u2713 Cleaned ' + label + ' (' + (data.deleted || 0) + ' items removed)</span>';
      setTimeout(function() { if (resultEl) resultEl.innerHTML = ''; }, 4000);
    })
    .catch(function() {
      if (resultEl) resultEl.innerHTML = '<span style="color:var(--red);font-size:12px">Request failed</span>';
    });
};

// Load workspaces on startup
loadWorkspaces();

// Restore page state on startup
let pageStateRestored = false;

// SSE connection
const evtSource = new EventSource(API + "/api/stream");
evtSource.onmessage = (e) => {
  state = JSON.parse(e.data);
  // Restore page state on first data load
  if (!pageStateRestored) {
    restorePageState();
    pageStateRestored = true;
    render();
    return;
  }
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

// ── Helper functions ──
function parseTestSteps(tc_steps_json) {
  if (!tc_steps_json) return [];
  try {
    const steps = typeof tc_steps_json === 'string' ? JSON.parse(tc_steps_json) : tc_steps_json;
    return Array.isArray(steps) ? steps : [];
  } catch (e) {
    return [];
  }
}

function getStepByIndex(steps, stepIndex) {
  return steps[stepIndex] || null;
}

// ── Lightbox functions ──
let lbState = { images: [], currentIndex: 0 };

function openLightbox(images, startIndex = 0) {
  lbState.images = images || [];
  lbState.currentIndex = Math.max(0, Math.min(startIndex, images.length - 1));
  const overlay = document.getElementById('lightbox-overlay');
  if (overlay) {
    overlay.style.display = 'flex';
    updateLightboxContent();
  }
}

function closeLightbox() {
  const overlay = document.getElementById('lightbox-overlay');
  if (overlay) overlay.style.display = 'none';
}

function updateLightboxContent() {
  const imgEl = document.getElementById('lightbox-img');
  const counterEl = document.getElementById('lightbox-counter');
  const prevBtn = document.getElementById('lightbox-prev');
  const nextBtn = document.getElementById('lightbox-next');
  const captionEl = document.getElementById('lightbox-caption');

  if (!imgEl) return;

  const currentImg = lbState.images[lbState.currentIndex];
  if (currentImg) {
    imgEl.src = currentImg;
    imgEl.onerror = () => { imgEl.alt = 'Failed to load image'; };
  }

  if (counterEl) {
    counterEl.textContent = \`\${lbState.currentIndex + 1} / \${lbState.images.length}\`;
  }

  if (prevBtn) prevBtn.style.opacity = lbState.currentIndex === 0 ? '0.5' : '1';
  if (nextBtn) nextBtn.style.opacity = lbState.currentIndex === lbState.images.length - 1 ? '0.5' : '1';
  if (captionEl) captionEl.textContent = '';
}

function lbPrev() {
  if (lbState.currentIndex > 0) {
    lbState.currentIndex--;
    updateLightboxContent();
  }
}

function lbNext() {
  if (lbState.currentIndex < lbState.images.length - 1) {
    lbState.currentIndex++;
    updateLightboxContent();
  }
}

// Keyboard navigation for lightbox
document.addEventListener('keydown', (e) => {
  if (document.getElementById('lightbox-overlay')?.style.display !== 'flex') return;
  if (e.key === 'ArrowLeft') lbPrev();
  if (e.key === 'ArrowRight') lbNext();
  if (e.key === 'Escape') closeLightbox();
});

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

  if (currentPage === "swarm") {
    renderSwarmPage();
    return;
  }

  if (currentPage === "testcases") {
    renderTestCasesPage();
    return;
  }

  if (currentPage === "visualruns") {
    renderVisualRunsPage();
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

  if (currentPage === "qapool") {
    renderQaPoolPage();
    return;
  }

  if (currentPage === "scheduler") {
    renderSchedulerPage();
    return;
  }

  if (currentPage === "secrets") {
    renderSecretsPage();
    return;
  }

  if (currentPage === "files") {
    renderFilesPage();
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
      issues = await fetchJson("/api/issues/by-ticket?ticket=" + encodeURIComponent(dashSelectedTicket));
    } catch {}
  }

  const active = sessions.filter(s => s.status === "active").length;
  const critical = issues.filter(i => i.severity === "critical").length;
  const high = issues.filter(i => i.severity === "high").length;

  let html = '';

  // Stats + breadcrumb
  html += '<div class="panel" style="margin-bottom:8px">';
  html += \`<div class="breadcrumb">
    <span class="breadcrumb-item" onclick="dashSelectedTicket='';savePageState();renderDashboard()">Dashboard</span>
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
      savePageState();
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
  await postJson("/api/session/delete", { id: sessionId });
  // Force fresh state from server (SSE cache is stale)
  state = await fetchJson("/api/state");
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
  modal.innerHTML = '<div style="padding:48px;text-align:center"><div class="skeleton" style="width:200px;height:16px;margin:0 auto 12px"></div><div class="skeleton" style="width:300px;height:12px;margin:0 auto"></div></div>';

  const data = await fetchJson("/api/issues/detail?id=" + encodeURIComponent(issueId));
  const i = data.issue;
  const run = data.run;
  const rpe = data.runpackEntry;
  const techIssues = data.techIssues || [];
  const analyses = data.analyses || [];
  const uimapPage = data.uimapPage;
  const uimapElements = data.uimapElements || [];

  let h = '';

  // ── Sticky header with gradient ──
  h += '<div style="flex-shrink:0;padding:18px 24px 14px;border-bottom:1px solid var(--border);background:linear-gradient(135deg, rgba(96,165,250,0.06) 0%, transparent 60%)">';
  h += '<div style="display:flex;justify-content:space-between;align-items:start">';
  h += '<div style="flex:1">';
  h += \`<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px">
    <span class="tc-detail-badge" style="color:\${severityColor(i.severity)};background:\${severityColor(i.severity).replace('var(','rgba(').replace(')',',0.12)')}">\${esc(i.severity).toUpperCase()}</span>
    <span class="tc-detail-badge" style="color:var(--accent);background:var(--accent-dim)">\${esc(i.category)}</span>
  </div>\`;
  h += \`<div style="font-size:17px;font-weight:700;letter-spacing:-0.3px">\${esc(i.title)}</div>\`;
  h += '</div>';
  h += '<span class="modal-close" onclick="document.getElementById(\\'issue-modal-overlay\\').style.display=\\'none\\'">&times;</span>';
  h += '</div></div>';

  // ── Two columns, each scrolls independently ──
  h += '<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 20px;overflow:hidden;min-height:0">';

  // ── LEFT COLUMN ──
  h += '<div style="overflow-y:auto;min-height:0">';

  // Description
  if (i.description) {
    h += '<div style="margin-bottom:16px">';
    h += '<div class="section-header">Description</div>';
    h += \`<div style="font-size:13px;color:var(--text);line-height:1.7">\${formatDescription(i.description)}</div>\`;
    h += '</div>';
  }

  // Location
  if (i.location) {
    h += '<div style="margin-bottom:16px">';
    h += '<div class="section-header">Location</div>';
    h += \`<div style="font-size:12px;color:var(--accent);word-break:break-all">\${esc(i.location)}</div>\`;
    h += '</div>';
  }

  // Screenshot (single issue screenshot)
  if (i.screenshot_path) {
    h += '<div class="detail-section">';
    h += '<div class="section-header">Screenshot</div>';
    h += renderScreenshotGallery([{ path: i.screenshot_path, label: "Issue screenshot" }], "issue-ss-" + i.id);
    h += '</div>';
  }

  // Console log
  if (i.console_log) {
    h += '<div class="detail-section">';
    h += '<div class="section-header">Console Output</div>';
    h += '<pre class="pre-block" style="max-height:150px">' + esc(i.console_log) + '</pre>';
    h += '</div>';
  }

  // Network data
  if (i.network_data) {
    h += '<div class="detail-section">';
    h += '<div class="section-header">Network Data</div>';
    h += '<pre class="pre-block" style="max-height:150px">' + esc(i.network_data) + '</pre>';
    h += '</div>';
  }

  // Runpack artifacts (screenshots, videos, HAR, console, traces)
  const allArtifacts = data.artifacts || [];
  if (allArtifacts.length > 0) {
    h += '<div class="detail-section">';
    h += \`<div class="section-header">Artifacts (\${allArtifacts.length})</div>\`;
    h += renderArtifactGroup(allArtifacts, "issue-art-" + i.id);
    h += '</div>';
  }

  // Raw output
  if (i.raw_output) {
    h += '<div style="margin-bottom:16px">';
    h += '<div class="section-header">Raw Output</div>';
    h += \`<pre style="font-size:10px;color:var(--dim);background:var(--bg);padding:8px;border-radius:4px;overflow-x:auto;max-height:200px;white-space:pre-wrap">\${esc(i.raw_output.slice(0, 2000))}</pre>\`;
    h += '</div>';
  }

  h += '</div>'; // end left

  // ── RIGHT COLUMN ──
  h += '<div style="overflow-y:auto;min-height:0">';

  // Run info
  if (run) {
    h += '<div class="detail-card">';
    h += '<div class="section-header" style="margin-bottom:6px">Run</div>';
    h += \`<div style="font-size:12px"><span style="color:var(--accent)">\${run.input_ref}</span> <span style="color:var(--dim)">(\${run.input_type})</span></div>\`;
    if (run.target_url) h += \`<div style="font-size:11px;color:var(--dim);margin-top:2px">\${esc(run.target_url)}</div>\`;
    h += \`<div style="font-size:11px;color:var(--dim);margin-top:2px">Status: <span style="color:\${run.status === 'completed' ? 'var(--green)' : run.status === 'failed' ? 'var(--red)' : 'var(--yellow)'}">\${run.status}</span> · Phase \${run.phase} · ID: \${run.id.slice(0,8)}</div>\`;
    h += '</div>';
  }

  // Test case (from runpack entry)
  if (rpe) {
    h += '<div class="detail-card">';
    h += '<div class="section-header" style="margin-bottom:6px">Test Case</div>';
    h += \`<div style="font-size:12px;color:var(--text)">\${esc(rpe.tc_title || "Untitled")}</div>\`;
    h += \`<div style="font-size:11px;color:var(--dim);margin-top:2px">\${esc(rpe.tc_type || "")} · \${esc(rpe.tc_format || "")} · \${esc((rpe.tc_layer || "ui").toUpperCase())} · Status: <span style="color:\${rpe.status === 'passed' ? 'var(--green)' : rpe.status === 'failed' ? 'var(--red)' : 'var(--yellow)'}">\${rpe.status}</span></div>\`;
    h += '</div>';
  }

  // Analyses
  if (analyses.length > 0) {
    h += '<div class="detail-card">';
    h += '<div class="section-header" style="margin-bottom:6px">Analyses</div>';
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
    h += '<div class="detail-card">';
    h += '<div class="section-header" style="margin-bottom:6px">Technical Issues</div>';
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
    h += '<div class="detail-card">';
    h += \`<div class="section-header">UI Map — \${esc(uimapPage?.map_name || "")}</div>\`;
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
  h += '<div class="detail-card">';
  h += '<div class="section-header" style="margin-bottom:6px">Metadata</div>';
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
  const detail = await fetchJson("/api/session?id=" + sessionId);
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
        <span class="breadcrumb-item" onclick="viewingSession=null;dashSelectedTicket='\${esc(sessionTicket)}';savePageState();render()">\${esc(sessionTicket)}</span>\` : ""}
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
    t.addEventListener("click", () => { activeTab = t.dataset.tab; savePageState(); renderTab(); });
  });
  document.getElementById("back-btn").addEventListener("click", () => {
    viewingSession = null;
    dashSelectedTicket = "";
    activeTab = "issues";
    savePageState();
    render();
  });
  renderTab();
}

let settingsTab = "settings";

async function renderSettingsPage() {
  const app = document.getElementById("app");
  app.style.display = "";
  app.style.flexDirection = "";
  app.style.overflow = "";

  // Fixed header with title + tabs
  let header = '<div style="margin-bottom:16px">';
  header += '<div style="font-size:16px;font-weight:600;margin-bottom:12px;letter-spacing:-0.3px">Settings</div>';
  header += '<div class="tabs" style="border-bottom:1px solid var(--border)">';
  header += '<div class="tab ' + (settingsTab === "settings" ? "active" : "") + '" onclick="settingsTab=\\'settings\\';renderSettingsPage()">General</div>';
  header += '<div class="tab ' + (settingsTab === "setup" ? "active" : "") + '" onclick="settingsTab=\\'setup\\';renderSettingsPage()">Setup</div>';
  header += '<div class="tab ' + (settingsTab === "claude" ? "active" : "") + '" onclick="settingsTab=\\'claude\\';renderSettingsPage()">Claude</div>';
  header += '<div class="tab ' + (settingsTab === "workspaces" ? "active" : "") + '" onclick="settingsTab=\\'workspaces\\';renderSettingsPage()">Workspaces</div>';
  header += '</div></div>';

  let content = '';
  if (settingsTab === "settings") {
    content = await renderSettingsTab();
  } else if (settingsTab === "setup") {
    content = await renderSetupTab();
  } else if (settingsTab === "claude") {
    content = await renderClaudeTab();
  } else if (settingsTab === "workspaces") {
    content = await renderWorkspacesTab();
  }

  app.innerHTML = '<div class="page-fixed">' + header + '</div><div class="page-content">' + content + '</div>';
}

async function renderSettingsTab() {
  const settings = await fetchJson("/api/settings");
  const providers = ["github", "gitlab", "bitbucket"];
  const currentProvider = (settings.repo_provider || "").toLowerCase();

  let html = '';

  // Repository Provider
  html += '<div class="panel">';
  html += '<div style="margin-bottom:12px;font-weight:500;font-size:14px">Repository Provider</div>';
  html += '<div style="display:flex;gap:8px;margin-bottom:12px">';
  for (const p of providers) {
    const selected = currentProvider === p;
    const style = selected
      ? 'background:var(--text);color:var(--bg)'
      : 'background:var(--surface-raised);color:var(--dim);cursor:pointer';
    html += \`<div onclick="saveRepoProvider('\${p}')" style="padding:6px 16px;border-radius:var(--radius-xs);\${style};font-size:13px;font-weight:500;text-transform:capitalize">
      \${p === 'github' ? 'GitHub' : p === 'gitlab' ? 'GitLab' : 'Bitbucket'}
    </div>\`;
  }
  html += '</div>';
  if (currentProvider) {
    html += \`<div style="font-size:12px;color:var(--muted)">Current: <span style="color:var(--green)">\${currentProvider}</span></div>\`;
  } else {
    html += '<div style="font-size:12px;color:var(--yellow)">No provider selected.</div>';
  }
  html += '</div>';

  // All settings table
  const allKeys = Object.keys(settings);
  if (allKeys.length > 0) {
    html += '<div class="panel" style="margin-top:16px">';
    html += '<div style="margin-bottom:10px;font-weight:500;font-size:14px">All Settings</div>';
    html += '<table class="data-table"><thead><tr><th>Key</th><th>Value</th></tr></thead><tbody>';
    for (const key of allKeys) {
      html += \`<tr><td style="color:var(--accent);font-family:var(--font-mono);font-size:12px">\${esc(key)}</td><td>\${esc(settings[key])}</td></tr>\`;
    }
    html += '</tbody></table></div>';
  }

  return html;
}

async function renderSetupTab() {
  let html = '';

  // Loading state
  html += '<div id="setup-content"><div style="padding:32px;text-align:center;color:var(--muted)">Checking environment...</div></div>';

  // Kick off async check after render
  setTimeout(async () => {
    const container = document.getElementById("setup-content");
    if (!container) return;
    try {
      const data = await fetchJson("/api/setup/check");
      container.innerHTML = renderSetupContent(data);
    } catch (err) {
      container.innerHTML = '<div style="padding:24px;color:var(--red)">Failed to check setup: ' + esc(String(err)) + '</div>';
    }
  }, 0);

  return html;
}

async function renderClaudeTab() {
  let html = '';

  // Loading state
  html += '<div id="claude-content"><div style="padding:32px;text-align:center;color:var(--muted)">Checking Claude setup...</div></div>';

  // Kick off async check after render
  setTimeout(async () => {
    const container = document.getElementById("claude-content");
    if (!container) return;
    try {
      const data = await fetchJson("/api/setup/check");
      container.innerHTML = renderClaudeContent(data);
    } catch (err) {
      container.innerHTML = '<div style="padding:24px;color:var(--red)">Failed to check Claude setup: ' + esc(String(err)) + '</div>';
    }
  }, 0);

  return html;
}

function renderClaudeContent(data) {
  var html = '';

  // ── Noob-tester Skills ──
  html += '<div class="panel" style="margin-bottom:16px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">';
  html += '<div style="font-weight:500;font-size:14px">Noob-tester Skills</div>';
  var uninstalled = data.skills.filter(function(s) { return s.srcExists && (!s.installed || !s.upToDate); });
  if (uninstalled.length > 0) {
    html += '<div class="action-btn" style="color:var(--accent)" onclick="installAllSkills()">Install All (' + uninstalled.length + ')</div>';
  }
  html += '</div>';
  html += '<div style="margin-bottom:12px">' + copyBtn("claude plugin marketplace add ganeshgaxy/noob-tester-skills") + '</div>';
  for (var j = 0; j < data.skills.length; j++) {
    var skill = data.skills[j];
    var sIcon, sColor, sRight;
    if (skill.installed && skill.upToDate) {
      sIcon = '&#10003;'; sColor = 'var(--green)';
      sRight = '<span style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">' + esc(skill.symlinkCmd || "linked") + '</span>';
    } else if (skill.installed) {
      sIcon = '&#8635;'; sColor = 'var(--yellow)';
      sRight = copyBtn(skill.symlinkCmd || skill.installCmd);
    } else if (skill.pluginInstalled && skill.srcExists) {
      // Plugin installed but not symlinked
      sIcon = '&#9675;'; sColor = 'var(--yellow)';
      sRight = '<div style="display:flex;align-items:center;gap:8px">' + copyBtn(skill.symlinkCmd) + '<div class="action-btn" style="color:var(--accent)" onclick="installSkill(' + JSON.stringify(skill.src).replace(/"/g, '&quot;') + ',' + JSON.stringify(skill.dest).replace(/"/g, '&quot;') + ',' + JSON.stringify(skill.id).replace(/"/g, '&quot;') + ')">Link</div></div>';
    } else {
      // Plugin not installed
      sIcon = '&#10007;'; sColor = 'var(--red)';
      sRight = copyBtn(skill.installCmd);
    }
    html += setupRow(sIcon, sColor, skill.label, '', sRight);
  }
  html += '</div>';

  // ── External Skills ──
  html += '<div class="panel" style="margin-bottom:16px">';
  html += '<div style="margin-bottom:4px;font-weight:500;font-size:14px">External Skills</div>';
  html += '<div style="margin-bottom:12px">' + copyBtn("claude plugin marketplace add nikiforovall/claude-code-rules") + '</div>';
  for (var k = 0; k < data.externalSkills.length; k++) {
    var ext = data.externalSkills[k];
    var eIcon, eColor, eRight;
    if (ext.installed) {
      eIcon = '&#10003;'; eColor = 'var(--green)';
      eRight = '<span style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">' + esc(ext.symlinkCmd || ext.installCmd) + '</span>';
    } else if (ext.pluginInstalled && ext.src) {
      eIcon = '&#9675;'; eColor = 'var(--yellow)';
      eRight = '<div style="display:flex;align-items:center;gap:8px">' + copyBtn(ext.symlinkCmd) + '<div class="action-btn" style="color:var(--accent)" onclick="installSkill(' + JSON.stringify(ext.src).replace(/"/g, '&quot;') + ',' + JSON.stringify(ext.dest).replace(/"/g, '&quot;') + ',' + JSON.stringify(ext.id).replace(/"/g, '&quot;') + ')">Link</div></div>';
    } else {
      eIcon = '&#9675;'; eColor = 'var(--muted)';
      eRight = copyBtn(ext.installCmd);
    }
    html += setupRow(eIcon, eColor, ext.label, '', eRight);
  }
  html += '</div>';

  // ── Hooks ──
  html += '<div class="panel" style="margin-bottom:16px">';
  html += '<div style="margin-bottom:12px;font-weight:500;font-size:14px">Hooks</div>';
  for (var m = 0; m < data.hooks.length; m++) {
    var hook = data.hooks[m];
    var hIcon, hColor, hRight;
    if (hook.installed) {
      hIcon = '&#10003;'; hColor = 'var(--green)';
      hRight = '<span style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">' + esc(hook.symlinkCmd || hook.installCmd) + '</span>';
    } else if (hook.pluginInstalled && hook.src) {
      hIcon = '&#9675;'; hColor = 'var(--yellow)';
      hRight = '<div style="display:flex;align-items:center;gap:8px">' + copyBtn(hook.symlinkCmd) + '<div class="action-btn" style="color:var(--accent)" onclick="installSkill(' + JSON.stringify(hook.src).replace(/"/g, '&quot;') + ',' + JSON.stringify(hook.dest).replace(/"/g, '&quot;') + ',' + JSON.stringify(hook.id).replace(/"/g, '&quot;') + ')">Link</div></div>';
    } else {
      hIcon = '&#9675;'; hColor = 'var(--muted)';
      hRight = copyBtn(hook.installCmd);
    }
    html += setupRow(hIcon, hColor, hook.label, '', hRight);
  }
  html += '</div>';

  return html;
}

async function renderWorkspacesTab() {
  const wsList = await fetchJson("/api/workspaces");
  const active = (wsList && wsList.active) || "default";
  const rawWorkspaces = (wsList && wsList.workspaces) || [];
  // Normalise: API returns [{name, current}], extract name strings
  const workspaces = rawWorkspaces.map(function(w) { return typeof w === "string" ? w : w.name; });
  if (workspaces.length === 0) workspaces.push("default");

  let html = '';

  // ── Create workspace ──
  html += '<div class="panel" style="margin-bottom:16px">';
  html += '<div style="margin-bottom:10px;font-weight:500;font-size:14px">Create Workspace</div>';
  html += '<div style="display:flex;gap:8px;align-items:center">';
  html += '<input id="ws-new-name" type="text" placeholder="Workspace name (a-z, 0-9, -, _)" style="flex:1;font-size:13px;padding:6px 10px;border-radius:var(--radius-xs);border:1px solid var(--border);background:var(--surface-raised);color:var(--text);font-family:var(--font-mono);outline:none" />';
  html += '<button onclick="wsSettingsCreate()" style="padding:6px 16px;font-size:13px;border-radius:var(--radius-xs);border:none;background:var(--accent);color:var(--bg);cursor:pointer;font-weight:500;white-space:nowrap">Create</button>';
  html += '</div></div>';

  // ── Copy workspace ──
  html += '<div class="panel" style="margin-bottom:16px">';
  html += '<div style="margin-bottom:10px;font-weight:500;font-size:14px">Copy Workspace</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += '<select id="ws-copy-from" style="font-size:13px;padding:6px 10px;border-radius:var(--radius-xs);border:1px solid var(--border);background:var(--surface-raised);color:var(--text);font-family:var(--font-mono);outline:none">';
  for (const w of workspaces) {
    html += '<option value="' + esc(w) + '"' + (w === active ? ' selected' : '') + '>' + esc(w) + '</option>';
  }
  html += '</select>';
  html += '<span style="color:var(--muted);font-size:12px">\u2192</span>';
  html += '<input id="ws-copy-to" type="text" placeholder="New workspace name" style="flex:1;font-size:13px;padding:6px 10px;border-radius:var(--radius-xs);border:1px solid var(--border);background:var(--surface-raised);color:var(--text);font-family:var(--font-mono);outline:none" />';
  html += '<button onclick="wsSettingsCopy()" style="padding:6px 16px;font-size:13px;border-radius:var(--radius-xs);border:none;background:var(--accent);color:var(--bg);cursor:pointer;font-weight:500;white-space:nowrap">Copy</button>';
  html += '</div></div>';

  // ── Existing workspaces table ──
  html += '<div class="panel" style="margin-bottom:16px">';
  html += '<div style="margin-bottom:10px;font-weight:500;font-size:14px">All Workspaces</div>';
  html += '<table class="data-table"><thead><tr><th>Name</th><th>Status</th><th style="width:160px">Actions</th></tr></thead><tbody>';
  for (const w of workspaces) {
    const isActive = w === active;
    const isDefault = w === "default";
    const badge = isActive ? '<span style="color:var(--green);font-size:11px;font-weight:500">\u25cf active</span>' : '<span style="color:var(--muted);font-size:11px">\u25cb</span>';
    let actions = '';
    if (!isDefault) {
      actions += '<button onclick="wsSettingsRename(\\'' + esc(w) + '\\')" style="padding:3px 10px;font-size:11px;border-radius:var(--radius-xs);border:1px solid var(--border);background:var(--surface-raised);color:var(--text);cursor:pointer;margin-right:4px">Rename</button>';
      actions += '<button onclick="wsSettingsDelete(\\'' + esc(w) + '\\')" style="padding:3px 10px;font-size:11px;border-radius:var(--radius-xs);border:1px solid var(--border-light);background:transparent;color:var(--red);cursor:pointer">Delete</button>';
    } else {
      actions = '<span style="font-size:11px;color:var(--muted)">protected</span>';
    }
    html += '<tr><td style="font-family:var(--font-mono);font-size:12px">' + esc(w) + '</td><td>' + badge + '</td><td>' + actions + '</td></tr>';
  }
  html += '</tbody></table></div>';

  // ── Cleanup section for active workspace ──
  html += '<div class="panel">';
  html += '<div style="margin-bottom:10px;font-weight:500;font-size:14px">Cleanup — <span style="color:var(--accent);font-family:var(--font-mono)">' + esc(active) + '</span></div>';
  html += '<div style="font-size:12px;color:var(--muted);margin-bottom:12px">Delete data from the active workspace. This cannot be undone.</div>';
  html += '<div id="ws-cleanup-result" style="margin-bottom:8px"></div>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  var cleanupItems = [
    { type: "sessions", label: "Sessions & Runs", icon: "ph-compass", color: "var(--yellow)" },
    { type: "testcases", label: "Test Cases", icon: "ph-check-square", color: "var(--accent)" },
    { type: "issues", label: "Issues", icon: "ph-bug", color: "var(--red)" },
    { type: "analyses", label: "Analyses", icon: "ph-magnifying-glass-plus", color: "var(--purple)" },
    { type: "runpacks", label: "Run Packs", icon: "ph-play-circle", color: "var(--green)" },
    { type: "tech-issues", label: "Tech Issues", icon: "ph-wrench", color: "var(--dim)" },
    { type: "secrets", label: "Secrets", icon: "ph-key", color: "var(--yellow)" },
    { type: "repos", label: "Repos & Index", icon: "ph-git-branch", color: "var(--accent)" },
  ];
  for (var ci = 0; ci < cleanupItems.length; ci++) {
    var item = cleanupItems[ci];
    html += '<button onclick="wsCleanup(\\'' + item.type + '\\')" style="padding:6px 14px;font-size:12px;border-radius:var(--radius-xs);border:1px solid var(--border);background:var(--surface-raised);color:var(--text);cursor:pointer;display:flex;align-items:center;gap:6px">';
    html += '<i class="ph ' + item.icon + '" style="color:' + item.color + ';font-size:14px"></i> ' + item.label;
    html += '</button>';
  }
  html += '</div>';
  html += '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">';
  html += '<button onclick="wsCleanup(\\'all\\')" style="padding:6px 16px;font-size:12px;border-radius:var(--radius-xs);border:1px solid var(--red);background:transparent;color:var(--red);cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:6px"><i class="ph ph-trash" style="font-size:14px"></i> Clean All Data</button>';
  html += '<button onclick="wsCleanup(\\'nuke\\')" style="margin-left:8px;padding:6px 16px;font-size:12px;border-radius:var(--radius-xs);border:1px solid var(--red);background:rgba(248,81,73,0.1);color:var(--red);cursor:pointer;font-weight:600;display:inline-flex;align-items:center;gap:6px"><i class="ph ph-fire" style="font-size:14px"></i> Nuke Everything</button>';
  html += '</div>';
  html += '<div style="margin-top:10px;font-size:11px;color:var(--muted);line-height:1.6">';
  html += '<i class="ph ph-info" style="font-size:12px;margin-right:4px;vertical-align:middle"></i> ';
  html += '<strong style="color:var(--dim)">Clean All Data</strong> removes sessions, runs, test cases, issues, analyses, and other content. ';
  html += '<strong style="color:var(--dim)">Nuke Everything</strong> removes repos, files, and secrets. ';
  html += 'To fully clean a workspace, run both.';
  html += '</div></div>';

  return html;
}

function setupRow(icon, iconColor, name, tag, rightHtml) {
  return '<div style="display:grid;grid-template-columns:250px 1fr;align-items:center;padding:10px 4px;gap:16px">'
    + '<div style="display:flex;align-items:center;gap:10px">'
    + '<span style="color:' + iconColor + ';font-size:14px;width:18px;text-align:center;flex-shrink:0">' + icon + '</span>'
    + '<span style="font-size:13px">' + esc(name) + '</span>'
    + (tag ? '<span style="font-size:10px;color:var(--muted)">' + esc(tag) + '</span>' : '')
    + '</div>'
    + '<div>' + rightHtml + '</div>'
    + '</div>';
}

function copyBtn(cmd) {
  return '<code style="font-size:11px;color:var(--dim);background:var(--surface-raised);padding:4px 10px;border-radius:var(--radius-xs);cursor:pointer;font-family:var(--font-mono);white-space:nowrap" onclick="navigator.clipboard.writeText(\\'' + esc(cmd) + '\\');this.textContent=\\'Copied!\\';setTimeout(()=>this.textContent=\\'' + esc(cmd) + '\\',1500)">' + esc(cmd) + '</code>';
}

function renderSetupContent(data) {
  var html = '';

  // ── Dependencies ──
  html += '<div class="panel" style="margin-bottom:16px">';
  html += '<div style="margin-bottom:12px;font-weight:500;font-size:14px">Dependencies</div>';
  for (var i = 0; i < data.deps.length; i++) {
    var dep = data.deps[i];
    var icon = dep.installed ? '&#10003;' : '&#10007;';
    var color = dep.installed ? 'var(--green)' : (dep.required ? 'var(--red)' : 'var(--yellow)');
    var tag = dep.required ? '' : 'optional';
    var right = dep.installed
      ? '<span style="font-size:11px;color:var(--muted);font-family:var(--font-mono)">' + esc(dep.install) + '</span>'
      : copyBtn(dep.install);
    html += setupRow(icon, color, dep.label, tag, right);
  }
  html += '</div>';

  // ── Database ──
  html += '<div class="panel">';
  html += '<div style="margin-bottom:12px;font-weight:500;font-size:14px">Database</div>';
  html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 4px">';
  html += data.db.ok
    ? '<span style="color:var(--green);font-size:14px">&#10003;</span><span style="font-size:13px">Initialized</span><span style="font-size:11px;color:var(--muted)">' + data.db.tables + ' tables</span>'
    : '<span style="color:var(--red);font-size:14px">&#10007;</span><span style="font-size:13px;color:var(--red)">Not initialized</span>';
  html += '</div></div>';

  return html;
}

// Skill install actions
window.installSkill = async function(src, dest, id) {
  const btn = event.target;
  btn.textContent = "...";
  btn.style.pointerEvents = "none";
  try {
    await postJson("/api/setup/install-skill", { src: src, dest: dest });
    btn.textContent = "Done";
    btn.style.color = "var(--green)";
    // Refresh after a beat
    setTimeout(function() { settingsTab = "setup"; renderSettingsPage(); }, 800);
  } catch (err) {
    btn.textContent = "Failed";
    btn.style.color = "var(--red)";
  }
};

window.installAllSkills = async function() {
  try {
    const data = await fetchJson("/api/setup/check");
    var pending = data.skills.filter(function(s) { return s.srcExists && (!s.installed || !s.upToDate); });
    for (var i = 0; i < pending.length; i++) {
      await postJson("/api/setup/install-skill", { src: pending[i].src, dest: pending[i].dest });
    }
    settingsTab = "setup";
    renderSettingsPage();
  } catch (err) {
    alert("Failed: " + String(err));
  }
};

window.saveRepoProvider = async function(provider) {
  await postJson("/api/settings", { key: "repo_provider", value: provider });
  renderSettingsPage();
};



async function renderDocsPage() {
  const res = await fetchApi("/api/docs");
  const html = await res.text();
  const app = document.getElementById("app");
  app.style.display = "flex";
  app.style.flexDirection = "column";
  app.style.overflow = "hidden";
  app.innerHTML = html;
}

// ── esc, timeAgo, repairJson, calcCost, fmtCost, renderMd, setPage, formatBytes ──
// These functions are now provided by the shared helpers script (dashboard-helpers.ts).

// ── Issues Page ──

let issuesSelectedTicket = "";
let issuesSortCol = "severity";
let issuesSortDir = 1; // 1 = asc, -1 = desc
let issuesData = [];

async function renderIssuesPage() {
  const app = document.getElementById("app");

  const tickets = await fetchJson("/api/issues/tickets");

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
  issuesData = await fetchJson("/api/issues/by-ticket?ticket=" + encodeURIComponent(issuesSelectedTicket));

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

  const sevColor = severityColor;
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
  fetchApi("/api/issues/delete?id=" + encodeURIComponent(issueId), { method: "DELETE" })
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
  const allAnalyses = await fetchJson("/api/analyses");
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
      const impactAreas = await fetchJson("/api/impact-areas?analysis=" + selected.id);
      const container = document.getElementById("impact-areas-container");
      if (container && impactAreas.length > 0) {
        let iaHtml = '<div class="tc-detail-section" style="margin-top:16px;border-top:1px solid var(--border);padding-top:12px">';
        iaHtml += '<div class="tc-detail-section-title" style="color:var(--accent)">Normalized Impact Areas (' + impactAreas.length + ')</div>';
        iaHtml += '<table class="data-table" style="font-size:12px"><thead><tr><th>Type</th><th>Severity</th><th>Description</th></tr></thead><tbody>';
        for (const ia of impactAreas) {
          const sc = severityColor(ia.severity);
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
  const all = await fetchJson("/api/analyses");
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
  const all = await fetchJson("/api/analyses");
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
  await fetchApi("/api/analyses/delete?run=" + encodeURIComponent(runId), { method: "DELETE" });
  analysisSelectedRun = "";
  analysisSelectedId = "";
  renderAnalysesPage();
}

async function exportAllAnalysesMd(runId) {
  const all = await fetchJson("/api/analyses");
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
  const all = await fetchJson("/api/analyses");
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
          html += \`<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
            \${title ? \`<span style="color:var(--accent);font-weight:600">\${esc(title)}</span>\` : ""}
            \${sev ? \`<span style="font-size:10px;padding:1px 5px;border-radius:3px;margin-left:6px;background:rgba(125,133,144,0.1);color:\${severityColor(sev)}">\${esc(sev)}</span>\` : ""}
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
          const files = item.files || item.affected || item.dependencies || null;
          const extra = item.change_type || item.mitigation || null;

          html += \`<div style="font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
            \${sev ? \`<span style="color:\${severityColor(sev)};font-size:10px;font-weight:600;margin-right:6px">[\${sev.toUpperCase()}]</span>\` : ""}
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

  const tickets = await fetchJson("/api/plans/tickets");

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
    const plans = await fetchJson("/api/plans?ticket=" + encodeURIComponent(plansSelectedTicket));

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
  const detail = await fetchJson("/api/plans?id=" + encodeURIComponent(plansSelectedPlan));
  const plan = detail.plan;
  const steps = detail.steps || [];

  // Use normalized data from the API (detail.blockers, detail.coverageGaps)
  // These come from the blockers and coverage_gaps tables
  const linkedAnalyses = detail.linkedAnalyses || [];
  const blockers = detail.blockers || [];
  const gaps = detail.coverageGaps || [];

  // Fallback to parsing legacy plan fields if normalized data is empty
  const mrRefs = (() => {
    if (!plan.mr_refs) return [];
    try {
      const parsed = JSON.parse(plan.mr_refs);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  })();

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
  if (blockers.length > 0 || blockers.length > 0) html += '<div class="tab" data-plantab="blockers" onclick="switchPlanTab(this,\\'blockers\\')">Blockers (' + (blockers.length || blockers.length) + ')</div>';
  if (gaps.length > 0 || gaps.length > 0) html += '<div class="tab" data-plantab="gaps" onclick="switchPlanTab(this,\\'gaps\\')">Gaps (' + (gaps.length || gaps.length) + ')</div>';
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
        <td style="font-size:12px;color:var(--text);white-space:pre-wrap">\${esc(formatPreText(plan.strategy))}</td>
      </tr>\`;
    }

    for (const sd of sectionDefs) {
      const val = sections[sd.key];
      if (!val) continue;
      const content = typeof val === "string" ? val : Array.isArray(val) ? val.join("; ") : JSON.stringify(val);
      html += \`<tr>
        <td style="font-weight:600;color:\${sd.color};font-size:11px;vertical-align:top">\${esc(sd.label)}</td>
        <td style="font-size:12px;color:var(--text);white-space:pre-wrap">\${esc(formatPreText(content))}</td>
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
    const stColor = statusColor(s.status);
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
      <td><span style="color:\${stColor};font-size:10px;font-weight:600">\${esc(s.status).toUpperCase()}</span></td>
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
  if (blockers.length > 0) {
    html += '<div class="panel" style="padding:0">';
    html += '<table class="data-table"><thead><tr><th>Blocker</th><th>Severity</th><th>Status</th><th>Resolution</th><th></th></tr></thead><tbody>';
    for (const b of blockers) {
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
  if (gaps.length > 0) {
    html += '<div class="panel" style="padding:0">';
    html += '<table class="data-table"><thead><tr><th>Gap</th><th>Severity</th><th>Category</th></tr></thead><tbody>';
    for (const g of gaps) {
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
    html += '<pre style="font-size:12px;color:var(--text);white-space:pre-wrap;margin:0;font-family:inherit;line-height:1.6">' + esc(formatPreText(testNotes)) + '</pre>';
    html += '</div>';
  } else {
    html += '<div class="panel" style="padding:12px;text-align:center;color:var(--dim)">No test notes available for this plan.</div>';
  }
  html += '</div>'; // end test notes tab

  setPage(html);
}

// ── Plan Export ──

async function exportPlanMd(planId) {
  const planData = await fetchJson("/api/plans?id=" + encodeURIComponent(planId));
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
  const planData = await fetchJson("/api/plans?id=" + encodeURIComponent(planId));
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
  const planData = await fetchJson("/api/plans?id=" + encodeURIComponent(planId));
  if (!planData || !planData.plan) { alert("Plan not found"); return; }
  const result = getPlanTabMd(planData, _activePlanTab);
  downloadFile(result.filename + ".md", result.md, "text/markdown");
}

async function exportPlanTabPdf(planId) {
  const planData = await fetchJson("/api/plans?id=" + encodeURIComponent(planId));
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
  fetchApi("/api/plans/delete?id=" + encodeURIComponent(planId), { method: "DELETE" })
    .then(r => r.json())
    .then(data => {
      if (data.deleted) { plansSelectedPlan = ""; renderPlansPage(); }
    });
}

function resolveBlocker(blockerId) {
  const resolution = prompt("Resolution (what unblocked this?):");
  if (resolution === null) return;
  postJson("/api/blockers/resolve", { id: blockerId, resolution })
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
  const allBlockers = await fetchJson(url);

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
    const tickets = await fetchJson("/api/ticket-context/tickets");

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
  const entries = await fetchJson("/api/ticket-context?ticket=" + encodeURIComponent(contextSelectedTicket));

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

// formatBytes is now in shared helpers

function invalidateTicketContext(ticketId, type) {
  const msg = type ? "Invalidate " + type + " for " + ticketId + "?" : "Invalidate ALL cached context for " + ticketId + "?";
  if (!confirm(msg)) return;
  const params = "ticket=" + encodeURIComponent(ticketId) + (type ? "&type=" + encodeURIComponent(type) : "");
  fetchApi("/api/ticket-context/invalidate?" + params, { method: "DELETE" })
    .then(r => r.json())
    .then(() => renderContextCachePage());
}

function purgeContextCache() {
  if (!confirm("Remove all stale entries?")) return;
  fetchApi("/api/ticket-context/purge", { method: "POST" })
    .then(r => r.json())
    .then(data => { alert("Purged " + data.purged + " stale entries"); renderContextCachePage(); });
}

// ── API Maps Page ──

let apimapSelectedId = "";
let apimapSelectedEndpoint = "";

async function renderApiMapsPage() {
  if (!apimapSelectedId) {
    // Level 1: List all API maps
    const maps = await fetchJson("/api/apimaps");

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
  const data = await fetchJson("/api/apimaps?id=" + encodeURIComponent(apimapSelectedId));
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
        html += '<div class="section-header">Parameters (' + epParams.length + ')</div>';
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
        html += '<div class="section-header">Responses (' + epResponses.length + ')</div>';
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
  const data = await fetchJson("/api/repos");
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
  await postJson("/api/runpacks/delete", { ticket });
  rpSelectedTicket = "";
  rpSelectedPack = "";
  rpSelectedEntry = "";
  renderRunsPage();
}

function deleteTestCasesByTicket(ticket) {
  if (!confirm("Delete ALL test cases for " + ticket + "? This cannot be undone.")) return;
  fetchApi("/api/testcases/delete?ticket=" + encodeURIComponent(ticket), { method: "DELETE" })
    .then(r => r.json())
    .then(data => {
      if (data.deleted > 0) { tcSelectedSuite = ""; tcSelectedId = ""; renderTestCasesPage(); }
    });
}

function deleteVisualTestCase(id) {
  if (!confirm("Delete this visual test case? This cannot be undone.")) return;
  fetchApi("/api/visual-testcases/delete?id=" + encodeURIComponent(id), { method: "DELETE" })
    .then(r => r.json())
    .then(data => {
      if (data.deleted > 0) { tcSelectedVisualId = ""; renderTestCasesPage(); }
    });
}

function deleteVisualTestCasesByTicket(ticket) {
  if (!confirm("Delete ALL visual test cases for " + ticket + "? This cannot be undone.")) return;
  fetchApi("/api/visual-testcases/delete?ticket=" + encodeURIComponent(ticket), { method: "DELETE" })
    .then(r => r.json())
    .then(data => {
      if (data.deleted > 0) { tcSelectedVisualId = ""; renderTestCasesPage(); }
    });
}

function deleteRepoEntry(name) {
  fetchApi("/api/repos/delete?name=" + encodeURIComponent(name), { method: "DELETE" })
    .then(r => r.json())
    .then(data => { if (data.deleted) renderReposPage(); });
}

// ── UI Maps Page ──

let uimapSelectedId = "";
let uimapSelectedPageId = "";

async function deleteUiMap(mapId, mapName) {
  if (!confirm('Delete UI map "' + mapName + '" and ALL its pages, elements, navigations, and forms? This cannot be undone.')) return;
  await fetchApi("/api/uimaps/delete?id=" + encodeURIComponent(mapId), { method: "DELETE" });
  uimapSelectedId = "";
  uimapSelectedPageId = "";
  renderUiMapsPage();
}

async function renderUiMapsPage() {
  const app = document.getElementById("app");

  const maps = await fetchJson("/api/uimaps");

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
  const detail = await fetchJson("/api/uimaps/detail?id=" + encodeURIComponent(uimapSelectedId));
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
  html += '<div id="uimap-detail-overlay" class="modal-overlay" onclick="if(event.target===this){this.style.display=\\'none\\'}">';
  html += '<div id="uimap-detail" class="modal-box" style="max-width:1100px"></div>';
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
  const data = await fetchJson("/api/metrics");
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
        const stColor = statusColor(s.status);
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
          <td style="padding:6px;text-align:center;color:\${stColor}">\${s.status}</td>
        </tr>\`;
      }
      html += '</table>';
    }
    html += '</div>';
  }

  // ── TAB: Resources ──
  if (metricsTab === "resources") {
    const r = await fetchJson("/api/metrics/resources");

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
  const tickets = await fetchJson("/api/runpacks/tickets");

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
    const packs = await fetchJson("/api/runpacks?ticket=" + encodeURIComponent(rpSelectedTicket));

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
  const packData = await fetchJson("/api/runpacks?pack=" + encodeURIComponent(rpSelectedPack));
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
    const rca = await fetchJson("/api/rca/summary?pack=" + encodeURIComponent(rpSelectedPack));
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
    const fp = await fetchJson("/api/false-positives/stats?pack=" + encodeURIComponent(rpSelectedPack));
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
      entryRca = await fetchJson("/api/rca/entry?entry=" + encodeURIComponent(selEntry.id));
    } catch {}
    html += renderRunPackEntryDetail(selEntry, entryRca);
  }
  html += '</div>';

  html += '</div>';
  setPage(html);

  // Fetch and render run_artifacts for selected entry — grouped by step as cards in column layout
  if (rpSelectedEntry) {
    fetchApi("/api/run-artifacts?entry=" + encodeURIComponent(rpSelectedEntry))
      .then(r => r.json())
      .then(artifacts => {
        if (!artifacts || artifacts.length === 0) return;
        const container = document.getElementById("entry-run-artifacts");
        if (!container) return;
        let h = '<div class="tc-detail-section"><div class="tc-detail-section-title">Captured Artifacts (' + artifacts.length + ')</div>';
        h += renderArtifactTimeline(artifacts);
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
  const stColor = statusColor(entry.status);
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${stColor}">\${entry.status.toUpperCase()}</span>\`;
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
          html += \`<div style="padding:4px 0;border-bottom:1px solid var(--border)">
            <span style="font-size:10px;font-weight:700;color:\${severityColor(sev)};text-transform:uppercase">\${esc(sev)}</span>
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
        html += renderArtifactGroup(artifacts, "rpe-art-" + entry.id);
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
let tcSelectedVisualId = "";
let tcActiveTab = "normal"; // "normal" | "visual"
let tcAllCases = [];
let tcAllVisualCases = [];

async function renderTestCasesPage() {
  const app = document.getElementById("app");

  // Fetch both normal and visual test cases in parallel
  [tcAllCases, tcAllVisualCases] = await Promise.all([
    fetchJson("/api/testcases"),
    fetchJson("/api/visual-testcases"),
  ]);

  // Group normal TCs by ticket
  const suites = {};
  for (const tc of tcAllCases) {
    if (!suites[tc.ticket_ref]) suites[tc.ticket_ref] = [];
    suites[tc.ticket_ref].push(tc);
  }

  // Group visual TCs by ticket
  const visualSuites = {};
  for (const vtc of tcAllVisualCases) {
    if (!visualSuites[vtc.ticket_id]) visualSuites[vtc.ticket_id] = [];
    visualSuites[vtc.ticket_id].push(vtc);
  }

  // All ticket IDs (union of both)
  const allTickets = [...new Set([...Object.keys(suites), ...Object.keys(visualSuites)])].sort();

  const hasAny = tcAllCases.length > 0 || tcAllVisualCases.length > 0;

  let html = '<div class="panel" style="margin-bottom:16px">';
  if (tcSelectedSuite) {
    html += \`<div class="breadcrumb">
      <span class="breadcrumb-item" onclick="tcSelectedSuite='';tcSelectedId='';tcSelectedVisualId='';tcActiveTab='normal';renderTestCasesPage()">Test Cases</span>
      <span class="breadcrumb-sep">|</span>
      <span class="breadcrumb-item current">\${esc(tcSelectedSuite)}</span>
    </div>\`;

    // Stats for this suite (normal TCs only in stats bar)
    const suiteCases = suites[tcSelectedSuite] || [];
    const suiteVisual = visualSuites[tcSelectedSuite] || [];
    if (suiteCases.length > 0 || suiteVisual.length > 0) {
      html += '<div style="display:flex;gap:24px;margin-bottom:8px;align-items:center;flex-wrap:wrap">';
      if (suiteCases.length > 0) {
        html += \`<button onclick="exportTestCasesCsv('\${esc(tcSelectedSuite)}')" style="font-size:10px;color:var(--accent);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;margin-right:4px" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">Export CSV</button>\`;
        html += \`<button onclick="deleteTestCasesByTicket('\${esc(tcSelectedSuite)}')" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;margin-right:8px" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete All Normal</button>\`;
      }
      if (suiteVisual.length > 0) {
        html += \`<button onclick="deleteVisualTestCasesByTicket('\${esc(tcSelectedSuite)}')" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;margin-right:8px" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete All Visual</button>\`;
      }
      html += \`<div class="stat"><div class="stat-value">\${suiteCases.length}</div><div class="stat-label">Normal</div></div>\`;
      html += \`<div class="stat"><div class="stat-value" style="color:var(--purple)">\${suiteVisual.length}</div><div class="stat-label">Visual</div></div>\`;
      html += '</div>';
    }
  } else {
    html += '<div class="panel-title">All Test Cases</div>';
    if (hasAny) {
      html += \`<div style="display:flex;gap:24px;margin-bottom:8px;align-items:center">
        <div class="stat"><div class="stat-value">\${tcAllCases.length}</div><div class="stat-label">Normal</div></div>
        <div class="stat"><div class="stat-value" style="color:var(--purple)">\${tcAllVisualCases.length}</div><div class="stat-label">Visual</div></div>
        <div class="stat"><div class="stat-value">\${allTickets.length}</div><div class="stat-label">Tickets</div></div>
      </div>\`;
    }
  }
  html += '</div>';

  if (!hasAny) {
    html += '<div class="panel"><div class="empty">No test cases yet. Use /noob-testcase for functional tests or /noob-visual-testcase for visual tests.</div></div>';
    setPage(html);
    return;
  }

  // No suite selected — show unified ticket list
  if (!tcSelectedSuite) {
    html += '<div class="panel">';
    for (const ticket of allTickets) {
      const cases = suites[ticket] || [];
      const visualCases = visualSuites[ticket] || [];
      const passed = cases.filter(c => c.status === "passed").length;
      const failed = cases.filter(c => c.status === "failed").length;
      const claimed = cases.filter(c => c.status === "claimed" || c.status === "running").length;
      const pending = cases.filter(c => c.status === "pending").length;

      html += \`<div class="session-card" data-id="\${esc(ticket)}" onclick="tcSelectedSuite='\${esc(ticket)}';tcSelectedId='';tcSelectedVisualId='';tcActiveTab='normal';renderTestCasesPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(ticket)}</span>
          <div style="display:flex;gap:8px;align-items:center">
            \${cases.length ? \`<span style="font-size:12px;color:var(--dim)">\${cases.length} normal</span>\` : ""}
            \${visualCases.length ? \`<span style="font-size:12px;color:var(--purple)">\${visualCases.length} visual</span>\` : ""}
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          \${passed ? \`<span class="suite-badge passed">\${passed} passed</span>\` : ""}
          \${failed ? \`<span class="suite-badge failed">\${failed} failed</span>\` : ""}
          \${claimed ? \`<span class="suite-badge claimed">\${claimed} running</span>\` : ""}
          \${pending ? \`<span class="suite-badge pending">\${pending} pending</span>\` : ""}
        </div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // Suite selected — tabs: Normal | Visual
  const suiteCases = suites[tcSelectedSuite] || [];
  const suiteVisual = visualSuites[tcSelectedSuite] || [];

  // Tab bar
  const tabStyle = (tab) => tab === tcActiveTab
    ? "font-size:13px;font-weight:600;padding:6px 16px;border-bottom:2px solid var(--accent);color:var(--fg);cursor:pointer;background:none;border-top:none;border-left:none;border-right:none"
    : "font-size:13px;padding:6px 16px;border-bottom:2px solid transparent;color:var(--dim);cursor:pointer;background:none;border-top:none;border-left:none;border-right:none";
  html += \`<div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:12px">
    <button style="\${tabStyle('normal')}" onclick="tcActiveTab='normal';tcSelectedId='';renderTestCasesPage()">Normal Tests (\${suiteCases.length})</button>
    <button style="\${tabStyle('visual')}" onclick="tcActiveTab='visual';tcSelectedVisualId='';renderTestCasesPage()">Visual Tests (\${suiteVisual.length})</button>
  </div>\`;

  html += '<div class="split-view">';

  if (tcActiveTab === "normal") {
    // LEFT — normal test cases grouped by type
    html += '<div class="split-left">';
    const types = { direct_functional: [], impact_regression: [], general_regression: [] };
    for (const c of suiteCases) (types[c.type] || types.general_regression).push(c);

    if (suiteCases.length === 0) {
      html += '<div class="empty" style="padding:16px">No normal test cases for this ticket.</div>';
    }
    for (const [type, group] of Object.entries(types)) {
      if (group.length === 0) continue;
      const typeLabel = type === "direct_functional" ? "Direct Functional" : type === "impact_regression" ? "Impact Regression" : "General Regression";
      html += \`<div class="type-group"><div class="type-group-header \${type}">\${typeLabel} (\${group.length})</div>\`;
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

    // RIGHT — normal TC detail
    html += '<div class="split-right panel">';
    const selectedTc = tcSelectedId ? tcAllCases.find(c => c.id === tcSelectedId) : null;
    if (!selectedTc) {
      html += '<div class="empty">Select a test case to view details</div>';
    } else {
      html += renderTcDetail(selectedTc);
    }
    html += '</div>';

  } else {
    // Visual tab — LEFT: flat list of visual TCs
    html += '<div class="split-left">';
    if (suiteVisual.length === 0) {
      html += '<div class="empty" style="padding:16px">No visual test cases for this ticket.</div>';
    }
    for (const vtc of suiteVisual) {
      const isSel = tcSelectedVisualId === vtc.id;
      let steps = [];
      try { steps = JSON.parse(vtc.steps_json || "[]"); } catch {}
      html += \`<div class="tc-item \${isSel ? 'selected' : ''}" onclick="tcSelectedVisualId='\${vtc.id}';renderTestCasesPage()">
        <span style="font-size:9px;padding:1px 4px;border-radius:3px;background:rgba(188,140,255,0.18);color:var(--purple);font-weight:600;margin-right:4px">VISUAL</span>
        <span style="font-size:9px;color:var(--dim);margin-right:4px">[\${esc(vtc.viewport || '1280x720')}]</span>
        \${esc(vtc.title)}
        <span style="float:right;font-size:9px;color:var(--dim)">\${steps.length} steps</span>
      </div>\`;
    }
    html += '</div>';

    // RIGHT — visual TC detail
    html += '<div class="split-right panel">';
    const selectedVtc = tcSelectedVisualId ? tcAllVisualCases.find(c => c.id === tcSelectedVisualId) : null;
    if (!selectedVtc) {
      html += '<div class="empty">Select a visual test case to view details</div>';
    } else {
      html += renderVisualTcDetail(selectedVtc);
    }
    html += '</div>';
  }

  html += '</div>';
  setPage(html);
}

function renderTcDetail(tc) {
  let html = '<div class="tc-detail-panel">';

  // Title + status
  html += \`<div class="tc-detail-title">\${esc(tc.title)}</div>\`;

  // Badges
  html += '<div class="tc-detail-meta">';
  const stColor = statusColor(tc.status);
  const readyColor = tc.ready ? "var(--green)" : "var(--dim)";
  const readyLabel = tc.ready ? "READY" : "DRAFT";
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${readyColor}">\${readyLabel}</span>\`;
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:var(--accent)">\${tc.format.toUpperCase()}</span>\`;
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${stColor}">\${tc.status.toUpperCase()}</span>\`;
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

function renderVisualTcDetail(vtc) {
  let html = '<div class="tc-detail-panel">';

  html += \`<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:4px">
    <div class="tc-detail-title" style="margin-bottom:0">\${esc(vtc.title)}</div>
    <button onclick="deleteVisualTestCase('\${esc(vtc.id)}')"
      style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;white-space:nowrap"
      onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete</button>
  </div>\`;

  // Badges
  html += '<div class="tc-detail-meta">';
  html += '<span class="tc-detail-badge" style="background:rgba(188,140,255,0.18);color:var(--purple)">VISUAL</span>';
  html += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:var(--accent)">\${esc(vtc.viewport || '1280x720')}</span>\`;
  html += \`<span class="tc-detail-badge" style="background:rgba(125,133,144,0.1);color:var(--dim)">threshold: \${vtc.default_threshold ?? 0.1}</span>\`;
  if (vtc.status) html += \`<span class="tc-detail-badge" style="background:rgba(125,133,144,0.1);color:var(--dim)">\${esc(vtc.status)}</span>\`;
  html += '</div>';

  // Description
  if (vtc.description) {
    html += '<div class="tc-detail-section">';
    html += '<div class="tc-detail-section-title">Description</div>';
    html += \`<div style="font-size:13px">\${esc(vtc.description)}</div>\`;
    html += '</div>';
  }

  // Steps
  let steps = [];
  try { steps = JSON.parse(vtc.steps_json || '[]'); } catch (e) {}
  if (steps.length > 0) {
    html += '<div class="tc-detail-section">';
    html += \`<div class="tc-detail-section-title">Steps (\${steps.length})</div>\`;
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const actionColor = s.action === 'navigate' ? 'var(--accent)'
        : s.action === 'click' ? 'var(--green)'
        : s.action === 'fill' ? 'var(--yellow)'
        : s.action === 'login' ? 'var(--red)'
        : 'var(--dim)';
      html += \`<div class="trad-step" style="margin-bottom:12px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span class="trad-step-num">\${i + 1}.</span>
          <span style="font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(88,166,255,0.1);color:\${actionColor};font-weight:600;text-transform:uppercase">\${esc(s.action)}</span>
          <span style="font-size:12px;font-weight:600">\${esc(s.label)}</span>
          \${s.diffType ? \`<span style="margin-left:auto;font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(63,185,80,0.12);color:var(--green)">📸 \${esc(s.diffType)}</span>\` : ''}
        </div>\`;
      if (s.description) html += \`<div style="font-size:12px;color:var(--fg);margin-top:4px;margin-left:20px">\${esc(s.description)}</div>\`;
      if (s.url) html += \`<div style="font-size:11px;color:var(--dim);margin-top:4px;margin-left:20px;font-family:monospace">\${esc(s.url)}</div>\`;
      if (s.selector) html += \`<div style="font-size:11px;color:var(--dim);margin-top:4px;margin-left:20px;font-family:monospace">selector: \${esc(s.selector)}</div>\`;
      if (s.value) html += \`<div style="font-size:11px;color:var(--dim);margin-top:4px;margin-left:20px">value: \${esc(s.value)}</div>\`;
      if (s.screenshot_selector) html += \`<div style="font-size:11px;color:var(--purple);margin-top:4px;margin-left:20px;font-family:monospace">scoped to: \${esc(s.screenshot_selector)}</div>\`;
      const waitMs = s.waitMs || s.wait_ms;
      if (waitMs) html += \`<div style="font-size:11px;color:var(--dim);margin-top:4px;margin-left:20px">⏱️ wait: \${waitMs}ms</div>\`;
      if (s.fullPage !== undefined) html += \`<div style="font-size:11px;color:var(--purple);margin-top:4px;margin-left:20px">\${s.fullPage ? '📄 Full page' : '🔲 Scoped'}</div>\`;
      html += '</div>';
    }
    html += '</div>';
  }

  // Labels
  if (vtc.labels) {
    try {
      const labels = JSON.parse(vtc.labels);
      if (labels.length > 0) {
        html += '<div class="tc-detail-section">';
        html += '<div class="tc-detail-section-title">Labels</div>';
        html += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
        for (const l of labels) html += \`<span style="font-size:11px;padding:2px 8px;border-radius:8px;background:rgba(88,166,255,0.1);color:var(--accent)">\${esc(l)}</span>\`;
        html += '</div></div>';
      }
    } catch (e) {}
  }

  // Metadata
  html += '<div class="tc-detail-section">';
  html += '<div class="tc-detail-section-title">Info</div>';
  html += \`<div style="font-size:12px;color:var(--dim)">ID: \${esc(vtc.id)}</div>\`;
  html += \`<div style="font-size:12px;color:var(--dim)">Ticket: \${esc(vtc.ticket_id)}</div>\`;
  if (vtc.created_at) html += \`<div style="font-size:12px;color:var(--dim)">Created: \${timeAgo(vtc.created_at)}</div>\`;
  html += '</div>';

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
    const tickets = await fetchJson("/api/report/tickets");

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
    reportData = await fetchJson("/api/report?ticket=" + encodeURIComponent(reportSelectedTicket));
  }

  // Fetch saved Claude analysis
  const savedReports = await fetchJson("/api/report/saved?ticket=" + encodeURIComponent(reportSelectedTicket));
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
      html += \`<pre style="font-size:12px;color:var(--text);white-space:pre-wrap;margin:0;line-height:1.6">\${esc(formatPreText(r.plan.testNotes))}</pre>\`;
      html += '</div>';
    }
  }

  // ── TAB: Test Runs ──
  if (reportTab === "runs") {
    try {
      const packs = await fetchJson("/api/runpacks?ticket=" + encodeURIComponent(reportSelectedTicket));

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
            const packData = await fetchJson("/api/runpacks?pack=" + encodeURIComponent(p.run_pack_id));
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
        html += \`<tr>
          <td style="color:\${severityColor(i.severity)};font-weight:600;font-size:11px">\${(i.severity || "").toUpperCase()}</td>
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
  const data = await fetchJson("/api/secrets");
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
  await postJson("/api/secrets/target", { name, url: url || undefined, description: desc || undefined });
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
  await postJson("/api/secrets", { target, role, key, value });
  secretsSelectedRole = role;
  renderSecretsPage();
}

async function deleteSecretUI(target, role, key) {
  if (!confirm("Delete " + key + "?")) return;
  await fetchApi("/api/secrets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, role, key }) });
  renderSecretsPage();
}

async function deleteRoleUI(target, role) {
  if (!confirm("Delete role " + role + " from " + target + "?")) return;
  await fetchApi("/api/secrets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, role }) });
  secretsSelectedRole = "";
  renderSecretsPage();
}

async function deleteTargetUI(target) {
  if (!confirm("Delete target " + target + " and ALL its secrets?")) return;
  await fetchApi("/api/secrets", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target }) });
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
    const data = await postJson("/api/secrets/import-op", { opRef, target, role, live });
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
    const data = await fetchJson("/api/secrets?resolve=true&target=" + encodeURIComponent(target) + "&role=" + encodeURIComponent(role));
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

// ── Default Files Page ──

const FILE_TYPE_LABELS = {
  document: { icon: "ph-file-text", color: "var(--accent)" },
  image: { icon: "ph-image", color: "var(--green)" },
  spreadsheet: { icon: "ph-table", color: "var(--yellow)" },
  pdf: { icon: "ph-file-pdf", color: "var(--red)" },
  video: { icon: "ph-video-camera", color: "var(--purple, #a371f7)" },
  archive: { icon: "ph-file-zip", color: "var(--dim)" },
  other: { icon: "ph-file", color: "var(--dim)" },
};

// ── QA Pool Page ──

let qaPoolSelectedTicket = "";

async function renderQaPoolPage() {
  const data = await fetchJson("/api/qa-pool");
  const { byTicket, ticketIds } = data;

  let html = '<div class="panel" style="margin-bottom:16px">';
  html += '<div class="breadcrumb">';
  if (qaPoolSelectedTicket) {
    html += '<span class="breadcrumb-item" onclick="qaPoolSelectedTicket=\\'\\';renderQaPoolPage()">Pool</span>';
    html += '<span class="breadcrumb-sep">|</span>';
    html += '<span class="breadcrumb-item current">' + esc(qaPoolSelectedTicket) + '</span>';
  } else {
    html += '<span class="breadcrumb-item current">Pool</span>';
  }
  html += '</div>';
  if (ticketIds.length > 0) {
    html += '<div style="display:flex;gap:16px;margin-bottom:8px">';
    html += '<div class="stat"><div class="stat-value">' + ticketIds.length + '</div><div class="stat-label">Tickets</div></div>';
    const total = data.agents.length;
    html += '<div class="stat"><div class="stat-value">' + total + '</div><div class="stat-label">Agents</div></div>';
  }
  html += '</div>';

  if (ticketIds.length === 0) {
    html += '<div class="panel"><div class="empty">No agents configured yet.<br><code style="font-size:11px">noob-tester qa-pool add --ticket JIRA-123 --agent .claude/agents/field-agent.md</code></div></div>';
    setPage(html);
    return;
  }

  html += '<div class="split-view wide-left">';

  // LEFT — ticket list or agent list for selected ticket
  html += '<div class="split-left">';
  if (!qaPoolSelectedTicket) {
    // Show all tickets
    for (const tid of ticketIds) {
      const agents = byTicket[tid];
      html += '<div class="session-card" onclick="qaPoolSelectedTicket=\\'' + esc(tid) + '\\';renderQaPoolPage()" style="cursor:pointer">';
      html += '<div class="session-header">';
      html += '<span class="session-id">' + esc(tid) + '</span>';
      html += '<span style="font-size:11px;padding:2px 8px;border-radius:99px;background:var(--accent-dim);color:var(--accent)">' + agents.length + ' agent' + (agents.length !== 1 ? 's' : '') + '</span>';
      html += '</div>';
      const paths = agents.map(function(a) { return a.agent_path.split('/').pop(); }).join(', ');
      html += '<div style="font-size:11px;color:var(--dim);margin-top:4px">' + esc(paths) + '</div>';
      html += '</div>';
    }
  } else {
    // Show agents for selected ticket
    const agents = byTicket[qaPoolSelectedTicket] || [];
    if (agents.length === 0) {
      html += '<div class="empty">No agents for this ticket.</div>';
    }
    for (const a of agents) {
      const existsBadge = a.agentExists
        ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(63,185,80,0.15);color:var(--green)">found</span>'
        : '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(248,81,73,0.15);color:var(--red)">missing</span>';
      html += '<div class="session-card">';
      html += '<div class="session-header">';
      html += '<span style="display:flex;align-items:center;gap:6px"><i class="ph ph-robot" style="color:var(--accent);font-size:16px"></i><span class="session-id" style="font-size:13px">' + esc(a.agent_path.split('/').pop()) + '</span></span>';
      html += '<span style="display:flex;align-items:center;gap:6px">' + existsBadge + '<button class="secret-delete" onclick="event.stopPropagation();deleteQaPoolAgent(\\'' + a.id + '\\')">Remove</button></span>';
      html += '</div>';
      html += '<div style="font-size:11px;color:var(--dim);margin-top:4px;font-family:monospace;word-break:break-all">' + esc(a.agent_path) + '</div>';
      html += '<div style="display:flex;gap:12px;margin-top:6px;font-size:11px;color:var(--dim);flex-wrap:wrap">';
      if (a.target) html += '<span><i class="ph ph-target" style="margin-right:3px"></i>' + esc(a.target) + '</span>';
      if (a.role && a.role !== 'default') html += '<span><i class="ph ph-user-circle" style="margin-right:3px"></i>' + esc(a.role) + '</span>';
      if (a.file) html += '<span><i class="ph ph-file" style="margin-right:3px"></i>' + esc(a.file) + '</span>';
      html += '</div>';
      html += '<div style="margin-top:8px;padding:8px;background:var(--bg);border-radius:var(--radius-xs);font-size:11px;font-family:monospace;color:var(--dim);word-break:break-all">' + esc(a.invocation) + '</div>';
      html += '</div>';
    }
  }
  html += '</div>';

  // RIGHT — detail / info panel
  html += '<div class="split-right panel">';
  if (!qaPoolSelectedTicket) {
    html += '<div class="panel-title">Select a Ticket</div>';
    html += '<div style="font-size:12px;color:var(--dim);line-height:1.6">Click a ticket on the left to view its configured agents and invocation strings.</div>';
    html += '<div style="margin-top:16px">';
    html += '<div class="panel-title">CLI Reference</div>';
    html += '<code style="display:block;font-size:11px;white-space:pre-wrap;color:var(--dim)">noob-tester qa-pool add \\\\\\n  --ticket JIRA-123 \\\\\\n  --agent .claude/agents/field-agent.md \\\\\\n  --target staging-login \\\\\\n  --role admin</code>';
    html += '</div>';
    html += '<div style="margin-top:16px">';
    html += '<div class="panel-title">Subcommands</div>';
    html += '<code style="display:block;font-size:11px;white-space:pre-wrap;color:var(--dim)">qa-pool add    Add an agent config\\nqa-pool list   List agents for a ticket\\nqa-pool remove Remove an agent by ID\\nqa-pool run    Print invocation strings</code>';
    html += '</div>';
  } else {
    const agents = byTicket[qaPoolSelectedTicket] || [];
    const spawns = data.spawns && data.spawns[qaPoolSelectedTicket] ? data.spawns[qaPoolSelectedTicket] : [];
    const activeSpawns = spawns.filter(function(s) { return s.status === 'running'; });

    html += '<div class="panel-title">' + esc(qaPoolSelectedTicket) + '</div>';
    html += '<div style="display:flex;gap:16px;margin-bottom:12px">';
    html += '<div class="stat"><div class="stat-value">' + agents.length + '</div><div class="stat-label">Agents</div></div>';
    const missing = agents.filter(function(a) { return !a.agentExists; }).length;
    if (missing > 0) {
      html += '<div class="stat"><div class="stat-value" style="color:var(--red)">' + missing + '</div><div class="stat-label">Missing</div></div>';
    }
    if (activeSpawns.length > 0) {
      html += '<div class="stat"><div class="stat-value" style="color:var(--green)">' + activeSpawns.length + '</div><div class="stat-label">Running</div></div>';
    }
    html += '</div>';

    // Spawned Agents section
    if (spawns.length > 0) {
      html += '<div class="panel-title" style="margin-top:12px">Spawned Agents (' + spawns.length + ')</div>';
      for (const spawn of spawns) {
        const statusColor = spawn.status === 'running' ? 'var(--green)' : spawn.status === 'completed' ? 'var(--dim)' : spawn.status === 'killed' ? 'var(--yellow)' : 'var(--red)';
        const typeIcon = spawn.spawn_type === 'visual-pool' ? '🎬' : '🤖';
        html += '<div style="margin-bottom:8px;padding:8px;background:var(--bg);border-radius:var(--radius-xs);border:1px solid var(--border)">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center">';
        html += '<div style="font-size:11px">';
        html += '<div style="color:' + statusColor + ';font-weight:600">' + typeIcon + ' ' + spawn.status.toUpperCase() + '</div>';
        html += '<div style="color:var(--dim);font-size:10px;margin-top:2px">PID: ' + spawn.pid + ' | ' + spawn.agent_path.split('/').pop() + '</div>';
        html += '<div style="color:var(--dim);font-size:10px;margin-top:2px">' + spawn.created_at.slice(11, 19) + '</div>';
        html += '</div>';
        if (spawn.status === 'running') {
          html += '<button style="padding:4px 8px;font-size:10px;background:var(--red);color:white;border:none;border-radius:4px;cursor:pointer" onclick="killPoolSpawn(\\'' + esc(qaPoolSelectedTicket) + '\\')">Kill</button>';
        }
        html += '</div>';
      }
      if (activeSpawns.length > 0) {
        html += '<div style="margin-top:8px">';
        html += '<button style="width:100%;padding:8px;font-size:11px;background:var(--red);color:white;border:none;border-radius:4px;cursor:pointer;font-weight:600" onclick="killAllPoolSpawns(\\'' + esc(qaPoolSelectedTicket) + '\\')">Kill All Spawns</button>';
        html += '</div>';
      }
    }

    html += '<div class="panel-title" style="margin-top:12px">Run Invocations</div>';
    html += '<div style="font-size:11px;color:var(--dim);margin-bottom:6px">Copy these to dispatch agents via noob-explore:</div>';
    for (const a of agents) {
      html += '<div style="margin-bottom:8px;padding:8px;background:var(--bg);border-radius:var(--radius-xs);font-size:11px;font-family:monospace;color:var(--text);word-break:break-all;border:1px solid var(--border)">' + esc(a.invocation) + '</div>';
    }
    html += '<div style="margin-top:12px">';
    html += '<div class="panel-title">Run via CLI</div>';
    html += '<code style="display:block;font-size:11px;white-space:pre-wrap;color:var(--dim)">noob-tester qa-pool run --ticket ' + esc(qaPoolSelectedTicket) + '</code>';
    html += '</div>';
  }
  html += '</div>';

  html += '</div>';
  setPage(html);
}

async function deleteQaPoolAgent(id) {
  if (!confirm("Remove this agent config?")) return;
  await fetchApi("/api/qa-pool", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  renderQaPoolPage();
}

async function killPoolSpawn(ticketId) {
  if (!confirm("Kill all spawned agents for " + ticketId + "?")) return;
  await fetchApi("/api/qa-pool/kills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_id: ticketId }) });
  renderQaPoolPage();
}

async function killAllPoolSpawns(ticketId) {
  if (!confirm("Kill ALL spawned agents for " + ticketId + "? This cannot be undone.")) return;
  await fetchApi("/api/qa-pool/kills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket_id: ticketId, force: true }) });
  renderQaPoolPage();
}

async function renderFilesPage() {
  const files = await fetchJson("/api/files");
  const app = document.getElementById("app");

  // Stats
  const byType = {};
  for (const f of files) {
    byType[f.file_type] = (byType[f.file_type] || 0) + 1;
  }
  const totalSize = files.reduce(function(s, f) { return s + (f.file_size || 0); }, 0);

  let html = '<div class="panel" style="margin-bottom:16px">';
  html += '<div class="panel-title">Default Files for Upload</div>';
  if (files.length > 0) {
    html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
    html += '<div class="stat"><div class="stat-value">' + files.length + '</div><div class="stat-label">Files</div></div>';
    html += '<div class="stat"><div class="stat-value">' + Object.keys(byType).length + '</div><div class="stat-label">Types</div></div>';
    html += '<div class="stat"><div class="stat-value">' + formatBytes(totalSize) + '</div><div class="stat-label">Total Size</div></div>';
    html += '</div>';
  }
  html += '<div style="font-size:12px;color:var(--dim)">Register local files here so agents can use <code>agent-browser upload &lt;selector&gt; &lt;file_path&gt;</code> during test execution.</div>';
  html += '</div>';

  html += '<div class="split-view wide-left">';

  // LEFT — file cards
  html += '<div class="split-left">';
  if (files.length === 0) {
    html += '<div class="empty">No files registered. Add one using the form on the right.</div>';
  } else {
    for (const f of files) {
      const meta = FILE_TYPE_LABELS[f.file_type] || FILE_TYPE_LABELS.other;
      const existsBadge = f.exists
        ? '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(63,185,80,0.15);color:var(--green)">exists</span>'
        : '<span style="font-size:10px;padding:1px 6px;border-radius:8px;background:rgba(248,81,73,0.15);color:var(--red)">missing</span>';
      html += '<div class="session-card">';
      html += '<div class="session-header">';
      html += '<span style="display:flex;align-items:center;gap:6px"><i class="ph ' + meta.icon + '" style="color:' + meta.color + ';font-size:16px"></i><span class="session-id" style="font-size:14px">' + esc(f.label) + '</span></span>';
      html += '<span style="display:flex;align-items:center;gap:6px">' + existsBadge + '<button class="secret-delete" onclick="event.stopPropagation();deleteFileUI(' + "'" + f.id + "','" + esc(f.label).replace(/'/g, '') + "'" + ')">Delete</button></span>';
      html += '</div>';
      html += '<div style="font-size:12px;color:var(--dim);margin-top:4px;font-family:monospace;word-break:break-all">' + esc(f.file_path) + '</div>';
      html += '<div style="display:flex;gap:12px;margin-top:6px;font-size:11px;color:var(--dim)">';
      html += '<span style="padding:1px 6px;border-radius:8px;background:rgba(210,153,34,0.15);color:var(--yellow)">' + esc(f.file_type) + '</span>';
      if (f.mime_type) html += '<span>' + esc(f.mime_type) + '</span>';
      if (f.file_size) html += '<span>' + formatBytes(f.file_size) + '</span>';
      html += '</div>';
      if (f.description) html += '<div style="font-size:12px;color:var(--dim);margin-top:4px">' + esc(f.description) + '</div>';
      html += '</div>';
    }
  }
  html += '</div>';

  // RIGHT — add file form
  html += '<div class="split-right panel">';
  html += '<div class="panel-title">Add File</div>';
  html += '<div class="add-form" style="flex-direction:column">';
  html += '<input id="add-file-label" placeholder="Label (e.g. Sample Resume)" />';
  html += '<input id="add-file-input" type="file" style="padding:6px;background:var(--bg);border:1px solid var(--border);border-radius:6px;color:var(--fg);font-size:12px" />';
  html += '<select id="add-file-type">';
  html += '<option value="document">Document</option>';
  html += '<option value="pdf">PDF</option>';
  html += '<option value="image">Image</option>';
  html += '<option value="spreadsheet">Spreadsheet</option>';
  html += '<option value="video">Video</option>';
  html += '<option value="archive">Archive</option>';
  html += '<option value="other">Other</option>';
  html += '</select>';
  html += '<input id="add-file-desc" placeholder="Description (optional)" />';
  html += '<button onclick="addFileUI()">Add File</button>';
  html += '</div>';

  html += '<div style="margin-top:20px;font-size:12px;color:var(--dim)">';
  html += '<div class="panel-title">Usage in Skills</div>';
  html += '<code style="display:block;margin-top:4px;font-size:11px;white-space:pre-wrap">noob-tester files list<br>agent-browser upload &lt;selector&gt; &lt;file_path&gt;</code>';
  html += '</div>';
  html += '</div>';

  html += '</div>';
  setPage(html);
}

async function addFileUI() {
  const label = document.getElementById("add-file-label").value;
  const fileInput = document.getElementById("add-file-input");
  const file_type = document.getElementById("add-file-type").value;
  const description = document.getElementById("add-file-desc").value;
  if (!label) { alert("Label is required"); return; }
  if (!fileInput.files || !fileInput.files.length) { alert("Please select a file"); return; }
  const file = fileInput.files[0];
  const reader = new FileReader();
  reader.onload = async function() {
    const base64 = reader.result.split(",")[1];
    await postJson("/api/files", { label, file_name: file.name, file_data: base64, file_type, description: description || undefined });
    renderFilesPage();
  };
  reader.readAsDataURL(file);
}

async function deleteFileUI(id, label) {
  if (!confirm("Delete file " + label + "?")) return;
  await fetchApi("/api/files", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
  renderFilesPage();
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
  const repos = await fetchJson("/api/coverage/repos");

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
  const uncovData = await fetchJson("/api/coverage/uncovered?repo=" + encodeURIComponent(covSelectedRepo) + "&limit=" + covPageSize + "&offset=" + covOffset + (covSearch ? "&search=" + encodeURIComponent(covSearch) : ""));
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
    const links = await fetchJson("/api/coverage/by-file?repo=" + encodeURIComponent(covSelectedRepo) + "&file=" + encodeURIComponent(covSelectedFile));
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
  const summary = await fetchJson("/api/a11y/summary" + queryParam);

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
    const issues = await fetchJson("/api/a11y/issues?pack=" + encodeURIComponent(a11ySelectedPack));

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
    const issues = await fetchJson("/api/a11y/issues?pack=" + encodeURIComponent(a11ySelectedPack) + "&page=" + encodeURIComponent(a11ySelectedPage));

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
  const audit = await fetchJson("/api/test-audit" + (auditTicket ? "?ticket=" + encodeURIComponent(auditTicket) : ""));
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

// ── Swarm page — live WebSocket streams for all active explore sessions ──

// Track active WebSocket connections so we can close them when navigating away
let swarmSockets = [];

function swarmCleanup() {
  for (const ws of swarmSockets) {
    try { ws.close(); } catch {}
  }
  swarmSockets = [];
}

async function renderSwarmPage() {
  // Clean up previous connections
  swarmCleanup();

  let data;
  try {
    data = await fetchJson("/api/swarm");
  } catch (err) {
    setPage('<div class="swarm-empty">Failed to load swarm data.</div>');
    return;
  }

  const { byTicket, noTicket, total } = data;
  const ticketIds = Object.keys(byTicket).sort();
  const allGroups = [
    ...ticketIds.map(t => ({ label: t, sessions: byTicket[t] })),
    ...(noTicket.length > 0 ? [{ label: "__none__", sessions: noTicket }] : []),
  ];

  let html = '<div style="padding-bottom:24px">';

  // Header bar
  html += '<div style="display:flex;align-items:center;gap:16px;margin-bottom:20px">';
  html += '<div style="font-size:18px;font-weight:700;letter-spacing:-0.3px">Swarm</div>';
  html += \`<span style="font-size:12px;color:var(--dim)">\${total} active stream\${total !== 1 ? "s" : ""}</span>\`;
  html += '<button class="action-btn" style="margin-left:auto" onclick="renderSwarmPage()"><i class="ph ph-arrows-clockwise"></i> Refresh</button>';
  html += '</div>';

  if (total === 0) {
    html += '<div class="swarm-empty">No active explore sessions with a stream port.<br>Start a <code>noob-explore</code> session to see live streams here.</div>';
    html += '</div>';
    setPage(html);
    return;
  }

  for (const group of allGroups) {
    const { label, sessions } = group;
    const displayLabel = label === "__none__" ? "No Ticket" : label;
    html += '<div class="swarm-ticket-group">';
    html += \`<div class="swarm-ticket-header">
      <span class="swarm-ticket-label">\${esc(displayLabel)}</span>
      <span class="swarm-ticket-badge">\${sessions.length} session\${sessions.length !== 1 ? "s" : ""}</span>
    </div>\`;
    html += '<div class="swarm-grid">';

    for (const s of sessions) {
      const canvasId = "swarm-canvas-" + s.id.replace(/-/g, "");
      const statusId = "swarm-status-" + s.id.replace(/-/g, "");
      html += \`<div class="swarm-card">
        <div class="swarm-card-header">
          <span class="swarm-card-id">\${s.id.slice(0, 8)}</span>
          \${s.stream_port ? \`<span class="swarm-card-port">ws://localhost:\${s.stream_port}</span>\` : '<span class="swarm-card-port" style="background:var(--red-dim);color:var(--red)">no port</span>'}
        </div>
        <div class="swarm-card-task" title="\${esc(s.task_summary || '')}">
          \${esc(s.task_summary || "no task summary")}
        </div>
        <div class="swarm-stream-wrap">\`;

      if (s.stream_port) {
        html += \`<canvas id="\${canvasId}" class="swarm-canvas"></canvas>
          <span id="\${statusId}" class="swarm-stream-status connecting">Connecting…</span>
          <button class="swarm-maximize-btn" onclick="swarmMaximize('\${s.id}', \${s.stream_port})" title="Maximize">⛶</button>\`;
      } else {
        html += '<div class="swarm-no-port">No stream port assigned</div>';
      }

      html += '</div></div>';
    }

    html += '</div></div>';
  }

  // Modal overlay (appended once)
  html += \`</div>
  <div id="swarm-modal" class="swarm-modal-overlay" onclick="if(event.target===this)swarmCloseModal()">
    <div class="swarm-modal-box">
      <div class="swarm-modal-header">
        <span class="swarm-modal-title" id="swarm-modal-title">Session</span>
        <button class="swarm-modal-close" onclick="swarmCloseModal()">✕</button>
      </div>
      <div class="swarm-modal-body">
        <div class="swarm-modal-stream">
          <canvas id="swarm-modal-canvas" class="swarm-modal-canvas"></canvas>
        </div>
        <div class="swarm-modal-info" id="swarm-modal-info">
          <div class="swarm-info-loading">Loading test info…</div>
        </div>
      </div>
    </div>
  </div>\`;

  setPage(html);

  // After DOM is rendered, connect WebSockets
  for (const group of allGroups) {
    for (const s of group.sessions) {
      if (!s.stream_port) continue;
      swarmConnectStream(s.id, s.stream_port);
    }
  }
}

function swarmConnectStream(sessionId, port) {
  const canvasId = "swarm-canvas-" + sessionId.replace(/-/g, "");
  const statusId = "swarm-status-" + sessionId.replace(/-/g, "");

  const canvas = document.getElementById(canvasId);
  const statusEl = document.getElementById(statusId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let reconnectDelay = 2000;
  let ws = null;
  let stopped = false;
  let hasConnected = false; // true once we get at least one successful open
  let attempts = 0;

  function connect() {
    if (stopped) return;
    attempts++;
    ws = new WebSocket("ws://localhost:" + port);
    swarmSockets.push(ws);

    if (statusEl) {
      if (hasConnected) {
        statusEl.textContent = "Reconnecting…"; statusEl.className = "swarm-stream-status disconnected";
      } else {
        statusEl.textContent = "Getting ready…"; statusEl.className = "swarm-stream-status connecting";
      }
    }

    ws.onopen = () => {
      hasConnected = true;
      attempts = 0;
      reconnectDelay = 2000;
      if (statusEl) { statusEl.textContent = "Live"; statusEl.className = "swarm-stream-status live"; }
    };

    ws.onmessage = (evt) => {
      try {
        const msg = typeof evt.data === "string" ? JSON.parse(evt.data) : null;
        if (!msg) return;

        // agent-browser sends { type: "frame", data: "<base64 jpeg>" }
        if (msg.type === "frame" && msg.data) {
          const img = new Image();
          img.onload = () => {
            const c = document.getElementById(canvasId);
            if (!c) { stopped = true; ws && ws.close(); return; }
            if (c.width !== img.naturalWidth) c.width = img.naturalWidth;
            if (c.height !== img.naturalHeight) c.height = img.naturalHeight;
            c.getContext("2d").drawImage(img, 0, 0);
            // Mirror to modal canvas if this session is maximized
            if (window._swarmModalSessionId === sessionId) {
              const mc = document.getElementById("swarm-modal-canvas");
              if (mc) {
                if (mc.width !== img.naturalWidth) mc.width = img.naturalWidth;
                if (mc.height !== img.naturalHeight) mc.height = img.naturalHeight;
                mc.getContext("2d").drawImage(img, 0, 0);
              }
            }
          };
          img.src = "data:image/jpeg;base64," + msg.data;
        }
      } catch {}
    };

    ws.onclose = () => {
      if (stopped) return;

      function scheduleRetry() {
        const msg = hasConnected ? "Reconnecting…" : "Getting ready…";
        const cls = hasConnected ? "swarm-stream-status disconnected" : "swarm-stream-status connecting";
        if (statusEl) { statusEl.textContent = msg; statusEl.className = cls; }
        setTimeout(connect, Math.min(reconnectDelay, 30000));
        reconnectDelay = Math.min(reconnectDelay * 2, 30000);
      }

      // If we were live before, always check session status immediately
      // If never connected, only check every 5th attempt (give agent time to start stream)
      const shouldCheck = hasConnected || (attempts % 5 === 0 && attempts > 0);

      if (!shouldCheck) {
        scheduleRetry();
        return;
      }

      fetch("/api/swarm").then(r => r.json()).then(data => {
        let stillActive = false;
        for (const ticket in (data.byTicket || {})) {
          for (const s of data.byTicket[ticket]) {
            if (s.id === sessionId && s.status === "active") stillActive = true;
          }
        }
        for (const s of (data.noTicket || [])) {
          if (s.id === sessionId && s.status === "active") stillActive = true;
        }
        if (!stillActive) {
          stopped = true;
          if (statusEl) { statusEl.textContent = "Session ended"; statusEl.className = "swarm-stream-status ended"; }
          return;
        }
        scheduleRetry();
      }).catch(() => { scheduleRetry(); });
    };

    ws.onerror = () => { try { ws.close(); } catch {} };
  }

  connect();
}

// ── Swarm maximize / modal ──
window._swarmModalSessionId = null;

function swarmMaximize(sessionId, port) {
  window._swarmModalSessionId = sessionId;
  const modal = document.getElementById("swarm-modal");
  const title = document.getElementById("swarm-modal-title");
  const infoPanel = document.getElementById("swarm-modal-info");
  if (!modal) return;
  title.textContent = "Session " + sessionId.slice(0, 8) + " — ws://localhost:" + port;
  if (infoPanel) infoPanel.innerHTML = '<div class="swarm-info-loading">Loading test info…</div>';
  modal.classList.add("open");
  document.addEventListener("keydown", swarmModalEsc);

  // Fetch test case details
  fetch("/api/swarm/session-info?sessionId=" + encodeURIComponent(sessionId))
    .then(r => r.json())
    .then(data => {
      if (!infoPanel) return;
      let html = "";

      // Run info
      if (data.run) {
        html += '<div class="swarm-info-section"><div class="swarm-info-label">Run</div>';
        html += '<div class="swarm-info-value">' + esc(data.run.id ? data.run.id.slice(0, 8) : "—") + '</div></div>';
      }

      // Ticket info
      if (data.ticket) {
        html += '<div class="swarm-info-section"><div class="swarm-info-label">Ticket</div>';
        html += '<div class="swarm-info-value">' + esc(data.ticket) + '</div></div>';
      }

      // Test case info
      if (data.testCase) {
        const tc = data.testCase;
        html += '<div class="swarm-info-section"><div class="swarm-info-label">Test Case</div>';
        html += '<div class="swarm-info-value">' + esc(tc.title || "—") + '</div></div>';

        if (tc.format) {
          html += '<div class="swarm-info-section"><div class="swarm-info-label">Format</div>';
          html += '<div class="swarm-info-value"><span class="swarm-info-badge ' + tc.format + '">' + esc(tc.format.toUpperCase()) + '</span></div></div>';
        }

        // BDD steps
        if (tc.format === "bdd") {
          if (tc.given && tc.given.length) {
            html += '<div class="swarm-info-section"><div class="swarm-info-label">Given</div>';
            html += '<div class="swarm-info-value">' + tc.given.map(function(s){ return '<div class="step-item">' + esc(s) + '</div>'; }).join("") + '</div></div>';
          }
          if (tc.when && tc.when.length) {
            html += '<div class="swarm-info-section"><div class="swarm-info-label">When</div>';
            html += '<div class="swarm-info-value">' + tc.when.map(function(s){ return '<div class="step-item">' + esc(s) + '</div>'; }).join("") + '</div></div>';
          }
          if (tc.then && tc.then.length) {
            html += '<div class="swarm-info-section"><div class="swarm-info-label">Then</div>';
            html += '<div class="swarm-info-value">' + tc.then.map(function(s){ return '<div class="step-item">' + esc(s) + '</div>'; }).join("") + '</div></div>';
          }
        }

        // Traditional steps
        if (tc.format !== "bdd") {
          if (tc.steps && tc.steps.length) {
            html += '<div class="swarm-info-section"><div class="swarm-info-label">Steps</div>';
            html += '<div class="swarm-info-value">' + tc.steps.map(function(s, i){ return '<div class="step-item">' + (i+1) + ". " + esc(s) + '</div>'; }).join("") + '</div></div>';
          }
          if (tc.expected && tc.expected.length) {
            html += '<div class="swarm-info-section"><div class="swarm-info-label">Expected</div>';
            html += '<div class="swarm-info-value">' + tc.expected.map(function(s){ return '<div class="step-item">' + esc(s) + '</div>'; }).join("") + '</div></div>';
          }
        }
      }

      if (!html) html = '<div class="swarm-info-loading">No test case info available</div>';
      infoPanel.innerHTML = html;
    })
    .catch(() => {
      if (infoPanel) infoPanel.innerHTML = '<div class="swarm-info-loading">Failed to load test info</div>';
    });
}

function swarmCloseModal() {
  window._swarmModalSessionId = null;
  const modal = document.getElementById("swarm-modal");
  if (modal) modal.classList.remove("open");
  document.removeEventListener("keydown", swarmModalEsc);
}

function swarmModalEsc(e) {
  if (e.key === "Escape") swarmCloseModal();
}

// ── Visual Runs Page ──────────────────────────────────────────────────────────
let vrSelectedTicket = "";
let vrSelectedRun = "";
let vrSelectedEntry = "";

async function deleteVisualRun(runId) {
  if (!confirm("Delete this run pack? This cannot be undone.")) return;
  await postJson("/api/visual-runs/delete", { run: runId });
  if (vrSelectedRun === runId) { vrSelectedRun = ""; vrSelectedEntry = ""; }
  renderVisualRunsPage();
}

async function deleteVisualRunsByTicket(ticket) {
  if (!confirm("Delete ALL run packs for " + ticket + "? This cannot be undone.")) return;
  await postJson("/api/visual-runs/delete", { ticket });
  vrSelectedTicket = "";
  vrSelectedRun = "";
  vrSelectedEntry = "";
  renderVisualRunsPage();
}

function selectVrTab(runId) {
  vrSelectedRun = runId;
  vrSelectedEntry = "";
  renderVisualRunsPage();
}

async function renderVisualRunsPage() {
  let html = "";

  function fmtTs(ts) {
    if (!ts) return "-";
    const d = new Date(ts.replace(" ", "T"));
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      + " " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }

  // ── Level 1: Ticket cards ──
  if (!vrSelectedTicket) {
    const byTicket = await fetchJson("/api/visual-runs");
    const ticketIds = Object.keys(byTicket).sort();

    if (ticketIds.length === 0) {
      setPage('<div class="panel"><div class="empty">No visual runs found. Use <code>/noob-visual</code> to run visual tests.</div></div>');
      return;
    }

    let totalPacks = 0, totalBaselines = 0, totalVerifications = 0;
    for (const tid of ticketIds) {
      totalPacks += byTicket[tid].length;
      totalBaselines += byTicket[tid].filter(r => r.mode === "baseline").length;
      totalVerifications += byTicket[tid].filter(r => r.mode === "verification").length;
    }

    html += '<div class="panel" style="margin-bottom:16px"><div class="panel-title"><i class="ph ph-eye" style="margin-right:6px"></i>Visual Testing</div>';
    html += '<div style="display:flex;gap:24px;margin-bottom:8px">';
    html += \`<div class="stat"><div class="stat-value">\${ticketIds.length}</div><div class="stat-label">Tickets</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${totalBaselines}</div><div class="stat-label">Baseline Packs</div></div>\`;
    html += \`<div class="stat"><div class="stat-value">\${totalVerifications}</div><div class="stat-label">Verification Packs</div></div>\`;
    html += '</div></div>';

    html += '<div class="panel">';
    for (const tid of ticketIds) {
      const runs = byTicket[tid];
      const baselineCount = runs.filter(r => r.mode === "baseline").length;
      const verificationCount = runs.filter(r => r.mode === "verification").length;
      const failedRuns = runs.filter(r => r.status === "failed").length;
      const latestRun = runs[0];

      html += \`<div class="session-card" onclick="vrSelectedTicket='\${esc(tid)}';vrSelectedRun='';vrSelectedEntry='';renderVisualRunsPage()">
        <div class="session-header">
          <span class="session-id" style="font-size:14px">\${esc(tid)}</span>
          <span style="display:flex;gap:6px;align-items:center">
            <span style="font-size:12px;color:var(--dim)">\${runs.length} pack\${runs.length !== 1 ? 's' : ''}</span>
            <button onclick="event.stopPropagation();deleteVisualRunsByTicket('\${esc(tid)}')" style="font-size:9px;color:var(--red);background:none;border:1px solid var(--border);border-radius:3px;padding:2px 5px;cursor:pointer" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">&times;</button>
          </span>
        </div>
        <div style="display:flex;gap:6px;margin-top:6px;flex-wrap:wrap">
          \${baselineCount ? \`<span class="suite-badge passed">\${baselineCount} baseline</span>\` : ""}
          \${verificationCount ? \`<span class="suite-badge pending">\${verificationCount} verification</span>\` : ""}
          \${failedRuns ? \`<span class="suite-badge failed">\${failedRuns} failed</span>\` : ""}
        </div>
        <div class="session-meta"><span>Last run: \${fmtTs(latestRun?.created_at)}</span></div>
      </div>\`;
    }
    html += '</div>';
    setPage(html);
    return;
  }

  // ── Level 2: Tabs for run packs + split view inside each tab ──
  const runs = await fetchJson("/api/visual-runs?ticket=" + encodeURIComponent(vrSelectedTicket));
  const allPacks = [...runs]; // baseline first, then verifications (API returns sorted)

  // Auto-select first tab if none selected
  if (!vrSelectedRun && allPacks.length > 0) {
    vrSelectedRun = allPacks[0].id;
  }

  // Breadcrumb
  html += \`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
    <div style="display:flex;align-items:center;gap:8px;font-size:13px">
      <span onclick="vrSelectedTicket='';vrSelectedRun='';vrSelectedEntry='';renderVisualRunsPage()"
        style="color:var(--accent);cursor:pointer;font-weight:500" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">
        <i class="ph ph-arrow-left" style="font-size:14px;margin-right:4px"></i>All Tickets</span>
      <span style="color:var(--dim)">/</span>
      <span style="font-weight:700;color:var(--fg)">\${esc(vrSelectedTicket)}</span>
    </div>
    <button onclick="deleteVisualRunsByTicket('\${esc(vrSelectedTicket)}')"
      style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer;opacity:.7"
      onmouseover="this.style.opacity='1';this.style.borderColor='var(--red)'"
      onmouseout="this.style.opacity='.7';this.style.borderColor='var(--border)'">Delete All</button>
  </div>\`;

  // ── Tabs row ──
  html += '<div class="tabs">';
  let baselineIdx = 0;
  let verifyIdx = 0;
  for (const run of allPacks) {
    const isActive = vrSelectedRun === run.id;
    const isBaseline = run.mode === "baseline";
    const summary = run.summary_json ? JSON.parse(run.summary_json) : null;
    const failed = summary ? (summary.failed || 0) : 0;
    let label = "";
    if (isBaseline) {
      baselineIdx++;
      label = "Baseline" + (baselineIdx > 1 ? " " + baselineIdx : "");
    } else {
      verifyIdx++;
      label = "Verify " + verifyIdx;
    }
    const statusDot = run.status === "completed" ? (isBaseline ? "var(--accent)" : (failed > 0 ? "var(--red)" : "var(--green)"))
                    : run.status === "running" ? "var(--yellow)" : "var(--dim)";

    html += \`<div class="tab \${isActive ? 'active' : ''}" onclick="selectVrTab('\${esc(run.id)}')" style="display:flex;align-items:center;gap:6px">
      <span style="width:6px;height:6px;border-radius:50%;background:\${statusDot};display:inline-block"></span>
      \${label}
      <span style="font-size:9px;color:var(--muted);font-weight:400">\${fmtTs(run.created_at)}</span>
      <span onclick="event.stopPropagation();deleteVisualRun('\${esc(run.id)}')"
        style="font-size:10px;color:var(--red);cursor:pointer;opacity:.4;margin-left:2px"
        onmouseover="this.style.opacity='1'" onmouseout="this.style.opacity='.4'" title="Delete this run pack">&times;</span>
    </div>\`;
  }
  html += '</div>';

  // ── Split view for selected tab ──
  if (!vrSelectedRun || !allPacks.find(r => r.id === vrSelectedRun)) {
    html += '<div class="panel" style="margin-top:12px"><div class="empty">No run packs available</div></div>';
  } else {
    const activeRun = allPacks.find(r => r.id === vrSelectedRun);
    const isBaseline = activeRun.mode === "baseline";
    const data = await fetchJson("/api/visual-runs/detail?id=" + encodeURIComponent(vrSelectedRun));
    const entries = (data && data.entries) || [];
    const comparisons = (data && data.comparisons) || [];
    const screenshots = (data && data.screenshots) || [];
    const runPackLogs = (data && data.runPackLogs) || { logs: [], observations: [] };

    // Auto-select first entry
    if (!vrSelectedEntry && entries.length > 0) vrSelectedEntry = entries[0].visual_tc_id;

    html += '<div class="split-view" style="margin-top:0">';

    // LEFT — entry list
    html += '<div class="split-left">';
    if (entries.length === 0) {
      html += '<div class="empty" style="padding:16px">No test entries in this run pack</div>';
    }
    for (const entry of entries) {
      const isSel = vrSelectedEntry === entry.visual_tc_id;
      const entryComps = comparisons.filter(c => c.visual_tc_id === entry.visual_tc_id);
      const entryFailed = entryComps.filter(c => !c.passed).length;
      const statusColor = entry.status === "passed" ? "var(--green)" : entry.status === "failed" ? "var(--red)" : "var(--dim)";
      const statusLabel = entry.status === "claimed" ? "RUNNING" : (entry.status || "pending").toUpperCase();
      html += \`<div onclick="vrSelectedEntry='\${esc(entry.visual_tc_id)}';renderVisualRunsPage()"
        class="tc-item \${isSel ? 'selected' : ''}" style="cursor:pointer">
        <div style="display:flex;align-items:center;gap:4px">
          <span class="tc-status-dot \${entry.status || 'pending'}"></span>
          <span style="font-size:8px;font-weight:700;color:\${statusColor};margin-right:2px">\${statusLabel}</span>
          \${entryFailed > 0 ? \`<span style="font-size:8px;padding:1px 4px;border-radius:2px;background:rgba(248,113,113,0.15);color:var(--red);font-weight:600">\${entryFailed} fail</span>\` : ""}
        </div>
        <div style="font-size:11px;margin-top:2px;padding-left:16px">\${esc(entry.tc_title || entry.visual_tc_id)}</div>
        \${entry.tc_viewport ? \`<div style="font-size:9px;color:var(--dim);padding-left:16px;margin-top:1px">\${esc(entry.tc_viewport)}</div>\` : ""}
      </div>\`;
    }
    html += '</div>';

    // RIGHT — detail for selected entry
    html += '<div class="split-right panel">';
    const selEntry = vrSelectedEntry ? entries.find(e => e.visual_tc_id === vrSelectedEntry) : null;
    if (!selEntry) {
      html += '<div class="empty">Select a test entry to view details</div>';
    } else {
      const entryComps = comparisons.filter(c => c.visual_tc_id === selEntry.visual_tc_id);
      const entryScreenshots = screenshots.filter(s => s.visual_tc_id === selEntry.visual_tc_id);
      const statusIcon = selEntry.status === "passed" ? '<i class="ph ph-check-circle" style="color:var(--green)"></i>'
        : selEntry.status === "failed" ? '<i class="ph ph-x-circle" style="color:var(--red)"></i>'
        : '<i class="ph ph-clock" style="color:var(--dim)"></i>';

      html += \`<div style="margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:8px;font-size:14px;font-weight:600">\${statusIcon} \${esc(selEntry.tc_title || selEntry.visual_tc_id)}</div>
        \${selEntry.tc_viewport ? \`<div style="font-size:11px;color:var(--dim);margin-top:4px"><i class="ph ph-monitor" style="margin-right:4px"></i>\${esc(selEntry.tc_viewport)}</div>\` : ""}
      </div>\`;

      html += renderVrEntryContent(selEntry, entryComps, entryScreenshots, isBaseline, runPackLogs);

      if (selEntry.notes) {
        html += \`<div style="margin-top:12px;padding:10px;background:var(--surface);border-radius:6px;font-size:12px;color:var(--dim)">\${esc(selEntry.notes)}</div>\`;
      }
    }
    html += '</div>';
    html += '</div>';
  }

  setPage(html);
}

// Global storage for visual run tabs
window.vrActiveTab = {};
window.vrTabData = {};

function switchVrTab(entryId, tabName) {
  window.vrActiveTab[entryId] = tabName;
  const data = window.vrTabData[entryId];
  if (!data) return;
  const html = renderVrTab(tabName, data.selEntry, data.entryComps, data.entryScreenshots, data.isBaseline, data.runPackLogs);
  document.getElementById(\`vr-entry-\${entryId}-content\`).innerHTML = html;

  // Update tab styles
  const tabs = document.querySelectorAll(\`[data-vr-entry="\${entryId}"].tab\`);
  tabs.forEach(t => {
    if (t.getAttribute('data-tab') === tabName) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });
}

function renderVrEntryContent(selEntry, entryComps, entryScreenshots, isBaseline, runPackLogs) {
  let out = "";
  let result = {};
  try {
    result = selEntry.result_json ? JSON.parse(selEntry.result_json) : {};
  } catch (e) {
    result = {};
  }

  // Determine which tabs to show
  const tabs = [];
  if (entryComps.length > 0 || entryScreenshots.length > 0) tabs.push({ id: 'screenshots', label: 'Screenshots' });
  if (result.tc || result.type) tabs.push({ id: 'steps', label: 'Steps' });
  if (result.logs || result.observations || (runPackLogs && (runPackLogs.logs.length > 0 || runPackLogs.observations.length > 0))) tabs.push({ id: 'logs', label: 'Logs' });
  if (result.console_errors || result.console_logs) tabs.push({ id: 'console', label: 'Console' });
  if (selEntry.trace_path) tabs.push({ id: 'trace', label: 'Trace' });
  if (selEntry.profile_path) tabs.push({ id: 'profiler', label: 'Profiler' });

  if (tabs.length === 0) {
    return '<div style="color:var(--dim);font-size:12px">No data captured for this run</div>';
  }

  // Store data for tab switching
  window.vrTabData[selEntry.id] = { selEntry, entryComps, entryScreenshots, isBaseline, runPackLogs };
  const activeTab = window.vrActiveTab[selEntry.id] || tabs[0].id;

  // Render tabs
  out += '<div class="tabs">';
  for (const tab of tabs) {
    const isActive = tab.id === activeTab;
    out += \`<div class="tab \${isActive ? 'active' : ''}" data-vr-entry="\${selEntry.id}" data-tab="\${tab.id}" onclick="switchVrTab('\${selEntry.id}','\${tab.id}')" style="cursor:pointer">\${tab.label}</div>\`;
  }
  out += '</div>';

  // Tab content
  out += \`<div id="vr-entry-\${selEntry.id}-content">\`;
  out += renderVrTab(activeTab, selEntry, entryComps, entryScreenshots, isBaseline, runPackLogs);
  out += '</div>';

  return out;
}

function renderVrTab(tab, selEntry, entryComps, entryScreenshots, isBaseline, runPackLogs) {
  let out = "";
  let result = {};
  try {
    result = selEntry.result_json ? JSON.parse(selEntry.result_json) : {};
  } catch (e) {
    result = {};
  }

  if (tab === 'screenshots') {
    if (isBaseline) {
      if (entryScreenshots.length > 0) {
        const testSteps = parseTestSteps(selEntry.tc_steps_json);
        out += '<div style="display:flex;flex-direction:column;gap:16px">';
        for (const ss of entryScreenshots) {
          const imgSrc = "/api/artifact?path=" + encodeURIComponent(ss.file_path);
          const stepIndex = ss.step_index !== undefined ? ss.step_index : 0;
          const step = getStepByIndex(testSteps, stepIndex);
          const stepNum = stepIndex + 1;
          const stepLabel = step?.label || step?.description || ss.step_label || \`Step \${stepNum}\`;
          const stepDesc = step?.description ? \`<div style="font-size:11px;color:var(--dim);margin-top:4px;font-style:italic">\${esc(step.description)}</div>\` : '';
          out += \`<div style="padding:12px;border:1px solid var(--border);border-radius:6px;background:var(--surface)">
            <div style="margin-bottom:10px">
              <div style="font-size:12px;font-weight:600;color:var(--text)"><i class="ph ph-image" style="margin-right:4px"></i>Step \${stepNum}: \${esc(stepLabel)}</div>
              \${stepDesc}
              <div style="font-size:10px;color:var(--dim);margin-top:4px;display:flex;gap:12px">
                <span><i class="ph ph-monitor" style="margin-right:2px"></i>\${esc(ss.viewport || 'unknown')}</span>
                \${step?.action ? \`<span><i class="ph ph-cursor-click" style="margin-right:2px"></i>\${esc(step.action)}</span>\` : ''}
              </div>
            </div>
            <div style="text-align:center;background:var(--bg);padding:8px;border-radius:4px">
              <img src="\${imgSrc}" style="max-width:100%;max-height:400px;border-radius:4px;border:1px solid var(--border);cursor:pointer" onclick="openLightbox(['\${imgSrc.replace(/'/g, "\\\\'")}'], 0)" />
            </div>
          </div>\`;
        }
        out += '</div>';
      } else {
        out += '<div style="color:var(--dim);font-size:12px;padding:20px;text-align:center">No screenshots captured</div>';
      }
    } else {
      if (entryComps.length > 0) {
        for (const comp of entryComps) {
          const baselineSrc = "/api/artifact?path=" + encodeURIComponent(comp.baseline_path);
          const currentSrc = "/api/artifact?path=" + encodeURIComponent(comp.current_path);
          const diffSrc = comp.diff_path ? "/api/artifact?path=" + encodeURIComponent(comp.diff_path) : null;
          const passedComp = !!comp.passed;
          const score = comp.diff_score != null ? (comp.diff_score * 100).toFixed(2) + "%" : "-";
          out += \`<div style="margin-bottom:14px;padding:12px;border:1px solid \${passedComp ? "var(--green)" : "var(--red)"};border-radius:6px;background:\${passedComp ? "rgba(52,211,153,.04)" : "rgba(248,113,113,.04)"}">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <span style="font-size:12px;font-weight:600">\${esc(comp.step_label || "Step " + comp.step_index)}</span>
              <span style="font-size:10px;padding:2px 8px;border-radius:10px;color:#fff;background:\${passedComp ? "var(--green)" : "var(--red)"}">\${passedComp ? "PASS" : "FAIL"} · \${score}</span>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <div style="flex:1;min-width:160px;text-align:center">
                <div style="font-size:10px;color:var(--dim);margin-bottom:4px">Baseline</div>
                <img src="\${baselineSrc}" style="max-width:100%;max-height:260px;border-radius:6px;border:1px solid var(--border);cursor:pointer" onclick="openLightbox(['\${baselineSrc.replace(/'/g, "\\\\'")}'], 0)" />
              </div>
              <div style="flex:1;min-width:160px;text-align:center">
                <div style="font-size:10px;color:var(--dim);margin-bottom:4px">Current</div>
                <img src="\${currentSrc}" style="max-width:100%;max-height:260px;border-radius:6px;border:1px solid var(--border);cursor:pointer" onclick="openLightbox(['\${currentSrc.replace(/'/g, "\\\\'")}'], 0)" />
              </div>
              \${diffSrc ? \`<div style="flex:1;min-width:160px;text-align:center">
                <div style="font-size:10px;color:var(--dim);margin-bottom:4px">Diff</div>
                <img src="\${diffSrc}" style="max-width:100%;max-height:260px;border-radius:6px;border:1px solid var(--border);cursor:pointer" onclick="openLightbox(['\${diffSrc.replace(/'/g, "\\\\'")}'], 0)" />
              </div>\` : ""}
            </div>
          </div>\`;
        }
      } else if (entryScreenshots.length > 0) {
        const testSteps = parseTestSteps(selEntry.tc_steps_json);
        out += '<div style="display:flex;flex-direction:column;gap:16px">';
        for (const ss of entryScreenshots) {
          const imgSrc = "/api/artifact?path=" + encodeURIComponent(ss.file_path);
          const stepIndex = ss.step_index !== undefined ? ss.step_index : 0;
          const step = getStepByIndex(testSteps, stepIndex);
          const stepNum = stepIndex + 1;
          const stepLabel = step?.label || step?.description || ss.step_label || \`Step \${stepNum}\`;
          const stepDesc = step?.description ? \`<div style="font-size:11px;color:var(--dim);margin-top:4px;font-style:italic">\${esc(step.description)}</div>\` : '';
          out += \`<div style="padding:12px;border:1px solid var(--border);border-radius:6px;background:var(--surface)">
            <div style="margin-bottom:10px">
              <div style="font-size:12px;font-weight:600;color:var(--text)"><i class="ph ph-image" style="margin-right:4px"></i>Step \${stepNum}: \${esc(stepLabel)}</div>
              \${stepDesc}
              <div style="font-size:10px;color:var(--dim);margin-top:4px;display:flex;gap:12px">
                <span><i class="ph ph-monitor" style="margin-right:2px"></i>\${esc(ss.viewport || 'unknown')}</span>
                \${step?.action ? \`<span><i class="ph ph-cursor-click" style="margin-right:2px"></i>\${esc(step.action)}</span>\` : ''}
              </div>
            </div>
            <div style="text-align:center;background:var(--bg);padding:8px;border-radius:4px">
              <img src="\${imgSrc}" style="max-width:100%;max-height:400px;border-radius:4px;border:1px solid var(--border);cursor:pointer" onclick="openLightbox(['\${imgSrc.replace(/'/g, "\\\\'")}'], 0)" />
            </div>
          </div>\`;
        }
        out += '</div>';
      } else {
        out += '<div style="color:var(--dim);font-size:12px;padding:20px;text-align:center">No comparisons or screenshots</div>';
      }
    }
  } else if (tab === 'steps') {
    out += '<div style="display:flex;flex-direction:column;gap:16px">';

    // Test case metadata header
    out += '<div style="padding:14px;background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(139,92,246,0.1));border:1px solid var(--border);border-radius:8px">';
    out += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';
    if (result.tc) {
      out += \`<div><span style="font-weight:700;color:var(--text);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Test Case</span><div style="font-size:12px;color:var(--text);margin-top:2px;font-weight:500">\${esc(result.tc)}</div></div>\`;
    }
    if (result.type) {
      out += \`<div><span style="font-weight:700;color:var(--text);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Type</span><div style="font-size:12px;color:var(--text);margin-top:2px;font-weight:500">\${esc(result.type)}</div></div>\`;
    }
    if (result.format) {
      out += \`<div><span style="font-weight:700;color:var(--text);font-size:11px;text-transform:uppercase;letter-spacing:0.5px">Format</span><div style="font-size:12px;color:var(--text);margin-top:2px;font-weight:500">\${esc(result.format)}</div></div>\`;
    }
    if (result.success !== undefined) {
      const statusColor = result.success ? 'var(--green)' : 'var(--red)';
      const statusText = result.success ? 'PASSED' : 'FAILED';
      const statusIcon = result.success ? '<i class="ph ph-check-circle" style="margin-right:4px"></i>' : '<i class="ph ph-x-circle" style="margin-right:4px"></i>';
      out += \`<div style="display:flex;align-items:center"><span style="font-weight:700;color:var(--text);font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:\${statusColor}">\${statusIcon}\${statusText}</span></div>\`;
    }
    out += '</div></div>';

    // Test steps
    let stepsJson = [];
    if (selEntry.tc_steps_json) {
      try {
        stepsJson = JSON.parse(typeof selEntry.tc_steps_json === 'string' ? selEntry.tc_steps_json : JSON.stringify(selEntry.tc_steps_json));
      } catch (e) {}
    }

    if (stepsJson && Array.isArray(stepsJson) && stepsJson.length > 0) {
      out += '<div>';
      out += '<div style="font-weight:700;color:var(--text);margin-bottom:12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Execution Steps</div>';
      for (let i = 0; i < stepsJson.length; i++) {
        const step = stepsJson[i];
        const stepNum = i + 1;
        const action = step.action || 'unknown';
        const label = step.label || step.description || '';
        const description = step.description || '';
        const hasDiff = step.diffType === 'screenshot' || step.diffType === 'snapshot';

        const actionIcons = {
          'login': '<i class="ph ph-sign-in"></i>',
          'navigate': '<i class="ph ph-map-pin"></i>',
          'click': '<i class="ph ph-cursor-click"></i>',
          'fill': '<i class="ph ph-pencil"></i>',
          'type': '<i class="ph ph-keyboard"></i>',
          'screenshot': '<i class="ph ph-camera"></i>',
          'snapshot': '<i class="ph ph-frame"></i>'
        };
        const actionIcon = actionIcons[action] || '<i class="ph ph-gear"></i>';
        const stepColor = hasDiff ? 'rgba(59,130,246,0.15)' : 'rgba(107,114,128,0.08)';
        const borderColor = hasDiff ? 'rgba(59,130,246,0.3)' : 'var(--border)';

        out += \`<div style="padding:14px;border:1px solid \${borderColor};background:\${stepColor};border-radius:8px;margin-bottom:10px">\`;

        // Step header
        out += \`<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:10px">\`;
        out += \`<div style="min-width:32px;width:32px;height:32px;border-radius:50%;background:\${hasDiff ? 'var(--accent)' : 'var(--border)'};color:\${hasDiff ? 'var(--bg)' : 'var(--text)'};display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">\${stepNum}</div>\`;
        out += \`<div style="flex:1">\`;
        out += \`<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">\`;
        out += \`<span style="color:var(--text);font-weight:600;font-size:13px">\${esc(label || action)}</span>\`;
        out += \`<span style="color:var(--dim);font-size:10px;background:var(--surface);padding:2px 6px;border-radius:3px;display:inline-flex;align-items:center;gap:3px">\${actionIcon} \${esc(action)}</span>\`;
        if (hasDiff) out += \`<span style="color:var(--accent);font-size:9px;background:rgba(59,130,246,0.2);padding:2px 6px;border-radius:3px;font-weight:600">CAPTURES</span>\`;
        out += \`</div>\`;
        if (description) {
          out += \`<div style="font-size:11px;color:var(--dim);line-height:1.4;margin-top:4px">\${esc(description)}</div>\`;
        }
        out += \`</div></div>\`;

        // Step details
        if (step.waitMs || step.timeout) {
          out += \`<div style="font-size:10px;color:var(--dim);padding:8px;background:var(--bg);border-radius:4px;margin-bottom:8px;display:flex;gap:12px">\`;
          if (step.waitMs) out += \`<span><i class="ph ph-timer" style="margin-right:2px"></i>Wait \${step.waitMs}ms</span>\`;
          if (step.timeout) out += \`<span><i class="ph ph-hourglass" style="margin-right:2px"></i>Timeout \${step.timeout}ms</span>\`;
          out += \`</div>\`;
        }

        out += \`</div>\`;
      }
      out += '</div>';
    } else {
      out += '<div style="color:var(--dim);font-size:12px;padding:24px;text-align:center;background:var(--surface);border:1px dashed var(--border);border-radius:8px"><i class="ph ph-info" style="font-size:20px;margin-bottom:8px;display:block;opacity:0.5"></i>No step details available</div>';
    }

    // Display logs and observations from result_json or runpack
    const allObservations = [];
    const allLogs = [];

    // Gather from result.observations
    if (result.observations && Array.isArray(result.observations)) {
      allObservations.push(...result.observations);
    }
    // Gather from result.logs
    if (result.logs && Array.isArray(result.logs)) {
      allLogs.push(...result.logs);
    }
    // Fallback to runpack if available
    if (runPackLogs) {
      if (runPackLogs.observations.length > 0 && allObservations.length === 0) {
        allObservations.push(...runPackLogs.observations);
      }
      if (runPackLogs.logs.length > 0 && allLogs.length === 0) {
        allLogs.push(...runPackLogs.logs);
      }
    }

    if (allObservations.length > 0 || allLogs.length > 0) {
      out += '<div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">';
      out += '<div style="font-weight:700;color:var(--text);margin-bottom:12px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px">Collected Logs & Observations</div>';

      if (allObservations.length > 0) {
        out += '<div style="margin-bottom:12px">';
        out += '<div style="font-size:11px;font-weight:600;color:var(--accent);margin-bottom:6px"><i class="ph ph-eye" style="margin-right:4px"></i>Observations</div>';
        out += '<div style="display:flex;flex-direction:column;gap:6px">';
        for (const obs of allObservations) {
          out += \`<div style="padding:8px 10px;background:rgba(59,130,246,0.08);border-left:3px solid var(--accent);border-radius:4px;font-size:11px;color:var(--text);line-height:1.4">\${esc(obs)}</div>\`;
        }
        out += '</div></div>';
      }

      if (allLogs.length > 0) {
        out += '<div>';
        out += '<div style="font-size:11px;font-weight:600;color:var(--green);margin-bottom:6px"><i class="ph ph-list" style="margin-right:4px"></i>Logs</div>';
        out += '<div style="display:flex;flex-direction:column;gap:4px;max-height:300px;overflow-y:auto">';
        for (const log of allLogs) {
          out += \`<div style="padding:6px 8px;background:var(--surface);border-left:3px solid var(--green);border-radius:3px;font-size:10px;color:var(--dim);font-family:var(--font-mono);line-height:1.3">\${esc(log)}</div>\`;
        }
        out += '</div></div>';
      }

      out += '</div>';
    }

    out += '</div>';
  } else if (tab === 'logs') {
    if ((result.observations && result.observations.length > 0) || (result.logs && (typeof result.logs === 'string' ? result.logs.length > 0 : true))) {
      out += '<div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto">';
      if (result.observations && Array.isArray(result.observations) && result.observations.length > 0) {
        for (const obs of result.observations) {
          out += \`<div style="padding:8px 10px;background:var(--surface);border-left:3px solid var(--accent);border-radius:4px;font-size:12px;color:var(--text);line-height:1.4">\${esc(obs)}</div>\`;
        }
      }
      if (result.logs) {
        const logsText = typeof result.logs === 'string' ? result.logs : JSON.stringify(result.logs, null, 2);
        const lines = logsText.split('\\n').slice(0, 50);
        out += \`<div style="padding:10px;background:var(--surface);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--dim);line-height:1.5;white-space:pre-wrap;word-break:break-word">\${esc(lines.join('\\n'))}\${logsText.split('\\n').length > 50 ? '\\n...' : ''}</div>\`;
      }
      out += '</div>';
    } else {
      out += '<div style="color:var(--dim);font-size:12px;padding:20px;text-align:center">No logs captured</div>';
    }
  } else if (tab === 'console') {
    const consoleLogs = (result.console && Array.isArray(result.console)) ? result.console : [];
    const consoleErrors = (result.console_errors && Array.isArray(result.console_errors)) ? result.console_errors : [];

    if (consoleLogs.length > 0 || consoleErrors.length > 0) {
      out += '<div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto">';
      if (consoleErrors.length > 0) {
        for (const err of consoleErrors) {
          const errText = typeof err === 'string' ? err : JSON.stringify(err);
          out += \`<div style="padding:8px 10px;background:rgba(238,0,0,0.08);border-left:3px solid var(--red);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--red);word-break:break-word;line-height:1.4">\${esc(errText)}</div>\`;
        }
      }
      if (consoleLogs.length > 0) {
        for (const log of consoleLogs) {
          const logText = typeof log === 'string' ? log : JSON.stringify(log);
          out += \`<div style="padding:8px 10px;background:var(--surface);border-radius:4px;font-family:var(--font-mono);font-size:11px;color:var(--dim);word-break:break-word;line-height:1.4">\${esc(logText)}</div>\`;
        }
      }
      out += '</div>';
    } else {
      out += '<div style="color:var(--dim);font-size:12px;padding:20px;text-align:center">No console data captured</div>';
    }
  } else if (tab === 'trace') {
    if (selEntry.trace_path) {
      const fileName = selEntry.trace_path.split('/').pop();
      const tracePath = encodeURIComponent(selEntry.trace_path);
      const downloadUrl = "/api/artifact?path=" + tracePath;
      out += \`<div style="padding:12px;background:var(--surface);border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <i class="ph ph-file-zip" style="font-size:18px;color:var(--accent)"></i>
          <div>
            <div style="font-weight:600;color:var(--text);">\${esc(fileName)}</div>
            <div style="font-size:11px;color:var(--dim);margin-top:2px">Playwright trace</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="window.open('https://trace.playwright.dev/', '_blank')" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--accent);color:var(--bg);border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600"><i class="ph ph-play-circle" style="font-size:14px"></i>View in Viewer</button>
          <a href="\${downloadUrl}" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--border);color:var(--text);border-radius:4px;text-decoration:none;font-size:11px;font-weight:600" download><i class="ph ph-download" style="font-size:14px"></i>Download</a>
        </div>
        <div style="font-size:10px;color:var(--dim);margin-top:8px">Tip: Click "View in Viewer" and drag-drop the downloaded file</div>
      </div>\`;
    } else {
      out += '<div style="color:var(--dim);font-size:12px;padding:20px;text-align:center">No trace captured</div>';
    }
  } else if (tab === 'profiler') {
    if (selEntry.profile_path) {
      const fileName = selEntry.profile_path.split('/').pop();
      const profilePath = encodeURIComponent(selEntry.profile_path);
      const downloadUrl = "/api/artifact?path=" + profilePath;
      out += \`<div style="padding:12px;background:var(--surface);border-radius:6px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
          <i class="ph ph-chart-line" style="font-size:18px;color:var(--accent)"></i>
          <div>
            <div style="font-weight:600;color:var(--text);">\${esc(fileName)}</div>
            <div style="font-size:11px;color:var(--dim);margin-top:2px">Chrome DevTools profile</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button onclick="window.open('https://ui.perfetto.dev/', '_blank')" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--accent);color:var(--bg);border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600"><i class="ph ph-play-circle" style="font-size:14px"></i>View in Perfetto</button>
          <a href="\${downloadUrl}" style="display:inline-flex;align-items:center;gap:6px;padding:8px 12px;background:var(--border);color:var(--text);border-radius:4px;text-decoration:none;font-size:11px;font-weight:600" download><i class="ph ph-download" style="font-size:14px"></i>Download</a>
        </div>
        <div style="font-size:10px;color:var(--dim);margin-top:8px">Tip: Click "View in Perfetto" and drag-drop the downloaded file</div>
      </div>\`;
    } else {
      out += '<div style="color:var(--dim);font-size:12px;padding:20px;text-align:center">No profile captured</div>';
    }
  }

  return out;
}

// ── Scheduler Page ──

let schedulerSelectedAgentId = "";

function selectSchedulerAgent(id) {
  schedulerSelectedAgentId = id;
  savePageState();
  renderSchedulerPage();
}

function triggerScheduler(id) {
  triggerScheduledAgent(id);
}

function toggleScheduler(id, status) {
  toggleScheduledAgent(id, status);
}

function deleteScheduler(id) {
  deleteScheduledAgent(id);
}

function showLogs(content) {
  alert(content);
}

async function renderSchedulerPage() {
  const app = document.getElementById("app");

  const agents = await fetchJson("/api/scheduled-agents");

  let html = "";

  // Stats
  html += '<div class="panel" style="margin-bottom:8px">';
  const activeCount = agents.filter(a => a.status === "active").length;
  const pausedCount = agents.filter(a => a.status === "paused").length;
  const totalCount = agents.length;
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap">';
  html += '<div class="stat"><div class="stat-value">' + totalCount + '</div><div class="stat-label">Scheduled</div></div>';
  html += '<div class="stat"><div class="stat-value" style="color:var(--green)">' + activeCount + '</div><div class="stat-label">Active</div></div>';
  html += '<div class="stat"><div class="stat-value" style="color:var(--yellow)">' + pausedCount + '</div><div class="stat-label">Paused</div></div>';
  html += '</div></div>';

  // Split view: agents list on left, detail/create on right
  html += '<div class="split-view wide-left" style="margin-top:8px">';

  // LEFT: Agents list
  html += '<div class="split-left panel">';

  if (agents.length === 0) {
    html += '<div class="empty" style="padding:20px;text-align:center">No scheduled agents yet.</div>';
  } else {
    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<tbody>';
    for (const agent of agents) {
      const statusColor = agent.status === "active" ? "var(--green)" : agent.status === "paused" ? "var(--yellow)" : "var(--red)";
      const agentName = agent.agent_path.split("/").pop() || agent.agent_path;
      const agentId = esc(agent.id);
      const isSelected = agent.id === schedulerSelectedAgentId;
      html += '<tr style="border-bottom:1px solid var(--border-light);background:' + (isSelected ? 'var(--surface-raised)' : 'transparent') + '">';
      html += '<td style="padding:10px 8px;cursor:pointer" onclick="window.selectSchedulerAgent(' + JSON.stringify(agentId).replace(/"/g, '&quot;') + ')">';
      html += '<div style="font-family:var(--font-mono);font-size:11px;color:var(--accent)">' + esc(agentName) + '</div>';
      html += '<div style="font-size:10px;color:var(--dim);margin-top:2px">' + esc(agent.ticket_id) + '</div>';
      html += '<div style="font-size:10px;color:' + statusColor + ';font-weight:500;margin-top:2px;text-transform:uppercase">' + agent.status + '</div>';
      html += '</td></tr>';
    }
    html += '</tbody></table>';
    html += '</div>';
  }
  html += '</div>';

  // RIGHT: Detail or create form
  html += '<div class="split-right panel" style="overflow-y:auto">';
  if (agents.length === 0 || !schedulerSelectedAgentId) {
    html += renderSchedulerCreateForm();
  } else {
    html += await renderSchedulerAgentDetail(schedulerSelectedAgentId);
  }
  html += '</div>';

  html += '</div>';

  setPage(html);
}

function renderSchedulerAgentsList(agents) {
  let html = '<div class="panel"><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  html += '<thead><tr style="border-bottom:1px solid var(--border)">';
  html += '<th style="text-align:left;padding:8px;font-weight:600;color:var(--dim)">Agent</th>';
  html += '<th style="text-align:left;padding:8px;font-weight:600;color:var(--dim)">Ticket</th>';
  html += '<th style="text-align:left;padding:8px;font-weight:600;color:var(--dim)">Schedule</th>';
  html += '<th style="text-align:left;padding:8px;font-weight:600;color:var(--dim)">Status</th>';
  html += '<th style="text-align:left;padding:8px;font-weight:600;color:var(--dim)">Last Run</th>';
  html += '<th style="text-align:right;padding:8px;font-weight:600;color:var(--dim)">Actions</th>';
  html += '</tr></thead><tbody>';

  for (const agent of agents) {
    const statusColor = agent.status === "active" ? "var(--green)" : agent.status === "paused" ? "var(--yellow)" : "var(--red)";
    const lastRun = agent.last_run_at ? new Date(agent.last_run_at).toLocaleString() : "Never";
    const agentName = agent.agent_path.split("/").pop() || agent.agent_path;
    const agentId = esc(agent.id);
    const status = agent.status;

    html += '<tr style="border-bottom:1px solid var(--border-light)" data-agent-id="' + agentId + '" data-agent-status="' + status + '">';
    html += '<td style="padding:10px 8px"><span style="color:var(--accent);font-family:var(--font-mono);font-size:11px;cursor:pointer" onclick="window.selectSchedulerAgent(' + JSON.stringify(agentId).replace(/"/g, '&quot;') + ')">' + esc(agentName) + '</span></td>';
    html += '<td style="padding:10px 8px">' + esc(agent.ticket_id) + '</td>';
    html += '<td style="padding:10px 8px;font-family:var(--font-mono);font-size:11px">' + esc(agent.cron_expression) + '</td>';
    html += '<td style="padding:10px 8px"><span style="color:' + statusColor + ';font-weight:500">' + status + '</span></td>';
    html += '<td style="padding:10px 8px;color:var(--dim);font-size:11px">' + lastRun + '</td>';
    html += '<td style="padding:10px 8px;text-align:right">';
    html += '<button onclick="window.triggerScheduler(' + JSON.stringify(agentId).replace(/"/g, '&quot;') + ')" style="font-size:10px;padding:4px 8px;margin:0 2px;background:var(--accent);color:var(--bg);border:none;border-radius:3px;cursor:pointer">Run</button>';
    html += '<button onclick="window.toggleScheduler(' + JSON.stringify(agentId).replace(/"/g, '&quot;') + ',' + JSON.stringify(status).replace(/"/g, '&quot;') + ')" style="font-size:10px;padding:4px 8px;margin:0 2px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:3px;cursor:pointer">' + (status === "active" ? "Pause" : "Resume") + '</button>';
    html += '<button onclick="window.deleteScheduler(' + JSON.stringify(agentId).replace(/"/g, '&quot;') + ')" style="font-size:10px;padding:4px 8px;margin:0 2px;background:var(--red-dim);color:var(--red);border:none;border-radius:3px;cursor:pointer">Delete</button>';
    html += '</td></tr>';
  }

  html += '</tbody></table></div></div>';
  return html;
}

async function renderSchedulerAgentDetail(agentId) {
  const agent = await fetchJson("/api/scheduled-agents/" + agentId);
  const history = await fetchJson("/api/scheduled-agents/" + agentId + "/history");

  let html = '<div class="panel" style="margin-bottom:8px">';
  html += '<div class="breadcrumb">';
  html += '<span class="breadcrumb-item" onclick="window.selectSchedulerAgent(' + JSON.stringify("").replace(/"/g, '&quot;') + ')">Agents</span>';
  html += '<span class="breadcrumb-sep">|</span>';
  html += '<span class="breadcrumb-item current">' + esc(agent.agent_path.split("/").pop() || agent.agent_path) + '</span>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px">';
  html += '<div><div style="font-size:10px;color:var(--dim);text-transform:uppercase">Agent</div><div style="font-family:var(--font-mono);font-size:12px">' + esc(agent.agent_path) + '</div></div>';
  html += '<div><div style="font-size:10px;color:var(--dim);text-transform:uppercase">Ticket</div><div style="font-family:var(--font-mono);font-size:12px">' + esc(agent.ticket_id) + '</div></div>';
  html += '<div><div style="font-size:10px;color:var(--dim);text-transform:uppercase">Schedule</div><div style="font-family:var(--font-mono);font-size:12px">' + esc(agent.cron_expression) + '</div></div>';

  const statusColor = agent.status === "active" ? "var(--green)" : agent.status === "paused" ? "var(--yellow)" : "var(--red)";
  html += '<div><div style="font-size:10px;color:var(--dim);text-transform:uppercase">Status</div><div style="color:' + statusColor + ';font-weight:600;text-transform:uppercase;font-size:11px">' + agent.status + '</div></div>';

  const lastRun = agent.last_run_at ? new Date(agent.last_run_at).toLocaleString() : "Never";
  html += '<div><div style="font-size:10px;color:var(--dim);text-transform:uppercase">Last Run</div><div style="font-size:12px">' + lastRun + '</div></div>';
  html += '<div><div style="font-size:10px;color:var(--dim);text-transform:uppercase">Created</div><div style="font-size:12px">' + new Date(agent.created_at).toLocaleString() + '</div></div>';

  if (agent.description) {
    html += '<div style="grid-column:1/-1"><div style="font-size:10px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Description</div><div style="color:var(--text)">' + esc(agent.description) + '</div></div>';
  }

  if (agent.parameters && Object.keys(agent.parameters).length > 0) {
    html += '<div style="grid-column:1/-1"><div style="font-size:10px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Parameters</div>';
    html += '<div style="font-family:var(--font-mono);font-size:11px;background:var(--surface);padding:8px;border-radius:4px;white-space:pre-wrap;overflow-x:auto">' + esc(JSON.stringify(agent.parameters, null, 2)) + '</div></div>';
  }

  html += '</div>';

  const agentIdEsc = esc(agent.id);
  html += '<div style="display:flex;gap:8px;margin-top:12px" data-agent-id="' + agentIdEsc + '" data-agent-status="' + agent.status + '">';
  html += '<button onclick="window.triggerScheduler(' + JSON.stringify(agentIdEsc).replace(/"/g, '&quot;') + ')" style="flex:1;padding:8px 12px;background:var(--accent);color:var(--bg);border:none;border-radius:4px;cursor:pointer;font-weight:600">Run Now</button>';
  html += '<button onclick="window.toggleScheduler(' + JSON.stringify(agentIdEsc).replace(/"/g, '&quot;') + ',' + JSON.stringify(agent.status).replace(/"/g, '&quot;') + ')" style="flex:1;padding:8px 12px;background:var(--surface);color:var(--text);border:1px solid var(--border);border-radius:4px;cursor:pointer;font-weight:600">' + (agent.status === "active" ? "Pause" : "Resume") + '</button>';
  html += '<button onclick="window.deleteScheduler(' + JSON.stringify(agentIdEsc).replace(/"/g, '&quot;') + ')" style="flex:1;padding:8px 12px;background:var(--red-dim);color:var(--red);border:none;border-radius:4px;cursor:pointer;font-weight:600">Delete</button>';
  html += '</div>';
  html += '</div>';

  // Execution history
  html += '<div class="panel" style="margin-top:8px">';
  html += '<div class="panel-title" style="margin-bottom:8px">Execution History</div>';

  if (history.length === 0) {
    html += '<div class="empty" style="padding:20px;text-align:center">No executions yet</div>';
  } else {
    html += '<div style="overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr style="border-bottom:1px solid var(--border)">';
    html += '<th style="text-align:left;padding:6px;font-weight:600;color:var(--dim)">Executed</th>';
    html += '<th style="text-align:left;padding:6px;font-weight:600;color:var(--dim)">Duration</th>';
    html += '<th style="text-align:left;padding:6px;font-weight:600;color:var(--dim)">Status</th>';
    html += '<th style="text-align:left;padding:6px;font-weight:600;color:var(--dim)">Exit Code</th>';
    html += '<th style="text-align:left;padding:6px;font-weight:600;color:var(--dim)">Logs</th>';
    html += '</tr></thead>';
    html += '<tbody>';

    for (const exec of history.slice(0, 20)) {
      const startedAt = exec.started_at ? new Date(exec.started_at) : null;
      const completedAt = exec.completed_at ? new Date(exec.completed_at) : null;
      const duration = startedAt && completedAt ? Math.round((completedAt - startedAt) / 1000) + "s" : "—";
      const statusColor = exec.status === "success" ? "var(--green)" : exec.status === "failed" ? "var(--red)" : "var(--yellow)";
      const logContent = (exec.logs || "No logs").slice(0, 500);

      html += '<tr style="border-bottom:1px solid var(--border-light)">';
      html += '<td style="padding:6px">' + (startedAt ? startedAt.toLocaleString() : "—") + '</td>';
      html += '<td style="padding:6px">' + duration + '</td>';
      html += '<td style="padding:6px"><span style="color:' + statusColor + ';font-weight:500;text-transform:uppercase">' + exec.status + '</span></td>';
      html += '<td style="padding:6px;font-family:var(--font-mono)">' + (exec.exit_code !== undefined && exec.exit_code !== null ? exec.exit_code : "—") + '</td>';
      html += '<td style="padding:6px"><button onclick="window.showLogs(' + JSON.stringify(logContent).replace(/"/g, '&quot;') + ')" style="font-size:9px;padding:2px 6px;background:var(--surface);border:1px solid var(--border);border-radius:2px;cursor:pointer;color:var(--accent)">View</button></td>';
      html += '</tr>';
    }

    html += '</tbody></table>';
    html += '</div>';
  }
  html += '</div>';

  return html;
}

function renderSchedulerCreateForm() {
  let html = '<div class="panel">';
  html += '<div class="panel-title" style="margin-bottom:12px">Create Scheduled Agent</div>';
  html += '<form id="schedulerForm" style="display:flex;flex-direction:column;gap:12px">';

  html += '<div>';
  html += '<label style="display:block;font-size:11px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Template</label>';
  html += '<select id="scheduler-template" onchange="window.applySchedulerTemplate(this.value)" style="width:100%;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-sans);font-size:12px">';
  html += '<option value="">— Custom —</option>';
  html += '<option value="ticket-polling">Ticket Polling Agent</option>';
  html += '</select>';
  html += '</div>';

  html += '<div>';
  html += '<label style="display:block;font-size:11px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Agent Path</label>';
  html += '<input id="scheduler-agent-path" type="text" placeholder="e.g., noob-pool" style="width:100%;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-mono);font-size:12px" />';
  html += '</div>';

  html += '<div>';
  html += '<label style="display:block;font-size:11px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Ticket ID</label>';
  html += '<input id="scheduler-ticket-id" type="text" placeholder="e.g., SCRUM-1" style="width:100%;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-mono);font-size:12px" />';
  html += '</div>';

  html += '<div>';
  html += '<label style="display:block;font-size:11px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Cron Expression</label>';
  html += '<input id="scheduler-cron" type="text" placeholder="e.g., 0 9 * * 1-5" style="width:100%;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-mono);font-size:12px" />';
  html += '<div style="font-size:10px;color:var(--dim);margin-top:4px">Format: min(0-59) hour(0-23) day(1-31) month(1-12) dow(0-6)</div>';
  html += '</div>';

  html += '<div>';
  html += '<label style="display:block;font-size:11px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Description (optional)</label>';
  html += '<input id="scheduler-description" type="text" placeholder="e.g., Daily pool generation" style="width:100%;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-mono);font-size:12px" />';
  html += '</div>';

  html += '<div>';
  html += '<label style="display:block;font-size:11px;color:var(--dim);text-transform:uppercase;margin-bottom:4px">Parameters (JSON, optional)</label>';
  html += '<textarea id="scheduler-parameters" placeholder="{}" style="width:100%;height:100px;padding:8px;background:var(--surface);border:1px solid var(--border);border-radius:4px;color:var(--text);font-family:var(--font-mono);font-size:12px;resize:vertical"></textarea>';
  html += '</div>';

  html += '<button type="button" onclick="createScheduledAgent()" style="padding:10px 16px;background:var(--accent);color:var(--bg);border:none;border-radius:4px;cursor:pointer;font-weight:600">Create Agent</button>';

  html += '</form>';
  html += '</div>';
  return html;
}

async function triggerScheduledAgent(agentId) {
  const agent = await fetchJson("/api/scheduled-agents/" + agentId);
  if (!confirm('Run "' + agent.agent_path + '" now for ' + agent.ticket_id + '?')) return;

  try {
    const result = await postJson("/api/scheduled-agents/" + agentId + "/trigger", {});
    alert("Agent triggered! Execution ID: " + result.executionId);
    setTimeout(() => renderSchedulerPage(), 500);
  } catch (e) {
    alert("Error triggering agent: " + e.message);
  }
}

async function toggleScheduledAgent(agentId, currentStatus) {
  const newStatus = currentStatus === "active" ? "paused" : "active";
  const url = currentStatus === "active" ? "/api/scheduled-agents/" + agentId + "/pause" : "/api/scheduled-agents/" + agentId + "/resume";

  try {
    await postJson(url, {});
    renderSchedulerPage();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

async function deleteScheduledAgent(agentId) {
  const agent = await fetchJson("/api/scheduled-agents/" + agentId);
  if (!confirm('Delete "' + agent.agent_path + '" scheduled agent?')) return;

  try {
    await fetchApi("/api/scheduled-agents/" + agentId + "/delete", { method: "DELETE" });
    schedulerSelectedAgentId = "";
    renderSchedulerPage();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

function applySchedulerTemplate(templateId) {
  if (templateId === "ticket-polling") {
    document.getElementById("scheduler-agent-path").value = ".claude/agents/ticket-polling.md";
    document.getElementById("scheduler-description").value = "Poll tickets using filter";
    document.getElementById("scheduler-cron").value = "0 9 * * 1-5";
    document.getElementById("scheduler-parameters").value = JSON.stringify({
      filter_id: "",
      jql: ""
    }, null, 2);
  } else {
    document.getElementById("scheduler-agent-path").value = "";
    document.getElementById("scheduler-description").value = "";
    document.getElementById("scheduler-cron").value = "";
    document.getElementById("scheduler-parameters").value = "{}";
  }
}

async function createScheduledAgent() {
  const agentPath = document.getElementById("scheduler-agent-path").value.trim();
  const ticketId = document.getElementById("scheduler-ticket-id").value.trim();
  const cronExpr = document.getElementById("scheduler-cron").value.trim();
  const description = document.getElementById("scheduler-description").value.trim();
  const parametersStr = document.getElementById("scheduler-parameters").value.trim();

  if (!agentPath) { alert("Agent path required"); return; }
  if (!ticketId) { alert("Ticket ID required"); return; }
  if (!cronExpr) { alert("Cron expression required"); return; }

  let parameters = {};
  if (parametersStr) {
    try {
      parameters = JSON.parse(parametersStr);
    } catch (e) {
      alert("Invalid JSON in parameters: " + e.message);
      return;
    }
  }

  try {
    const result = await postJson("/api/scheduled-agents/create", {
      agent_path: agentPath,
      ticket_id: ticketId,
      cron_expression: cronExpr,
      description: description || undefined,
      parameters: Object.keys(parameters).length > 0 ? parameters : undefined,
      status: "active",
    });

    document.getElementById("schedulerForm").reset();
    schedulerSelectedAgentId = "";
    renderSchedulerPage();
  } catch (e) {
    alert("Error creating scheduled agent: " + e.message);
  }
}

</script>
</body>
</html>`;
}
