# 0206 The IdeaCAD scope document, and the four decisions that lived where the status tool could not see them

- Issued: 2026-09-13
- By: router chat
- Owns: `docs/IDEACAD.md` (new, NOT DELIVERED -- see Outcome),
  `docs/decisions/entries/27-*` through `30-*` (new),
  `docs/prompt-ledger/entries/0206-*`, and its own `docs/history/` entry.
  **NO FILE UNDER `src/`, and none was touched.** Ledgers 0204, 0205, 0207 and
  0208 ran alongside and none of their files was opened. Ledger 0196 was read
  from its pushed branch (`claude/gracious-hopper-a46lec`) and not edited.
- Migration permitted: no. **Claims: none.** Highest on `origin/integration` at
  branch time: **0211**, delivered by ledger 0203 and permitted by this prompt.
  `origin/main` carried through 0208. Nothing above 0211 exists, so the range
  check is non-empty in exactly the way the prompt allows and there is no stop.
- Status: pushed
- Branch: `claude/blissful-ptolemy-8c1toe`, branched from `origin/integration`
  at `78516fa2`.
- Notes: Four questions about IdeaCAD were ANSWERED by Mr. Pina on 2026-09-13
  and had never been filed, because they lived only in a chat document
  `tools/idea-status.py` cannot read. This bundle files them as decisions 27
  through 30, each recorded as ANSWERED with his reasoning preserved, each
  stating what the shipped schema already supports and what is left to build.
  None of the four is built. No SQL, no source, no test.

  **THE MECHANICAL DETAIL THAT IS ACTUALLY THE POINT.** The first draft of all
  four entries carried no `Build:` field, and that draft would have reproduced
  the exact failure that kept them in a chat for a month.
  `unbuilt_decisions()` is keyed on `Build:` **alone** and never on `Status:`,
  and the parser's own comment says why: an answered entry reads
  `Status: decided`, so a `Status == open` filter cannot see it, "which is how a
  decision Mr. Pina had already answered stayed invisible to every lane's status
  read". An entry written `Status: ANSWERED` with no `Build:` line parses with
  `build == ""` and lands in **no list the tool prints** -- committed, correct,
  and invisible. Caught by reading the parser before writing the entries;
  verified after, in both directions, over the working tree: absent from every
  list without the field, all four in `unbuilt_decisions` with it. Also fixed:
  `first_word` takes `split()[0]`, so a `Status:` opening `**ANSWERED` parses as
  `'**answered'` -- the bold was moved off the first word and re-balanced.

  **WHAT EACH DECISION RESTS ON WAS MEASURED, NOT TAKEN FROM THE PROMPT.** 27:
  `0209` line 184 declares `actor text not null`, line 551 projects it, and no
  write path takes an actor parameter -- but the function is `returns jsonb`,
  not `returns table`, which is a correction anyone wiring a client needs. 28:
  nothing prunes (0209 lines 40-42, deliberately), and the cost is **220.5 bytes
  per action** against a 400-byte budget, which is the measured figure replacing
  the 200-or-400 the scope document guessed. 29 and 30 are the two with real
  gaps, below.

  **LEDGER 0196 IS BUILDING DECISION 27'S TIMELINE AND WAS NEVER TOLD THE
  DECISION EXISTED.** Read off its pushed branch without editing it:
  `HistoryTimeline.svelte` line 178 renders `entry.actor`. It agrees with the
  answer **by luck rather than by instruction** -- had it hidden the actor as
  somebody else's business, nothing would have caught it, because there was no
  decision to check against. Decision 27 is now that check, and records two of
  0196's assumptions as load-bearing rather than incidental.

  **DECISION 29'S MEASUREMENT FOUND A LIVE SILENT-LOSS GAP.**
  `classroom_remove_enrollment` (0138) is a hard delete whose refusal counts
  four kinds of work and **not IdeaCAD** -- 0138 predates 0201 by sixty-three
  migrations and nothing widened the census. `ideacad_roster` (`0201` line 34)
  drives off the enrollment with the document on the LEFT side of a left join.
  So a student whose only work is a finished IdeaCAD part can be removed
  outright, the refusal will not fire, and the document survives with nothing
  able to list it -- which is exactly the loss his stated reason rules out.
  **Reported, not fixed**: that function is not this bundle's file. The entry
  names widening its census as the smallest useful first move, ahead of the
  archive state itself.

  **DECISION 30 HAS ONE CONSTRAINT THAT BLOCKS ITS OBVIOUS IMPLEMENTATION.**
  Ownership-by-creator and checkout are already true; a manager role, granular
  permissions and transfer are not, and transfer collides with
  `unique(item_id, student_email)` -- a transfer to a classmate who has opened
  the same assignment is a unique violation, which on a team assembly is the
  normal case. Also flagged: `manager` already means the teacher of record in
  this subsystem, so a student manager must not be given that word; and
  "different information" per member collides with decisions 27 and 28 and is
  recorded as his to resolve rather than guessed.

  **THE SUITE IS RED ON `integration` AND IT IS NOT THIS BUNDLE'S.**
  `tests/db/migrations-applied-record.test.ts` fails because
  `docs/migrations-applied/` has records through 0210 and none for **0211**,
  which landed with ledger 0203. Not fixed here, and that is a rule rather than
  a preference: that directory's README says a record comes either from a
  transaction the apply tool watched commit or from the report of the person who
  pasted the migration by hand. No cloud session can reach production, so
  writing it here would assert an apply nobody in this session observed, into
  the one directory whose premise is that nothing in it is a plan.
  **`npm test` exited 0 while failing** -- the `tools/run-tests.mjs` trap ledger
  0199 measured -- so every count here was read off the summary line.

  **TWO STRAYS RECORDED, AND ONE OF THEM IS ALREADY CLOSED.** Commit `c44fb0e9`
  does carry GitHub's default subject "Update fmt.Println message from 'Hello'
  to 'Goodbye'" while adding 837 lines of `docs/prompts/0145-ideacad.md`, and it
  is contained in both `main` and `integration`; commit subjects render on `/`,
  so it is live. But
  `tools/browser-verify/routes/presence-presence-off.mjs` **already has the
  wait** -- `cdbabb08` (2026-09-12) added a `prepare` predicate waiting for five
  `.roster-row` elements, and the original `3423f677` genuinely had none. The
  prompt's description of that one is a day stale and it is recorded as closed,
  because writing down a live defect that is not live costs the next reader an
  afternoon.

  Verified: full suite (**8672 passed, 1 failed**, the pre-existing failure
  above), `svelte-check` at the baseline -- **0 errors, 37 warnings in 20
  files**, breakdown **31/5/1** -- re-derived with the two `PUBLIC_SUPABASE_*`
  placeholders exported BEFORE `svelte-kit sync`, `npm run history:verify`
  lossless, `node tools/claude-md-check.mjs` clean, and the decision parser run
  over the working tree in both directions. NOT verified: anything against
  production. `tools/deploy-probe.mjs` prints "DEPLOY_PROBE_URL is not set, so
  production's applied set cannot be read. This is 'cannot confirm', never
  'applied'." **So no production version string is reported**, because none can
  be read and CANNOT SAY is never a pass. No browser pass, as instructed.

## Outcome

**Landed on `claude/blissful-ptolemy-8c1toe`. NOT merged to `main`** -- the
deploy probe cannot confirm production's applied set, which is the standing gate,
and the suite is red on the branch point for a reason this bundle may not fix.

**`docs/IDEACAD.md` WAS NOT WRITTEN, AND IT IS THE ONE THING THIS BUNDLE OWED
AND DID NOT DELIVER.** `IDEACAD_SCOPE.md` was to be uploaded and never reached
the container -- `find / -iname 'IDEACAD_SCOPE*'` returns nothing and the
scratchpad is empty. It carries Mr. Pina's own words on decision 24, including
"extremely easy and intuitive" and the note that concurrent editing of one part
is explicitly NOT wanted for IDEA-Blade, and those exist in no other place
reachable from this repository. **Writing the file anyway would have meant
inventing the quotations the prompt exists to preserve.**

Everything the landing needs has been done: every status line the document gets
wrong was measured against the tree and is recorded in this bundle's
`docs/history/` entry and in the four decision entries -- autosave, edit
history, undo/redo, PropertyManager, concept-card render, sharing, assemblies,
checkout, local mirror, materials-as-data, thickness-as-a-pick, decision 13's
closure, decision 25 as built, and the 220.5-byte figure. So landing it is now a
merge of known text with known corrections rather than a fresh investigation,
and it wants only the file.
