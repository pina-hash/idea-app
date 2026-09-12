# 18 `maps-media` no longer lists for a stranger; a draft photo by key, and the signed-in listing, are still open

- Raised: 2026-09-06  By: prompt 0071, `claude/maps-media-bucket-he0wnn`
- Status: decided 2026-09-12. PUBLIC, drafts included. Nothing is owed and nothing is built.
- Decision: 2026-09-12, Mr. Pina: map photos are public, drafts included. His
  reasoning, in his terms: the editing team is responsible for what goes on the
  map.
- What this settles: both halves this entry left open, in the direction of leaving
  them open, which is its own stated default. (a) A draft-owner photo and an orphan
  stay readable by exact key. (b) A signed-in account listing the bucket is not
  narrowed. So `maps-media` does NOT become private, and no proxy route goes in
  front of `/maps`, which was the cost that made this a trade rather than a bug.
- What does not change: `0186_maps_media_no_anon_listing.sql` stays. It narrowed
  the ANONYMOUS listing to the objects a `maps_photos` row names, which is a
  different thing from what he just kept public -- keeping a photo readable by key
  is not restoring a stranger's ability to enumerate the bucket. The measured
  excess 0186 removed was exactly 2 of 3 objects: the draft-owner photo and the
  orphan, reachable by LISTING. Reading one by key was never what 0186 touched.
- Note: his reasoning is about responsibility, so it is worth being precise about
  what the editing team is responsible for. It is `/maps/edit`, admin-only, gated
  once in that area's own `+layout.server.ts` -- a named group of adults, not the
  student body -- which is why "the team is responsible" is a load-bearing answer
  here and would not be one on a surface any student can upload to.
- Question as raised: whether to close the two things `0186_maps_media_no_anon_listing.sql`
  deliberately left open on the `maps-media` bucket -- (a) any caller reading a
  DRAFT-owner photo or an ORPHANED object by its exact key, and (b) any signed-in
  account listing the bucket in full -- given that closing either means making the
  bucket PRIVATE and putting a proxy route in front of a PUBLIC page.
- Default this assistant would pick: leave both open for now. 0186 closed the half
  that had one defensible answer and no cost; the other half reverses a spec decision
  and puts a function in the render path of a signed-out surface, which is a trade
  with an owner rather than a bug with a fix.

- What was measured, and what closed:
  - As `anon` with no claims, against a real Postgres with the maps chain applied,
    over three objects -- one photo on a PUBLISHED node, one on a DRAFT node, one
    orphan no `maps_photos` row names:
      - read a known key -> **1 row**
      - `select name from storage.objects where bucket_id = 'maps-media'` -> **3 of 3**
      - `select storage_key from public.maps_photos` -> **1 of 3**
      - control, same connection: `select count(*) from public.profiles` ->
        `permission denied for table profiles`
    So the listing was 0163's policy and not RLS being off, and the listing's EXCESS
    over the front door was exactly 2 of 3: the draft-owner photo and the orphan.
  - 0186 narrows the anon select policy on `storage.objects` from
    `using (bucket_id = 'maps-media')` to the objects a `maps_photos` row names. It
    writes NOTHING to `storage.buckets`. After it, the anon listing is byte-for-byte
    the set `select storage_key from public.maps_photos` already returns.

- What stayed open, and why each:
  - **(a) A draft-owner photo and an orphan are still readable BY EXACT KEY**, through
    `/storage/v1/object/public/maps-media/<key>`, by anyone. That is 0163's stated
    trade, quoted from the maps spec 4.4: "a draft photo is fetchable by URL before
    publish; accepted, because everything in this system is destined to be public and
    nothing sensitive is ever photographed into it". Closing it means `public = false`,
    which takes every photo off `/maps` unless a proxy route replaces the URL --
    `/maps` is NOT in `authedPrefixes` and is meant to be opened by a visitor with a
    phone and no account. Reversing 4.4 is not a lane's call.
  - **(b) Any signed-in account can still list the bucket in full.** At Bosco Tech
    that is every student. It is the same tier `0181_avatars_private.sql` and
    `0183_foundry_covers_private.sql` both landed on, so 0186 landing there is
    consistent rather than an oversight. Narrowing it further would also put the
    editor's own upload path against a question this container cannot answer: whether
    storage-api reads `storage.objects` before it writes one.

- The measurement neither this session nor prompt 0057's could take: whether
  `/storage/v1/object/public/<bucket>/<key>` consults RLS at all. There is no Docker
  daemon and no Supabase CLI in this container, so no storage-api ran.
  `0183_foundry_covers_private.sql`'s header states it does not, and 0186 is written to
  be correct under EITHER answer -- which is the whole reason its anon policy is scoped
  rather than dropped: every photo the public map shows is admitted by the new
  predicate, because the public map shows exactly the published-owner photos the
  predicate names. **If the answer turns out to be "it does", one surface notices**: the
  admin shelf editor's thumbnail of a photo just uploaded onto a still-draft owner
  renders the app's own "photo could not be loaded" tile until the owner is published.
  That symptom is named in 0186's header and the one-statement undo is beside it.

- Why it is blocked on him: (a) is a spec decision with his name on it, not a defect;
  (b) is a question about audience -- whether a student browsing the school's shelf
  inventory is a problem at all -- and the answer changes what the maps editor is
  allowed to assume. Neither is urgent now that the internet-facing half is closed.

- What it unblocks: nothing is waiting. 0186 stands on its own and the public map is
  unchanged. Answering "close (a) too" is a private-bucket migration plus a proxy route
  copying `src/routes/api/avatar/[...path]/+server.ts`, and it needs the storage-api
  measurement first. Answering "leave it" costs one line in `CLAUDE.md` recording that
  the bucket is deliberately readable by key.

- ALSO REPORTED, NOT A DECISION: `CLAUDE.md` carries a stale sentence about this same
  bucket. Under "IDEA Maps" it still reads "**THE BUCKET'S `image/*` WILDCARD ADMITS
  SVG AND THE CLIENT REFUSES IT ANYWAY.** An SVG is a document, not a picture, and
  `maps-media` is PUBLIC -- closing it properly is a migration replacing the wildcard
  with a concrete raster list, which no bundle has written yet." That migration is
  `0168_maps_media_types_and_plan_frame.sql` and it is in the tree. Prompt 0071 does
  not own `CLAUDE.md`; the replacement sentence is in its history entry.

- Context: `supabase/migrations/0186_maps_media_no_anon_listing.sql` and its header;
  `tests/maps-media-listing.test.ts` (the before and after pictures, the profiles
  control, and two permissive mutants); `supabase/migrations/0163_maps_media.sql`
  (which made the public call, quoting spec 4.4) and
  `0168_maps_media_types_and_plan_frame.sql` (which closed the SVG half);
  `src/lib/maps/media.ts` (`mapsPhotoUrl`, the one place a maps-media URL is built);
  `docs/standards/IDEA_MAPS_SPEC.md` 4.4; decision 17
  (tournament-thumbs-stay-public), whose default -- "close only its LISTING and leave
  the bucket flag public" -- is the shape 0186 took here; decision 14
  (avatar-bucket-who-may-see-a-face) and `0181_avatars_private.sql`, the pattern for
  the private half if (a) is ever answered.
