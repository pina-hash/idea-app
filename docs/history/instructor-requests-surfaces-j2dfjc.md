---
title: "Five instructor requests, four built: the 11:59pm due default (which forced the due field into two boxes), Spotify-only song links validated before the charge, spam as a fourth feedback status, and one word plus one attribute separating Edit from Instructor tools (`claude/instructor-requests-surfaces-j2dfjc`, migration 0186)"
date: 2026-09-06
branches: [claude/instructor-requests-surfaces-j2dfjc]
migrations: ["0186"]
subsystems: ["IDEA Classroom", "IDEA Coin economy", "Feedback", "Browser harness", "Testing"]
---

Prompt 0069. Five items from the 2026-09-05 feedback pull, all instructor requests
rather than defects. Four built, one declined with the question that would settle
it. Started from `origin/integration` at `13d1747`.

## What was asked, and what each turned out to be

1. **An assignment's due time should default to 11:59pm.** Built. It turned out
   not to be a one-line default.
2. **Class music links should be restricted to Spotify.** Built, in the database,
   at request time.
3. **The feedback console needs a way to delete a false or spam report.** Built as
   a fourth STATUS rather than a delete.
4. **A page needs sorting by date.** DECLINED. The prompt included it with no
   target on purpose; the audit found six candidate lists and no way to choose.
5. **The Edit control and the instructor-tools dropdown are confusable.** Built:
   one word and one attribute.

## 1. The due-time default, and why it forced the field into two boxes

The composer seeded `due` from `isoToLocalInput(item?.due_at ?? null)`, which for a
new assignment is the empty string. So the default today is ABSENT -- not midnight,
not anything. `dueToSend` is the only other reader, plus the create reset and the
markup; nothing else in the file touches it.

**The obvious fix does not exist.** A default time has nowhere to live on a single
`<input type="datetime-local">`, and this was MEASURED in the harness Chromium
(141.0.7390.37) rather than reasoned about. With only the date segments filled:

* `input.value` is the EMPTY STRING;
* `input.validity.badInput` is `true`;
* NO `input` and NO `change` event has fired;
* and assigning a date-only string (`el.value = '2026-09-10'`) leaves the value
  empty, because a date is not a valid datetime-local.

A partially filled control therefore reports nothing at all to the page. There is
no event to hang "now fill the time in as 23:59" on and no state to read it from.
The only place a default could sit on one input is its INITIAL value, which would
mean seeding every new assignment with a due DATE nobody chose -- inventing a
deadline instead of defaulting a time.

So the field is a `type="date"` box plus a `type="time"` box, joined by
`src/lib/classroom/due-default.ts`. The date starts empty and the time starts at
`23:59`. **This also fixed the quieter half of the same defect**, which nobody
reported and which the measurement above is the explanation for: an instructor who
filled in the date and tabbed away got NO DUE DATE AT ALL, silently, because the
value never became valid.

* `due` is still the `datetime-local` string every other line in the file speaks;
  it is `$derived` from the two new pieces of state, so `dueToSend`, the reset and
  the draft signature are untouched.
* **Nothing already stored moves.** `splitDueInput` cuts the exact string
  `isoToLocalInput` produces and `joinDueInput` puts it back identically, which is
  what keeps `dueToSend`'s untouched-field rule -- and therefore the "Updated"
  badge -- working. Asserted as a round trip over nine generated stamps including
  both sides of a DST transition.
* **A cleared time falls back to 23:59, never to midnight.** Midnight moves the
  deadline to the START of the day printed beside it: a full day early, rendering
  identically. A deliberately typed `00:00` is kept.

### The time zone, which the prompt was right to ask about

**11:59pm resolves against the BROWSER's local zone, and this bundle changed
nothing about that.** `localInputToIso` is `new Date('<wall clock>')`, a
zone-less string parsed in the running browser's zone, and a defaulted 23:59 goes
through it exactly as a typed 23:59 always has.

Pinning it to `America/Los_Angeles` was considered and refused. The school's day IS
that calendar -- it is what `laCalendarDay` adjudicates a check-in against -- but a
default forced into Pacific would put a number in the box that is not the number
being stored for any instructor whose machine is set to anything else, and the
field they are reading would be lying to them. **A time zone is a property of the
whole due-date field, not of its default**: fixing it means changing
`localInputToIso` and `publish_at` beside it, which is its own bundle with its own
answer for every stored stamp. On a school machine the two are the same instant.

## 2. Spotify only, and the coin question the prompt asked

**A student cannot lose coins to a refused song link today, and cannot after this
bundle either.** `0145` validates the URL at REQUEST and charges at APPROVAL, so
the ordering was already right; this file added the new rule to the same block the
existing `bad_url` refusal sits in, above the capacity check, the lock and the
insert. A refused link never becomes a row, `classroom_song_approve` takes a
request id, and a refusal never mints one.

### The narrowing that was NOT written, and why it would have cost something

`classroom_song_requests.url` carries
`check (... and public._classroom_song_url_ok(url))`. A CHECK is not re-validated
against rows already stored, **but it IS re-evaluated on every UPDATE of a row** --
and `classroom_song_approve` UPDATEs the row it is approving. So narrowing
`_classroom_song_url_ok` would have left every already-pending non-Spotify request
in a state where pressing Approve raises a constraint violation instead of refusing
in words: a raise, from inside the one function in this schema that moves a coin, in
front of an instructor working a queue. The charge rolls back with the transaction,
so no coin is lost -- but a SQLSTATE reaching a person is exactly what `0145`'s
refusal vocabulary exists to prevent.

So `_classroom_song_url_ok` is untouched, the constraint is untouched, and the
policy question is its own predicate, `_classroom_song_url_is_spotify`, asked in
the request path only. Two questions, two functions. Pinned both ways: the test
seeds a legacy YouTube request through the real pre-0186 RPC, applies the migration
over the top, and approves it -- it must still charge 2i¢.

### What counts as Spotify

Deliberately generous, because a restriction that refuses a link a student
legitimately pasted teaches them only that the platform is arbitrary. Accepted:
`spotify.com` and ANY subdomain of it (`open.`, `play.`, `www.`), plus
`spotify.link` and `spoti.fi`, with any path, query or fragment -- so `/track/`,
`/album/`, `/playlist/`, `/artist/`, `/episode/`, `/show/`, the `intl-<lang>` path
prefix, `?si=` and `?utm_source=copy-link` all pass without being looked at.

Refused, each for its own reason: other services; and the LOOKALIKES, every one of
which contains the literal string `spotify.com` --
`https://open.spotify.com@example.net/`, `open.spotify.com.example.net`,
`notspotify.com`, `spotify.com.br.example.net`. **The authority is parsed, not
searched**: the pattern allows only `[a-z0-9.-]` up to the first `/`, `?` or `#`,
so a userinfo `@` cannot appear in it. A `like '%spotify.com%'` would have accepted
the first of those.

`spotify:track:<id>`, what the desktop app's right-click copies, is refused ONE
STEP EARLIER by `_classroom_song_url_ok` because it is not https. The new sentence
names it anyway: a student holding one needs to be told which of the two things to
copy, not told again that their link is wrong.

### The surface says the rule before the paste

A rule a student meets only by being refused is a rule nobody told them, and the
refusal arrives after they have already gone and found a link. So the compose card
says "Paste a Spotify link" and the field is labelled "Spotify link" with a real
share URL as its placeholder. **This is copy, never a gate**: nothing in `src/`
reads a URL, and `tests/classroom-song-queue-surface.test.ts` now sweeps for the
shape of the mention rather than for its absence (see below).

## 3. Spam is a status, and the export stays honest

`app_feedback` has no DELETE grant and no DELETE policy for anyone, and `0085` is
explicit that the status column does not break `0053`'s append-only stance because
nobody edits what a person wrote. A delete would break exactly that. A spam report
is also EVIDENCE: `reporter_hash` exists to be counted (`0126`), and a run of spam
from one address is what that count is for -- deleting the rows deletes the pattern.

So `spam` is a fourth value of the status column, moved through the same
`app_feedback_set_status` as every other state.

**The undo needed no machinery at all.** Every row renders a button for every
status it is not currently in, so a report marked spam carries New, Seen and
Resolved -- the reversal is the same control in the same place. There is nothing to
restore FROM, because nothing was destroyed.

**Nothing is hidden by it, which is what keeps Mr. Pina's export honest.** The
console's `all` filter still means every status, literally, and the export header
still prints `status: <filter>` verbatim. What makes the feature work is only that
the console opens on `new`, which it already did. The alternative -- redefining
`all` as "everything except spam" -- would have made a header saying `status: all`
a false statement about the bundle beneath it, which is the failure the prompt named.

**Every status control is derived from one array.** Adding `spam` touched
`STATUSES` and nothing else: the per-row buttons, the bulk bar and the filter tabs
all read it, and the per-status counts were generalized off it in the same change
(they had been three hand-written keys, the second place a fourth status would have
had to be remembered).

The chip is `--amber`, not `--crimson`: `--crimson` is reserved for live/rec/error
and a spam report is neither an error nor an identity. Measured on the row's own
ground rather than assumed.

## 4. Sorting by date -- DECLINED, with the question

The prompt included this without a target on purpose. Six instructor-facing lists
carry a date, and none is obviously "the page":

| Surface | What it orders by today | Date control? |
| --- | --- | --- |
| `/classroom/feedback` console | `created_at desc` from the RPC; a from/to date FILTER exists | no direction control |
| Grading console roster | student display name (`grading-bulk.ts`) | none, though rows carry a hand-in time |
| `GradesPanel` | awaiting count, then `due_at desc` as a tiebreak | none |
| `SongQueue` decided list | `decided_at desc` | none |
| `RevisionHistory` | newest first, ties by revision | none |
| `ClassView` stream | pinned, then unit and `sort_order` | none |

**The question that would settle it:** *which list were you looking at when you
wanted to sort it by date, and what did you want at the top -- the newest, or the
oldest?* The second half matters as much as the first: the feedback console and the
revision list are already newest-first, so "sort by date" on either can only mean a
direction control, whereas the grading roster is sorted by NAME and "by date" there
means a different key entirely. Building the wrong one of those is worse than
building neither, because it puts a control on a page that nobody asked to change.

## 5. Edit vs Instructor tools: one word and one attribute

They sit in the same strip (`.insp-head` in `ItemDetail.svelte`), are the same
size, and **both open a panel below it** -- and "Edit" said neither which of the two
panels it opens nor what it edits, so the pair read as two halves of one thing.
Neither the toolbar nor the layout was touched:

* **"Edit" became "Edit post."** The toggle names a collection of tools; this names
  the thing on the page.
* **`aria-expanded` + `aria-controls`**, pointing at a DIFFERENT region id, so the
  two are announced as controlling two regions rather than as two unlabelled
  buttons in a row.

### Which found a dangling reference, including one that was already there

The `aria-controls` I added named `#item-edit-direct`, which only rendered
`{#if editable && (alsoIn.length || editing)}` -- so until somebody pressed Edit it
pointed at nothing. The browser pass reported it (`Edit names no real region`),
which is what that probe is for. The region is now always in the document when the
control is, and `hidden` when empty, which is `$lib/Disclosure`'s own answer and
costs no box.

**The Instructor tools toggle had been doing the same thing all along.**
`#item-inspector-body` is inside `{#if inspectorOpen}`, so a collapsed toggle named
an element not in the document. It takes the OTHER fix -- the attribute is emitted
only while the region exists -- and the difference is cost, not taste: that region
is the whole inspector (deck panel, check-in manager, rubric builder, spec importer,
revision history, each with its own effects and transports), and mounting all of it
hidden on every item page a manager opens is a behaviour change well past what this
item asked for.

## The migration

**`supabase/migrations/0186_song_spotify_and_feedback_spam.sql`**, one file, both
halves. `_classroom_song_url_is_spotify` (revoked from every client role),
`classroom_song_request` replaced at its identical signature with one block
inserted, the `app_feedback_status_check` constraint replaced with the four values,
and `app_feedback_set_status` replaced with the fourth value in its guard.

Its self-check puts fifteen real share-link forms and twelve refusals through the
new predicate at apply time, rather than reading the function's source back --
which would only prove the text landed.

**It was NOT applied to the live project, and could not have been from here:
`IDEA_MIGRATION_URL` is not set in this container at all.** No connection was
opened. `tools/apply-migration.mjs` would have refused it in any case -- its probe
is derived from `origin/main`, and a migration sitting only on a `claude/**` branch
gets no probe, which is correctly read as a refusal rather than a pass. The path is
listed at the end of the session report for pasting into the SQL editor.

**`docs/migrations-applied/` does not exist anywhere in this tree** -- not on this
branch, not on `origin/main`, and nothing in `CLAUDE.md`, `docs/` or `tools/`
mentions it. Since the file was not applied, no record under it was due; a session
that DOES apply this file will have to create that directory rather than add to it.

### Deploy ordering, which is not symmetric between the two halves

**Neither half names a new RPC parameter, so there is no ordering that BREAKS
anything** -- both functions are replaced at their identical signatures and the
signature trap does not apply. But the two halves degrade differently against a
backend that has not had `0186` applied yet, and that is worth knowing:

* **The Spotify half is inert.** `classroom_song_request` never answers
  `not_spotify`, so the surface says "Spotify only" while the database still
  accepts any https host. A student is told a rule that is not being enforced --
  which is a wrong sentence, not a broken one.
* **The Spam half is VISIBLY refused.** `app_feedback_set_status(id, 'spam')`
  raises `Status must be new, seen or resolved.` on a pre-0186 backend, the route
  returns it as `{ok:false, message}`, and the console renders it as an error where
  the admin is working. Nothing is written and nothing is lost -- but the Spam
  button does not work until the file is applied, and the sentence it shows names
  exactly why.

So the file should be applied BEFORE this branch reaches production, and if it is
not, the failure is legible rather than silent in both directions.

**Because it is one file, a database missing EITHER subsystem cannot apply it**,
and both test chains say so in a comment rather than working around it: the song
test carries `0053`/`0085`, the feedback test carries the coin files and `0145`.
Either subsystem missing is a failed apply that rolls back whole.

## What was measured

* **`svelte-check`: 0 errors, 37 warnings**, re-derived with the two
  `PUBLIC_SUPABASE_*` placeholders exported before `svelte-kit sync` (a checkout
  with no `.env` reports 13 phantom errors here, not the 11 CLAUDE.md records --
  worth knowing, and not a regression: they are all
  `has no exported member 'PUBLIC_SUPABASE_URL'`/`_ANON_KEY` in files no change
  touched, and they clear entirely with the placeholders).
* **`npm run verify:browser -- --route instructor-requests`: 64 measurements at
  375 and 1440, 0 outside threshold**, after the two findings above were fixed.
  Due date box 92.1x58.2 at 375 and 207.1x58.2 at 1440; due time 68.2 and 153.4
  wide, same height; four status buttons at 69.6x44; five tabs at 73.1x44; Edit
  post 121.5x44; the toggle 302.6x44 and 558.2x44. Contrast: the due legend and
  the part labels 6.91:1, the Spotify sentence 7.27:1, the status chip 6.68:1, the
  Instructor tools label 7.66:1, Edit post 14.07:1. 0px horizontal overflow at
  both widths, 0 console errors.
* **The charge-path positive control.** `tests/classroom-song-queue-spotify.test.ts`
  replaces `_classroom_song_url_is_spotify` with `select true` on a throwaway
  database -- the feature switched off, nothing else moved -- and drives the same
  refused YouTube link through request and approve. The balance moves by the full
  2i¢. So "unchanged" in the test beside it is the rule holding rather than the
  measurement being blind.
* **A mutation control on the client-side sweep.** A mirrored host rule
  (`new URL(u).hostname.endsWith('spotify.com')`) added to `song-queue.ts` reddens
  `the client names Spotify only in copy, never in a condition`; the file was
  restored from a `cp` copy and md5-checked identical (`493fc0a3...`).
  `git checkout --` was not used anywhere in this session.
* **The constraint control.** `tests/db/feedback-delete-is-a-status.test.ts` drops
  `app_feedback_status_check` on a throwaway database and confirms `'archived'`
  then lands -- so "refused" in the assertion above it is the constraint working
  rather than the write never happening. It also confirms the RPC's own guard
  still refuses with the backstop gone, which is what defence in depth has to mean.

### One instrument defect found and fixed while writing a test

The no-delete probe was written as
`prosrc ~* 'delete\s+from\s+public\.app_feedback\y'` inside a JS template literal.
**An unrecognised escape in a template literal is kept as the bare letter**, so
`\s` reached Postgres as `s`, the pattern became `deletes+froms+public.` and
matched nothing -- reporting a clean result. The positive control beside it (the
same probe must FIND `app_feedback_submit`, which legitimately deletes from
`app_feedback_rate`) is what caught it. That control is also why the word boundary
is there at all: an `ilike '%...app_feedback%'` matches the rate table.

## Generalized, not deleted

`tests/classroom-song-queue-surface.test.ts` asserted **"no service host appears in
the migration or the client"**, which this bundle makes false on purpose. Two of
the three things it protected are untouched and are the ones that matter, so it was
split rather than removed:

* **the client parses nothing** -- the sweep now asks about the SHAPE of the
  mention (no host comparison, no anchored URL regex, no `includes('...spotify')`,
  no `startsWith`/`test`/`match` against one), with a positive control that the
  surface really does say the word;
* **it is an allow, not a blocklist** -- youtube, soundcloud, apple music, tidal
  and bandcamp stay unnamed everywhere, which is what keeps this from becoming a
  maintenance commitment against somebody else's URL formats.

What is genuinely gone is "the instructor is the filter for WHICH SERVICE", which
is a policy the school has now decided differently. They are still the filter for
which song. The refusal sweep in the same file was widened from reading `0145`
alone to a UNION over both migrations, because `not_spotify` is emitted by `0186`
and a list pinned to one filename reports the client inventing reasons the moment a
rule moves.

## Scope notes

Two files outside the prompt's literal list were edited, both because the item was
not doable without them, and both minimally:

* **`src/lib/classroom/song-queue.ts`** and **`src/lib/classroom/transports.ts`** --
  the refusal VOCABULARY (`SongRefusal`, `songRefusalMessage`, `SONG_REFUSALS`)
  lives there, and a new refusal reason cannot be added anywhere else without
  becoming a second copy of it.
* **`src/lib/classroom/FeedbackConsole.svelte`** -- the feedback console component
  lives under `classroom/` rather than under `feedback/`; only its status path was
  touched.

**`src/lib/classroom/due-default.ts` is a NEW file** rather than an addition to
`classroom.ts`, which the prompt did not own: a new file cannot conflict with a
parallel lane, and the module is the due-date default rather than general classroom
arithmetic.

## Not verified

* **The migration against the live Supabase project.** Nothing here can apply one;
  no `IDEA_MIGRATION_URL` connection was opened.
* **A signed-in surface.** The browser pass covers `/dev` routes only. The real
  `/classroom/feedback`, a real class page and a real song queue with a real
  student account were not driven -- that needs `/dev/login` against a local stack.
* **`prefers-reduced-motion: reduce`.** The harness runs at `no-preference`.
* **Web fonts.** The harness blocks every non-loopback request, so all text above
  was measured in the fallback stack.
* **What a real Spotify share link looks like in 2026.** The accepted forms are
  from the shapes in circulation and are deliberately wide, but nobody pasted a
  link off a phone into the running app to check.
