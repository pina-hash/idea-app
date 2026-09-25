# Overnight run, ledger 0298: everything queued that can ship without a migration, class-critical first

- Issued: 2026-09-25 about 04:40 UTC (21:40 Thursday, Pacific), by the router chat, for ONE Claude Code session
  (Opus 5.5, ultracode) running unattended overnight. Mr. Pina is asleep and teaches
  Friday 2026-09-25 from about 08:00 Pacific. Nobody will answer a question before morning.
- **This supersedes `ROUND1_PROMPT.md`**, which must not also be pasted. `ROUND1_BRIEF.md` is
  still the specification for items 1 to 20 and is read in full. This brief adds to it,
  re-orders it into tiers, and sets the overnight rules.
- Evidence: `TRIAGE.md`. Decisions: 37 to 40. Every statement about the tree is a claim to verify.

## 1. The overnight rules, which outrank everything below

1. **No migration reaches production tonight.** Automatic apply (`migrate.yml`) is failing on a
   rejected database password that nobody can fix before morning, and nobody will paste SQL.
   So NOTHING goes under `supabase/migrations/`, and no shipped code may call an RPC, column or
   table that does not exist in production today. Work that needs SQL stops at a PROPOSAL:
   SQL under `docs/feedback/2026-09-25/overnight/proposed/NNNN_*.sql`, using the reserved numbers
   0228 (decision 37) and 0229 (decision 38) and written to CLAUDE.md's migration rules, with
   the client half left on the branch, not merged. Its own ledger entry comes later.
2. **Ship in tiers, straight to `main`, each as soon as it is green.** This is the shipping section
   of `ROUND1_PROMPT.md`: merge `origin/main` in; run svelte-check, the touched tests and `npm run
   build`, reading summary lines and stderr; if clean against the baseline, merge `--no-ff` into
   `main` and push; confirm the deploy. Never force-push. A red tier stays on the branch and never
   blocks the next tier's work.
3. **The school day is a merge window, not a stop.** Tiers A and B may merge at any time. From
   **07:30 to 15:30 Pacific on Friday 2026-09-25**, merge only Tier A and B work and fixes to
   anything already shipped. Tiers C, D and E finish on the branch and merge after 15:30 Pacific,
   or they are left for Mr. Pina to merge, which the final report says in one line. Check the
   clock with `TZ=America/Los_Angeles date` before every merge.
4. **If something you shipped breaks what a class uses, revert it on `main` first** (`git revert`,
   never a force-push), then investigate. A class that works without a feature beats one that
   does not work at all.
5. **Decide, record, move on.** Where this brief leaves a choice open, take the default written
   here or in the decision entries, write it in your history entry, and keep going. Do not stop
   to ask anyone.

## 2. Phase 0

Exactly as `ROUND1_BRIEF.md` section 2: baseline file first, then build agents.

## 3. Tiers

### Tier A: needed in class on Friday (ships first, ideally before 07:30 Pacific)

- ROUND1 items **1** (the scroll lock), **2** (the "1 missing" mismatch), **3** (completed HTML
  worksheets read as missing, plus per-block "changed after grading"), and **4** (posted teams).
- ROUND1 item **5**: the Report control always visible and room-colored.
- **NEW, A6: download every student file from an assignment as one zip, named by student.**
  Section 4 is the spec.

### Tier B: the rest of round 1's P1

ROUND1 items **6** (HTML grading export), **7** and **8** (Space White color, the light emblem, the
redrawn marks), **9** (the profile pop-up), **10** (the Foundry sort control) and **11**
(tournament settings).

### Tier C: IdeaCAD, the no-migration half

- **Live sync without a refresh (R34, decision 38's no-migration part).** After each accepted save,
  a PING frame `{documentId, conceptId, revision}` through the existing live channel. The frame
  carries no features and writes nothing ("no frame can write state" stands), with a database poll
  floor every 10 to 15 s and on focus. A clean session pulls the missing ops; a dirty one tells the
  person in words that a newer version exists and offers to load it. This works for everyone who can
  already edit a document through today's grants. The class EDIT grant itself is the 0229 proposal.
- **R05, sketch relations and snapping**: the client-only first bundle in TRIAGE, which uses
  constraint kinds already in the union and changes no stored shape. Snaps add relations
  automatically, with Ctrl held to suppress (TRIAGE's default).
- **R06, open fillet corners**: reproduce in a node test on the real kernel first (TRIAGE's two
  checks). Fix only if the cause is found. A repro test with the cause named is an acceptable result.
- ROUND1 item **19** (right-click submenus open to the side).
- IdeaCAD is owned by nobody else tonight; `docs/ideacad/**` and its tests are in scope for this tier.

### Tier D: the notebook, first bundle, no migration (R32, R33)

The defaults in `QUEUE.md` "Session 4 defaults" are decided; build them:
- a **quick note** docked in the shell header (never a floating pill), for every signed-in person,
  that writes a private draft through the existing notebook transports, filed by route and class;
- an **Inbox** in the notebook of unfiled drafts, newest first, each with a one-press "file to
  <class / check-in>";
- the student's first notebook screen as their own log (a feed plus a one-box composer), with the
  check-in status as a chip;
- three light templates: design decision, test result, build log.

The teacher's review grid is unchanged. Drafts stay invisible to staff (0118). Everything goes
through the existing write paths; if something genuinely needs SQL, it becomes a proposal.

### Tier E: round 1's P2 and P3

ROUND1 items **12** to **18** and **20**, in order.

### Tier F: documents and mockups only (can run in parallel with anything, never merges code)

- **An FRC design brief** at `docs/frc/REDESIGN_BRIEF.md`. It inventories what is worth keeping
  (TRIAGE's R35 notes), proposes a structure where every unit ends in a real artifact, and lists the
  four questions in `QUEUE.md` session 5 with a recommended answer to each. No change to `/frc`.
- **The Space White shape language (decision 40 item 4)** as a `/dev/themes-shape` mockup page:
  before and after for buttons, cards, the header and a chip, including a glass variant, measured
  for contrast and the projector model. It is not applied to any real surface; he approves it first.
- **Proposed SQL** for 0228 (decision 37: the edit-history table and the widened save gate) and 0229
  (decision 38: the live class edit grant, admitted by BOTH IdeaCAD write predicates). Each carries
  its header, apply-time self-checks, the 0166 grant shape, and a `tests/db/` test that runs against
  it from its proposed location. It never goes under `supabase/migrations/`.

## 4. A6: every student file from an assignment, as one zip, named by student

**What he asked:** "a mass export, mass download ... instead of downloading the file from the file
name that the student uploaded, it should download with a new file name generated by the actual
student name and details ... all my assignments from now on are HTML specs ... compatible with a
wide variety of HTMLs." Ported HTML (schema-3) assignments are the primary case. Spec assignments
use the same button for free.

**Why any HTML works:** do not parse documents. Every file a student hands in is already a row
keyed by submission and block, whether it arrived through a document's `idea:image` block, a spec
imageZone or the item-level hand-in (`classroom_submission_files`, 0133, plus legacy Drive rows).
The export walks those ROWS. The manifest is used only to give a block a readable name (its
module title and `field`); a block id the manifest does not know still exports, under its id.

**Where:** the grading console for an item, manager only (the route's existing gate), as a
**Download all files** control beside the existing exports, with a count ("42 files from 27
students") before the press. It honours the console's section filter, and the current selection
when students are selected.

**What is in the zip:**
- One folder per student: `Last, First/`. The names come from the roster read
  (`loadSectionRoster` / `splitRoster`), never from an email address.
- Each file named `Last_First - <assignment title> - <module or field, else block id, else
  "hand-in"> - <n>.<ext>`: ASCII-folded with `downloadFilename`'s rule, the original extension
  kept, and `n` counting within a student and block. Cap the assignment-title part so a name stays
  well under 200 characters.
- **`index.csv`** at the root, one row per file (the "telemetry" he asked for): student name,
  section and period, block id, module, field, the ORIGINAL filename, uploaded at (America/Los_Angeles),
  size, whether it arrived after the due time, the student's standing (complete, submitted, graded),
  and the score if graded. Written with the repo's existing CSV conventions.
- **A student not on the roster** is never invented as a roster row. Their files go in a clearly
  labelled `_not-on-roster/` folder, and the control states the count beside the button. This is
  CLAUDE.md's "drop, but say how many" rule adapted for a teacher's own download, where dropping a
  student's work is worse. Say so in the history entry.
- **A failed file never aborts the zip.** It is listed in `index.csv` with the reason, and the
  control reports "40 of 42 files" in words.

**How:**
- Build the zip in the browser with `$lib/foundry/zip-write.ts`'s `buildZip` (reuse it and never
  write a second zip writer, as `$lib/feedback/archive.ts` already does).
- Fetch bytes through the SAME proxy URL a thumbnail uses. **Verify in a real browser** that the
  redirect to a signed Storage URL is readable by `fetch` (CORS). If it is not, add one server
  route that returns fresh signed URLs for the item's files, re-checking manager access itself,
  and fetch those.
- `buildZip` buffers, so enforce a byte budget: past about 500 MB, split into numbered zips by
  student, and say so before the press. Show progress ("12 of 42"), and hold deploy reloads while it
  runs (`holdDeployReload`, CLAUDE.md's deploy-safety rule).

**Verify:**
- In a `/dev` harness mounting the real console, with seeded rows across two sections, an
  off-roster file, a Drive-legacy row, a block the manifest does not know, and a failing fetch.
- Read the produced zip back and assert every name and CSV row.
- **Both directions:** the control is absent for a non-manager view, present for a manager.
- Add a `classroom-updates.json` line only if students notice something; this one is
  teacher-facing.

## 5. Agent split, constraints, ending

`ROUND1_BRIEF.md` sections 5 and 6 apply, with these additions:
- **One agent owns A6.** It touches `GradingConsole.svelte`, so it coordinates with the
  items 2, 3 and 6 agent. The simplest way is to give A6 to that same agent.
- **Tier C is one agent** in `src/lib/ideacad/**`.
- **Tier D is one agent** in `src/lib/notebook/**`, plus the shell mount, which it coordinates with
  the shell-header agent from item 5.
- **Tier F never shares a file with a code tier.**

**The final report**, which is the first thing Mr. Pina reads in the morning, leads with:
- what is live, and at which commit;
- anything he must know before first period;
- what is waiting on the branch for a merge after 15:30;
- what needs him (the proposals, the FRC questions, the shape mockups).

It is written for a teacher with five minutes, not for a reviewer.
