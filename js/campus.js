/* ============================================================
   College Tycoon — the campus scene

   A blocky little world drawn above the dashboard. It is a read-only
   view of the simulation: buildings rise with department levels, the
   crowd grows with enrolment, staff characters appear as you hire,
   graduates show up once alumni accumulate, and the sky clouds over
   as reputation falls.

   Everything is drawn on a coarse "art pixel" grid (ART_PX device
   pixels per art pixel) so it stays true to the sprite work.
   ============================================================ */

/* Geometry is in art pixels. Characters are SPRITE_H (13) tall, so the
   buildings have to clear roughly twice that to read as buildings and
   not as sheds — level 1 is a two-storey block, level 5 is four. */
const CAMPUS = {
  artH: 56,
  groundTop: 47,       // grass surface
  lanes: [49, 51, 53], // feet height per depth lane, back to front
  buildingBase: 48,
  buildingMin: 20,     // level 1 height
  buildingStep: 3,     // added per level
  maxActors: 34,
};

/* Each department gets a building, left to right, in this order. */
const CAMPUS_BUILDINGS = [
  { id: "college", accent: "#4a86d8" },
  { id: "voc",     accent: "#f57c1f" },
  { id: "ctd",     accent: "#7c6ce0" },
  { id: "mkt",     accent: "#e05299" },
  { id: "stem",    accent: "#2fd4d4" },
];

const campus = {
  canvas: null,
  ctx: null,
  px: 4,
  artW: 0,
  cssW: 0,
  cssH: 0,
  actors: [],
  clouds: [],
  raf: null,
  lastT: 0,
  reduced: false,
  seed: 1,
  /* Mirror of the bits of game state the scene draws. */
  view: { levels: {}, staff: {}, learners: 0, alumni: 0, rep: 45, over: null },
};

/* ---------- setup ---------- */

function campusInit() {
  campus.canvas = el("campus");
  if (!campus.canvas) return;

  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  campus.reduced = mq.matches;
  mq.addEventListener("change", (e) => {
    campus.reduced = e.matches;
    campus.reduced ? campusStop() : campusStart();
  });

  campusResize();
  document.addEventListener("visibilitychange", () => {
    document.hidden ? campusStop() : campusStart();
  });
  campusStart();
}

function campusResize() {
  if (!campus.canvas) return;
  const cssW = campus.canvas.parentElement.clientWidth || 900;
  campus.px = cssW < 700 ? 3 : 4;
  campus.artW = Math.max(60, Math.floor(cssW / campus.px));
  campus.cssW = campus.artW * campus.px;
  campus.cssH = CAMPUS.artH * campus.px;
  campus.ctx = crispContext(campus.canvas, campus.cssW, campus.cssH);

  campus.clouds = [];
  const cloudCount = Math.max(3, Math.round(campus.artW / 90));
  for (let i = 0; i < cloudCount; i++) {
    campus.clouds.push({
      x: (campus.artW / cloudCount) * i + (i * 17) % 23,
      y: 4 + ((i * 7) % 12),
      w: 10 + ((i * 5) % 12),
      speed: 0.9 + (i % 3) * 0.45,
    });
  }
  for (const a of campus.actors) a.x = Math.min(a.x, campus.artW - SPRITE_W);
  campusDraw();
}

function campusStart() {
  if (campus.raf || campus.reduced || !campus.ctx || document.hidden) {
    if (campus.reduced) campusDraw();
    return;
  }
  campus.lastT = 0;
  campus.raf = requestAnimationFrame(campusFrame);
}

function campusStop() {
  if (campus.raf) { cancelAnimationFrame(campus.raf); campus.raf = null; }
}

function campusFrame(t) {
  const dt = campus.lastT ? Math.min(0.1, (t - campus.lastT) / 1000) : 0.016;
  campus.lastT = t;
  campusStep(dt);
  campusDraw();
  campus.raf = requestAnimationFrame(campusFrame);
}

/* ---------- population ---------- */

/** Deterministic pseudo-random so a reload looks the same, not jittery. */
function campusRand() {
  campus.seed = (campus.seed * 1103515245 + 12345) & 0x7fffffff;
  return campus.seed / 0x7fffffff;
}

function makeActor(kind, seed) {
  return {
    kind,
    seed,
    x: campusRand() * Math.max(1, campus.artW - SPRITE_W),
    lane: Math.floor(campusRand() * CAMPUS.lanes.length),
    dir: campusRand() < 0.5 ? -1 : 1,
    speed: 3 + campusRand() * 4,      // art pixels per second
    phase: campusRand() * 10,
    pause: campusRand() * 3,
    palette: kind === "student" ? studentPalette(seed) : null,
  };
}

/** Rebuild the cast so it matches the college you have actually built. */
function campusSyncActors() {
  const v = campus.view;
  const want = [];

  for (const b of CAMPUS_BUILDINGS) {
    const staff = v.staff[b.id] || 0;
    const n = clamp(Math.round(staff / 5), 1, 4);
    for (let i = 0; i < n; i++) want.push(b.id);
  }

  const grads = v.alumni > 150 ? clamp(Math.round(v.alumni / 900), 1, 4) : 0;
  for (let i = 0; i < grads; i++) want.push("grad");

  const room = CAMPUS.maxActors - want.length;
  const students = clamp(Math.round(v.learners / 55), 2, Math.max(2, room));
  for (let i = 0; i < students; i++) want.push("student");

  /* Keep existing actors of each kind so nobody teleports on a re-sync. */
  const byKind = {};
  for (const a of campus.actors) (byKind[a.kind] = byKind[a.kind] || []).push(a);

  const next = [];
  let seed = 0;
  for (const kind of want) {
    const pool = byKind[kind];
    next.push(pool && pool.length ? pool.shift() : makeActor(kind, seed));
    seed++;
  }
  campus.actors = next;
}

function campusUpdate(S) {
  if (!campus.canvas) return;
  const v = campus.view;
  v.levels = {};
  v.staff = {};
  for (const d of DEPARTMENTS) {
    v.levels[d.id] = S.depts[d.id].level;
    v.staff[d.id] = S.depts[d.id].staff;
  }
  v.learners = S.students + S.trainees;
  v.alumni = S.alumni;
  v.rep = S.rep;
  v.over = S.over;
  campusSyncActors();
  if (campus.reduced) campusDraw();
}

function campusStep(dt) {
  const limit = campus.artW - SPRITE_W;
  for (const a of campus.actors) {
    a.phase += dt;
    if (a.pause > 0) { a.pause -= dt; continue; }
    a.x += a.dir * a.speed * dt;
    if (a.x <= 0) { a.x = 0; a.dir = 1; a.pause = campusRand() * 1.5; }
    else if (a.x >= limit) { a.x = limit; a.dir = -1; a.pause = campusRand() * 1.5; }
    else if (campusRand() < 0.002) { a.pause = 0.5 + campusRand() * 2; }
  }
}

/* ---------- drawing ---------- */

function campusDraw() {
  const g = campus.ctx;
  if (!g) return;
  const px = campus.px, W = campus.artW, H = CAMPUS.artH;
  const rect = (x, y, w, h, colour) => {
    g.fillStyle = colour;
    g.fillRect(Math.round(x) * px, Math.round(y) * px, Math.round(w) * px, Math.round(h) * px);
  };

  /* Sky: clear blue when the college is well regarded, overcast when it is not. */
  const mood = clamp(campus.view.rep / 100, 0, 1);
  const skyTop = mixHex("#39414d", "#1f5896", mood);
  const skyLow = mixHex("#6d7683", "#7fb6dd", mood);
  const grad = g.createLinearGradient(0, 0, 0, CAMPUS.groundTop * px);
  grad.addColorStop(0, skyTop);
  grad.addColorStop(1, skyLow);
  g.fillStyle = grad;
  g.fillRect(0, 0, W * px, CAMPUS.groundTop * px);

  /* Sun, dimmed along with the sky. */
  const sunX = W - 22, sunY = 6;
  rect(sunX, sunY, 6, 6, mixHex("#9aa3ad", "#ffe9a8", mood));
  rect(sunX + 1, sunY + 1, 4, 4, mixHex("#c3ccd6", "#fff6d8", mood));

  for (const c of campus.clouds) {
    if (!campus.reduced) {
      c.x -= c.speed * 0.016;
      if (c.x + c.w < 0) c.x = W + 4;
    }
    const cloud = mixHex("#8d949d", "#eaf2fa", mood);
    rect(c.x, c.y, c.w, 2, cloud);
    rect(c.x + 2, c.y - 1, c.w - 5, 1, cloud);
    rect(c.x + 1, c.y + 2, c.w - 2, 1, mixHex("#7b828b", "#cddced", mood));
  }

  /* Distant hills. */
  const hill = mixHex("#39414c", "#2f5e46", mood);
  for (let i = 0; i < W; i += 1) {
    const h = 4 + Math.round(3 * Math.sin(i / 14) + 2 * Math.sin(i / 5.5));
    rect(i, CAMPUS.groundTop - h, 1, h, hill);
  }

  /* Department buildings. */
  const slot = W / CAMPUS_BUILDINGS.length;
  CAMPUS_BUILDINGS.forEach((b, i) => {
    const level = campus.view.levels[b.id] || 1;
    const staff = campus.view.staff[b.id] || 0;
    const bw = Math.max(18, Math.min(32, Math.floor(slot * 0.58)));
    const bh = CAMPUS.buildingMin + level * CAMPUS.buildingStep;
    const bx = Math.round(slot * i + (slot - bw) / 2);
    drawBuilding(rect, bx, CAMPUS.buildingBase, bw, bh, b.accent, staff, level);
    /* A tree in the gap after each building, for a bit of campus grounds. */
    if (slot > 46) drawTree(rect, Math.round(slot * (i + 1)) - 6, CAMPUS.buildingBase, i);
  });

  /* Ground: a lawn deep enough for the whole cast to stand on, over dirt. */
  const grassDepth = 7;
  rect(0, CAMPUS.groundTop, W, grassDepth, "#4f8a3d");
  rect(0, CAMPUS.groundTop + grassDepth - 1, W, 1, "#3f7031");
  rect(0, CAMPUS.groundTop + grassDepth, W, H - CAMPUS.groundTop - grassDepth, "#6b4a2f");
  for (let i = 0; i < W; i += 3) {
    if ((i * 7) % 11 < 4) rect(i, CAMPUS.groundTop, 1, 1, "#5d9c47");
    if ((i * 5) % 13 < 3) rect(i + 1, CAMPUS.groundTop + 3, 1, 1, "#589440");
    if ((i * 3) % 17 < 2) rect(i + 2, CAMPUS.groundTop + grassDepth + 2, 1, 1, "#7c5636");
  }

  /* Characters, back lane first so the front row overlaps correctly. */
  const ordered = campus.actors.slice().sort((a, b) => a.lane - b.lane);
  for (const a of ordered) {
    const sprite = SPRITES[a.kind] || SPRITES.student;
    const feetY = CAMPUS.lanes[a.lane];
    const moving = a.pause <= 0;
    const frame = moving && Math.floor(a.phase * 6) % 2 ? 1 : 0;
    const bob = moving && Math.floor(a.phase * 6) % 2 ? 1 : 0;
    const y = (feetY - SPRITE_H + bob) * px;
    /* Back lanes sit slightly into the haze so depth reads at a glance. */
    const tintAmt = a.lane === 0 ? 0.3 : a.lane === 1 ? 0.14 : 0;
    drawSprite(campus.ctx, sprite, Math.round(a.x) * px, y, px, {
      frame,
      flip: a.dir < 0,
      palette: a.palette,
      tint: skyLow,
      tintAmt,
    });
  }

  if (campus.view.over) {
    g.fillStyle = "rgba(8, 13, 22, 0.55)";
    g.fillRect(0, 0, W * px, H * px);
  }
}

function drawBuilding(rect, x, baseY, w, h, accent, staff, level) {
  const top = baseY - h;

  rect(x, top + 2, w, h - 2, "#38445a");             // wall
  rect(x, top + 2, 1, h - 2, "#2b3648");             // shaded left edge
  rect(x + w - 1, top + 2, 1, h - 2, "#2b3648");
  rect(x - 1, top, w + 2, 2, shade(accent, 0.6));    // roof, slightly overhanging
  rect(x - 1, top + 2, w + 2, 1, "#212b3b");
  rect(x, baseY - 2, w, 2, "#222c3c");               // plinth

  /* Windows light up as the department takes on staff. */
  const cols = Math.max(1, Math.floor((w - 3) / 4));
  const rows = Math.max(1, Math.floor((h - 10) / 4));
  const lit = clamp(Math.round((staff / 16) * cols * rows), 0, cols * rows);
  const left = x + Math.floor((w - (cols * 4 - 1)) / 2);
  let n = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wx = left + c * 4, wy = top + 5 + r * 4;
      /* Leave a scattering of rooms dark even at full staffing, so a big
         building reads as a building and not as a lit grid. */
      const on = n++ < lit && (r * 7 + c * 5) % 9 !== 0;
      rect(wx, wy, 3, 3, on ? "#ffd98a" : "#161f2e");
      if (on) rect(wx, wy, 3, 1, "#fff0c4");
    }
  }

  /* Door, and a banner in the department's colour. */
  const dx = x + Math.floor(w / 2) - 1;
  rect(dx, baseY - 6, 3, 6, "#3a2b1e");
  rect(dx + 2, baseY - 3, 1, 1, accent);
  rect(dx - 1, baseY - 8, 5, 2, shade(accent, 0.75));  // entrance canopy

  rect(x + w - 3, top - 5, 1, 5, "#8d97a5");           // flagpole
  rect(x + w - 6, top - 5, 3, 2, accent);              // flag
  if (level >= 4) {                                     // a taller campus earns a spire
    rect(x + 2, top - 4, 1, 4, "#8d97a5");
    rect(x + 1, top - 6, 3, 2, accent);
  }
}

/** Blocky tree: a trunk and a stepped canopy. */
function drawTree(rect, x, baseY, seed) {
  const h = 6 + (seed % 3);
  const leaf = seed % 2 ? "#3f7a33" : "#488a39";
  rect(x + 2, baseY - h, 2, h, "#5a3d24");
  rect(x, baseY - h - 5, 6, 4, leaf);
  rect(x + 1, baseY - h - 7, 4, 2, leaf);
  rect(x + 1, baseY - h - 5, 1, 1, shade(leaf, 1.18));
}
