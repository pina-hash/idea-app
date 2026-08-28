---
title: "The markdown feedback export widened to every meta key, and the coin admin-only rule written down"
date: 2026-08-28
branches: [claude/feedback-export-metadata-yuk2k7]
migrations: []
subsystems: ["Site feedback", "IDEA Coin economy"]
---

## The markdown feedback export widened to every meta key, and the coin admin-only rule written down

Two unrelated pieces of work, scoped to `src/lib/feedback/console.ts`, `CLAUDE.md`
and the feedback test files.

### 1. The markdown export was narrower than the console it sits beside

`FeedbackConsole.svelte` was fixed this week (`tests/feedback-meta-fields.test.ts`)
to render every `meta` key it finds, on the grounds that `meta` is free-form:
`captureMeta` in `context.ts` is the shell's one producer but not the only one --
VANGUARD's in-game composer writes `surface` and `initials` straight into the
same column, and `captureMeta` itself has emitted `error` for every
error-boundary report since it existed. That fix was scoped to the console
component and did not touch the export, which is `src/lib/feedback/console.ts`'s
job and was outside that session's scope.

The consequence was specific and reproducible: a row carrying `surface`,
`initials` or `error` showed those fields in the admin console but not in the
markdown bundle a person pastes into a conversation to triage from -- the
artifact that actually gets read.

**The fix is `rowMetaExtras`, the same shape as the console's own
`metaExtras`, in the same file as the accessors it has to stay in sync with.**
A `KNOWN_META_KEYS` set names every meta key a named accessor already reads
(`route`, `path`, `role`, `section`, `viewport`, `userAgent`, `at`, `build`,
`status`, `errorId`) -- the same ten the console's own `KNOWN_META_KEYS` names,
kept as a second list rather than shared, because the two files answer to
different rules (the console decides what appears on a card; the export
decides what travels in a paste) and a shared constant would be one more
place a change to either has to remember the other exists. `rowMetaExtras`
returns every OTHER key whose value is a non-empty primitive, sorted by key,
capped at 200 characters. It is wired into `oneRow` (the per-report block in
`feedbackMarkdown`) as the last line of the facts list, after every named
field.

**What each choice buys, stated the way the task asked for:**

- **Additive only, never a rewrite.** A key already claimed by `rowRoute`,
  `rowBuild` and the rest can never reach `rowMetaExtras` -- it iterates
  `Object.keys(meta)` and skips anything in `KNOWN_META_KEYS`. Widening this
  set can only ever surface a key nothing already prints; it cannot change
  what a named field says. `route` and `path` in particular keep their
  existing behaviour untouched: `rowRoute` still falls back through `context`
  and `app`, and `rowDistinctPath` still suppresses `path` when it equals the
  route, exactly as before this change.
- **Dropped rather than guessed at: empty values, and objects/arrays.** A
  `null`, an empty string or a whitespace-only string produces no line at all
  -- an absent field is not a field, and a bundle padded with "role: " lines
  for reports that never set one is the semester-of-noise problem this file's
  own header already names. An object or array is dropped rather than
  serialised inline (`build` is the one object shape this file understands by
  name and already prints with its own sentence; a second object type reaching
  the generic pass would either wedge a JSON blob into a markdown bullet or
  print the useless `[object Object]`). The JSON export already carries the
  full `meta` blob verbatim for exactly this case -- nothing here removes a
  value from the record, only from the terse pasteable form.
- **Capped at 200 characters, matching the console's own cap**, because a
  markdown bundle has an explicit character budget
  (`FEEDBACK_MARKDOWN_BUDGET`) and one unbounded value from an unanticipated
  producer should not be the thing that pushes real reports out of a bundle.
- **Sorted by key, not by insertion order into the meta object**, so the same
  set of extra keys prints in the same position on every export of the same
  row -- the file's own stated goal for the export is that two exports taken
  an hour apart are diffable by eye, and an order that tracked object
  insertion (which JS engines preserve, but which a producer could reorder
  between builds for reasons that have nothing to do with content) would
  silently defeat that.

Semantic keys were read, not touched: `rowRoute`/`rowDistinctPath`'s
route-vs-path grouping logic, `rowBuild`'s object handling, and the
`meta.at`-is-the-same-instant-as-`created_at` exclusion are all unchanged.
`route`, `path`, `build`, `status`, `errorId` and the rest still print through
their own accessor and their own sentence; `rowMetaExtras` only ever adds
lines for keys none of them claim.

**Tested** in a new file, `tests/feedback-export-meta.test.ts` (mine to own,
per the feedback test files scope): `rowMetaExtras` directly (surfaces an
unnamed key, surfaces `error`, never repeats a named key, drops empty/object
values, renders numbers and booleans, caps a long value, sorts by key), and
`feedbackMarkdown` end to end against a row carrying every documented meta key
(`route` through `errorId`) plus `surface`, `initials`, `error` and one
key nobody has written yet (`someFutureField`) -- asserting every named field
still prints through its own sentence, every extra key lands, no
`[object Object]`, and `meta.at` gets no second line. 11 tests, all passing.

### 2. The coin admin-only rule, verified and written down with its exception

Read the gate on the four public coin write functions directly off the
migrations that currently define them (the latest `create or replace` for
each, since a migration chain is applied in order and the last definition
wins): `coin_log_transaction` (`0096`), `coin_log_extra_credit` (`0096`),
`coin_bulk_log_section` (`0115`) and `coin_payout_student` (`0096`). Each
opens with the byte-identical line:

```sql
if not public.is_admin() then
	raise exception 'Only site admins can log IDEA Coin transactions.';
end if;
```

Confirmed the claim about nested calls the same way `0145`'s own header states
it: `is_admin()` reads `current_user_email()`, which reads the session's JWT
claims, so a SECURITY DEFINER function nested inside another one still answers
about the ORIGINAL caller rather than about whoever the definer is running as.
There is no seam here through which a non-admin reaches one of these four via
an intermediate call.

Read `0145` (`0145_classroom_song_queue.sql`) in full to check the task's
account of it against the actual file, since the task said to say so if any
part did not match. **It matches.** `classroom_song_approve` charges 2i¢ from
the requester's digital balance by calling `_coin_insert` directly (the row
shape, not re-implemented) after a debt check through `_coin_balance` (the
balance derivation), with the price read from `coin_categories.song_request`
rather than a literal. `classroom_song_approve` itself is gated on
`classroom_manages_section`, which is `is_admin() OR teacher_email = me` -- the
teacher of record, routinely not an admin. Calling `coin_log_transaction`
instead would raise the admin-only sentence at exactly the instructor this
feature is for. The migration's own header names both halves of the reasoning
the task described (the teacher of the room should moderate their own room;
the amount is fixed by the category row, not chosen by the approver) and adds
a third the task didn't mention but the file does: the alternative is an
instructor unable to approve a song in their own class, which is the actual
failure mode being avoided.

**Written down in `CLAUDE.md`, under "Write path"**, as a new bullet
immediately after the existing "Documented exceptions" bullet (the anonymous
intake / legacy coin import rule already living there, which this is the same
shape of exception to): the admin-only rule stated with the four function
names and the verbatim sentence, then `0145` named as the first deliberate
exception with the reasoning kept beside it, then the retrofit `0145`'s own
header names as the way to remove the exception someday (an authorization
seam on `coin_log_transaction` other than `is_admin()`, or extracting its
price/sign/debt/insert middle into a shared private helper) -- so a future
session that wants to close this gap does not have to re-derive it. Edited in
place; no other rule in that section changed.

No migration was touched or created in this bundle.

### Verified

- **`svelte-check`: 0 errors, 37 warnings, mix 31 / 5 / 1** -- the documented
  baseline, unmoved, re-derived with `npx svelte-kit sync && npx svelte-check`
  after a fresh `npm ci` and a placeholder `.env` (neither committed).
- **Full suite: 148 files, 3338 tests, all passing** (`npm test`, one run after
  both changes; the export and console test files were also run standalone
  first to isolate the new work before the full pass).
- Read, not run: the four coin RPC definitions and `0145` in full, against the
  live repo checkout rather than from memory.

### Not verified

- **No live Supabase project.** This bundle touched no migration and made no
  database claim beyond reading committed SQL, so nothing needed a live
  database; stated for completeness per the verification standard.
- **No browser pass.** Neither change is visual or interactive: the export is
  a pure string transform covered by unit tests, and `FeedbackConsole.svelte`
  itself was explicitly out of scope and untouched.
- **No "before" run of the full suite was captured as a separate step.** The
  full suite was run once, after both changes, and came back 100% green
  (148/148 files, 3338/3338 tests); the targeted new and touched test files
  were run in isolation first and also passed, which is the evidence that the
  change didn't regress the surface it touches.
