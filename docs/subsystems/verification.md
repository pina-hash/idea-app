# Verification detail and the visual pass

_Moved word for word from `CLAUDE.md` on 2026-10-19 (ledger 0415). The svelte-check baseline history, the mutation-proof restore trap, and the browser harness rules. The entry point and the table of every subsystem file is [`CLAUDE.md`](../../CLAUDE.md)._

  - **A CHECKOUT WITH NO `.env` REPORTS 14 PHANTOM ERRORS, AND THEY ARE NOT A
    REGRESSION.** `$env/static/public` is generated from the environment, so
    with no `.env` present -- which is every fresh cloud session, since `.env`
    is gitignored -- `svelte-kit sync` writes a module exporting nothing and
    **14** `has no exported member 'PUBLIC_SUPABASE_URL'`/`_ANON_KEY` errors
    land across **11** files that no change touched. **This line said eleven
    across eight until 2026-09-06 and thirteen across ten until 2026-09-11**,
    and prompts 0071 and 0074 each measured 13 independently before either said
    so, which is the same failure as the warning count below and the reason both
    are re-measured rather than read. **THE NUMBER GROWS WITH THE TREE, WHICH IS
    WHY IT KEEPS BEING WRONG**: the eleventh file is
    `src/lib/server/html-assignment-document.ts`, which 0195 added AFTER the
    thirteen was measured, so the figure went stale the moment a new module read
    `$env/static/public` -- prefer the instrument (export the two values, then
    sync, then read the summary line) to the number. **Export the two values
    (any placeholder will do) BEFORE the sync** and the count returns to 0
    errors / 38 warnings with the 32/5/1 breakdown intact, measured. The
    warnings are unaffected either way, which is the tell: a real regression
    moves one of those numbers, this moves only the errors and only in files
    the diff never named. A number written down here is a number that drifts: this
    line said 36 against a tree measuring 37, and two separate sessions found
    the same gap independently before either said so, which is what a figure
    being trusted rather than measured looks like. **It then said 37 against a
    tree measuring 40**, and ledger 0161 and prompt 0163 each measured 40 in 22
    files independently before either said so -- the same shape a third time,
    and the drift is entirely `state_referenced_locally`, 31 to 34. **It then said
    40 in 22 against a tree measuring 38 in 21**, on `origin/integration` at
    `6a71eff4` on 2026-09-12 (ledger 0180) -- a FOURTH time, the drift a fourth
    time entirely `state_referenced_locally`, 34 down to 32, and the first time
    it moved DOWNWARDS. **That direction is the one that matters most**: a figure
    written here too HIGH is a budget a session can spend without noticing, so
    two real new warnings would have read as the baseline holding. Ledger 0176
    measured 38 in 21 at 32/5/1 and two lanes after it measured the same before
    any of them said so; ledger 0177 corrected it, re-deriving in a clean
    `git worktree` at the branch point rather than on its own tree, because a
    baseline measured on the tree under test is not a baseline. **It then said
    38 in 21 against a tree measuring 37 in 20**, on `origin/integration` at
    `b0a8101d` on 2026-09-12 -- a FIFTH time, inside the same day as the fourth,
    the drift a fifth time entirely `state_referenced_locally`, 32 down to 31,
    and downwards again. Ledger 0184 and ledger 0186 each measured that fifth
    drift INDEPENDENTLY and each wrote it into this line, which is why two
    statements of it arrived as a merge conflict in ledger 0188; five
    corrections in three weeks is the argument for the instrument over the
    number: run the command, read the summary line, and treat whatever is
    written here as the previous session's reading. **A session
    that measures a different number CORRECTS THIS LINE in the same change**,
    and says in its history entry which warning moved.
  - **A FRESH `npm ci` CHECKOUT HAS NO `.svelte-kit`, AND `npm test` REPORTS A
    MISLEADING ROLLDOWN/TSCONFIG ERROR FOR IT.** Vitest's dependency
    optimisation step fails on startup with `[RESOLVE_ERROR] Could not resolve
    'node:module' in \0rolldown/runtime.js ... Tsconfig not found` -- which
    reads like a broken toolchain and is actually vite/vitest reaching for a
    generated `tsconfig` that `svelte-kit sync` has not written yet. Run
    `npx svelte-kit sync` once after `npm ci`, same as before `svelte-check`,
    and the same fresh checkout runs clean. This bites in the same first five
    minutes as the missing-`.env` phantom errors above and for the same root
    cause: nothing has generated the `.svelte-kit` output yet.
  - The 33 break down as 29 `state_referenced_locally`, 3
    `css_unused_selector`, 1 `perf_avoid_nested_class`, over 18 files (ledger
    0386 deleted the old contracts view component, which carried two
    `state_referenced_locally`; it said 35, 31, 19 before). The breakdown is
    the diagnostic: it says WHICH kind moved when the total does, and a total that holds while the mix changes is still a finding. Read it
    with `npx svelte-check --output human 2>&1 | grep -o "svelte.dev/e/[a-z_]*"
    | sed 's|.*/||' | sort | uniq -c | sort -rn`.

**`git checkout -- <file>` RESTORES FROM HEAD, NOT FROM WHATEVER A MUTATION
SCRIPT SAVED, AND IT DISCARDS UNCOMMITTED WORK SILENTLY.** Three sessions in one
week ran it inside a mutation script against an uncommitted tree -- to "restore"
the file they had just mutated -- and it discarded every one of their own
uncommitted edits along with the mutation, back to the last commit. The
remaining mutants in the same run then applied against a PRISTINE original with
none of the session's changes in it, and every one of them "passed" -- which
reads as a clean mutation proof and is actually a script silently testing code
that was no longer there. **THE TELL IS A MUTATION SUITE THAT SUDDENLY ALL
PASSES.** **AND THE SECOND WAY TO GET THAT SAME FALSE CLEAN
READING IS TO JUDGE THE RUN BY VITEST'S EXIT CODE.** `tools/run-tests.mjs` says
in its own header that vitest's exit code cannot be trusted here, and a mutation
script is exactly where that costs something: measured on 2026-09-13, a clean
assertion failure in the `node` project left `npx vitest run <file>` exiting 0,
so an `execFileSync` judging by the throw reported two SURVIVING mutants as
killed. A mutation script parses the summary line (`Tests <n> failed`) and
treats a run whose summary it cannot find at all as a FAILURE of the instrument,
never as a pass. **AND THE THIRD WAY IS TO READ ONE STREAM: THE EXIT CODE AND THE
STREAM SPLIT ARE TWO SEPARATE TRAPS, AND FIXING ONE LEAVES THE OTHER.** Measured
on 2026-09-13, an hour after the rule above was followed correctly: a mutation
that made a migration REFUSE TO APPLY left vitest exiting 0 with its entire
failure report -- `Failed Suites`, `failed to apply`, the lot -- on STDERR, while
`execFileSync`'s return value carries only stdout. Two genuinely killed mutants
came back `no summary line`, which the script then had to be read by hand to
resolve. Concatenate `stdout` and `stderr` on EVERY path (`spawnSync` hands back
both regardless of exit) before looking for the summary. **A migration whose own
apply-time self-check catches the mutation is the STRONGEST kill available and
deserves its own verdict**, not a fold into "failed": an apply refusal and an
assertion failure are different facts about where the gate is.
A restore step in a mutation script copies the file first (`cp`, or
read its content into memory) and restores FROM THAT COPY, never from git --
`git checkout --`/`restore` is a discard-to-HEAD, not a scoped undo, and has no
idea a mutation script exists.

- **THE VISUAL PASS IS RUNNABLE HERE, AND "NO BROWSER TOOL AVAILABLE" IS NO
  LONGER AN ACCEPTABLE SENTENCE.** It describes the SESSION rather than the
  environment, and the two have turned out to differ: sessions reported it for
  days on end while a Chromium sat at `/opt/pw-browsers`, starting headless on
  demand, and while this file cited Chromium measurements as established fact.
  `npm run verify:browser` (`tools/browser-verify/`, and its README is the
  reference) drives the `/dev` routes at **375px, 1152px and 1440px** (1152
  is a 1440 laptop at 125% zoom, ledger 0469) through
  playwright-core and the preinstalled binary. **A session either runs it and
  reports the numbers, or names precisely what stopped it** -- the binary it
  looked for and did not find, the error the launch returned. `--probe` answers
  the "is there a browser" question on its own and prints what that browser can
  do.
  - **EVERY CHECK REPORTS A MEASURED VALUE, NEVER A PASS.** No horizontal scroll
    at any width, contrast against the REAL rendered ground, tap-target
    geometry against 44px, present-vs-visible-vs-aria-hidden, and console errors
    during the run. **THREE FLOORS RUN ON EVERY PAGE, NOT PER SPEC (ledger
    0469):** `type-floor` (text under 11px), `control-floor` (a control under
    44px, 24px for an inline link at its line or a declared compact instructor
    surface) and `squeeze` (three or more words narrower than 9em and three
    lines tall, the HTML kit's rule, which `tools/hx-kit/test.mjs` imports from
    the same file). They look inside the Plate only, minus the islands
    `src/lib/classroom/plate.css` scopes itself away from, which
    `tools/browser-verify/checks-floor.mjs` reads off that file. A number is auditable by the next reader and a green tick is
    not, which is the whole reason the claims this replaces went unchecked for
    so long.
  - **IT COVERS `/dev` ROUTES ONLY, AND THAT IS A BOUNDARY RATHER THAN A
    STARTING SET.** A real route needs a Bosco Tech Google session no automated
    run holds; that is still `/dev/login` against a local stack, by hand. Do not
    report the harness as covering a signed-in surface.
  - **TWO LIMITS BELONG IN ANY REPORT THAT QUOTES ITS NUMBERS**: the harness
    blocks every non-loopback request (the proxy resets `fonts.googleapis.com`,
    and an unanswered request cost 8s a page -- one run took 305 SECONDS), so
    **text is measured in the fallback stack**; and `prefers-reduced-motion` is
    `no-preference`, so that path is not exercised.
  - **RUN ONE PASS AT A TIME. TWO CONCURRENT ONES MANUFACTURE FINDINGS IN
    COMPONENTS NEITHER RUN TOUCHED.** Measured: a `--route grading` run started
    while a full pass was still going reported five findings on
    `classroom-split-s-1-manage-1-state-compose-assignment-rubric` -- including
    `prepare-click [[data-testid="new-post"]] 1 matched, 12 attempt(s),
    predicate never satisfied` -- and the same spec run alone reports **18
    measurements, 0 outside threshold**. Two vite servers and two Chromiums on
    this container starve a click's own predicate, and the result reads exactly
    like a regression in somebody else's code. The same applies to running a
    pass beside `npm test`, which additionally races the DB suite's one shared
    cluster (see the parallelism trap). **A finding on a spec your diff cannot
    reach is a re-run before it is a bug.**
  - **A `/dev` HARNESS THAT MOUNTS A CLASSROOM SURFACE AND DOES NOT SET
    `--cr-measure-route` MEASURES A WIDTH THE REAL ROUTE NEVER HAS.**
    `src/routes/classroom/+layout.svelte` sets it from `classroomMeasure(loc)`;
    a harness that omits it falls through `classroom.css` to `--measure-page`
    (60rem), so `main` caps at 960px where the real page takes the window
    (`--measure-console` is `100%`). **This is not hypothetical and it shipped a
    wrong layout**: the rubric was withheld from every ported HTML assignment on
    the reading "the split gets 562 at 1440 and at 1920 alike", which was true
    of `/dev/html-assignment-grading` and false of the console -- the real
    numbers are 1009.6 and 1489.6. That harness sets it now;
    `/dev/grading-rubric` and `/dev/grading-bulk` still do not. **Check it
    before reading any width off a classroom harness**, and set it (plus
    `.cr-app` where the measure is `console`) rather than injecting it at
    measurement time, or the fixture goes on lying to the next reader.
  - **A CHECK THAT HAS NEVER FAILED HAS NOT BEEN TESTED.** `--selftest` puts
    every check to a broken fixture AND a sound one and exits non-zero if the
    instrument is wrong; `--break <preset>` injects a defect into the REAL page
    so a session can prove a check bites on the surface in front of it. Adding
    a check means adding both.
  - **IT IS DELIBERATELY OUTSIDE `npm test` AND OUTSIDE CI.** `npm test` is the
    database suite and a browser failure there would read as a database
    failure; and a push to `main` deploys `ideabosco.com` during class, so a
    browser-shaped flake must not be able to block a deploy. Default exit is 0
    even with findings. Revisit CI once several sessions have run it.
- **THE BROWSER PANE'S LIMITS ARE NOT THE ENVIRONMENT'S LIMITS, AND THE WHOLE
  "Browser pane" SECTION MUST BE READ THAT WAY.** Measured against the harness
  Chromium (141.0.7390.37) rather than assumed: screenshots WORK,
  `requestAnimationFrame` FIRES, `IntersectionObserver` FIRES,
  `ResizeObserver` DELIVERS, canvas readback and `color-mix()` parsing work,
  and a paused animation reports 0.5 opacity at its midpoint. Every one of
  those is the opposite of what that section records for
  `mcp__Claude_Browser__*`, and carrying its workarounds over here is how a
  session settles an `IntersectionObserver` by hand that would have fired on
  its own. Re-run `--probe` rather than trusting this paragraph.
- **A SPEC THAT CLICKS A REAL LINK WAITS FOR A HYDRATION MARKER THE HARNESS SETS
  IN `onMount`, TWICE (ledger 0360).** On a cold dev server Vite reloads the page
  once while it optimizes a route's dependencies, and a click that lands before
  hydration follows the link off the page (a Foundry card is a real
  `/foundry?app=<slug>` link, which sends a signed-out harness to `/`). The room
  and forge harnesses set `data-room-hydrated` / `data-forge-hydrated`, and their
  specs wait for it, wait 2s, and wait again. `clickUntil` reads its target's box
  with a 2s timeout, so a selector that vanished fails an attempt rather than
  hanging the pass.
- **PAINT IS NOT INTERACTIVITY, AND NO WINDOW MARKER SEPARATES THEM.** The
  server-rendered markup is on screen before hydration attaches a handler, and
  the `__SVELTEKIT_*` globals are set by the client entry module before that
  too. Measured on `/dev/spec-table`: every global present at 600ms while two
  clicks in a row did nothing, and the same single click landing at 2500ms. So
  a scripted click NEVER waits on a timer or a marker -- it retries against its
  own effect and reports the attempt count. A step that "failed" through twelve
  attempts whose clicks were all working is what the other shape looks like.
- **Interactive/visual verification:** when a task involves interactive or visual
  UI (custom viewers, canvas/three.js, animations, drag/pan/zoom, pop-out/PiP,
  complex forms -- anything whose correctness is invisible to type-checking), you
  must (1) add or reuse a dev-guarded harness route that renders only when `dev` is
  true, **returns 404 in production**, needs no auth or Supabase, and mounts the
  REAL component with representative sample data, and (2) verify every interaction
  in a real browser through it before finishing. Report what you verified.
  `svelte-check` passing is necessary but not sufficient. **Harness routes stay in
  the repo as regression tools.**
- **A SIGNED-IN SURFACE CAN BE VERIFIED LOCALLY NOW, AND `/dev/login` IS HOW.**
  Production sign-in is Google OAuth against a real Bosco Tech account, which
  cannot happen against a local stack, so until this existed nothing behind a
  session was checkable locally at all -- and anything gated on an unapplied
  migration was checkable nowhere. It is a password sign-in through the SAME
  browser Supabase client the app uses, so the session and cookies are the real
  ones; it 404s in production and no Bosco Tech account has a password anyway.
  The stack is `wsl -- bash -lc "cd /mnt/c/idea-app && supabase start"` (544xx,
  see the toolchain traps), a migration is applied with
  `docker exec -i supabase_db_idea-app psql -U postgres -d postgres < <file>`
  exactly as it will be by hand, and users are made through the auth admin API.
  **Point `.env` at the local stack for the pass and restore it byte-identically
  afterwards (md5-check it), the way a mutation proof is restored.**
- **A harness must mirror the whole mechanism it stands in for.** A harness missing
  a guard the real page has makes a passing drive prove nothing.
- **Prefer measuring to reasoning.** Where a claim can be measured -- a width, a
  frame cost, a row count, a contrast ratio, which lens a camera opened -- measure
  it and report the number. Several rules here exist because a plausible
  explanation was wrong and the measurement said so.
