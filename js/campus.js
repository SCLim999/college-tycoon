/* ============================================================
   College Tycoon — the isometric campus

   A RollerCoaster-Tycoon-style 3/4 view of the site you are
   running. It is a read-only projection of the simulation:
   department blocks rise a storey per level, every facility you
   buy appears as its own building, and staff and learners walk
   the paths between them.

   Site plan follows ViTrox Campus 2.0: a central circular
   courtyard with a water feature, department blocks arranged on a
   radial axis around it, a perimeter cycle loop, and rooftop
   solar PV throughout.

   Rendering: everything is drawn at a low "art" resolution and
   blitted once, scaled with nearest-neighbour, so the whole scene
   keeps the same chunky pixel grid as the characters. Terrain and
   each building are cached as their own offscreen canvases, so a
   frame costs one blit per object rather than thousands of rects.
   ============================================================ */

const TILE_W = 16;          // art pixels
const TILE_H = 8;
const MAP_N = 39;           // tiles per side
const MAP_C = (MAP_N - 1) / 2;

const TERRAIN = {
  GRASS: 0, GARDEN: 1, PATH: 2, PLAZA: 3, WATER: 4, ASPHALT: 5, DECK: 6,
};

const TERRAIN_COLOURS = {
  [TERRAIN.GRASS]:  ["#4f8a3d", "#568f42", "#4a8339"],
  [TERRAIN.GARDEN]: ["#498138", "#4e873d", "#457c34"],
  [TERRAIN.PATH]:   ["#a9a294", "#b0a99b", "#a29b8d"],
  [TERRAIN.PLAZA]:  ["#c4bcac", "#cbc3b3", "#bdb5a5"],
  [TERRAIN.WATER]:  ["#2b7f9e", "#31889f", "#2a7593"],
  [TERRAIN.ASPHALT]:["#4a4f57", "#4f545c", "#454a52"],
  [TERRAIN.DECK]:   ["#8a7358", "#917a5f", "#836c51"],
};

/* Radial site plan: one department block per spoke, starting north
   and going clockwise. */
const ZONES = [
  /* fw/fh give each block its own massing; base is its height at level 1.
     The vocational block is the low, wide manufacturing shed. */
  { id: "college", accent: "#4a86d8", fw: 5, fh: 3, base: 22, style: "glass" },
  { id: "voc",     accent: "#f57c1f", fw: 5, fh: 4, base: 15, style: "shed" },
  { id: "ctd",     accent: "#7c6ce0", fw: 3, fh: 5, base: 25, style: "glass" },
  { id: "mkt",     accent: "#e05299", fw: 3, fh: 3, base: 20, style: "glass" },
  { id: "stem",    accent: "#2fd4d4", fw: 4, fh: 4, base: 19, style: "glass" },
];

const RING_PLAZA = 5.2;     // edge of the central courtyard
const RING_BLOCK = 10.5;    // department blocks sit here
const RING_LOOP = 15.5;     // perimeter cycle loop

/* Facilities go in fixed slots around their own department block, so each
   department reads as a precinct rather than everything piling onto one ring.
   Offsets are relative to the block footprint: dx from its left edge, dy from
   its top edge, both allowed to go negative. */
/* What each facility looks like on the map. Workshops and production lines
   are industrial sheds, teaching and library buildings are brick, the big
   public venues are pitched-roof halls, and the rest are glazed blocks. */
const FACILITY_STYLE = {
  /* College */
  "lecture-block": "brick", library: "brick", elearning: "glass",
  mqa: "glass", research: "glass",
  /* Vocational */
  "machine-shop": "shed", hrdcorp: "glass", smt: "shed",
  apprentice: "shed", automation: "shed",
  /* Corporate training */
  crm: "glass", "training-suite": "glass", "machine-vision": "shed",
  consult: "glass", intl: "glass",
  /* Marketing */
  social: "glass", openday: "hall", alumni: "brick",
  scholarship: "brick", broadcast: "hall",
  /* Education STEM */
  robotics: "shed", teachertraining: "brick", stemvan: "shed",
  competition: "hall", stemcentre: "hall",
};

const FACILITY_SLOTS = [
  { dx: -4, dy: 0 }, { dx: 1, dy: -3 }, { dx: -4, dy: 3 },
  { dx: 1, dy: 3 },  { dx: -1, dy: -3 },
];

const campus = {
  canvas: null, ctx: null,
  art: null, actx: null,          // low-resolution drawing surface
  terrain: null,                  // cached terrain layer
  scale: 2, artW: 0, artH: 0,
  originX: 0, originY: 0,
  tiles: null,
  walkable: [],                   // tiles people may stand on
  buildings: [],
  props: [],
  actors: [],
  hitboxes: [],                   // {id, x, y, w, h} in css px, for clicks
  panX: 0, panY: 0,               // viewport offset in art pixels
  padX: 0, padY: 0,               // terrain painted this far past the viewport
  drag: null,
  signature: "",
  raf: null, lastT: 0, reduced: false, seed: 1,
  view: { levels: {}, staff: {}, owned: {}, learners: 0, alumni: 0, rep: 45, over: null },
};

/* ---------- projection ---------- */

/** Centre of tile (tx, ty) in art pixels. Accepts fractional tiles. */
function isoX(tx, ty) { return (tx - ty) * (TILE_W / 2) + campus.originX; }
function isoY(tx, ty) { return (tx + ty) * (TILE_H / 2) + campus.originY; }

/** Corner of the tile grid — buildings are laid out on corners, not centres. */
function cornerX(tx, ty) { return (tx - ty) * (TILE_W / 2) + campus.originX; }
function cornerY(tx, ty) { return (tx + ty) * (TILE_H / 2) + campus.originY; }

const tileIndex = (tx, ty) => ty * MAP_N + tx;
const inMap = (tx, ty) => tx >= 0 && ty >= 0 && tx < MAP_N && ty < MAP_N;

function tileAt(tx, ty) {
  return inMap(tx, ty) ? campus.tiles[tileIndex(tx, ty)] : TERRAIN.GRASS;
}

/* Row widths for one iso tile, so diamonds tile without seams. */
const TILE_ROWS = (() => {
  const rows = [];
  for (let r = 0; r < TILE_H; r++) {
    const step = TILE_W / (TILE_H / 2);
    rows.push(step * (Math.min(r, TILE_H - 1 - r) + 1));
  }
  return rows;
})();

/* ---------- site plan ---------- */

function campusRand() {
  campus.seed = (campus.seed * 1103515245 + 12345) & 0x7fffffff;
  return campus.seed / 0x7fffffff;
}

/** Stable per-tile hash, so scenery does not shimmer between frames. */
function tileHash(tx, ty) {
  const h = (tx * 73856093) ^ (ty * 19349663);
  return ((h % 1000) + 1000) % 1000 / 1000;
}

function zoneAngle(i) {
  return -Math.PI / 2 + (i * 2 * Math.PI) / ZONES.length;
}

function polarTile(r, a) {
  return { tx: Math.round(MAP_C + r * Math.cos(a)), ty: Math.round(MAP_C + r * Math.sin(a)) };
}

function buildSitePlan() {
  const t = new Uint8Array(MAP_N * MAP_N).fill(TERRAIN.GRASS);
  campus.tiles = t;   // tileAt() reads through this while the plan is drawn
  const set = (tx, ty, v) => { if (inMap(tx, ty)) t[tileIndex(tx, ty)] = v; };

  for (let ty = 0; ty < MAP_N; ty++) {
    for (let tx = 0; tx < MAP_N; tx++) {
      const dx = tx - MAP_C, dy = ty - MAP_C;
      const d = Math.hypot(dx, dy);

      /* The eye: an elliptical reflecting pool at the centre of the courtyard. */
      if (Math.hypot(dx / 1.7, dy) <= 3.0) set(tx, ty, TERRAIN.WATER);
      else if (d <= RING_PLAZA) set(tx, ty, TERRAIN.PLAZA);
      else if (d >= RING_LOOP - 0.6 && d <= RING_LOOP + 0.6) set(tx, ty, TERRAIN.PATH);
      else if (d > 17.0) set(tx, ty, TERRAIN.GARDEN);
    }
  }

  /* Radial spokes from the courtyard out past the cycle loop. */
  for (let i = 0; i < ZONES.length; i++) {
    const a = zoneAngle(i);
    for (let r = RING_PLAZA - 0.5; r <= RING_LOOP + 0.8; r += 0.2) {
      const p = polarTile(r, a);
      if (tileAt(p.tx, p.ty) !== TERRAIN.WATER) set(p.tx, p.ty, TERRAIN.PATH);
      /* Widen the spoke so it reads as a boulevard, not a goat track. */
      const n = polarTile(r, a + 0.11), m = polarTile(r, a - 0.11);
      if (tileAt(n.tx, n.ty) === TERRAIN.GRASS) set(n.tx, n.ty, TERRAIN.PATH);
      if (tileAt(m.tx, m.ty) === TERRAIN.GRASS) set(m.tx, m.ty, TERRAIN.PATH);
    }
  }

  /* Staff car park tucked outside the loop, between two spokes. */
  const park = polarTile(RING_LOOP + 1.4, zoneAngle(2) + 0.55);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -3; dx <= 3; dx++) set(park.tx + dx, park.ty + dy, TERRAIN.ASPHALT);
  }

}

/** Clear a footprint to paving so buildings never sit on grass edges. */
function pave(x0, y0, w, h) {
  for (let ty = y0 - 1; ty < y0 + h + 1; ty++) {
    for (let tx = x0 - 1; tx < x0 + w + 1; tx++) {
      if (inMap(tx, ty) && campus.tiles[tileIndex(tx, ty)] !== TERRAIN.PATH) {
        campus.tiles[tileIndex(tx, ty)] = TERRAIN.PLAZA;
      }
    }
  }
}

/** True when a footprint (plus a one-tile gap) touches anything already built. */
function footprintClear(x0, y0, w, h) {
  if (x0 < 1 || y0 < 1 || x0 + w >= MAP_N - 1 || y0 + h >= MAP_N - 1) return false;
  for (const b of campus.buildings) {
    if (x0 - 1 < b.x0 + b.w && x0 + w + 1 > b.x0 &&
        y0 - 1 < b.y0 + b.h && y0 + h + 1 > b.y0) return false;
  }
  return true;
}

/**
 * Find room for an annex near its department block. Slots are tried in
 * order and each is pushed progressively further from the courtyard until
 * it stops colliding, so a fully built precinct spreads outward instead of
 * stacking buildings on top of each other.
 */
function findAnnexSpot(x0, y0, zone, w, h, out, k) {
  const slot = FACILITY_SLOTS[k % FACILITY_SLOTS.length];
  const baseX = Math.round(x0 + slot.dx + out.x * 2);
  const baseY = Math.round(y0 + slot.dy + out.y * 2);

  /* Spiral outward from the ideal slot until something fits. Searching rings
     rather than pushing straight out means a crowded precinct spills
     sideways into the gaps instead of marching off the edge of the map. */
  for (let r = 0; r <= 9; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const x = baseX + dx, y = baseY + dy;
        /* Never build in the courtyard — it is the heart of the plan. */
        const d = Math.hypot(x + w / 2 - MAP_C, y + h / 2 - MAP_C);
        if (d < RING_PLAZA + 2.5) continue;
        if (footprintClear(x, y, w, h)) return { x, y };
      }
    }
  }
  return null;
}

/** Rebuild the building list from the departments and facilities owned. */
function layoutBuildings() {
  buildSitePlan();
  campus.buildings = [];
  campus.props = [];

  ZONES.forEach((zone, i) => {
    const a = zoneAngle(i);
    const level = campus.view.levels[zone.id] || 1;
    const staff = campus.view.staff[zone.id] || 0;

    /* Department block, four tiles square, a storey taller per level. */
    const c = polarTile(RING_BLOCK, a);
    const x0 = clamp(c.tx - Math.floor(zone.fw / 2), 1, MAP_N - zone.fw - 1);
    const y0 = clamp(c.ty - Math.floor(zone.fh / 2), 1, MAP_N - zone.fh - 1);
    pave(x0, y0, zone.fw, zone.fh);
    campus.buildings.push({
      id: zone.id, kind: "block", x0, y0, w: zone.fw, h: zone.fh,
      height: zone.base + level * 5, storeys: 1 + level, style: zone.style,
      accent: zone.accent, staff, level,
    });

    /* One outbuilding per facility actually built. */
    const owned = campus.view.owned[zone.id] || [];
    owned.forEach((facId, k) => {
      const fw = k % 3 === 1 ? 3 : 2;
      const out = { x: Math.cos(a), y: Math.sin(a) };
      const spot = findAnnexSpot(x0, y0, zone, fw, 2, out, k);
      if (!spot) return;
      pave(spot.x, spot.y, fw, 2);
      campus.buildings.push({
        id: zone.id, kind: "facility", facId, x0: spot.x, y0: spot.y, w: fw, h: 2,
        height: 12 + (k % 3) * 4, storeys: 2, style: FACILITY_STYLE[facId] || "glass",
        accent: zone.accent, staff: 6, level: 1,
      });
    });
  });

  /* Scenery: trees on grass, away from anything built. */
  const taken = new Set();
  for (const b of campus.buildings) {
    for (let ty = b.y0 - 1; ty < b.y0 + b.h + 1; ty++) {
      for (let tx = b.x0 - 1; tx < b.x0 + b.w + 1; tx++) taken.add(tileIndex(tx, ty));
    }
  }
  for (let ty = 1; ty < MAP_N - 1; ty++) {
    for (let tx = 1; tx < MAP_N - 1; tx++) {
      const kind = tileAt(tx, ty);
      if (kind !== TERRAIN.GRASS && kind !== TERRAIN.GARDEN) continue;
      if (taken.has(tileIndex(tx, ty))) continue;
      const h = tileHash(tx, ty);
      if (h < 0.16) campus.props.push({ tx, ty, kind: "tree", v: h });
      else if (h < 0.19) campus.props.push({ tx, ty, kind: "bush", v: h });
    }
  }

  /* Walkable set for the crowd. */
  campus.walkable = [];
  for (let ty = 0; ty < MAP_N; ty++) {
    for (let tx = 0; tx < MAP_N; tx++) {
      const k = tileAt(tx, ty);
      if ((k === TERRAIN.PATH || k === TERRAIN.PLAZA) && !taken.has(tileIndex(tx, ty))) {
        campus.walkable.push({ tx, ty });
      }
    }
  }

  for (const b of campus.buildings) b.cache = null;
  campus.terrain = null;
}

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

  buildSitePlan();
  layoutBuildings();
  campusResize();

  campus.canvas.addEventListener("pointerdown", onPointerDown);
  campus.canvas.addEventListener("pointermove", onPointerMove);
  campus.canvas.addEventListener("pointerup", onPointerUp);
  campus.canvas.addEventListener("pointercancel", () => { campus.drag = null; });
  document.addEventListener("visibilitychange", () => {
    document.hidden ? campusStop() : campusStart();
  });
  campusStart();
}

function campusResize() {
  if (!campus.canvas) return;
  const cssW = campus.canvas.parentElement.clientWidth || 900;
  const cssH = cssW < 720 ? 340 : 580;
  campus.scale = 2;
  campus.artW = Math.ceil(cssW / campus.scale);
  campus.artH = Math.ceil(cssH / campus.scale);

  campus.ctx = crispContext(campus.canvas, cssW, cssH);

  campus.art = campus.art || document.createElement("canvas");
  campus.art.width = campus.artW;
  campus.art.height = campus.artH;
  campus.actx = campus.art.getContext("2d");
  campus.actx.imageSmoothingEnabled = false;

  /* Centre the courtyard, biased down so tall blocks have headroom. */
  campus.originX = campus.artW / 2;
  campus.originY = campus.artH / 2 - MAP_C * TILE_H + 4;
  clampPan();

  campus.terrain = null;
  for (const b of campus.buildings) b.cache = null;
  campusDraw();
}

/** Keep the campus from being dragged off the edge of its own frame. */
function clampPan() {
  const halfW = RING_LOOP * 1.45 * (TILE_W / 2) + 30;
  const halfH = RING_LOOP * 1.45 * (TILE_H / 2) + 45;
  const limX = Math.max(0, halfW - campus.artW / 2);
  const limY = Math.max(0, halfH - campus.artH / 2);
  campus.panX = clamp(campus.panX, -limX, limX);
  campus.panY = clamp(campus.panY, -limY, limY);
  campus.padX = Math.ceil(limX) + TILE_W;
  campus.padY = Math.ceil(limY) + TILE_H;
}

function onPointerDown(e) {
  campus.drag = { x: e.clientX, y: e.clientY, panX: campus.panX, panY: campus.panY, moved: 0 };
  campus.canvas.setPointerCapture(e.pointerId);
}

function onPointerMove(e) {
  const d = campus.drag;
  if (!d) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy));
  campus.panX = d.panX + dx / campus.scale;
  campus.panY = d.panY + dy / campus.scale;
  clampPan();
  if (campus.reduced) campusDraw();
}

function onPointerUp(e) {
  const d = campus.drag;
  campus.drag = null;
  if (campus.canvas.hasPointerCapture(e.pointerId)) {
    campus.canvas.releasePointerCapture(e.pointerId);
  }
  /* A press that barely moved is a click on a building, not a drag. */
  if (d && d.moved < 5) onCampusClick(e);
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

/* ---------- the crowd ---------- */

function randomWalkable() {
  return campus.walkable.length
    ? campus.walkable[Math.floor(campusRand() * campus.walkable.length)]
    : { tx: MAP_C, ty: MAP_C };
}

function makeActor(kind, seed) {
  const start = randomWalkable();
  const a = {
    kind, seed,
    tx: start.tx, ty: start.ty,
    fromX: start.tx, fromY: start.ty,
    toX: start.tx, toY: start.ty,
    t: 1, speed: 0.9 + campusRand() * 0.8,
    pause: campusRand() * 2,
    flip: false,
    palette: kind === "student" ? studentPalette(seed) : null,
  };
  a.cache = null;
  return a;
}

/** Step to an adjacent walkable tile, preferring not to double back. */
function pickNextTile(a) {
  const options = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    const nx = a.tx + dx, ny = a.ty + dy;
    const k = tileAt(nx, ny);
    if (k !== TERRAIN.PATH && k !== TERRAIN.PLAZA) continue;
    const back = nx === a.fromX && ny === a.fromY;
    options.push({ nx, ny, weight: back ? 1 : 5 });
  }
  if (!options.length) return null;
  const total = options.reduce((s, o) => s + o.weight, 0);
  let r = campusRand() * total;
  for (const o of options) { r -= o.weight; if (r <= 0) return o; }
  return options[0];
}

function campusSyncActors() {
  const v = campus.view;
  const want = [];
  for (const z of ZONES) {
    const n = clamp(Math.round((v.staff[z.id] || 0) / 6), 1, 4);
    for (let i = 0; i < n; i++) want.push(z.id);
  }
  const grads = v.alumni > 200 ? clamp(Math.round(v.alumni / 1100), 1, 3) : 0;
  for (let i = 0; i < grads; i++) want.push("grad");
  const students = clamp(Math.round(v.learners / 40), 3, 30);
  for (let i = 0; i < students; i++) want.push("student");

  const byKind = {};
  for (const a of campus.actors) (byKind[a.kind] = byKind[a.kind] || []).push(a);

  const next = [];
  let seed = 0;
  for (const kind of want) {
    const pool = byKind[kind];
    next.push(pool && pool.length ? pool.shift() : makeActor(kind, seed));
    seed++;
  }

  /* A new building can be dropped on top of someone. Move anyone whose
     tile is no longer walkable, or they would stand still forever. */
  for (const a of next) {
    const k = tileAt(a.tx, a.ty);
    if (k === TERRAIN.PATH || k === TERRAIN.PLAZA) continue;
    const spot = randomWalkable();
    a.tx = a.fromX = a.toX = spot.tx;
    a.ty = a.fromY = a.toY = spot.ty;
    a.t = 1;
  }

  campus.actors = next;
}

function campusStep(dt) {
  for (const a of campus.actors) {
    if (a.pause > 0) { a.pause -= dt; continue; }
    a.t += dt * a.speed;
    if (a.t >= 1) {
      a.fromX = a.tx; a.fromY = a.ty;
      a.tx = a.toX; a.ty = a.toY;
      const next = pickNextTile(a);
      if (!next) { a.pause = 1; a.t = 1; continue; }
      a.toX = next.nx; a.toY = next.ny;
      a.t = 0;
      /* Screen-space left is -x and +y, so face accordingly. */
      a.flip = (next.nx - a.tx) - (next.ny - a.ty) < 0;
      if (campusRand() < 0.1) a.pause = 0.4 + campusRand() * 1.6;
    }
  }
}

/* ---------- painting ---------- */

function paintTile(g, tx, ty, kind, variant) {
  const cx = isoX(tx, ty) - TILE_W / 2;
  const cy = isoY(tx, ty) - TILE_H / 2;
  const shades = TERRAIN_COLOURS[kind];
  g.fillStyle = shades[variant % shades.length];
  for (let r = 0; r < TILE_H; r++) {
    const w = TILE_ROWS[r];
    g.fillRect(Math.round(cx + (TILE_W - w) / 2), Math.round(cy + r), w, 1);
  }
}

/** Tile range covering the visible art viewport, so terrain reaches the edges. */
function visibleTileRange(extraW, extraH) {
  const w = campus.artW + (extraW || 0), h = campus.artH + (extraH || 0);
  const corners = [[0, 0], [w, 0], [0, h], [w, h]];
  let lo = Infinity, hi = -Infinity, loY = Infinity, hiY = -Infinity;
  for (const [x, y] of corners) {
    const u = (x - campus.originX) / (TILE_W / 2);
    const v = (y - campus.originY) / (TILE_H / 2);
    const tx = (u + v) / 2, ty = (v - u) / 2;
    lo = Math.min(lo, tx); hi = Math.max(hi, tx);
    loY = Math.min(loY, ty); hiY = Math.max(hiY, ty);
  }
  return {
    x0: Math.floor(lo) - 2, x1: Math.ceil(hi) + 2,
    y0: Math.floor(loY) - 2, y1: Math.ceil(hiY) + 2,
  };
}

/** Countryside beyond the site boundary — never built on, just backdrop. */
function outsideTile(tx, ty) {
  /* Coarse coordinates give broad meadow patches rather than a checkerboard. */
  const patch = tileHash(Math.floor(tx / 4) + 31, Math.floor(ty / 4) + 17);
  return patch < 0.35 ? TERRAIN.GARDEN : TERRAIN.GRASS;
}

function buildTerrain() {
  const c = document.createElement("canvas");
  c.width = campus.artW + campus.padX * 2;
  c.height = campus.artH + campus.padY * 2;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;

  g.fillStyle = "#3c6b2e";
  g.fillRect(0, 0, c.width, c.height);

  /* Paint in the padded canvas's own coordinates by shifting the origin,
     then put it back so buildings and people stay on the unpanned grid. */
  const ox = campus.originX, oy = campus.originY;
  campus.originX += campus.padX;
  campus.originY += campus.padY;
  const R = visibleTileRange(campus.padX * 2, campus.padY * 2);
  for (let d = R.x0 + R.y0; d <= R.x1 + R.y1; d++) {
    for (let tx = Math.max(R.x0, d - R.y1); tx <= Math.min(R.x1, d - R.y0); tx++) {
      const ty = d - tx;
      const sx = isoX(tx, ty), sy = isoY(tx, ty);
      if (sx < -TILE_W || sx > c.width + TILE_W ||
          sy < -TILE_H * 3 || sy > c.height + TILE_H * 3) continue;

      const inside = inMap(tx, ty);
      const kind = inside ? tileAt(tx, ty) : outsideTile(tx, ty);
      const h = tileHash(tx, ty);
      paintTile(g, tx, ty, kind, Math.floor(h * 3));

      /* Scenery beyond the boundary is baked in: it never overlaps the
         campus, so it does not need to join the depth sort. */
      if (!inside && h < 0.13) {
        drawProp(g, { tx, ty, kind: h < 0.09 ? "tree" : "bush", v: h });
        continue;
      }
      if (!inside) continue;

      /* Lane markings in the car park, kerbs along the cycle loop. */
      if (kind === TERRAIN.ASPHALT && (tx + ty) % 2 === 0) {
        g.fillStyle = "#7d838c";
        g.fillRect(Math.round(isoX(tx, ty) - 3), Math.round(isoY(tx, ty)), 6, 1);
      }
      if (kind === TERRAIN.WATER && h > 0.72) {
        g.fillStyle = "#57a8c2";
        g.fillRect(Math.round(isoX(tx, ty) - 3), Math.round(isoY(tx, ty) - 1), 5, 1);
      }
    }
  }

  /* The iris: a pale ring around the reflecting pool, echoing the
     circular courtyard the real campus is planned around. */
  g.strokeStyle = "#d8d2c4";
  g.lineWidth = 1;
  g.beginPath();
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    const tx = MAP_C + Math.cos(a) * 4.1, ty = MAP_C + Math.sin(a) * 4.1;
    const x = isoX(tx, ty), y = isoY(tx, ty);
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.stroke();

  campus.originX = ox;
  campus.originY = oy;
  campus.terrain = c;
}

/** Draw a filled iso quad from four art-space points. */
function quad(g, pts, colour) {
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
  g.fill();
}

/* Palettes per architectural style, so a precinct is legible at a glance. */
const STYLE_PALETTE = {
  glass: { lit: "#ccd5df", dark: "#a8b3c1", roof: "#dde3ea", glassL: "#33506b", glassR: "#3f6c8f" },
  shed:  { lit: "#c3c8cb", dark: "#9ca3a8", roof: "#aeb5ba", glassL: "#42525c", glassR: "#556873" },
  brick: { lit: "#b5765a", dark: "#8f5a44", roof: "#cfc7bb", glassL: "#3b3327", glassR: "#4d4335" },
  hall:  { lit: "#d8d2c2", dark: "#b3ac9c", roof: "#8a5f47", glassL: "#3a5064", glassR: "#4a6a84" },
};

/**
 * Render one building into its own canvas.
 *
 * The department blocks follow the reference campus: pale precast facades,
 * ribbon glazing per storey, a department-coloured parapet and rooftop PV.
 * Annexes vary by what they are — workshops get sawtooth industrial roofs,
 * teaching buildings get brick with punched windows, halls get a pitched
 * roof — so a built-out precinct reads as a mix of real buildings.
 */
function buildBuildingCache(b) {
  const pad = 10;
  const style = b.style || "glass";
  const pal = STYLE_PALETTE[style] || STYLE_PALETTE.glass;
  const H = b.height;
  const roofRise = style === "hall" ? 12 : style === "shed" ? 6 : 0;

  const N = [cornerX(b.x0, b.y0), cornerY(b.x0, b.y0)];
  const E = [cornerX(b.x0 + b.w, b.y0), cornerY(b.x0 + b.w, b.y0)];
  const S = [cornerX(b.x0 + b.w, b.y0 + b.h), cornerY(b.x0 + b.w, b.y0 + b.h)];
  const W = [cornerX(b.x0, b.y0 + b.h), cornerY(b.x0, b.y0 + b.h)];

  const minX = Math.floor(W[0] - pad), maxX = Math.ceil(E[0] + pad);
  const minY = Math.floor(N[1] - H - roofRise - pad), maxY = Math.ceil(S[1] + pad);

  const c = document.createElement("canvas");
  c.width = maxX - minX; c.height = maxY - minY;
  const g = c.getContext("2d");
  g.imageSmoothingEnabled = false;

  const P = (p, lift) => [p[0] - minX, p[1] - minY - (lift || 0)];
  /** Project an arbitrary tile coordinate at a given height. */
  const T = (tx, ty, lift) => [cornerX(tx, ty) - minX, cornerY(tx, ty) - minY - (lift || 0)];

  /* Ground shadow. */
  quad(g, [P(N), P(E), P(S), P(W)], "rgba(12, 22, 14, 0.28)");

  /* Two visible facades. */
  quad(g, [P(W), P(S), P(S, H), P(W, H)], pal.dark);
  quad(g, [P(S), P(E), P(E, H), P(S, H)], pal.lit);

  if (style === "brick") {
    /* Punched windows on a grid rather than continuous glazing. */
    const rowsN = Math.max(1, b.storeys - 1);
    for (let s = 0; s < rowsN; s++) {
      const top = H - (H / (rowsN + 0.7)) * (s + 0.75);
      const bh = 3;
      for (let f = 0.12; f < 0.95; f += 0.26) {
        const a0 = [W[0] + (S[0] - W[0]) * f, W[1] + (S[1] - W[1]) * f];
        const a1 = [W[0] + (S[0] - W[0]) * (f + 0.12), W[1] + (S[1] - W[1]) * (f + 0.12)];
        quad(g, [P(a0, top), P(a1, top), P(a1, top - bh), P(a0, top - bh)], pal.glassL);
        const b0 = [S[0] + (E[0] - S[0]) * f, S[1] + (E[1] - S[1]) * f];
        const b1 = [S[0] + (E[0] - S[0]) * (f + 0.12), S[1] + (E[1] - S[1]) * (f + 0.12)];
        quad(g, [P(b0, top), P(b1, top), P(b1, top - bh), P(b0, top - bh)], pal.glassR);
      }
    }
  } else {
    /* Ribbon glazing, one band per storey. */
    const bands = Math.max(1, b.storeys);
    const bandGap = H / (bands + 0.6);
    for (let s = 0; s < bands; s++) {
      const top = H - bandGap * (s + 0.75);
      const bh = Math.max(2, Math.round(bandGap * 0.42));
      quad(g, [P(W, top), P(S, top), P(S, top - bh), P(W, top - bh)], pal.glassL);
      quad(g, [P(S, top), P(E, top), P(E, top - bh), P(S, top - bh)], pal.glassR);
    }
  }

  /* Parapet band in the department colour. */
  if (style !== "hall") {
    const band = 3;
    quad(g, [P(W, H - band), P(S, H - band), P(S, H), P(W, H)], shade(b.accent, 0.7));
    quad(g, [P(S, H - band), P(E, H - band), P(E, H), P(S, H)], b.accent);
  }

  if (style === "hall") {
    /* Pitched roof with the ridge running along the x axis. */
    const my0 = b.y0 + b.h / 2;
    const rN = T(b.x0, my0, H + roofRise), rE = T(b.x0 + b.w, my0, H + roofRise);
    quad(g, [P(N, H), P(E, H), rE, rN], shade(pal.roof, 1.15));
    quad(g, [rN, rE, P(S, H), P(W, H)], pal.roof);
    quad(g, [P(N, H), rN, P(W, H)], shade(pal.roof, 0.8));   // gable end
  } else if (style === "shed") {
    /* Sawtooth roof: north-facing glazing over each bay. */
    const bays = Math.max(2, Math.round(b.w));
    for (let i = 0; i < bays; i++) {
      const bx0 = b.x0 + (b.w * i) / bays, bx1 = b.x0 + (b.w * (i + 1)) / bays;
      quad(g, [T(bx0, b.y0, H), T(bx1, b.y0, H + roofRise),
               T(bx1, b.y0 + b.h, H + roofRise), T(bx0, b.y0 + b.h, H)], "#b6bdc2");
      quad(g, [T(bx1, b.y0, H + roofRise), T(bx1, b.y0, H),
               T(bx1, b.y0 + b.h, H), T(bx1, b.y0 + b.h, H + roofRise)], "#4f6a7c");
    }
  } else {
    /* Flat roof deck with a solar PV array — the real campus runs 1,410 panels. */
    quad(g, [P(N, H), P(E, H), P(S, H), P(W, H)], pal.roof);
    const inset = 0.55;
    const ix0 = b.x0 + (b.w * (1 - inset)) / 2, iy0 = b.y0 + (b.h * (1 - inset)) / 2;
    const ix1 = ix0 + b.w * inset, iy1 = iy0 + b.h * inset;
    quad(g, [T(ix0, iy0, H), T(ix1, iy0, H), T(ix1, iy1, H), T(ix0, iy1, H)], "#1d3a5c");
    const rows = Math.max(2, Math.round(b.w * 1.2));
    g.strokeStyle = "#2f5f92";
    for (let i = 1; i < rows; i++) {
      const f = i / rows;
      g.beginPath();
      g.moveTo(...T(ix0 + (ix1 - ix0) * f, iy0, H));
      g.lineTo(...T(ix0 + (ix1 - ix0) * f, iy1, H));
      g.stroke();
    }
  }

  /* Entrance canopy on the courtyard side. */
  quad(g, [P(S, 4), P([S[0] + 7, S[1] + 3], 4), P([S[0] + 7, S[1] + 3], 1), P(S, 1)],
       shade(b.accent, 0.85));

  /* Rooftop plant on the taller department blocks. */
  if (b.kind === "block" && style === "glass") {
    quad(g, [P([N[0], N[1] + 2], H + 5), P([E[0] - 4, E[1]], H + 5),
             P([E[0] - 4, E[1]], H + 2), P([N[0], N[1] + 2], H + 2)], "#b9c3cf");
  }

  b.cache = c;
  b.cacheX = minX;
  b.cacheY = minY;
  b.depth = (b.x0 + b.w) + (b.y0 + b.h);
}

function actorCache(a) {
  const sprite = SPRITES[a.kind] || SPRITES.student;
  const frames = [];
  for (let f = 0; f < 2; f++) {
    for (let flip = 0; flip < 2; flip++) {
      const c = document.createElement("canvas");
      c.width = SPRITE_W; c.height = SPRITE_H;
      const g = c.getContext("2d");
      g.imageSmoothingEnabled = false;
      drawSprite(g, sprite, 0, 0, 1, { frame: f, flip: !!flip, palette: a.palette });
      frames.push(c);
    }
  }
  a.cache = frames;
}

function campusDraw() {
  const g = campus.actx;
  if (!g) return;
  if (!campus.terrain) buildTerrain();

  g.clearRect(0, 0, campus.artW, campus.artH);
  g.save();
  g.translate(Math.round(campus.panX), Math.round(campus.panY));
  g.drawImage(campus.terrain, -campus.padX, -campus.padY);

  /* Everything above ground goes into one depth-sorted list. */
  const items = [];

  for (const b of campus.buildings) {
    if (!b.cache) buildBuildingCache(b);
    items.push({ depth: b.depth, y: b.cacheY, draw: () => g.drawImage(b.cache, b.cacheX, b.cacheY) });
  }

  for (const p of campus.props) {
    items.push({ depth: p.tx + p.ty, y: isoY(p.tx, p.ty), draw: () => drawProp(g, p) });
  }

  for (const a of campus.actors) {
    if (!a.cache) actorCache(a);
    const fx = a.tx + (a.toX - a.tx) * Math.min(1, a.t);
    const fy = a.ty + (a.toY - a.ty) * Math.min(1, a.t);
    const x = Math.round(isoX(fx, fy) - SPRITE_W / 2);
    const moving = a.pause <= 0 && a.t < 1;
    const step = moving && Math.floor(a.t * 4) % 2 ? 1 : 0;
    const y = Math.round(isoY(fx, fy) - SPRITE_H + 2 - (step ? 1 : 0));
    const img = a.cache[step * 2 + (a.flip ? 1 : 0)];
    items.push({ depth: fx + fy, y, draw: () => g.drawImage(img, x, y) });
  }

  items.sort((p, q) => (p.depth - q.depth) || (p.y - q.y));
  for (const it of items) it.draw();
  g.restore();

  if (campus.view.over) {
    g.fillStyle = "rgba(8, 13, 22, 0.5)";
    g.fillRect(0, 0, campus.artW, campus.artH);
  }

  /* One nearest-neighbour blit keeps the whole scene on the pixel grid. */
  const out = campus.ctx;
  out.imageSmoothingEnabled = false;
  out.clearRect(0, 0, campus.artW * campus.scale, campus.artH * campus.scale);
  out.drawImage(campus.art, 0, 0, campus.artW * campus.scale, campus.artH * campus.scale);

  campus.hitboxes = campus.buildings
    .filter((b) => b.kind === "block")
    .map((b) => ({
      id: b.id,
      x: (b.cacheX + campus.panX) * campus.scale,
      y: (b.cacheY + campus.panY) * campus.scale,
      w: b.cache.width * campus.scale, h: b.cache.height * campus.scale,
    }));
}

function drawProp(g, p) {
  const x = Math.round(isoX(p.tx, p.ty));
  const y = Math.round(isoY(p.tx, p.ty));
  if (p.kind === "bush") {
    g.fillStyle = "#3c7330";
    g.fillRect(x - 3, y - 3, 6, 3);
    g.fillStyle = "#478439";
    g.fillRect(x - 2, y - 4, 4, 1);
    return;
  }
  const h = 7 + Math.floor(p.v * 5);
  const leaf = p.v > 0.08 ? "#3f7a33" : "#356b2b";
  g.fillStyle = "#5a3d24";
  g.fillRect(x - 1, y - h, 2, h);
  g.fillStyle = leaf;
  g.fillRect(x - 4, y - h - 6, 8, 5);
  g.fillRect(x - 3, y - h - 8, 6, 2);
  g.fillStyle = shade(leaf, 1.2);
  g.fillRect(x - 3, y - h - 6, 2, 1);
}

/* ---------- interaction ---------- */

function onCampusClick(e) {
  const rect = campus.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left, y = e.clientY - rect.top;
  /* Front-most building wins, so a block in front is not stolen by one behind. */
  const hit = campus.hitboxes
    .filter((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
    .pop();
  if (!hit) return;
  const card = document.querySelector(`.dept [data-dept="${hit.id}"]`);
  const article = card && card.closest(".dept");
  if (!article) return;
  article.scrollIntoView({ behavior: "smooth", block: "center" });
  article.classList.add("flash");
  setTimeout(() => article.classList.remove("flash"), 1200);
}

/* ---------- public surface ---------- */

function campusUpdate(S) {
  if (!campus.canvas) return;
  const v = campus.view;
  v.levels = {}; v.staff = {}; v.owned = {};
  for (const d of DEPARTMENTS) {
    v.levels[d.id] = S.depts[d.id].level;
    v.staff[d.id] = S.depts[d.id].staff;
    v.owned[d.id] = S.depts[d.id].owned.slice();
  }
  v.learners = S.students + S.trainees;
  v.alumni = S.alumni;
  v.rep = S.rep;
  v.over = S.over;

  /* Only re-plan the site when something has actually been built. */
  const sig = DEPARTMENTS.map((d) =>
    `${d.id}:${v.levels[d.id]}:${v.owned[d.id].join("+")}`).join("|");
  if (sig !== campus.signature) {
    campus.signature = sig;
    layoutBuildings();
  } else {
    for (const b of campus.buildings) {
      if (b.kind === "block" && b.staff !== v.staff[b.id]) { b.staff = v.staff[b.id]; }
    }
  }

  campusSyncActors();
  if (campus.reduced) campusDraw();
}
