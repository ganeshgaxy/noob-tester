/**
 * Wireframe renderer — draws a low-fidelity wireframe of a page on a canvas.
 *
 * Uses element position_hints for zone placement, element_type for widget shapes,
 * and form groupings for grouped fields.
 *
 * Exported as an inline <script> string to embed in the dashboard HTML.
 */

export function getWireframeScript(): string {
  return `
// ── Wireframe Renderer ──

const WF = {
  colors: {
    bg: "#0d1117",
    pageBg: "#161b22",
    border: "#30363d",
    text: "#e6edf3",
    dim: "#7d8590",
    accent: "#58a6ff",
    green: "#3fb950",
    yellow: "#d29922",
    red: "#f85149",
    inputBg: "#0d1117",
    buttonBg: "rgba(88,166,255,0.15)",
    formBg: "rgba(88,166,255,0.05)",
    headerBg: "rgba(88,166,255,0.08)",
    footerBg: "rgba(125,133,144,0.06)",
    sidebarBg: "rgba(125,133,144,0.04)",
    linkColor: "#58a6ff",
    checkColor: "#3fb950",
  },
  zones: ["header", "top-nav", "sidebar", "main", "form", "modal", "footer"],
};

/**
 * Render a wireframe of a page.
 * @param {HTMLCanvasElement} canvas
 * @param {object} page - UiMapPageRow
 * @param {Array} elements - UiMapElementRow[] for this page
 * @param {Array} forms - UiMapFormRow[] for this page
 */
function renderWireframe(canvas, page, elements, forms) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const PAD = 16;
  const pageW = W - PAD * 2;

  // Background
  ctx.fillStyle = WF.colors.bg;
  ctx.fillRect(0, 0, W, H);

  // Page frame
  ctx.strokeStyle = WF.colors.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD, PAD, pageW, H - PAD * 2);

  // URL bar at top
  const urlBarH = 28;
  ctx.fillStyle = WF.colors.headerBg;
  ctx.fillRect(PAD, PAD, pageW, urlBarH);
  ctx.strokeStyle = WF.colors.border;
  ctx.strokeRect(PAD, PAD, pageW, urlBarH);
  ctx.fillStyle = WF.colors.dim;
  ctx.font = "11px -apple-system, monospace";
  ctx.fillText(page.url_pattern || "/", PAD + 12, PAD + 18);
  if (page.page_title) {
    ctx.fillStyle = WF.colors.text;
    ctx.font = "bold 11px -apple-system, monospace";
    const titleW = ctx.measureText(page.page_title).width;
    ctx.fillText(page.page_title, PAD + pageW - titleW - 12, PAD + 18);
  }

  // ── Classify elements into zones ──
  const zones = { header: [], "top-nav": [], sidebar: [], main: [], form: [], modal: [], footer: [], _unplaced: [] };

  // Form element IDs for grouping
  const formElementIds = new Set();
  for (const f of forms) {
    try {
      const fields = JSON.parse(f.fields || "[]");
      for (const fld of fields) if (fld.elementId) formElementIds.add(fld.elementId);
      if (f.submit_element_id) formElementIds.add(f.submit_element_id);
    } catch {}
  }

  for (const el of elements) {
    // Skip elements that belong to forms — they'll be rendered inside form groups
    if (formElementIds.has(el.id)) continue;

    const hint = (el.position_hint || "").toLowerCase();
    if (hint && zones[hint]) {
      zones[hint].push(el);
    } else if (el.element_type === "link" && !hint) {
      zones.main.push(el);
    } else if (hint.includes("nav")) {
      zones["top-nav"].push(el);
    } else if (hint.includes("head")) {
      zones.header.push(el);
    } else if (hint.includes("foot")) {
      zones.footer.push(el);
    } else if (hint.includes("side")) {
      zones.sidebar.push(el);
    } else {
      zones.main.push(el);
    }
  }

  // ── Layout zones top-to-bottom ──
  let cursorY = PAD + urlBarH + 1;
  const contentX = PAD + 1;
  const contentW = pageW - 2;
  const hasSidebar = zones.sidebar.length > 0;
  const sidebarW = hasSidebar ? Math.min(180, contentW * 0.25) : 0;
  const mainW = contentW - sidebarW;

  // Helper: draw zone label
  function zoneLabel(x, y, w, label) {
    ctx.fillStyle = WF.colors.dim;
    ctx.font = "bold 8px -apple-system, monospace";
    ctx.globalAlpha = 0.5;
    ctx.fillText(label.toUpperCase(), x + 6, y + 10);
    ctx.globalAlpha = 1;
  }

  // ── HEADER zone ──
  if (zones.header.length > 0) {
    const zoneH = 36;
    ctx.fillStyle = WF.colors.headerBg;
    ctx.fillRect(contentX, cursorY, contentW, zoneH);
    ctx.strokeStyle = WF.colors.border;
    ctx.strokeRect(contentX, cursorY, contentW, zoneH);
    zoneLabel(contentX, cursorY, contentW, "header");
    drawElementRow(ctx, zones.header, contentX + 8, cursorY + 16, contentW - 16);
    cursorY += zoneH;
  }

  // ── TOP-NAV zone ──
  if (zones["top-nav"].length > 0) {
    const zoneH = 32;
    ctx.fillStyle = WF.colors.headerBg;
    ctx.fillRect(contentX, cursorY, contentW, zoneH);
    ctx.strokeStyle = WF.colors.border;
    ctx.strokeRect(contentX, cursorY, contentW, zoneH);
    zoneLabel(contentX, cursorY, contentW, "nav");
    drawElementRow(ctx, zones["top-nav"], contentX + 8, cursorY + 18, contentW - 16);
    cursorY += zoneH;
  }

  // ── SIDEBAR + MAIN area ──
  const mainStartY = cursorY;
  const mainAreaH = H - PAD * 2 - (cursorY - PAD) - (zones.footer.length > 0 ? 36 : 0);
  const mainContentH = Math.max(mainAreaH, 100);

  // Sidebar
  if (hasSidebar) {
    ctx.fillStyle = WF.colors.sidebarBg;
    ctx.fillRect(contentX, cursorY, sidebarW, mainContentH);
    ctx.strokeStyle = WF.colors.border;
    ctx.strokeRect(contentX, cursorY, sidebarW, mainContentH);
    zoneLabel(contentX, cursorY, sidebarW, "sidebar");
    drawElementColumn(ctx, zones.sidebar, contentX + 8, cursorY + 18, sidebarW - 16, mainContentH - 26);
  }

  // Main area
  const mainX = contentX + sidebarW;
  ctx.strokeStyle = WF.colors.border;
  ctx.strokeRect(mainX, cursorY, mainW, mainContentH);

  // Draw forms first (they take up more space)
  let mainCursorY = cursorY + 8;

  // Forms
  for (const f of forms) {
    const formH = drawForm(ctx, f, elements, mainX + 12, mainCursorY, mainW - 24);
    mainCursorY += formH + 12;
  }

  // Main elements (non-form)
  if (zones.main.length > 0) {
    if (forms.length > 0) {
      // Separator
      ctx.strokeStyle = WF.colors.border;
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.moveTo(mainX + 12, mainCursorY);
      ctx.lineTo(mainX + mainW - 12, mainCursorY);
      ctx.stroke();
      ctx.setLineDash([]);
      mainCursorY += 8;
    }
    zoneLabel(mainX, mainCursorY - 4, mainW, "main");
    mainCursorY += 8;
    drawElementColumn(ctx, zones.main, mainX + 12, mainCursorY, mainW - 24, mainContentH - (mainCursorY - cursorY) - 8);
  }

  // Modal overlay (if any modal elements)
  if (zones.modal.length > 0) {
    const modalW = Math.min(280, mainW * 0.7);
    const modalH = Math.min(200, mainContentH * 0.6);
    const modalX = mainX + (mainW - modalW) / 2;
    const modalY = cursorY + (mainContentH - modalH) / 2;

    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(mainX, cursorY, mainW, mainContentH);

    ctx.fillStyle = WF.colors.pageBg;
    ctx.strokeStyle = WF.colors.accent;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(modalX, modalY, modalW, modalH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.lineWidth = 1;
    zoneLabel(modalX, modalY, modalW, "modal");
    drawElementColumn(ctx, zones.modal, modalX + 12, modalY + 18, modalW - 24, modalH - 26);
  }

  cursorY += mainContentH;

  // ── FOOTER zone ──
  if (zones.footer.length > 0) {
    const zoneH = 36;
    ctx.fillStyle = WF.colors.footerBg;
    ctx.fillRect(contentX, cursorY, contentW, zoneH);
    ctx.strokeStyle = WF.colors.border;
    ctx.strokeRect(contentX, cursorY, contentW, zoneH);
    zoneLabel(contentX, cursorY, contentW, "footer");
    drawElementRow(ctx, zones.footer, contentX + 8, cursorY + 20, contentW - 16);
    cursorY += zoneH;
  }

  // Auth badge
  if (page.auth_required) {
    ctx.fillStyle = "rgba(248,81,73,0.15)";
    ctx.strokeStyle = WF.colors.red;
    const badgeW = 60;
    ctx.beginPath();
    ctx.roundRect(PAD + pageW - badgeW - 8, PAD + urlBarH + 6, badgeW, 18, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = WF.colors.red;
    ctx.font = "bold 9px -apple-system, monospace";
    ctx.fillText("🔒 AUTH", PAD + pageW - badgeW - 2, PAD + urlBarH + 18);
  }
}

// ── Element drawing helpers ──

function drawElementRow(ctx, els, x, y, maxW) {
  let cx = x;
  for (const el of els) {
    const w = drawElement(ctx, el, cx, y - 8, "row");
    cx += w + 8;
    if (cx > x + maxW - 40) break;
  }
}

function drawElementColumn(ctx, els, x, y, maxW, maxH) {
  let cy = y;
  for (const el of els) {
    if (cy > y + maxH - 16) break;
    const h = drawElement(ctx, el, x, cy, "col", maxW);
    cy += h + 6;
  }
}

function drawElement(ctx, el, x, y, layout, maxW) {
  const type = el.element_type || "other";
  const text = el.element_text || el.element_name || el.element_type || "";
  const label = text.length > 25 ? text.slice(0, 24) + "…" : text;
  const statusColor = el.status === "working" ? WF.colors.green : el.status === "flaky" ? WF.colors.yellow : el.status === "broken" ? WF.colors.red : WF.colors.dim;

  ctx.font = "10px -apple-system, monospace";
  const textW = ctx.measureText(label).width;

  switch (type) {
    case "button": {
      const w = Math.max(textW + 16, 60);
      const h = 22;
      ctx.fillStyle = WF.colors.buttonBg;
      ctx.strokeStyle = statusColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = WF.colors.accent;
      ctx.font = "bold 10px -apple-system, monospace";
      ctx.fillText(label, x + 8, y + 15);
      return layout === "row" ? w : h;
    }

    case "input": {
      const w = maxW ? Math.min(maxW, 220) : 180;
      const h = 22;
      ctx.fillStyle = WF.colors.inputBg;
      ctx.strokeStyle = statusColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = WF.colors.dim;
      ctx.font = "10px -apple-system, monospace";
      ctx.fillText(label || "input", x + 6, y + 15);
      return layout === "row" ? w : h;
    }

    case "link": {
      const w = textW + 4;
      ctx.fillStyle = WF.colors.linkColor;
      ctx.font = "10px -apple-system, monospace";
      ctx.fillText(label, x, y + 12);
      // Underline
      ctx.strokeStyle = WF.colors.linkColor;
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y + 14);
      ctx.lineTo(x + w, y + 14);
      ctx.stroke();
      ctx.globalAlpha = 1;
      return layout === "row" ? w : 16;
    }

    case "select": {
      const w = maxW ? Math.min(maxW, 180) : 140;
      const h = 22;
      ctx.fillStyle = WF.colors.inputBg;
      ctx.strokeStyle = statusColor;
      ctx.strokeRect(x, y, w, h);
      ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = WF.colors.dim;
      ctx.font = "10px -apple-system, monospace";
      ctx.fillText(label || "select ▾", x + 6, y + 15);
      // Dropdown arrow
      ctx.fillStyle = WF.colors.dim;
      ctx.beginPath();
      ctx.moveTo(x + w - 16, y + 8);
      ctx.lineTo(x + w - 8, y + 8);
      ctx.lineTo(x + w - 12, y + 15);
      ctx.closePath();
      ctx.fill();
      return layout === "row" ? w : h;
    }

    case "checkbox":
    case "radio": {
      const boxSize = 12;
      ctx.strokeStyle = statusColor;
      ctx.lineWidth = 1;
      if (type === "radio") {
        ctx.beginPath();
        ctx.arc(x + boxSize / 2, y + 8, boxSize / 2, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.strokeRect(x, y + 2, boxSize, boxSize);
      }
      ctx.fillStyle = WF.colors.text;
      ctx.font = "10px -apple-system, monospace";
      ctx.fillText(label, x + boxSize + 6, y + 12);
      return layout === "row" ? boxSize + textW + 10 : 16;
    }

    case "tab": {
      const w = textW + 16;
      const h = 20;
      ctx.fillStyle = WF.colors.headerBg;
      ctx.strokeStyle = statusColor;
      ctx.beginPath();
      ctx.moveTo(x, y + h);
      ctx.lineTo(x, y + 3);
      ctx.quadraticCurveTo(x, y, x + 3, y);
      ctx.lineTo(x + w - 3, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + 3);
      ctx.lineTo(x + w, y + h);
      ctx.stroke();
      ctx.fill();
      ctx.fillStyle = WF.colors.text;
      ctx.font = "10px -apple-system, monospace";
      ctx.fillText(label, x + 8, y + 14);
      return layout === "row" ? w : h;
    }

    case "image": {
      const w = maxW ? Math.min(maxW, 120) : 80;
      const h = 50;
      ctx.strokeStyle = WF.colors.border;
      ctx.setLineDash([3, 3]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      // X through it (image placeholder)
      ctx.strokeStyle = WF.colors.dim;
      ctx.globalAlpha = 0.3;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y + h);
      ctx.moveTo(x + w, y);
      ctx.lineTo(x, y + h);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.fillStyle = WF.colors.dim;
      ctx.font = "9px -apple-system, monospace";
      ctx.fillText(label || "img", x + 4, y + h / 2 + 3);
      return layout === "row" ? w : h;
    }

    case "text": {
      ctx.fillStyle = WF.colors.dim;
      ctx.font = "10px -apple-system, monospace";
      const lines = label ? [label] : ["text block"];
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x, y + 12 + i * 14);
      }
      return layout === "row" ? textW : 16;
    }

    default: {
      // Generic element — dotted border box
      const w = Math.max(textW + 12, 50);
      const h = 20;
      ctx.strokeStyle = statusColor;
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]);
      ctx.fillStyle = WF.colors.dim;
      ctx.font = "9px -apple-system, monospace";
      ctx.fillText(label || type, x + 4, y + 13);
      return layout === "row" ? w : h;
    }
  }
}

// ── Form renderer ──

function drawForm(ctx, form, allElements, x, y, maxW) {
  let fields = [];
  try { fields = JSON.parse(form.fields || "[]"); } catch {}

  const formW = Math.min(maxW, 300);
  const fieldH = 40; // label + input per field
  const headerH = 24;
  const submitH = 30;
  const totalH = headerH + fields.length * fieldH + (form.submit_element_id ? submitH : 0) + 16;

  // Form background
  ctx.fillStyle = WF.colors.formBg;
  ctx.strokeStyle = WF.colors.border;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, formW, totalH, 6);
  ctx.fill();
  ctx.stroke();

  // Form name
  ctx.fillStyle = WF.colors.accent;
  ctx.font = "bold 10px -apple-system, monospace";
  ctx.fillText(form.form_name || form.form_selector || "form", x + 10, y + 16);

  // Fields
  let fy = y + headerH + 4;
  for (const field of fields) {
    const el = allElements.find(e => e.id === field.elementId);
    const label = field.label || el?.element_text || field.inputType || "field";
    const statusColor = el ? (el.status === "working" ? WF.colors.green : el.status === "flaky" ? WF.colors.yellow : WF.colors.red) : WF.colors.dim;

    // Label
    ctx.fillStyle = WF.colors.dim;
    ctx.font = "9px -apple-system, monospace";
    ctx.fillText(label, x + 12, fy + 10);

    // Input box
    const inputW = formW - 24;
    ctx.fillStyle = WF.colors.inputBg;
    ctx.strokeStyle = statusColor;
    ctx.strokeRect(x + 12, fy + 14, inputW, 18);
    ctx.fillRect(x + 13, fy + 15, inputW - 2, 16);
    ctx.fillStyle = WF.colors.dim;
    ctx.font = "9px -apple-system, monospace";
    ctx.fillText(field.inputType || "text", x + 18, fy + 27);

    fy += fieldH;
  }

  // Submit button
  if (form.submit_element_id) {
    const submitEl = allElements.find(e => e.id === form.submit_element_id);
    const submitText = submitEl?.element_text || "Submit";
    const btnW = Math.min(formW - 24, 120);
    ctx.fillStyle = WF.colors.buttonBg;
    ctx.strokeStyle = submitEl ? (submitEl.status === "working" ? WF.colors.green : WF.colors.yellow) : WF.colors.accent;
    ctx.beginPath();
    ctx.roundRect(x + 12, fy + 4, btnW, 22, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = WF.colors.accent;
    ctx.font = "bold 10px -apple-system, monospace";
    ctx.fillText(submitText, x + 20, fy + 18);
  }

  // Success / error indicators
  if (form.success_indicator || form.error_indicator) {
    ctx.font = "8px -apple-system, monospace";
    const indicatorY = y + totalH + 2;
    if (form.success_indicator) {
      ctx.fillStyle = WF.colors.green;
      ctx.globalAlpha = 0.6;
      ctx.fillText("✓ " + form.success_indicator.slice(0, 35), x + 10, indicatorY);
      ctx.globalAlpha = 1;
    }
  }

  return totalH;
}
`;
}
