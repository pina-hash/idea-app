---
title: "Ranked Speedrun runs get a reader, not a gate (`claude/gauntlet-run-review-vwyl49`, migration 0152)"
date: 2026-08-29
branches: [claude/gauntlet-run-review-vwyl49]
migrations: ["0152"]
subsystems: ["GAUNTLET", "Telemetry", "Disclosure", "Testing"]
---

`supabase/migrations/0152_gauntlet_run_review.sql` adds an admin-only report of
ranked Speedrun runs, and `/gauntlet/run-review` is the surface that reads it.
**It ranks nobody, unranks nobody, refuses nothing and changes no
student-visible behaviour.** No existing function, view, policy, column or route
was modified.

**0152 HAS NOT BEEN APPLIED.** Nothing in this repo can reach the live project;
every number below is the embedded-Postgres fixture with the real migration
files applied unmodified.

### The brief was a trail rule, and the answer is that a trail rule cannot work

The proposal this bundle was asked to weigh was: a run may PASS without evidence
of real modelling and may not RANK without it. Four facts, each checked against
the code before anything was written, rule that out:

1. **The target is published.** `buildPayload` writes `target_mass`, `density`
   and `tolerance_pct` into `challenges.prompt`; `prompt` is in the column
   SELECT grant to `authenticated` (0004) and both Speedrun routes ship it
   whole. `targetVolumeFromMass` in `src/lib/gauntlet.ts` reconstructs the
   ranked comparison value from it, in the browser, today. A forgery needs no
   search, so nothing that bounds a search contains it.
2. **The VBA macros rank and emit nothing.** `idea-gauntlet-submit.bas` posts to
   `gauntlet_macro_submit`, which writes `source = 'macro'` -- the predicate
   `gauntlet_leaderboard` ranks on (0146) -- and no `.bas` file names
   `gauntlet_run_events_insert` anywhere. `/gauntlet/tools` still offers them as
   a first-class choice.
3. **Room runs cannot emit telemetry by construction.** Room racers never run
   the Start macro, so their token holds no `run_id` (0016), and
   `gauntlet_run_events_insert` drops any batch whose token `run_id` is null.
   Asserted in the suite rather than reasoned: a room token's batch returns 0.
4. **A trail is exactly as forgeable as the submit it would corroborate.**
   `gauntlet_run_events_insert` is `anon`-granted, takes the code the forger
   already holds, and validates nothing else -- no event-type whitelist, no
   count cap, no monotonic `seq` or `t_ms`, no relation to `started_at`.

A gate would therefore refuse honest students on two documented paths to impose
one extra HTTP request on a forger. What is left worth building is the thing a
person reads.

### A fifth fact, found while building, that makes signal 2 unfixable rather than hard

The brief named "a ranked run with no telemetry, WHERE TELEMETRY WAS POSSIBLE"
as the hard one. It is not hard, it is **not expressible**, and the reason is
one line of each client:

    idea-gauntlet-submit.bas  ->  p_code, p_run_id, p_volume_mm3,
                                  p_surface_area_mm2, p_feature_count, p_unit_system
    GauntletClient.SubmitAsync ->  the same six, plus p_material

and `p_material` is null unless the off-by-default advisory checkbox is on. So
in the ordinary case **the two clients write byte-identical submission rows**.
Nothing in a ranked row says which one produced it, and `telemetry = 'absent'`
therefore means "the VBA path, or an add-in run whose best-effort flush did not
land", with no way to tell them apart from the record.

That is why `telemetry_absent` is an observation the caller must ASK for
(`p_include_absent`, default false) rather than one the report volunteers. On a
board whose rows mostly predate the add-in it would list nearly everybody.

### What lists a run, and what an honest run would have to do to trip it

Four observations, and the negative half of each is the part that was designed:

| observation | expected honest rate |
| --- | --- |
| `fast_finish` (elapsed under a caller-set floor, default 30s) | essentially zero at 30s; **rises with the floor, which is the caller's to set** |
| `submit_volume_unseen` (trail present, first submit, no snapshot matches the submitted volume) | rare: only a student whose last volume-changing edit landed inside the pane's 2s tick and who submitted before the next one |
| `clock_exceeds_run` (add-in stopwatch longer than the server clock) | zero -- the stopwatch starts *after* `gauntlet_macro_start` returns, so it is structurally the shorter clock |
| `events_before_start` / `events_after_submit` (server-stamped arrival outside the run window ± 2 min) | zero either side |

**`fast_finish` is the one that will fire on honest runs**, and it fires by
design: it also catches the cheat 0061 records as unfixable in SQL (model the
part, then press Start), which no elapsed floor can distinguish from a very fast
honest student. The surface says that in those words rather than implying
otherwise.

**`submit_volume_unseen`'s `failed_attempts = 0` gate is load-bearing and was
the single most important discovery in the build.** `TelemetryRecorder.Stop()`
runs on EVERY submit, passing or failing, and sets `active = false`; only
pressing Start Run again revives it, with a fresh `run_id`. So on the ordinary
0061-sanctioned loop -- submit, fail, fix the geometry, submit again -- the
passing volume is modelled after the trail went quiet and legitimately appears
in no snapshot. **Ungated, this observation fires on every honest student who
missed once.** `tests/gauntlet-run-review.test.ts` drives that exact loop
through the real RPCs and asserts the observation is absent while every input
the naive version would key on is present.

### What is deliberately NOT an observation

- **`failed_attempts = 0` alone.** "A first submit that passes exactly" is what
  a prepared student does. It is a column on every row and lists nothing; its
  only job is gating the above.
- **A feature count that never moves.** Returned as `feature_add_count` and
  `distinct_feature_counts`, never as a listing signal, for two independent
  reasons that each make it noise: native SOLIDWORKS event binding is
  best-effort (`WireEvents` swallows its own failure with the comment "native
  events unavailable: snapshots still cover it"), so zero `feature_add` is also
  a normal run on an unlucky install; and editing dimensions of existing
  features changes volume repeatedly without adding any, which is most of what
  modelling to a target is.

### Crying wolf, structurally

- **There is no score.** No column ranks or counts suspicion, and the ordering
  is `challenge, newest first` -- never `most anomalous first`. A mutant that
  changes the ORDER BY to `cardinality(observations) desc` reddens.
- **`telemetry` is four answers, not two** -- `room`, `unlinked`, `absent`,
  `present` -- so three quarters of the vocabulary exists to say "there was
  nothing here to check", which a boolean cannot.
- **The page carries a standing, non-dismissible note** explaining before the
  first row why "none recorded" is the expected majority. Its absence is what
  would make a first reader conclude the board is full of fakes.
- **No word for dishonesty exists in either half.** Swept in the migration's own
  `prosrc`, in the surface copy, and in the rendered HTML, each with a positive
  control.

### How many ranked rows could carry telemetry at all

Asked, and answered from the schema and the shipped tooling rather than from
production, which this repo cannot reach. **Close to none, and the report's
early weeks will be mostly "none recorded, expected".**

- **`gauntlet_run_events` was created by 0035.** Every ranked row from before it
  was applied has no trail and could not have one.
- **The join key is `submissions.value->>'run_id'`, and there is no column.**
  `gauntlet_macro_submit` writes it only for SOLO runs and only since 0016, so
  every pre-0016 row reads `unlinked` -- a property of the record, not of the
  run.
- **Room runs: never, at any date** (fact 3 above).
- **VBA macro runs: never, at any version.** No `.bas` file emits.
- **Add-in runs: only v1.6 or later.** `tools-manifest.json` dates add-in 1.6 at
  **2026-07-02** with "Fail-safe modeling telemetry" in its changelog, alongside
  the 0.1% tolerance change 0036 made -- so telemetry, 0035 and 0036 shipped
  together, roughly eight weeks before this bundle.
- **And nothing migrates an older install.** `AddinUpdate.ManifestUrl` is
  `""` -- "empty by design", so the update check no-ops and the add-in does not
  even NOTIFY, let alone auto-install. Every machine runs whatever was hand
  installed on it, indefinitely.

So the rows that could possibly carry a trail are the intersection of (applied
0035) ∩ (solo, not room) ∩ (add-in ≥ 1.6 on that machine) ∩ (a fire-and-forget
flush that landed). **A cutoff is not needed, because 0152 gates nothing** --
this is exactly why the report shape was chosen over the rule shape. A trail
RULE applied to `gauntlet_leaderboard` would have emptied the board on the day
it was applied, and would have needed one.

### Verification

- **`svelte-check`: 0 errors, 37 warnings** (31 `state_referenced_locally`, 5
  `css_unused_selector`, 1 `perf_avoid_nested_class`), re-derived after
  `npx svelte-kit sync` with placeholder `PUBLIC_SUPABASE_*` exported, per the
  fresh-checkout rule. Identical before and after; the new surface adds neither.
- **Full suite: 171 files / 3663 tests before, 173 files / 3706 tests after.**
  Both all-passing. The delta is exactly this bundle's two test files.
- **The migration re-applies.** A chain listing 0152 twice produces one function
  and no error; asserted in the suite rather than eyeballed.
- **NO BROWSER PASS, and none was available.** `npm run verify:browser` drives
  `/dev` routes only, and every route spec lives in `tools/browser-verify/`,
  which this session was scoped out of. `/gauntlet/run-review` is admin-only and
  needs a signed-in session and a database, so it is reachable by neither. The
  harness was run to confirm this bundle regressed none of its existing checks;
  what the new surface looks like at 375px and 1440px is **not measured**. A
  future session that owns `tools/` should add a `/dev` harness mounting the
  real page with sample rows.

### The mutation proof

Required twice over: the admin gate is the shape 0060 found leaking a room
roster for two months, and every observation's NEGATIVE half fails silently -- a
report that has started crying wolf looks exactly like a report that is working
until its reader stops opening it.

**Twenty mutants across two files, all in the PERMISSIVE direction. Every one
reddens.** Both files were restored from an IN-MEMORY copy taken before the
first mutation and md5-checked after each one (`0152...sql`
`981f478a9ed8cf9fc9a8fceaa5c2ca59`, 26029 bytes; `+page.server.ts`
`1285dd66f1a3791e143dfcad8f5d062b`, 4885 bytes; both verified identical at the
end). `git checkout --` was not used anywhere: it restores from HEAD, not from
what a script saved, and would have discarded this session's own uncommitted
work along with the mutation.

| mutant (0152) | tests reddened |
| --- | --- |
| admin gate replaced by `true` | 2 |
| admin gate widened to any signed-in caller | 2 |
| population widened past `is_correct` | 1 |
| population widened past `source = 'macro'` | 1 |
| `submit_volume_unseen` loses its `failed_attempts` gate | 1 |
| `telemetry_absent` ignores its parameter (always on) | 1 |
| room runs fall through to `absent` | 2 |
| `unlinked` rows read as `absent` | 1 |
| `fast_finish` floor ignored | 1 |
| clock grace made unreachable | 1 |
| arrival window ignored | 1 |
| the email is projected instead of the chosen name | 1 |
| ordering becomes a suspicion score | 1 |
| `anon` granted execute on the report | 1 |

| mutant (`+page.server.ts`) | tests reddened |
| --- | --- |
| the admin 404 becomes a redirect | 1 |
| the admin check removed entirely | 1 |
| the signed-out check removed | 1 |
| the not-applied branch degrades into an empty all clear | 1 |
| a read error is swallowed instead of reported | 1 |
| the query-string defaults fall back to the clamp floor | 1 |

**THREE MUTANTS SURVIVED THEIR FIRST RUN, AND ALL THREE FIXES WERE THE TEST, NOT
THE CODE.** They are the part of this section worth reading.

- **The email-projection mutant survived.** `player` is
  `coalesce(display_name, full_name)`, and every profile in the fixture had a
  name -- so a mutant appending `pr.email` as a third rung was UNREACHABLE and
  the no-email sweep passed over a payload that genuinely leaked. The fixture
  now seeds a student with neither name, asserts `player` comes back null for
  them, and the mutant reddens. This is the vacuous-assertion trap exactly:
  clean is what nobody investigates.
- **The two error-branch mutants survived** because those tests built the load's
  result BY HAND and rendered the page with it, so they exercised the component
  and never the load. Both now drive the real `load` -- `notApplied` against a
  second real database on the chain one file short of 0152 (the state this
  deployment is in right now), and `readError` with only the error stubbed,
  because a statement timeout is not something a fixture can be asked to
  produce.

### Two defects the tests found in this bundle's own code

- **`intParam` applied none of its defaults.** `Number(null)` is `0`, which is
  finite, so the `Number.isFinite` guard accepted it and then CLAMPED it into
  range: with no query string the page opened on a **one hour** window with a
  **zero second** floor, silently, and looked entirely deliberate doing it. The
  absent case is checked explicitly now and the mutant reddens.
- **`tests/db/postgrest-shim.ts` calls every RPC as a scalar.**
  `select f(...) as result`, returning `rows[0].result`. That is right for the
  scalar and jsonb RPCs it was written for and **wrong for a `returns table`
  function**: PostgREST issues `select * from f(...)` and answers with an ARRAY,
  while the scalar form yields one composite per row and the shim keeps only the
  first. A test built on it hands the page a non-array and proves nothing about
  the shape a deployed client receives. **The shim was NOT changed** -- other
  sessions are working against that file -- so
  `tests/gauntlet-run-review-route.test.ts` overrides `rpc` locally, keyed on
  `pg_proc.proretset` read from the real catalog. **Whoever fixes it centrally
  should know it is a real gap, not a local quirk**: this is the first
  `returns table` RPC a route test has driven.

### Not verified

- **The live project.** 0152 has not been applied anywhere. No count in the
  coverage section above comes from production data; every one is derived from
  the schema, the migration chain and `tools-manifest.json`.
- **What the surface looks like.** No browser pass was possible (see above). The
  layout is written to the `.gt-root` viewport vocabulary and `svelte-check` is
  clean, which is necessary and not sufficient.
- **The real distribution of honest elapsed times.** The 30 second default floor
  rests on the structural argument that a run includes reading the revealed
  drawing, not on a measured distribution -- there is no production access. It
  is a parameter on the page for exactly that reason, and the copy says it is
  the reader's setting rather than a rule about the part.
- **Whether any production challenge omits `prompt.target_mass`.** Still
  uncountable from here, as 0147 and both premise bundles record.

### For whoever is next

- **The containment decision is still `0146`'s board allowlist**, unchanged by
  this bundle and by the two before it. This one bought a reader, not a fix.
- **Do not turn any of this into a gate.** The four facts at the top are why,
  and a gate built on `telemetry` would unrank the VBA path, every room run and
  every ranked row older than eight weeks.
- **`gauntlet_practice_pressure` (0151) still has no UI.** It answers a
  different question -- who hammered the free practice check -- and would sit
  naturally beside this surface. It needs nothing new from the database.
- **If a fifth observation is ever added**, it needs an entry in
  `src/routes/gauntlet/run-review/observations.ts` in the same commit: the suite
  asserts the two vocabularies match exactly, in both directions, from
  `pg_proc.prosrc`.
