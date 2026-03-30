/**
 * Shared canvas utilities injected into the dashboard HTML.
 * Used by both UI Map and API Map canvas renderers.
 */
export function getCanvasBaseScript(): string {
  return `
// ── Shared Canvas Utilities ──

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

function initCanvas(canvasId) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return null;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);
  return { canvas, ctx, W: rect.width, H: rect.height };
}

function screenToWorld(sx, sy, pan, zoom) {
  return { x: (sx - pan.x) / zoom, y: (sy - pan.y) / zoom };
}

function canvasCoords(e, canvas, pan, zoom) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left - pan.x) / zoom,
    y: (e.clientY - r.top - pan.y) / zoom,
  };
}

function hitTestNodes(mx, my, nodes, centered) {
  for (const id of Object.keys(nodes)) {
    const n = nodes[id];
    const x0 = centered ? n.x - n.w / 2 : n.x;
    const y0 = centered ? n.y - n.h / 2 : n.y;
    if (mx >= x0 && mx <= x0 + n.w && my >= y0 && my <= y0 + n.h) return id;
  }
  return null;
}

function setupPanZoom(canvas, panState, zoomState, opts) {
  const getZoom = () => zoomState.value;
  const setZoom = (v) => { zoomState.value = Math.max(0.2, Math.min(3, v)); };

  let dragging = false;
  let dragStart = { x: 0, y: 0 };
  let dragNode = null;
  let didDrag = false;

  canvas.onmousedown = (e) => {
    didDrag = false;
    const w = canvasCoords(e, canvas, panState, getZoom());
    const centered = opts && opts.centered;
    const hit = hitTestNodes(w.x, w.y, opts.nodes(), centered);
    if (hit) {
      dragNode = hit;
      const n = opts.nodes()[hit];
      dragStart = centered
        ? { x: w.x - n.x, y: w.y - n.y }
        : { x: w.x - n.x, y: w.y - n.y };
      canvas.style.cursor = "move";
      if (opts.onDragStart) opts.onDragStart(hit);
    } else if (opts.onEmptyDown) {
      const result = opts.onEmptyDown(e, w);
      if (result === false) return;
      dragging = true;
      dragStart = { x: e.clientX - panState.x, y: e.clientY - panState.y };
      canvas.style.cursor = "grabbing";
    } else {
      dragging = true;
      dragStart = { x: e.clientX - panState.x, y: e.clientY - panState.y };
      canvas.style.cursor = "grabbing";
    }
  };

  canvas.onmousemove = (e) => {
    const w = canvasCoords(e, canvas, panState, getZoom());
    if (dragNode) {
      didDrag = true;
      const n = opts.nodes()[dragNode];
      n.x = w.x - dragStart.x;
      n.y = w.y - dragStart.y;
      if (opts.onDrag) opts.onDrag(dragNode);
    } else if (dragging) {
      didDrag = true;
      panState.x = e.clientX - dragStart.x;
      panState.y = e.clientY - dragStart.y;
    } else {
      const centered = opts && opts.centered;
      const hovered = hitTestNodes(w.x, w.y, opts.nodes(), centered);
      canvas.style.cursor = hovered ? "pointer" : "grab";
      if (opts.onHover) opts.onHover(hovered);
    }
  };

  canvas.onmouseup = canvas.onmouseleave = () => {
    dragNode = null;
    dragging = false;
    canvas.style.cursor = "grab";
    if (opts.onDragEnd) opts.onDragEnd();
  };

  canvas.onclick = (e) => {
    if (didDrag) { didDrag = false; return; }
    const w = canvasCoords(e, canvas, panState, getZoom());
    const centered = opts && opts.centered;
    const hit = hitTestNodes(w.x, w.y, opts.nodes(), centered);
    if (hit && opts.onClick) opts.onClick(hit);
  };

  canvas.onwheel = (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const oldZoom = getZoom();
    const delta = e.deltaY > 0 ? 0.94 : 1.06;
    setZoom(oldZoom * delta);
    const newZoom = getZoom();
    panState.x = mx - (mx - panState.x) * (newZoom / oldZoom);
    panState.y = my - (my - panState.y) * (newZoom / oldZoom);
  };

  return { getDragNode: () => dragNode, getDidDrag: () => didDrag };
}

// ── Force simulation (shared between UI and API maps) ──

function runForceSimulation(nodes, ids, edges, opts) {
  if (ids.length === 0) return;
  const REPULSION = opts.repulsion || 6000;
  const ATTRACTION = opts.attraction || 0.006;
  const CLUSTER_FORCE = opts.clusterForce || 0.025;
  const DAMPING = opts.damping || 0.85;
  const W = opts.W || 800;
  const H = opts.H || 600;

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
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = dist * ATTRACTION;
    const fx = (dx / dist) * force, fy = (dy / dist) * force;
    a.vx += fx; a.vy += fy;
    b.vx -= fx; b.vy -= fy;
  }

  // Cluster attraction
  if (CLUSTER_FORCE > 0) {
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

function autoFitCanvas(nodes, W, H, panState, zoomState, renderFn) {
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
  zoomState.value = Math.min(1.5, Math.min(W / graphW, H / graphH));
  panState.x = (W - graphW * zoomState.value) / 2 - minX * zoomState.value + 40 * zoomState.value;
  panState.y = (H - graphH * zoomState.value) / 2 - minY * zoomState.value + 40 * zoomState.value;
  if (renderFn) renderFn();
}

function drawArrowhead(ctx, fromX, fromY, toX, toY, size, color) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(toX - Math.cos(angle - 0.4) * size, toY - Math.sin(angle - 0.4) * size);
  ctx.lineTo(toX - Math.cos(angle + 0.4) * size, toY - Math.sin(angle + 0.4) * size);
  ctx.closePath();
  ctx.fill();
}
`;
}
