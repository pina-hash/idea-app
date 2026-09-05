---
title: "The `avatars` bucket is closed: 0181 makes it private and `to authenticated`, `Avatar.svelte` asks for `/api/avatar/<key>`, and the route mints a signed URL on the caller's own client -- with the GAUNTLET leaderboard proved working without being edited (`claude/avatar-bucket-exposure-wa1f7b`, migration 0181)"
date: 2026-09-05
branches: [claude/avatar-bucket-exposure-wa1f7b]
migrations: ["0181"]
subsystems: ["Profiles", "Storage", "Security", "GAUNTLET", "Classroom", "Notebook"]
---

`0020_profiles_identity.sql` created the `avatars` bucket with `public = true` and
a select policy `to public using (bucket_id = 'avatars')`, and wrote its reasoning
into the file: "avatars are non-sensitive by design (they render on public
leaderboards)". Writes were own-folder only then and are own-folder only now. The
reads were open to the internet, and the things behind them are photographs of
minors at a school.

Two earlier sessions found it and both did the right thing. Prompt 0033 measured it
rather than reading the policy -- a genuinely anonymous caller against a real
Postgres with 0020 applied, reading another person's object -- and left
`tests/db/avatar-bucket-boundary.test.ts` behind as the record. Prompt 0038
confirmed it in its own report. Neither changed it, because neither owned the
bucket, and four more staff surfaces gained a student's face in between.

Files owned and touched: `supabase/migrations/0181_avatars_private.sql` (new),
`src/lib/avatars.ts`, `src/lib/Avatar.svelte`,
`src/routes/api/avatar/[...path]/+server.ts` (new),
`src/routes/dev/avatars/+page.svelte`, `tests/avatar-proxy.test.ts` (new),
`tests/avatar-route.test.ts` (new), `tests/db/avatar-private-bucket.test.ts` (new),
`tools/browser-verify/routes/avatars.mjs`, the generated regions of that tool's
README, `docs/decisions/entries/14-avatar-bucket-who-may-see-a-face.md` (new), the
ledger entry and this file. `src/routes/gauntlet/**` was read-only throughout and
is unchanged.

## The measurement that decided the design

The obvious fix for a guessable path is a longer, random path. That is wrong here,
and the reason is a fact neither earlier session had measured: **with 0020's policy
in force an anonymous caller did not have to guess a key, it could list them.**

    -- as `anon`, no claims, 0001 + 0020 applied, production's grants
    select name from storage.objects where bucket_id = 'avatars' order by name;
    -- 2 rows:
    --   44a3d3ca-.../avatar-1757000000001.png
    --   b4b40903-.../avatar-1757000000000.png

The policy restricted nothing about WHICH rows `public` could select, and a hosted
Supabase project grants `anon` select on `storage.objects` -- which is not inferred,
it is the grant model `tests/classroom-storage-objects.test.ts` already states about
itself and adds to the stub "to match production". The same run's control is what
makes it readable: `select count(*) from public.profiles` as the same caller answers
`permission denied for table profiles`, so the listing above is the policy working
as written and not RLS being off.

So the path was not weak protection. It was none, and a random filename would have
been read straight off the listing. The fix had to be the boundary.

For completeness on the shape that was there: the key is
`${claims.sub}/avatar-${Date.now()}.${ext}`, minted in `ProfileMenu`'s `onUpload`.
The uuid half is not derivable from an email; the other half is a millisecond
timestamp, which is a far smaller space than it looks. It did not matter either way.

## What shipped

**0181, two halves, both needed.** `public = false` on the bucket row is what stops
`/storage/v1/object/public/avatars/<key>` answering at all -- the storage renderer
serves that endpoint only for a bucket flagged public and no policy governs it.
Dropping `avatars public read` for `avatars authenticated read` (`to authenticated`)
is what stops `anon` reading, and listing, through the authenticated and signed-URL
paths, which the flag does not govern. Section 3 asserts both from the catalog, plus
the two negatives: no SELECT policy on that bucket names `public` or `anon` under
ANY name (asked by role, not by policy name), and 0020's three write policies are
still there.

**The client half is one rewrite in one component.** `proxiedAvatarSource` in
`$lib/avatars.ts` turns an `upload:<key>` into `/api/avatar/<key>` and leaves
everything else alone; `Avatar.svelte` calls it once, for both its `profile` and
`subject` paths. Nine surfaces render a face and every one of them mounts that
component rather than building a URL, which is the whole reason the store could be
closed underneath all nine with an edit to none.

**The route mints on the caller's own client.** `locals.supabase` carries the
caller's cookie session, so 0181's policy decides, evaluated as the caller's own
role; with no session that role is `anon` and the mint fails. There is no
service-role client on the path. This is the classroom attachment route's own shape
and its own argument -- the moment a service-role client appears the route becomes
the boundary instead of the database.

**Every refusal is one bodyless 404.** A malformed key, a key of the wrong shape, an
object that never existed, one that was deleted, and a caller with no session are
one response, compared to each other in the test rather than each checked to "be a
404". 403 on one key and 404 on another is an oracle for which of a list of scraped
keys are still live, which is most of what the open bucket handed over.

## Three things worth knowing that are not obvious from the diff

**`profiles.avatar` is free text a person writes about themselves.** 0001's "update
own profile" policy admits any string on your own row; there is no CHECK constraint
and no validating RPC. So `upload:../../anything` is a value the column accepts
today. It was harmless while the URL was a dead public link that produced a broken
image. Pointed at a mint, the same string is an input to a storage key.
`avatarObjectKey` is the ONE predicate that decides whether a value is a key, and
both halves call it -- the client so no such URL is ever built, the route so a
request that arrived some other way is refused anyway. Two spellings of that
question is the pair that stops agreeing, and the half that would go quiet is the
server's.

**A Google photo is deliberately not proxied.** `avatar_url` is a
googleusercontent URL: not in our store, not ours to gate, and routing it through a
proxy of ours would make our server fetch a third party on every roster render for
no boundary at all. `proxiedAvatarSource` reads the RAW `avatar` value rather than
sniffing the resolved URL, so presets (inline SVG, no request) and Google photos are
left alone by construction rather than by a string test.

**The route is under `/api/` and that is forced rather than stylistic.** The first
draft put it at `src/routes/avatar/`, which is what the prompt named, and
`tests/short-link-reserved-names.test.ts` reddened immediately: a top-level SvelteKit
route resolves ahead of the `[shortlink]` catch-all, so the slug `avatar` would
become permanently unreachable, and this repo treats that as a schema change --
`RESERVED_SLUGS` and `_app_short_link_reserved` must name the identical set. 0166
spent a whole migration adding `maps` for exactly this. The fix was drafted (a
section 4 on 0181 plus a line in `$lib/short-links.ts`) and then thrown away in
favour of moving the route, because `api` is already reserved, this is a server
route that needs the server, every other byte-serving route in the tree lives there,
and the move costs nothing anybody has to remember. **The bundle ends having edited
no file outside the things it owns**, which the first draft would not have.

## What was measured

**`tests/db/avatar-private-bucket.test.ts`, 13 tests, and the three controls the
prompt asked for, each with its mutation.** Mutations are applied to a throwaway
DATABASE at the SQL level, never to a file, so there is no file to restore and
`git checkout --` is nowhere near this suite.

| control | result | mutation | did it bite |
| --- | --- | --- | --- |
| anon reads a known key | 0 rows | put 0020's `to public` policy back | yes, 0 -> 1 |
| anon LISTS the bucket | `[]` | same | yes, `[]` -> the key |
| a signed-in peer reads it | 1 row (the decision, not a gap) | peer writes into her folder | refused, RLS |
| the owner reads her own | 1 row | `revoke select on storage.objects from authenticated` | yes, `permission denied`, policy still present |

Two more that the migration rule asks for: 0181 applied over a database seeded
through the REAL pre-migration path (boot short of the file, insert through 0020's
own write policy, apply on top) leaves the object in place under the same key, still
readable by its owner, and no longer readable or listable by `anon`; and the file
re-applies twice with its self-check passing, so a re-paste cannot half-build it.

**`tests/avatar-proxy.test.ts`, 19 tests.** The predicate against eleven traversal
and malformed shapes; the rewrite moving only the upload case; what the component
actually emits (server-rendered), including that a refused-shaped value and no value
at all produce byte-identical markup and neither carries an `<img>`; and three sweeps
of `src/` with positive controls -- no second caller of `avatarUploadUrl`, no new
file building a storage public-object URL (a pinned allowlist of two, both named with
their reason, because the bucket name is INTERPOLATED at the real call site so a
bucket-name regex would have missed it), and the proxy prefix spelled in one module.
**Comments are stripped before every sweep**: both `avatars.ts` and `Avatar.svelte`
carry this whole argument in their headers, naming the endpoint that was closed, so a
sweep over raw bytes reddens on its own documentation.

**`tests/avatar-route.test.ts`, 9 tests**, driving the real handler. Two mutations,
both restored from a `cp` copy and both md5-verified: answering 403 for a
sessionless caller reddens the identical-refusal test, and deleting the key predicate
outright (the permissive direction) reddens it too.

**The GAUNTLET leaderboard, proved rather than assumed.** It is read-only to this
bundle and it is the constraint the whole design was shaped around. Two assertions:
the page mounts `$lib/Avatar.svelte`, contains no `avatarUploadUrl` and no storage
URL of its own; and the real component, rendered against the leaderboard's OWN row
shape (`toProfile(row)` over an `OverallRow`), emits `/api/avatar/<key>` and no
storage URL.

**Browser, 375px and 1440px, 104 measurements, 0 outside threshold.** Chromium
141.0.7390.37 at `/opt/pw-browsers`. `/dev/avatars` gained `p-upload-refused`, which
is the REAL refusal and not a fabricated one: a well-formed key for a uuid belonging
to nobody, so the browser genuinely requests `/api/avatar/<key>` and the route
genuinely answers its bodyless 404 with no session behind it. That is the one request
this harness makes, and it used to make none -- the trade bought the only claim worth
making here.

The new probe compares the rendered appearance of the three empty states and the one
full one:

    refused matches absent: SPAN|initials|SS|11px|rgb(225, 177, 152)|28x28
    a real picture is still distinguishable

Three genuinely different mechanisms land there -- `p-none` never had a src,
`p-upload-broken` carries a malformed key the CLIENT refused with no request made,
`p-upload-refused` carries a well-formed key the SERVER refused over the wire -- and
`p-loads` is compared in the other direction so three identical empties cannot
satisfy the row if every avatar on the page had stopped rendering.

**The probe was drafted wrong first and the wrongness is worth recording**, because
the next person to compare two rendered nodes will hit it. Comparing `innerHTML`
reported DIFFER for two invisible reasons:

    none          <!--[-1--><span ... style="font-size:11px">SS</span>
    serverRefused <!--[0--><span ... style="font-size: 11px;">SS</span>

Svelte's branch anchor carries `-1` for a branch rendered on the server that never
moved and `0` for one the client switched after `onerror`; and the inline style is
re-serialized by the CSSOM once the browser has touched it. Same element, same class,
same text, same computed value, two spellings. The probe reads the tag, the class
(scope hash stripped, so an unrelated restyle cannot redden it), the text and the
COMPUTED font-size, colour and box -- which is the list of things a person looking at
the screen could tell apart.

**And the probe was mutation-proved on the real page**: making a failed image paint
`!` in red instead of the initials reddens it with
`DIFFER: ... server=SPAN|initials|!|...`. `Avatar.svelte` restored md5-identical.

**Against a live dev server**, the unauthenticated case a crawler holding a scraped
key would make: `404`, 0 bytes, 2.7-12.1ms over five requests, and no Supabase round
trip at all (the `claims` check short-circuits before the mint). The rendered
`/dev/avatars` document carries `src="/api/avatar/..."` and no
`/storage/v1/object/public/` anywhere.

**`svelte-check`: 0 errors, 37 warnings, breakdown 31 `state_referenced_locally` /
5 `css_unused_selector` / 1 `perf_avoid_nested_class`.** Re-derived rather than
trusted: `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` exported as
placeholders first, then `svelte-kit sync`, per the missing-`.env` rule.

## Cost

The request COUNT per page does not change. Every uploaded avatar was already one
image request; it is still one image request, now to our origin, which redirects. The
number of proxied images is the number of people ON that page who chose an UPLOAD --
presets are inline SVG and make no request at all, and Google photos go straight to
googleusercontent untouched -- so it is bounded by the roster and is in practice much
smaller. What is added per such image is one Vercel invocation, one Supabase
`createSignedUrl` call (asserted at exactly one per request), and one redirect hop.
The `private, max-age=60` on the 302 caps that at one invocation per image per minute
per viewer: longer would mean somebody who signed out keeps rendering faces from
cache, shorter would mean an invocation per face per paint.

The largest page is the GAUNTLET leaderboard at `p_limit: 100`. A hundred rows where
every student had uploaded a photograph would be a hundred redirects and a hundred
sign calls in the first minute of a page's life. **This was not measured against
production** and the honest reading is that it is the ceiling rather than the
expectation.

**A signed-URL mint at the page LOAD was priced and rejected**, and it is the design
most people would reach for. `createSignedUrls` takes an array, so thirty faces is
one round trip and not thirty -- the cost was never the problem. It is disqualifying
for a different reason: it has to happen in a `+page.server.ts`, and
`src/routes/gauntlet/leaderboard/+page.server.ts` is read-only to this bundle. A
design that cannot close the store without editing the one surface it may not touch
cannot ship. It also expires: a page left open past the TTL shows broken images on
its next render, where the proxy URL is stable forever.

## Other public buckets, swept

Thirteen buckets across the migration history. Six are public: `avatars` (this
bundle), `gauntlet` (0009) and `gauntlet-tools` (0031), both staff-authored challenge
assets; `foundry-covers` (0130) and `tournament-thumbs` (0062), both **student
uploads under an own-folder write policy and a `to public` read** -- a student can
put any image in either and the world can read it; and `maps-media` (0163),
admin-written photographs of a toolbox.

Seven are private: `foundry-uploads`, `foundry-bundles`, `classroom-attachments`,
`submission-files`, `instructor-attachments`, `greenline-decals`, `feedback-media`.

**`avatars` was the only public bucket holding a person's face by design**, which is
why it is the one this bundle closed. `foundry-covers` and `tournament-thumbs` are a
smaller version of the same shape and are named here as a finding rather than fixed:
neither is a photograph of a student by construction, both are attached to something
the student chose to publish, and both are outside this bundle's ownership.

## What is NOT verified

- **Nothing was run against the live Supabase project.** The local `.env` is the
  placeholder project; no migration was applied, no RPC called, no session signed in.
  0181 has not been applied to production and the app half is not deployed.
- **Whether the hosted Storage API's `list` endpoint surfaces the enumeration.** What
  was measured is the SQL fact -- the policy admits `anon` to every row in the bucket
  and a hosted project grants `anon` select on `storage.objects`. Whether
  `POST /storage/v1/object/list/avatars` answers an unauthenticated caller was not
  tested against a real project. **The other half needs no such caveat**: the
  `/object/public/<bucket>/<key>` endpoint served any object in a public bucket to
  anybody, which is what the app itself relied on.
- **The 302 path end to end.** Every test drives the route with a Supabase stand-in;
  no real signed URL was minted or followed, because that needs a live project.
- **Production latency and the real proxied-image count per page**, for the reasons
  in Cost.
- `prefers-reduced-motion` is `no-preference` in the harness, and web fonts are
  blocked, so text is measured in the fallback stack.

## Deferred

- **`avatarUploadUrl` still exists in `$lib/profile.ts`** and `avatarSource` still
  calls it internally to build a source `Avatar.svelte` then rewrites. CLAUDE.md says
  a retired path is removed rather than left dormant; that file is outside this
  bundle's ownership, so what stands in for the deletion is a sweep asserting it has
  no other caller in the tree, and an allowlist line naming it with its reason. It is
  a one-line follow-up for whoever next owns `$lib/profile.ts`.
- **Who may see whose face** is decision 14 and is the whole of what this bundle did
  not settle. `to authenticated` is exactly the tier every avatar surface already sat
  in, and the GAUNTLET leaderboard has published every student's face to every other
  student since 0024.
- **A student's object outlives the student.** Nothing expires an avatar when an
  enrollment ends, an account is disabled, or somebody leaves.
- **Two pre-existing suite failures** in `tests/derived-numbers.test.ts`, confirmed
  against `origin/integration` before touching anything: four route specs in the tree
  (`spec-table-rows-12.mjs`, `themes.mjs`, `themes-signedout-1.mjs`,
  `themes-state-matrix.mjs`) that the recorded measured region never covered. Not
  this bundle's, and cleared by its own `verify:readme` run.

## Cold apply

One migration, `supabase/migrations/0181_avatars_private.sql`, pasted into the
Supabase SQL editor. It expects 0020 applied (every production database has it) and
nothing else.

Watch for `avatars: public = false, 1 authenticated read policy, 0 public/anon read
policies, 3 write policies intact`. Anything else raises and rolls the file back
rather than half-applying it.

**Ordering with the deploy is free, which is unusual here and worth stating.**
Neither half is correct alone and neither failure breaks a page:

- file applied, app not deployed -> every uploaded avatar renders as its initials
  tile, through the `onerror` fallback `Avatar.svelte` has carried since 0033. No
  hole, no broken glyph, no row movement, and presets and Google photos are
  unaffected.
- app deployed, file not applied -> the proxy works, because a signed URL is mintable
  against a public bucket too. The bucket simply stays open until the file lands,
  which is the state of the world today.

**What undoes it**, in full, destroying nothing:

    update storage.buckets set public = true where id = 'avatars';
    drop policy if exists "avatars authenticated read" on storage.objects;
    create policy "avatars public read" on storage.objects for select
      to public using (bucket_id = 'avatars');

## No classroom update entry

`classroom-updates.json` is deliberately untouched, said here rather than left
silent. No surface a student can reach changes. Every component that renders an
avatar was checked -- `ProfileMenu`, `PeoplePanel`, `GradingConsole`, `SectionGrid`,
`EntryReview`, `ReviewConsole`, `/dashboard`, the GAUNTLET leaderboard and two `/dev`
harnesses -- and none is on the public tier. `ProfileMenu` is in every page header
including the signed-out ones, but it renders the VIEWER's own row, which is null
with no session, so a signed-out page requests no avatar at all. A student's own
picture, and every classmate's face on the leaderboard, look exactly as they did.
