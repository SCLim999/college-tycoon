/* ============================================================
   College Tycoon — bootstrap and input wiring
   ============================================================ */

let S = null;
let autoTimer = null;
let chosenDifficulty = "standard";

/* ---------- start screen ---------- */

function renderStartScreen() {
  el("diffList").innerHTML = DIFFICULTIES.map((d) =>
    `<button class="diff${d.id === chosenDifficulty ? " on" : ""}" data-diff="${d.id}">
       <div class="dn">${esc(d.name)} · starting cash ${moneyShort(d.cash)}</div>
       <div class="dd">${esc(d.desc)}</div>
     </button>`).join("");
  el("continueBtn").hidden = !hasSave();
}

function startGame(state) {
  S = state;
  el("startOverlay").hidden = true;
  render(S);
}

/* ---------- autoplay ---------- */

function stopAuto() {
  if (autoTimer) { clearInterval(autoTimer); autoTimer = null; }
  el("autoBtn").textContent = "▶ Auto";
  el("autoBtn").classList.remove("btn-accent");
}

function toggleAuto() {
  if (autoTimer) { stopAuto(); return; }
  autoTimer = setInterval(() => {
    if (!S || S.pending || S.over) { stopAuto(); render(S); return; }
    advanceMonth(S);
    render(S);
  }, 1800);
  el("autoBtn").textContent = "⏸ Pause";
  el("autoBtn").classList.add("btn-accent");
}

/* ---------- actions ---------- */

function runAction(fn) {
  const err = fn();
  if (err) toast(err, true);
  render(S);
}

function onDeptClick(e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn || !S) return;
  const { act, dept, fac, funding } = btn.dataset;
  if (act === "upgrade") runAction(() => actUpgrade(S, dept));
  else if (act === "hire") runAction(() => actHire(S, dept));
  else if (act === "fire") runAction(() => actFire(S, dept));
  else if (act === "buy") runAction(() => actBuyFacility(S, dept, fac));
  else if (act === "funding") runAction(() => actSetFunding(S, dept, funding));
}

/* ---------- wiring ---------- */

function init() {
  renderStartScreen();

  el("diffList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-diff]");
    if (!b) return;
    chosenDifficulty = b.dataset.diff;
    renderStartScreen();
  });

  el("newGameBtn").addEventListener("click", () => startGame(newGame(chosenDifficulty)));

  el("continueBtn").addEventListener("click", () => {
    const saved = loadGame();
    if (!saved) { toast("No compatible save found.", true); renderStartScreen(); return; }
    startGame(saved);
    toast("Save loaded.");
  });

  el("depts").addEventListener("click", onDeptClick);

  // `toggle` does not bubble, so capture it on the way down
  el("depts").addEventListener("toggle", (e) => {
    const d = e.target.dataset && e.target.dataset.drawer;
    if (!d) return;
    e.target.open ? openDrawers.add(d) : openDrawers.delete(d);
  }, true);

  el("nextBtn").addEventListener("click", () => {
    if (!S || S.pending || S.over) return;
    advanceMonth(S);
    render(S);
  });

  el("autoBtn").addEventListener("click", toggleAuto);

  el("saveBtn").addEventListener("click", () => {
    if (!S) return;
    const ok = saveGame(S);
    toast(ok ? "Progress saved." : "Could not save — storage unavailable.", !ok);
  });

  el("loadBtn").addEventListener("click", () => {
    const saved = loadGame();
    if (!saved) { toast("No compatible save found.", true); return; }
    stopAuto();
    S = saved;
    render(S);
    toast("Save loaded.");
  });

  el("restartBtn").addEventListener("click", () => {
    if (S && !S.over && !confirm("Abandon this five-year plan and start over?")) return;
    stopAuto();
    S = null;
    el("endOverlay").hidden = true;
    renderStartScreen();
    el("startOverlay").hidden = false;
  });

  el("helpBtn").addEventListener("click", () => { el("helpOverlay").hidden = false; });
  el("helpCloseBtn").addEventListener("click", () => { el("helpOverlay").hidden = true; });

  el("eventBody").addEventListener("click", (e) => {
    const b = e.target.closest("[data-choice]");
    if (!b || !S) return;
    resolveEvent(S, Number(b.dataset.choice));
    render(S);
  });

  el("endBody").addEventListener("click", (e) => {
    if (!e.target.closest('[data-act="restart"]')) return;
    stopAuto();
    S = null;
    el("endOverlay").hidden = true;
    renderStartScreen();
    el("startOverlay").hidden = false;
  });

  window.addEventListener("resize", () => { if (S) renderChart(S); });

  document.addEventListener("keydown", (e) => {
    if (!S || S.pending || S.over) return;
    if (e.target.matches("input, textarea")) return;
    if (e.code === "Space") { e.preventDefault(); advanceMonth(S); render(S); }
  });
}

document.addEventListener("DOMContentLoaded", init);
