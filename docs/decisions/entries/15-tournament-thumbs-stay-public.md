# 15 Foundry covers are closed; tournament thumbnails are still world-listable, deliberately
- Raised: 2026-09-05  By: prompt 0057, `claude/public-upload-buckets-4dqkbe`
- Status: open
- Decision:
- Default this assistant would pick: keep 0183 as shipped -- `foundry-covers` private,
  one read policy `to authenticated`, every cover asked for through
  `/api/foundry-cover/<key>` -- and leave `tournament-thumbs` exactly as it is until
  somebody can measure the one thing this container could not, then close only its
  LISTING and leave the bucket flag public so the spectator bracket keeps rendering.
- Why it is blocked on him: the Foundry half had one defensible answer and the bundle
  took it. The tournament half is not a security question with a right answer -- the
  bracket is a public spectator surface ON PURPOSE, a parent opens it with no session,
  and narrowing the wrong half of it turns a working page into a page of broken images
  in front of exactly the audience it was built for.
- What it unblocks: nothing is waiting. 0183 stands on its own and Tournaments is
  untouched. Answering "close the listing too" is a small migration plus one
  measurement; answering "leave it" costs one line in `CLAUDE.md` recording that the
  bucket is deliberately open.
- Context: `supabase/migrations/0183_foundry_covers_private.sql` and its header;
  `src/lib/foundry/covers.ts`; `src/routes/api/foundry-cover/[...path]/+server.ts`;
  `tests/db/foundry-cover-private-bucket.test.ts` (the before and after pictures with
  four mutated controls) and `tests/db/tournament-thumb-stays-public.test.ts` (this
  entry, written as assertions); `0130_foundry.sql` and `0062_tournaments.sql`, which
  made the two calls; decision 14 and `0181_avatars_private.sql`, the bundle before.

## What was measured

Prompt 0052 closed `avatars` and swept the other twelve buckets, naming two with the
identical shape: `foundry-covers` (0130) and `tournament-thumbs` (0062). Both are
student uploads, both are own-folder write, and both read `to public using (bucket_id =
'...')` with no further predicate.

This bundle measured both rather than reading the policies. Against a real Postgres with
the relevant chains applied, as `anon` with no claims, over objects written through each
bucket's own write policy:

| bucket | `buckets.public` | anon reads a known key | anon LISTS the bucket |
|---|---|---|---|
| `foundry-covers` | `true` | 1 row | every key |
| `tournament-thumbs` | `true` | 1 row | every key |

On the same connection `select count(*) from public.profiles` answered `permission
denied for table profiles`. That is 0052's control, re-run rather than borrowed, and it
is what says the listing was the POLICY and not RLS being switched off.

So in both buckets a stranger did not have to guess a key. A longer or more random key
would have fixed neither, which is what ruled out the design most people reach for
first.

## What closed

`foundry-covers`. 0183 flips the bucket private and replaces the `to public` policy with
one `to authenticated`; the app half routes every cover through
`/api/foundry-cover/<key>`, which mints a short-lived signed URL **on the caller's own
client** and redirects, so the storage policy is the authorization boundary and the
route is not.

`to authenticated` is exactly the tier every surface that renders a cover already sat
in: `/foundry` is in `authedPrefixes`, and the gallery deliberately shows every
signed-in student every published app. Nothing about who sees whose work moved.

The sentence that changed is narrow and worth stating exactly: **a stranger could read
and enumerate every cover in the bucket before and reads nothing now, and a key scraped
out of a gallery's HTML stops working the moment its holder signs out.**

## What did not close, and why that is a decision rather than an omission

`tournament-thumbs`. Three independent places say the bracket is public on purpose:
`/tournaments` is not in `authedPrefixes`; `0062_tournaments.sql` grants `select` on
every tournament table to `anon` under `using (true)`; and the `[id]` page load's own
header says "fully PUBLIC (no session, no cookie needed) -- ... signed-out spectators see
updates live too". Giving that bucket the Foundry treatment is not a fix, it is a public
bracket that stops showing thumbnails.

And the exposure is differently shaped, which is the part worth his attention.
`tournament_entries.thumbnail_url` stores the **whole public URL**, in a table any
anonymous caller may select. So for an entry thumbnail the storage listing is a second
door to a room whose front door is deliberately open, and closing storage would not
close it. Measured: an anonymous caller reads the URL straight out of the table, key
and all.

**What a narrowing would actually buy is the residue: the objects no public row names.**
0064 put entry BANNER art in the same bucket (`bg-<uuid>.<ext>`), and replaced or
orphaned uploads accumulate there too. None of those is named by any `thumbnail_url`, so
the listing is the only way to reach them. `tests/db/tournament-thumb-stays-public.test.ts`
measures that residue directly rather than describing it, with a positive control on the
same reading so "everything is residue" cannot pass on a broken key comparison.

## The one measurement this container could not make, and it is why nothing shipped

The narrowing that would close the residue **without** touching the bracket is: leave
`buckets.public = true` and change only the SELECT policy to `to authenticated`. That
rests on 0181's own claim that the two halves govern different paths -- the bucket flag
governs `/storage/v1/object/public/...`, the policy governs the authenticated and
signed-URL paths and the listing.

That claim is almost certainly right and this session could not measure it. It is a
claim about the storage-api HTTP renderer, not about Postgres; this container has the
embedded-Postgres harness and a Chromium, and **no Docker daemon and no Supabase CLI**,
so there is no running storage-api to put a request to. If the claim is wrong, every
thumbnail on the public bracket breaks for every signed-out spectator, which is the
exact regression the prompt commissioning this work named as the thing not to cause.

So the residue is left open and written down rather than closed on a reasoned guess. One
`curl` against a real project settles it: fetch
`/storage/v1/object/public/tournament-thumbs/<key>` with no `Authorization` header, on a
project where that bucket's select policy has been narrowed to `authenticated`. A 200
licenses the migration; anything else means the residue can only be closed by moving
Tournaments onto a proxy route, which is a bundle rather than a line.

## The three questions this leaves

1. **Is the residue worth a migration at all?** It is banner art and orphans, not faces.
   The entry thumbnails -- the thing a student actually chose to publish -- are public by
   a design decision nobody is proposing to reverse.
2. **Should a tournament thumbnail be public in the first place?** 0062 decided yes and
   built the whole spectator surface on it. That is a question about whether the bracket
   should need a session, which is a different feature.
3. **What happens to a thumbnail when the student leaves?** The object survives the
   entry, the account and the school. Nothing in the schema expires one. This is the
   same fourth question decision 14 leaves about a face, and it will keep being asked
   once per bucket until it is answered once.
