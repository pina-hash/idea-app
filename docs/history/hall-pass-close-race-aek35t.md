---
title: "The hall pass close is split by role so a manager's press cannot land on the pass that replaced the one they meant (`claude/hall-pass-close-race-aek35t`, migration 0144)"
date: 2026-08-28
branches: [claude/hall-pass-close-race-aek35t]
migrations: ["0144"]
subsystems: ["classroom", "hall pass"]
---

`0143` shipped the digital hall pass with one close, `classroom_hall_pass_close(p_section_id)`,
serving both callers. It takes a SECTION and closes whatever is open in it. The
bundle that built it flagged the consequence itself: an instructor clearing the
pass in the same instant one student returns and another leaves closes the
SECOND student's pass. That student is marked back in the room while standing in
a corridor, and the pass is free for a third. Every row is well formed, the
capacity index is satisfied, and the only trace is a `closed_by` naming an
instructor who never saw them leave.

### The framing that made it look unfixable, and why it was wrong

The session that found it presented a choice between living with the race and
putting a pass handle into a student's payload -- which would undo the
disclosure design the whole feature is built around. That framing assumes one
RPC serves both callers. It does not have to, and the two callers are not
symmetric:

- **A manager is already told everything.** `classroom_hall_pass_state`'s
  manager branch hands them the pass id, the student's name, their email and the
  section's history. A handle costs them no disclosure whatever, because nothing
  is being kept from them. Naming the pass is just saying which one they meant.
- **A student needs no handle at all.** `classroom_hall_pass_close_mine(uuid)`
  takes the section and resolves the person from `current_user_email()`, exactly
  as `classroom_hall_pass_open` already did. There is no argument through which
  to name anybody, so `HallPassStudentState` still has no field capable of
  identifying a person.

**The asymmetry that makes the split safe is that the student path cannot have
this race at all, structurally rather than by being careful.** It requires the
open pass's holder to BE the caller. If their pass closed and somebody else's
opened underneath, it finds that other student's row, sees a holder who is not
the caller, and answers `not_yours`. The worst outcome reachable on it is a
refusal; a wrong close is not expressible. That is why a section is a safe
handle for a student and not for an instructor, and it is asserted rather than
argued (`tests/classroom-hall-pass-race.test.ts`).

### `for update` was already there and does not help

`0143`'s close takes a row lock. It did not prevent this and could not. A lock
makes two callers agree about one ROW; it cannot make a caller's INTENT survive
the row underneath it being replaced. The instructor resolved a target at press
time that their screen had chosen at read time, and between those instants the
answer changed -- so the lock is taken on the wrong pass. Worth writing down
because "there is already a lock" is the reason somebody would conclude this was
handled.

### Already closed is a refusal

`classroom_hall_pass_close_by_id` answers `{ok:false, reason:'already_closed'}`
for a pass that was already signed back in, rather than reporting a close it did
not perform. "The student came back and signed themselves in" and "I signed them
in" are different things that happened, and the instructor is the one who needs
to know which. It is also the ordinary landing place for the race above once
this is applied: the late press finds the pass closed and says so.

### Nothing is dropped, and that is the deploy ordering

`classroom_hall_pass_close(uuid)` is left exactly as `0143` created it. `0144` is
purely additive -- two new names, no signature widened, no existing behaviour
changed -- so applying it and deploying the client have no ordering between
them and either may go first.

A drop here would create precisely the mutually-blocking problem `CLAUDE.md`'s
SIGNATURE TRAP describes: applied before the deploy it breaks every close on the
live site, applied after it breaks every close until it lands. **The precedent
followed is `0124`**, which dropped the classroom view-as functions in its own
migration one bundle AFTER the routes calling them were removed.

**So the retirement is a CLIENT fact first**, and a sweep holds it: nothing under
`src/` may name the section-keyed close again. The sweep matches the name as a
QUOTED STRING, which is what a call looks like (`supabase.rpc('...')`) --
matched as a bare substring it also hits the comments in `HallPass.svelte` and
`transports.ts` that explain why the function is retired, which would make
documenting the defect impossible. It carries two positive controls: that the
pattern still bites on a real call site, and that the walk found the tree.

Dropping the SQL object belongs in a later migration, once the deploy is live,
and it will need its own caller guard -- Postgres records no dependency from one
plpgsql body to another.

### Which of `0143`'s conventions were followed

Stated because the file deliberately restates none of its rules: SECURITY
DEFINER with `set search_path = ''`; a displayable refusal is `{ok:false,
reason}` jsonb and genuine misuse raises; no refusal names a database object;
"not found" and "not yours" answer identically (a nonexistent pass id and one in
a section the caller does not manage raise the SAME sentence, asserted as equal
strings rather than as "both threw"); the manager result shape is `0143`'s
close result unchanged; a new function is not covered by `0137` and revokes from
every role by name; the self-check reads `pg_proc` and
`has_function_privilege` back rather than reporting that a statement ran.

`closed_by` still says something true on both paths, and cannot say anything
else: the manager path names a PASS and the student path names a SECTION, and
both take the actor from `current_user_email()`. Asserted directly -- an
instructor's close records the instructor while the row stays the student's.

### What was measured

- **The race, with a genuinely blocked transaction, not a burst.** A
  `Promise.all` does not discriminate here for the same reason it does not for
  the capacity rule: the wrong close and the right one both leave a well-formed
  table. The test forces the three-way order instead. Ana holds the pass and her
  id is captured first; she signs herself in inside an uncommitted transaction;
  Ben's open BLOCKS on the partial unique index; `pg_stat_activity` is polled
  until that block is real (`wait_event_type = 'Lock'`) and Ben's promise is
  asserted UNSETTLED at that instant; Ana commits; Ben's pass is awaited and
  settled; only then does the instructor press with Ana's id.
- **Mutation proof, permissive direction, three ways, each restored
  byte-identically (md5 verified):**
  - Reverting the manager close to resolve by SECTION (keeping the signature)
    reproduced the defect exactly: the clear returned `ok: true`, having closed
    Ben's pass. 2 tests red.
  - Removing the student path's ownership test reddened 2 tests, including "a
    student pressing back too late is refused, never given somebody else".
  - Adding `student_email` to the student projection reddened the existing
    exact-key-set disclosure sweep in `tests/classroom-hall-pass.test.ts`, 2
    tests. Staged by appending a patched `classroom_hall_pass_state` to `0144`
    rather than editing `0143`, which this session did not own.
- **The migration re-applies over live rows**, asserted with an open pass left
  standing across the second apply, and both functions still at exactly one
  arity afterwards.
- **Suite: 140 files / 3207 tests before, 140 files / 3216 tests after, all
  passing** (+9 tests, no new test file -- the nine land in the two hall pass
  files that already existed).
- **`svelte-check`: 0 errors / 37 warnings, 31/5/1, unchanged.** (Adding the dev
  route needed `svelte-kit sync` first -- stale generated route types report a
  phantom `Cannot find module './$types'`.)
- **`npm run verify:browser`: 28 route/width runs, 200 measurements, 2 outside
  threshold before AND after, both on `/dev/pathways` (tap-target 26.2px) and
  unrelated to this change.**
- **The hall pass controls, measured directly in the harness Chromium
  (141.0.7390.37) at 375 and 1440:** every control **44.0px min dim** (112.8x44
  Sign out, 147.4x44 Sign back in), **hit fraction 1.0** on a full-span
  `elementFromPoint` sweep, **0px horizontal overflow** at both widths, and the
  blocked control `aria-disabled=true` with `disabled` absent, so it still
  receives the tap and can explain itself.

### The dev harness, and a boundary this session could not cross

`0143` shipped this feature with **no dev harness of any kind**, so its one
control had never been measured anywhere -- and `0144` then put a BRANCH behind
that control, which is exactly what `svelte-check` cannot see and what looks
identical on screen either way. `src/routes/dev/hall-pass` now mounts the real
component in all five projections plus a read-only mount, against in-memory
transports that RECORD what they were handed. Pressing each close and reading
that log is the behavioural proof at the client layer: the manager's press sent
`closeById(pass=22222222)` and the student's sent `closeMine(section=11111111)`
with no identifier, both landing on the first attempt.

**It is deliberately NOT registered in `tools/browser-verify/routes.mjs`**,
because this session was scoped out of `tools/`. Adding it there is a one-line
change and would put the hall pass control into the automated 375/1440 sweep;
until somebody does, the numbers above come from a script that imports the
harness's own `server.mjs` and `browser.mjs` so the browser, flags, external
blocking and transition freeze are identical.

### Not verified

- **`0144` has NOT been applied to the live Supabase project.** Nothing in this
  repo can apply a migration; the local `.env` is a placeholder project. It is
  applied by hand from the SQL editor.
- No signed-in production surface was driven. The measurements above are the
  local dev harness, not `ideabosco.com`.
- Web fonts do not load under the harness (the proxy resets
  `fonts.googleapis.com`), so all geometry is measured in the FALLBACK stack.
  One console error per page is that blocked request and not a page defect --
  1 blocked request, 1 error, and the main harness ignores it by pattern.
- `prefers-reduced-motion` is `no-preference` in the harness, so that path is
  not exercised.

### Deferred

- **Dropping `classroom_hall_pass_close(uuid)`**, which has no client caller
  once this deploys. Its own migration, with a `pg_proc.prosrc` caller guard.
- **Registering `/dev/hall-pass` in `tools/browser-verify/routes.mjs`**, one
  line, blocked only by this session's file scope.
- The manager's card still offers no way to close a pass other than the open
  one; the history rows are read-only. Nothing needs it yet, and a control there
  would be a second close path.
