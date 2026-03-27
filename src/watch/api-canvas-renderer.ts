export function getApiCanvasRendererScript(): string {
  return `
// ── API Map force-directed canvas ──
let _apiCanvasData = null;
let _apiPan = { x: 0, y: 0 };
let _apiZoom = 1;
let _apiDragging = false;
let _apiDragStart = { x: 0, y: 0 };
let _apiDragNode = null;
let _apiHover = null;
let _apiAnimFrame = null;
let _apiSearch = "";
let apiSelectedEndpointId = null;

const METHOD_COLORS = {
  GET: "#3fb950", POST: "#58a6ff", PUT: "#d29922",
  PATCH: "#db6d28", DELETE: "#f85149", HEAD: "#7d8590", OPTIONS: "#bc8cff"
};

function drawApiMapCanvas(endpoints, params, responses, chains, canvasId) {
  const canvas = document.getElementById(canvasId || "apimap-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;

  // ── Build nodes from endpoints ──
  const nodes = {};
  const minW = 130, maxW = 200, minH = 40, maxH = 65;
  const maxParams = Math.max(1, ...endpoints.map(e => params.filter(p => p.endpoint_id === e.id).length));

  for (const ep of endpoints) {
    const epParams = params.filter(p => p.endpoint_id === ep.id);
    const epResponses = responses.filter(r => r.endpoint_id === ep.id);
    const t = maxParams > 0 ? epParams.length / maxParams : 0;
    const w = minW + t * (maxW - minW);
    const h = minH + t * (maxH - minH);

    // Cluster by resource: /api/users/:id → /api/users
    const pathParts = ep.path.split("/").filter(Boolean);
    const cluster = pathParts.length >= 2 ? "/" + pathParts[0] + "/" + pathParts[1] : "/" + (pathParts[0] || "");

    const successRate = ep.times_called > 0 ? ep.times_succeeded / ep.times_called : 1;

    nodes[ep.id] = {
      ep, paramCount: epParams.length, responseCount: epResponses.length,
      w, h, cluster, successRate,
      x: W / 2 + (Math.random() - 0.5) * W * 0.6,
      y: H / 2 + (Math.random() - 0.5) * H * 0.6,
      vx: 0, vy: 0,
    };
  }

  // Build edges from chains
  const edges = [];
  for (const c of chains) {
    if (nodes[c.from_endpoint_id] && nodes[c.to_endpoint_id]) {
      edges.push({ from: c.from_endpoint_id, to: c.to_endpoint_id, chain: c });
    }
  }

  // Split connected vs disconnected
  const connectedIds = new Set();
  for (const e of edges) { connectedIds.add(e.from); connectedIds.add(e.to); }
  const disconnectedIds = Object.keys(nodes).filter(id => !connectedIds.has(id));
  const forceIds = Object.keys(nodes).filter(id => connectedIds.has(id));

  // Position disconnected on the left
  let listY = 40;
  for (const id of disconnectedIds) {
    nodes[id].x = 30;
    nodes[id].y = listY;
    listY += nodes[id].h + 10;
  }

  // Cluster-based initial positioning for force layout
  if (forceIds.length > 0) {
    const clusters = {};
    for (const id of forceIds) {
      const c = nodes[id].cluster;
      if (!clusters[c]) clusters[c] = { count: 0, idx: Object.keys(clusters).length };
      clusters[c].count++;
    }
    const clusterCount = Object.keys(clusters).length;
    const offsetX = disconnectedIds.length > 0 ? 250 : 0;
    for (const id of forceIds) {
      const ci = clusters[nodes[id].cluster].idx;
      const angle = (ci / Math.max(1, clusterCount)) * Math.PI * 2;
      const radius = Math.min(W, H) * 0.25;
      nodes[id].x = W / 2 + offsetX + Math.cos(angle) * radius + (Math.random() - 0.5) * 60;
      nodes[id].y = H / 2 + Math.sin(angle) * radius + (Math.random() - 0.5) * 60;
    }
  }

  _apiCanvasData = { nodes, endpoints, params, responses, chains, edges };

  // ── Force simulation ──
  let simRunning = forceIds.length > 0;
  let simTick = 0;
  const SIM_TICKS = 200;

  function simulate() {
    const ids = forceIds;
    if (ids.length === 0) return;
    const REPULSION = 6000;
    const ATTRACTION = 0.006;
    const CLUSTER_FORCE = 0.025;
    const DAMPING = 0.85;

    for (const id of ids) { nodes[id].vx = 0; nodes[id].vy = 0; }

    // Repulsion
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = nodes[ids[i]], b = nodes[ids[j]];
        let dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = REPULSION / (dist * dist);
        const fx = (dx / dist) * force, fy = (dy / dist) * force;
        a.vx -= fx; a.vy -= fy;
        b.vx += fx; b.vy += fy;
      }
    }

    // Attraction along edges
    for (const e of edges) {
      const a = nodes[e.from], b = nodes[e.to];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = dist * ATTRACTION;
      const fx = (dx / dist) * force, fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    // Cluster attraction
    const cc = {};
    for (const id of ids) {
      const c = nodes[id].cluster;
      if (!cc[c]) cc[c] = { x: 0, y: 0, count: 0 };
      cc[c].x += nodes[id].x; cc[c].y += nodes[id].y; cc[c].count++;
    }
    for (const c of Object.keys(cc)) { cc[c].x /= cc[c].count; cc[c].y /= cc[c].count; }
    for (const id of ids) {
      const center = cc[nodes[id].cluster];
      nodes[id].vx += (center.x - nodes[id].x) * CLUSTER_FORCE;
      nodes[id].vy += (center.y - nodes[id].y) * CLUSTER_FORCE;
    }

    // Center gravity
    for (const id of ids) {
      nodes[id].vx += (W / 2 - nodes[id].x) * 0.001;
      nodes[id].vy += (H / 2 - nodes[id].y) * 0.001;
    }

    // Apply
    for (const id of ids) {
      nodes[id].vx *= DAMPING; nodes[id].vy *= DAMPING;
      nodes[id].x += nodes[id].vx; nodes[id].y += nodes[id].vy;
      nodes[id].x = Math.max(20, Math.min(W - 20, nodes[id].x));
      nodes[id].y = Math.max(20, Math.min(H - 20, nodes[id].y));
    }
  }

  // ── Draw ──
  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    ctx.translate(_apiPan.x, _apiPan.y);
    ctx.scale(_apiZoom, _apiZoom);

    // Draw edges (chains) with arrows
    for (const e of edges) {
      const a = nodes[e.from], b = nodes[e.to];
      const chainColor = e.chain.chain_type === "cleanup" ? "#f85149" :
                         e.chain.chain_type === "creates" ? "#3fb950" :
                         e.chain.chain_type === "deletes" ? "#f85149" : "#30363d";
      ctx.strokeStyle = chainColor;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      // Arrow head
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      const arrowX = b.x - Math.cos(angle) * (b.w / 2 + 5);
      const arrowY = b.y - Math.sin(angle) * (b.h / 2 + 5);
      ctx.fillStyle = chainColor;
      ctx.beginPath();
      ctx.moveTo(arrowX, arrowY);
      ctx.lineTo(arrowX - Math.cos(angle - 0.4) * 10, arrowY - Math.sin(angle - 0.4) * 10);
      ctx.lineTo(arrowX - Math.cos(angle + 0.4) * 10, arrowY - Math.sin(angle + 0.4) * 10);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw nodes
    for (const id of Object.keys(nodes)) {
      const n = nodes[id];
      const ep = n.ep;
      const isHover = _apiHover === id;
      const isSelected = apiSelectedEndpointId === id;
      const mc = METHOD_COLORS[ep.method] || "#7d8590";

      // Node background
      const statusColor = ep.status === "failing" ? "rgba(248,81,73,0.15)" :
                          ep.status === "flaky" ? "rgba(210,153,34,0.15)" : "rgba(22,27,34,0.9)";
      ctx.fillStyle = statusColor;
      ctx.strokeStyle = isSelected ? "#58a6ff" : isHover ? "#58a6ff" : "#30363d";
      ctx.lineWidth = isSelected ? 2.5 : isHover ? 2 : 1;
      const rx = n.x - n.w / 2, ry = n.y - n.h / 2;
      roundRect(ctx, rx, ry, n.w, n.h, 6);

      // Method badge
      ctx.fillStyle = mc;
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "left";
      ctx.fillText(ep.method, rx + 6, ry + 13);

      // Path
      ctx.fillStyle = "#e6edf3";
      ctx.font = "11px -apple-system, monospace";
      const shortPath = ep.path.length > 22 ? ep.path.slice(0, 20) + "…" : ep.path;
      ctx.fillText(shortPath, rx + 6, ry + 27);

      // Stats line
      ctx.fillStyle = "#7d8590";
      ctx.font = "9px -apple-system, sans-serif";
      let statsText = "";
      if (ep.times_called > 0) {
        statsText = ep.times_called + " calls";
        if (ep.avg_response_ms > 0) statsText += " · " + Math.round(ep.avg_response_ms) + "ms";
      } else {
        statsText = n.paramCount + " params · " + n.responseCount + " responses";
      }
      ctx.fillText(statsText, rx + 6, ry + n.h - 6);

      // Health indicator dot
      if (ep.times_called > 0) {
        const dotColor = ep.status === "failing" ? "#f85149" : ep.status === "flaky" ? "#d29922" : "#3fb950";
        ctx.fillStyle = dotColor;
        ctx.beginPath();
        ctx.arc(rx + n.w - 10, ry + 10, 4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Hover tooltip
      if (isHover && !_apiDragNode) {
        const ttX = rx + n.w + 8, ttY = ry;
        ctx.fillStyle = "rgba(22,27,34,0.95)";
        ctx.strokeStyle = "#30363d";
        ctx.lineWidth = 1;
        roundRect(ctx, ttX, ttY, 220, 100, 6);

        ctx.fillStyle = mc;
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "left";
        ctx.fillText(ep.method + " " + ep.path, ttX + 8, ttY + 16);

        ctx.fillStyle = "#7d8590";
        ctx.font = "10px -apple-system, sans-serif";
        if (ep.summary) ctx.fillText(ep.summary.slice(0, 35), ttX + 8, ttY + 32);
        ctx.fillText("Auth: " + (ep.auth_type || "none"), ttX + 8, ttY + 48);
        ctx.fillText("Calls: " + ep.times_called + " (" + ep.times_succeeded + " ok, " + ep.times_failed + " fail)", ttX + 8, ttY + 62);
        if (ep.avg_response_ms > 0) ctx.fillText("Avg: " + Math.round(ep.avg_response_ms) + "ms", ttX + 8, ttY + 76);
        ctx.fillText("Status: " + ep.status, ttX + 8, ttY + 90);
      }
    }

    // Cluster labels
    const clusterPositions = {};
    for (const id of Object.keys(nodes)) {
      const n = nodes[id];
      if (!clusterPositions[n.cluster]) clusterPositions[n.cluster] = { x: 0, y: 0, count: 0 };
      clusterPositions[n.cluster].x += n.x;
      clusterPositions[n.cluster].y += n.y;
      clusterPositions[n.cluster].count++;
    }
    ctx.fillStyle = "rgba(88,166,255,0.3)";
    ctx.font = "bold 10px -apple-system, sans-serif";
    ctx.textAlign = "center";
    for (const [label, pos] of Object.entries(clusterPositions)) {
      const cp = pos;
      ctx.fillText(label, cp.x / cp.count, cp.y / cp.count - 45);
    }

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // ── Animation loop ──
  function tick() {
    if (simRunning && simTick < SIM_TICKS) {
      simulate();
      simTick++;
      if (simTick >= SIM_TICKS) simRunning = false;
    }
    draw();
    _apiAnimFrame = requestAnimationFrame(tick);
  }
  if (_apiAnimFrame) cancelAnimationFrame(_apiAnimFrame);
  tick();

  // ── Mouse interaction ──
  function screenToWorld(sx, sy) {
    return { x: (sx - _apiPan.x) / _apiZoom, y: (sy - _apiPan.y) / _apiZoom };
  }

  function hitTest(mx, my) {
    for (const id of Object.keys(nodes)) {
      const n = nodes[id];
      if (mx >= n.x - n.w / 2 && mx <= n.x + n.w / 2 && my >= n.y - n.h / 2 && my <= n.y + n.h / 2) return id;
    }
    return null;
  }

  canvas.onmousedown = (e) => {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - r.left, e.clientY - r.top);
    const hit = hitTest(w.x, w.y);
    if (hit) {
      _apiDragNode = hit;
      simRunning = false;
    } else {
      _apiDragging = true;
      _apiDragStart = { x: e.clientX - _apiPan.x, y: e.clientY - _apiPan.y };
    }
  };

  canvas.onmousemove = (e) => {
    const r = canvas.getBoundingClientRect();
    if (_apiDragNode) {
      const w = screenToWorld(e.clientX - r.left, e.clientY - r.top);
      nodes[_apiDragNode].x = w.x;
      nodes[_apiDragNode].y = w.y;
    } else if (_apiDragging) {
      _apiPan.x = e.clientX - _apiDragStart.x;
      _apiPan.y = e.clientY - _apiDragStart.y;
    } else {
      const w = screenToWorld(e.clientX - r.left, e.clientY - r.top);
      _apiHover = hitTest(w.x, w.y);
      canvas.style.cursor = _apiHover ? "pointer" : "grab";
    }
  };

  canvas.onmouseup = () => {
    if (_apiDragNode) {
      _apiDragNode = null;
    }
    _apiDragging = false;
  };

  canvas.onclick = (e) => {
    const r = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - r.left, e.clientY - r.top);
    const hit = hitTest(w.x, w.y);
    if (hit && !_apiDragNode) {
      apiSelectedEndpointId = hit;
      if (typeof onApiEndpointSelect === "function") onApiEndpointSelect(hit);
    }
  };

  canvas.onwheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    _apiPan.x = mx - (mx - _apiPan.x) * delta;
    _apiPan.y = my - (my - _apiPan.y) * delta;
    _apiZoom *= delta;
    _apiZoom = Math.max(0.2, Math.min(3, _apiZoom));
  };
}
`;
}
