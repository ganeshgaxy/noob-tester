/**
 * Shared client-side helpers injected into the dashboard HTML as a <script> block.
 * These are vanilla JS functions used across all pages to avoid duplication.
 */
export function getDashboardHelpersScript(): string {
  return `
// ── Shared Helpers ──

function esc(s) {
  if (!s) return "";
  if (typeof s !== "string") s = String(s);
  return s.replace(/&/g,"&amp;").replace(new RegExp("<","g"),"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

// Replace /Users/<name> or /home/<name> prefix with ~ for display
function shortenPath(p) {
  if (!p) return p;
  return p.replace(/^\\/(?:Users|home)\\/[^\\/]+/, "~");
}

// Format plain-text LLM descriptions: escape HTML, bold known section headers, convert newlines to <br>
function formatDescription(s) {
  if (!s) return "";
  const escaped = esc(s);
  // Bold known RCA section headers (e.g. "Root Cause:", "Evidence:", "Failure Scenario:")
  const withHeaders = escaped.replace(
    /^([A-Z][A-Za-z &\\-]{2,40}:)(?=\\s|$)/gm,
    '<strong style="color:var(--accent)">$1</strong>'
  );
  // Convert newlines to <br> tags for proper line-break rendering
  return withHeaders.replace(/\\n/g, "<br>");
}

// Format pre-formatted text: convert escape sequences to actual newlines for pre tags
function formatPreText(s) {
  if (!s) return "";
  return String(s).split('\\\\n').join('\\n');
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

// ── Fetch wrapper ──

async function fetchApi(path, opts) {
  const res = await fetch(API + path, opts);
  return res;
}

async function fetchJson(path, opts) {
  const res = await fetchApi(path, opts);
  return res.json();
}

async function postJson(path, body) {
  return fetchJson(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Status color helpers ──

function statusColor(status) {
  switch (status) {
    case "passed": case "completed": case "resolved": case "active": case "working": return "var(--green)";
    case "failed": case "crashed": case "critical": case "broken": case "failing": return "var(--red)";
    case "claimed": case "running": case "stale": case "medium": case "changed": case "flaky": case "pending": return "var(--yellow)";
    case "high": return "var(--orange)";
    case "info": case "skipped": return "var(--purple)";
    default: return "var(--dim)";
  }
}

function severityColor(severity) {
  switch (severity) {
    case "critical": return "var(--red)";
    case "high": return "var(--orange)";
    case "medium": return "var(--yellow)";
    case "low": return "var(--dim)";
    case "info": return "var(--purple)";
    default: return "var(--dim)";
  }
}

function httpStatusColor(code) {
  if (code >= 200 && code < 300) return "var(--green)";
  if (code >= 400) return "var(--red)";
  return "var(--yellow)";
}

// ── HTML builder helpers ──

function sectionHeader(title) {
  return '<div class="section-header">' + esc(title) + '</div>';
}

function detailSection(title, content) {
  return '<div class="detail-section">' + sectionHeader(title) + content + '</div>';
}

function preBlock(text, maxHeight) {
  const mh = maxHeight ? 'max-height:' + maxHeight + 'px;' : '';
  return '<pre class="pre-block" style="' + mh + '">' + esc(text) + '</pre>';
}

function emptyState(msg) {
  return '<div class="empty">' + esc(msg) + '</div>';
}

function statBlock(value, label, color) {
  const colorAttr = color ? ' style="color:' + color + '"' : '';
  return '<div class="stat"><div class="stat-value"' + colorAttr + '>' + value + '</div><div class="stat-label">' + label + '</div></div>';
}

function statsRow(items) {
  let html = '<div class="stats-row">';
  for (const s of items) {
    html += statBlock(s.value, s.label, s.color);
  }
  html += '</div>';
  return html;
}

function breadcrumb(items) {
  let html = '<div class="breadcrumb">';
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (i > 0) html += '<span class="breadcrumb-sep">|</span>';
    if (item.onclick) {
      html += '<span class="breadcrumb-item" onclick="' + esc(item.onclick) + '">' + esc(item.label) + '</span>';
    } else {
      html += '<span class="breadcrumb-item current">' + esc(item.label) + '</span>';
    }
  }
  html += '</div>';
  return html;
}

function badge(text, color, bgAlpha) {
  const alpha = bgAlpha || 0.1;
  return '<span class="inline-badge" style="color:' + color + ';background:' + color.replace('var(', 'rgba(').replace(')', '') + ',' + alpha + ')">' + esc(text) + '</span>';
}

function actionBtn(label, onclick, color) {
  const c = color || "var(--accent)";
  return '<button class="action-btn" style="color:' + c + '" onclick="' + onclick + '" onmouseover="this.style.borderColor=\\'' + c + '\\'" onmouseout="this.style.borderColor=\\'var(--border)\\'">' + esc(label) + '</button>';
}

// ── JSON repair for truncated LLM output ──
function repairJson(raw) {
  const trimmed = raw.trim();
  try { JSON.parse(trimmed); return trimmed; } catch {}

  // Walk the JSON, fixing: trailing commas, mismatched ] vs }, unclosed strings/brackets
  function repair(s) {
    let result = "";
    let inStr = false, escaped = false;
    const stack = []; // tracks '{' or '[' for each open container

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (escaped) { escaped = false; result += ch; continue; }
      if (ch === "\\\\" && inStr) { escaped = true; result += ch; continue; }
      if (ch === '"') { inStr = !inStr; result += ch; continue; }
      if (inStr) { result += ch; continue; }

      if (ch === "{" || ch === "[") {
        stack.push(ch);
        result += ch;
      } else if (ch === "}" || ch === "]") {
        const expected = stack.length > 0 ? (stack[stack.length - 1] === "{" ? "}" : "]") : ch;
        if (ch !== expected) {
          result += expected; // fix mismatched closer
        } else {
          result += ch;
        }
        if (stack.length > 0) stack.pop();
      } else if (ch === ",") {
        // Strip trailing comma before } or ]
        let j = i + 1;
        while (j < s.length && " \\n\\r\\t".includes(s[j])) j++;
        if (s[j] === "}" || s[j] === "]") continue;
        result += ch;
      } else {
        result += ch;
      }
    }

    // Close unclosed string
    if (inStr) result += '"';
    // Close unclosed containers
    while (stack.length > 0) result += stack.pop() === "{" ? "}" : "]";
    return result;
  }

  const repaired = repair(trimmed);
  try { JSON.parse(repaired); return repaired; } catch { return trimmed; }
}

// ── Cost calculation ──
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
  if (s.estimated_cost_usd) return s.estimated_cost_usd;
  if (!s.model || !s.estimated_tokens) return 0;
  const p = lookupPricing(s.model);
  if (s.input_tokens || s.output_tokens || s.cache_read_tokens || s.cache_create_tokens) {
    return ((s.input_tokens || 0) / 1e6) * p.input
         + ((s.output_tokens || 0) / 1e6) * p.output
         + ((s.cache_read_tokens || 0) / 1e6) * p.cacheRead
         + ((s.cache_create_tokens || 0) / 1e6) * p.cacheCreate;
  }
  return (s.estimated_tokens / 1e6) * (p.input * 0.3 + p.output * 0.7);
}

function fmtCost(v) { return v > 0 ? "$" + v.toFixed(2) : "-"; }

function renderMd(s) {
  if (!s) return "";
  if (typeof marked !== "undefined" && marked.parse) return marked.parse(s);
  return '<pre style="white-space:pre-wrap">' + esc(s) + '</pre>';
}

function formatBytes(b) {
  if (!b) return "0 B";
  if (b < 1024) return b + " B";
  if (b < 1048576) return (b / 1024).toFixed(1) + " KB";
  return (b / 1048576).toFixed(1) + " MB";
}

/** Set #app content. Splits into fixed header (breadcrumb + stats) and scrollable content. */
function setPage(html) {
  const app = document.getElementById("app");
  app.style.display = "";
  app.style.flexDirection = "";
  app.style.overflow = "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  const children = Array.from(tmp.children);

  let fixedHtml = "";
  let preFixedHtml = "";
  let contentHtml = "";
  let fixedDone = false;

  for (const child of children) {
    if (!fixedDone) {
      const isBack = child.classList && child.classList.contains("detail-back");
      const isStatsPanel = child.classList && child.classList.contains("panel") && child.querySelector(".stat, .stat-value, .breadcrumb");
      if (isBack || isStatsPanel) {
        fixedHtml = preFixedHtml + child.outerHTML;
        fixedDone = true;
        continue;
      }
      preFixedHtml += child.outerHTML;
    } else {
      contentHtml += child.outerHTML;
    }
  }

  if (!fixedHtml && preFixedHtml) {
    contentHtml = preFixedHtml + contentHtml;
  }

  if (fixedHtml) {
    app.innerHTML = '<div class="page-fixed">' + fixedHtml + '</div><div class="page-content">' + contentHtml + '</div>';
  } else {
    app.innerHTML = '<div class="page-content">' + html + '</div>';
  }
}

// ── Lightbox ──

let _lbImages = [];
let _lbIndex = 0;

function openLightbox(images, index) {
  _lbImages = images;
  _lbIndex = index || 0;
  const lb = document.getElementById("lightbox-overlay");
  if (!lb) return;
  lb.style.display = "flex";
  _renderLightbox();
}

function closeLightbox() {
  const lb = document.getElementById("lightbox-overlay");
  if (lb) lb.style.display = "none";
}

function _renderLightbox() {
  const img = document.getElementById("lightbox-img");
  const counter = document.getElementById("lightbox-counter");
  const caption = document.getElementById("lightbox-caption");
  if (!img) return;
  const item = _lbImages[_lbIndex];
  img.src = item.url;
  if (counter) counter.textContent = (_lbIndex + 1) + " / " + _lbImages.length;
  if (caption) caption.textContent = item.label || "";
  // Hide/show arrows
  const prev = document.getElementById("lightbox-prev");
  const next = document.getElementById("lightbox-next");
  if (prev) prev.style.display = _lbImages.length > 1 ? "" : "none";
  if (next) next.style.display = _lbImages.length > 1 ? "" : "none";
}

function lbPrev() { _lbIndex = (_lbIndex - 1 + _lbImages.length) % _lbImages.length; _renderLightbox(); }
function lbNext() { _lbIndex = (_lbIndex + 1) % _lbImages.length; _renderLightbox(); }

// Keyboard nav
document.addEventListener("keydown", (e) => {
  const lb = document.getElementById("lightbox-overlay");
  if (!lb || lb.style.display === "none") return;
  if (e.key === "Escape") closeLightbox();
  if (e.key === "ArrowLeft") lbPrev();
  if (e.key === "ArrowRight") lbNext();
});

// ── Artifact URL helper ──

function artifactUrl(path) {
  return API + "/api/artifact?path=" + encodeURIComponent(path);
}

// ── Artifact type icons ──

const ARTIFACT_ICONS = {
  screenshot: "&#128247;",
  video: "&#127909;",
  console: "&#9002;",
  har: "&#8645;",
  trace: "&#9776;",
  snapshot: "&#128196;",
};

// ── Shared artifact renderers ──

/**
 * Render a gallery of screenshot thumbnails with lightbox support.
 * @param {Array} screenshots - [{path, label, step}]
 * @param {string} galleryId - unique id for lightbox grouping
 */
function renderScreenshotGallery(screenshots, galleryId) {
  if (!screenshots || screenshots.length === 0) return "";
  var gid = galleryId || "gal-" + Math.random().toString(36).slice(2, 8);
  // Build gallery data array for lightbox
  window.__galleries = window.__galleries || {};
  var galData = [];
  var validScreenshots = [];

  for (var i = 0; i < screenshots.length; i++) {
    var a = screenshots[i];
    var filePath = a.path || a.file_path;

    // Skip artifacts with undefined/invalid paths
    if (!filePath) continue;

    var url = artifactUrl(filePath);
    galData.push(url);
    validScreenshots.push(a);
  }

  // If no valid screenshots, return empty
  if (validScreenshots.length === 0) return "";

  window.__galleries[gid] = galData;

  var html = '<div class="artifact-gallery" id="' + gid + '">';
  for (var j = 0; j < validScreenshots.length; j++) {
    var sa = validScreenshots[j];
    var sFilePath = sa.path || sa.file_path;
    var sUrl = artifactUrl(sFilePath);
    var sLabel = esc(sa.label || (sFilePath ? sFilePath.split("/").pop() : "") || "Screenshot " + (j + 1));
    html += '<div class="artifact-thumb" onclick="openLightbox(window.__galleries[&quot;' + gid + '&quot;],' + j + ')">';
    html += '<img src="' + sUrl + '" loading="lazy" onerror="this.parentElement.classList.add(&quot;broken&quot;)" />';
    html += '<div class="artifact-thumb-label">' + sLabel + '</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}

/**
 * Render a video player card.
 */
function renderVideoCard(a) {
  var filePath = a.path || a.file_path;
  // Skip if no valid path
  if (!filePath) return "";
  var url = artifactUrl(filePath);
  var label = esc(a.label || (filePath ? filePath.split("/").pop() : "") || "Video");
  return '<div class="artifact-video">' +
    '<video src="' + url + '" controls preload="metadata"><a href="' + url + '" target="_blank">Download</a></video>' +
    '<div class="artifact-video-label"><span>' + ARTIFACT_ICONS.video + '</span> ' + label + '</div>' +
    '</div>';
}

/**
 * Render a file artifact chip (console, har, trace, snapshot).
 */
function renderFileChip(a, type) {
  var filePath = a.path || a.file_path;
  // Skip if no valid path
  if (!filePath) return "";
  var url = artifactUrl(filePath);
  var label = esc(a.label || (filePath ? filePath.split("/").pop() : "") || type);
  var icon = ARTIFACT_ICONS[type] || "&#128196;";
  return '<a href="' + url + '" target="_blank" class="artifact-chip" data-type="' + type + '">' +
    '<span class="artifact-chip-icon">' + icon + '</span>' +
    '<span class="artifact-chip-label">' + label + '</span>' +
    '<span class="artifact-chip-action">&#8599;</span>' +
    '</a>';
}

/**
 * Render all artifacts grouped by type.
 * @param {Array} artifacts - [{type, path, label, step, ...}] or [{artifact_type, file_path, ...}]
 * @param {string} galleryId - unique gallery id
 */
function renderArtifactGroup(artifacts, galleryId) {
  if (!artifacts || artifacts.length === 0) return "";
  // Normalize field names
  const items = artifacts.map(a => ({
    type: a.type || a.artifact_type || "file",
    path: a.path || a.file_path,
    label: a.label || "",
    step: a.step ?? a.action_index,
    content: a.content,
  }));

  const byType = {};
  for (const a of items) {
    if (!byType[a.type]) byType[a.type] = [];
    byType[a.type].push(a);
  }

  let html = '';

  // Screenshots — gallery with lightbox
  if (byType.screenshot) {
    html += renderScreenshotGallery(byType.screenshot, galleryId);
  }

  // Videos
  if (byType.video) {
    let videosHtml = '';
    for (const a of byType.video) {
      const videoHtml = renderVideoCard(a);
      if (videoHtml) videosHtml += videoHtml;
    }
    if (videosHtml) {
      html += '<div class="artifact-videos">' + videosHtml + '</div>';
    }
  }

  // File chips — console, har, trace, snapshot, others
  const chipTypes = ["console", "har", "trace", "snapshot"];
  let chipsHtml = '';
  for (const t of chipTypes) {
    if (byType[t]) {
      for (const a of byType[t]) {
        const chipHtml = renderFileChip(a, t);
        if (chipHtml) chipsHtml += chipHtml;
      }
    }
  }
  // Any remaining types
  for (const t of Object.keys(byType)) {
    if (t === "screenshot" || t === "video" || chipTypes.includes(t)) continue;
    for (const a of byType[t]) {
      const chipHtml = renderFileChip(a, t);
      if (chipHtml) chipsHtml += chipHtml;
    }
  }
  if (chipsHtml) html += '<div class="artifact-chips">' + chipsHtml + '</div>';

  // Inline content (no file path)
  const inlineItems = items.filter(a => !a.path && a.content);
  if (inlineItems.length > 0) {
    for (const a of inlineItems) {
      html += '<pre class="pre-block" style="max-height:80px;margin-top:6px">' + esc(a.content.slice(0, 500)) + '</pre>';
    }
  }

  return html;
}

/**
 * Render step-based artifacts as a vertical timeline.
 * @param {Array} artifacts - raw from /api/run-artifacts [{action_index, action_desc, page_url, artifact_type, file_path, content}]
 */
function renderArtifactTimeline(artifacts) {
  if (!artifacts || artifacts.length === 0) return "";
  // Group by action_index
  const byStep = {};
  for (const a of artifacts) {
    const key = a.action_index ?? 0;
    if (!byStep[key]) byStep[key] = { desc: a.action_desc || "", pageUrl: a.page_url || "", items: [] };
    byStep[key].items.push(a);
    if (a.action_desc && !byStep[key].desc) byStep[key].desc = a.action_desc;
    if (a.page_url && !byStep[key].pageUrl) byStep[key].pageUrl = a.page_url;
  }
  const stepKeys = Object.keys(byStep).sort((a, b) => Number(a) - Number(b));

  let html = '<div class="artifact-timeline">';
  for (const key of stepKeys) {
    const step = byStep[key];
    const stepNum = Number(key) + 1;
    html += '<div class="timeline-step">';
    html += '<div class="timeline-marker"><span class="timeline-dot">' + stepNum + '</span><div class="timeline-line"></div></div>';
    html += '<div class="timeline-content">';
    // Header
    html += '<div class="timeline-header">';
    html += '<span class="timeline-step-num">Step ' + stepNum + '</span>';
    if (step.desc) html += '<span class="timeline-desc">' + esc(step.desc) + '</span>';
    html += '</div>';
    if (step.pageUrl) html += '<div class="timeline-url">' + esc(step.pageUrl) + '</div>';
    // Artifacts for this step
    html += renderArtifactGroup(step.items, "timeline-" + key);
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}
`;
}
