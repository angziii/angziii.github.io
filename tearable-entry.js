(function () {
  const overlay = document.getElementById("tearable-entry");
  const canvas = document.getElementById("tearable-canvas");
  const skip = document.getElementById("tearable-skip");

  if (!overlay || !canvas) return;

  const ctx = canvas.getContext("2d", { alpha: true });
  const paper = document.createElement("canvas");
  const paperCtx = paper.getContext("2d");
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const COLS = window.matchMedia("(max-width: 700px)").matches ? 18 : 30;
  const ROWS = window.matchMedia("(max-width: 700px)").matches ? 13 : 18;
  const REST = 1;
  const TEAR_DISTANCE = 2.55;
  const GRAB_RADIUS = 2.25;
  const POINTER_FORCE = 0.55;
  const FADE_TEAR_RATIO = 0.2;
  const state = {
    width: 0,
    height: 0,
    points: [],
    hEdges: [],
    vEdges: [],
    pointer: null,
    dragging: false,
    tearRatio: 0,
    visitorNumber: null,
    geo: null,
    hotspots: [],
    dismissed: false,
    dragDistance: 0,
    lastPointer: null,
  };

  const fallbackHotspots = [
    { lat: 22, lon: 114, count: 5 },
    { lat: 31, lon: 121, count: 4 },
    { lat: 40, lon: -74, count: 3 },
    { lat: 51, lon: 0, count: 2 },
    { lat: 35, lon: 139, count: 3 },
    { lat: -34, lon: 151, count: 2 },
    { lat: 48, lon: 2, count: 2 },
    { lat: 1, lon: 103, count: 2 },
  ];

  function index(x, y) {
    return y * (COLS + 1) + x;
  }

  function rand(seed) {
    const x = Math.sin(seed * 999) * 10000;
    return x - Math.floor(x);
  }

  function project(lat, lon, box) {
    return {
      x: box.x + ((lon + 180) / 360) * box.w,
      y: box.y + ((90 - lat) / 180) * box.h,
    };
  }

  function drawJitteredPath(points, close) {
    paperCtx.beginPath();
    points.forEach(([x, y], i) => {
      const jx = x + (rand(i + x) - 0.5) * 5;
      const jy = y + (rand(i + y) - 0.5) * 5;
      if (i === 0) paperCtx.moveTo(jx, jy);
      else paperCtx.lineTo(jx, jy);
    });
    if (close) paperCtx.closePath();
    paperCtx.stroke();
  }

  function drawHandMap(box) {
    paperCtx.save();
    paperCtx.lineWidth = Math.max(4, paper.width * 0.004);
    paperCtx.lineCap = "round";
    paperCtx.lineJoin = "round";
    paperCtx.strokeStyle = "#111";
    paperCtx.shadowColor = "rgba(0, 0, 0, 0.1)";
    paperCtx.shadowBlur = 1.5;

    const land = [
      [[-168, 64], [-148, 70], [-126, 55], [-116, 48], [-101, 48], [-86, 40], [-76, 25], [-84, 17], [-99, 18], [-112, 30], [-124, 37], [-141, 45], [-158, 50]],
      [[-82, 12], [-70, 7], [-62, -6], [-58, -21], [-48, -34], [-55, -51], [-69, -54], [-77, -39], [-73, -20], [-81, -6]],
      [[-10, 36], [2, 50], [18, 56], [32, 52], [42, 43], [30, 35], [12, 36], [2, 41]],
      [[-18, 33], [2, 34], [20, 28], [31, 19], [30, 5], [20, -11], [10, -28], [-3, -34], [-15, -22], [-10, -4], [-17, 12]],
      [[36, 40], [54, 52], [76, 49], [94, 54], [116, 48], [145, 49], [160, 38], [144, 29], [126, 22], [118, 7], [103, 2], [92, 11], [78, 7], [67, 20], [51, 24], [42, 30]],
      [[42, 26], [58, 18], [76, 14], [91, 6], [104, -4], [116, -8], [124, -17], [112, -23], [92, -19], [74, -10], [58, -4], [44, 8]],
      [[108, -22], [126, -31], [146, -29], [154, -39], [139, -47], [118, -42], [104, -31]],
      [[-46, 70], [-26, 73], [-12, 66], [-32, 61]],
      [[72, -49], [96, -50], [128, -53], [148, -61], [110, -64], [78, -58]],
      [[-46, 68], [-24, 72], [-12, 66], [-32, 60]],
    ];

    land.forEach((shape) => {
      drawJitteredPath(shape.map(([lon, lat]) => {
        const p = project(lat, lon, box);
        return [p.x, p.y];
      }), true);
    });

    paperCtx.strokeRect(box.x - 10, box.y - 10, box.w + 20, box.h + 20);
    paperCtx.restore();
  }

  function drawHotspots(box) {
    const spots = state.hotspots.length ? state.hotspots : fallbackHotspots;
    const max = Math.max(1, ...spots.map((spot) => spot.count || 1));

    spots.forEach((spot, i) => {
      const p = project(spot.lat, spot.lon, box);
      const strength = Math.max(0.2, (spot.count || 1) / max);
      const radius = 10 + strength * 28;
      const glow = paperCtx.createRadialGradient(p.x, p.y, 0, p.x, p.y, radius);
      glow.addColorStop(0, `rgba(255, 202, 74, ${0.75 * strength})`);
      glow.addColorStop(0.35, `rgba(255, 149, 82, ${0.42 * strength})`);
      glow.addColorStop(1, "rgba(255, 202, 74, 0)");
      paperCtx.fillStyle = glow;
      paperCtx.beginPath();
      paperCtx.arc(p.x, p.y, radius, 0, Math.PI * 2);
      paperCtx.fill();
      paperCtx.fillStyle = i === 0 && state.geo ? "#ff3b2f" : "#ffb21a";
      paperCtx.beginPath();
      paperCtx.arc(p.x, p.y, 3.5 + strength * 2, 0, Math.PI * 2);
      paperCtx.fill();
    });
  }

  function fitFont(text, maxWidth, startSize, family) {
    let size = startSize;
    paperCtx.font = `${size}px ${family}`;
    while (paperCtx.measureText(text).width > maxWidth && size > 18) {
      size -= 2;
      paperCtx.font = `${size}px ${family}`;
    }
    return size;
  }

  function drawPaper() {
    const w = state.width;
    const h = state.height;
    paperCtx.clearRect(0, 0, w, h);
    paperCtx.fillStyle = "#fbfaf2";
    paperCtx.fillRect(0, 0, w, h);

    paperCtx.strokeStyle = "rgba(40, 54, 44, 0.16)";
    paperCtx.lineWidth = 1;
    const grid = Math.max(32, Math.floor(Math.min(w, h) / 18));
    for (let x = 0; x <= w; x += grid) {
      paperCtx.beginPath();
      paperCtx.moveTo(x + 0.5, 0);
      paperCtx.lineTo(x + 0.5, h);
      paperCtx.stroke();
    }
    for (let y = 0; y <= h; y += grid) {
      paperCtx.beginPath();
      paperCtx.moveTo(0, y + 0.5);
      paperCtx.lineTo(w, y + 0.5);
      paperCtx.stroke();
    }

    for (let i = 0; i < 1800; i++) {
      const alpha = rand(i) * 0.035;
      paperCtx.fillStyle = `rgba(60, 45, 25, ${alpha})`;
      paperCtx.fillRect(rand(i + 2) * w, rand(i + 4) * h, 1, 1);
    }

    const handwriting = "'Comic Sans MS', 'Bradley Hand', 'Segoe Print', cursive";
    paperCtx.fillStyle = "#090909";
    paperCtx.strokeStyle = "#090909";
    paperCtx.lineCap = "round";
    paperCtx.lineJoin = "round";
    paperCtx.textAlign = "center";
    paperCtx.textBaseline = "middle";

    const titleSize = fitFont("Hi : This is Angzi", w * 0.62, w * 0.055, handwriting);
    paperCtx.font = `700 ${titleSize}px ${handwriting}`;
    paperCtx.save();
    paperCtx.translate(w / 2, h * 0.14);
    paperCtx.rotate(-0.025);
    paperCtx.fillText("Hi : This is Angzi", 0, 0);
    paperCtx.restore();

    const numberText = state.visitorNumber ? String(state.visitorNumber) : "...";
    paperCtx.textAlign = "left";
    paperCtx.font = `700 ${Math.max(34, w * 0.052)}px ${handwriting}`;
    paperCtx.fillText("You're", w * 0.18, h * 0.31);
    paperCtx.font = `700 ${Math.max(20, w * 0.027)}px ${handwriting}`;
    paperCtx.fillText("the", w * 0.36, h * 0.255);
    paperCtx.font = `700 ${Math.max(44, w * 0.068)}px ${handwriting}`;
    paperCtx.textAlign = "center";
    paperCtx.fillText(numberText, w * 0.5, h * 0.31);
    paperCtx.lineWidth = Math.max(3, w * 0.004);
    paperCtx.beginPath();
    paperCtx.moveTo(w * 0.39, h * 0.34);
    paperCtx.bezierCurveTo(w * 0.46, h * 0.335, w * 0.55, h * 0.35, w * 0.62, h * 0.34);
    paperCtx.stroke();
    paperCtx.font = `700 ${Math.max(34, w * 0.052)}px ${handwriting}`;
    paperCtx.textAlign = "left";
    paperCtx.fillText("visitor.", w * 0.66, h * 0.31);

    const mapBox = {
      x: w * 0.25,
      y: h * 0.44,
      w: w * 0.5,
      h: h * 0.25,
    };
    drawHotspots(mapBox);
    drawHandMap(mapBox);

    paperCtx.textAlign = "center";
    paperCtx.fillStyle = "#090909";
    paperCtx.font = `700 ${Math.max(24, w * 0.037)}px ${handwriting}`;
    paperCtx.fillText("drag this page to get started", w / 2, h * 0.79);
  }

  function resetCloth() {
    state.points = [];
    state.hEdges = [];
    state.vEdges = [];
    for (let y = 0; y <= ROWS; y++) {
      for (let x = 0; x <= COLS; x++) {
        const px = (x / COLS) * state.width;
        const py = (y / ROWS) * state.height;
        state.points.push({
          x: px,
          y: py,
          oldX: px,
          oldY: py,
          pinned: y === 0 && x % 2 === 0,
        });
      }
    }
    for (let y = 0; y <= ROWS; y++) {
      for (let x = 0; x < COLS; x++) state.hEdges.push(true);
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x <= COLS; x++) state.vEdges.push(true);
    }
  }

  function resize() {
    const rect = overlay.getBoundingClientRect();
    state.width = Math.max(1, rect.width);
    state.height = Math.max(1, rect.height);
    canvas.width = Math.floor(state.width * DPR);
    canvas.height = Math.floor(state.height * DPR);
    canvas.style.width = `${state.width}px`;
    canvas.style.height = `${state.height}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    paper.width = Math.floor(state.width * DPR);
    paper.height = Math.floor(state.height * DPR);
    paperCtx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawPaper();
    resetCloth();
  }

  function edgeH(x, y) {
    return y * COLS + x;
  }

  function edgeV(x, y) {
    return y * (COLS + 1) + x;
  }

  function isTriAlive(a, b, c) {
    const ax = a % (COLS + 1), ay = Math.floor(a / (COLS + 1));
    const bx = b % (COLS + 1), by = Math.floor(b / (COLS + 1));
    const cx = c % (COLS + 1), cy = Math.floor(c / (COLS + 1));
    return edgeAlive(ax, ay, bx, by) && edgeAlive(bx, by, cx, cy) && edgeAlive(cx, cy, ax, ay);
  }

  function edgeAlive(ax, ay, bx, by) {
    if (ay === by && Math.abs(ax - bx) === 1) return state.hEdges[edgeH(Math.min(ax, bx), ay)];
    if (ax === bx && Math.abs(ay - by) === 1) return state.vEdges[edgeV(ax, Math.min(ay, by))];
    return true;
  }

  function solvePair(a, b, rest, markBroken) {
    const p1 = state.points[a];
    const p2 = state.points[b];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    if (dist > TEAR_DISTANCE * rest && markBroken) return false;
    const diff = ((dist - rest) / dist) * 0.5;
    const ox = dx * diff;
    const oy = dy * diff;
    if (!p1.pinned) {
      p1.x += ox;
      p1.y += oy;
    }
    if (!p2.pinned) {
      p2.x -= ox;
      p2.y -= oy;
    }
    return true;
  }

  function breakEdgesNear(point, radius) {
    const radiusSq = radius * radius;
    for (let y = 0; y <= ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const id = edgeH(x, y);
        if (!state.hEdges[id]) continue;
        const a = state.points[index(x, y)];
        const b = state.points[index(x + 1, y)];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if ((mx - point.x) ** 2 + (my - point.y) ** 2 < radiusSq) state.hEdges[id] = false;
      }
    }
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x <= COLS; x++) {
        const id = edgeV(x, y);
        if (!state.vEdges[id]) continue;
        const a = state.points[index(x, y)];
        const b = state.points[index(x, y + 1)];
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        if ((mx - point.x) ** 2 + (my - point.y) ** 2 < radiusSq) state.vEdges[id] = false;
      }
    }
  }

  function stepCloth() {
    const sx = state.width / COLS;
    const sy = state.height / ROWS;
    for (const p of state.points) {
      if (p.pinned) continue;
      const vx = (p.x - p.oldX) * 0.982;
      const vy = (p.y - p.oldY) * 0.982;
      p.oldX = p.x;
      p.oldY = p.y;
      p.x += vx;
      p.y += vy + (state.dragging ? 0.22 : 0.05);
    }

    if (state.dragging && state.pointer) {
      breakEdgesNear(state.pointer, Math.max(sx, sy) * 1.35);
      for (const p of state.points) {
        const dx = p.x - state.pointer.x;
        const dy = p.y - state.pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < GRAB_RADIUS * Math.max(sx, sy)) {
          p.x += (state.pointer.x - p.x) * POINTER_FORCE;
          p.y += (state.pointer.y - p.y) * POINTER_FORCE;
        }
      }
    }

    for (let pass = 0; pass < 4; pass++) {
      for (let y = 0; y <= ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
          const id = edgeH(x, y);
          if (state.hEdges[id] && !solvePair(index(x, y), index(x + 1, y), sx, pass === 0)) state.hEdges[id] = false;
        }
      }
      for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x <= COLS; x++) {
          const id = edgeV(x, y);
          if (state.vEdges[id] && !solvePair(index(x, y), index(x, y + 1), sy, pass === 0)) state.vEdges[id] = false;
        }
      }
    }

    const alive = state.hEdges.filter(Boolean).length + state.vEdges.filter(Boolean).length;
    const total = state.hEdges.length + state.vEdges.length;
    state.tearRatio = 1 - alive / total;
  }

  function drawTriangle(ai, bi, ci, sx1, sy1, sx2, sy2, sx3, sy3) {
    const a = state.points[ai], b = state.points[bi], c = state.points[ci];
    const det = sx1 * (sy2 - sy3) + sx2 * (sy3 - sy1) + sx3 * (sy1 - sy2);
    if (Math.abs(det) < 0.0001) return;
    const m11 = (a.x * (sy2 - sy3) + b.x * (sy3 - sy1) + c.x * (sy1 - sy2)) / det;
    const m12 = (a.y * (sy2 - sy3) + b.y * (sy3 - sy1) + c.y * (sy1 - sy2)) / det;
    const m21 = (a.x * (sx3 - sx2) + b.x * (sx1 - sx3) + c.x * (sx2 - sx1)) / det;
    const m22 = (a.y * (sx3 - sx2) + b.y * (sx1 - sx3) + c.y * (sx2 - sx1)) / det;
    const dx = (a.x * (sx2 * sy3 - sx3 * sy2) + b.x * (sx3 * sy1 - sx1 * sy3) + c.x * (sx1 * sy2 - sx2 * sy1)) / det;
    const dy = (a.y * (sx2 * sy3 - sx3 * sy2) + b.y * (sx3 * sy1 - sx1 * sy3) + c.y * (sx1 * sy2 - sx2 * sy1)) / det;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.closePath();
    ctx.clip();
    ctx.setTransform(m11 * DPR, m12 * DPR, m21 * DPR, m22 * DPR, dx * DPR, dy * DPR);
    ctx.drawImage(paper, 0, 0, paper.width, paper.height, 0, 0, state.width, state.height);
    ctx.restore();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function render() {
    ctx.clearRect(0, 0, state.width, state.height);
    stepCloth();
    const sx = state.width / COLS;
    const sy = state.height / ROWS;
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const a = index(x, y);
        const b = index(x + 1, y);
        const c = index(x, y + 1);
        const d = index(x + 1, y + 1);
        const x0 = x * sx, x1 = (x + 1) * sx;
        const y0 = y * sy, y1 = (y + 1) * sy;
        if (isTriAlive(a, c, b)) drawTriangle(a, c, b, x0, y0, x0, y1, x1, y0);
        if (isTriAlive(c, d, b)) drawTriangle(c, d, b, x0, y1, x1, y1, x1, y0);
      }
    }

    if (!state.dismissed && (state.tearRatio > FADE_TEAR_RATIO || state.dragDistance > state.width * 0.28)) dismiss();
    requestAnimationFrame(render);
  }

  function localVisitorNumber() {
    const key = "angzi-local-visitor-number";
    let value = Number(localStorage.getItem(key));
    if (!Number.isFinite(value) || value < 1) {
      value = 128 + Math.floor(Math.random() * 700);
      localStorage.setItem(key, String(value));
    }
    return value;
  }

  async function loadVisitor() {
    try {
      const response = await fetch("/api/visitor", { cache: "no-store" });
      if (!response.ok) throw new Error("visitor api unavailable");
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || "visitor api failed");
      state.visitorNumber = data.visitorNumber || localVisitorNumber();
      state.geo = data.geo || null;
      state.hotspots = Array.isArray(data.hotspots) ? data.hotspots : [];
      if (state.geo && Number.isFinite(state.geo.latitude) && Number.isFinite(state.geo.longitude)) {
        state.hotspots.unshift({ lat: state.geo.latitude, lon: state.geo.longitude, count: 3 });
      }
    } catch {
      state.visitorNumber = localVisitorNumber();
      try {
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        if (Number.isFinite(Number(data.latitude)) && Number.isFinite(Number(data.longitude))) {
          state.geo = data;
          state.hotspots = [{ lat: Number(data.latitude), lon: Number(data.longitude), count: 3 }];
        }
      } catch {
        state.hotspots = [];
      }
    }
    drawPaper();
  }

  function pointerFromEvent(event) {
    const touch = event.touches && event.touches[0] ? event.touches[0] : event;
    const rect = canvas.getBoundingClientRect();
    return { x: touch.clientX - rect.left, y: touch.clientY - rect.top };
  }

  function dismiss() {
    state.dismissed = true;
    overlay.classList.add("is-dismissed");
    window.setTimeout(() => {
      overlay.hidden = true;
    }, 700);
  }

  canvas.addEventListener("pointerdown", (event) => {
    canvas.setPointerCapture?.(event.pointerId);
    state.dragging = true;
    state.pointer = pointerFromEvent(event);
    state.lastPointer = state.pointer;
    state.dragDistance = 0;
  });

  canvas.addEventListener("pointermove", (event) => {
    const next = pointerFromEvent(event);
    if (state.dragging && state.lastPointer) {
      state.dragDistance += Math.hypot(next.x - state.lastPointer.x, next.y - state.lastPointer.y);
    }
    state.pointer = next;
    state.lastPointer = next;
  });

  canvas.addEventListener("pointerup", () => {
    state.dragging = false;
    state.lastPointer = null;
  });

  canvas.addEventListener("pointercancel", () => {
    state.dragging = false;
    state.lastPointer = null;
  });

  skip?.addEventListener("click", dismiss);
  window.addEventListener("resize", resize);

  resize();
  loadVisitor();
  requestAnimationFrame(render);
})();
