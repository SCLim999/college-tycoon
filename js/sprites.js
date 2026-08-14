/* ============================================================
   College Tycoon — pixel-art sprites

   Characters are authored as string grids, one character per pixel,
   indexing into the sprite's palette. Everything is drawn with
   fillRect on whole-pixel boundaries so the art stays chunky and
   crisp at any scale — no image files, no smoothing, no assets.

   Grid legend
     .  transparent      S  skin        E  eye
     H  hat / hair       m  mouth       B  shirt / body
     A  sleeve           P  trousers    F  shoes
     X  accent (per character: tassel, hi-vis stripe, tie, megaphone)
     L  goggle lens      T  lanyard
   ============================================================ */

const SPRITE_W = 10;
const SPRITE_H = 13;

/** Multiply a hex colour toward black (amt < 1) or white (amt > 1). */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    clamp(Math.round(amt <= 1 ? v * amt : v + (255 - v) * (amt - 1)), 0, 255));
  return "#" + ch.map((v) => v.toString(16).padStart(2, "0")).join("");
}

/** Blend two hex colours; t = 0 gives a, t = 1 gives b. */
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const out = [16, 8, 0].map((sh) => {
    const va = (pa >> sh) & 255, vb = (pb >> sh) & 255;
    return Math.round(va + (vb - va) * clamp(t, 0, 1));
  });
  return "#" + out.map((v) => v.toString(16).padStart(2, "0")).join("");
}

const SKIN_TONES = ["#f0c49b", "#e8b48c", "#c68642", "#8d5524", "#ffdbac", "#a56b3c"];
const HAIR_TONES = ["#2b2118", "#3a2a1e", "#6d4c41", "#1a1a1f", "#8d6e4a", "#4a2c2a"];

/* The lower three rows swap to make a stride; everything above is shared. */
const LEGS_STAND = ["..PP..PP..", "..PP..PP..", "..FF..FF.."];
const LEGS_STRIDE = ["..PP..PP..", ".PP....PP.", ".FF....FF."];

function person(top, palette) {
  return {
    palette,
    frames: [top.concat(LEGS_STAND), top.concat(LEGS_STRIDE)],
  };
}

/* --- shared head/torso blocks ------------------------------- */

const PLAIN_TOP = [
  "..HHHHHH..",
  "..HHHHHH..",
  "..SSSSSS..",
  "..SESSES..",
  "..SSSSSS..",
  "..SSmmSS..",
  ".ABBBBBBA.",
  ".ABBBBBBA.",
  ".ABBBBBBA.",
  "..BBBBBB..",
];

const BASE_PALETTE = {
  S: "#e8b48c", E: "#2b2b33", m: "#c98d68",
  H: "#2b2118", B: "#4a6fa5", A: "#3b5983",
  P: "#2c3444", F: "#171a22",
};

/* --- one character per department --------------------------- */

const SPRITES = {
  /* Lecturer — mortarboard with a gold tassel. */
  college: person([
    ".HHHHHHHH.",
    "..HHHHHHX.",
    "..SSSSSS..",
    "..SESSES..",
    "..SSSSSS..",
    "..SSmmSS..",
    ".ABBBBBBA.",
    ".ABBBBBBA.",
    ".ABBBBBBA.",
    "..BBBBBB..",
  ], { ...BASE_PALETTE, H: "#22304f", X: "#f0b429", B: "#3f6fb5", A: "#31578f" }),

  /* Instructor — hard hat and a hi-vis stripe. */
  voc: person([
    "..HHHHHH..",
    ".HHHHHHHH.",
    "..SSSSSS..",
    "..SESSES..",
    "..SSSSSS..",
    "..SSmmSS..",
    ".ABBBBBBA.",
    ".AXXXXXXA.",
    ".ABBBBBBA.",
    "..BBBBBB..",
  ], { ...BASE_PALETTE, S: "#c68642", H: "#f57c1f", X: "#dfe9f5",
       B: "#d8a81c", A: "#b08a14", P: "#3a4152" }),

  /* Corporate trainer — blazer and tie. */
  ctd: person([
    "..HHHHHH..",
    "..HHHHHH..",
    "..SSSSSS..",
    "..SESSES..",
    "..SSSSSS..",
    "..SSmmSS..",
    ".ABBXXBBA.",
    ".ABBXXBBA.",
    ".ABBXXBBA.",
    "..BBBBBB..",
  ], { ...BASE_PALETTE, H: "#3a2a1e", X: "#b8434f", B: "#2b3a54", A: "#212e44" }),

  /* Marketer — cap and a megaphone. */
  mkt: person([
    "..HHHHHH..",
    "..HHHHHHH.",
    "..SSSSSS..",
    "..SESSES..",
    "..SSSSSS..",
    "..SSmmSS..",
    ".ABBBBBBA.",
    ".ABBBBBBAX",
    ".ABBBBBBXX",
    "..BBBBBB..",
  ], { ...BASE_PALETTE, S: "#f0c49b", H: "#c2185b", X: "#ffd166",
       B: "#e05299", A: "#b8407a" }),

  /* STEM facilitator — safety goggles, lab coat, lanyard. */
  stem: person([
    "..HHHHHH..",
    "..HHHHHH..",
    "..SSSSSS..",
    "..XLXXLX..",
    "..SSSSSS..",
    "..SSmmSS..",
    ".ABBTTBBA.",
    ".ABBTTBBA.",
    ".ABBBBBBA.",
    "..BBBBBB..",
  ], { ...BASE_PALETTE, S: "#8d5524", H: "#1a1a1f", X: "#4b5b6d", L: "#9fe8ff",
       T: "#2fd4d4", B: "#e9eff6", A: "#ccd7e3", P: "#3c4557" }),

  /* Learners milling about the campus; recoloured per instance. */
  student: person(PLAIN_TOP, BASE_PALETTE),

  /* Graduation gown — appears once alumni start piling up. */
  grad: person([
    ".HHHHHHHH.",
    "..HHHHHHX.",
    "..SSSSSS..",
    "..SESSES..",
    "..SSSSSS..",
    "..SSmmSS..",
    ".ABBBBBBA.",
    ".ABBBBBBA.",
    ".ABBBBBBA.",
    "..BBBBBB..",
  ], { ...BASE_PALETTE, H: "#1b2436", X: "#f0b429", B: "#2b3550", A: "#222a40",
       P: "#2b3550", F: "#171a22" }),
};

/* Shirt colours for the student crowd — deliberately varied so a full
   campus reads as a crowd rather than a uniform. */
const STUDENT_SHIRTS = [
  "#4a6fa5", "#c05c5c", "#4f9d69", "#c98a3a", "#7c6ce0",
  "#3f9aa8", "#b8577f", "#5f7a8c", "#8a9a3f", "#d0674a",
];

/** Build a per-instance palette so no two students look identical. */
function studentPalette(seed) {
  const pick = (arr, off) => arr[(seed * 7 + off * 13) % arr.length];
  const shirt = pick(STUDENT_SHIRTS, 1);
  return {
    ...BASE_PALETTE,
    S: pick(SKIN_TONES, 2),
    H: pick(HAIR_TONES, 3),
    B: shirt,
    A: shade(shirt, 0.78),
    P: seed % 3 === 0 ? "#38405a" : "#2c3444",
  };
}

/**
 * Draw a sprite with its top-left corner at (x, y), each art pixel drawn
 * `px` device pixels square.
 *
 * opts.frame   walk frame index
 * opts.flip    mirror horizontally (walking left)
 * opts.palette palette overrides merged over the sprite's own
 * opts.tint    hex colour blended into every pixel, for depth
 * opts.tintAmt 0 = untinted, 1 = fully the tint colour
 */
function drawSprite(ctx, sprite, x, y, px, opts) {
  const o = opts || {};
  const rows = sprite.frames[(o.frame || 0) % sprite.frames.length];
  const pal = o.palette ? { ...sprite.palette, ...o.palette } : sprite.palette;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let c = 0; c < row.length; c++) {
      const key = row[c];
      if (key === ".") continue;
      let colour = pal[key];
      if (!colour) continue;
      if (o.tint && o.tintAmt) colour = mixHex(colour, o.tint, o.tintAmt);
      const col = o.flip ? row.length - 1 - c : c;
      ctx.fillStyle = colour;
      ctx.fillRect(x + col * px, y + r * px, px, px);
    }
  }
}

/** Size a canvas for the display's pixel density and return its context. */
function crispContext(canvas, cssW, cssH) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  canvas.style.width = cssW + "px";
  canvas.style.height = cssH + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

/** Department card avatars and the start-screen line-up. */
function drawAvatar(canvas, spriteKey, px) {
  const sprite = SPRITES[spriteKey];
  if (!sprite) return;
  const scale = px || 3;
  const w = SPRITE_W * scale, h = SPRITE_H * scale;
  const ctx = crispContext(canvas, w, h);
  ctx.clearRect(0, 0, w, h);
  drawSprite(ctx, sprite, 0, 0, scale);
}
