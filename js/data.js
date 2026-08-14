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
  { id: "lean",   name: "Lean",   costMult: 0.55, outputMult: 0.70, morale: -2.5 },
  { id: "normal", name: "Normal", costMult: 1.00, outputMult: 1.00, morale:  0.0 },
  { id: "boost",  name: "Boost",  costMult: 1.60, outputMult: 1.32, morale: +1.5 },
  { id: "max",    name: "Max",    costMult: 2.40, outputMult: 1.58, morale: +2.5 },
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
    name: "College Department",
    icon: "🎓",
    tagline: "Diploma & degree programmes — the academic backbone.",
    staffTitle: "Lecturers",
    salary: 5200,
    opex: 9000,
    upgradeBase: 240000,
    maxLevel: 5,
    levelNote: "Adds seats, raises teaching quality.",
    facilities: [
      { id: "lecture-block", name: "Lecture Block B", cost: 320000,
        desc: "+160 seats.", effects: { capacity: 160 } },
      { id: "library", name: "Digital Library & Learning Commons", cost: 180000,
        desc: "+6 quality, +8 compliance.", effects: { quality: 6, compliance: 8 } },
      { id: "elearning", name: "Blended Learning Platform", cost: 140000,
        desc: "+5 quality, +60 seats.", effects: { quality: 5, capacity: 60 } },
      { id: "mqa", name: "MQA Full Accreditation Drive", cost: 260000,
        desc: "+25 compliance, +12% tuition, +4 conversion.",
        effects: { compliance: 25, feeMult: 0.12, conversion: 4 } },
      { id: "research", name: "Applied Research Centre", cost: 480000, reqLevel: 3,
        desc: "+8 quality, +4 brand, +10% tuition.",
        effects: { quality: 8, brand: 4, feeMult: 0.10 } },
    ],
  },
  {
    id: "voc",
    name: "Vocational Education Department",
    icon: "🛠️",
    tagline: "TVET skills certification, apprenticeships, short courses.",
    staffTitle: "Instructors",
    salary: 4600,
    opex: 11000,
    upgradeBase: 210000,
    maxLevel: 5,
    levelNote: "Adds workshop places and trade coverage.",
    facilities: [
      { id: "machine-shop", name: "Precision Machining Workshop", cost: 300000,
        desc: "+70 places, +6 employability.",
        effects: { vocCapacity: 70, employability: 6 } },
      { id: "hrdcorp", name: "HRD Corp Claimable Certification", cost: 120000,
        desc: "+20% vocational fees, +RM3k per corporate programme.",
        effects: { vocFeeMult: 0.20, programFee: 3000 } },
      { id: "smt", name: "SMT & Electronics Assembly Line", cost: 420000, reqLevel: 2,
        desc: "+60 places, +10 employability, +15% vocational fees.",
        effects: { vocCapacity: 60, employability: 10, vocFeeMult: 0.15 } },
      { id: "apprentice", name: "Industry Apprenticeship Scheme", cost: 260000,
        desc: "+12 employability, +5 partner ceiling.",
        effects: { employability: 12, partnerGain: 8, partnerCap: 5 } },
      { id: "automation", name: "Automation & Robotics Bay", cost: 520000, reqLevel: 3,
        desc: "+80 places, +9 employability, +4 quality.",
        effects: { vocCapacity: 80, employability: 9, quality: 4 } },
    ],
  },
  {
    id: "ctd",
    name: "Corporate Training Department",
    icon: "🏭",
    tagline: "Paid upskilling programmes delivered to industry clients.",
    staffTitle: "Trainers",
    salary: 6200,
    opex: 7000,
    upgradeBase: 200000,
    maxLevel: 5,
    levelNote: "Wins more industry partners, runs bigger cohorts.",
    facilities: [
      { id: "crm", name: "Client Relationship System", cost: 130000,
        desc: "Faster partner acquisition, +6 partner ceiling.",
        effects: { partnerGain: 12, partnerCap: 6 } },
      { id: "training-suite", name: "Corporate Training Suite", cost: 220000,
        desc: "+RM4k per programme, +3 employability.",
        effects: { programFee: 4000, employability: 3 } },
      { id: "machine-vision", name: "Machine Vision Masterclass", cost: 340000, reqLevel: 2,
        desc: "+RM9k per programme, +3 brand.",
        effects: { programFee: 9000, brand: 3 } },
      { id: "consult", name: "Consultancy & Audit Arm", cost: 300000,
        desc: "+RM7k per programme, +5 employability.",
        effects: { programFee: 7000, employability: 5 } },
      { id: "intl", name: "International Client Desk", cost: 400000, reqLevel: 3,
        desc: "+RM12k per programme, +8 partner ceiling.",
        effects: { programFee: 12000, partnerGain: 10, partnerCap: 8 } },
    ],
  },
  {
    id: "mkt",
    name: "Marketing Department",
    icon: "📣",
    tagline: "Enquiries, brand, and turning applicants into enrolments.",
    staffTitle: "Marketers",
    salary: 4800,
    opex: 12000,
    upgradeBase: 180000,
    maxLevel: 5,
    levelNote: "More reach per campaign cycle.",
    facilities: [
      { id: "social", name: "Digital & Social Media Studio", cost: 150000,
        desc: "+55 enquiries / month.", effects: { leads: 55 } },
      { id: "openday", name: "Quarterly Open Day Programme", cost: 110000,
        desc: "+40 enquiries, +5 conversion.", effects: { leads: 40, conversion: 5 } },
      { id: "alumni", name: "Alumni Ambassador Network", cost: 190000,
        desc: "+35 enquiries, +3 conversion, +4 brand.",
        effects: { leads: 35, conversion: 3, brand: 4 } },
      { id: "scholarship", name: "Scholarship & Bursary Fund", cost: 280000,
        desc: "+9 conversion, +5 brand.", effects: { conversion: 9, brand: 5 } },
      { id: "broadcast", name: "National Brand Campaign", cost: 520000, reqLevel: 3,
        desc: "+120 enquiries, +8 brand.", effects: { leads: 120, brand: 8 } },
    ],
  },
  {
    id: "stem",
    name: "Education STEM Department",
    icon: "🔬",
    tagline: "School outreach that builds goodwill and a future pipeline.",
    staffTitle: "Facilitators",
    salary: 4200,
    opex: 6500,
    upgradeBase: 160000,
    maxLevel: 5,
    levelNote: "More workshops, wider school network.",
    facilities: [
      { id: "robotics", name: "Robotics & Coding Lab", cost: 200000,
        desc: "+26 pipeline, +RM900 per workshop.",
        effects: { pipeline: 26, workshopFee: 900 } },
      { id: "teachertraining", name: "Teacher Upskilling Academy", cost: 180000,
        desc: "+RM1.6k per workshop, +3 goodwill.",
        effects: { workshopFee: 1600, goodwill: 3 } },
      { id: "stemvan", name: "Mobile STEM Outreach Van", cost: 240000,
        desc: "+34 pipeline, +4 goodwill.", effects: { pipeline: 34, goodwill: 4 } },
      { id: "competition", name: "National STEM Competition Host", cost: 330000, reqLevel: 2,
        desc: "+30 pipeline, +6 brand, +5 goodwill.",
        effects: { pipeline: 30, brand: 6, goodwill: 5 } },
      { id: "stemcentre", name: "STEM Discovery Centre", cost: 560000, reqLevel: 3,
        desc: "+55 pipeline, +RM2.5k per workshop, +6 goodwill.",
        effects: { pipeline: 55, workshopFee: 2500, goodwill: 6 } },
    ],
  },
];

const deptById = (id) => DEPARTMENTS.find((d) => d.id === id);

/* capexMult scales what you buy, opexMult what you run, decay how fast
   accreditation slips. Splitting them keeps the hard mode tight rather
   than mathematically unrecoverable from month one. */
const DIFFICULTIES = [
  { id: "easy",     name: "Foundation", cash: 1400000, capexMult: 0.90, opexMult: 0.94, decay: 0.70,
    desc: "Generous board, forgiving regulator. Learn the systems." },
  { id: "standard", name: "Diploma",    cash: 900000,  capexMult: 1.00, opexMult: 1.00, decay: 1.00,
    desc: "The intended balance. Every ringgit has a job." },
  { id: "hard",     name: "Honours",    cash: 850000,  capexMult: 1.15, opexMult: 1.05, decay: 1.20,
    desc: "Thin runway, aggressive competitors, strict audits." },
];

/* ------------------------------------------------------------
   Events. `when(S)` gates availability, `weight` sets frequency.
   Choice events pause the month until the player answers; each
   choice's `apply(S)` mutates state and returns a news line.
   ------------------------------------------------------------ */
const EVENTS = [
  {
    id: "mqa-audit",
    title: "MQA Audit Notice",
    icon: "📋",
    weight: 14,
    when: (S) => S.compliance < 62,
    text: "The Malaysian Qualifications Agency has scheduled a provisional audit. Documentation across the College Department is behind.",
    choices: [
      { label: "Hire audit consultants (RM 120,000)",
        detail: "Buy your way to a clean report.",
        apply: (S) => { S.cash -= 120000; S.compliance = clamp(S.compliance + 22, 0, 100);
          return "Consultants closed the gaps. Audit passed with minor observations."; } },
      { label: "Freeze intake for one month",
        detail: "Staff redeploy to documentation. No enrolments next month.",
        apply: (S) => { S.flags.intakeFreeze = 1; S.compliance = clamp(S.compliance + 16, 0, 100);
          S.morale -= 5; return "Intake frozen while lecturers rebuild course files."; } },
      { label: "Take the audit as-is",
        detail: "Gamble on the existing paperwork.",
        apply: (S) => {
          if (S.compliance > 45) { S.compliance = clamp(S.compliance + 4, 0, 100);
            return "Conditional pass. The panel wants follow-up evidence."; }
          S.rep -= 9; S.cash -= 80000; S.compliance = clamp(S.compliance - 6, 0, 100);
          return "Two programmes placed under conditional accreditation. Bad press, RM 80,000 in remediation."; } },
    ],
  },
  {
    id: "anchor-client",
    title: "Anchor Client Enquiry",
    icon: "🤝",
    weight: 16,
    when: (S) => S.depts.ctd.level >= 2,
    text: "A large electronics manufacturer wants a 12-month machine vision upskilling contract — but demands a dedicated trainer team.",
    choices: [
      { label: "Sign it and staff up (RM 90,000 setup)",
        detail: "+4 partners, +2 trainers on payroll.",
        apply: (S) => { S.cash -= 90000; S.partners += 4; S.depts.ctd.staff += 2;
          return "Contract signed. Four sister plants joined the partner roster."; } },
      { label: "Sign a smaller pilot",
        detail: "+2 partners, no new hires.",
        apply: (S) => { S.partners += 2;
          return "Pilot cohort agreed. Two plants onboarded."; } },
      { label: "Decline — capacity is tight",
        detail: "Protect morale.",
        apply: (S) => { S.morale += 3;
          return "Declined politely. Trainers relieved; the client went elsewhere."; } },
    ],
  },
  {
    id: "poaching",
    title: "Rival College Poaching Staff",
    icon: "🎯",
    weight: 13,
    when: (S) => totalStaff(S) >= 12,
    text: "A competing private college is offering your senior lecturers a 20% raise.",
    choices: [
      { label: "Match the offer (RM 60,000 / one-off retention bonus)",
        detail: "Keep everyone, morale up.",
        apply: (S) => { S.cash -= 60000; S.morale += 8;
          return "Retention bonuses paid. Nobody resigned this cycle."; } },
      { label: "Let them go",
        detail: "Lose 2 lecturers, save the money.",
        apply: (S) => { S.depts.college.staff = Math.max(1, S.depts.college.staff - 2); S.morale -= 6;
          return "Two senior lecturers resigned. Class sizes just got worse."; } },
      { label: "Counter with promotion tracks",
        detail: "Cheaper, partially effective.",
        apply: (S) => { S.cash -= 20000; S.morale += 3;
          if (Math.random() < 0.45) { S.depts.college.staff = Math.max(1, S.depts.college.staff - 1);
            return "One lecturer still left, but the rest accepted new career tracks."; }
          return "The promotion framework held the team together."; } },
    ],
  },
  {
    id: "stem-grant",
    title: "State STEM Education Grant",
    icon: "🏛️",
    weight: 14,
    when: (S) => S.depts.stem.level >= 2,
    text: "The state education office is funding STEM outreach to rural schools. Applying costs staff time.",
    choices: [
      { label: "Apply for the full grant",
        detail: "Big money, one month of reduced outreach.",
        apply: (S) => { const g = 180000 + S.depts.stem.level * 40000; S.cash += g; S.rep += 4;
          S.flags.stemBusy = 1;
          return `Grant awarded: ${money(g)}. Outreach paused this month for reporting.`; } },
      { label: "Apply jointly with a partner school",
        detail: "Smaller grant, no disruption.",
        apply: (S) => { const g = 90000; S.cash += g; S.rep += 2;
          return `Joint application approved: ${money(g)}.`; } },
      { label: "Skip it",
        detail: "Stay focused on delivery.",
        apply: () => "The grant window closed unused." },
    ],
  },
  {
    id: "equipment-failure",
    title: "Workshop Equipment Failure",
    icon: "⚙️",
    weight: 12,
    when: (S) => S.depts.voc.level >= 2,
    text: "The CNC and pick-and-place trainers in the vocational workshop have failed mid-semester.",
    choices: [
      { label: "Full replacement (RM 190,000)",
        detail: "Back to normal immediately.",
        apply: (S) => { S.cash -= 190000;
          return "New equipment installed over the weekend. No lost practicals."; } },
      { label: "Repair and share machines (RM 45,000)",
        detail: "Trainee quality suffers for a while.",
        apply: (S) => { S.cash -= 45000; S.vocQuality -= 12;
          return "Machines patched up. Trainees are queueing for bench time."; } },
      { label: "Borrow from an industry partner",
        detail: "Free, if you have partners.",
        apply: (S) => {
          if (S.partners >= 6) { S.partners -= 1;
            return "A partner loaned two machines — you spent goodwill to get them."; }
          S.vocQuality -= 18;
          return "No partner could help. Practical sessions cancelled for weeks."; } },
    ],
  },
  {
    id: "viral-project",
    title: "Student Project Goes Viral",
    icon: "🚀",
    weight: 11,
    when: (S) => S.quality > 55,
    text: "A final-year vision-inspection project is trending on national tech media.",
    choices: [
      { label: "Push a marketing blitz (RM 70,000)",
        detail: "Convert the attention into enquiries.",
        apply: (S) => { S.cash -= 70000; S.flags.leadSurge = 2; S.rep += 6;
          return "The campaign rode the wave — enquiries are spiking."; } },
      { label: "Let it ride organically",
        detail: "Free reputation.",
        apply: (S) => { S.rep += 3; S.flags.leadSurge = 1;
          return "Coverage spread on its own. A pleasant bump in enquiries."; } },
    ],
  },
  {
    id: "intake-slump",
    title: "Regional Intake Slump",
    icon: "📉",
    weight: 10,
    when: (S) => S.tick > 8,
    text: "SPM leavers are deferring study this year across the region. Every college is short of applicants.",
    choices: [
      { label: "Emergency scholarship round (RM 150,000)",
        detail: "Hold your enrolment numbers.",
        apply: (S) => { S.cash -= 150000; S.flags.conversionBoost = 3;
          return "Scholarships announced. Conversion holding up despite the slump."; } },
      { label: "Ride it out",
        detail: "Enquiries drop for two months.",
        apply: (S) => { S.flags.leadSlump = 2;
          return "No response mounted. Enquiry volume is falling."; } },
    ],
  },
  {
    id: "accreditation-award",
    title: "Industry Accreditation Award",
    icon: "🏆",
    weight: 9,
    when: (S) => S.rep > 62 && S.compliance > 65,
    text: "Your vocational programmes have been shortlisted for a national TVET excellence award.",
    choices: [
      { label: "Fund the submission (RM 40,000)",
        detail: "Good odds of a big reputation win.",
        apply: (S) => {
          if (Math.random() < 0.7) { S.cash -= 40000; S.rep += 10; S.flags.leadSurge = 2;
            return "Award won. National coverage and a wave of enquiries."; }
          S.cash -= 40000; S.rep += 2;
          return "Highly commended — not the win, but respectable."; } },
      { label: "Withdraw quietly",
        detail: "Save the money and the effort.",
        apply: () => "Withdrew from consideration." },
    ],
  },
  {
    id: "salary-review",
    title: "Annual Salary Review",
    icon: "💰",
    weight: 10,
    when: (S) => S.tick > 10 && S.morale < 62,
    text: "Staff across all five departments are asking for a cost-of-living adjustment.",
    choices: [
      { label: "Grant it (permanent +8% payroll)",
        detail: "Morale recovers strongly.",
        apply: (S) => { S.payrollMult = round4(S.payrollMult * 1.08); S.morale += 14;
          return "Adjustment approved. Payroll is permanently 8% higher."; } },
      { label: "One-off bonus (RM 80,000)",
        detail: "Temporary relief.",
        apply: (S) => { S.cash -= 80000; S.morale += 7;
          return "One-off bonus paid. It buys time, not loyalty."; } },
      { label: "Reject the request",
        detail: "Morale falls.",
        apply: (S) => { S.morale -= 10;
          return "Request rejected. The staff room is not happy."; } },
    ],
  },
  {
    id: "partner-consolidation",
    title: "Partner Consolidation",
    icon: "🏢",
    weight: 9,
    when: (S) => S.partners >= 8,
    text: "Two of your industry partners have merged and are renegotiating their training contract.",
    choices: [
      { label: "Hold your pricing",
        detail: "Risk losing them, keep margins.",
        apply: (S) => {
          if (Math.random() < 0.5) { S.partners -= 2;
            return "They walked. Two partners off the roster."; }
          return "They blinked. Pricing held at the current rate."; } },
      { label: "Offer a volume discount",
        detail: "Keep them, less revenue per programme.",
        apply: (S) => { S.flags.ctdDiscount = 6; S.partners += 1;
          return "Volume deal signed — lower fees for six months, one extra site added."; } },
    ],
  },
  {
    id: "campus-flood",
    title: "Monsoon Flooding",
    icon: "🌧️",
    weight: 8,
    when: () => true,
    text: "Heavy rain has flooded the ground floor. Labs and the admin block are affected.",
    choices: [
      { label: "Full restoration (RM 130,000)",
        detail: "Everything reopens next week.",
        apply: (S) => { S.cash -= 130000;
          return "Restoration complete. Classes resumed on schedule."; } },
      { label: "Minimum repairs (RM 35,000)",
        detail: "Quality and compliance take a hit.",
        apply: (S) => { S.cash -= 35000; S.quality -= 8; S.compliance -= 10;
          return "Patch-up done. Two labs remain out of service."; } },
    ],
  },
  {
    id: "lecturer-phd",
    title: "Lecturer Doctoral Sponsorship",
    icon: "📚",
    weight: 9,
    when: (S) => S.depts.college.level >= 2,
    text: "Three lecturers have been accepted into part-time doctoral programmes and want sponsorship.",
    choices: [
      { label: "Sponsor all three (RM 110,000)",
        detail: "Quality and morale rise, they stay.",
        apply: (S) => { S.cash -= 110000; S.quality += 7; S.morale += 8; S.compliance += 6;
          return "Sponsorship approved. Qualified-staff ratio improved for accreditation."; } },
      { label: "Sponsor one",
        detail: "Cheaper, smaller effect.",
        apply: (S) => { S.cash -= 40000; S.quality += 2; S.morale += 2;
          return "One sponsorship awarded; the other two are disappointed."; } },
      { label: "Decline all",
        detail: "Save cash, lose goodwill.",
        apply: (S) => { S.morale -= 7;
          return "All three declined. One is already updating their CV."; } },
    ],
  },
  {
    id: "cyber-incident",
    title: "Student Records Breach Attempt",
    icon: "🔐",
    weight: 8,
    when: (S) => S.tick > 12,
    text: "The IT team detected an intrusion attempt against the student records system.",
    choices: [
      { label: "Full security overhaul (RM 95,000)",
        detail: "Closes the hole, satisfies the regulator.",
        apply: (S) => { S.cash -= 95000; S.compliance += 8;
          return "Systems hardened and audited. Regulator notified proactively."; } },
      { label: "Patch and monitor (RM 20,000)",
        detail: "Cheap, some risk remains.",
        apply: (S) => { S.cash -= 20000;
          if (Math.random() < 0.35) { S.rep -= 7; S.compliance -= 8;
            return "A second intrusion succeeded. Data incident reported in the press."; }
          return "Patched. No further attempts detected."; } },
    ],
  },
  {
    id: "employer-survey",
    title: "Employer Satisfaction Survey",
    icon: "📊",
    weight: 10,
    when: (S) => S.alumni > 60,
    text: "The annual employer survey on your graduates has been published.",
    auto: true,
    apply: (S) => {
      const emp = S.employability;
      if (emp > 70) { S.rep += 6;
        return `Employers rated your graduates highly (employability ${Math.round(emp)}). Reputation up.`; }
      if (emp > 45) { S.rep += 1;
        return `Employer feedback was mixed but fair (employability ${Math.round(emp)}).`; }
      S.rep -= 6;
      return `Employers flagged weak practical readiness (employability ${Math.round(emp)}). Reputation down.`;
    },
  },
  {
    id: "utility-hike",
    title: "Utility Tariff Revision",
    icon: "⚡",
    weight: 8,
    when: (S) => S.tick > 6,
    auto: true,
    text: "National tariffs have been revised upward.",
    apply: (S) => { S.overheadMult = round4(S.overheadMult * 1.06);
      return "Campus overheads are permanently 6% higher."; },
  },
  {
    id: "open-source-donation",
    title: "Equipment Donation",
    icon: "🎁",
    weight: 7,
    when: (S) => S.partners >= 4,
    auto: true,
    text: "An industry partner is retiring a production line.",
    apply: (S) => { S.vocQuality = clamp(S.vocQuality + 8, 0, 100); S.rep += 2;
      return "A partner donated working inspection equipment to the vocational workshop."; },
  },
];
