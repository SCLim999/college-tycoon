# College Tycoon

A browser-based management simulation. You run a private college with five
departments for five years, and the board scores what you built.

Open `college-tycoon/index.html` in any browser — no build step, no server,
no dependencies. Progress saves to `localStorage`.

## The five departments

| Department | What it does | What it costs you |
|---|---|---|
| **College** 🎓 | Diploma and degree tuition — the recurring income base | Lecturers, seats, accreditation upkeep |
| **Vocational Education** 🛠️ | TVET certification and short courses; drives graduate employability | Instructors, workshops, consumables |
| **Corporate Training** 🏭 | High-margin programmes sold to industry partners | Trainers, and 45% of each fee in delivery cost |
| **Marketing** 📣 | Enquiries and conversion — nothing enrols without it | Campaign budget that scales with funding mode |
| **Education STEM** 🔬 | School outreach: goodwill, brand, and a future applicant pipeline | Facilitators; earns little directly |

## How the simulation works

Each month the engine resolves, in order: teaching quality and morale →
recruitment → attrition and graduation → industry partners → revenue → costs →
compliance → reputation. Then the annual board review (every 12 months) and a
possible random event.

The loops that matter:

- **Enquiries → enrolments → income.** Marketing generates enquiries;
  reputation and quality set the conversion rate; seats cap the intake.
  Advertising past your capacity turns applicants away *and* costs reputation.
- **Ratio → quality → reputation → enquiries.** Growing enrolment without
  hiring drags the student-to-lecturer ratio up, which pulls quality down,
  which pulls reputation down, which shrinks next month's intake.
- **Partners → programmes.** Each industry partner commissions roughly
  0.35 programmes a month, and you can only deliver what your trainers can
  staff. Extra trainers past demand are pure payroll.
- **Compliance decays** every month, faster as the campus grows. Ignore it and
  the regulator escalates.
- **Costs creep** ~4% a year on overheads and ~3% on payroll. Standing still
  loses ground.

Lose by dropping below −RM 300,000 or by letting reputation collapse. Otherwise
the run ends at month 60 with a score and a standing, from *Struggling College*
to *University College*.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page shell, start/event/end/help modals |
| `css/game.css` | Styling |
| `js/util.js` | Formatting and small helpers |
| `js/data.js` | **All tuning lives here** — economy constants, departments, facilities, difficulties, events |
| `js/engine.js` | Simulation: state, derived figures, the monthly tick, scoring, saves |
| `js/ui.js` | Rendering (reads state, writes DOM) |
| `js/main.js` | Bootstrap, input wiring, autoplay |

## Tuning it

Everything balance-related is a named constant in `js/data.js`:

- `CFG` — tuition, fees, per-learner costs, upkeep rate, cost creep, loss thresholds.
- `FUNDING` — the Lean/Normal/Boost/Max cost-vs-output trade.
- `DEPARTMENTS[].facilities[].effects` — a bag of named modifiers the engine
  sums across everything you have built. The full key list is documented in a
  comment above the array; adding a facility means adding an entry, nothing else.
- `DIFFICULTIES` — starting cash, capital cost multiplier, running cost
  multiplier, compliance decay rate.
- `EVENTS` — `when(S)` gates availability, `weight` sets frequency, and each
  choice's `apply(S)` mutates state and returns the news line.

To add a new department you also need a metrics case in `deptMetrics()`
(`js/ui.js`) and a starting entry in `newGame()` (`js/engine.js`).

## Note

Fictional simulation. The department structure is modelled on ViTrox College's;
the finances, events and numbers are invented for gameplay and are not a model
of any real institution.
