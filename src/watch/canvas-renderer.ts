export function getCanvasRendererScript(): string {
  return `
// ── Force-directed canvas state ──
let _uimapCanvasData = null;
let _uimapPan = { x: 0, y: 0 };
let _uimapZoom = 1;
let _uimapDragging = false;
let _uimapDragStart = { x: 0, y: 0 };
let _uimapDragNode = null;
let _uimapHover = null;
let _uimapAnimFrame = null;
let _uimapSearch = "";
let _uimapCollapsed = {}; // cluster name -> boolean
let _uimapScreenshots = {}; // page id -> Image
let _uimapAnimTime = 0;

function drawUiMapCanvas(pages, elements, navs, forms, canvasId, highlightPageId) {
  const canvas = document.getElementById(canvasId || "uimap-canvas");
  if (!canvas) return;
  if (highlightPageId) uimapSelectedPageId = highlightPageId;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  // ── Node data: size by element count, cluster by URL prefix ──
  const nodes = {};
  const minW = 140, maxW = 220, minH = 50, maxH = 80;
  const maxEls = Math.max(1, ...pages.map(p => elements.filter(e => e.page_id === p.id).length));

  for (const p of pages) {
    const elCount = elements.filter(e => e.page_id === p.id).length;
    const formCount = forms.filter(f => f.page_id === p.id).length;
    const pageEls = elements.filter(e => e.page_id === p.id);
    const flakyCount = pageEls.filter(e => e.status === "flaky").length;
    const brokenCount = pageEls.filter(e => e.status === "broken").length;
    const t = maxEls > 0 ? elCount / maxEls : 0;
    const w = minW + t * (maxW - minW);
    const h = minH + t * (maxH - minH);

    // Cluster by first two URL segments
    const parts = p.url_pattern.split("/").filter(Boolean);
    const cluster = parts.length >= 2 ? "/" + parts[0] + "/" + parts[1] : "/" + (parts[0] || "");

    // Preload screenshot
    if (p.screenshot_path && !_uimapScreenshots[p.id]) {
      const img = new Image();
      img.src = API + "/api/artifact?path=" + encodeURIComponent(p.screenshot_path);
      img.onload = () => { _uimapScreenshots[p.id] = img; };
      _uimapScreenshots[p.id] = null; // mark as loading
    }

    // Issue heatmap intensity (0-1)
    const totalIssues = p.total_issues || 0;
    const criticalIssues = (p.issue_counts || {}).critical || 0;
    const highIssues = (p.issue_counts || {}).high || 0;
    const heatIntensity = Math.min(1, (criticalIssues * 3 + highIssues * 2 + totalIssues) / 10);

    nodes[p.id] = {
      page: p, elCount, formCount, flakyCount, brokenCount, w, h, cluster,
      totalIssues, criticalIssues, heatIntensity,
      hasUnresolvedTech: p.has_unresolved_tech || false,
      consoleErrors: p.console_errors || 0,
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H / 2 + (Math.random() - 0.5) * H * 0.6,
      vx: 0, vy: 0,
    };
  }

  // Build adjacency
  const edges = [];
  for (const n of navs) {
    if (nodes[n.from_page_id] && nodes[n.to_page_id]) {
      edges.push({ from: n.from_page_id, to: n.to_page_id, nav: n });
    }
  }

  // Split nodes: connected (have edges) vs disconnected (no edges)
  const connectedIds = new Set();
  for (const e of edges) { connectedIds.add(e.from); connectedIds.add(e.to); }
  const disconnectedIds = Object.keys(nodes).filter(id => !connectedIds.has(id));
  const forceIds = Object.keys(nodes).filter(id => connectedIds.has(id));

  // ── Sequential layout: BFS from roots, left-to-right by depth ──
  if (forceIds.length > 0) {
    // Build adjacency list (forward edges only, skip self-loops)
    const children = {};
    const parents = {};
    for (const id of forceIds) { children[id] = []; parents[id] = []; }
    for (const e of edges) {
      if (e.from === e.to) continue; // skip self-loops
      if (children[e.from]) children[e.from].push(e.to);
      if (parents[e.to]) parents[e.to].push(e.from);
    }

    // Find roots: nodes with no incoming edges (or pick earliest-created if cyclic)
    let roots = forceIds.filter(id => parents[id].length === 0);
    if (roots.length === 0) {
      // All nodes are in cycles — pick the one with earliest page created_at
      roots = [forceIds.reduce((best, id) =>
        (nodes[id].page.created_at || "") < (nodes[best].page.created_at || "") ? id : best
      , forceIds[0])];
    }

    // BFS to assign depth levels
    const depth = {};
    const visited = new Set();
    const queue = [];
    for (const r of roots) { queue.push(r); depth[r] = 0; visited.add(r); }
    while (queue.length > 0) {
      const id = queue.shift();
      for (const childId of children[id]) {
        if (!visited.has(childId)) {
          visited.add(childId);
          depth[childId] = depth[id] + 1;
          queue.push(childId);
        }
      }
    }
    // Any remaining connected nodes not reached by BFS (isolated cycles)
    for (const id of forceIds) {
      if (!visited.has(id)) { depth[id] = 0; }
    }

    // Group by depth level
    const levels = {};
    for (const id of forceIds) {
      const d = depth[id] || 0;
      if (!levels[d]) levels[d] = [];
      levels[d].push(id);
    }

    // Sort nodes within each level by creation time for stable ordering
    for (const d of Object.keys(levels)) {
      levels[d].sort((a, b) =>
        (nodes[a].page.created_at || "").localeCompare(nodes[b].page.created_at || "")
      );
    }

    // Position: each depth level is a column, nodes stacked vertically
    const colGap = 60;
    const rowGap = 30;
    const startX = disconnectedIds.length > 0 ? 300 : 40;
    const startY = 40;
    const maxDepth = Math.max(0, ...Object.keys(levels).map(Number));

    for (let d = 0; d <= maxDepth; d++) {
      const col = levels[d] || [];
      const maxNodeW = col.length > 0 ? Math.max(...col.map(id => nodes[id].w)) : 0;
      let yPos = startY;
      for (const id of col) {
        nodes[id].x = startX + d * (maxW + colGap);
        nodes[id].y = yPos;
        yPos += nodes[id].h + rowGap;
      }
    }
  }

  // Disconnected nodes: ordered list on the left side
  const listX = 30, listStartY = 40, listGapY = 12;
  let listY = listStartY;
  for (const id of disconnectedIds) {
    nodes[id].x = listX;
    nodes[id].y = listY;
    listY += nodes[id].h + listGapY;
  }

  _uimapCanvasData = { nodes, pages, elements, navs, forms, edges };

  // No force simulation needed — layout is deterministic

  // ── Render ──
  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(_uimapPan.x, _uimapPan.y);
    ctx.scale(_uimapZoom, _uimapZoom);

    // Background grid (subtle)
    ctx.strokeStyle = "rgba(48,54,61,0.3)";
    ctx.lineWidth = 0.5;
    const gridSize = 60;
    for (let gx = -W; gx < W * 3; gx += gridSize) {
      ctx.beginPath(); ctx.moveTo(gx, -H); ctx.lineTo(gx, H * 3); ctx.stroke();
    }
    for (let gy = -H; gy < H * 3; gy += gridSize) {
      ctx.beginPath(); ctx.moveTo(-W, gy); ctx.lineTo(W * 3, gy); ctx.stroke();
    }

    // Draw cluster backgrounds
    const drawnClusters = {};
    for (const id of Object.keys(nodes)) {
      const c = nodes[id].cluster;
      if (!drawnClusters[c]) drawnClusters[c] = [];
      drawnClusters[c].push(nodes[id]);
    }
    const clusterColors = ["rgba(88,166,255,0.04)", "rgba(63,185,80,0.04)", "rgba(210,153,34,0.04)", "rgba(188,140,255,0.04)", "rgba(248,81,73,0.04)", "rgba(219,109,40,0.04)"];
    let ci = 0;
    for (const [cname, cnodes] of Object.entries(drawnClusters)) {
      if (cnodes.length < 2) { ci++; continue; }
      // Draw convex hull-ish: bounding box with padding
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of cnodes) {
        minX = Math.min(minX, n.x - 10);
        minY = Math.min(minY, n.y - 10);
        maxX = Math.max(maxX, n.x + n.w + 10);
        maxY = Math.max(maxY, n.y + n.h + 10);
      }
      ctx.fillStyle = clusterColors[ci % clusterColors.length];
      ctx.strokeStyle = "rgba(125,133,144,0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(minX - 15, minY - 20, maxX - minX + 30, maxY - minY + 40, 16);
      ctx.fill(); ctx.stroke();
      // Cluster label
      ctx.fillStyle = "rgba(125,133,144,0.3)";
      ctx.font = "bold 10px -apple-system, monospace";
      ctx.fillText(cname, minX - 10, minY - 6);
      ci++;
    }

    // Draw edges
    for (const e of edges) {
      const a = nodes[e.from], b = nodes[e.to];
      const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2;
      const x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;

      // Edge color by type
      const isActive = e.nav.status === "active";
      const edgeAlpha = isActive ? 0.5 : 0.2;
      const edgeColor = e.nav.nav_type === "redirect" ? \`rgba(210,153,34,\${edgeAlpha})\`
        : e.nav.nav_type === "form_submit" ? \`rgba(63,185,80,\${edgeAlpha})\`
        : \`rgba(88,166,255,\${edgeAlpha})\`;

      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = Math.min(4, 1.5 + (e.nav.times_used || 0) * 0.4);

      // Curved edge
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      const perpX = -(y2 - y1) / dist * 30, perpY = (x2 - x1) / dist * 30;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(mx + perpX, my + perpY, x2, y2);
      ctx.stroke();

      // Arrowhead
      const t = 0.85;
      const ax = (1-t)*(1-t)*x1 + 2*(1-t)*t*(mx+perpX) + t*t*x2;
      const ay = (1-t)*(1-t)*y1 + 2*(1-t)*t*(my+perpY) + t*t*y2;
      const angle = Math.atan2(y2 - ay, x2 - ax);
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(angle);
      ctx.fillStyle = edgeColor;
      ctx.beginPath();
      ctx.moveTo(8, 0); ctx.lineTo(-4, -5); ctx.lineTo(-4, 5); ctx.closePath();
      ctx.fill();
      ctx.restore();

      // Edge label (nav type + count)
      const labelX = mx + perpX * 0.6, labelY = my + perpY * 0.6;
      ctx.fillStyle = "rgba(125,133,144,0.6)";
      ctx.font = "9px -apple-system, monospace";
      const navLabel = (e.nav.nav_type || "click") + (e.nav.times_used > 1 ? " x" + e.nav.times_used : "");
      ctx.fillText(navLabel, labelX - ctx.measureText(navLabel).width / 2, labelY + 3);
    }

    // Draw nodes
    for (const id of Object.keys(nodes)) {
      const n = nodes[id];
      const p = n.page;
      const x = n.x, y = n.y, w = n.w, h = n.h;
      const isSelected = uimapSelectedPageId === p.id;
      const isHovered = _uimapHover === p.id;

      // Search dimming
      const matchesSearch = !_uimapSearch || (p.url_pattern + " " + (p.page_title || "")).toLowerCase().includes(_uimapSearch.toLowerCase());
      if (_uimapSearch && !matchesSearch) { ctx.globalAlpha = 0.15; }

      // Issue heatmap glow
      if (n.heatIntensity > 0 && !isSelected) {
        ctx.shadowColor = "rgba(248,81,73," + (n.heatIntensity * 0.6) + ")";
        ctx.shadowBlur = 8 + n.heatIntensity * 12;
      }

      // Selected/hovered glow
      if (isSelected || isHovered) {
        ctx.shadowColor = isSelected ? "#58a6ff" : "rgba(88,166,255,0.3)";
        ctx.shadowBlur = isSelected ? 16 : 10;
      }

      // Node body — clip for screenshot
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 10);
      ctx.clip();

      // Screenshot background — full clarity, no overlay
      const screenshot = _uimapScreenshots[p.id];
      const hasScreenshot = !!screenshot;
      if (screenshot) {
        const imgW = screenshot.naturalWidth || screenshot.width;
        const imgH = screenshot.naturalHeight || screenshot.height;
        if (imgW && imgH) {
          const targetH = Math.max(minH, Math.min(maxH * 1.5, w * (imgH / imgW)));
          if (Math.abs(n.h - targetH) > 2) { n.h = targetH; }
        }
        // Draw screenshot — cover crop, NO overlay
        const sr = (screenshot.naturalWidth || w) / (screenshot.naturalHeight || h);
        const nr = w / n.h;
        let sx = 0, sy = 0, sw = screenshot.naturalWidth, sh = screenshot.naturalHeight;
        if (sr > nr) { sw = sh * nr; sx = (screenshot.naturalWidth - sw) / 2; }
        else { sh = sw / nr; sy = 0; }
        ctx.drawImage(screenshot, sx, sy, sw, sh, x, y, w, n.h);
      } else {
        const sc = { active: "rgba(63,185,80,0.10)", changed: "rgba(210,153,34,0.10)", broken: "rgba(248,81,73,0.10)", removed: "rgba(125,133,144,0.08)" };
        ctx.fillStyle = isSelected ? "rgba(88,166,255,0.15)" : isHovered ? "rgba(88,166,255,0.08)" : (sc[p.status] || sc.active);
        ctx.fillRect(x, y, w, n.h);
      }
      ctx.restore();

      // Border
      const borderColors = { active: "#3fb950", changed: "#d29922", broken: "#f85149", removed: "#7d8590" };
      ctx.strokeStyle = isSelected ? "#58a6ff" : isHovered ? "rgba(88,166,255,0.6)" : (borderColors[p.status] || "#3fb950");
      ctx.lineWidth = isSelected ? 2.5 : isHovered ? 1.5 : 1;
      ctx.beginPath(); ctx.roundRect(x, y, w, n.h, 10); ctx.stroke();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

      // Auth stripe
      if (p.auth_required) {
        ctx.fillStyle = "rgba(248,81,73,0.5)";
        ctx.beginPath(); ctx.roundRect(x, y, 4, n.h, [10, 0, 0, 10]); ctx.fill();
      }

      // ── Top bar: dark chip behind URL + title ──
      const topBarH = p.page_title ? 36 : 22;
      ctx.fillStyle = "rgba(13,17,23,0.8)";
      ctx.beginPath(); ctx.roundRect(x, y, w, topBarH, [10, 10, 0, 0]); ctx.fill();

      ctx.fillStyle = "#e6edf3";
      ctx.font = "bold 11px -apple-system, monospace";
      const maxChars = Math.floor((w - 20) / 6.5);
      const urlLabel = p.url_pattern.length > maxChars ? p.url_pattern.slice(0, maxChars - 1) + "…" : p.url_pattern;
      ctx.fillText(urlLabel, x + (p.auth_required ? 12 : 10), y + 14);

      if (p.page_title) {
        ctx.fillStyle = "#7d8590";
        ctx.font = "10px -apple-system, monospace";
        const titleMaxChars = Math.floor((w - 20) / 6);
        ctx.fillText((p.page_title.length > titleMaxChars ? p.page_title.slice(0, titleMaxChars - 1) + "…" : p.page_title), x + 10, y + 28);
      }

      // ── Bottom bar: dark chip behind stats ──
      const bottomBarH = 18;
      ctx.fillStyle = "rgba(13,17,23,0.8)";
      ctx.beginPath(); ctx.roundRect(x, y + n.h - bottomBarH, w, bottomBarH, [0, 0, 10, 10]); ctx.fill();

      const by = y + n.h - 5;
      let bx = x + 8;
      ctx.font = "bold 8px -apple-system, monospace";

      if (n.elCount > 0) {
        ctx.fillStyle = "rgba(88,166,255,0.9)";
        ctx.fillText(n.elCount + "el", bx, by);
        bx += ctx.measureText(n.elCount + "el").width + 5;
      }
      if (n.formCount > 0) {
        ctx.fillStyle = "rgba(188,140,255,0.9)";
        ctx.fillText(n.formCount + "fm", bx, by);
        bx += ctx.measureText(n.formCount + "fm").width + 5;
      }
      if (n.flakyCount > 0) {
        ctx.fillStyle = "#d29922";
        ctx.beginPath(); ctx.arc(bx + 3, by - 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(n.flakyCount + "", bx + 9, by);
        bx += 16;
      }
      if (n.brokenCount > 0) {
        ctx.fillStyle = "#f85149";
        ctx.beginPath(); ctx.arc(bx + 3, by - 3, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillText(n.brokenCount + "", bx + 9, by);
        bx += 16;
      }

      // ── Top-right markers: issues, tech issues, console errors ──
      let mx = x + w - 8;
      const my = y + 10;

      // Issue count marker
      if (n.totalIssues > 0) {
        const issColor = n.criticalIssues > 0 ? "#f85149" : "#d29922";
        ctx.fillStyle = issColor;
        ctx.beginPath(); ctx.arc(mx, my, 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 7px -apple-system, monospace";
        ctx.fillText(n.totalIssues + "", mx - (n.totalIssues > 9 ? 5 : 3), my + 3);
        mx -= 16;
      }

      // Tech issue marker (unresolved = red pulse)
      if (n.hasUnresolvedTech) {
        ctx.fillStyle = "rgba(248,81,73," + (0.5 + 0.5 * Math.sin(_uimapAnimTime * 3)) + ")";
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 8px -apple-system, monospace";
        ctx.fillText("!", mx - 2, my + 3);
        mx -= 14;
      }

      // Console error marker
      if (n.consoleErrors > 0) {
        ctx.fillStyle = "rgba(210,153,34,0.8)";
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "bold 7px -apple-system, monospace";
        ctx.fillText("C", mx - 3, my + 3);
      }

      // Reset search alpha
      if (_uimapSearch && !matchesSearch) { ctx.globalAlpha = 1; }
    }

    // ── Edge animation: flowing dots on frequently used paths ──
    _uimapAnimTime += 0.016;
    for (const e of edges) {
      if ((e.nav.times_used || 0) < 2) continue;
      const a = nodes[e.from], b = nodes[e.to];
      if (!a || !b) continue;
      const x1 = a.x + a.w / 2, y1 = a.y + a.h / 2;
      const x2 = b.x + b.w / 2, y2 = b.y + b.h / 2;
      const dx = x2 - x1, dy = y2 - y1;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const perpX = -(dy) / dist * 30, perpY = (dx) / dist * 30;
      const mx = (x1 + x2) / 2 + perpX, my2 = (y1 + y2) / 2 + perpY;

      // Animated dot along the curve
      const speed = 0.3 + (e.nav.times_used || 1) * 0.05;
      const t = (_uimapAnimTime * speed) % 1;
      const dotX = (1-t)*(1-t)*x1 + 2*(1-t)*t*mx + t*t*x2;
      const dotY = (1-t)*(1-t)*y1 + 2*(1-t)*t*my2 + t*t*y2;
      ctx.fillStyle = "rgba(88,166,255,0.7)";
      ctx.beginPath(); ctx.arc(dotX, dotY, 3, 0, Math.PI * 2); ctx.fill();
    }

    // Zoom indicator + search hint
    ctx.restore();
    ctx.fillStyle = "rgba(125,133,144,0.5)";
    ctx.font = "10px -apple-system, monospace";
    ctx.fillText(Math.round(_uimapZoom * 100) + "%", W - 40, H - 10);

    ctx.fillStyle = "rgba(125,133,144,0.3)";
    ctx.font = "9px -apple-system, monospace";
    ctx.fillText("scroll to zoom · drag to pan · click node for detail", 10, H - 10);
  }

  // ── Run render loop (for animations like flowing dots, hover effects) ──
  let _animRunning = true;
  function tick() {
    if (!_animRunning) return;
    render();
    _uimapAnimFrame = requestAnimationFrame(tick);
  }
  tick();

  // Stop animation when canvas is removed from DOM
  const observer = new MutationObserver(() => {
    if (!document.contains(canvas)) { _animRunning = false; observer.disconnect(); }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── Auto-fit to content ──
  setTimeout(() => {
    const ids = Object.keys(nodes);
    if (ids.length === 0) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const id of ids) {
      minX = Math.min(minX, nodes[id].x);
      minY = Math.min(minY, nodes[id].y);
      maxX = Math.max(maxX, nodes[id].x + nodes[id].w);
      maxY = Math.max(maxY, nodes[id].y + nodes[id].h);
    }
    const graphW = maxX - minX + 80, graphH = maxY - minY + 80;
    _uimapZoom = Math.min(1.5, Math.min(W / graphW, H / graphH));
    _uimapPan.x = (W - graphW * _uimapZoom) / 2 - minX * _uimapZoom + 40 * _uimapZoom;
    _uimapPan.y = (H - graphH * _uimapZoom) / 2 - minY * _uimapZoom + 40 * _uimapZoom;
    render();
  }, 100);

  // ── Mouse: to canvas coords ──
  function canvasCoords(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left - _uimapPan.x) / _uimapZoom,
      y: (e.clientY - r.top - _uimapPan.y) / _uimapZoom,
    };
  }

  function hitTest(mx, my) {
    for (const id of Object.keys(nodes)) {
      const n = nodes[id];
      if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) return id;
    }
    return null;
  }

  // ── Interactions ──
  let _didDrag = false;
  let _dragCluster = null; // cluster name being dragged
  let _dragClusterStart = { x: 0, y: 0 };

  // Hit test for cluster backgrounds
  function clusterHitTest(mx, my) {
    // Build cluster bounds
    const bounds = {};
    for (const id of Object.keys(nodes)) {
      const c = nodes[id].cluster;
      if (!bounds[c]) bounds[c] = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      const n = nodes[id];
      bounds[c].minX = Math.min(bounds[c].minX, n.x - 15);
      bounds[c].minY = Math.min(bounds[c].minY, n.y - 20);
      bounds[c].maxX = Math.max(bounds[c].maxX, n.x + n.w + 15);
      bounds[c].maxY = Math.max(bounds[c].maxY, n.y + n.h + 20);
    }
    for (const [cname, b] of Object.entries(bounds)) {
      if (mx >= b.minX && mx <= b.maxX && my >= b.minY && my <= b.maxY) return cname;
    }
    return null;
  }

  canvas.onmousedown = (e) => {
    _didDrag = false;
    const { x, y } = canvasCoords(e);
    const hit = hitTest(x, y);
    if (hit) {
      _uimapDragNode = hit;
      _uimapDragStart = { x: x - nodes[hit].x, y: y - nodes[hit].y };
      canvas.style.cursor = "move";
    } else {
      // Check if clicking on a cluster background
      const cluster = clusterHitTest(x, y);
      if (cluster) {
        _dragCluster = cluster;
        _dragClusterStart = { x, y };
        canvas.style.cursor = "move";
      } else {
        _uimapDragging = true;
        _uimapDragStart = { x: e.clientX - _uimapPan.x, y: e.clientY - _uimapPan.y };
        canvas.style.cursor = "grabbing";
      }
    }
  };

  canvas.onmousemove = (e) => {
    const { x, y } = canvasCoords(e);
    if (_uimapDragNode) {
      _didDrag = true;
      nodes[_uimapDragNode].x = x - _uimapDragStart.x;
      nodes[_uimapDragNode].y = y - _uimapDragStart.y;
      render();
    } else if (_dragCluster) {
      _didDrag = true;
      const dx = x - _dragClusterStart.x;
      const dy = y - _dragClusterStart.y;
      // Move all nodes in this cluster
      for (const id of Object.keys(nodes)) {
        if (nodes[id].cluster === _dragCluster) {
          nodes[id].x += dx;
          nodes[id].y += dy;
        }
      }
      _dragClusterStart = { x, y };
      render();
    } else if (_uimapDragging) {
      _didDrag = true;
      _uimapPan.x = e.clientX - _uimapDragStart.x;
      _uimapPan.y = e.clientY - _uimapDragStart.y;
      render();
    } else {
      // Hover detection
      const hovered = hitTest(x, y);
      if (hovered !== _uimapHover) {
        _uimapHover = hovered;
        canvas.style.cursor = hovered ? "pointer" : "grab";
        render();
      }
    }
  };

  canvas.onmouseup = canvas.onmouseleave = () => {
    _uimapDragNode = null;
    _dragCluster = null;
    _uimapDragging = false;
    canvas.style.cursor = "grab";
  };

  canvas.onclick = (e) => {
    // Suppress click if we just dragged
    if (_didDrag) { _didDrag = false; return; }
    if (!_uimapCanvasData) return;
    const { x, y } = canvasCoords(e);
    const hit = hitTest(x, y);
    if (hit) {
      uimapSelectedPageId = hit;
      // Only open page detail if not inside a modal (e.g. issue detail)
      if (!canvas.closest("#issue-modal")) {
        showUiMapPageDetail(nodes[hit].page, elements, forms, navs, pages);
      }
      render();
    }
  };

  // Zoom with mouse wheel
  canvas.onwheel = (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;

    const oldZoom = _uimapZoom;
    const delta = e.deltaY > 0 ? 0.96 : 1.04;
    _uimapZoom = Math.max(0.2, Math.min(3, _uimapZoom * delta));

    // Zoom toward mouse position
    _uimapPan.x = mx - (mx - _uimapPan.x) * (_uimapZoom / oldZoom);
    _uimapPan.y = my - (my - _uimapPan.y) * (_uimapZoom / oldZoom);
    render();
  };
}

function deleteUiMapPage(pageId) {
  fetch(API + "/api/uimaps/page/delete?id=" + encodeURIComponent(pageId), { method: "DELETE" })
    .then(r => r.json())
    .then(data => {
      if (data.deleted) {
        document.getElementById("uimap-detail-overlay").style.display = "none";
        uimapSelectedPageId = "";
        if (typeof renderUiMapsPage === "function") renderUiMapsPage();
      }
    });
}

function showUiMapPageDetail(page, elements, forms, navs, pages) {
  const overlay = document.getElementById("uimap-detail-overlay");
  const panel = document.getElementById("uimap-detail");
  if (!panel || !overlay) return;
  overlay.style.display = "block";

  const pageEls = elements.filter(e => e.page_id === page.id);
  const pageForms = forms.filter(f => f.page_id === page.id);
  const navsFrom = navs.filter(n => n.from_page_id === page.id);
  const navsTo = navs.filter(n => n.to_page_id === page.id);
  const pTickets = JSON.parse(page.ticket_ids || "[]");
  const relCode = JSON.parse(page.related_code || "[]");

  let h = '';

  // ── STICKY HEADER (doesn't scroll) ──
  h += '<div style="flex-shrink:0;padding:16px 20px 12px;border-bottom:1px solid var(--border);background:var(--surface)">';
  // Close + title row
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
  h += \`<div style="font-size:16px;font-weight:bold">\${esc(page.url_pattern)}</div>\`;
  h += '<div style="display:flex;gap:8px;align-items:center">';
  h += \`<button onclick="if(confirm('Delete this page and all its elements, forms, and navigations?')){deleteUiMapPage('\${page.id}')}" style="font-size:10px;color:var(--red);background:none;border:1px solid var(--border);border-radius:4px;padding:3px 8px;cursor:pointer" onmouseover="this.style.borderColor='var(--red)'" onmouseout="this.style.borderColor='var(--border)'">Delete Page</button>\`;
  h += '<span style="cursor:pointer;color:var(--dim);font-size:20px;padding:2px 8px;line-height:1" onclick="document.getElementById(\\'uimap-detail-overlay\\').style.display=\\'none\\'">&times;</span>';
  h += '</div></div>';
  if (page.page_title) h += \`<div style="font-size:12px;color:var(--dim);margin-bottom:8px">\${esc(page.page_title)}</div>\`;
  // Badges
  const pColor = page.status === "active" ? "var(--green)" : page.status === "changed" ? "var(--yellow)" : "var(--red)";
  h += '<div style="display:flex;gap:4px;flex-wrap:wrap">';
  h += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:\${pColor}">\${page.status.toUpperCase()}</span>\`;
  if (page.auth_required) h += '<span class="tc-detail-badge" style="background:rgba(248,81,73,0.1);color:var(--red)">AUTH</span>';
  h += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:var(--accent)">\${pageEls.length} elements</span>\`;
  h += \`<span class="tc-detail-badge" style="background:rgba(188,140,255,0.1);color:var(--purple)">\${pageForms.length} forms</span>\`;
  h += \`<span class="tc-detail-badge" style="background:rgba(88,166,255,0.1);color:var(--accent)">\${navsFrom.length + navsTo.length} navs</span>\`;
  for (const j of pTickets) h += \`<span class="tc-detail-badge" style="background:rgba(210,153,34,0.1);color:var(--yellow)">\${esc(j)}</span>\`;
  h += '</div>';
  h += '</div>';

  // ── SCROLLABLE BODY ──
  h += '<div style="flex:1;overflow-y:auto;padding:16px 20px">';

  // ── PAGE ELEMENT MAP (sitemap-style canvas showing elements as nodes) ──
  if (pageEls.length > 0 || pageForms.length > 0) {
    h += '<div style="margin-bottom:16px;border:1px solid var(--border);border-radius:8px;overflow:hidden;background:var(--bg)">';
    h += '<div style="padding:6px 12px;font-size:10px;color:var(--dim);border-bottom:1px solid var(--border);display:flex;justify-content:space-between"><span>Page Element Map</span><span>' + pageEls.length + ' elements · ' + pageForms.length + ' forms</span></div>';
    h += '<canvas id="page-element-canvas" style="width:100%;height:360px;display:block"></canvas>';
    h += '</div>';
  }

  // ── Two columns: screenshot left, details right ──
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';

  // ── LEFT COLUMN: screenshot + snapshot ──
  h += '<div>';

  // Screenshot
  if (page.screenshot_path) {
    const imgUrl = API + "/api/artifact?path=" + encodeURIComponent(page.screenshot_path);
    h += '<div style="margin-bottom:12px;border:1px solid var(--border);border-radius:6px;overflow:hidden;cursor:pointer" onclick="window.open(\\'' + imgUrl + '\\',\\'_blank\\')">';
    h += \`<img src="\${imgUrl}" style="width:100%;object-fit:contain;display:block;background:var(--bg)" onerror="this.parentElement.style.display=\\'none\\'" />\`;
    h += '</div>';
  }

  // Snapshot (accessibility tree — collapsible)
  if (page.snapshot_path) {
    h += '<div style="margin-bottom:12px">';
    h += '<div style="font-size:10px;color:var(--dim);cursor:pointer;padding:4px 0" onclick="const el=this.nextSibling;el.style.display=el.style.display===\\'none\\'?\\'block\\':\\'none\\'">Accessibility Snapshot (click to toggle)</div>';
    h += '<div style="display:none"><iframe src="' + API + '/api/artifact?path=' + encodeURIComponent(page.snapshot_path) + '" style="width:100%;height:300px;border:1px solid var(--border);border-radius:4px;background:var(--bg)"></iframe></div>';
    h += '</div>';
  }

  // Navigations
  if (navsFrom.length > 0 || navsTo.length > 0) {
    h += '<div style="margin-bottom:12px"><div style="font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:6px">Navigations</div>';
    for (const n of navsFrom) {
      const to = pages.find(p => p.id === n.to_page_id);
      const via = n.via_element_id ? elements.find(e => e.id === n.via_element_id) : null;
      h += \`<div style="padding:3px 0;font-size:11px">→ <span style="color:var(--accent)">\${esc(to?.url_pattern || "?")}</span>
        \${via ? \`<span style="color:var(--dim);margin-left:4px">via \${esc(via.element_text || via.selector.slice(0, 25))}</span>\` : ""}
        <span style="color:var(--dim);font-size:9px;margin-left:4px">\${esc(n.nav_type)} x\${n.times_used}</span>
      </div>\`;
    }
    for (const n of navsTo) {
      const from = pages.find(p => p.id === n.from_page_id);
      h += \`<div style="padding:3px 0;font-size:11px">← <span style="color:var(--accent)">\${esc(from?.url_pattern || "?")}</span>
        <span style="color:var(--dim);font-size:9px;margin-left:4px">\${esc(n.nav_type)} x\${n.times_used}</span>
      </div>\`;
    }
    h += '</div>';
  }

  // Code references
  if (relCode.length > 0) {
    h += '<div style="margin-bottom:12px"><div style="font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:6px">Related Code</div>';
    for (const c of relCode) h += \`<div style="font-size:10px;color:var(--dim);word-break:break-all">\${esc(c)}</div>\`;
    h += '</div>';
  }

  h += '</div>'; // end left column

  // ── RIGHT COLUMN: elements + forms ──
  h += '<div>';

  // Empty state
  if (pageEls.length === 0 && pageForms.length === 0) {
    h += '<div style="padding:24px;text-align:center;color:var(--dim);font-size:12px;border:1px dashed var(--border);border-radius:6px">';
    h += 'No elements or forms recorded yet.<br>';
    h += '<span style="font-size:11px">Run <code>uimap scan</code> to populate.</span>';
    h += '</div>';
  }

  // Elements
  if (pageEls.length > 0) {
    h += '<div style="margin-bottom:12px"><div style="font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:6px">Elements (' + pageEls.length + ')</div>';
    for (const e of pageEls) {
      const sc = e.status === "working" ? "var(--green)" : e.status === "flaky" ? "var(--yellow)" : "var(--red)";
      const rel = e.times_used > 0 ? Math.round(e.times_succeeded / e.times_used * 100) + "%" : "new";
      h += \`<div style="padding:3px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="color:\${sc};font-weight:600;font-size:9px">\${esc(e.status).toUpperCase()}</span>
        <span style="color:var(--accent);margin-left:4px">\${esc(e.element_type)}</span>
        <span style="margin-left:4px">\${esc(e.element_text || "")}</span>
        <span style="float:right;color:var(--dim);font-size:9px">\${rel}</span>
        <div style="font-size:9px;color:var(--dim);margin-top:1px;word-break:break-all">\${esc(e.selector)}</div>
        \${e.action_type ? \`<div style="font-size:9px;color:var(--dim)">\${esc(e.action_type)}\${e.action_result ? " → " + esc(e.action_result) : ""}</div>\` : ""}
      </div>\`;
    }
    h += '</div>';
  }

  // Forms
  if (pageForms.length > 0) {
    h += '<div style="margin-bottom:12px"><div style="font-size:11px;color:var(--dim);font-weight:600;text-transform:uppercase;margin-bottom:6px">Forms (' + pageForms.length + ')</div>';
    for (const f of pageForms) {
      let fields = [];
      try { fields = JSON.parse(f.fields || "[]"); } catch {}
      h += \`<div style="padding:4px 0;border-bottom:1px solid var(--border);font-size:11px">
        <span style="color:var(--accent)">\${esc(f.form_selector || f.form_name || "form")}</span>
        <span style="color:var(--dim);margin-left:4px">\${fields.length} fields</span>\`;
      if (fields.length > 0) {
        h += '<div style="margin-top:4px;padding-left:8px">';
        for (const fld of fields) {
          h += \`<div style="font-size:10px;color:var(--dim)">• \${esc(fld.label || fld.inputType || "field")} <span style="color:var(--purple)">[\${esc(fld.inputType || "text")}]</span></div>\`;
        }
        h += '</div>';
      }
      h += \`\${f.success_indicator ? \`<div style="color:var(--green);font-size:10px;margin-top:2px">✓ \${esc(f.success_indicator)}</div>\` : ""}
        \${f.error_indicator ? \`<div style="color:var(--red);font-size:10px">✗ \${esc(f.error_indicator)}</div>\` : ""}
      </div>\`;
    }
    h += '</div>';
  }

  h += '</div>'; // end right column
  h += '</div>'; // end grid
  h += '</div>'; // end scrollable body

  panel.innerHTML = h;

  // Render page element map canvas
  requestAnimationFrame(() => {
    const c = document.getElementById("page-element-canvas");
    if (c) drawPageElementMap(c, pageEls, pageForms, page, navsFrom, pages);
  });
}

// ── Page Element Map: zone-based with screenshot bg ──
let _pemPan = { x: 0, y: 0 };
let _pemZoom = 1;
let _pemDragging = false;
let _pemDragStart = { x: 0, y: 0 };
let _pemDragNode = null;
let _pemHover = null;

function drawPageElementMap(canvas, els, forms, page, navsFrom, allPages) {
  const elements = els || [];
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  const W = rect.width, H = rect.height;
  _pemPan = { x: 0, y: 0 }; _pemZoom = 1;

  const typeColors = {
    button: { bg: "rgba(88,166,255,0.85)", border: "#58a6ff" },
    link: { bg: "rgba(88,166,255,0.55)", border: "#58a6ff" },
    input: { bg: "rgba(63,185,80,0.8)", border: "#3fb950" },
    select: { bg: "rgba(63,185,80,0.65)", border: "#3fb950" },
    checkbox: { bg: "rgba(210,153,34,0.8)", border: "#d29922" },
    radio: { bg: "rgba(210,153,34,0.8)", border: "#d29922" },
    tab: { bg: "rgba(188,140,255,0.8)", border: "#bc8cff" },
    menu: { bg: "rgba(188,140,255,0.65)", border: "#bc8cff" },
    image: { bg: "rgba(125,133,144,0.6)", border: "#7d8590" },
    text: { bg: "rgba(125,133,144,0.45)", border: "#7d8590" },
  };
  const defaultTC = { bg: "rgba(125,133,144,0.5)", border: "#7d8590" };
  const typeOrder = ["button", "link", "input", "select", "checkbox", "radio", "tab", "menu", "image", "text", "other"];

  // Group by type, keep original order within each group
  const groups = {};
  const formFieldIds = new Set();
  for (const f of (forms || [])) {
    try { for (const fld of JSON.parse(f.fields || "[]")) if (fld.elementId) formFieldIds.add(fld.elementId); } catch {}
    if (f.submit_element_id) formFieldIds.add(f.submit_element_id);
  }
  // Form elements get their own group
  for (const el of elements) {
    const g = formFieldIds.has(el.id) ? "form" : (el.element_type || "other");
    if (!groups[g]) groups[g] = [];
    groups[g].push(el);
  }
  const sortedGroups = Object.keys(groups).sort((a, b) => {
    if (a === "form") return -1; if (b === "form") return 1;
    const ai = typeOrder.indexOf(a), bi = typeOrder.indexOf(b);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi);
  });

  // Layout: columns per type, elements listed vertically
  const nodes = {};
  const nodeH = 24, nodeGap = 5, colGap = 14, headerH = 20, padX = 12, padY = 12;
  const colW = Math.min(180, sortedGroups.length > 0 ? (W - padX * 2 - colGap * (sortedGroups.length - 1)) / sortedGroups.length : 180);
  let cx = padX;
  for (const g of sortedGroups) {
    let cy = padY + headerH;
    for (const el of groups[g]) {
      nodes[el.id] = { el, x: cx, y: cy, w: colW, h: nodeH, group: g };
      cy += nodeH + nodeGap;
    }
    cx += colW + colGap;
  }

  const ids = Object.keys(nodes);

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(_pemPan.x, _pemPan.y);
    ctx.scale(_pemZoom, _pemZoom);

    // Column headers
    let hx = padX;
    for (const g of sortedGroups) {
      const tc = typeColors[g] || defaultTC;
      ctx.fillStyle = tc.border;
      ctx.font = "bold 9px -apple-system, monospace";
      ctx.fillText(g.toUpperCase() + " (" + groups[g].length + ")", hx, padY + 10);
      // Column background
      const colH = headerH + groups[g].length * (nodeH + nodeGap) + 4;
      ctx.fillStyle = "rgba(22,27,34,0.3)";
      ctx.beginPath(); ctx.roundRect(hx - 4, padY + headerH - 6, colW + 8, colH, 6); ctx.fill();
      hx += colW + colGap;
    }

    // Element chips
    for (const id of ids) {
      const n = nodes[id], el = n.el;
      const tc = typeColors[el.element_type] || defaultTC;
      const isHov = _pemHover === id;

      // Reliability color
      let bg = tc.bg;
      if (el.times_used > 0) {
        const pct = el.times_succeeded / el.times_used;
        bg = pct >= 0.8 ? "rgba(63,185,80,0.85)" : pct >= 0.5 ? "rgba(210,153,34,0.85)" : "rgba(248,81,73,0.85)";
      }

      if (isHov) { ctx.shadowColor = tc.border; ctx.shadowBlur = 8; }
      ctx.fillStyle = bg;
      ctx.strokeStyle = isHov ? "#fff" : tc.border;
      ctx.lineWidth = isHov ? 1.5 : 0.5;
      ctx.beginPath(); ctx.roundRect(n.x, n.y, n.w, n.h, 4); ctx.fill(); ctx.stroke();
      ctx.shadowColor = "transparent"; ctx.shadowBlur = 0;

      // Status stripe
      if (el.status === "broken") { ctx.fillStyle = "#f85149"; ctx.fillRect(n.x, n.y, 3, n.h); }
      else if (el.status === "flaky") { ctx.fillStyle = "#d29922"; ctx.fillRect(n.x, n.y, 3, n.h); }

      // Label
      ctx.fillStyle = "#fff";
      ctx.font = "10px -apple-system, monospace";
      const label = el.element_text || el.element_name || el.selector.split('"')[1] || el.element_type;
      const mc = Math.floor((n.w - 30) / 6);
      ctx.fillText(label.length > mc ? label.slice(0, mc - 1) + "…" : label, n.x + 6, n.y + 15);

      // Reliability %
      if (el.times_used > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.6)";
        ctx.font = "bold 7px -apple-system, monospace";
        ctx.fillText(Math.round(el.times_succeeded / el.times_used * 100) + "%", n.x + n.w - 22, n.y + 10);
      }

      // Nav exit indicator
      if (el.action_result && el.action_result.startsWith("navigates to ")) {
        ctx.fillStyle = "rgba(88,166,255,0.7)";
        ctx.font = "7px -apple-system, monospace";
        ctx.fillText("→ " + el.action_result.slice(13, 28), n.x + 6, n.y + n.h + 8);
      }
    }

    // Form flow arrows
    for (const f of (forms || [])) {
      let fields = []; try { fields = JSON.parse(f.fields || "[]"); } catch {}
      const sub = f.submit_element_id ? nodes[f.submit_element_id] : null;
      if (sub && fields.length > 0) {
        ctx.strokeStyle = "rgba(188,140,255,0.3)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        for (const fld of fields) {
          const fn = fld.elementId ? nodes[fld.elementId] : null;
          if (fn) { ctx.beginPath(); ctx.moveTo(fn.x + fn.w, fn.y + fn.h / 2); ctx.lineTo(sub.x, sub.y + sub.h / 2); ctx.stroke(); }
        }
        ctx.setLineDash([]);
        if (f.success_indicator) { ctx.fillStyle = "rgba(63,185,80,0.6)"; ctx.font = "8px -apple-system, monospace"; ctx.fillText("✓ " + f.success_indicator.slice(0, 25), sub.x, sub.y + sub.h + 10); }
        if (f.error_indicator) { ctx.fillStyle = "rgba(248,81,73,0.6)"; ctx.font = "8px -apple-system, monospace"; ctx.fillText("✗ " + f.error_indicator.slice(0, 25), sub.x, sub.y + sub.h + 20); }
      }
    }

    ctx.restore();
    ctx.fillStyle = "rgba(125,133,144,0.4)"; ctx.font = "9px -apple-system, monospace";
    ctx.fillText(Math.round(_pemZoom * 100) + "% · drag to pan · scroll to zoom", 8, H - 6);
  }

  render();
  if (ids.length > 0) {
    let mnX = Infinity, mnY = Infinity, mxX = -Infinity, mxY = -Infinity;
    for (const id of ids) { const n = nodes[id]; mnX = Math.min(mnX, n.x); mnY = Math.min(mnY, n.y); mxX = Math.max(mxX, n.x + n.w); mxY = Math.max(mxY, n.y + n.h + 14); }
    const gw = mxX - mnX + 30, gh = mxY - mnY + 30;
    _pemZoom = Math.min(1.5, Math.min(W / gw, H / gh));
    _pemPan.x = (W - gw * _pemZoom) / 2 - mnX * _pemZoom + 15 * _pemZoom;
    _pemPan.y = (H - gh * _pemZoom) / 2 - mnY * _pemZoom + 15 * _pemZoom;
    render();
  }

  function coords(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left - _pemPan.x) / _pemZoom, y: (e.clientY - r.top - _pemPan.y) / _pemZoom }; }
  function hit(mx, my) { for (const id of ids) { const n = nodes[id]; if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) return id; } return null; }
  let _pemDidDrag = false;
  canvas.onmousedown = (e) => {
    _pemDidDrag = false;
    const { x, y } = coords(e);
    const h = hit(x, y);
    if (h) { _pemDragNode = h; _pemDragStart = { x: x - nodes[h].x, y: y - nodes[h].y }; canvas.style.cursor = "move"; }
    else { _pemDragging = true; _pemDragStart = { x: e.clientX - _pemPan.x, y: e.clientY - _pemPan.y }; canvas.style.cursor = "grabbing"; }
  };
  canvas.onmousemove = (e) => {
    const { x, y } = coords(e);
    if (_pemDragNode) { _pemDidDrag = true; nodes[_pemDragNode].x = x - _pemDragStart.x; nodes[_pemDragNode].y = y - _pemDragStart.y; render(); }
    else if (_pemDragging) { _pemDidDrag = true; _pemPan.x = e.clientX - _pemDragStart.x; _pemPan.y = e.clientY - _pemDragStart.y; render(); }
    else { const h = hit(x, y); if (h !== _pemHover) { _pemHover = h; canvas.style.cursor = h ? "pointer" : "grab"; render(); } }
  };
  canvas.onmouseup = canvas.onmouseleave = () => { _pemDragNode = null; _pemDragging = false; canvas.style.cursor = "grab"; };
  canvas.onwheel = (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const old = _pemZoom;
    _pemZoom = Math.max(0.2, Math.min(3, _pemZoom * (e.deltaY > 0 ? 0.96 : 1.04)));
    _pemPan.x = mx - (mx - _pemPan.x) * (_pemZoom / old);
    _pemPan.y = my - (my - _pemPan.y) * (_pemZoom / old);
    render();
  };
}
`;
}
