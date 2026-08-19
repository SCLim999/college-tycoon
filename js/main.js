/* ============================================================
   College Tycoon — bootstrap and input wiring
   ============================================================ */

let S = null;
let autoTimer = null;
let chosenDifficulty = "standard";

/** Paint every static data-i18n slot in the page for the active language. */
function applyStaticText() {
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
  for (const node of document.querySelectorAll("[data-i18n-html]")) {
    node.innerHTML = t(node.dataset.i18nHtml);
  }
  /* Both toggles show the language they switch *to*. */
  const other = LANGS.find((l) => l.id !== getLang());
  for (const id of ["langBtn", "langBtnStart"]) {
    el(id).textContent = other.label;
    el(id).title = other.name;
  }
  el("fsBtn").textContent = t(isFullscreen() ? "ctrl.exitFullscreen" : "ctrl.fullscreen");
  if (autoTimer) el("autoBtn").textContent = t("ctrl.pause");
  document.title = t("app.title");
}

/** Re-render everything that holds text. Stored {k,p} messages retranslate. */
function switchLang(id) {
  setLang(id);
  applyStaticText();
  renderStartScreen();
  if (S) render(S);
}

function isFullscreen() {
  return !!(document.fullscreenElement || document.webkitFullscreenElement);
}

function toggleFullscreen() {
  const target = document.documentElement;
  if (isFullscreen()) {
    (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  } else if (target.requestFullscreen || target.webkitRequestFullscreen) {
    (target.requestFullscreen || target.webkitRequestFullscreen).call(target);
  }
}

/** Sandboxed frames can block window.confirm; treat a blocked prompt as consent
    rather than leaving the button silently dead. */
function askConfirm(question) {
  try {
    return typeof confirm === "function" ? confirm(question) : true;
  } catch (err) {
    return true;
  }
}

/* ---------- start screen ---------- */

function renderStartScreen() {
  el("lineup").innerHTML = DEPARTMENTS.map((d) =>
    `<figure><canvas class="avatar" data-sprite="${d.id}"></canvas>
       <figcaption>${esc(deptName(d).replace(/ Department$/, ""))}</figcaption></figure>`).join("");
  for (const cv of el("lineup").querySelectorAll("canvas.avatar")) {
    drawAvatar(cv, cv.dataset.sprite, 4);
  }

  el("diffList").innerHTML = DIFFICULTIES.map((d) =>
    `<button class="diff${d.id === chosenDifficulty ? " on" : ""}" data-diff="${d.id}">
       <div class="dn">${esc(t("start.diff", { name: diffName(d), cash: moneyShort(d.cash) }))}</div>
       <div class="dd">${esc(diffDesc(d))}</div>
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
  el("autoBtn").textContent = t("ctrl.auto");
  el("autoBtn").classList.remove("btn-accent");
}

function toggleAuto() {
  if (autoTimer) { stopAuto(); return; }
  autoTimer = setInterval(() => {
    if (!S || S.pending || S.over) { stopAuto(); render(S); return; }
    advanceMonth(S);
    render(S);
  }, 1800);
  el("autoBtn").textContent = t("ctrl.pause");
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
  campusInit();
  applyStaticText();
  renderStartScreen();

  for (const id of ["langBtn", "langBtnStart"]) {
    el(id).addEventListener("click", () => {
      switchLang(LANGS.find((l) => l.id !== getLang()).id);
    });
  }

  el("fsBtn").addEventListener("click", toggleFullscreen);
  for (const ev of ["fullscreenchange", "webkitfullscreenchange"]) {
    document.addEventListener(ev, () => {
      document.body.classList.toggle("is-fullscreen", isFullscreen());
      el("fsBtn").textContent = t(isFullscreen() ? "ctrl.exitFullscreen" : "ctrl.fullscreen");
      /* The map is sized from its container, which just changed. */
      campusResize();
      if (S) renderChart(S);
    });
  }

  el("diffList").addEventListener("click", (e) => {
    const b = e.target.closest("[data-diff]");
    if (!b) return;
    chosenDifficulty = b.dataset.diff;
    renderStartScreen();
  });

  el("newGameBtn").addEventListener("click", () => startGame(newGame(chosenDifficulty)));

  el("continueBtn").addEventListener("click", () => {
    const saved = loadGame();
    if (!saved) { toast(t("toast.noSave"), true); renderStartScreen(); return; }
    startGame(saved);
    toast(t("toast.loaded"));
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
    toast(t(ok ? "toast.saved" : "toast.saveFail"), !ok);
  });

  el("loadBtn").addEventListener("click", () => {
    const saved = loadGame();
    if (!saved) { toast(t("toast.noSave"), true); return; }
    stopAuto();
    S = saved;
    render(S);
    toast(t("toast.loaded"));
  });

  el("restartBtn").addEventListener("click", () => {
    if (S && !S.over && !askConfirm(t("confirm.restart"))) return;
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

  window.addEventListener("resize", () => {
    campusResize();
    if (S) renderChart(S);
  });

  document.addEventListener("keydown", (e) => {
    if (!S || S.pending || S.over) return;
    if (e.target.matches("input, textarea")) return;
    if (e.code === "Space") { e.preventDefault(); advanceMonth(S); render(S); }
  });
}

document.addEventListener("DOMContentLoaded", init);
