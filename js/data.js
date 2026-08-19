/* ============================================================
   College Tycoon — static game data
   Departments, facilities, funding modes, events, difficulties.
   Nothing here mutates; the engine reads from these tables.
   ============================================================ */

const CFG = {
  version: 1,
  saveKey: "college-tycoon-save-v1",

  /* --- money knobs (RM, per month unless stated) --- */
  tuitionCollege: 780,      // per enrolled diploma/degree student
  tuitionVoc: 620,          // per vocational trainee
  ctdProgramFee: 18000,     // per corporate programme delivered
  stemWorkshopFee: 2600,    // per school outreach workshop
  campusOverhead: 48000,
  perStudentCost: 150,      // teaching materials, space, support services
  perTraineeCost: 130,      // workshops burn consumables

  /* every facility you build has to be maintained, forever */
  upkeepRate: 0.035,        // share of build cost charged monthly

  /* corporate training is not free money */
  partnerOrderRate: 0.35,      // programmes commissioned per partner per month
  programDeliveryShare: 0.45,  // share of the fee spent delivering it

  /* standing still loses ground: costs creep every month */
  overheadCreep: 1.0035,   // ~4.3% a year
  payrollCreep: 1.0025,    // ~3.0% a year

  /* --- staffing --- */
  hireCostMult: 1.5,        // recruitment fee = salary x this
  severanceMult: 2.0,

  /* --- rules --- */
  bankruptcyAt: -300000,
  collapseRepAt: 8,
  finalMonth: 60,           // 5 academic years
};

/* Funding mode applied per department each month. */
const FUNDING = [
  { id: "lean",   costMult: 0.55, outputMult: 0.70, morale: -2.5 },
  { id: "normal", costMult: 1.00, outputMult: 1.00, morale:  0.0 },
  { id: "boost",  costMult: 1.60, outputMult: 1.32, morale: +1.5 },
  { id: "max",    costMult: 2.40, outputMult: 1.58, morale: +2.5 },
];

const fundingById = (id) => FUNDING.find((f) => f.id === id) || FUNDING[1];

/* ------------------------------------------------------------
   Departments.

   Each facility declares `effects`, a bag of named modifiers the
   engine sums across every purchased facility:

     capacity      college seats
     vocCapacity   vocational seats
     quality       teaching quality points
     feeMult       college tuition multiplier (additive, 0.12 = +12%)
     vocFeeMult    vocational fee multiplier
     compliance    monthly accreditation upkeep
     employability graduate employability points
     partnerGain   industry partner acquisition (tenths per month)
     programFee    RM added per corporate programme
     leads         monthly enquiries
     conversion    enquiry -> enrolment, percentage points
     brand         reputation target bonus
     pipeline      monthly enquiries fed by school outreach
     goodwill      reputation target bonus (community)
     workshopFee   RM added per STEM workshop
   ------------------------------------------------------------ */
const DEPARTMENTS = [
  {
    id: "college",
    icon: "🎓",
    salary: 5200,
    opex: 9000,
    upgradeBase: 240000,
    maxLevel: 5,
    facilities: [
      { id: "lecture-block", cost: 320000, effects: { capacity: 160 } },
      { id: "library", cost: 180000, effects: { quality: 6, compliance: 8 } },
      { id: "elearning", cost: 140000, effects: { quality: 5, capacity: 60 } },
      { id: "mqa", cost: 260000, effects: { compliance: 25, feeMult: 0.12, conversion: 4 } },
      { id: "research", cost: 480000, reqLevel: 3, effects: { quality: 8, brand: 4, feeMult: 0.10 } },
    ],
  },
  {
    id: "voc",
    icon: "🛠️",
    salary: 4600,
    opex: 11000,
    upgradeBase: 210000,
    maxLevel: 5,
    facilities: [
      { id: "machine-shop", cost: 300000, effects: { vocCapacity: 70, employability: 6 } },
      { id: "hrdcorp", cost: 120000, effects: { vocFeeMult: 0.20, programFee: 3000 } },
      { id: "smt", cost: 420000, reqLevel: 2, effects: { vocCapacity: 60, employability: 10, vocFeeMult: 0.15 } },
      { id: "apprentice", cost: 260000, effects: { employability: 12, partnerGain: 8, partnerCap: 5 } },
      { id: "automation", cost: 520000, reqLevel: 3, effects: { vocCapacity: 80, employability: 9, quality: 4 } },
    ],
  },
  {
    id: "ctd",
    icon: "🏭",
    salary: 6200,
    opex: 7000,
    upgradeBase: 200000,
    maxLevel: 5,
    facilities: [
      { id: "crm", cost: 130000, effects: { partnerGain: 12, partnerCap: 6 } },
      { id: "training-suite", cost: 220000, effects: { programFee: 4000, employability: 3 } },
      { id: "machine-vision", cost: 340000, reqLevel: 2, effects: { programFee: 9000, brand: 3 } },
      { id: "consult", cost: 300000, effects: { programFee: 7000, employability: 5 } },
      { id: "intl", cost: 400000, reqLevel: 3, effects: { programFee: 12000, partnerGain: 10, partnerCap: 8 } },
    ],
  },
  {
    id: "mkt",
    icon: "📣",
    salary: 4800,
    opex: 12000,
    upgradeBase: 180000,
    maxLevel: 5,
    facilities: [
      { id: "social", cost: 150000, effects: { leads: 55 } },
      { id: "openday", cost: 110000, effects: { leads: 40, conversion: 5 } },
      { id: "alumni", cost: 190000, effects: { leads: 35, conversion: 3, brand: 4 } },
      { id: "scholarship", cost: 280000, effects: { conversion: 9, brand: 5 } },
      { id: "broadcast", cost: 520000, reqLevel: 3, effects: { leads: 120, brand: 8 } },
    ],
  },
  {
    id: "stem",
    icon: "🔬",
    salary: 4200,
    opex: 6500,
    upgradeBase: 160000,
    maxLevel: 5,
    facilities: [
      { id: "robotics", cost: 200000, effects: { pipeline: 26, workshopFee: 900 } },
      { id: "teachertraining", cost: 180000, effects: { workshopFee: 1600, goodwill: 3 } },
      { id: "stemvan", cost: 240000, effects: { pipeline: 34, goodwill: 4 } },
      { id: "competition", cost: 330000, reqLevel: 2, effects: { pipeline: 30, brand: 6, goodwill: 5 } },
      { id: "stemcentre", cost: 560000, reqLevel: 3, effects: { pipeline: 55, workshopFee: 2500, goodwill: 6 } },
    ],
  },
];

const deptById = (id) => DEPARTMENTS.find((d) => d.id === id);

/* capexMult scales what you buy, opexMult what you run, decay how fast
   accreditation slips. Splitting them keeps the hard mode tight rather
   than mathematically unrecoverable from month one. */
const DIFFICULTIES = [
  { id: "easy", cash: 1400000, capexMult: 0.90, opexMult: 0.94, decay: 0.70, },
  { id: "standard",    cash: 900000,  capexMult: 1.00, opexMult: 1.00, decay: 1.00, },
  { id: "hard",    cash: 850000,  capexMult: 1.15, opexMult: 1.05, decay: 1.20, },
];

/* ------------------------------------------------------------
   Events. `when(S)` gates availability, `weight` sets frequency.
   Choice events pause the month until the player answers; each
   choice's `apply(S)` mutates state and returns a news line.
   ------------------------------------------------------------ */
const EVENTS = [
  {
    id: "mqa-audit",
    icon: "📋",
    weight: 14,
    when: (S) => S.compliance < 62,
    choices: [
      { apply: (S) => { S.cash -= 120000; S.compliance = clamp(S.compliance + 22, 0, 100);
          return m("ev.mqa-audit.c0.m"); } },
      { apply: (S) => { S.flags.intakeFreeze = 1; S.compliance = clamp(S.compliance + 16, 0, 100);
          S.morale -= 5; return m("ev.mqa-audit.c1.m"); } },
      { apply: (S) => {
          if (S.compliance > 45) { S.compliance = clamp(S.compliance + 4, 0, 100);
            return m("ev.mqa-audit.c2.pass"); }
          S.rep -= 9; S.cash -= 80000; S.compliance = clamp(S.compliance - 6, 0, 100);
          return m("ev.mqa-audit.c2.fail"); } },
    ],
  },
  {
    id: "anchor-client",
    icon: "🤝",
    weight: 16,
    when: (S) => S.depts.ctd.level >= 2,
    choices: [
      { apply: (S) => { S.cash -= 90000; S.partners += 4; S.depts.ctd.staff += 2;
          return m("ev.anchor-client.c0.m"); } },
      { apply: (S) => { S.partners += 2;
          return m("ev.anchor-client.c1.m"); } },
      { apply: (S) => { S.morale += 3;
          return m("ev.anchor-client.c2.m"); } },
    ],
  },
  {
    id: "poaching",
    icon: "🎯",
    weight: 13,
    when: (S) => totalStaff(S) >= 12,
    choices: [
      { apply: (S) => { S.cash -= 60000; S.morale += 8;
          return m("ev.poaching.c0.m"); } },
      { apply: (S) => { S.depts.college.staff = Math.max(1, S.depts.college.staff - 2); S.morale -= 6;
          return m("ev.poaching.c1.m"); } },
      { apply: (S) => { S.cash -= 20000; S.morale += 3;
          if (Math.random() < 0.45) { S.depts.college.staff = Math.max(1, S.depts.college.staff - 1);
            return m("ev.poaching.c2.some"); }
          return m("ev.poaching.c2.all"); } },
    ],
  },
  {
    id: "stem-grant",
    icon: "🏛️",
    weight: 14,
    when: (S) => S.depts.stem.level >= 2,
    choices: [
      { apply: (S) => { const g = 180000 + S.depts.stem.level * 40000; S.cash += g; S.rep += 4;
          S.flags.stemBusy = 1;
          return m("ev.stem-grant.c0.m", { grant: money(g) }); } },
      { apply: (S) => { const g = 90000; S.cash += g; S.rep += 2;
          return m("ev.stem-grant.c1.m", { grant: money(g) }); } },
      { apply: () => "The grant window closed unused." },
    ],
  },
  {
    id: "equipment-failure",
    icon: "⚙️",
    weight: 12,
    when: (S) => S.depts.voc.level >= 2,
    choices: [
      { apply: (S) => { S.cash -= 190000;
          return m("ev.equipment-failure.c0.m"); } },
      { apply: (S) => { S.cash -= 45000; S.vocQuality -= 12;
          return m("ev.equipment-failure.c1.m"); } },
      { apply: (S) => {
          if (S.partners >= 6) { S.partners -= 1;
            return m("ev.equipment-failure.c2.ok"); }
          S.vocQuality -= 18;
          return m("ev.equipment-failure.c2.no"); } },
    ],
  },
  {
    id: "viral-project",
    icon: "🚀",
    weight: 11,
    when: (S) => S.quality > 55,
    choices: [
      { apply: (S) => { S.cash -= 70000; S.flags.leadSurge = 2; S.rep += 6;
          return m("ev.viral-project.c0.m"); } },
      { apply: (S) => { S.rep += 3; S.flags.leadSurge = 1;
          return m("ev.viral-project.c1.m"); } },
    ],
  },
  {
    id: "intake-slump",
    icon: "📉",
    weight: 10,
    when: (S) => S.tick > 8,
    choices: [
      { apply: (S) => { S.cash -= 150000; S.flags.conversionBoost = 3;
          return m("ev.intake-slump.c0.m"); } },
      { apply: (S) => { S.flags.leadSlump = 2;
          return m("ev.intake-slump.c1.m"); } },
    ],
  },
  {
    id: "accreditation-award",
    icon: "🏆",
    weight: 9,
    when: (S) => S.rep > 62 && S.compliance > 65,
    choices: [
      { apply: (S) => {
          if (Math.random() < 0.7) { S.cash -= 40000; S.rep += 10; S.flags.leadSurge = 2;
            return m("ev.accreditation-award.c0.win"); }
          S.cash -= 40000; S.rep += 2;
          return m("ev.accreditation-award.c0.lose"); } },
      { apply: () => "Withdrew from consideration." },
    ],
  },
  {
    id: "salary-review",
    icon: "💰",
    weight: 10,
    when: (S) => S.tick > 10 && S.morale < 62,
    choices: [
      { apply: (S) => { S.payrollMult = round4(S.payrollMult * 1.08); S.morale += 14;
          return m("ev.salary-review.c0.m"); } },
      { apply: (S) => { S.cash -= 80000; S.morale += 7;
          return m("ev.salary-review.c1.m"); } },
      { apply: (S) => { S.morale -= 10;
          return m("ev.salary-review.c2.m"); } },
    ],
  },
  {
    id: "partner-consolidation",
    icon: "🏢",
    weight: 9,
    when: (S) => S.partners >= 8,
    choices: [
      { apply: (S) => {
          if (Math.random() < 0.5) { S.partners -= 2;
            return m("ev.partner-consolidation.c0.lost"); }
          return m("ev.partner-consolidation.c0.kept"); } },
      { apply: (S) => { S.flags.ctdDiscount = 6; S.partners += 1;
          return m("ev.partner-consolidation.c1.m"); } },
    ],
  },
  {
    id: "campus-flood",
    icon: "🌧️",
    weight: 8,
    when: () => true,
    choices: [
      { apply: (S) => { S.cash -= 130000;
          return m("ev.campus-flood.c0.m"); } },
      { apply: (S) => { S.cash -= 35000; S.quality -= 8; S.compliance -= 10;
          return m("ev.campus-flood.c1.m"); } },
    ],
  },
  {
    id: "lecturer-phd",
    icon: "📚",
    weight: 9,
    when: (S) => S.depts.college.level >= 2,
    choices: [
      { apply: (S) => { S.cash -= 110000; S.quality += 7; S.morale += 8; S.compliance += 6;
          return m("ev.lecturer-phd.c0.m"); } },
      { apply: (S) => { S.cash -= 40000; S.quality += 2; S.morale += 2;
          return m("ev.lecturer-phd.c1.m"); } },
      { apply: (S) => { S.morale -= 7;
          return m("ev.lecturer-phd.c2.m"); } },
    ],
  },
  {
    id: "cyber-incident",
    icon: "🔐",
    weight: 8,
    when: (S) => S.tick > 12,
    choices: [
      { apply: (S) => { S.cash -= 95000; S.compliance += 8;
          return m("ev.cyber-incident.c0.m"); } },
      { apply: (S) => { S.cash -= 20000;
          if (Math.random() < 0.35) { S.rep -= 7; S.compliance -= 8;
            return m("ev.cyber-incident.c1.bad"); }
          return m("ev.cyber-incident.c1.ok"); } },
    ],
  },
  {
    id: "employer-survey",
    icon: "📊",
    weight: 10,
    when: (S) => S.alumni > 60,
    auto: true,
    apply: (S) => {
      const emp = S.employability;
      if (emp > 70) { S.rep += 6;
        return m("ev.employer-survey.high", { emp: Math.round(emp) }); }
      if (emp > 45) { S.rep += 1;
        return m("ev.employer-survey.mid", { emp: Math.round(emp) }); }
      S.rep -= 6;
      return m("ev.employer-survey.low", { emp: Math.round(emp) });
    },
  },
  {
    id: "utility-hike",
    icon: "⚡",
    weight: 8,
    when: (S) => S.tick > 6,
    auto: true,
    apply: (S) => { S.overheadMult = round4(S.overheadMult * 1.06);
      return m("ev.utility-hike.m"); },
  },
  {
    id: "open-source-donation",
    icon: "🎁",
    weight: 7,
    when: (S) => S.partners >= 4,
    auto: true,
    apply: (S) => { S.vocQuality = clamp(S.vocQuality + 8, 0, 100); S.rep += 2;
      return m("ev.open-source-donation.m"); },
  },
];

/* ------------------------------------------------------------
   Display-text accessors. The tables above hold ids and numbers
   only; every player-visible string comes from the dictionary, so
   switching language needs no rebuild of the game data.
   ------------------------------------------------------------ */
const deptName      = (d) => t(`dept.${d.id}.name`);
const deptTagline   = (d) => t(`dept.${d.id}.tagline`);
const deptStaff     = (d) => t(`dept.${d.id}.staff`);
const deptStaffOne  = (d) => t(`dept.${d.id}.staffOne`);
const deptLevelNote = (d) => t(`dept.${d.id}.level`);
const facName       = (f) => t(`fac.${f.id}.name`);
const facDesc       = (f) => t(`fac.${f.id}.desc`);
const fundName      = (f) => t(`fund.${f.id}`);
const diffName      = (d) => t(`diff.${d.id}.name`);
const diffDesc      = (d) => t(`diff.${d.id}.desc`);
