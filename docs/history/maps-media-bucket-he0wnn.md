---
title: "The last bucket a stranger could enumerate: 0186 narrows `maps-media`'s anon read to the objects `maps_photos` names, the bucket stays public so the signed-out map keeps its photos, and a refused photo stops rendering as a broken image (`claude/maps-media-bucket-he0wnn`, migration 0186)"
date: 2026-09-06
branches: [claude/maps-media-bucket-he0wnn]
migrations: ["0186"]
subsystems: ["IDEA Maps", "Storage", "Security"]
---

Prompt 0052 closed `avatars` (0181). Prompt 0057 closed `foundry-covers` (0183),
left `tournament-thumbs` open deliberately because the bracket is a signed-out
spectator surface, and swept all fourteen buckets, naming one more with the same
shape. This bundle measured that one and closed the half of it that had a
defensible answer.

**`maps-media` is different from both of the buckets before it, and that
difference is the whole design.** `avatars` and `foundry-covers` are rendered only
behind a session, so both could be flipped private with a proxy in front.
`/maps` is deliberately NOT in `authedPrefixes` -- the IDEA Maps viewer is a public
page a visitor opens with a phone and no account -- so the bucket cannot close its
READS without a spec reversal. What it could close, and did, is the LISTING.

Files owned and touched: `supabase/migrations/0186_maps_media_no_anon_listing.sql`
(new), `tests/maps-media-listing.test.ts` (new),
`src/routes/dev/maps-media/photos/+page.svelte` and `+page.ts` (new),
`src/routes/dev/maps-media/o/[...path]/+server.ts` (new),
`tools/browser-verify/routes/maps-media-photos.mjs` (new),
`tools/browser-verify/README.md` (generated regions),
`src/lib/maps/media.ts` (comments only, no behaviour),
`src/lib/maps/viewer/MapsItemCard.svelte` (the two out-states),
`docs/decisions/entries/18-maps-media-draft-photos-and-the-signed-in-listing.md`
(new), `docs/prompt-ledger/entries/0071-maps-media-bucket.md` (new), this file.

## What was measured

As `anon` with `set role anon` and no claims, against a real embedded Postgres
carrying 0001, 0003, 0020, 0067, 0137, 0161, 0162, 0163, 0165, 0168 and 0172, over
three objects written into `maps-media` -- one named by a photo row on a PUBLISHED
node, one named by a photo row on a DRAFT node, and one ORPHAN no `maps_photos` row
names:

| reading | before 0186 | after 0186 |
| --- | --- | --- |
| read a known key | 1 | 1 |
| `select name from storage.objects where bucket_id = 'maps-media'` | **3 of 3** | **1 of 3** |
| `select storage_key from public.maps_photos` | 1 of 3 | 1 of 3 |
| control: `select count(*) from public.profiles`, same connection | `permission denied for table profiles` | same |

The control is what says the listing was the POLICY and not RLS being off, and it
is prompt 0052's control re-run rather than its result borrowed.

**The third row is the argument for the whole bundle.** `maps_photos` is
anon-readable by 0163 and its own policy already restricts an anonymous caller to
photos whose owner is published, so 1 of the 3 keys was public through the front
door already. The storage listing's EXCESS was exactly the other two: photos on
DRAFT owners, and orphaned objects. Those are an inventory of a school's rooms and
toolboxes including the parts nobody has published yet, readable by anyone on the
internet with no session and no guessing.

## The design, and the two things it does not do

0186 drops 0163's `maps_media_public_read` (`to anon, authenticated using
(bucket_id = 'maps-media')`) and puts two policies in its place:

- `maps_media_authenticated_read`, `to authenticated`, bucket only -- exactly the
  reach a signed-in caller had before. This is 0181's and 0183's landing tier.
- `maps_media_published_read`, `to anon`, scoped to
  `exists (select 1 from public.maps_photos p where p.storage_key = storage.objects.name)`.

**The published-owner test is deliberately not written in that predicate.** A policy
expression is evaluated as the QUERYING role, so the subquery is itself filtered by
`maps_photos`'s own RLS -- which for `anon` is 0163's `maps_photos_public_read`, the
one statement in this schema of which photos a stranger may see. Restating
`status = 'published'` in the storage policy would be a second copy of that rule,
able to stop agreeing with it. The storage read now FOLLOWS the row read.

**It writes nothing to `storage.buckets`.** Not the public flag, not
`file_size_limit`, not `allowed_mime_types`. 0168 owns the mime list and 0185 owns
the limit, and a restatement here is a chance to disagree with them.

**The bucket stays public, so the reads do not move.** `mapsPhotoUrl` builds the
same `/storage/v1/object/public/maps-media/<key>` before and after, and
`MapsItemCard` renders the same plain `<img>`.

## The measurement this container could not take, and why the file is safe anyway

Whether `/storage/v1/object/public/<bucket>/<key>` consults RLS at all. There is no
Docker daemon and no Supabase CLI here, so no storage-api ran.
`0183_foundry_covers_private.sql`'s header states it does not ("the storage renderer
serves that endpoint only for a bucket flagged public, and no policy governs it"),
which is the expected behaviour and is cited rather than re-measured. Prompt 0057
declined to narrow `tournament-thumbs` on exactly this gap.

**The anon policy is SCOPED rather than dropped precisely so the answer does not
matter.** If the public endpoint ignores RLS, no rendered photo changes at all. If
it honours RLS as `anon`, every photo the PUBLIC MAP shows is still admitted,
because the public map shows exactly the published-owner photos the predicate names
-- the two sets are the same set by construction. That is why this bundle could ship
the narrowing prompt 0057 had to defer.

**One surface would notice under the second answer, and its symptom is written into
0186's header so it is diagnosed in seconds:** the admin shelf editor's thumbnail of
a photo just uploaded onto a still-DRAFT owner, fetched over the same public URL,
would render the app's own "photo could not be loaded" tile until the owner is
published. `ShelfEntry.svelte` has had that fallback since it shipped; this bundle
gave the public viewer the matching one.

## The client half

`MapsItemCard` rendered a refused or missing photo as the browser's own broken-image
icon under a caption, which reads as a bad upload -- on a page whose audience is a
visitor with no account and no way to report anything. It now has four states:

- **present** the object answered with bytes that decode;
- **absent** no photos, so no photo region at all -- not an empty one;
- **refused** `mapsPhotoUrl` answered empty (no configured project), judged locally
  with NO REQUEST MADE, which is why naming it tells a stranger nothing;
- **failed** the request was made and produced no picture. Several causes land here
  on purpose and the page must not distinguish them.

The two out-tiles were DASHED and identical in the first pass, and the browser
probe caught it: it compares what the four states PAINT, and reported them as one
appearance differing only in words. They are now dotted (refused) and dashed
(failed), which is the notebook grid's own rule about a fill style no other state
uses. `src/lib/maps/media.ts` changed in comments only -- the stale paragraph
claiming the bucket's list is still the `image/*` wildcard, which 0168 replaced.

## Verification

- **`npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings**, breakdown
  31 `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class` -- the baseline, unmoved. `PUBLIC_SUPABASE_URL` and
  `PUBLIC_SUPABASE_ANON_KEY` were exported to placeholders before the sync; without
  that this checkout reports 13 phantom errors, not the 11 `CLAUDE.md` records, and
  the two extra are `src/routes/maps/edit/shelf/+page.svelte`.
- **`tests/maps-media-listing.test.ts`, 16 tests**: the table above as paired
  before/after readings on one seeded database, the `profiles` control on both
  sides, the catalog claims re-read rather than trusted, a re-apply, and two
  PERMISSIVE mutants applied IN-DATABASE on their own disposable databases --
  dropping the `maps_photos` clause, and making it row-independent
  (`p.storage_key is not null`, which still names the table and would sail past any
  policy-text assertion). Both put the full 3-of-3 listing back. No migration file
  was edited at any point and the test asserts the md5s of the three it reads.
- **`npm run verify:browser` on `/dev/maps-media/photos` at 375 and 1440**: 56
  measurements, 0 outside threshold. The four states are four distinct appearances,
  card width identical in all four, photo box width identical in all three that draw
  one. Height is deliberately NOT asserted equal and the spec says so: a placeholder
  cannot know the height of the photo that did not arrive, so the out-tiles carry a
  stated 4/3 guess and what holds is the column.
- **The neighbouring maps harnesses, re-run after the `MapsItemCard` change**:
  `/dev/maps-media`, `/dev/maps-viewer` and `/dev/maps-shelf`, 20 route/width runs,
  378 measurements, 0 outside threshold.
- **`npm run verify:counts` then `npm run verify:readme`**, the second on a clean
  tree at commit `495eae0` (`dirty: false`): 117 route specs over 58 routes, 87
  `/dev` pages, **234 route/width runs, 3466 measurements, 2 outside threshold**,
  556.6s wall clock, `--selftest` 70 controls (36 negative, 34 positive), 0
  instrument failures. `covered` is 117, matching the static region's spec count, so
  the measured half is measured against THIS tree. The 2 outside threshold are the
  two standing `/dev/notebook` `tap-reach` rows at 375 and 1440 (decision 12, with
  the owner) and are unchanged by this bundle.
- **`npm test`: 291 files, 5943 tests, 290 files and 5941 tests passing.** Run
  2026-09-06 00:56:47 to 01:00:22 America/Los_Angeles, 214.09s. **`npm run check`
  (the package script): 2998 files, 0 errors, 37 warnings, 20 files with problems.**

**THE TWO FAILURES ARE PRE-EXISTING ON `origin/main` AND WERE MEASURED THERE RATHER
THAN ASSUMED.** `tests/gauntlet-doc.test.ts` fails on both "agrees with
docs/GAUNTLET.md and docs/GAUNTLET-DESIGN.md" and "covers every GAUNTLET migration
in the tree", because `0184_gauntlet_run_event_bounds.sql` landed on `main` and
neither document mentions it (`grep -c 0184` answers 0 in both). Checked out
`origin/main` in a throwaway worktree, ran that one file, and got the identical two
failures, 14 passing. This bundle touches no GAUNTLET file and does not own either
document.

**AND STARTING FROM `origin/integration` COST ONE ROUND, WHICH IS WORTH RECORDING.**
`origin/integration` was strictly BEHIND `origin/main` -- zero commits main did not
have, four commits it lacked -- and one of them was
`0185_bucket_limits_under_the_global.sql`. So the first full run reddened
`tests/db/migration-0177-tombstone.test.ts` with "the migration series has a hole in
it: expected [185] to deeply equal []", which is that test doing exactly its job:
0186 numbered over a file the branch could not see. `origin/main` was merged into
the branch (`--no-edit`, one file, no conflict) and the hole closed. A lane numbering
a migration off a branch that is behind main will hit this every time.

## Deploy order

1. **Deploy the app** (`MapsItemCard`'s four states, `media.ts`'s comments, the two
   dev routes and the spec).
2. **Apply `supabase/migrations/0186_maps_media_no_anon_listing.sql` by hand** in the
   Supabase SQL editor.

**What breaks if reversed: nothing, and saying so plainly is more useful than
inventing a hazard.** 0183's order was forced -- the app had to stop asking a public
URL before the bucket stopped answering one, and the reverse broke every avatar on
the site on 2026-09-05. Here the READ PATH DOES NOT MOVE: `mapsPhotoUrl` builds the
same URL before and after and the bucket keeps its public flag, so applying 0186
against the currently deployed app changes nothing a visitor sees. App first is
still the order to take, for the smaller reason: the app half is the fallback tile
that makes the unmeasured storage-api risk legible if it fires, and deploying it
first costs nothing.

**The one-statement reversal**, re-asserting 0163 exactly:

```sql
drop policy if exists maps_media_published_read on storage.objects;
drop policy if exists maps_media_authenticated_read on storage.objects;
create policy maps_media_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'maps-media');
```

Nothing is destroyed by 0186, so the undo is total and safe to run at 8am without
reading anything else.

## Cold apply steps for 0186

1. Confirm 0163 is applied: `select id, public, allowed_mime_types from
   storage.buckets where id = 'maps-media';` must return one row.
2. Paste `supabase/migrations/0186_maps_media_no_anon_listing.sql` whole into the
   Supabase SQL editor and run it. It is one transaction's worth of drop-then-create
   statements and re-pasting it re-asserts the end state.
3. Read the notices. The census prints, before anything changes, how many objects the
   bucket holds, how many a `maps_photos` row names, how many of those hang off a
   published owner, and therefore how many leave the anonymous set. On the test
   fixture that reads: `maps-media holds 3 object(s). 2 of them are named by a
   maps_photos row; 1 of those hang off a PUBLISHED owner.` and `an anonymous caller
   could list 3 object(s) before this file and can list 1 after -- 2 object(s) leave
   the anonymous set`.
4. The self-check raises rather than notices if any of it is wrong -- an unscoped
   public/anon select policy still present, the wrong policy count, a lost write
   policy, or a bucket row somebody else has moved.
5. Confirm afterwards, which is the reading that matters:
   `select policyname, roles, qual from pg_policies where schemaname = 'storage' and
   tablename = 'objects' and policyname like 'maps\_media\_%' order by policyname;`
   -- there must be no SELECT policy naming `anon` whose `qual` does not mention
   `maps_photos`.

**No `docs/migrations-applied/` record accompanies this bundle, because the
migration was NOT applied.** This container has no route to the live project: the
local `.env` is a placeholder (`example-ref`), there is no Docker daemon and no
Supabase CLI. The apply is Mr. Pina's, from the steps above.

## Reported, not owned

`CLAUDE.md` carries a stale sentence about this bucket, under "IDEA Maps". It reads:

> **THE BUCKET'S `image/*` WILDCARD ADMITS SVG AND THE CLIENT REFUSES IT ANYWAY.**
> An SVG is a document, not a picture, and `maps-media` is PUBLIC -- closing it
> properly is a migration replacing the wildcard with a concrete raster list, which
> no bundle has written yet.

`0168_maps_media_types_and_plan_frame.sql` wrote that migration. It replaced the
wildcard with six concrete raster types (jpeg, png, webp, heic, heif, avif) and
raises at apply time if any SVG spelling survives or if any entry still carries a
`*`. Prompt 0073 found the same staleness independently. The sentence that paragraph
should carry:

> **THE BUCKET ADMITS SIX CONCRETE RASTER TYPES AND THE CLIENT REFUSES SVG BEFORE
> THE TRANSFER.** 0168 replaced 0163's `image/*` wildcard -- which matched
> `image/svg+xml`, a document rather than a picture, on a PUBLIC bucket -- with
> jpeg, png, webp, heic, heif and avif, and raises at apply time if a wildcard or
> any SVG spelling survives. `mapsImageMime` refuses SVG by declared type AND by
> extension as the first of the two gates, so the person reads a sentence rather
> than a Storage error after the upload. **AND SINCE 0186 AN ANONYMOUS CALLER
> CANNOT LIST THE BUCKET**: the `anon` select policy on `storage.objects` is scoped
> to the objects a `maps_photos` row names, so a stranger reads exactly the keys
> `maps_photos` already hands them. The bucket is still PUBLIC, so any object is
> still readable by its EXACT KEY -- spec 4.4's accepted trade, and
> `docs/decisions/entries/18-maps-media-draft-photos-and-the-signed-in-listing.md`
> is where closing it is owed a decision.

`src/lib/maps/media.ts` carried the same stale claim in its own header and that copy
IS owned by this bundle, so it is corrected in place with the old wording quoted
above the correction.

## What was deliberately not done

- **The bucket was not flipped private and no proxy route was written.** That
  reverses spec 4.4 and puts a function in the render path of a signed-out page.
  Decision 18.
- **The signed-in listing was not closed.** Same tier 0181 and 0183 landed on, and
  narrowing the writer's own role would put the editor's upload against the
  storage-api question above. Decision 18.
- **Nothing was done about the mime list.** 0168 closed it; the prompt said so and
  the tree agreed.
- **No changelog entry.** Nothing a student sees changes: the public map renders the
  same photos from the same URLs. The one visible difference is a failure state that
  used to be a broken-image icon, which is not a change to what the class does.
- **`ShelfEntry.svelte` was not touched.** It already had the fallback; adding a
  second spelling of it is the duplication rule this repo keeps.
