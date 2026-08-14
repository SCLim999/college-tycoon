/* Small shared helpers. Loaded before every other game script. */

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

/** Multipliers need finer precision than round2 — a 0.35%/month creep
    would be rounded straight back to 1.00. */
function round4(v) {
  return Math.round(v * 10000) / 10000;
}

/** RM 1,234,567 — negatives render as -RM 1,234. */
function money(v) {
  const n = Math.round(v);
  const s = Math.abs(n).toLocaleString("en-MY");
  return (n < 0 ? "-RM " : "RM ") + s;
}

/** Compact money for tight spaces: RM 1.24M / RM 340k. */
function moneyShort(v) {
  const n = Math.round(v);
  const a = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (a >= 1000000) return `${sign}RM ${(a / 1000000).toFixed(2)}M`;
  if (a >= 1000) return `${sign}RM ${Math.round(a / 1000)}k`;
  return `${sign}RM ${a}`;
}

function num(v) {
  return Math.round(v).toLocaleString("en-MY");
}

/** Weighted pick from [{weight, ...}]. Returns null for an empty pool. */
function weightedPick(pool) {
  const total = pool.reduce((s, x) => s + x.weight, 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const x of pool) {
    r -= x.weight;
    if (r <= 0) return x;
  }
  return pool[pool.length - 1];
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
