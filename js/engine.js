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
  pushNews(S, "info", "Semester one begins. The board expects a five-year turnaround.");
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
  return `${MONTH_NAMES[S.month]} · Year ${S.year}`;
}

function pushNews(S, type, text) {
  S.news.unshift({ tick: S.tick, date: dateLabel(S), type, text });
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
  if (st.level >= d.maxLevel) return "Already at maximum level.";
  const cost = upgradeCost(S, deptId);
  if (S.cash < cost) return "Not enough cash.";
  S.cash -= cost;
  st.level += 1;
  pushNews(S, "good", `${d.name} expanded to level ${st.level} (${money(cost)}).`);
  return null;
}

function actHire(S, deptId) {
  const d = deptById(deptId);
  const cost = hireCost(S, deptId);
  if (S.cash < cost) return "Not enough cash for the recruitment fee.";
  S.cash -= cost;
  S.depts[deptId].staff += 1;
  pushNews(S, "info", `Hired one ${d.staffTitle.replace(/s$/, "").toLowerCase()} for the ${d.name} (${money(cost)}).`);
  return null;
}

function actFire(S, deptId) {
  const d = deptById(deptId);
  const st = S.depts[deptId];
  if (st.staff <= 1) return "Every department must keep at least one member of staff.";
  const cost = severanceCost(S, deptId);
  if (S.cash < cost) return "Not enough cash for severance.";
  S.cash -= cost;
  st.staff -= 1;
  S.morale = clamp(S.morale - 3, 0, 100);
  pushNews(S, "bad", `Released one ${d.staffTitle.replace(/s$/, "").toLowerCase()} from the ${d.name} (${money(cost)} severance).`);
  return null;
}

function actBuyFacility(S, deptId, facilityId) {
  const d = deptById(deptId);
  const st = S.depts[deptId];
  const f = d.facilities.find((x) => x.id === facilityId);
  if (!f) return "Unknown facility.";
  if (st.owned.includes(facilityId)) return "Already built.";
  if (f.reqLevel && st.level < f.reqLevel) return `Requires ${d.name} level ${f.reqLevel}.`;
  const cost = facilityCost(S, f);
  if (S.cash < cost) return "Not enough cash.";
  S.cash -= cost;
  st.owned.push(facilityId);
  pushNews(S, "good", `Built: ${f.name} (${money(cost)}).`);
  return null;
}

function actSetFunding(S, deptId, fundingId) {
  if (!FUNDING.some((f) => f.id === fundingId)) return "Unknown funding mode.";
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
    date: dateLabel(S),
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
    pushNews(S, "bad", "Intake frozen this month — admissions staff are on audit duty.");
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
      pushNews(S, "bad", `${turnedAway} applicants turned away — the campus is full.`);
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
    pushNews(S, "bad", "Accreditation paperwork is badly overdue. The regulator is watching.");
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
    `${net >= 0 ? "Surplus" : "Deficit"} of ${money(Math.abs(net))}. ` +
    `${enrolled} new learners, ${report.graduates + report.vocGraduates} graduated.`);

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
    pushNews(S, "good", `Board review: outstanding. Development grant of ${money(grant)} approved.`);
  } else if (kpi > 100) {
    const grant = 120000;
    S.cash += grant;
    pushNews(S, "good", `Board review: on track. ${money(grant)} released for development.`);
  } else if (kpi > 65) {
    pushNews(S, "info", "Board review: satisfactory, no additional funding this year.");
  } else {
    S.rep -= 4;
    pushNews(S, "bad", "Board review: underperforming. The board has issued a formal warning.");
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
    const msg = ev.apply(S);
    pushNews(S, "event", `${ev.icon} ${ev.title} — ${msg}`);
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
  pushNews(S, "event", `${ev.icon} ${ev.title} — ${msg}`);
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
  if (score >= 8500) return "University College — a national reference campus";
  if (score >= 6500) return "Premier College — the region's first choice";
  if (score >= 4500) return "Established College — respected and stable";
  if (score >= 2800) return "Growing College — the foundations are laid";
  return "Struggling College — survived, barely";
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
    endRun(S, { win: false, title: "Insolvent",
      text: `Cash reached ${money(S.cash)}. The board has appointed administrators and the campus is closing.`,
      score: finalScore(S), rank: "Closed by the board" },
      "bad", "The college is insolvent. Game over.");
    return;
  }
  if (S.rep < CFG.collapseRepAt) {
    endRun(S, { win: false, title: "Reputation Collapse",
      text: "Reputation fell below the point of recovery. Enrolments have dried up and the regulator has suspended new intakes.",
      score: finalScore(S), rank: "Deregistered" },
      "bad", "Reputation collapse. Game over.");
    return;
  }
  if (S.tick >= CFG.finalMonth) {
    const score = finalScore(S);
    endRun(S, { win: true, title: "Five-Year Plan Complete",
      text: `${num(S.students + S.trainees)} learners on campus, ${Math.floor(S.partners)} industry partners, ` +
            `${num(S.alumni)} graduates and ${money(S.cash)} in reserve.`,
      score, rank: rankFor(score) },
      "good", `Five-year plan complete. Final score ${num(score)}.`);
  }
}

/* ---------- objectives shown in the sidebar ---------- */

function objectives(S) {
  return [
    { label: "1,200 learners enrolled", now: S.students + S.trainees, goal: 1200 },
    { label: "25 industry partners", now: Math.floor(S.partners), goal: 25 },
    { label: "Reputation 85", now: Math.round(S.rep), goal: 85 },
    { label: "Compliance 80", now: Math.round(S.compliance), goal: 80 },
    { label: "RM 3M in reserve", now: Math.max(0, Math.round(S.cash)), goal: 3000000 },
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
