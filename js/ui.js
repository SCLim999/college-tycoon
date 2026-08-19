/* ============================================================
   College Tycoon — rendering and input
   Reads state, writes DOM. All mutations go through engine.js.
   ============================================================ */

const el = (id) => document.getElementById(id);

/* Department cards are re-rendered wholesale every tick, so the open/closed
   state of each facilities drawer has to live outside the DOM. */
const openDrawers = new Set();

const esc = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- toasts ---------- */

function toast(text, bad) {
  const t = document.createElement("div");
  t.className = "toast" + (bad ? " bad" : "");
  t.textContent = text;
  el("toast").appendChild(t);
  setTimeout(() => t.remove(), 2600);
}

/* ---------- top bar ---------- */

function renderStats(S) {
  const tone = (v, lo, hi) => (v < lo ? "bad" : v >= hi ? "good" : "warn");
  const stats = [
    { k: t("stat.date"), v: dateLabel(S) },
    { k: t("stat.cash"), v: moneyShort(S.cash), c: S.cash < 0 ? "bad" : S.cash > 1500000 ? "good" : "" },
    { k: t("stat.net"), v: S.report ? moneyShort(S.report.net) : "—",
      c: S.report ? (S.report.net >= 0 ? "good" : "bad") : "" },
    { k: t("stat.learners"), v: num(S.students + S.trainees) },
    { k: t("stat.rep"), v: Math.round(S.rep), c: tone(S.rep, 30, 70) },
    { k: t("stat.quality"), v: Math.round(S.quality), c: tone(S.quality, 40, 72) },
    { k: t("stat.compliance"), v: Math.round(S.compliance), c: tone(S.compliance, 40, 70) },
    { k: t("stat.morale"), v: Math.round(S.morale), c: tone(S.morale, 40, 70) },
    { k: t("stat.partners"), v: Math.floor(S.partners) },
    { k: t("stat.staff"), v: totalStaff(S) },
  ];
  el("stats").innerHTML = stats.map((s) =>
    `<div class="stat"><div class="k">${s.k}</div>` +
    `<div class="v ${s.c || ""}">${s.v}</div></div>`).join("");
}

/* ---------- department cards ---------- */

function deptMetrics(S, dept, D) {
  const st = S.depts[dept.id];
  switch (dept.id) {
    case "college":
      return [
        [t("m.students"), `${num(S.students)} / ${num(D.collegeCapacity)}`],
        [t("m.quality"), Math.round(S.quality)],
        [t("m.ratio"), `${D.studentRatio.toFixed(1)} : 1`],
        [t("m.tuition"), moneyShort(S.students * CFG.tuitionCollege * (1 + sumEffect(S, "feeMult")))],
      ];
    case "voc":
      return [
        [t("m.trainees"), `${num(S.trainees)} / ${num(D.vocCapacity)}`],
        [t("m.vocQuality"), Math.round(S.vocQuality)],
        [t("m.employability"), Math.round(S.employability)],
        [t("m.courseIncome"), moneyShort(S.trainees * CFG.tuitionVoc * (1 + sumEffect(S, "vocFeeMult")))],
      ];
    case "ctd":
      return [
        [t("m.partners"), `${Math.floor(S.partners)} / ${Math.round(D.partnerCap)}`],
        [t("m.demand"), `${D.ctdDemand.toFixed(1)} / ${D.ctdThroughput.toFixed(1)}`],
        [t("m.feeEach"), moneyShort(D.programFee)],
        [t("m.margin"), moneyShort(D.programmes * D.programFee - D.deliveryCost)],
      ];
    case "mkt":
      return [
        [t("m.leads"), num(D.leads)],
        [t("m.conversion"), `${(D.conversion * 100).toFixed(1)}%`],
        [t("m.intake"), num(D.leads * D.conversion)],
        [t("m.brand"), `+${sumEffect(S, "brand")}`],
      ];
    case "stem":
      return [
        [t("m.workshops"), D.workshops.toFixed(1)],
        [t("m.pipeline"), `+${num((st.level * 9 + st.staff * 6 + sumEffect(S, "pipeline")) * fundingById(st.funding).outputMult)}`],
        [t("m.workshopFee"), moneyShort(D.workshopFee)],
        [t("m.outreach"), moneyShort(D.workshops * D.workshopFee)],
      ];
    default:
      return [];
  }
}

function renderDepts(S) {
  const D = derive(S);
  const locked = !!S.over;

  el("depts").innerHTML = DEPARTMENTS.map((dept) => {
    const st = S.depts[dept.id];
    const metrics = deptMetrics(S, dept, D).map(
      ([k, v]) => `<div class="metric"><div class="k">${k}</div><div class="v">${v}</div></div>`).join("");

    const upCost = upgradeCost(S, dept.id);
    const maxed = st.level >= dept.maxLevel;
    const upBtn = maxed
      ? `<button class="mini" disabled>${esc(t("card.maxed", { n: dept.maxLevel }))}</button>`
      : `<button class="mini btn-accent" data-act="upgrade" data-dept="${dept.id}"` +
        `${locked || S.cash < upCost ? " disabled" : ""}>${esc(t("card.expand", { n: st.level + 1, cost: moneyShort(upCost) }))}</button>`;

    const funding = FUNDING.map((f) =>
      `<button data-act="funding" data-dept="${dept.id}" data-funding="${f.id}"` +
      `${st.funding === f.id ? ' class="on"' : ""}${locked ? " disabled" : ""}>${esc(fundName(f))}</button>`).join("");

    const hc = hireCost(S, dept.id), sc = severanceCost(S, dept.id);

    const facs = dept.facilities.map((f) => {
      const owned = st.owned.includes(f.id);
      const cost = facilityCost(S, f);
      const needLevel = f.reqLevel && st.level < f.reqLevel;
      const btn = owned
        ? ""
        : needLevel
          ? `<button class="mini" disabled>${esc(t("card.needLevel", { n: f.reqLevel }))}</button>`
          : `<button class="mini" data-act="buy" data-dept="${dept.id}" data-fac="${f.id}"` +
            `${locked || S.cash < cost ? " disabled" : ""}>${moneyShort(cost)}</button>`;
      return `<div class="fac${owned ? " owned" : ""}">
          <div class="info"><div class="n">${esc(facName(f))}</div><div class="d">${esc(facDesc(f))}</div></div>
          ${btn}
        </div>`;
    }).join("");

    const builtCount = st.owned.length;

    return `<article class="dept">
      <div class="dept-head">
        <canvas class="dept-icon avatar" data-sprite="${dept.id}"></canvas>
        <div class="dept-title">
          <h3>${esc(deptName(dept))}</h3>
          <p>${esc(deptTagline(dept))}</p>
        </div>
        <div class="level-badge">${esc(t("card.level", { n: st.level }))}</div>
      </div>
      <div class="dept-metrics">${metrics}</div>
      <div class="dept-body">
        <div class="row">
          <span class="label">${esc(deptStaff(dept))}</span>
          <strong>${st.staff}</strong>
          <button class="mini" data-act="hire" data-dept="${dept.id}"${locked || S.cash < hc ? " disabled" : ""}>+1 · ${moneyShort(hc)}</button>
          <button class="mini" data-act="fire" data-dept="${dept.id}"${locked || st.staff <= 1 || S.cash < sc ? " disabled" : ""}>−1 · ${moneyShort(sc)}</button>
          <span class="hint" style="margin-left:auto;font-size:11.5px;color:var(--muted)">${esc(t("card.perMonth", { cost: moneyShort(st.staff * dept.salary * S.payrollMult) }))}</span>
        </div>
        <div class="row">
          <span class="label">${esc(t("card.funding"))}</span>
          <div class="seg">${funding}</div>
          <span style="margin-left:auto;font-size:11.5px;color:var(--muted)">${esc(t("card.perMonth", { cost: moneyShort(dept.opex * st.level * fundingById(st.funding).costMult) }))}</span>
        </div>
        <div class="row">${upBtn}<span style="font-size:11.5px;color:var(--muted)">${esc(deptLevelNote(dept))}</span></div>
        <details class="facilities" data-drawer="${dept.id}"${openDrawers.has(dept.id) ? " open" : ""}>
          <summary>${esc(t("card.facilities", { have: builtCount, total: dept.facilities.length }))}</summary>
          ${facs}
        </details>
      </div>
    </article>`;
  }).join("");

  /* The cards are rebuilt wholesale, so their canvases are new every time. */
  for (const cv of el("depts").querySelectorAll("canvas.avatar")) {
    drawAvatar(cv, cv.dataset.sprite, 3);
  }
}

/* ---------- sidebar ---------- */

function renderReport(S) {
  const r = S.report;
  if (!r) {
    el("reportPanel").innerHTML =
      `<h4>${esc(t("panel.statementEmpty"))}</h4>` +
      `<p style="color:var(--muted);font-size:13px;margin:0">${esc(t("panel.statementHint"))}</p>`;
    return;
  }
  const line = (k, v, cls) =>
    `<div class="pl"><span>${k}</span><span class="${cls || ""}">${money(v)}</span></div>`;

  el("reportPanel").innerHTML = `
    <h4>${esc(t("panel.statement", { date: dateOf(r.month, r.year) }))}</h4>
    ${line(t("pl.tuition"), r.revenue.tuition, "pos")}
    ${line(t("pl.vocational"), r.revenue.vocational, "pos")}
    ${line(t("pl.corporate"), r.revenue.corporate, "pos")}
    ${line(t("pl.outreach"), r.revenue.outreach, "pos")}
    ${line(t("pl.payroll"), -r.cost.payroll, "neg")}
    ${line(t("pl.delivery"), -r.cost.delivery, "neg")}
    ${line(t("pl.departments"), -r.cost.departments, "neg")}
    ${line(t("pl.upkeep"), -r.cost.upkeep, "neg")}
    ${line(t("pl.campus"), -r.cost.campus, "neg")}
    <div class="pl total"><span>${esc(t("pl.net"))}</span><span class="${r.net >= 0 ? "pos" : "neg"}">${money(r.net)}</span></div>
    <div class="pl" style="color:var(--muted);font-size:12px;margin-top:6px">
      <span>${esc(t("pl.flow", { in: r.intakeCollege + r.intakeVoc, grad: r.graduates + r.vocGraduates, out: r.dropouts }))}</span>
    </div>`;
}

function renderObjectives(S) {
  const rows = objectives(S).map((o) => {
    const pct = clamp((o.now / o.goal) * 100, 0, 100);
    const done = o.now >= o.goal;
    const shown = o.goal >= 1000000 ? moneyShort(o.now) : num(o.now);
    return `<div class="obj${done ? " done" : ""}">
      <div class="t"><span class="n">${done ? "✓ " : ""}${esc(o.label)}</span><span>${shown}</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    </div>`;
  }).join("");
  const monthsLeft = Math.max(0, CFG.finalMonth - S.tick);
  el("objPanel").innerHTML =
    `<h4>${esc(t("panel.objectives", { n: monthsLeft }))}</h4>${rows}`;
}

function renderNews(S) {
  el("newsPanel").innerHTML = `<h4>${esc(t("panel.news"))}</h4>` + S.news.map((n) => {
    const ev = n.evId && EVENTS.find((e) => e.id === n.evId);
    const body = ev
      ? `${ev.icon} ${t("ev." + ev.id + ".title")} — ${tr(n.msg)}`
      : tr(n.msg);
    return `<div class="news-item ${n.type}"><div class="when">${esc(dateOf(n.month, n.year))}</div>${esc(body)}</div>`;
  }).join("");
}

/* ---------- chart ---------- */

function renderChart(S) {
  const cv = el("chart");
  const dpr = window.devicePixelRatio || 1;
  const w = cv.clientWidth || 320, h = 150;
  cv.width = w * dpr;
  cv.height = h * dpr;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const hist = S.history;
  const pad = { l: 6, r: 6, t: 10, b: 14 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;

  ctx.strokeStyle = "#1a2740";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = pad.t + (ih / 3) * i;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
  }

  if (hist.length < 2) return;

  const draw = (key, colour, floorZero) => {
    const vals = hist.map((p) => p[key]);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (floorZero) lo = Math.min(0, lo);
    if (hi - lo < 1) hi = lo + 1;
    ctx.beginPath();
    hist.forEach((p, i) => {
      const x = pad.l + (iw * i) / (hist.length - 1);
      const y = pad.t + ih - ((p[key] - lo) / (hi - lo)) * ih;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = colour;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  draw("cash", "#2fd4d4", true);
  draw("students", "#3b82f6", true);
  draw("rep", "#fbbf24", false);

  ctx.fillStyle = "#5f7a9e";
  ctx.font = "10px system-ui, sans-serif";
  ctx.fillText(t("chart.month", { n: hist[0].t }), pad.l, h - 3);
  const endLabel = t("chart.month", { n: hist[hist.length - 1].t });
  ctx.fillText(endLabel, w - pad.r - ctx.measureText(endLabel).width, h - 3);
}

/* ---------- modals ---------- */

function renderEventModal(S) {
  const ov = el("eventOverlay");
  if (!S.pending || S.over) { ov.hidden = true; return; }
  const ev = EVENTS.find((x) => x.id === S.pending);
  if (!ev) { ov.hidden = true; return; }

  el("eventBody").innerHTML = `
    <h2>${ev.icon} ${esc(t(`ev.${ev.id}.title`))}</h2>
    <p class="sub">${esc(dateLabel(S))}</p>
    <p>${esc(t(`ev.${ev.id}.text`))}</p>
    ${ev.choices.map((c, i) =>
      `<button class="choice" data-choice="${i}">
         <div class="cl">${esc(t(`ev.${ev.id}.c${i}.l`))}</div>
         <div class="cd">${esc(t(`ev.${ev.id}.c${i}.d`))}</div>
       </button>`).join("")}`;
  ov.hidden = false;
}

function renderEndModal(S) {
  const ov = el("endOverlay");
  if (!S.over) { ov.hidden = true; return; }
  const o = S.over;
  el("endBody").innerHTML = `
    <h2>${o.win ? "🏛️" : "⚠️"} ${esc(tr(o.title))}</h2>
    <p class="sub">${esc(t("end.sub", { date: dateLabel(S), diff: diffName(difficultyOf(S)) }))}</p>
    <p>${esc(tr(o.text))}</p>
    <div class="pl total"><span>${esc(t("end.score"))}</span><span>${num(o.score)}</span></div>
    <div class="pl"><span>${esc(t("end.standing"))}</span><span>${esc(tr(o.rank))}</span></div>
    <button class="choice btn-primary" data-act="restart" style="margin-top:18px">
      <div class="cl">${esc(t("end.again"))}</div>
    </button>`;
  ov.hidden = false;
}

/* ---------- master render ---------- */

function render(S) {
  renderStats(S);
  renderDepts(S);
  campusUpdate(S);
  renderReport(S);
  renderObjectives(S);
  renderNews(S);
  renderChart(S);
  renderEventModal(S);
  renderEndModal(S);

  const blocked = !!S.pending || !!S.over;
  el("nextBtn").disabled = blocked;
  el("autoBtn").disabled = blocked;
  el("nextBtn").textContent = t(blocked && S.pending ? "ctrl.blocked" : "ctrl.next");
}
