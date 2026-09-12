# 0178 IdeaCAD: wire the store through ItemDetail, and remove the prediction gate

- Issued: 2026-09-12
- By: router chat (IdeaCAD lane, after 0170's store and 0171's managers)
- Owns: the IdeaCAD region of `src/lib/classroom/ItemDetail.svelte`, the IdeaCAD region of
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte`,
  `src/lib/ideacad/BladeEditor.svelte`, `src/lib/ideacad/mount.ts`,
  `tests/dom/ideacad-mount*`, `tools/browser-verify/routes/ideacad*.mjs` and its measured
  store entries, `docs/decisions/entries/26-*`,
  `docs/prompt-ledger/entries/0178-*`, and its own `docs/history/` entry. NO MIGRATION.
- Migration permitted: no. Claims: none. Highest landed at issue: 0203; next free 0204,
  claimed by ledger 0177 and not touched here.
- Status: pushed
- Branch: `claude/wizardly-dirac-i1ix59`, branched from `origin/integration` at `8241494f`
- Runs in parallel with: ledgers 0175 (`claude/serene-noether-d9iapn`) and 0177
  (`claude/busy-newton-trto6y`), both Foundry, both `issued` at branch time. Neither
  surface is touched here.
- Notes: TWO HALVES. **(1) THE EDITOR WRITES NOWHERE IN PRODUCTION.**
  `+page.svelte` line 43 calls `createIdeacadTransports(data.supabase)` and never passes
  the result anywhere; the only route to `BladeEditor` is `ItemDetail.svelte`, which
  ledger 0171 did not own, so everything 0167/0170/0171 built is mounted and unwired.
  Pass the transports through, build the store with `createIdeacadStore`, hand it to the
  editor, and prove a round trip end to end through the 750ms autosave in `store.ts`.
  Do not reimplement the debounce, the serialized writes or the terminal `conflict`
  state, and do not add a second throttle.

  **(2) THE PREDICTION GATE COMES OUT, ON MR. PINA'S DECISION OF 2026-09-12.** Physics
  is always visible: inertia and radius of gyration render from the first frame beside
  the rules, nothing hidden and no prediction required. His reasoning: IDEA100 is a
  rotation class, there is no time to teach the mathematics behind rotational inertia,
  and visible numbers help students build maximally competitive designs. **This reverses
  work from two bundles and that is decided rather than lost**: 0160 fixed a
  one-keystroke leak in the gate and 0171 fixed it opening on the press rather than on
  the write and a recorded prediction not unlocking. Both were correct against their
  prompts; the prompts predated his answer.

  **THE PREDICTION ITSELF STAYS.** `ideacad_set_prediction` is applied, the stored
  rationale stays, and students still say which concept they think spins longest and
  why. What goes is the LOCK on the numbers.

  Decision 26 closes with his answer, and its recorded defect is CORRECTED: the Rules
  rail dropping the fifth rule (`engagement`) is deliberate, not a bug -- he is not
  enforcing engagement this rotation.

## Outcome

**DUPLICATE CHECK, THREE WAYS, ALL CLEAR.** (1) `git log --oneline
origin/main..origin/integration` at branch time: FIVE subjects, all ledger 0174
(the coin ledger test RLS policy) and its merge -- nothing IdeaCAD in flight
between the two refs. (2) A `git ls-tree` sweep of all 53 remote refs for any
`docs/prompt-ledger/entries/017[78]*` file: **none exists anywhere**, on `main`,
on `integration`, or on any `claude/**` or `codex/**` branch; a live GitHub
contents listing of `entries?ref=main` returned 161 entries with `0176` the
highest. (3) The SUBSTANTIVE check, which is the one that would have caught this
work under another number: every remote ref's copy of `ItemDetail.svelte` and of
the item route page was grepped for the wiring. `ItemDetail` mentions `ideacad`
nine times on EVERY ref and the blob is byte-identical
(`d59872bf2ff6a6254293513c37a54b8f497db460`) on all of them, and
`createIdeacadStore` appears in the route page on none. Nobody had wired it.
`tools/idea-status.py` reports 157 prompts in flight with exactly two `issued`,
ledgers 0175 and 0177, both Foundry, neither surface touched here.
`node tools/migration-claims.mjs`: highest landed 0203, next free 0204, claimed
by 0177; this entry claims none.

**THE ONE COLLISION WORTH NAMING, AND IT IS A SUCCESSION RATHER THAN A CONFLICT.**
Ledger 0171 (`claude/pensive-turing-inj1ih`) is `Status: pushed`, its CI is GREEN
on `cdfd026d`, and it was still STANDING -- not swept into `origin/integration` --
when this branch was cut. Its surface IS this bundle's surface: 899 changed lines
in `BladeEditor.svelte` plus `src/lib/ideacad/ui/**` and the IdeaCAD browser
specs. Editing `integration`'s pre-0171 editor would have put every change here
on a file about to be replaced wholesale. So this branch is `origin/integration`
at `8241494f` with `origin/claude/pensive-turing-inj1ih` merged into it
(`6b67f4c9`, **clean, no conflict in any file**), and the work sits on top. A
reader of this branch's diff against `integration` sees 0171's bundle as well.

**THE THREE FETCHES AND THE IDENTITY CHECK.** The clone WAS shallow
(`is-shallow-repository` true) and `git fetch --unshallow origin` took it to 2220
commits; `git fetch origin integration` created the ref at `8241494f`; the
identity was already set (`Claude` / `noreply@anthropic.com`), so nothing had to
be configured.

**PART ONE.** The store is wired. `createIdeacadStore` per page, opened per item
for a student only (the gate is `!canManage`, which is the branch the load itself
takes), projected by `ideacadEditorSeed` and handed to `BladeEditor` as `writes`.
Every write the editor has UI for goes through the store, and the local list
changes only AFTER the server agrees. The 750ms debounce, the serialized writes
and the terminal `conflict` state stay in `store.ts`; no second throttle was
added. The round trip is proved end to end in `tests/dom/ideacad-mount.test.ts`
against the REAL store: edit, assert nothing is written yet, the real 750ms, the
RPC, then a SECOND store over the same backend reading the edit back.
`ideacad_open_document` is now called twice per page load and that cost is named
rather than hidden -- the fix is a `seed()` on `store.ts`, which is ledger 0170's
file.

**PART TWO.** The prediction gate is removed and the prediction is kept. What was
deleted from four files is listed by name in
`docs/history/wizardly-dirac-i1ix59.md`; **not one assertion was simply deleted**
-- 0160's own nine-step keystroke experiment survives in the same order with its
answers inverted, and gains a negative control proving the prediction is still
collected. Decision 26 is CLOSED with his answer and his reasoning, and its
recorded `slice(0, 4)` defect is WITHDRAWN as deliberate: engagement is not being
enforced this rotation.

**RASTERIZED AND LOOKED AT, WHICH FOUND THE ONE REAL DEFECT.** The two physics
rows took the readouts rail's content to 555px inside a 515px box at 1440 -- 40px
of overflow, the last row under a fold this container's Chromium draws no
scrollbar for. `.metric` padding 0.7rem to 0.45rem (0.5rem cleared it to exactly
zero, which is not a margin); measured after, **0px overflow at both widths,
31.6px spare at 1440 and 16.0px at 375**. The 375 compare sheet scrolls 501px and
already did -- ~336px of that predates this change -- and the last column and
Close are both reachable, measured directly; reported, not fixed.

**MEASURED.** Full suite **409 files, 7917 tests, 0 failures**, 477.39s.
`svelte-check` **0 errors, 37 warnings in 20 files** (31/5/1). One
`verify:readme -- --route ideacad`: 12 route/width runs, 294 measurements, **0
outside threshold**, store at 199 specs / 398 runs / 7028 measurements / 0
outside. `node tools/claude-md-check.mjs` and `npm run history:verify` both
clean. The `classroom-updates.json` entry is written and committed.

**REPORTED, NOT FIXED.** `CLAUDE.md`'s `svelte-check` baseline says 40 warnings
in 22 files at 34/5/1; `origin/integration` at `8241494f` measures **38 in 21 at
32/5/1**, the fifth lane to measure that. This bundle takes it to 37 in 20, and
the delta is explicable: `+page.svelte` carried two stacked
`// svelte-ignore state_referenced_locally` above `createEngineTransports` and
none above `createIdeacadTransports`, so the latter was warning; it has its own
now and the duplicate is gone. `CLAUDE.md` is outside this bundle's surface.

**PRODUCTION REACHABILITY**, checked before the merge decision:
`https://ideabosco.com/` **200** in 0.75s, `https://apps.ideabosco.com/` **200**
in 0.52s. `IDEA_MIGRATION_URL`, `DEPLOY_PROBE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` are all UNSET and the local `.env` is the placeholder
`example-ref`, so the production database is unreachable from this container and
the applied set is CANNOT SAY. This bundle carries NO migration, so ledger 0114's
gate 4 substitution applies with the range carrying none.
