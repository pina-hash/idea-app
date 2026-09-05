---
title: "One closed section no longer closes the Foundry everywhere: the class gate narrows to the gallery (`claude/foundry-section-gate-avjwzf`)"
date: 2026-09-05
branches: [claude/foundry-section-gate-avjwzf]
migrations: []
subsystems: ["Foundry", "Classroom", "Testing", "Dev harnesses", "Browser harness"]
---

Prompt 0042. 0173 built decision 01 exactly as Mr. Pina answered it, and then flagged what
it costs in its own report: ANY class a student is enrolled in that had closed the Foundry
closed the whole area for that student, in every other class and at home, until that one
teacher opened it again. A student in six classes was locked out of all six by one press.
This bundle narrows the closure to one surface, and no schema moved to do it.

## The base

Started from `origin/integration` at `e97b18d` (`Merge claude/avatars-phase-two-surfaces-42h0pb
into integration`), in `/home/user/idea-app`. `origin/main` was at `1895925`. Git already
carried a committer identity in this container (`Claude <noreply@anthropic.com>`); it was set
explicitly anyway so nothing depended on that.

## Phase A, and the audit is the argument

**A1. Where the gate is, and what it actually enforces.** `src/routes/foundry/+layout.server.ts`
calls `foundry_section_access()` (0173) once for the area, hoisted there as the group-wide
gate. It degrades to OPEN on `PGRST202` alone and to CLOSED on any other error. The RPC reads
`classroom_enrollments` joined to `classroom_sections`, returns every ACTIVE enrollment whose
section carries a `foundry_closed_at`, and answers `open: false` if that list is non-empty. An
admin is exempted inside the function. All three claims from 0015 hold on this tree: it is
server-checked, it is per-section, and any one closed section refuses the student.

The refusal is a stated reason and not a blank page: `FoundryClosed.svelte` names each class
by course title and label, lists whatever note the instructor typed, and the shell stays.
Confirmed still true.

**One thing 0015's report did not say, and it changes how the fix is read: NO WRITE RPC
CONSULTS THE GATE.** `foundry_section_access` is named by exactly one caller in the whole tree,
the layout load. `foundry_create_app`, `foundry_create_version` and `foundry_submit_version`
have no idea a section can be closed. So the closure has never been a database boundary; it is
a shutter on five SvelteKit page loads, and every claim about what it "stops" is a claim about
what a page renders.

**A2. THE QUESTION THIS BUNDLE TURNED ON: what does the app know, when a student opens
`/foundry`, about which class they are in RIGHT NOW? Nothing. Not "not much" -- nothing.**
Read off the schema and the session rather than the UI:

* **No bell schedule exists anywhere in the tree.** `grep -rlni 'bell_schedule|bellSchedule|
  period_start|class_period'` over `src/` and `supabase/migrations/` returns zero files.
  `classroom_sections.block` (0082) is free-form display text, `null`-able, capped at 60
  characters, with a comment saying "Block / period display text, optional". There is no time
  in it and nothing parses it.
* **A hall pass is the wrong sign of the wrong thing.** `classroom_hall_passes` (0143) records
  that a student is OUT of a room, is one-open-per-section by partial unique index, and is
  opened by a small minority of students on any given day. Reading it as presence inverts its
  meaning, and its absence covers everybody who never left.
* **`classroom_item_views` names no section.** It is keyed `(student_email, item_id)` with a
  `viewed_at` (0085), and an item is CANONICAL -- posted to N sections through
  `classroom_postings` -- so the row cannot say which class the view was for. It also survives
  forever, so a student reading tomorrow's handout at 9pm at home is indistinguishable from one
  sitting in the room.
* **Nothing records opening a class page.** The only per-open table in the schema is
  `fsp_item_opens`, which belongs to the archived FSP programme.

So "during my class" is not a question this application can ask, and B1 became a SCOPING change
rather than a targeting one, exactly as the prompt anticipated.

**A3. What the closure blocked, and whether the instructor meant any of it.** The layout renders
`FoundryClosed` in place of `{@render children()}`, so it covered every PAGE under `/foundry`:

| Surface | Blocked before | Did closing a class mean this? |
| --- | --- | --- |
| `/foundry` (gallery) | yes, and the load returned no apps | **Yes.** Everybody's published apps, and the one place in the portal where a bundle RUNS: `FoundryDetail` mounts `AppStage`. |
| `/foundry/mine` | yes, and the load returned no apps | No. The student's own shelf. Nothing here mounts `AppStage`. |
| `/foundry/submit` | yes, and the load returned no apps | No. Publishing is handing work in, and in an IDEA class the app can BE the assignment. |
| `/foundry/contract` | yes, by the layout only | No. A generated reference document with no student data and no app in it. |
| `/foundry/classes` | yes, by the layout only | **No, and this one was a trap.** See below. |
| `/foundry/review` | never (admins are exempt inside the RPC) | n/a |

**And it blocked nothing that serves or runs a bundle.** `/foundry/preview/[appId]/[versionId]`,
`/foundry/download/[appId]/[versionId]` and `/foundry/starter` are `+server.ts` endpoints, so no
layout load ever ran for them; and `/a/<app>/` and `/b/<app>/<version>/` answer on the apps
origin, which holds no session at all. A closed student could always run their own build and
open any published app by link. The shutter was on five documents.

**THE ONE-WAY DOOR, WHICH IS THE FINDING THIS AUDIT EXISTS FOR.** Instructors enroll themselves
in their own sections to see the class the way a student does -- CLAUDE.md's own roster rules
say so at length (0138) -- and `foundry_section_access` reads ENROLLMENTS and exempts only
ADMINS. So a section manager who is not also a site admin, closing their own class, was shown
the refusal in place of `/foundry/classes`: the only control that reopens it. A close with a
Restore nothing could ever be selected to press.

**A4. How an instructor closes and reopens.** `/foundry/classes` mounts `FoundryClassAccess`
with a `setOpen` transport that calls `foundry_set_section_open` straight from the browser
client. Closing arms and then confirms with an optional note; opening is one press. Both are
gated by `classroom_manages_section` inside the RPC. 0015's claim that re-opening brings the
page straight back is confirmed structurally: `foundry_set_section_open(true)` nulls
`foundry_closed_at` in the same statement, and the next layout load reads the new answer, so the
delay is one navigation.

**A5. The counts block's outside-threshold rows, by identity: THERE ARE NONE, and the prompt's
claim about two of them is stale.** `tools/browser-verify/README.md`'s measured block on
`origin/integration` reads `"outside":0,"outsideRows":[]`, measured 2026-09-05T01:02:31.797Z on
commit `4dc9df8` (which is an ancestor of this branch's base). The two spec-table row-action
rows prompt 0039 is credited with recording were not recorded: 0039's own commit `700a56d`
("Add row is a 44px target") FIXED them, and `80dfe19` regenerated the block to zero. The tree
wins; the comparison target for B5 was therefore `outside: 0`, `outsideRows: []`.

## What was built

**No migration.** Phase A did not prove the fix needs schema, and this fix touches no schema at
all: the closure's reach lives entirely in which page loads short-circuit. `foundry_section_access`,
`foundry_set_section_open` and `foundry_manageable_sections` are unchanged, and 0173 was not
edited. No migration number was taken.

**`FOUNDRY_CLOSURE_BLOCKS` in `src/lib/foundry/access.ts` is the one statement of the scope**,
with `foundryClosureBlocks(place)` over it, taking `FoundryPlace | null` from `nav.ts`. A
closure blocks `gallery`; `mine`, `contract`, `submit`, `classes` and `review` carry on. `null`
FAILS CLOSED, so a route added under `/foundry` that `locateFoundry` has not placed is blocked
until somebody decides where it belongs. That is the same argument the group-wide gate is
hoisted for: a new page must not ship past a decision by nobody having made it.

The reasoning, kept beside the set because it is the whole product of this bundle:

* **gallery, still blocked.** It is the browse-and-run surface and the only portal page that
  mounts `AppStage`. It is what "somebody is playing a game in my class" means.
* **mine, open.** Nothing here runs an app, and the preview link beside a version goes to a
  `+server.ts` that answered a closed student anyway. Blocking it bought nothing against the
  behaviour and took a student's own record away in five other classes and at home.
* **submit, open.** In an IDEA class the Foundry app can be the assignment; a close in period 3
  must not stop a hand-in for period 6. What a student publishes during a closed period lands
  in a gallery that period cannot open, which is what makes this defensible in front of the
  instructor who closed it.
* **contract, open.** Generated from the preflight constants, carries no student data, and is
  what a student pastes into an AI tool. Blocking it blocks the work rather than the
  distraction.
* **classes, open, and this is a fix rather than a preference** -- the one-way door above. The
  absence is the mechanism: there is no exemption here to forget, because there is no gate here
  to exempt from.
* **review, open**, and named so the set is total.

**The loads.** `/foundry/+page.server.ts` keeps its short-circuit and now reads
`foundryClosureBlocks('gallery')` rather than restating the decision, so a route that is dark on
the server cannot be lit in the markup. `/foundry/mine/+page.server.ts` and
`/foundry/submit/+page.server.ts` lost theirs entirely, along with their `parent()` calls.

**The layout.** `+layout.svelte` splits `isClosed` into `isBlocked` (closed AND this place is in
the set) and `isNoticed` (closed AND it is not). Blocked renders the panel in place of the
children as before; noticed renders the SAME component above them as a `notice` variant. The
`cr-app` full-height class now keys on `isBlocked` rather than `isClosed`, so a closed student
on the gallery still gets the document flow the refusal panel wants.

**`FoundryClosed` gained a `variant`, not a sibling.** One component, one sentence:
`foundryClosedSentence` still builds the class list and `FOUNDRY_CLOSURE_LIMIT` still says what
a close leaves alone, in both weights. The notice carries a kicker PARAGRAPH and no `h2` --
a notice must not read as the heading of the page it sits above to somebody navigating by
headings -- and it takes the page's own measure instead of the panel's centred 44rem column.

**B2: the control says what it will and will not do, on the screen where it is pressed.** The
old lead read "Closing it stops students in that class opening the Foundry until you open it
again", which was three things wrong at once: it named the whole area when only the gallery
stands down, it said nothing about the reach, and it therefore described a blast radius nobody
pressing it could have predicted. It is now three sentences, all three imported from
`access.ts` so the instructor and the student cannot be told different things about one act:

* `FOUNDRY_CLOSURE_EFFECT` -- what it takes.
* `FOUNDRY_CLOSURE_LIMIT` -- what it leaves. The SAME string the student's panel renders.
* `FOUNDRY_CLOSURE_REACH` -- "It applies to those students in every class and at home, not only
  during your period. The site has no way to tell which class somebody is sitting in, so there
  is no schedule behind this and it stays closed until you open it." It is set apart with the
  room's heat edge rather than sitting as a third indistinguishable paragraph, and it is
  RESTATED inside the confirm, because the lead is at the top of a list somebody has scrolled
  past by the time they arm a row.

## What was measured

**`npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings**, breakdown 31
`state_referenced_locally` / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`, unchanged
from the baseline taken on this branch's base. The two placeholder `PUBLIC_SUPABASE_*` values
were exported before the sync, per CLAUDE.md's note about the eleven phantom errors in a
checkout with no `.env` (this container has none).

**The suite:** see the run recorded at the end of this entry.

**Mutation proof, four mutations, all four bite.** Restored from `cp` copies in the scratchpad
and md5-verified against the pre-mutation baseline after every one; `git checkout --` was never
run, because the tree was uncommitted and that command is a discard-to-HEAD.

| Mutation | Direction | Result |
| --- | --- | --- |
| Restore the pre-0042 `parent()` short-circuit in `/foundry/mine/+page.server.ts` | back to deployed | `still reaches their own shelf` FAILS (`expected '' to be '7f5a12ec-...'`) |
| `if (false && ...)` on the gallery load's refusal | permissive | `is refused the gallery...` FAILS (`expected [ { …(20) } ] to deeply equal []`) |
| `if false then` in place of `classroom_manages_section` inside 0173 | permissive | `refuses a teacher who does not teach it...` FAILS (promise resolved instead of rejecting) |
| `FOUNDRY_CLOSURE_BLOCKS = ['gallery', 'mine']` | widening | `blocks the gallery and nothing else` FAILS |

The first is the prompt's control 1 in its honest form: the narrowing for `mine` is the REMOVAL
of a short-circuit, not a value in the constant, so mutating the constant would not have
reddened it and mutating the constant is recorded separately as the fourth row. The second and
third are controls 2 and 3.

**Browser, `npm run verify:browser -- --route foundry-admin`, both widths: 2 route/width runs,
82 measurements, 0 outside threshold, exit 0.** The spec was scoped by `data-variant` throughout,
because `[data-testid="foundry-closed"]` now matches two elements on that page. New rows:
the notice is present exactly once, carries a kicker, and owns ZERO `h2` against the panel's one
as the positive control; the reach sentence is present beside the switch; the instructor panel
contains all four required phrases; the notice names the same classes, says "their own apps" and
"publishing", and carries no `@`. Contrast on the new ink: notice kicker 6.99:1, notice sentence
15.4:1, "what a close leaves alone" 6.99:1 in both variants, reach sentence 14.59:1.

**Interaction drive, a one-off playwright script against the real dev server, at 375 and 1440.**
Every click RETRIED AGAINST ITS OWN EFFECT rather than waiting on a marker, and the attempt
counts are the point:

| Step | @375 | @1440 |
| --- | --- | --- |
| arm a close on an open row (confirm's reach sentence appears) | ok, 5 attempts, 875ms | ok, 2 attempts, 394ms |
| confirm the close (a row flips to Closed, 1 -> 2) | ok, 1 attempt, 49ms | ok, 1 attempt, 42ms |
| reopen it, one press (2 -> 1) | ok, 1 attempt, 48ms | ok, 1 attempt, 44ms |

The arm step is the hydration gap measured: the SSR markup satisfies DOM stability several
hundred milliseconds before a handler is attached, and a run that waited on a timer instead
would have reported a working control as broken. A FIRST pass of this drive returned
`ok: false` on the last two steps with the state visibly changing underneath -- the effect
closure took a baseline argument that `page.evaluate` was never handed, so the predicate read
`undefined` and the loop clicked forty more times. That is recorded because the symptom (a
"failed" step whose every click landed) is exactly what the prompt warns the other shape looks
like.

Also read at both widths: panel `h2` "The app gallery is closed right now", notice `h2` count 0,
notice kicker "A class has closed the app gallery", 2 Open chips against 1 Closed, and zero
horizontal overflow (375/375 and 1440/1440). The panel measures 327px at 375 and 704px at 1440
(its 44rem cap); the notice measures 327px and 1392px, which is the page measure it is supposed
to take.

**Counts.** `npm run verify:counts` reported the static region already current (99 specs over 51
routes, 82 `/dev` pages, 198 runs) and wrote nothing, which is right: no route spec and no
`/dev` page was added or removed, only an existing spec was extended.

## What is NOT verified

* **Nothing was run against the live Supabase project.** The local `.env` is a placeholder and
  this container cannot apply a migration, call an RPC or sign in against production. Every
  database claim here is against the embedded-Postgres harness with the real migration files.
* **No signed-in surface was opened in a browser.** `/foundry`, `/foundry/mine` and
  `/foundry/classes` all need a real Bosco Tech Google session, which no automated run holds and
  which the local Supabase stack was not available for in this container either. What was driven
  is `/dev/foundry-admin`, which mounts the REAL components with in-memory transports. The
  narrowing itself was proved against the real loads in the test file, not in a browser.
* **The case Mr. Pina has to check is the one no cloud session can reach**: close one section as
  its teacher, then sign in as a student who is in that section AND another, and confirm the
  other class still works, that the gallery is the only thing gone, and that the notice above
  `/foundry/mine` names the right class.
* **`prefers-reduced-motion` is `no-preference` in the harness**, so that path was not
  exercised; nothing in this change animates.
* **The harness blocks every non-loopback request** (`fonts.googleapis.com` was refused on both
  runs), so all text was measured in the fallback stack.

## Deferred, deliberately

* **A scheduled or bell-aware close.** Decision 01's other half, and Mr. Pina's to ask for.
  Nothing here infers "in class" from a clock and nothing added a schedule table. If one is ever
  wanted, `FOUNDRY_CLOSURE_BLOCKS` is where the surface question already lives and the time
  question would sit beside it, not inside it.
* **A database-side closure.** The gate has never been enforced below the page loads, and this
  bundle did not change that. Making a close refuse `foundry_submit_version` would be a
  narrowing of a deployed write path with its own answer needed for every existing caller, and
  it would also contradict the scope decision above: submit is deliberately open.
* **Moving the instructor control onto the classroom's own section page.** 0173 flagged it and
  `src/routes/classroom/**` is outside this bundle's files, as it was outside 0173's.
* **`FOUNDRY_LIMITS` and the trusted-publisher roster**, both named read-only by the prompt.
