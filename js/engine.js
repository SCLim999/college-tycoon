/* ============================================================
   College Tycoon — simulation engine
   Pure state + rules. No DOM access lives in this file.
   ============================================================ */

/* ---------- state ---------- */

function newGame(difficultyId) {
  const diff = DIFFICULTIES.find((d) => d.id === difficultyId) || DIFFICULTIES[1];
  const S = {
    v: CFG.version,
    difficulty: diff.id,
    tick: 0,            // months elapsed
    month: 0,           // 0..11
    year: 1,

    cash: diff.cash,
    rep: 45,
    quality: 58,
    vocQuality: 55,
    morale: 62,
    compliance: 60,
    employability: 40,

    students: 260,
    trainees: 70,
    partners: 6,
    alumni: 0,

    payrollMult: 1,
    overheadMult: 1,

    depts: {
      college: { level: 1, staff: 12, funding: "normal", owned: [] },
      voc:     { level: 1, staff: 5,  funding: "normal", owned: [] },
      ctd:     { level: 1, staff: 3,  funding: "normal", owned: [] },
      mkt:     { level: 1, staff: 3,  funding: "normal", owned: [] },
      stem:    { level: 1, staff: 2,  funding: "normal", owned: [] },
    },

    flags: {},
    seenEvents: {},
    history: [],
    news: [],
    pending: null,      // unresolved choice event
    report: null,       // last month's P&L
    over: null,         // {win:boolean, title, text, score, rank}
  };
  pushNews(S, "info", m("news.start"));
  S.history.push({ t: 0, cash: S.cash, students: S.students, rep: S.rep, net: 0 });
  return S;
}

function difficultyOf(S) {
  return DIFFICULTIES.find((d) => d.id === S.difficulty) || DIFFICULTIES[1];
}

function totalStaff(S) {
  return DEPARTMENTS.reduce((s, d) => s + S.depts[d.id].staff, 0);
}

function dateLabel(S) {
  return t("date.fmt", { mon: monthName(S.month), y: S.year });
}

/** Date for a stored history entry, rendered in the current language. */
function dateOf(month, year) {
  return t("date.fmt", { mon: monthName(month), y: year });
}

/** Store the message as {k, p} so the log re-renders when language changes. */
function pushNews(S, type, msg, evId) {
  S.news.unshift({ tick: S.tick, month: S.month, year: S.year, type, msg, evId });
  if (S.news.length > 120) S.news.length = 120;
}

/** Sum one named modifier across every purchased facility. */
function sumEffect(S, key) {
  let total = 0;
  for (const dept of DEPARTMENTS) {
    for (const fid of S.depts[dept.id].owned) {
      const f = dept.facilities.find((x) => x.id === fid);
      if (f && f.effects[key]) total += f.effects[key];
    }
  }
  return total;
}

/* ---------- action costs ---------- */

function upgradeCost(S, deptId) {
  const d = deptById(deptId);
  const lv = S.depts[deptId].level;
  return Math.round(d.upgradeBase * Math.pow(lv, 1.55) * difficultyOf(S).capexMult);
}

function hireCost(S, deptId) {
  return Math.round(deptById(deptId).salary * CFG.hireCostMult * S.payrollMult);
}

function severanceCost(S, deptId) {
  return Math.round(deptById(deptId).salary * CFG.severanceMult * S.payrollMult);
}

function facilityCost(S, facility) {
  return Math.round(facility.cost * difficultyOf(S).capexMult);
}

/* ---------- actions (return an error string, or null on success) ---------- */

function actUpgrade(S, deptId) {
  const d = deptById(deptId);
  const st = S.depts[deptId];
  if (st.level >= d.maxLevel) return t("err.maxLevel");
  const cost = upgradeCost(S, deptId);
  if (S.cash < cost) return t("err.cash");
  S.cash -= cost;
  st.level += 1;
  pushNews(S, "good", m("news.upgrade", { dept: deptName(d), level: st.level, cost: money(cost) }));
  return null;
}

function actHire(S, deptId) {
  const d = deptById(deptId);
  const cost = hireCost(S, deptId);
  if (S.cash < cost) return t("err.hireCash");
  S.cash -= cost;
  S.depts[deptId].staff += 1;
  pushNews(S, "info", m("news.hire", { role: deptStaffOne(d), dept: deptName(d), cost: money(cost) }));
  return null;
}

function actFire(S, deptId) {
  const d = deptById(deptId);
  const st = S.depts[deptId];
  if (st.staff <= 1) return t("err.lastStaff");
  const cost = severanceCost(S, deptId);
  if (S.cash < cost) return t("err.severance");
  S.cash -= cost;
  st.staff -= 1;
  S.morale = clamp(S.morale - 3, 0, 100);
  pushNews(S, "bad", m("news.fire", { role: deptStaffOne(d), dept: deptName(d), cost: money(cost) }));
  return null;
}

function actBuyFacility(S, deptId, facilityId) {
  const d = deptById(deptId);
  const st = S.depts[deptId];
  const f = d.facilities.find((x) => x.id === facilityId);
  if (!f) return t("err.unknownFacility");
  if (st.owned.includes(facilityId)) return t("err.built");
  if (f.reqLevel && st.level < f.reqLevel) return t("err.needLevel", { dept: deptName(d), n: f.reqLevel });
  const cost = facilityCost(S, f);
  if (S.cash < cost) return t("err.cash");
  S.cash -= cost;
  st.owned.push(facilityId);
  pushNews(S, "good", m("news.built", { name: facName(f), cost: money(cost) }));
  return null;
}

function actSetFunding(S, deptId, fundingId) {
  if (!FUNDING.some((f) => f.id === fundingId)) return t("err.unknownFunding");
  S.depts[deptId].funding = fundingId;
  return null;
}

/* ---------- derived figures ---------- */

function derive(S) {
  const e = (k) => sumEffect(S, k);
  const C = S.depts.college, V = S.depts.voc, T = S.depts.ctd, M = S.depts.mkt, ST = S.depts.stem;
  const fC = fundingById(C.funding), fV = fundingById(V.funding), fT = fundingById(T.funding),
        fM = fundingById(M.funding), fST = fundingById(ST.funding);

  const collegeCapacity = 180 + C.level * 140 + e("capacity");
  const vocCapacity = 60 + V.level * 55 + e("vocCapacity");

  const studentRatio = S.students / Math.max(1, C.staff);
  const traineeRatio = S.trainees / Math.max(1, V.staff);

  const qualityTarget = clamp(
    96 - studentRatio * 2.1 + C.level * 3 + e("quality")
      + (fC.outputMult - 1) * 22 + (S.morale - 60) * 0.15, 5, 100);
  const vocQualityTarget = clamp(
    100 - traineeRatio * 2.6 + V.level * 3.5 + e("quality") * 0.5
      + (fV.outputMult - 1) * 20 + (S.morale - 60) * 0.15, 5, 100);

  const employability = clamp(
    28 + S.partners * 1.5 + e("employability") + V.level * 3 + S.vocQuality * 0.18, 0, 100);

  /* enquiries */
  let leads = ((24 + M.level * 30 + M.staff * 15 + e("leads")) * fM.outputMult
             + (ST.level * 9 + ST.staff * 6 + e("pipeline")) * fST.outputMult)
             * (0.55 + S.rep / 95);
  if (S.flags.leadSurge) leads *= 1.5;
  if (S.flags.leadSlump) leads *= 0.6;

  const conversion = clamp(
    0.16 + S.rep / 430 + e("conversion") / 100 + S.quality / 700
      + (S.flags.conversionBoost ? 0.05 : 0), 0.04, 0.62);

  /* Corporate training: partners commission a few programmes a year each, and
     you can only run as many as your trainers can staff. Whichever is smaller
     is what actually gets delivered — extra trainers past demand are dead weight. */
  const partnerCap = 10 + T.level * 7 + e("partnerCap");
  const ctdDemand = S.partners * CFG.partnerOrderRate;
  const ctdThroughput = (T.staff * 0.85 + T.level * 0.4) * fT.outputMult;
  const programmes = Math.min(ctdDemand, ctdThroughput);
  const programFee = (CFG.ctdProgramFee + e("programFee")) * (S.flags.ctdDiscount ? 0.78 : 1);
  const deliveryCost = programmes * programFee * CFG.programDeliveryShare;
  const workshops = S.flags.stemBusy ? 0 : (ST.staff * 1.4 + ST.level * 0.6) * fST.outputMult;
  const workshopFee = CFG.stemWorkshopFee + e("workshopFee");

  /* payroll, department budgets, facility upkeep */
  let salaries = 0;
  let deptOpex = 0;
  let upkeep = 0;
  for (const d of DEPARTMENTS) {
    const st = S.depts[d.id];
    salaries += st.staff * d.salary * S.payrollMult;
    deptOpex += d.opex * st.level * fundingById(st.funding).costMult;
    for (const fid of st.owned) {
      const f = d.facilities.find((x) => x.id === fid);
      if (f) upkeep += f.cost * CFG.upkeepRate;
    }
  }
  upkeep *= S.overheadMult;
  const overhead = (CFG.campusOverhead * S.overheadMult
    + S.students * CFG.perStudentCost + S.trainees * CFG.perTraineeCost)
    * difficultyOf(S).opexMult;

  const avgMorale = DEPARTMENTS.reduce(
    (s, d) => s + fundingById(S.depts[d.id].funding).morale, 0) / DEPARTMENTS.length;

  return {
    collegeCapacity, vocCapacity, studentRatio, traineeRatio,
    qualityTarget, vocQualityTarget, employability,
    leads, conversion, partnerCap, ctdDemand, ctdThroughput, programmes, programFee,
    deliveryCost, workshops, workshopFee,
    salaries, deptOpex, upkeep, overhead, avgMorale,
  };
}

/* ---------- the monthly tick ---------- */

function advanceMonth(S) {
  if (S.over || S.pending) return;

  const D = derive(S);
  const report = {
    /* Captured before the calendar advances, and stored as numbers so the
       statement re-renders in whichever language is active. */
    month: S.month, year: S.year,
    revenue: {}, cost: {},
    intakeCollege: 0, intakeVoc: 0, graduates: 0, vocGraduates: 0, dropouts: 0,
  };

  /* 1 — teaching quality, morale */
  S.quality += (D.qualityTarget - S.quality) * 0.35;
  S.vocQuality += (D.vocQualityTarget - S.vocQuality) * 0.35;
  S.employability = D.employability;

  const overwork = Math.max(0, D.studentRatio - 24) * 1.4 + Math.max(0, D.traineeRatio - 18) * 1.0;
  const moraleTarget = clamp(60 + D.avgMorale * 5 - overwork + (S.rep - 45) * 0.15, 0, 100);
  S.morale = clamp(S.morale + (moraleTarget - S.morale) * 0.3, 0, 100);

  /* 2 — recruitment */
  let enrolled = 0;
  if (S.flags.intakeFreeze) {
    pushNews(S, "bad", m("news.intakeFrozen"));
  } else {
    const converted = D.leads * D.conversion;
    const vocShare = clamp(0.28 + S.depts.voc.level * 0.035, 0.2, 0.5);
    const wantVoc = converted * vocShare;
    const wantCollege = converted - wantVoc;

    const roomCollege = Math.max(0, D.collegeCapacity - S.students);
    const roomVoc = Math.max(0, D.vocCapacity - S.trainees);

    report.intakeCollege = Math.floor(Math.min(wantCollege, roomCollege));
    report.intakeVoc = Math.floor(Math.min(wantVoc, roomVoc));
    S.students += report.intakeCollege;
    S.trainees += report.intakeVoc;
    enrolled = report.intakeCollege + report.intakeVoc;

    const turnedAway = Math.floor((wantCollege - report.intakeCollege) + (wantVoc - report.intakeVoc));
    if (turnedAway > 12) {
      S.rep -= 1.2;
      pushNews(S, "bad", m("news.turnedAway", { n: turnedAway }));
    }
  }
  report.leads = Math.round(D.leads);
  report.conversion = D.conversion;

  /* 3 — attrition and graduation */
  const dropRate = clamp(0.042 - S.quality / 2400 - S.morale / 5000, 0.004, 0.07);
  const drops = Math.floor(S.students * dropRate) + Math.floor(S.trainees * dropRate * 0.7);
  report.dropouts = drops;
  S.students = Math.max(0, S.students - Math.floor(S.students * dropRate));
  S.trainees = Math.max(0, S.trainees - Math.floor(S.trainees * dropRate * 0.7));

  report.graduates = Math.floor(S.students / 24);      // ~2-year programmes
  report.vocGraduates = Math.floor(S.trainees / 9);    // short TVET courses
  S.students -= report.graduates;
  S.trainees -= report.vocGraduates;
  S.alumni += report.graduates + report.vocGraduates;

  /* 4 — industry partners: growth slows as the roster approaches its ceiling */
  const partnerCap = D.partnerCap;
  const partnerGain = (S.depts.ctd.level * 0.22 + S.depts.ctd.staff * 0.10
      + sumEffect(S, "partnerGain") / 10)
    * fundingById(S.depts.ctd.funding).outputMult * (0.5 + S.rep / 120)
    * Math.max(0, 1 - S.partners / partnerCap);
  const partnerChurn = S.partners * 0.04;
  S.partners = Math.max(0, S.partners + partnerGain - partnerChurn);
  report.partnerCap = partnerCap;

  /* 5 — revenue */
  const feeMult = 1 + sumEffect(S, "feeMult");
  const vocFeeMult = 1 + sumEffect(S, "vocFeeMult");
  report.revenue.tuition = S.students * CFG.tuitionCollege * feeMult;
  report.revenue.vocational = S.trainees * CFG.tuitionVoc * vocFeeMult;
  report.revenue.corporate = D.programmes * D.programFee;
  report.revenue.outreach = D.workshops * D.workshopFee;
  const income = Object.values(report.revenue).reduce((a, b) => a + b, 0);

  /* 6 — costs */
  report.cost.payroll = D.salaries;
  report.cost.departments = D.deptOpex;
  report.cost.delivery = D.deliveryCost;
  report.cost.upkeep = D.upkeep;
  report.cost.campus = D.overhead;
  const outgoings = Object.values(report.cost).reduce((a, b) => a + b, 0);

  const net = income - outgoings;
  report.income = income;
  report.outgoings = outgoings;
  report.net = net;
  S.cash += net;

  /* 7 — compliance decays faster the bigger the campus gets */
  const complianceUpkeep = sumEffect(S, "compliance") * 0.07
    + (fundingById(S.depts.college.funding).outputMult - 1) * 3.5;
  const complianceDecay = (1.0 + (S.students + S.trainees) / 900) * difficultyOf(S).decay;
  S.compliance = clamp(S.compliance - complianceDecay + complianceUpkeep, 0, 100);

  /* 8 — reputation settles toward what the college actually delivers */
  const repTarget = clamp(
    S.quality * 0.42 + S.vocQuality * 0.16 + S.employability * 0.18
      + sumEffect(S, "brand") * 0.6 + sumEffect(S, "goodwill") * 0.45
      + (S.compliance - 50) * 0.18 + (S.morale - 55) * 0.12, 0, 100);
  S.rep = clamp(S.rep + (repTarget - S.rep) * 0.18, 0, 100);

  if (S.compliance < 30) {
    S.rep -= 1;
    pushNews(S, "bad", m("news.complianceLow"));
  }

  /* 9 — expire one-month flags */
  for (const k of ["leadSurge", "leadSlump", "ctdDiscount", "conversionBoost"]) {
    if (S.flags[k]) { S.flags[k] -= 1; if (S.flags[k] <= 0) delete S.flags[k]; }
  }
  delete S.flags.intakeFreeze;
  delete S.flags.stemBusy;

  /* 10 — cost creep, then advance the calendar */
  S.overheadMult = round4(S.overheadMult * CFG.overheadCreep);
  S.payrollMult = round4(S.payrollMult * CFG.payrollCreep);

  S.tick += 1;
  S.month += 1;
  if (S.month > 11) { S.month = 0; S.year += 1; }

  S.report = report;
  S.history.push({ t: S.tick, cash: S.cash, students: S.students + S.trainees, rep: S.rep, net });
  if (S.history.length > 200) S.history.shift();

  pushNews(S, net >= 0 ? "good" : "bad",
    m(net >= 0 ? "news.surplus" : "news.deficit", {
      amount: money(Math.abs(net)), in: enrolled,
      grad: report.graduates + report.vocGraduates,
    }));

  /* 11 — annual board review */
  if (S.tick % 12 === 0) boardReview(S);

  /* 12 — random event */
  maybeEvent(S);

  clampAll(S);

  /* 13 — end conditions */
  checkEnd(S);
}

/** Events and the board review can push stats past their bounds; this is the
    single place everything gets pulled back into range. */
function clampAll(S) {
  S.rep = clamp(S.rep, 0, 100);
  S.quality = clamp(S.quality, 0, 100);
  S.vocQuality = clamp(S.vocQuality, 0, 100);
  S.morale = clamp(S.morale, 0, 100);
  S.compliance = clamp(S.compliance, 0, 100);
  S.employability = clamp(S.employability, 0, 100);
  S.partners = Math.max(0, S.partners);
}

/* ---------- board review ---------- */

function boardReview(S) {
  const kpi =
    (S.students + S.trainees) / 12 +
    S.partners * 2.2 +
    S.rep * 0.9 +
    S.compliance * 0.5 +
    (S.cash > 0 ? 12 : -25);

  if (kpi > 145) {
    const grant = 250000 + Math.round(S.rep * 4000);
    S.cash += grant;
    S.rep += 3;
    pushNews(S, "good", m("news.boardGreat", { grant: money(grant) }));
  } else if (kpi > 100) {
    const grant = 120000;
    S.cash += grant;
    pushNews(S, "good", m("news.boardGood", { grant: money(grant) }));
  } else if (kpi > 65) {
    pushNews(S, "info", m("news.boardOk"));
  } else {
    S.rep -= 4;
    pushNews(S, "bad", m("news.boardBad"));
  }
}

/* ---------- events ---------- */

function maybeEvent(S) {
  if (Math.random() > 0.34) return;
  const pool = EVENTS.filter((ev) => {
    if (ev.when && !ev.when(S)) return false;
    const last = S.seenEvents[ev.id];
    return last === undefined || S.tick - last >= 14;
  });
  const ev = weightedPick(pool);
  if (!ev) return;
  S.seenEvents[ev.id] = S.tick;

  if (ev.auto) {
    pushNews(S, "event", ev.apply(S), ev.id);
  } else {
    S.pending = ev.id;
  }
}

function resolveEvent(S, choiceIndex) {
  const ev = EVENTS.find((x) => x.id === S.pending);
  S.pending = null;
  if (!ev) return;
  const choice = ev.choices[choiceIndex];
  if (!choice) return;
  const msg = choice.apply(S);
  clampAll(S);
  pushNews(S, "event", msg, ev.id);
  checkEnd(S);
}

/* ---------- endgame ---------- */

function finalScore(S) {
  return Math.round(
    (S.students + S.trainees) * 1.1 +
    S.partners * 30 +
    S.rep * 45 +
    S.compliance * 12 +
    S.alumni * 0.5 +
    Math.max(0, S.cash) / 8000);
}

function rankFor(score) {
  if (score >= 8500) return m("rank.university");
  if (score >= 6500) return m("rank.premier");
  if (score >= 4500) return m("rank.established");
  if (score >= 2800) return m("rank.growing");
  return m("rank.struggling");
}

/** A run can end on the same tick an event fires. The end screen wins: drop the
    unresolved event, or its modal sits behind the end modal and blocks input. */
function endRun(S, over, newsType, newsText) {
  S.over = over;
  S.pending = null;
  pushNews(S, newsType, newsText);
}

function checkEnd(S) {
  if (S.over) return;

  if (S.cash < CFG.bankruptcyAt) {
    endRun(S, { win: false, title: m("end.insolvent.title"),
      text: m("end.insolvent.text", { cash: money(S.cash) }),
      score: finalScore(S), rank: m("rank.closed") },
      "bad", m("news.insolvent"));
    return;
  }
  if (S.rep < CFG.collapseRepAt) {
    endRun(S, { win: false, title: m("end.collapse.title"),
      text: m("end.collapse.text"),
      score: finalScore(S), rank: m("rank.dereg") },
      "bad", m("news.repCollapse"));
    return;
  }
  if (S.tick >= CFG.finalMonth) {
    const score = finalScore(S);
    endRun(S, { win: true, title: m("end.win.title"),
      text: m("end.win.text", {
        learners: num(S.students + S.trainees), partners: Math.floor(S.partners),
        alumni: num(S.alumni), cash: money(S.cash),
      }),
      score, rank: rankFor(score) },
      "good", m("news.complete", { score: num(score) }));
  }
}

/* ---------- objectives shown in the sidebar ---------- */

function objectives(S) {
  return [
    { label: t("obj.learners"), now: S.students + S.trainees, goal: 1200 },
    { label: t("obj.partners"), now: Math.floor(S.partners), goal: 25 },
    { label: t("obj.rep"), now: Math.round(S.rep), goal: 85 },
    { label: t("obj.compliance"), now: Math.round(S.compliance), goal: 80 },
    { label: t("obj.cash"), now: Math.max(0, Math.round(S.cash)), goal: 3000000 },
  ];
}

/* ---------- persistence ---------- */

function saveGame(S) {
  try {
    localStorage.setItem(CFG.saveKey, JSON.stringify(S));
    return true;
  } catch (err) {
    return false;
  }
}

function loadGame() {
  try {
    const raw = localStorage.getItem(CFG.saveKey);
    if (!raw) return null;
    const S = JSON.parse(raw);
    if (!S || S.v !== CFG.version) return null;
    return S;
  } catch (err) {
    return null;
  }
}

function hasSave() {
  try {
    return !!localStorage.getItem(CFG.saveKey);
  } catch (err) {
    return false;
  }
}

function clearSave() {
  try { localStorage.removeItem(CFG.saveKey); } catch (err) { /* ignore */ }
}
