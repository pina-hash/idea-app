---
title: "Presence on the grading console: who is working, who is elsewhere, who is away"
date: 2026-09-11
branches: ["claude/inspiring-planck-gp601z"]
migrations: ["0200"]
subsystems: ["classroom"]
---

Mr. Pina asked, on 2026-09-11, to be able to see which students are working,
which have the assignment open but are elsewhere, which are not on the site, when
each last worked, and how much time each actually spent working rather than
merely having it open. He approved the collection explicitly. His words about
what it is for were "making the class better", and the constraint arrived in the
same breath: "just keep the data secure".

**That clause is the design.** These are minors, and this table is the first
object in the schema that says anything about what a child was doing minute to
minute. Every decision below that looks conservative is that sentence being taken
literally.

Ledger 0143 deferred exactly this and named the reason: "Telemetry of any kind.
No presence, no active time, no per-student status beyond the `state` column that
has existed since 0086. It is a separate design with its own retention question
about minors' data." This is that separate design, and the retention question is
answered rather than left open.

## What is stored, which is the whole of the privacy argument

One row per `(item_id, student_email)`, carrying five facts: `last_seen_at`,
`last_input_at`, `page_visible`, `active_seconds` and `first_seen_at`.

**There is no event log and there must never be one.** "How much time did they
actually spend" is answered by an accumulating COUNTER. A counter answers that
question exactly and can answer nothing else; a per-event table would answer
"what were they doing at 19:42 on the 3rd" for the rest of the student's life.
That is the difference between a teaching tool and a surveillance record, and it
is a schema decision rather than a policy one -- the second table does not exist,
so no future read can be added to it. Asserted as an absence:

```
tables in public matching '%presence%': ['classroom_presence']
20 beats, 30 simulated seconds apart -> 1 row   (a history would be 20)
```

**No keystrokes and no content.** `classroom_presence_ping(uuid, boolean,
boolean)` is the whole write surface. There is no parameter through which a key,
a word, a selection, a scroll position, a URL or a duration can be sent, so none
of those can be stored by any caller including a malicious one. The signature is
asserted literally, because the guarantee IS the signature:

```
pg_get_function_identity_arguments -> "p_item_id uuid, p_typed boolean, p_page_visible boolean"
columns of type text -> ['student_email']   (the key, and nothing else)
```

**Nothing identifies a device.** No user agent, no address, no session id, no
fingerprint. Two students on one shared classroom machine are two rows because
they are two accounts, and that is the only distinction this table can make.

## What "active" means, defined once so nobody guesses later

`_classroom_presence_state_of(last_seen, last_input, page_visible, at)` is the
ONE definition. Four branches, in this order:

| state | condition |
| --- | --- |
| `away` | no heartbeat for 2 minutes |
| `open-elsewhere` | the last beat reported `document.visibilityState` hidden |
| `working` | an input event within the last 60 seconds |
| `viewing` | focused, visible, no recent input |

**AWAY IS TESTED FIRST AND THAT ORDERING IS LOAD-BEARING.** Every other state is
a claim the client made at `last_seen_at`. Once that stamp is stale the claim is
stale with it, so a row left at `page_visible = true` by a tab that was closed
would otherwise read as VIEWING forever. A stale claim must not outlive the
evidence for it. The migration's own self-check puts all four to the real
function at apply time and raises if the answers are not
`working,viewing,open-elsewhere,away`.

**A student with no row has never opened the assignment, and that is a fifth
thing rather than a fifth state.** There is no row to carry a state, so the
console renders it from the ROSTER side -- the roster-shaped-list rule from the
payload's end. It reads "Not opened" and carries no chip, because a chip would
put it in the same vocabulary as the four and it is not one of them.

## The four rules, each proved

### A student never sees another student's presence

An RLS policy, `classroom presence own row or instructor`, over
`_classroom_presence_can_read(item_id, student_email)`: the caller's own row, or
`classroom_can_review_submission(item, student)` -- 0086's existing gate, not
restated.

Proved with **both controls the prompt asked for, and a positive control against
each**:

```
the OWNER of the row      -> ['ana@boscotech.net']          (positive control)
a SIGNED-IN PEER          -> ['ben@boscotech.net']          their own row, and no other
the peer naming ana's row -> 0 rows
a student asking the RPC  -> null   (for their own section, and unscoped)
anon selecting the table  -> permission denied
```

The peer is a real classmate: same section, same assignment, their own row
present in the table. Without the owner control every absence would pass on a
policy that denied everybody, which is the shape a broken narrowing takes.

**Mutation proof, in the permissive direction.** The policy rewritten as
`using (true)` reddens **4 of 26** assertions in the boundary file -- the owner
control, the peer control, the peer's named read, and a different-section
teacher's table read. Restored from a copy and md5-verified; the file is
byte-identical and green.

**`_classroom_presence_can_read` is granted to `authenticated` on purpose**, and
is the only function in 0200 that is. A function named directly inside an RLS
`using` clause is evaluated as the QUERYING role, so revoking it breaks the read
instead of narrowing it -- the 0070 lesson 0109 writes down and 0137 carves
`is_teacher` and `_classroom_item_live` out for. Its body is SECURITY DEFINER, so
the gates it delegates to need no grant of their own.

**This table has a policy where `classroom_hall_passes` has none, and the
difference is deliberate.** 0143 shut its table completely because no client had
business reading a raw pass row. Here the subject of the row is entitled to the
row -- there is nothing in it they do not already know about themselves -- so the
own-row read is the ordinary RLS shape. What does not change is the WRITE side:
no insert, update or delete grant, no policy for any of them, so every write is
still a definer RPC that re-checks its caller.

```
role_table_grants on classroom_presence -> [{authenticated, SELECT}]   and nothing else
```

### Only the item's teachers of record and site admins

The dangerous shape is a teacher of a DIFFERENT section OF THE SAME COURSE
carrying THE SAME ASSIGNMENT, which is exactly what the fixture builds -- Period 3
is attached to the item by raw insert after authoring finishes, because
`classroom_set_assignment_spec` requires the caller to manage every posted
section and `teacher` could not have made that posting.

```
teacher of record, Period 1  -> ['ana', 'ben']
OTHER teacher, Period 1      -> null
OTHER teacher, Period 3      -> ['cruz']          (their own, the positive control)
OTHER teacher, off the table -> ['cruz']          the policy agrees with the RPC
teacher, unscoped            -> ['ana', 'ben']    never cruz
site admin, unscoped         -> ['ana','ben','cruz']
```

`classroom_manages_section` folds `is_admin()` in already (0082's definition does
it directly; 0138's rewrite keeps it), so "and site admins" needs no second clause
and no second definition.

**Defence in depth, verified by opening both layers.** The read has a section
gate, a posting-exists gate and a per-row `classroom_manages_section` in the join.
Opening only the row-level one reddens 1 assertion; opening all three reddens
exactly the 4 denial assertions and nothing else. That is the check CLAUDE.md asks
for -- a redundant check is not removed because a test did not notice it.

### `anon` can neither read nor write

Two independent refusals on the read (no grant, and the policy names
`authenticated`), and an explicit revoke on every function. A hosted Supabase
project's default privileges GRANT EXECUTE to `anon` on every new function and
`revoke ... from public` does not remove it -- the 0137 lesson -- and 0137 is a
one-time repair that covers nothing created after it, so every function in 0200
revokes for itself.

```
select, ping, state, purge as anon -> permission denied (4/4)
has_function_privilege('anon', ...) over 11 functions matching '%classroom_presence%' -> 0 true
```

The function count is asserted `>= 11` so a sweep that matched nothing cannot pass
as agreement.

### Retention: 90 days

**The default lives in exactly one place**, `_classroom_presence_retention()`,
and the migration header says so and says to change it there. Asserted as a
uniqueness property rather than as a value: exactly **1** non-comment line in the
file spells `interval '90 days'`.

```
purge(null) over 3 rows aged 91d / 89d / fresh -> deleted 1, retention_days 90
survivors -> ['ben', 'cruz']          the 89-day row is KEPT
purge(88)                             -> deleted 1, retention_days 88
purge as a teacher / as a student     -> 'Only site admins can purge classroom presence.'
purge(-1)                             -> 'A retention window cannot be negative.'
```

Both directions in one call, deliberately: "it deleted everything" must not be
able to pass for "it deleted the old ones", which is what a test counting only
survivors would allow.

**A purge nobody runs is a table with no purge**, and this project has no cron.
So there are two paths and one implementation
(`_classroom_presence_purge_before(cutoff, limit)`): the admin RPC is the
deliberate lever, and every heartbeat that actually WRITES sweeps at most 50
expired rows off the `last_seen_at` index. The sweep is **not scoped to the
pinging item**, which is the point of it -- a sweep that cleaned only its own item
would leave every assignment nobody opens again as a permanent record.

```
a row aged 200 days, a DIFFERENT student beating on the same item:
  throttled beat -> {throttled:true}, no `purged` key, stale row still there
  beat that writes -> {throttled:false, purged:1}, stale rows 1 -> 0
```

A throttled beat sweeping nothing is the design rather than a gap: the sweep rides
the path that already wrote, so nobody can drive repeated deletes by mashing the
heartbeat.

## The write rate is the database's rule, not the client's promise

The client beats at most every 30 seconds and only while visible. That is what it
does; it is not what makes it true. `classroom_presence_ping` refuses to write a
beat arriving inside `_classroom_presence_min_gap()` (20 seconds), answering
`{ok:true, throttled:true}` and touching nothing.

**Measured by beating as fast as a client possibly could** -- a tight loop with no
waiting at all, which is faster than any timer and faster than typing:

```
100 beats, no delay -> 1 row write, 99 throttled, all ok:true
                       table holds 1 row; active_seconds 0
60 beats at 1 simulated second apart -> 3 row writes
a throttled beat -> last_seen_at and active_seconds byte-identical before and after
```

**So the ceiling is 3 writes per minute per student per assignment, whatever any
client does**, including one written by somebody who wants it to write more.

**20 seconds and not 30, and the difference is jitter.** A 30-second browser timer
routinely fires at 29.6s after a round trip; a floor of exactly 30 would throttle
honest beats into silence and manufacture AWAY for a student sitting right there.

## The credit rule, and the cases where a naive counter over-counts

```
credit = least(now - last_seen_at, 2 heartbeats) when this beat reports BOTH
         typed and visible; 0 otherwise; and 0 on a first beat.
```

```
first beat                        -> 0     (no interval behind it)
typed + visible, 30s              -> 30
NOT typed, visible, 30s           -> 0     viewing is not working
typed + HIDDEN, 30s               -> 0     both flags are required
typed + visible, 45 MINUTES       -> 60    capped at two heartbeats
10 beats 30s apart, all working   -> 300
then 5 beats not typing           -> 300   the counter holds
```

**The 45-minute case is the one that matters.** A gap longer than two beats means
at least one beat did not happen -- the tab was hidden, the machine slept, the
network went -- so crediting the whole gap would count exactly the time the
student was NOT working, which is the one number this feature exists to get right.

**The typed-and-hidden case is why the AND is really an AND.** The hide report can
legitimately follow a keystroke: type, then switch tabs. Crediting that interval
would pay for the switch.

## The mirror, and why the numbers travel

`presenceState` in `$lib/classroom/presence/state.ts` reproduces
`_classroom_presence_state_of` branch for branch, including which comparison is
strict. CLAUDE.md sanctions a mirror precisely when the two are ASSERTED against
each other, which is the `docText` arrangement.

**It is needed because AWAY is a function of the clock, not of a write.** A
student who closes the tab writes nothing, so nothing arrives to make the console
re-read; a console printing the server's word would keep saying "Working" for a
whole poll interval after they left.

**But what keeps the numbers from drifting is not the test -- it is that they
travel.** `classroom_presence_state` returns this deployment's own windows in a
`limits` object and every client function takes a `PresenceLimits`. A change to
`_classroom_presence_input_window()` reaches the browser by being READ, not by
somebody remembering to edit a constant twice.

```
27-case corpus, one tick inside / exactly on / one tick outside each boundary,
at both visibilities, with input fresh / stale / absent, plus three corners
(no stamps, input in the future, seen in the future):
  disagreements between SQL and TypeScript -> []
  distinct answers reached -> all four
  a deliberately wrong mirror (>= for >, < for <=) -> caught
  PRESENCE_LIMITS_FALLBACK vs the deployed functions -> equal
```

The comparisons differ at exactly those boundaries, which is why the corpus is
built around them: a corpus of comfortable middles would agree with a mirror that
had both of them backwards. The case count and the answer-variety are both
asserted, so a corpus that generated nothing or that all came back `away` cannot
pass as agreement.

## `presence` is the fourth live topic, and it is the shut-table case again

Worth writing down because `responses` arrived one bundle earlier and the obvious
reading is that the newer topic follows the newer precedent. It does not.
`classroom_presence` DOES carry a select grant and a select policy, so unlike the
hall pass a client genuinely can read a row -- its OWN, which is exactly the wrong
row for a `postgres_changes` subscription. Realtime delivers a row event only to a
subscriber who could SELECT it, so a student's stream would carry their own
heartbeats and nothing else, while the audience for presence is the instructor.
The table is also not in `supabase_realtime`, and a row event would be a second
read path past `classroom_presence_state`'s roster join.

**And the notice is worth less here than anywhere else, which is stated rather
than left to be discovered.** Presence changes on a CLOCK as well as on a write.
The thing an instructor most wants to see -- somebody going away -- is precisely
the transition no notice can ever be sent for. So the poll is not a floor under
this feature, it is most of the mechanism, and `PRESENCE_POLL_MS` is 30 seconds
rather than `GRADING_POLL_MS`' 60. The notice only makes a student SITTING DOWN
immediate.

## The surface

In the roster, beneath each student's name: the state as a chip, when they last
worked, and their active time. Rasterized and read at both widths rather than
described.

**It is a `<span>` of text and adds no control at all**, which is why no density
class is declared and none may be: presence is information, not an action, and
the roster row it sits inside is already one 44px target. A chip that became a
button would need to clear 44px and would need this console to declare a floor it
deliberately does not have. Measured as an absence: 0 buttons, links or inputs
inside any presence line, at both widths.

**BENEATH the name rather than beside it.** The chip row above already carries up
to four chips (section, state, incomplete, changed); a fifth and sixth on the same
line would ellipsise the name at the pane widths this console actually runs at.
And it is a different question from all four of those -- they are about the WORK
and this is about the STUDENT.

**One defect found by the browser pass and fixed.** `--teal` on the chip's own
fill measured **4.48:1**, under the 4.5 floor:

```
on the chip fill (--bg2, rgb(34,46,34)):
  WORKING         6.00:1   --green
  VIEWING         4.48:1   --teal      <- FAILED
  OPEN ELSEWHERE  4.60:1   --amber
  AWAY            5.51:1   --text-2
```

`--bg2` is the LIGHTEST of the three portal grounds, which is exactly what the
register's accents are not tuned against -- the same arithmetic that makes `--dim`
clear only `--bg0`. The fix is the `--acc-ink` rule rather than a token move: the
IDENTITY is never moved to pass a contrast check, the DERIVED INK moves, and it
moves in LIGHTNESS ONLY. `--pchip-viewing-ink` is `--teal`'s own hue (145deg) and
saturation (44.9%) at 52% lightness instead of 44.1%, which re-measures **5.94:1**.
`--teal` itself does not move: other surfaces read it on darker grounds where it
already clears, and raising the token would repaint all of them to fix one.

**Amber's 4.60 is a pass and it is a thin one.** Left alone, because correcting a
passing value is churn -- but it is written into the component beside the table,
because anything that lightens that fill moves it under.

**The coverage sentence moved, and the position is a measurement.** Rendered under
the roster heading it was separated from the rows it qualifies by the close tool
and the whole export panel -- about 200px at 1440 and a screenful at 375, seen in
the raster. A caveat that is not on screen beside the number it qualifies is a
caveat nobody reads, so it now sits immediately above the first row. Not a tooltip
per row, for the same reason from the other end: a sentence a reader has to hover
thirty times is one they read zero times, and a phone cannot hover.

It reads: *"Counted only while this assignment is open and being typed in.
Thinking, reading and working on paper do not add to it."* Rendered
unconditionally whenever the region is, zero included -- the
`FOUNDRY_PLAY_COVERAGE_NOTE` argument, and stronger here: a Foundry play count
that undercounts costs a student nothing, and a working-time figure read as effort
can cost them a conversation they did not earn. The browser spec asserts it must
NOT contain "time on task" or "effort", which are the phrases this number is most
likely to be mistaken for.

**Absence is structural.** A console handed no presence transport draws no
presence anywhere -- 0 lines, 0 chips, 0 notes, against 5, 4 and 1 on the
identical fixture -- while the roster itself is unchanged at 5 rows. That is not
cosmetic: a deployment before 0200 has no `classroom_presence_state`, and a
console that drew the region anyway would tell an instructor that every student
was AWAY when the truth is that nobody asked. A confident false statement about a
child, on the surface a teacher acts from.

## THE ONE WIRE NOT MADE, AND IT IS THE FEATURE'S OWN

**`PresenceHeartbeat` is not mounted on the student's item page, so nothing writes
a presence row in production yet.**

`src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte` is not in this
bundle's declared paths, and ledgers 0147 through 0151 were running in parallel
with an instruction to touch none of their files -- 0141 and 0142 both wired that
page recently, so editing it would have raced a lane that cannot see this one.
Everything else is built and proved: the migration, both RPCs, the retention, the
pure modules, the instructor surface, and the heartbeat itself driven through the
real component in `tests/dom/` and through the in-memory twin on `/dev/presence`.

**The wire is two lines**, in that file:

```svelte
import PresenceHeartbeat from '$lib/classroom/presence/PresenceHeartbeat.svelte';
import { createPresenceBeatTransport } from '$lib/classroom/presence/transports';
...
<PresenceHeartbeat send={createPresenceBeatTransport(data.supabase, data.item.id).ping} />
```

It belongs in a bundle that owns that file. **And that bundle owes the
`classroom-updates.json` entry**, which this one deliberately does not write: no
entry is owed here because nothing a student sees or does has changed, and the
moment the heartbeat mounts is the moment students start being measured, which is
exactly the kind of thing the standing directive exists to tell them about.

## What is NOT verified

- **The migration was NOT applied.** This container cannot reach the production
  database. Every measurement above is against a real embedded Postgres with the
  real migration files applied unmodified, seeded through the real pre-0200 RPCs.
- **No signed-in production surface was opened.** The browser pass drives `/dev`
  routes only.
- **No student has ever sent a heartbeat**, because of the unmade wire above. The
  ping path is proved against the real RPC from a real enrolled student's session
  in `tests/db/`, and the client half against the real component in `tests/dom/`,
  but the two have never met over a network.
- The harness blocks non-loopback requests, so text is measured in the FALLBACK
  font stack, and `prefers-reduced-motion` is `no-preference`, so that path is not
  exercised.

## A migration-numbering hole this branch surfaces and cannot close

`tests/db/migration-0177-tombstone.test.ts` reports **0199 as a hole nothing
accounts for**, and that is a true report rather than a defect in this bundle.
The prompt allocated `0200` -- numbers are allocated by the router chat, never
derived by a session -- and `0199` belongs to a lane whose ledger entry has not
been pushed. `node tools/migration-claims.mjs` confirms it: `0200` is registered
`[file+ledger]` to this branch, and nothing anywhere claims `0199`.

It goes green the moment that lane pushes its entry, which the ledger's own rule
makes its FIRST commit. **Renumbering to 0199 would be a session overriding the
allocator**, which is the exact failure the `Claims:` line exists to prevent, and
would collide with whatever is already holding it uncommitted. Left as it is, and
named here so the next reader does not go looking for a fault in 0200.

## Deferred, deliberately

- **A unit-wide or cross-section presence view.** `classroom_presence_state`
  already takes a null section meaning "every section of this item I manage",
  which is what a cross-section console would need, but no surface calls it that
  way yet -- the grading route passes its own section.
- **Anything that turns a duration into a consequence.** Nothing here reads,
  writes or references `coin_transactions`, and `active_seconds` is in no rubric,
  no FACTS CSV and no grades tally. 0143 says this about the hall pass and the
  reason is stronger here: the moment a clock pays or charges a student
  automatically, presence stops being a teaching signal and becomes a meter, and a
  student whose incentive is to look busy will look busy.
- **Telling students they are measured.** They can read their own row -- the RLS
  policy admits the subject deliberately -- but no surface shows it to them, and
  `PresenceHeartbeat` renders nothing on purpose, because a widget saying "you are
  being timed" changes the thing it measures. Whether and how a class is TOLD is
  Mr. Pina's decision, not a rendering one, and it is the question the wiring
  bundle should put to him.
