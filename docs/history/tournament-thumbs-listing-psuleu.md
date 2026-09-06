---
title: "The last enumerable bucket: `tournament-thumbs` keeps its public flag and loses its listing, and the residue turns out to be orphans only (`claude/tournament-thumbs-listing-psuleu`, migration 0189)"
date: 2026-09-06
branches: [claude/tournament-thumbs-listing-psuleu]
migrations: ["0189"]
subsystems: ["tournaments", "storage buckets", "browser-verify harness"]
---

**Started from `origin/integration` at `13d1747`**, merged `origin/main`
(fast-forward, one commit, `eec8151` "Every bucket states an upload limit that is
true"), and took the migration number after that merge. Working directory
`/home/user/idea-app`. `origin/integration` was 4 commits BEHIND `origin/main`
and 0 ahead, so the merge was a fast-forward and no conflict was possible; git
already carried a committer identity, so the "Please tell me who you are"
failure this prompt warns about did not arise.

The duplicate check ran and passed: no `docs/prompt-ledger/entries/0076-*` at
any ref (`git log --all --diff-filter=A` over that path returned nothing), and
no branch on origin carried a 0076 ledger commit.

## A1 -- the two doors, measured

`0062_tournaments.sql` section 3 created `tournament-thumbs` with
`public = true` and ONE select policy, `"tournament thumbs public read" ... for
select to public using (bucket_id = 'tournament-thumbs')`. `to public` is wider
than the `to anon, authenticated` 0163 gave `maps-media` -- in Postgres `public`
is every role there is -- and a predicate naming only the bucket is not a read
rule, it is a listing rule.

Measured against a real embedded Postgres (17.10) with 0001, 0003, 0004, 0020,
0062 and 0064 applied, as `anon` with no claims, over four objects written
through the real key shapes -- an entry thumbnail on a LIVE tournament, one on a
DRAFT tournament, a banner named by a `tournament_entry_styles` row, and an
orphan named by nothing:

| reading | count |
|---|---|
| anon lists the bucket | **4 of 4** |
| `select thumbnail_url from public.tournament_entries` | **2 of 4** |
| ...plus `tournament_entry_styles.background_value` where `background_type='image'` | **3 of 4** |
| residue the listing adds over both public columns | **1** (the orphan) |

On the same connection `select count(*) from public.profiles` answered
`permission denied for table profiles`. That is prompt 0052's control, re-run
rather than borrowed, and it is what says the listing was the POLICY and not RLS
being off.

**So the two doors are NOT the same width, and this bundle had something to
close.**

### The correction that decided the shape

Both `docs/decisions/entries/17-*.md` and `0183_foundry_covers_private.sql`'s
header say the residue is "0064's banner art, and replaced or orphaned uploads",
and `tests/db/tournament-thumb-stays-public.test.ts` asserts it
(`expect(residue).toEqual([bannerKey])`). **The banner half is wrong, and the
reason it is wrong is instructive rather than careless.** That test deliberately
leaves 0064 OUT of its chain, for a good reason it states -- 0064 declares a
Realtime publication the stub does not create -- so it measures a database with
no `tournament_entry_styles` in it, and the banner it seeds is necessarily named
by nothing. In production 0064 IS applied and grants `anon` SELECT on that table
under `using (true)`, so `background_value` holds the whole public URL and a
banner comes through the FRONT door exactly like a thumbnail.

This session put 0064 in the chain by creating the `supabase_realtime`
publication first and then applying the REAL migration file verbatim -- the same
"fixture completion" job `tests/db/full-chain-fixture-completion.sql` already
does, and the same boot-short-then-apply shape `CLAUDE.md` prescribes for
migration testing. Nothing about 0064's SQL was edited or reimplemented.

**A predicate built on the earlier reading would have delisted every image
banner along with the orphans.** That is `CONTROL 2` in the new test file: it
rebuilds the anon policy asking only `tournament_entries`, and the banner
disappears. Without it, a one-table predicate still passes "the orphan is gone"
and still passes "the listing is not empty".

### A "published" entry does not exist, and the degenerate case is measured

The prompt asked for a published entry and an unpublished one. **There is no
publish flag on an entry**, and the nearest thing -- `tournaments.status`, which
does carry `'draft'` -- is not a visibility gate either: 0062 builds the read
policies in a loop that puts `for select to anon using (true)` on every
`tournament_*` table, `tournaments` included, and 0149 established that as a
deliberate twelve-table `anon` SELECT surface. Asserted from `pg_policies`
rather than from a list, and behaviourally: an anonymous caller reads the draft
tournament's own row. So the live and draft thumbnails land on the same side of
every reading, which is what the fixture is there to show.

### The orphans are not hypothetical

Both upload paths in `src/routes/tournaments/[id]/+page.svelte` PUT the bytes
before the row exists. `uploadThumb()` runs and only then is
`tournament_register_entry` / `tournament_respond_invite` called, so every
refused or abandoned registration leaves an object behind. `uploadBackground()`
is worse: it uploads on file pick, and a student who picks again or closes the
editor leaves the earlier key referenced by nothing. Nothing sweeps either. The
residue is a pile of images students made -- a robot photo they replaced, a
banner they thought better of -- keyed under their own user uuid.

## A2 -- is a key recoverable from a stored URL?

**Yes, and the migration proves it by doing it.** Both paths store
`getPublicUrl()`'s output, the whole absolute URL
`<project>/storage/v1/object/public/tournament-thumbs/<uid>/<uuid>.<ext>`, so the
key is the far end of a string.

The obvious spelling is wrong, though. `like '%' || o.name` puts an
ATTACKER-INFLUENCED value inside a LIKE pattern: the extension comes from
`file.name.split('.').pop()` with no allowlist, so a filename ending `._` makes
the predicate match objects it was never meant to. The policy uses
`right(url, length(name) + 1) = '/' || name` -- plain string equality with no
metacharacters -- beside a CONSTANT `like '%/tournament-thumbs/%'` with nothing
interpolated, which is what stops a row pointing at another host from unlocking
a key it merely ends with. Both are asserted behaviourally in the new test: a
`https://evil.example/<orphan key>` row unlocks nothing, and a key ending `._n`
does not admit its `.an` sibling.

**A row whose URL predates any convention** simply fails to match and its object
leaves the anonymous listing. That is the right failure direction: the column has
always accepted an arbitrary external URL (0062's own comment says "Public URL or
a path in the public 'tournament-thumbs' bucket"), such a row names no object in
this bucket, and an unmatched row costs a stranger a listing entry rather than
costing a spectator a picture -- the `<img>` reads `thumbnail_url` and goes to
`/object/public/`, which 0189 does not touch.

## A3 -- who renders these

Seven page routes under `/tournaments`, and `/tournaments` is NOT in
`authedPrefixes`, so every one of them is reachable signed out; `tv/+page.server.ts`
says "FULLY PUBLIC" in its own header. Two components render a thumbnail --
`EntryChip.svelte` and `EntryBanner.svelte` -- and both did it as a bare
`<img src={entry.thumbnail_url}>` with no `onerror`. There is no second,
session-gated audience: the host console at `/tournaments/[id]/host` gates in
page, but it mounts the same two components. So the predicate has one audience
and it is the public one.

## A4 -- what transfers from 0186

**Transfers:** the whole shape. Public flag untouched, `storage.buckets` not
written to at all, the unscoped policy replaced by a bucket-wide
`to authenticated` read plus a SCOPED `to anon` read, the visibility test
delegated rather than restated (a policy expression is evaluated as the QUERYING
role, so the subquery is filtered by the owning table's own RLS), a census
raised before the swap, a self-check that reads `pg_policies` back by ROLE and
PREDICATE rather than by name, and a one-statement total undo.

**Does not transfer:** where the argument LANDS. `maps_photos`'s own anon policy
is a published-owner test, so delegating there dropped draft photos too. Both
tournament tables are `using (true)`, so delegation here drops the orphans and
nothing else. That is the honest size of this file and the header says so.

**Added, because 0186 did not need it:** a hard precondition on 0064
(`to_regclass('public.tournament_entry_styles') is null` refuses with a
sentence, since CREATE POLICY resolves that name at creation time), a second
delegated table in the predicate, the `right()`/constant-LIKE key match above,
and a self-check clause (c) asserting `anon` still holds SELECT on BOTH
delegated tables -- 0109's lesson, since a revoked grant there does not narrow
the read, it BLANKS it.

## A5 -- every bucket, measured

Booted the full chain (every file in `supabase/migrations`, in order, over the
stub plus `full-chain-fixture-completion.sql`) plus 0186 from
`origin/claude/maps-media-bucket-he0wnn`, and read `storage.buckets` and
`pg_policies` directly. Sixteen buckets. **State BEFORE 0189:**

| bucket | `public` | SELECT policies | admitting anon/public | scoped |
|---|---|---|---|---|
| avatars | false | 1 | 0 | -- |
| classroom-attachments | false | 2 | 1 | yes (`classroom_attachment_object_is_public(name)`) |
| feedback-media | false | 2 | 0 | -- |
| foundry-bundles | false | 0 | 0 | -- |
| foundry-covers | false | 1 | 0 | -- |
| foundry-uploads | false | 1 | 0 | -- |
| gauntlet | **true** | **0** | 0 | -- |
| gauntlet-drawings | false | 1 | 0 | -- |
| gauntlet-models | false | 1 | 0 | -- |
| gauntlet-tools | **true** | **0** | 0 | -- |
| greenline-decals | false | 1 | 0 | -- |
| instructor-attachments | false | 1 | 0 | -- |
| maps-media | **true** | 2 | 1 | yes (0186, via `maps_photos`) |
| submission-files | false | 1 | 0 | -- |
| tournament-thumbs | **true** | 1 | **1, UNSCOPED, `to public`** | **no** |

**0071's claim is CONFIRMED**: `tournament-thumbs` was the only bucket both
public and world-listable. The table also corrects a shorthand nobody should
carry away from it -- **four** buckets are public, not two. `gauntlet` and
`gauntlet-tools` are `public = true` with ZERO select policies, so RLS denies
every list to every client role while `/object/public/<key>` still serves a
known key. Public and listable are different properties and this is the pair
that shows it.

**After 0189 no bucket in the project admits an unscoped anonymous read.** Every
remaining anon-admitting policy is scoped to a row the caller can already read.

## A6 -- the counts block

Read out of `tools/browser-verify/README.md`'s generated data comment by
identity, not off the prose:

**AT HEAD, BEFORE THIS BUNDLE TOUCHED ANYTHING:**

- `covered` array length: **107**. Static region: **116 specs / 57 routes / 86
  dev pages / 232 runs**. **0071's "117 covered" does not match that tree** --
  the measured region said 107. The likeliest reading of where 117 came from is
  that it is a SPEC count and not a covered count; the two are different numbers
  and the README's own prose says to compare them precisely because they can
  differ. Nine specs the measured region had never measured are named by
  `tests/derived-numbers.test.ts`.
- `outside`: **2**, both rows exactly as claimed -- `/dev/notebook` @375 and
  @1440, `tap-reach`, "toolbar text controls (under the floor on width --
  decision 12, with the owner)". Confirmed.
- The measured region's `sha` was `4ecf48f` dated 2026-09-05, so it was a stale
  measurement against that tree either way.

**AFTER B7 (this bundle added one spec, then re-measured everything):**

- `npm run verify:counts` rewrote the static region: **117 specs over 58 routes,
  87 /dev pages, 2 widths, 234 runs**.
- `npm run verify:readme` ran the whole set on a clean tree with no dev server
  already listening: **234 route/width runs, 3444 measurements, 2 outside
  threshold, 557.3s wall clock, measured on `675dc1b`, `dirty: false`**.
  `--selftest` reported 70 controls (36 negative, 34 positive), 0 instrument
  failures.
- `covered` is now **117**, equal to the static spec count, with
  `tournament-thumbs.mjs` in it. Nothing is unmeasured any more.
- The 2 outside rows are unchanged and are still the two decision-12
  `/dev/notebook` `tap-reach` rows. **This bundle added no outside-threshold
  measurement**, which is the number that matters: 34 of the 3444 are the new
  route's and all 34 are within threshold.
- Note for whoever merges: `tools/browser-verify/README.md` is also touched by
  `origin/claude/four-red-integration-tests-62a7ba`, so the two will conflict
  there. Regenerating (`npm run verify:counts` then `npm run verify:readme`)
  resolves it and is the only correct resolution -- both regions are generated
  and neither should be hand-merged.

## B1 -- what was built

`supabase/migrations/0189_tournament_thumbs_no_anon_listing.sql`. The public flag
is left alone and nothing is written to `storage.buckets`. The bracket keeps
working with no session, which was the whole constraint.

Both required controls MUTATE ONE CLAUSE IN-DATABASE rather than editing the
file, and the sound state is asserted first so a broken fixture is told apart
from a clause that matters:

- **CONTROL 1** -- sound state lists 3; drop the scoping clause and rebuild the
  policy bucket-wide; anon lists **4** and the orphan is back; restore; **3**.
- **CONTROL 2** -- sound state contains the banner; rebuild the policy asking
  only `tournament_entries`; the listing falls to the two thumbnails and the
  banner is gone; restore; the banner returns.

Plus the delegation itself, measured rather than argued: deleting the naming ROW
delists its object with no policy change at all, and re-inserting it brings the
object back.

## B2 -- the unpublished case, stated rather than implied

There is no unpublished entry (above), so the question lands on the ORPHAN, and
the answer is in the migration header in as many words: **an orphan is delisted,
not deleted, and remains readable by its EXACT KEY through `/object/public/`.**
That is 0062's accepted trade. 0189 sweeps nothing -- a migration that deleted
student-uploaded bytes on the strength of a string match is the one thing worse
than the exposure -- and the test asserts both halves: four objects still in
`storage.objects` afterwards, and `buckets.public` still true.

## B3 -- deploy order

1. **Deploy the app half** (this branch's `src/` changes: the shared thumbnail
   decision and the two components' fault tiles).
2. **Apply `0189` by hand** in the Supabase SQL editor.

**Either order is safe, and that is measured rather than hoped.** The 0071
finding holds here for the same reason: the read path does not move.
`getPublicUrl()` builds the identical URL before and after, and
`/object/public/` is governed by the bucket flag, which this file leaves at
`true`. So applying 0189 against the currently deployed app breaks nothing, and
deploying the app half against an un-applied database breaks nothing.

App first is still the order to take, for the smaller reason: the app half is
what renders a stated tile instead of a broken image, so it is what makes the
one unmeasured risk (whether `/object/public/` consults RLS at all -- 0183 says
it does not; no Docker daemon here to re-measure) legible in seconds if it ever
fires.

**What breaks if reversed:** nothing. **The one-statement reversal**, re-asserting
0062 exactly:

```sql
drop policy if exists tournament_thumbs_named_read on storage.objects;
drop policy if exists tournament_thumbs_authenticated_read on storage.objects;
create policy "tournament thumbs public read" on storage.objects
  for select to public using (bucket_id = 'tournament-thumbs');
```

### Cold apply steps

1. `git pull` on `main` so `supabase/migrations/0189_*.sql` is present.
2. Paste the whole file into the Supabase SQL editor and run it. It refuses if
   the bucket is missing (apply 0062), if `tournament_entry_styles` is missing
   (apply 0064), if any unscoped public/anon select policy survives, if 0062's
   three write policies are not all three there, if `anon` has lost SELECT on
   either delegated table, or if the bucket is not public.
3. Read the four `raise notice` lines. The first two are the census: how many
   objects the bucket holds, how many are named by a public row, and how many
   leave the anonymous set. **The last number is the orphan count on production
   and nothing in this repo can predict it.**
4. It is idempotent (drop-then-create throughout) and safe to re-paste.

## B4 -- THE `CLAUDE.md` REPORT

`CLAUDE.md` is read-only to this bundle. Everything below was verified against
this tree in this session; nothing is repeated on the strength of an earlier
bundle's word. Four bundles before this one found stale sentences and none owned
the file, so this is a running list rather than a new one.

### Confirmed stale, with the replacement

**1. The phantom-error count is 13, not 11** (0071's claim, verified).

> Current: "with no `.env` present ... `svelte-kit sync` writes a module
> exporting nothing and eleven `has no exported member 'PUBLIC_SUPABASE_URL'`/
> `_ANON_KEY` errors land across eight files that no change touched."

> Replacement: "...and **thirteen** `has no exported member
> 'PUBLIC_SUPABASE_URL'`/`_ANON_KEY` errors land across **thirty** files that no
> change touched."

Measured this session, twice, on a checkout with no `.env`:
`svelte-check found 13 errors and 37 warnings in 30 files`, and with the two
placeholders exported, `0 errors and 37 warnings in 20 files` with the
31/5/1 breakdown intact. The paragraph's own diagnostic still holds exactly --
only the errors move and only in files the diff never named -- and the paragraph
itself instructs the correcting session to fix the line, which no owner has yet
been able to do.

**2. The maps SVG wildcard was closed by 0168** (0071's claim, verified).

> Current: "**THE BUCKET'S `image/*` WILDCARD ADMITS SVG AND THE CLIENT REFUSES
> IT ANYWAY.** ... closing it properly is a migration replacing the wildcard with
> a concrete raster list, **which no bundle has written yet**."

> Replacement: "...closing it properly was a migration replacing the wildcard
> with a concrete raster list, and **`0168_maps_media_types_and_plan_frame.sql`
> is that migration**: `maps-media` now pins `allowed_mime_types` to
> `{image/jpeg, image/png, image/webp, image/heic, image/heif, image/avif}`, and
> `0186`'s self-check refuses to apply if a `*` ever reappears in that list."

Verified: `0168` line 310 writes exactly that array, its own header opens with
the finding, and `0186`'s self-check clause asserts no wildcard survives.

**3. `gauntlet_practice_meter` has never existed** (0060's claim, verified).

> Current, in GAUNTLET AUTHOR TIER: "...every student-work read (own submissions,
> own run events, own run analysis), `gauntlet_run_review` (`0152`, ...) and
> `gauntlet_practice_meter` (`0151`), the global Speedrun ruleset singleton..."

> Replacement: "...and **`gauntlet_practice_pressure`** (`0151`), the global
> Speedrun ruleset singleton..."

Verified: the string `gauntlet_practice_meter` occurs in this repository exactly
once outside `CLAUDE.md` and `docs/`, at
`supabase/migrations/0155_gauntlet_authoring_tier.sql:628`, inside a SQL comment.
`0151_gauntlet_meter_practice.sql` creates three functions and none of them is
called that: `_gauntlet_practice_min_interval()`, `gauntlet_submit(...)` and
`gauntlet_practice_pressure(...)`. The last one does carry `public.is_admin()`
in its body, so the CLAIM the sentence makes is true and only the NAME is wrong.
The name originates in an applied, immutable migration's comment, so the
correction can only be made in `CLAUDE.md`.

### Could not confirm

**4. The `claude/**` merge paragraph** (0055's claim). Read against
`.github/workflows/integrate.yml` in this tree, every clause of that paragraph
holds: it merges `claude/**` into `integration` on green and deletes the branch,
`main` moves only when a person merges, and the "Already contained, deleted"
job-summary section it describes is genuinely in the workflow file. The one
thing the paragraph omits is step 2 of the workflow's own header -- it merges
`main` into `integration` FIRST -- which is an omission rather than a
contradiction. **Reported as not-confirmed rather than dismissed:** 0055 may have
been describing an earlier state of either file.

### New this session

**5. Two paragraphs about where a migration lives contradict each other, and the
practice follows the second one.**

> "**Never put a migration on a branch.** There is one production database, so a
> migration is global regardless of which branch its file lives on. Migration
> work happens on `main`."

against, in the migration-tooling section:

> "A migration sitting only on `integration` gets no probe at all: for part of
> that afternoon `origin/main`'s highest was 0169 while `origin/integration`
> carried through 0180, so eleven files were in exactly that state..."

The second paragraph treats a migration living off `main` as an ordinary,
recurring state and tells you what to do about it. Measured this session:
**`0186_maps_media_no_anon_listing.sql` is on neither `origin/main` nor
`origin/integration`** -- it exists only on
`origin/claude/maps-media-bucket-he0wnn` -- so the most recent migration bundle
before this one did exactly what the first paragraph forbids. Whichever sentence
is meant to govern, they cannot both stand; the honest repair is probably to
narrow the first to what it is actually protecting ("a migration is not merged
to `main` before it is applied") rather than to keep a rule the last two bundles
have not followed.

**AND THE OBVIOUS REPLACEMENT CLAUSE IS ITSELF BROKEN, WHICH THIS SESSION FOUND
OUT BY BEING RENUMBERED.** An earlier draft of this finding proposed adding "and
the number is taken across every ref at commit time" to that repair -- which is
what the prompt commissioning this bundle already says, and what this session
did. **It does not work.** This file was pushed as `0187` and `0187` was taken by
`claude/duplicate-drafts-count-wzworl` while it was in flight; it is now `0189`,
stated rather than derived, with `0188` also gone. That was reported as the sixth
such collision in a single day.

The rule has no lock in it. Every concurrent session reads the same refs,
computes the same "next free" number, and pushes; whoever pushes second is wrong
and does not find out until somebody tells them. So a `CLAUDE.md` sentence
promising that a cross-ref check yields a safe number would be teaching a
procedure that has now failed six times in a day, and adding it would make the
file MORE wrong rather than less.

**What the file should carry instead is the failure, not a procedure**, because
this bundle cannot fix the allocation problem and should not pretend to:

> **A MIGRATION NUMBER CANNOT BE ALLOCATED BY LOOKING.** "The next free number
> across every ref" is what every concurrent session computes, so they all
> compute the same one and the second to push collides -- six times on
> 2026-09-06 alone. There is no lock and this file cannot invent one. Until
> something allocates numbers centrally, a session takes the number it is GIVEN
> where one is given, expects to be renumbered where it is not, and writes its
> migration so a renumber is a `git mv` plus a `sed` -- which means the number
> appears only in the filename and in the file's own `raise` prefixes, never in
> a table name, a policy name, a function name or a test's expected value.

That last clause is the only part a session controls, and it is what made this
renumber a two-minute mechanical change with the whole suite green afterwards
rather than a rewrite.

**6. `CLAUDE.md` says nothing about the four bucket-closing migrations.** Not a
stale sentence but a missing one, and the whole reason this bundle had to
re-derive the bucket census from scratch. Proposed addition, under the storage
material:

> **NO BUCKET IN THIS PROJECT ADMITS AN UNSCOPED ANONYMOUS READ, AND THAT TOOK
> FOUR MIGRATIONS.** `avatars` (0181) and `foundry-covers` (0183) are PRIVATE
> with a proxy route in front. `maps-media` (0186) and `tournament-thumbs`
> (0189) stay PUBLIC, because the surfaces that render them are signed-out on
> purpose, and instead scope the `anon` SELECT policy to keys a row the caller
> can already read -- so the storage listing mirrors the row read instead of
> being a second, wider door. **The bucket flag and the select policy govern
> different paths and that is the whole mechanism**: the flag governs
> `/object/public/<bucket>/<key>` (reading ONE object whose key you already
> hold), the policy governs the API read and list paths (which is what hands out
> keys). `gauntlet` and `gauntlet-tools` are public with NO select policy at all,
> which denies every list while still serving a known key -- public and listable
> are different properties. **A scoped policy delegates and never restates**: the
> subquery is evaluated as the QUERYING role, so it is filtered by the owning
> table's own RLS and narrows automatically when that table does. A new public
> bucket copies 0186 or 0189; a new one that does not is the fifth of these.

### Does `CLAUDE.md` need a check like 0060's `docs/GAUNTLET.md` one?

**Yes for identifiers, no for prose, and the split is the whole design.** 0060's
checker strips full-line SQL comments before testing identifier existence, and
that is precisely the case `gauntlet_practice_meter` needs: the name is real in
the repository only as a comment. Pointed at `CLAUDE.md` such a check would
assert, cheaply and without judgement:

- every `snake_case` identifier the file names that LOOKS like a database object
  (`is_admin`, `foundry_list_apps`, `classroom_section_roster`) resolves to a
  `create ... function|table|policy|view` in `supabase/migrations/`, with
  comments stripped -- which catches finding 3 and nothing else;
- every repo path it names (`src/lib/...`, `tests/...`, `tools/...`,
  `supabase/migrations/...`) exists, with the same
  "a path named in a sentence that says it does not exist is exempt" carve-out
  0060 built, keyed on the sentence;
- every `NNNN` migration number it cites has a file.

It must NOT try to check a claim, a count or a rule. Findings 1, 2, 4, 5 and 6
are all prose -- a number that drifted, a decision that was superseded, an
internal contradiction, an absence -- and no static checker reaches any of them;
a checker that pretended to would be the ratchet
`tests/spec-instructions-budget.test.ts` already was. **Not built here: it is its
own lane, and it needs the file's owner, since a checker that reddens on a file
nobody in the lane may edit is a permanently red suite.**

## B8 -- the suite, and the three red files

`npx svelte-kit sync && npx svelte-check`: **0 errors, 37 warnings**, breakdown
**31 `state_referenced_locally` / 5 `css_unused_selector` / 1
`perf_avoid_nested_class`** -- the documented baseline, unmoved by this bundle.
(With no `.env` and the two placeholders unexported the same tree reports 13
errors; see the `CLAUDE.md` report above.)

`npm test`, run at **01:36 PDT on 2026-09-06** (America/Los_Angeles) and again
after the regeneration: **292 test files, 5959 tests**. The first run had **8
failures across 3 files**; after `verify:counts` and `verify:readme` that is
**3 failures across 2 files**, and here is every one of them by name.

**GONE, and they were this bundle's own:** the five `tests/derived-numbers.test.ts`
failures. Adding a route spec without regenerating is exactly what that file is
built to redden, and B7 cleared it.

**RE-RUN AFTER THE 0187 -> 0189 RENUMBER, at 02:02 PDT: byte-for-byte the same
result** -- 292 files, 5959 tests, the same 3 failures, `svelte-check` still 0
errors / 37 warnings / 31-5-1. The renumber touched the filename, the file's own
`raise` prefixes, one test constant and the prose; it moved no number any
assertion reads. The browser README's regions are unchanged by it too (no route
spec and no `/dev` page moved), so its measured region still records the run on
`675dc1b` -- which the README's own prose already calls a weak signal, and
`derived-numbers` passes because what it actually compares is the covered set
against the tree.

**PRE-EXISTING ON `main`, NOT THIS BUNDLE'S (2), and the prompt predicted them:**
`tests/gauntlet-doc.test.ts` -- "agrees with docs/GAUNTLET.md and
docs/GAUNTLET-DESIGN.md" and "covers every GAUNTLET migration in the tree".
The uncovered migration is named in the failure output:
`0184_gauntlet_run_event_bounds.sql`. Verified independently that this is not
mine: `git show origin/main:docs/GAUNTLET.md | grep -c 0184` answers **0**, and
this branch's diff against `origin/main` touches no gauntlet file and not
`docs/GAUNTLET.md`. The migration arrived on
`origin/claude/gauntlet-run-events-zspf1y` without its doc row and that branch
reached `main`. **The fix exists and is unmerged**: swept every remote branch for
a `docs/GAUNTLET.md` containing `0184` and exactly one has it --
`origin/claude/four-red-integration-tests-62a7ba` (prompt 0067), whose whole diff
is that one line plus `tools/browser-verify/README.md` plus its own records.

**INTRODUCED BY THIS BRANCH, AND IT IS A TRUE STATEMENT ABOUT THE TREE (1):**
`tests/db/migration-0177-tombstone.test.ts` -- "the migration series is
contiguous, with 0177 in it". This branch's `supabase/migrations/` runs
`... 0183, 0184, 0185, 0189` and the walk reports holes at **186, 187, 188**.

### The number was 0187 and it collided, which is the finding

**This file was written, tested, committed and pushed as
`0187_tournament_thumbs_no_anon_listing.sql`, and 0187 was taken while it was in
flight.** `claude/duplicate-drafts-count-wzworl` pushed
`0187_classroom_duplicate_drafts.sql`. It was reported as the **sixth such
collision in one day**, and this session was told to renumber to **0189**, with
0188 already taken by `song_spotify_and_feedback_spam` on
`instructor-requests-surfaces-j2dfjc`. **0189 is STATED, not derived** -- this
session was told not to re-check whether it is free, and did not, because the
check is what failed: the number was verified across every ref at commit time
and was still wrong minutes later.

**That is worth writing down as more than a renumber.** "Take the next free
number verified across every ref AT COMMIT TIME" is not a rule that can work
under concurrent sessions. It has no lock in it: every session reads the same
refs, computes the same answer, and pushes. Six sessions in one day found that
out independently. Nothing in this bundle fixes it and nothing in this bundle
should -- it is a repository-wide allocation problem, and the honest note is that
the procedure is the defect rather than any of the six sessions.

### What the holes are, and they are not all the same kind

The renumber makes the finding SIMPLER rather than worse, and the three holes
have two different explanations:

- **186 is an ABANDONED hole from this branch's point of view**:
  `0186_maps_media_no_anon_listing.sql` exists on
  `origin/claude/maps-media-bucket-he0wnn` and on no other ref, `main` and
  `integration` included. That branch is contiguous through 0186 and does not
  fail this test, which is what confirms the direction of the dependency.
- **187 and 188 are LANDED-ELSEWHERE**: `0187_classroom_duplicate_drafts.sql`
  and `0188_song_spotify_and_feedback_spam.sql` are real files on
  `claude/duplicate-drafts-count-wzworl` and
  `instructor-requests-surfaces-j2dfjc`. **Not verified from this container** --
  they are taken on the word of the instruction that renumbered this file, which
  is the whole point of the number being stated rather than derived.

**0189 is contiguous behind them.** Once all four branches land, the series reads
`... 0185, 0186, 0187, 0188, 0189` with no hole at all, and this assertion goes
green on its own with nothing to fix.

**The assertion is left exactly as it is, for the second time in this session.**
It is reporting a true fact about a tree mid-integration, and the right repair is
not here: **prompt 0084 is teaching it to tell a claimed hole from an abandoned
one**, which is the distinction the three holes above make concrete. Carrying,
cherry-picking or merging another session's migration file to close a hole was
declined for the same reason it was declined before the renumber -- each takes
ownership of another session's work and conflicts when that branch integrates.
Merging THIS migration to `main` alone would make it worse, not better: `main`
would then read `0185, 0189` and go red itself.

**So this branch is deliberately left red on one assertion, and it is named here
rather than left to be found.** Since CI is already red on `main` for the
gauntlet-doc pair, `integrate.yml` (which merges only on green) is not merging
anything at present anyway; landing 0067's branch and the three migration
branches clears all of it together.

## What was NOT verified

- **The live Supabase project.** Nothing in this container can reach it; prompt
  0073 established that the egress proxy accepts a CONNECT to 5432 and then
  carries no bytes. Every count above is from the embedded fixture, and **the
  orphan count on production is unknown and will only be known when 0189's
  census notice prints.**
- **Whether `/storage/v1/object/public/<bucket>/<key>` consults RLS at all.** No
  Docker daemon, no Supabase CLI, so no running storage-api. 0183's header states
  it does not; that is cited, not re-measured. 0189 is written to be safe under
  both answers -- the set its policy admits and the set the bracket renders are
  the same set by construction -- which is why, unlike decision 17's proposed
  `to authenticated` narrowing, it does not depend on the answer.
- **A signed-in tournaments surface in a browser.** `verify:browser` covers
  `/dev` routes only. The four thumbnail states were driven on
  `/dev/tournament-thumbs`, which mounts the real `EntryChip` and `EntryBanner`;
  the real `/tournaments/[id]` was not opened.
- **`npm run verify:browser` was NOT run over the whole route set**, so the
  README's measured region still carries the 2026-09-05 `4ecf48f` run. Only
  `--route tournament-thumbs` was run.

## What the browser pass found, and it found things

Two real defects, both invisible to `svelte-check` and to `tests/`:

1. **`.banners: 4 states, 3 distinct paints`.** Reading only the box's computed
   fill and ink, `present` and `absent` COLLAPSED in `EntryBanner`: there
   `.thumb.initial` inherits its ink (`color: currentColor`) and takes the same
   background as the `<img>`, so the two boxes were byte-identical and only the
   picture inside differed. A true statement about the box and a false one about
   what a spectator sees -- the "differing only in words" shape 0071's probe
   found. Fixed in the SPEC, not the component: the image is same-origin, so its
   centre pixel is drawn to a canvas and read for real. That is paint.
2. **The refused mark measured 3.9:1 in the banner** (`#d08030` on the pinned
   amber wash over the room's dark plate, `rgb(54, 56, 37)`) while measuring 4.5
   in the chip -- the same rule failing in one room and passing in the other,
   which is the shared-component-enters-a-new-room case `CLAUDE.md` names. Fixed
   by moving the derived INK and not the identity: `--amber`'s own hue (30deg)
   and saturation (63%) at 65% lightness instead of 50%, `#dea66e`. **Measured
   after: 6.12:1**, and the fill stays PINNED rather than mixed from the ink, or
   lightening the ink would lighten its own ground and hand most of it back.

Final run, both widths: **34 measurements, 0 outside threshold**, 0 console
errors. The retry step reports `failed tiles painted: 2 after 0 retry
attempt(s), 0ms` -- honest and worth reading as what it is: on loopback the
`error` event had already fired before the step ran, so the retry loop was
present and not needed. The assertion that both tiles exist is the `presence`
row, not the loop.

## The app half

`src/lib/tournaments/thumbnail.ts` is the ONE decision both spectator components
now ask, because two components each deciding what a bad URL is, is the thing
that stops matching. Four states: `present`, `absent`, `refused`, `failed`.

**`refused` is deliberately narrow: not a web URL.** `http:` and `https:` are
handed over; `javascript:`, `data:`, `blob:`, `file:` and anything `URL()` cannot
parse are not.

**The first draft was https-only and that was wrong**, caught before it shipped:
the local Supabase stack answers on `http://127.0.0.1:54421`, so `getPublicUrl()`
returns an http URL there and every thumbnail in every local pass would have
rendered as a REFUSAL -- a fault tile for a picture that is fine. On production
the page is https and the browser blocks a mixed-content image itself, firing
`error`, so such a URL lands in `failed`: a stated tile rather than the silent
empty box it used to be. **A scheme the browser will not attempt is a refusal; a
scheme it attempts and rejects is a failure, and the element's own event is what
tells them apart.**

An ordinary EXTERNAL https image is still rendered, because 0062's column comment
says an off-project URL is a designed case and a render path is not the place to
reverse a schema decision. SVG is not refused either: an `<img>` decodes an image
or fails, script does not run in it, and an SVG loaded through one is inert by
specification -- the same measurement the classroom-files rule rests on.

`tests/tournament-thumbs-state.test.ts` also records a wrong intuition rather
than deleting it: `https:/\evil.example/a.png` was written as a value `URL()`
would reject, and it is not -- the URL spec NORMALIZES backslashes for a special
scheme, so it parses as an ordinary external https URL and is allowed by the rule
above. The test asserts the parser's actual behaviour.

## Deferred, with reasons

- **Sweeping the orphans.** Delisting is not deleting. A sweep needs to tell an
  orphan from a row it merely failed to parse, and getting that wrong destroys
  student work with no undo. Its own bundle, its own owner.
- **The signed-in listing.** Any account that can sign in -- every student at
  Bosco Tech -- still lists this bucket in full. That is the tier all four of
  these migrations land on and it is a different question.
- **The exact-key read of an orphan.** Closing it means making the bucket
  private and putting a proxy in front, which is decision 17's question 2.
- **Decision 17's questions 2 and 3** (should a thumbnail be public at all; what
  happens to an object when the student leaves) are left open and said so in its
  Status line.
- **No `classroom-updates.json` entry.** Nothing a student sees changes: the
  bracket renders identically, and the only visible difference is that a
  thumbnail which used to fail silently now says so. That is not a classroom
  surface.
