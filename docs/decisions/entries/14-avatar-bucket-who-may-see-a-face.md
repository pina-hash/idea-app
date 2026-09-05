# 14 The avatars bucket is closed to strangers; who may see whose face is still open
- Raised: 2026-09-05  By: prompt 0052, `claude/avatar-bucket-exposure-wa1f7b`
- Status: open
- Decision:
- Default this assistant would pick: keep 0181 as shipped -- the bucket private, one read
  policy `to authenticated`, every avatar asked for through `/api/avatar/<key>` -- and
  treat the remaining question (which signed-in people may see which student's face)
  as its own bundle, started by answering the four questions at the end of this entry.
- Why it is blocked on him: the part that is fixed had one defensible answer and the
  bundle took it. The part that is left is not a security question with a right answer,
  it is a school's judgement about its own students: the GAUNTLET leaderboard publishes
  every student's face and name to every other student, and whether that is what Bosco
  Tech wants is a decision about a student's day rather than a number.
- What it unblocks: nothing is waiting. 0181 stands on its own and the leaderboard is
  unchanged. Answering "narrow it" is a new bundle; answering "leave it" costs one line
  in `CLAUDE.md` recording that the tier is deliberate.
- Context: `supabase/migrations/0181_avatars_private.sql` and its header;
  `src/routes/api/avatar/[...path]/+server.ts`; `tests/db/avatar-bucket-boundary.test.ts`
  (the before picture, 0033's, unchanged) and `tests/db/avatar-private-bucket.test.ts`
  (the after picture, with its three mutations); `0020_profiles_identity.sql`, which made
  the call this reverses; `0024_gauntlet_leaderboards.sql`, which is the surface the
  remaining question is about.

## What was actually wrong

`0020_profiles_identity.sql` created the `avatars` bucket with `public = true` and a
select policy `to public using (bucket_id = 'avatars')`, and wrote its reasoning down:
"avatars are non-sensitive by design (they render on public leaderboards)". Uploads were
own-folder only then and are own-folder only now. The reads were open to the internet.

Three sessions measured it rather than reading the policy. Prompt 0033 put a genuinely
anonymous caller to a real Postgres with 0020 applied and read another person's avatar
object. Prompt 0038 confirmed it. Both said the path was the only thing protecting a
face, and both correctly declined to change it, because neither owned the bucket.

This bundle measured the half neither had, and it is the half that decided the design:
**an anonymous caller did not have to guess a key, it could list them.** The policy
placed no restriction on WHICH rows `public` could select, and a hosted Supabase project
grants `anon` select on `storage.objects`, so `select name from storage.objects where
bucket_id = 'avatars'` answered with every object in the bucket. The path was not weak
protection. It was none.

That is what ruled out the design most people reach for first -- keep the bucket public
and move to unguessable random keys. A random key defends against guessing and not at
all against a directory listing.

## What 0181 changed, and what it deliberately did not

Changed: the bucket is private, the `to public` policy is replaced by one `to
authenticated`, and `Avatar.svelte` asks for `/api/avatar/<key>` on our own origin
instead of the Storage public URL. The route mints a short-lived signed URL **on the
caller's own client** and redirects, so 0181's policy is the authorization boundary and
the route is not.

Not changed, and this is the open question: **who may see whose face.** `to
authenticated` is exactly the tier every surface that renders an avatar already sat in.
Nothing about which student appears on which staff screen moved, and the GAUNTLET
leaderboard was not touched -- it could not be, being read-only to that bundle, which is
precisely why the fix had to work without touching it.

So the sentence that changed is narrow and worth stating exactly: **a stranger with a
key read a face before and reads nothing now, and a key scraped out of a page's HTML
stops working the moment its holder signs out.** A signed-in student can still read any
other student's face, because a signed-in student could always see a hundred of them on
the leaderboard.

## The four questions this leaves

1. **Should the GAUNTLET leaderboard show faces at all?** It has since 0024, to every
   signed-in student. A leaderboard with names and no faces is one line in a component
   nobody in this bundle could edit; a leaderboard with neither is a different feature.
2. **Should a student be able to upload a photograph of themselves in the first place?**
   Nobody has asked a parent. The presets exist and cost nothing. This is a consent
   question and it is the one this assistant would ask first.
3. **Should an avatar be visible only to people who share a section with its owner?**
   That is expressible -- the roster predicates already exist -- but it costs the
   leaderboard, and it turns one read policy into a per-viewer query on every image.
4. **What happens to a face when a student leaves?** The object survives the enrollment,
   the account and the school. Nothing in the schema expires one.

None of the four is blocked by 0181, and 0181 is worth having whichever way they go: all
four are about which SIGNED-IN people see a face, and the bucket being open to the whole
internet was a worse answer to every one of them.
