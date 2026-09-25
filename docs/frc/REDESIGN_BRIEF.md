# FRC training: a redesign brief

For Mr. Pina, about ten minutes. Written overnight on 2026-09-25 (ledger 0298, Tier F) from
report R35 ("the FRC training platform totally sucks ... decide how it should work").
**Nothing on `/frc` changed tonight.** This is a proposal and four questions. A build session
follows your answers.

## The short version

- Today `/frc` is 15 short reading pages with recall quizzes. Five of its seven sections are
  empty. The only hands-on step ("Apply") is a paragraph that unlocks after the quiz and
  collects nothing.
- **Recommendation: make it a list of skills.** Each skill says "you can now ..." and ends in
  exactly one proof: a GAUNTLET clear, a part or drawing handed in and graded in the classroom,
  a notebook build log, or a bench task a reviewer watched. A quiz is never the finish line.
- Everything those four proofs need already exists on the site. **The first build needs no
  database change.**
- Four questions for you are in section 4, each with a recommended answer. If you agree with
  all four, "go with the defaults" is a complete reply.

## 1. What `/frc` is today (checked in the code tonight)

- **Pages.** Home, seven sections, a page per unit, a link shelf (`/frc/references`) and a
  reviewer console (`/frc/review`). Anyone signed in can open it.
- **Content.** Foundation F1 to F5 and CAD MDM-1 to MDM-10 are written: 15 units. MDM-11 to
  MDM-16 are titles only. Mechanisms, Programming, Strategy, Drive Team and Capstone are empty.
- **A unit** is four steps: Brief (reading plus a diagram), Drill (practice, not saved), Gate,
  Apply (a paragraph).
- **Gates.** Ten units end in a server-graded quiz: 90 percent on a draw of 6 to 10 questions,
  which on most units means every question right, with a wait of 1 minute, 5 minutes,
  15 minutes, then an hour after each fail. The other five (MDM-4 to MDM-8) are labelled
  "GAUNTLET" on screen but actually ask for a Google Drive link to a SolidWorks file, which a
  person approves.
- **Progress.** One saved row per finished unit. Only a quiz pass or a reviewer's approve
  writes it. The rank (Rookie, Technician, Builder, Engineer) counts CAD units only;
  Foundation earns nothing.
- **Review.** Reviewers are a list you add by hand (mentors and student leads, school accounts
  only). They use `/frc/review`. The admin dashboard carries a second copy of the same queue.

**Why it teaches nothing practical, in one line:** a student can reach "complete" on 10 of the
15 units without making or doing anything, and the one hands-on step is locked behind the quiz
and has nowhere to go.

One correction to last night's triage: it said the quiz "can be passed by picking the longest
option". The longest option is the right one 56 percent of the time, which is a real flaw, but
passing a single attempt that way happens less than 1 percent of the time and costs days of
waiting (`docs/frc/quiz-bank-bias-report.md`). The quiz is not too easy. It is the wrong kind
of test.

## 2. What to keep and what to drop

### Keep

| What | Where | Why |
|---|---|---|
| The progress table and its locked write path | `supabase/migrations/0039_frc_user_progress.sql`, `0041_frc_progress_lockdown.sql`, `src/lib/frc/progression.ts` | Nobody can mark their own work done by writing to it |
| The reviewer list and console | `0167_frc_reviewer_tier.sql`, `src/lib/server/frc-review.ts`, `src/routes/frc/review/` | Becomes the bench sign-off desk |
| The "ready, please check" request | `frc_gate_submissions` (`0042`), `src/lib/frc/gate-submissions.ts`, `FrcReviewConsole.svelte` | A student can already ask for a check with a note, and a reviewer can approve or send it back with feedback. Keep the flow, drop the Drive link |
| The quiz engine | `src/lib/server/frc/quiz-engine.ts`, `quiz-service.ts`, `src/routes/frc/[domain]/[unit]/quiz/+server.ts` | Never sends answers to the browser. Right for a short safety check before a bench sign-off, nothing more |
| The written material | `mdm-content-seed.md`, `foundation-content-seed.md`, `src/lib/frc/assets/diagrams/` | Good reading for skill pages |
| The link shelf | `FRC_REFERENCES` in `src/lib/frc/track.ts`, `/frc/references` | Links out rather than rewriting reference material |
| The FRC look | `src/lib/frc/frc-theme.css`, `FrcShell.svelte`, the logos | FIRST brand rules. Stays its own room; Space White stays out |
| The practice drills | `mdm-drill-banks.json`, `FrcInteractiveDrill.svelte` | Fine as optional practice on a skill page |
| The test harness | `src/routes/dev/frc/` | Rebuilt around the new pages |

**Tools elsewhere on the site to build on:**
- **GAUNTLET Speedrun** (`/gauntlet/speedrun`): real, timed, checked SolidWorks modeling.
  Anyone on the GAUNTLET author list can write FRC challenges with no code change.
- **IdeaCAD's FRC checks add-on** (`src/lib/ideacad/solid/addons/frc.ts`): arm holding
  torque and drivetrain free speed, worked out from the student's own model.
- **The classroom**: assignments, rubrics, the grading console, hand-ins of any file type.
- **Notebook check-ins** and the notebook review console.

### Drop

| What | Where | Why |
|---|---|---|
| Five empty sections shown as "in development" | `src/lib/frc/track.ts` lines 110 to 139 | An empty shelf is most of what makes it feel useless. Show a track only once it has skills |
| The Drive-link "model gate" and its "GAUNTLET" label | `FrcModelGate.svelte`, `gateLabel` in `mdm-content.ts`, `src/routes/frc/[domain]/[unit]/+page.server.ts` lines 59 to 61 | The label promises a GAUNTLET run that never happens. Of the modes it names, only Speedrun is open in GAUNTLET; Feature Golf and Reverse Engineer are closed for rework and "modeling" is not a mode at all |
| The rank that counts CAD units only | `track.ts` lines 187 to 229, `FrcRankBadge.svelte` | Rewards reading one section, ignores the rest |
| Quiz as the finish line, with Apply locked behind it | `UnitPage.svelte` around line 254, `FrcPhaseStepper.svelte` | The practical step comes last and collects nothing |
| The second review queue on the admin dashboard | `src/routes/dashboard/+page.server.ts` lines 56 to 59, `+page.svelte` around lines 194 and 388 | `/frc/review` is the one console. Keep the dashboard's per-student progress list until the new team view replaces it |

## 3. The proposed structure: skills, each with one proof

**The rule:** every skill has one "you can now" line, one proof, one person or thing that says
it is done, and one place that record lives. Nothing is graded twice (CLAUDE.md: no second
scoring path for work already graded once).

| Proof | Where the student does it | Who says it is done | Where "done" is recorded | Database change? |
|---|---|---|---|---|
| **GAUNTLET clear** | A Speedrun challenge written for FRC | The run itself | GAUNTLET's own run record; `/frc` reads it | None |
| **Graded hand-in**: an IdeaCAD part with the FRC check, a drawing, a design write-up | An assignment in an FRC class in the classroom | You, in the grading console, against a rubric | The classroom grade; `/frc` reads it | None |
| **Notebook build log** | A notebook check-in on the FRC class | You, or a staff notebook reviewer for that class, in the notebook review console | The notebook review; `/frc` reads it | None |
| **Bench sign-off**: a tool, a crimp, a wiring check, a code deploy | In the shop, in person | A reviewer who watched it | The progress table, when the reviewer approves the request | None (see question 3) |

- **A safety check** is a short quiz placed in front of a bench sign-off ("pass the drill press
  check, then ask a reviewer to watch you"). It never counts as a skill on its own.
- **An IdeaCAD part** is handed in by linking the student's IdeaCAD document to an IdeaCAD
  assignment in the FRC class, which already works. The FRC check's typed numbers (motor speed,
  gear reduction) are not saved in the document today, so the assignment also asks for a
  screenshot of the check. Saving them is a separate IdeaCAD decision.

**What `/frc` becomes:**
- **Skills map.** Tracks down the side; each skill is a card ("You can now size the motor for
  an arm") showing how it is proven and whether you have done it.
- **Skill page.** Today's reading, optional practice, and one button to the proof: open the
  challenge, open the class assignment, open the check-in, or "I'm ready for sign-off".
- **My record.** Every skill done, with its date and proof, plus units finished before the
  redesign, shown as earlier training.
- **Team view (for you).** Who can do what, by track, for planning a build season.
- **Reviewer desk.** `/frc/review`, the sign-off requests.

**The FRC class.** One classroom section for Team 5669, created and enrolled the normal way.
Two details: its course code must not start with "IDEA" (Foundry treats any course whose code
starts with IDEA as the student's IDEA class), and its assignments can carry no points so the
class never turns into a grade. A student not on the team can still read every skill page;
only the hand-in lives in the class.

**Track outline** (the list is yours; this is shape only): Shop and Safety (everyone starts
here), CAD, Mechanical and Fabrication, Electrical, Programming, Strategy and Scouting, Drive
Team, Business and Outreach.

**Example skills, to show the shape only:**

| Track | You can now ... | Proof |
|---|---|---|
| Shop and Safety | use the drill press on aluminum without help | safety check, then bench sign-off |
| CAD | model a gusset plate from a drawing in under a set time | GAUNTLET Speedrun clear |
| Mechanical | size the motor and gearing for an arm | IdeaCAD arm with the FRC torque check, handed in and graded |
| Electrical | crimp a connector that passes a pull test | bench sign-off |
| Everyone | keep a build log a teammate could follow | notebook build log |

**Where today's 15 written units could go** (a suggestion): F3 Safety becomes Shop and Safety
reading plus its check. F5 Engineering Notebook becomes the build-log skill. MDM-4 and MDM-5
become CAD skills proven by Speedrun clears. MDM-8 (shafts, bearings, stackups) becomes a
Mechanical skill proven by an IdeaCAD stackup hand-in. MDM-2 (drawings) and MDM-10
(tolerancing) become a drawing mark-up hand-in. F1, F2, F4, MDM-1, MDM-3, MDM-6, MDM-7 and
MDM-9 become reading on the skill pages they fit, with no gate of their own.

## 4. The four questions

### 1. Where does FRC training live?

**Recommended: here, at `/frc`.** Sign-in, the notebook, classroom grading, GAUNTLET, IdeaCAD
with its FRC check, the progress table and the reviewer list are all in this site. The
standards describe the separate `frc-app` as team management
(`docs/standards/IDEA_context.md` line 105), a React app on its own setup; putting training
there means rebuilding every one of those. `frc-app` can link to `/frc`. (What `frc-app`
contains today was not checked; it cannot be reached from here.)

### 2. What does "practical" mean?

**Recommended: every skill ends in one of the four proofs above. A quiz is allowed only as a
safety check in front of a bench sign-off.** It is the only definition a reviewer can check by
looking at something, and it uses what the site already does well instead of building a
second, weaker version of it.

### 3. Who signs off a skill?

**Recommended: one signer per kind of proof.** The run itself for GAUNTLET. You for graded
hand-ins and build logs (the classroom lets only a class's teacher or an admin grade, and a
staff mentor can be given that one class's notebooks through the existing notebook reviewer
list). Reviewers from your list for bench skills. **For now, adults only on bench sign-offs**
(you and mentors); student leads join after one small database change.

Why the caveat: two things are true of the reviewer list today. A reviewer can mark their own
units complete (the "Reviewer tools · your account" panel on each section page exists to
preview progress, and approving your own request works too). And a completion does not record
who signed it. That is fine for adults and not for a student lead certifying a friend or
themself. The fix is small: record the signer and refuse signing your own. If you want leads
signing now, the other answer is to allow it, accept that it cannot be audited, and spot-check.

### 4. What is the unit list?

**Recommended: you write it** as "you can now ..." lines grouped by track, with a proof for
each. Start with 8 to 12 skills across **Shop and Safety** and **CAD and Mechanical**, because
that is where the checking tools and the written material already exist. Add a track when it
has skills, never as an empty shelf. A table like this is enough:

| Track | You can now ... | Proof | Who signs | Reading from today's units |
|---|---|---|---|---|
| | | | | |

### Smaller questions that take the default unless you say otherwise

- **Content source:** link out to WPILib, vendor docs and the game manual; write only what is
  specific to our shop, our tools and our robot.
- **Season:** offseason onboarding first. The team view doubles as a build-season "who can do
  what" board.
- **Today's quiz banks:** keep the engine; stop letting a quiz alone complete anything.
- **Look:** FRC keeps its navy and red room. (Making the report box match the room is a
  separate fix in tonight's round.)
- **Credit for old units:** shown as earlier training, never converted into a new skill
  automatically, because the new skills ask for proof the old quiz never did. A reviewer can
  sign off quickly for a student who already has the skill.

## 5. The first build, once you answer

One session, one lane, owning `src/routes/frc/`, `src/lib/frc/`, `src/lib/server/frc/`, the
seed files, `docs/frc/` and `tests/frc-*`.

1. **A skills registry in code**, replacing the sections and units: each skill has an id, a
   track, a "you can now" line, its one proof and its signer, and points at today's prose for
   its reading. The proof is named by the id of a row you create once with the normal tools (a
   GAUNTLET challenge, a class assignment, a notebook check-in); a later bundle may move that
   link into data.
2. **The new pages:** skills map, skill page, my record, the team view (admins only at first),
   and `/frc/review` as the sign-off desk with the Drive link made optional.
3. **"Done" is read, not copied.** A GAUNTLET clear, a classroom grade at or above the skill's
   bar, or an accepted build log is read from where it already lives. Only bench sign-offs and
   safety checks write the progress table. Nothing is written twice.
4. **Retire** the Drive-link gate (pending requests stay reviewable until the queue is empty),
   the CAD-only rank, the four-step unit stepper and the dashboard's duplicate queue.

**What must stay resolvable, so nobody's finished work goes missing:**
- **Unit ids.** Every id a stored row can hold: F1 to F5 and MDM-1 to MDM-10 (the only ones any
  control could write), plus MDM-11 to MDM-16 as a precaution, since the approve function takes
  any text. They live in `frc_user_progress`, `frc_quiz_attempts` and `frc_gate_submissions`.
  They stay in the registry with their titles, flagged retired, and no new skill reuses one of
  those strings. No row is deleted or rewritten. This is the same rule as the classroom
  section list: a registry whose ids sit in real rows only ever grows.
- **Addresses.** `/frc/foundation/1` to `/5` and `/frc/cad-mechanical/1` to `/10` keep
  answering, with a 307 to the skill page that now holds that reading. `/frc`,
  `/frc/references` and `/frc/review` keep their addresses.

**Database: none for this bundle.** Every piece above uses tables, functions and permissions
already applied (0039 to 0042, 0167, and the classroom, notebook, GAUNTLET and IdeaCAD ones).
Later, each as its own reviewed migration in the house grant shape, and each additive so the
deployed site never breaks while it applies:
- **Record the signer and refuse self sign-off** on a bench skill, and make un-signing a
  recorded reversal instead of a delete. Same function names and inputs as today. Needed
  before student leads sign off.
- **A team view for non-admin reviewers** that shows names beside progress and the classroom
  and notebook proofs. This one is a disclosure decision for you (student leads would see
  classmates' progress).
- **Evidence photos on a sign-off request,** only if a notebook link is not enough.
- **Moving the sign-off request behind a server function.** Students write that table
  directly today under row rules, which predates the house rule that every write goes through
  one.

**Tests the build must update:** `tests/frc-quiz-bank-bias.test.ts` pins exactly 10 banks and
140 questions, so a new safety bank changes it on purpose. `tests/theme-tokens.test.ts` keeps
`/frc` out of Space White and should stay green untouched. The `/dev/frc` harness mounts the
new skill page and gets a browser check at 375 and 1440 pixels.

## 6. Small follow-ups found tonight (not fixed; those files belong to the build lane)

- `src/lib/frc/foundation-content.ts` lines 10 to 12 say "Currently just F1"; F1 to F5 are all
  written.
- `src/lib/frc/mdm-content.ts` lines 51 to 53 say MDM-2 to MDM-10 have no answer text; all ten
  do.
- `src/lib/frc/drill-banks.ts` lines 2 to 3 name F1 as the only Foundation drill bank; F1 to F5
  all have one.
- `src/routes/frc/[domain]/[unit]/+page.server.ts` line 25 names F1 as the only Foundation quiz
  bank; F1 to F5 all have one.
- `docs/history/record-frc-training-track.md` says "sixteen units" of CAD content; ten are
  written. History entries are written once, so the next FRC history entry states the
  correction.

## 7. What was not checked, and one optional query

Not checked: how many students have FRC progress in production, whether 0167 is applied and
who is on the reviewer list, what `frc-app` contains, whether an IdeaCAD assignment shows the
ordinary file hand-in beside the document link, and git history before 2026-09-14 (this copy
of the repository is shallow).

If you want the first of those before answering, this is read-only and safe to paste into the
Supabase SQL editor:

```sql
select unit_id, count(*) as students from public.frc_user_progress group by unit_id order by unit_id;
select status, count(*) as requests from public.frc_gate_submissions group by status;
select count(*) as reviewers from public.frc_reviewers;
```

If the last line says the table does not exist, 0167 is not applied.

---

## For the build session: triage claims checked against the tree

Every claim in `docs/feedback/2026-09-25/TRIAGE.md`'s two R35 FRC sections was checked
tonight. These were wrong or incomplete:

- **"Today's quiz auto-gate can be passed by picking the longest option"** (`QUEUE.md`
  session 5, question 2). Overstated. The tell is real (56.4 percent against 25 percent at
  chance), but one attempt passes that way 0.0 to 0.9 percent of the time, F1 and F3 never
  pass, and the expected wait is 98 to 141 hours of cooldown (the report's own tables).
- **"The seed's gauntlet:\* tokens were meant to point there and never did."** True and
  incomplete. `speedrun` is the only live GAUNTLET mode (`src/lib/gauntlet.ts`, `MODES`);
  `feature_golf` and `reverse_engineer` have status `construction`, which that file defines as
  "shown but not enterable", and `modeling` (MDM-7 and MDM-8) is a mode FAMILY, not a mode. The
  unit page still labels those units "GAUNTLET · ..." through `gateLabel`.
- **"5 recall drill questions with answers"** per unit. True of nine CAD units; MDM-8 has six,
  and every Foundation unit's written drill is a single placeholder line ("Practice from the
  drill activities for this unit") because Foundation relies on the interactive banks.
- **Three stale statements.** There are five: the triage's three, plus `drill-banks.ts`
  lines 2 to 3 and `[unit]/+page.server.ts` line 25, which both still describe F1 as the only
  Foundation bank.
- **"The IdeaCAD FRC add-on's check filled in"** as an artifact. The add-on advises and stores
  nothing: `AnalysisPanel.svelte` keeps the typed motor speed and reduction in component state
  (`drive`, around line 98), so a filled-in check does not survive a reload and cannot be
  reviewed from the document alone.
- **"The existing frc_reviewers allowlist (student leads and mentors) signs off"** (the triage's
  question 5 default). Missing two facts: a reviewer can approve their own request and mark
  their own units (`frc gate update teacher` in `0042`, re-gated in `0167`, has no own-row
  exclusion, and `frc_mark_complete` accepts the caller's own id), and `frc_user_progress` has
  no signer column.
- **Worth knowing, not wrong:** the notebook section reviewer list (`0169`) admits
  `@boscotech.edu` only, while the FRC reviewer list (`0167`) admits `@boscotech.net` too, so a
  student lead can be an FRC reviewer but never a notebook reviewer; and a classroom section is
  managed by its one `teacher_email` or an admin (`_classroom_manages_section_email`), so a
  student lead cannot grade a classroom hand-in.
- **"Last content commit ... 2026-09-14"** could not be confirmed: the clone is shallow and its
  boundary is exactly that date.

Confirmed as the triage states: the routes and the hooks guard (`src/hooks.server.ts` line
118); seven domains with five empty (`track.ts` lines 114, 120, 126, 132, 138); 5 Foundation
and 16 CAD titles with 10 CAD units authored; the quiz banks (32 items for MDM-1; 10 to 14 each
for F1 to F5, MDM-2, 3, 9 and 10) at `passPercent` 90 with cooldowns 60, 300, 900 and 3600
seconds (`track.ts` line 242); the prefix-only model-gate check; the Drive-link form; client
writes to `frc_user_progress` revoked by `0041`, with `frc_quiz_grade`, `frc_mark_complete` and
`frc_unmark_complete` as the only writers; the CAD-only rank; the `0167` reviewer tier and its
404 console; and the dashboard's duplicate queue and progress list.
