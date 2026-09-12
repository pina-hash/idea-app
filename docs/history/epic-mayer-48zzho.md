---
title: "The presence heartbeat is mounted: something writes a presence row now"
date: 2026-09-12
branches: ["claude/epic-mayer-48zzho"]
migrations: []
subsystems: ["classroom"]
---

Ledger 0152 built the whole presence system on 2026-09-11 and deliberately left
one wire unmade. Its own history entry says so under a heading of its own -- THE
ONE WIRE NOT MADE, AND IT IS THE FEATURE'S OWN -- names the file, quotes the
expression, and explains that ledgers 0147 through 0151 were running in parallel
with an instruction to touch none of their files. So the migration, both RPCs,
the retention sweep, the pure modules, the mirror, the instructor surface and the
heartbeat component all shipped and were proved, and **nothing anywhere wrote a
`classroom_presence` row**. The grading console has been reading an empty table
for a day.

This bundle is that wire, six lines of code, and everything else here is the
measurement 0152 could not take because there was no client on the other end.

## The wire, and the one thing 0152's own expression did not have

0152 wrote the edit out verbatim:

```svelte
<PresenceHeartbeat send={createPresenceBeatTransport(data.supabase, data.item.id).ping} />
```

What shipped is that, with a gate and a key:

```svelte
const presenceBeat = $derived(
    data.engine ? createPresenceBeatTransport(data.supabase, data.item.id) : null
);
...
{#if presenceBeat}
    {#key data.item.id}
        <PresenceHeartbeat send={presenceBeat.ping} />
    {/key}
{/if}
```

**`data.engine` IS THE GATE, AND IT IS THE DATABASE'S OWN POPULATION SPELLED IN
THE PAYLOAD.** The item route's load builds `engine` in exactly one branch --
`item.kind === 'assignment'` AND NOT `canManage` -- and
`classroom_presence_ping` resolves its subject through
`_classroom_engine_student`, which raises for a material, for an unpublished item
and for anybody not actively enrolled. The two therefore agree by construction:
every page that mounts the heartbeat is a page whose beats the RPC accepts.
Asking `kind === 'assignment' && !canManage` at the mount would have been that
same condition written a second time, thirty lines from the branch that already
decided it.

**WHICH IS ALSO WHAT KEEPS A TEACHER OUT OF THE TABLE.** 0138's finding is that
instructors enroll themselves to see a class the way a student does and roster
imports sweep them in, so a manager reading this page WOULD satisfy 0086's
enrollment gate and would acquire a presence row about themselves. Nothing in
`classroom_presence_ping` refuses them -- the gate it delegates to is about
enrollment, not about management. Absence is what prevents it: a manager's page
derives no transport, so there is nothing to send with. `classroom_presence_state`
would have dropped the row from the console's projection anyway (it reaches its
rows through the roster, and `splitRoster` drops a manager), which is exactly why
this needed saying: the row would have existed, been invisible, and been about a
member of staff.

**THE KEY IS LOAD-BEARING AND WAS NOT IN 0152'S EXPRESSION.**
`PresenceHeartbeat` reads every prop ONCE, inside `onMount`, and says so in its
own header ("a remount is what a changed transport should cost"). A client-side
navigation from one assignment to the next in the same class re-runs this load
WITHOUT remounting the page, so without `{#key data.item.id}` a student who
clicked through to the next item would go on beating under the previous
assignment's id -- silently, with the beats still landing, on the wrong row.

Measured rather than reasoned, against the real component with a genuinely
reactive `$state` prop:

```
mount with transport A                 -> A gets the first beat
swap the `send` prop to B, flush       -> B gets nothing
wait 250ms with a 50ms heartbeat       -> A keeps beating (positive control)
beats delivered to B                   -> 0
remount                                -> B gets the first beat immediately
```

**THE FIRST VERSION OF THAT TEST WAS VACUOUS AND A MUTATION IS WHAT CAUGHT IT.**
It swapped the prop and then dispatched `input` and `visibilitychange`. In
happy-dom `document.visibilityState` is `visible` and stays visible, so
`noteVisibility(true)` returned early; `noteInput` records an instant and sends
nothing by design. **No beat was emitted at all**, and "nothing reached the second
transport" passed because nothing reached anything. A `PresenceHeartbeat` mutated
to re-read `send` reactively passed it too. The fix is to force a beat through
the component's own `setInterval` by handing it a 50ms `heartbeatSeconds` -- a
real prop, driving the real timer -- and to assert that the FIRST transport kept
receiving, which is the positive control the first version lacked.

## The client write rate, measured for the first time

0152 measured the DATABASE half: a hundred beats in a tight loop produce one row
write, because `classroom_presence_ping` refuses anything inside
`_classroom_presence_min_gap()`. The CLIENT half had never been measured, and it
is the half the "do not add a client throttle" decision rests on.

**Two simulated minutes of continuous typing**, driven through the REAL
`PresenceHeartbeat` class against the REAL `0200` functions on a real embedded
Postgres (PostgreSQL 17.10, `_classroom_presence_min_gap()` read back as
`00:00:20`). A keystroke every 250ms -- 240 a minute, faster than anybody types --
and the timer ticking once a second, thirty times more often than the component's
interval actually fires:

```
keystrokes                    480
timer ticks                   120
beats the client sent           4
row writes                      4
throttled by the database       0
rows in the table               1
active_seconds                 90
```

**120 keystrokes per write, and the database's floor never fired once.** That is
the whole argument for not adding a client throttle: the component beats at 30
seconds, the database refuses inside 20, so the client is ALREADY the wider of
the two and a third limit could only narrow the REQUEST count -- the WRITE count
is the database's to decide and it was never in reach.

**The other direction, same two minutes, a client with no rate rule at all**
(one beat per keystroke, sent straight at the RPC):

```
beats sent                    480
row writes                      7      (120s / 20s, plus the first beat)
throttled by the database     473
rows in the table               1
```

So the real client makes 4 requests where that one makes 480, and the database
writes 4 rows where it would have written 7.

**`active_seconds` IS 90 IN THE FIRST CASE AND 120 IN THE SECOND, AND THE LOWER
ONE IS NOT WORSE.** Both are correct answers at their own resolution: 30-second
intervals credit three of them over two minutes, 20-second intervals credit six.
The first beat credits nothing in either -- there is no interval behind it -- which
is why two minutes of solid typing is 90 seconds and not 120. Nothing about the
counter argues for beating faster; the finer number costs 120 requests for every
one the real client makes.

**The same measurement runs permanently in `tests/dom/`**, through the real class
and `createMemoryPresence`, whose throttle and credit rule are the database's.
The two agree case for case, which is what makes the committed one worth having:
the database measurement above was a scratch file, run once and deleted, because
`tests/db/` is not this bundle's surface.

## A student never sees another student's presence: the client half

0152 proved this at the database with an anonymous control and a signed-in peer
control against the real RLS policy. What no policy can answer is what the
student's own page PUTS ON SCREEN, and now that the page mounts something, that
is a question with an answer.

Both mounts are in one test, on the same peer rows, so the control cannot quietly
stop running:

```
the student's mount (PresenceHeartbeat, the only thing the route adds):
    presence lines            0
    presence chips            0
    never-opened lines        0
    coverage notes            0
    elements of any kind      0        innerHTML is the empty string
    'ben@boscotech.net'       absent
    'Ben Okafor'              absent
    'ana@boscotech.net'       absent   their OWN row is not shown either
    beats sent                1        (the mount is alive)

the instructor's mount (the REAL GradingConsole, identical peer rows):
    presence lines            2
    presence chips            2
    'Ben Okafor'              present
    'Cruz Delgado'            present
```

The student's own row is absent too, and that is the design rather than an
oversight: 0200's policy admits the subject of the row deliberately, and what
this page declines to do is put it on screen while they work.

**Mutation proof, in the permissive direction, restored from a copy and
md5-verified** (`git checkout --` is a discard-to-HEAD and was not used):

| mutant | reddens |
| --- | --- |
| `PresenceHeartbeat` renders a peer's chip and name | 2 assertions (`renders nothing at all`, and the peer sweep) |
| `PresenceHeartbeat` re-reads `send` on every beat | 1 (the swap test, on its positive control) |
| `createMemoryPresence` stops applying the 20-second floor | 1 (the no-rate-rule arm) |

The third one reddens only ONE of the two write-rate arms, and that is a true
reading rather than a weak test: in the real-client arm no beat is ever throttled,
so removing the throttle changes nothing there. The real client never touches the
database's floor.

## The browser spec that raced its own fixture

Ledger 0168 DOM-probed `tools/browser-verify/routes/presence-presence-off.mjs`
and reported that `.roster-row` goes 0 to 5 between roughly 300ms and 700ms after
load while the spec carries no wait. `measured/presence-presence-off.json`
recorded the consequence: one row outside threshold, "the roster itself,
unchanged", on byte-identical code.

`GradingConsole` calls `loadGrading` from an effect, and `waitForApp` returns on
DOM STABILITY -- which this page reaches while the console is still empty. Paint
is not the payload. Both presence specs now carry a `prepare` step waiting for
five rows, and the wait is REPORTED, which is what makes the diagnosis visible
rather than assumed:

```
/dev/presence?presence=off  @375   prepare-wait  1085ms, predicate satisfied
/dev/presence?presence=off  @1440  prepare-wait   358ms, predicate satisfied
/dev/presence               @375   prepare-wait   211ms, predicate satisfied
/dev/presence               @1440  prepare-wait   260ms, predicate satisfied
```

**1085ms at 375px is well past the 700ms window 0168 observed**, which is exactly
why that spec was reading `present 0`.

`presence.mjs` had the identical latent race and is fixed in the same breath --
it fails LOUDLY when it loses (five expected, zero found) where the off spec
fails quietly against its own zeros, but it is the same missing wait.

**A longer `settleMs` is the wrong fix** and `waitUntil`'s own header says why: a
fixed timeout measures an empty page the day the payload gets slower. The
predicate waits for FIVE rows and not one, because a predicate satisfied by a
partial render would defeat the one thing this spec exists to distinguish -- "the
region was removed" from "the console never rendered".

One `verify:readme -- --route presence`: 4 runs, 52 measurements, 0 outside
threshold, 8.4s. The store now holds **196 specs, 392 runs, 6854 measurements, 0
outside threshold** -- that flake was the only outstanding finding in it.

## What is NOT verified

- **Nothing was applied and nothing needed to be.** This bundle carries no
  migration. `0200` was applied by ledger 0152 and this container cannot reach
  the production database to confirm it: `IDEA_MIGRATION_URL` and
  `DEPLOY_PROBE_URL` are both unset, so the applied set is CANNOT SAY and never
  "applied".
- **No student has ever sent a heartbeat over a network.** The ping path is
  proved against the real RPC from a real enrolled student's session in
  `tests/db/` (0152's files, plus the scratch measurement above), and the client
  half against the real component in `tests/dom/`. The two have still never met
  over a wire -- what changed is that they now can.
- **No signed-in production surface was opened**, and the browser pass drives
  `/dev` routes only. The first real confirmation is Mr. Pina opening an
  assignment as a student and a presence row appearing on the grading console.
- The harness blocks non-loopback requests, so text is measured in the FALLBACK
  font stack, and `prefers-reduced-motion` is `no-preference`.

## Deferred, deliberately

- **THE LIVE NOTICE, AND THE REASON IS ARITHMETIC.** `live.ts` says the notice
  "only makes a student SITTING DOWN immediate", and `GradingConsole` already
  subscribes to the `presence` topic -- nobody has ever sent one. But
  `PRESENCE_POLL_MS` is 30 seconds and the heartbeat is 30 seconds, so a notice on
  a PERIODIC beat tells an open console exactly what its own next poll was about
  to, at a cost of one broadcast per student per beat: thirty students would turn
  a 30-second poll into a continuous re-read. What earns its place is a notice on
  the FIRST beat and on the return from hidden, which are the two that are news --
  and `announce` fires after EVERY beat `PresenceHeartbeat` emits, so that is a
  change in `heartbeat.ts`, which is 0152's surface and not this bundle's. Left
  unwired rather than wired wastefully, and written into the route beside the
  mount so the absence does not read as a forgotten prop.
- **Telling students they are measured.** 0152 deferred it and this bundle is the
  one that makes it live, so it is now a real question rather than a hypothetical
  one. `classroom-updates.json` is the student-facing answer and this bundle
  drafted its entry; whether and how a class is told beyond that is Mr. Pina's.
- **`limits` on the student side.** A student never calls
  `classroom_presence_state`, so there is nothing to learn this deployment's real
  windows from; the component's `PRESENCE_LIMITS_FALLBACK` is what it uses, and
  the mirror test pins that constant equal to the deployed functions. Threading
  the real values down would mean giving the student a read they do not otherwise
  have, to move a number the database's own floor already bounds.

## Reported, not fixed -- outside this bundle's surface

- **`CLAUDE.md`'s `svelte-check` baseline is stale by two.** It states 0 errors,
  40 warnings in 22 files, breaking down as 34 `state_referenced_locally` / 5
  `css_unused_selector` / 1 `perf_avoid_nested_class`. Measured on
  `origin/integration` at `3728698` with `.env` present and after
  `svelte-kit sync`: **0 errors, 38 warnings in 21 files, 32 / 5 / 1**. The drift
  is entirely `state_referenced_locally`, 34 to 32 -- fewer, not more. Ledger 0168
  measured 38/21 and reported the same gap for the same reason; that file is not
  this bundle's to edit, and the same number has now been reported by two
  consecutive bundles.
- **No ledger entry `0169` exists on any remote ref**, so the
  `classroom-updates.json` draft this bundle was asked to improve could not be
  found and the entry below is written from scratch. Checked across every
  `refs/remotes/origin/*`: nothing numbered 0169 through 0172 is anywhere, and
  `origin/main` and `origin/integration` are the same commit.
