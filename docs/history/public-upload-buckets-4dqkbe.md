---
title: "The same hole one subsystem over: 0183 closes `foundry-covers`, every cover goes through `/api/foundry-cover/<key>`, and `tournament-thumbs` is left open deliberately because the bracket is a public spectator surface (`claude/public-upload-buckets-4dqkbe`, migration 0183)"
date: 2026-09-05
branches: [claude/public-upload-buckets-4dqkbe]
migrations: ["0183"]
subsystems: ["Foundry", "Tournaments", "Storage", "Security"]
---

Prompt 0052 closed the `avatars` bucket (0181) and swept the other twelve, naming
two with the identical shape: `foundry-covers` from `0130` and `tournament-thumbs`
from `0062`. Both are student uploads, both are own-folder write, and both read
`to public using (bucket_id = '...')` with no further predicate. This bundle
measured both, closed one, and left the other open on purpose with the reasoning
written down where somebody can disagree with it.

Files owned and touched: `supabase/migrations/0183_foundry_covers_private.sql`
(new), `src/lib/foundry/covers.ts` (new),
`src/routes/api/foundry-cover/[...path]/+server.ts` (new),
`src/lib/foundry/forge.css`, `src/lib/foundry/FoundryDetail.svelte`,
`FoundryGallery.svelte`, `FoundryInspector.svelte`, `FoundryMine.svelte`,
`ReviewQueue.svelte`, `src/routes/foundry/+page.svelte`,
`src/routes/foundry/mine/+page.svelte`, `src/routes/foundry/review/+page.svelte`,
`src/routes/dev/foundry-covers/**` (new),
`tests/db/foundry-cover-private-bucket.test.ts` (new),
`tests/db/tournament-thumb-stays-public.test.ts` (new),
`tests/foundry-cover-url.test.ts` (new),
`tools/browser-verify/routes/foundry-covers.mjs` (new), the generated regions of
`tools/browser-verify/README.md`, `docs/decisions/entries/15-*.md` (new), the
ledger entry and this file.

## What was measured, and the control that makes it mean anything

Against a real Postgres with the relevant chains applied, as `anon` with no
claims, over objects written through each bucket's OWN write policy:

| bucket | `buckets.public` | anon reads a known key | anon LISTS the bucket |
|---|---|---|---|
| `foundry-covers` | `true` | 1 row | every key |
| `tournament-thumbs` | `true` | 1 row | every key |

On the same connection, `select count(*) from public.profiles` answered
`permission denied for table profiles`. That is 0052's control re-run rather than
its result borrowed, and it is the whole reason the listing figures mean anything:
without it, two open reads and a wide listing are equally consistent with RLS
simply being switched off on the fixture, which would say nothing about
production.

So in both buckets a stranger did not have to guess a key. That is what ruled out
the design most people reach for first, keeping the bucket public and moving to
unguessable keys: a random key defends against guessing and not at all against a
directory listing. The keys were already random -- all three cover upload sites
build `<uid>/<uuid>.<ext>` -- and it bought nothing.

## What closed

0183 is 0181 with one bucket changed. Both halves, because each governs a
different path and neither is sufficient: `public = false` stops
`/storage/v1/object/public/foundry-covers/<key>` answering, and replacing
`foundry covers public read` with `foundry covers authenticated read` stops `anon`
reading and LISTING through the authenticated and signed-URL paths.

`to authenticated` is exactly the tier every surface that renders a cover already
sat in. `/foundry` is in `authedPrefixes` and the gallery deliberately shows every
signed-in student every published app, so nothing about who sees whose work moved.
The sentence that changed is narrow: **a stranger could read and enumerate every
cover in the bucket before and reads nothing now, and a key scraped out of a
gallery's HTML stops working the moment its holder signs out.**

### The URL was built in three places, and now in one

`src/routes/foundry/+page.svelte`, `.../mine/+page.svelte` and
`.../review/+page.svelte` each carried a byte-identical

    data.supabase.storage.from(FOUNDRY_COVER_BUCKET).getPublicUrl(path)

and handed the result down as the `coverUrl` prop -- which was correct while the
bucket was public and is a rendered-nothing bug the moment it is not. They call
`foundryCoverUrl` in `$lib/foundry/covers.ts` now. The components' prop stays
injected, so the bucket layout is still something a route knows and a component
does not; what changed is its type, from `(path) => string` to
`(path) => string | null`.

`tests/foundry-cover-url.test.ts` sweeps `src/` for a fourth call site and was
mutation-proved by putting one back: two rows reddened, and the file was restored
from a `cp` copy and md5-checked identical (`a6b7179f...` both sides). **The sweep
strips comments before matching**, which is not tidiness -- its own subject is
discussed in prose across four headers, and the first draft reported
`covers.ts`'s documentation as the defect. A sweep that matches prose can also be
silenced by rewording a comment.

### `foundryCoverObjectKey`, and why the route needs its own predicate

`student_apps.cover_path` is checked by `_classroom_deck_path_ok` -- the BUNDLE
path rule, borrowed -- which admits any relative multi-segment path up to 400
characters. So the column can hold a value no upload ever produced, and pointing
a MINT at a column is not the same as pointing a dead public link at one. This is
`avatarObjectKey`'s argument about `profiles.avatar` one subsystem over, and it
gets the same shape of answer: one predicate, called by the client so no such URL
is ever built and by the route so a request that arrived some other way is
refused anyway.

### Four cover states, and the two that stay identical on purpose

A cover now renders four ways rather than two, and the split is **between what the
browser can judge alone and what it had to ask about** -- never between the
reasons the server had.

* `present` a key, bytes arrive.
* `absent` `cover_path` null. The pre-existing empty tile.
* `refused` the stored value is not a key. `foundryCoverUrl` answers null in the
  browser with **no request made**, so naming this state costs no information.
* `failed` the request was made and produced no picture. **The server refusing it
  and the bytes not decoding are ONE rendering, deliberately**, because
  `/api/foundry-cover` answers one bodyless 404 to both: a 403 on one key and a
  404 on another is an oracle for which scraped keys are still live, which is most
  of what the old public bucket handed over.

The two fallback appearances are declared once in `forge.css` rather than five
times in five components' scoped blocks, because five components draw a cover into
five differently-classed boxes and Svelte scopes a rule to the component it is
written in. Neither rule sets a width, a height, a margin or a display -- each is a
border, a fill and a hatch drawn inside geometry the call site already set -- which
is what makes the no-reflow property structural rather than tuned.

## What did not close, and why that is the finding rather than the gap

`tournament-thumbs`. Three independent places say the bracket is public on
purpose: `/tournaments` is not in `authedPrefixes`; `0062` grants `select` on
every tournament table to `anon` under `using (true)`; and the `[id]` page load's
own header reads "fully PUBLIC (no session, no cookie needed)". Giving it the
Foundry treatment is not a fix, it is a public bracket that stops showing
thumbnails in front of exactly the audience it was built for.

And the exposure is differently shaped, which is the part worth knowing.
`tournament_entries.thumbnail_url` stores the **whole public URL** in a table any
anonymous caller may select -- measured, not inferred -- so for an entry thumbnail
the storage listing is a second door to a room whose front door is deliberately
open. What a narrowing would actually buy is the residue: the objects **no public
row names**, which is 0064's banner art plus replaced and orphaned uploads.
`tests/db/tournament-thumb-stays-public.test.ts` measures that residue directly,
with a positive control on the same reading so "everything is residue" cannot pass
on a broken key comparison.

### The measurement this container could not make

The narrowing that closes the residue without touching the bracket is: leave
`buckets.public = true` and change only the SELECT policy. That rests on 0181's
claim that the flag governs `/object/public/` and the policy governs the rest --
a claim about the storage-api HTTP renderer, not about Postgres. **This container
has the embedded-Postgres harness and a Chromium and no Docker daemon and no
Supabase CLI**, so there is no running storage-api to put a request to. If the
claim is wrong, every thumbnail on the public bracket breaks for every signed-out
spectator. So it is written up in decision entry 15 with the one `curl` that
settles it, rather than shipped on a reasoned guess.

## THE DEPLOY ORDER. APP FIRST, MIGRATION SECOND.

1. **Merge the app half and let Vercel deploy it.** Every cover keeps rendering
   throughout: a signed URL is mintable against a PUBLIC bucket too, so
   `/api/foundry-cover/<key>` works before the bucket closes. The bucket stays
   open until step 2, which is the state of the world today.
2. **Then paste `supabase/migrations/0183_foundry_covers_private.sql` into the
   Supabase SQL editor.** The bucket goes private and the covers keep rendering,
   because step 1 already moved every surface onto the proxy.

**Reversed, every cover on every Foundry surface is a broken image** -- the pages
would still be asking `/storage/v1/object/public/foundry-covers/<key>` of a bucket
that had stopped answering, and it stays broken until the app half merges. That is
not hypothetical: on 2026-09-05 the avatar bundle applied 0181 before its app half
deployed and every avatar on the site broke until the merge landed. There is no
window in the correct order, so take it.

### The reversal, for when something is wrong at 8am

Three statements, and nothing needs to be reasoned about first:

    update storage.buckets set public = true where id = 'foundry-covers';
    drop policy if exists "foundry covers authenticated read" on storage.objects;
    create policy "foundry covers public read" on storage.objects for select
      to public using (bucket_id = 'foundry-covers');

**The app half does NOT have to be reverted with it** -- a signed URL is mintable
against a public bucket, so the proxy keeps working across the undo and the pages
are correct either way. `tests/db/foundry-cover-private-bucket.test.ts` executes
these three statements and asserts the bucket comes back to exactly the state 0130
left it in, because a reversal nobody has run is a paragraph.

## What was verified

* **The four controls, each with its mutation**, in
  `tests/db/foundry-cover-private-bucket.test.ts` (16 tests): anon reads a known
  key REFUSED, anon lists REFUSED, the owner reads their own ALLOWED, a signed-in
  peer reads ALLOWED. Control 1's mutation puts 0130's `to public` policy back and
  both refusals flip; control 3's revokes the table grant and the permitted read
  stops with the policy untouched, which is what separates the grant from the
  policy; control 4's narrows the policy to own-folder and the peer flips while
  the owner holds -- so control 4 is an assertion about the DECISION rather than a
  restatement that the policy admits `authenticated`. Every mutation is applied to
  a throwaway database at the SQL level, so there is no file to restore.
* **The migration over seeded pre-migration data**: the chain booted short of
  0183, an object written through the real pre-migration upload path, the exposure
  measured (reads 1, lists it, `profiles` refused), the file applied over the top,
  and the object still present under the same key. Nothing was backfilled and
  nothing needed to be. It re-applies twice cleanly.
* **The route driven as the real handler** (`tests/foundry-cover-url.test.ts`, 18
  tests): the 302, `private, max-age=60`, the TTL asserted GREATER than the cache
  max-age rather than pinned at 120, the mint on the caller's own client, and the
  three refusal causes compared **to each other** rather than each checked to be
  "a 404" -- which would pass on three different 404s carrying three different
  bodies.
* **The browser pass**, `/dev/foundry-covers` at 375px and 1440px: 44
  measurements, **0 outside threshold**, 0 console errors. The `prepare` wait keys
  on the `data-cover-failed` attribute only the error handler can produce, and it
  is reported as a measurement (427ms at 375, already satisfied at 1440) so a page
  that never reached the state fails loudly instead of measuring the frame it was
  about to leave.
* **The geometry probe was mutation-proved twice, and the FIRST version was
  wrong.** Giving `.fg-cover-bad` a `min-height` reddened both widths and printed
  the real figures (cover box `64x48` in all four states; card box `327x66` at 375
  and `421x66` at 1440). But collapsing the two markers onto one appearance left
  it GREEN -- because the first draft compared tag name and class, and the
  `refused` marker is a `<span>` while the `failed` one is an `<img>`, so they
  differed structurally whatever they painted. A check that cannot fail is not a
  check. The key is now paint only: `a picture / no picture` (an `<img>` with a
  decoded `naturalWidth`), the computed background-image, background-color,
  border-style and border-color. Re-mutated, it reddens at both widths.
* **Full suite: 279 files, 5699 tests, all passing**, run at 12:53 PDT on
  2026-09-05, 200.55s.
* **`npm run check`: 0 errors, 37 warnings**, breakdown 31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`, unchanged from the baseline.
* **Counts regenerated**: static 107 specs over 54 routes, 84 `/dev` pages, 214
  runs; measured `covered` 107 -- matching the tree -- over 3142 measurements with
  **2 outside threshold**, both the `/dev/notebook` `tap-reach` decision-12 rows.

### Two tests were already red on `origin/integration`, and this bundle cleared them

`tests/derived-numbers.test.ts` failed 2 of 18 on the branch point, naming three
route specs the measured region had never covered (`themes.mjs`,
`themes-signedout-1.mjs`, `themes-state-matrix.mjs`). Verified by running that one
file in a pristine worktree of `fdf8c68` rather than inferred from the failure
text. Adding a fourth unmeasured spec made it four; the full `verify:readme` pass
this bundle owed anyway measures every spec, so `covered` went 103 -> 107 and both
tests are green. Worth recording because a standing failure is what hides the next
real one.

### What was NOT verified

* **No live Supabase project was touched.** The local `.env` is the placeholder
  project; nothing here applied a migration, ran an RPC or signed in against
  production. Every claim above is against embedded Postgres or a real Chromium in
  this container.
* **The signed-URL mint was never made against real Storage.** The route is driven
  as the real handler against a client stand-in that records what it was asked
  for; the harness resolves `present` to a `data:` URI, because the route needs a
  session and a bucket a dev harness has neither of. So the four RENDERINGS are
  measured in a real browser and the MINT is not, and a green
  `/dev/foundry-covers` must not be read as coverage of it.
* **The `/object/public/` half of 0183 section 2 is asserted, not measured**, for
  the reason given above: no storage-api in this container. What was measured is
  the policy half -- the listing and the authenticated read -- which is the half
  Postgres can answer.
* **No signed-in Foundry surface was driven in a browser.** `/foundry` needs a
  Bosco Tech Google session; `/dev/foundry-covers` mounts the real `FoundryMine`
  with no session at all.
* **`prefers-reduced-motion` is `no-preference` in the harness**, and web fonts do
  not load (the harness blocks every non-loopback request), so all text above was
  measured in the fallback stack.

## All fourteen buckets, swept again at the end

The enumeration is taken from the migrations rather than from 0052's report:
every `insert into storage.buckets` in `supabase/migrations/*.sql` names one of
these fourteen. **This corrects the count this entry first carried** -- an earlier
draft said "the eleven other buckets", grouped `gauntlet-drawings` under staff
assets when it holds student work, and omitted `feedback-media` and
`greenline-decals` altogether.

**Public flag `true` after this bundle:** `gauntlet`, `gauntlet-tools`,
`maps-media`, `tournament-thumbs`.

**Per bucket, does anything a STUDENT made read without a session:**

| bucket | flag | select policy | student work | readable with no session |
|---|---|---|---|---|
| `avatars` | private (0181) | `authenticated` | yes | no |
| `foundry-covers` | private (0183) | `authenticated` | yes | **no, as of this bundle** |
| `foundry-uploads` | private | own-folder (0131) | yes | no |
| `foundry-bundles` | private | none at all | yes | no |
| `submission-files` | private | classroom predicates (0133) | yes | no |
| `classroom-attachments` | private | one `anon` policy, narrowed to an object whose prefix names a material a teacher published (0135) | yes | only what a teacher deliberately published |
| `instructor-attachments` | private | classroom predicates (0135) | no (staff) | no |
| `feedback-media` | private | -- | yes (report screenshots) | no |
| `greenline-decals` | private | `authenticated` | yes | no |
| `gauntlet-drawings` | private | -- | yes | no |
| `gauntlet` | **public** | `authenticated` | no (challenge assets) | flag only, no listing |
| `gauntlet-tools` | **public** | `for all to authenticated` | no (staff tools) | flag only, no listing |
| `maps-media` | **public** | **`to anon, authenticated`** | no (admin uploads, `is_admin()` writes) | yes, and LISTABLE |
| `tournament-thumbs` | **public** | **`to public`** | **yes** | **yes, and LISTABLE** |

So the answer to "is anything a student made readable without a session" is now
**one bucket: `tournament-thumbs`**, which is decision entry 15.

Two others are worth naming even though no student made what is in them.
`maps-media` is public AND world-listable with a `to anon, authenticated` select
policy; it holds admin uploads, and `CLAUDE.md` already records that its
`image/*` wildcard admits SVG and that closing that properly is a migration
nobody has written. `gauntlet` and `gauntlet-tools` carry the public FLAG without
an `anon` select policy, so the `/object/public/` path answers for anyone holding
a key while the listing does not -- which is the middle state decision 15 asks
about for `tournament-thumbs`, already in production on two buckets, and a
second reason the storage-api measurement that entry names is worth someone
making once.
