---
title: "A report can say what you tried and carry a screenshot (0170), and the client degrades to the deployment in front of it"
date: 2026-09-02
branches: [claude/feedback-form-screenshot-tried-qr859n]
migrations: ["0170"]
subsystems: ["Site feedback"]
---

The 2026-08-31 triage of forty-five reports produced several nobody could act
on: "more refined", "go crazy, think big", and a request for a control that
already existed in three places. The row records WHERE somebody was -- route,
path, role, section, viewport, user agent, build, all of `captureMeta` -- and
nothing about what they were looking at or what they had already done about it.
One item became a whole audit question a screenshot would have answered in a
second.

This bundle owned `src/lib/feedback/**`,
`src/lib/classroom/FeedbackConsole.svelte`, `src/routes/classroom/feedback/**`,
`supabase/migrations/0170_*.sql`, `tests/feedback-*.test.ts` and
`tests/db/feedback-*.test.ts`, plus one new file under
`tools/browser-verify/routes/`, and touched nothing else.

## The audit, before any of it was built

Six questions were answered from the tree first, because the first one could
have ended the bundle.

**1. Does anything already let a reporter attach an image?** No. Swept the whole
tree for `screenshot`, `clipboardData`, `getAsFile`, `getDisplayMedia` and
`html2canvas`: every hit is the classroom's own upload path (`ContentComposer`,
`SpecRenderer`, `FileUploadPanel`, `SpecProseField`) or a comment about the
browser pane not compositing. `src/lib/feedback/` had no file input, no picker
and no reference to storage of any kind. So this is a build rather than a
wiring-up.

**2. What `app_feedback` is, after everything that touches it.** Five files:
`0053` creates it (append-only, no update or delete grant, a direct RLS-scoped
insert whose WITH CHECK pins `user_id`), `0085` adds the triage status columns
and the two admin RPCs, `0126` makes `user_id` nullable and adds `contact` +
`reporter_hash` under an XOR check plus the service-role-only
`app_feedback_submit`, `0127` replaces the console read to project `anonymous`
and `contact`, and `0137` sweeps `anon` off the private helpers. `meta` is
whatever `captureMeta` assembles, plus VANGUARD's in-game composer writing
`surface` and `initials` straight into the same blob.

**3. The buckets.** The seven the prompt named are real, and there are six more
it did not (`gauntlet`, `gauntlet-drawings`, `gauntlet-models`,
`gauntlet-tools`, `avatars`, `greenline-decals`, `tournament-thumbs`). `0168`
did narrow `maps-media` off the `image/*` wildcard for exactly the SVG reason,
and its instrument -- a concrete raster list, chosen from what the path actually
carries, with each refusal given its own reason -- is the pattern this file
follows.

**4. How the triage console is fed.** `+page.server.ts` gates on `isAdmin`,
404s otherwise, calls `app_feedback_admin_list` with no `p_app`, and resolves
`meta.section` against live `classroom_sections`. It renders `meta` already, and
generically: `KNOWN_META_KEYS` names what has a named accessor and every other
key gets a `key value` line.

**5. Is there a paste/drop helper to reuse?** Yes, `src/lib/file-drop.ts`, and
this uses it rather than writing a second drag-depth counter and a second
image-only paste filter.

**6. The `tests/db/` shim.** `postgrest-shim.ts` resolves embeds against the
real catalog and can drive a caller as `authenticated`, `anon` or
`service_role` -- but it models `.from(t).select(...)` and `.rpc(...)` only, and
has **no `.insert` at all**. So the degrade test hand-rolls the two-method
client it needs rather than widening a file every other suite reads.

### What the tree contradicted

- **`0006-feedback-form-screenshot-and-tried.md` does not exist on any ref.**
  `docs/prompt-ledger/entries/` holds two files, `0001-prompt-ledger-and-status-tool.md`
  and `retro-01-design-standards-2-1.md`, on `main`, on `integration` and on
  every remote branch. There was nothing to update the Status and Branch fields
  of, and this bundle did not create one -- the prompt said a parallel session
  owns it.
- **`main` moved during the bundle**, from `d6811eb` to `e7ac4d5` (two
  standards-mirror commits). No migration came with it, so `0170` was still the
  next number; the migration commit was rebased onto the new tip rather than
  pushed from the stale one.
- The claim that the form "records the route and the build" is right, and
  understates it: it records nine things.

## What 0170 does

Two nullable columns on `app_feedback`, a private bucket, four storage policies,
and two functions replaced.

- **`tried`**, capped at 1000 characters by `app_feedback_tried_len`. **A real
  column rather than a key in `meta`**, and the reason is that `meta` is
  documented by `0053` itself as client-reported and never authoritative, while
  a CHECK is a boundary. Half the message cap on purpose: an account of what was
  TRIED is a list of attempts, not a second description of the problem, and a
  field sized like the message invites one.
- **`screenshot_path`**, the key of one object in `feedback-media`. The CHECK
  (`app_feedback_screenshot_path_shape`) pins the key's shape AND its owner:
  `<the row's own user_id>/<uuid>.<png|jpg|webp>` on a signed-in row,
  `anon/<uuid>.<ext>` on an authorless one. So a row cannot point into somebody
  else's folder, and a `.svg` key is refused by the database even though no
  policy could have written the object behind it.
- **The bucket**: private, 8 MiB, and `array['image/png','image/jpeg','image/webp']`.
  HEIC is admitted by `0168` for `maps-media` and **refused here**, which is a
  difference in surface rather than an inconsistency: a maps photo is taken
  standing at a toolbox where a bucket refusal is the one failure the person
  cannot work around, and a screenshot is taken at a computer where Chrome and
  Firefox cannot decode HEIC -- so a HEIC would be a broken thumbnail on the one
  screen that needed to see it.
- **Four policies, all `to authenticated`**: insert, read and delete your own
  folder (the `0020` avatars shape), plus an admin read for the console. No
  update policy, and nothing `to anon` at all, which the file's own self-check
  reads back out of `pg_policies`.

### Anonymous reporters cannot attach, and that is a decision

The signed-out path is `POST /api/feedback`, which caps its body at 16 KB and
was **outside this bundle's file surface**. The only in-scope way to let a
signed-out browser put bytes in the bucket would have been an `anon` INSERT
policy on `storage.objects` -- an unauthenticated, unrated public write of 8 MiB
objects keyed by nothing, which is exactly the surface `0126` spent a salted
hash and a rate table avoiding for a 2000-byte message. So the form says
screenshots are signed-in only, in a sentence, and the function still ACCEPTS
`p_screenshot_path` on the anonymous branch under the `anon/<uuid>` shape the
CHECK admits, so the route bundle that eventually uploads on the server's
behalf needs no second migration. Nothing passes it today.

### The `meta.tried` bridge

`app_feedback_submit` reads `p_tried`, and falls back to `p_meta->>'tried'` when
the parameter is null, removing the key from the stored blob. That is a bridge
for one caller: the anonymous route forwards `meta` verbatim, names no
`p_tried`, and could not be edited here. The day that route names the parameter,
the bridge is dead code and goes in that file's own migration. Until then a row
from either path reads identically to the console, with one spelling.

### The signature trap

`app_feedback_submit` gains two parameters, so the 7-argument form is
`drop function`ed at its exact old signature FIRST. The new form defaults both,
which makes the pair additive in the sense `CLAUDE.md` describes -- the deployed
route sends seven named keys and resolves to the one function that exists -- so
**the migration and the client deploy are independent events and either may go
first**. The test asserts one `pg_proc` row with nine arguments, not just a
count of one.

## The client, and what it does on a deployment without 0170

**The send path is a ladder, not a probe.** `submitFeedback` inserts the widest
row first (`tried`, and `screenshot_path` when there is one); if that comes back
`PGRST204` or `42703` -- and **only** those two codes, read off the code alone --
it retries once on `0053`'s own column set with the answer moved into
`meta.tried`. So the field is never removed from the form; what changes is only
where the sentence lands, and the console reads both. Every other error is a
considered refusal and is reported as one, once.

This matters more than it looks: naming a column PostgREST does not hold fails
the WHOLE insert, so a client that sent `tried` unconditionally would take down
every report on the site -- signed in and signed out, bug and praise -- for the
whole gap between a push and a hand-applied migration, on the one surface whose
job is to catch things being broken.

**AND THE WIDEST RUNG IS ONLY TAKEN WHEN THERE IS SOMETHING TO PUT ON IT**,
which the suite is what forced. The first version climbed the ladder for every
report, `tried: null` included, and `tests/feedback-anonymous-route.test.ts`
went red on exactly the case that matters most: a report with neither field, on
a chain without 0170, spending a failed round trip to send two nulls. A report
carrying nothing 0170 added now takes the insert `0053` has always taken, byte
for byte, in one attempt -- so the whole feature is invisible to the common
path, and the ladder exists only for the reports that actually use it. The
existing test then passed unchanged, which is the right shape of fix: a test a
legitimate change breaks is generalized or the design is corrected, never
edited to agree with it.

**The attach control is gated on a probe instead**, because it cannot degrade
the same way: uploading 8 MB and then discovering the column that would point at
them does not exist is the report lost. `probeFeedbackCapabilities` is the
narrowest possible rung -- two scalar columns, no embed, one row, the caller's
own RLS -- and any error at all is a no. One rung for both columns, because they
are one migration and one apply; a rung that came back proves both.

**Where the client comes from.** `SiteFeedback` is mounted in five places, four
of them outside this subsystem (the root layout, the error boundary, the
GAUNTLET layout, the deck route). Threading a Supabase client through each would
mean the attach control appearing on whichever of them somebody remembered,
which is the per-page-coverage failure the shell mount exists to end. So it
reads `page.data.supabase` and `page.data.claims.sub` off `$app/state`, the way
`ProfileMenu` reads `userProfile`, and every existing mount inherits the control
with no edit. Both are overridable props, which is how a harness hands in its
own pair or none.

**The upload happens at STAGE, not at send.** The row's CHECK requires a key
naming an object that already exists, so something has to go first. Doing it
when the file is picked means a refusal lands beside the control that caused it,
while the person is still looking at it, and the report itself never depends on
it -- which is what "a failed attachment never takes the post with it" asks for.
**The cost, named rather than hidden:** somebody who attaches and then closes the
box leaves an orphaned object. That is the acceptable failure of the two, the
same way round as the Foundry delete: bytes in a private bucket that no row
names, listed by nothing, readable only by their own uploader and an admin.

**The type is sniffed from the bytes, never read off `File.type`.** Storage
enforces `allowed_mime_types` against the request's DECLARED type and does not
read bytes (`0168` says so in its own header), and `File.type` is a guess chosen
by whoever is uploading -- legitimately empty for a HEIC, and freely settable by
anything that is not a file picker. So `sniffImageType` reads the first twelve
bytes and the sniffed value is what gets declared. An SVG named `.png` and
declared `image/png` is refused here and nowhere else in the chain.

**No `accept` on the picker**, the classroom rule, for the classroom reason: an
`accept` list hides files in the dialog rather than refusing them, and somebody
whose screenshot is filtered out of their own file dialog is given no sentence
at all. The refusal states the size, the limit, and why not SVG or HEIC.

**The console** renders the tried text under the message, labelled and set apart
so two pieces of prose answering two questions do not read as one, and draws the
screenshot as a thumbnail at `object-fit: contain` with the link beside it. The
signed URL is minted **in the page load, on `locals.supabase`** -- the admin's
own client, so the storage policy is the boundary and the route never becomes
one -- for 300 seconds, carrying `download=`, and a thumbnail that fails to
decode falls back to the link through the img's own `onerror`.

## What was measured

- **`svelte-check`: 0 errors, 37 warnings**, re-derived rather than trusted
  (`npx svelte-kit sync` after exporting placeholder `PUBLIC_SUPABASE_URL` and
  `PUBLIC_SUPABASE_ANON_KEY`, which is what keeps the eleven phantom errors of a
  no-`.env` checkout away). Unchanged from the baseline in `CLAUDE.md`.
- **`npm test`**, full suite, once, at the end.
- **The five positive controls** in `tests/db/feedback-tried-screenshot.test.ts`,
  each opening ONE statement of the applied migration in the permissive
  direction on a throwaway database:
  1. the own-folder half of the read policy removed -> a second student's
     `readableCount` goes 0 -> 1;
  2. the own-folder half of the insert policy removed -> a stranger's write into
     another folder goes refused -> accepted;
  3. `array['image/*']` back on the bucket -> `admits(list, 'image/svg+xml')`
     goes false -> true;
  4. `app_feedback_screenshot_path_shape` dropped -> a row naming another
     person's folder, and one naming a `.svg`, both go 23514 -> accepted;
  5. `tried` removed from the function's INSERT column list -> the stored value
     goes 'what I tried' -> null with no error anywhere.

  They mutate the applied SCHEMA and never a file on disk, so there is no
  restore step to get wrong and `git checkout --` is never involved -- which is
  the failure three sessions in one week had with mutation scripts.
- **The degrade proof** (`tests/db/feedback-degrade-pre-0170.test.ts`) runs the
  chain SHORT of 0170 and drives the real `submitFeedback`: two insert attempts,
  the second without the new columns, the report landing, `tried` in `meta`, and
  the probe answering `{tried: false, screenshot: false}`. The same call on the
  same chain WITH 0170 takes ONE attempt and puts it in the column -- which is
  the control that says the narrow rung was taken because the column was missing
  rather than because the widest rung never runs.

### The browser pass, and the one thing it cannot reach

`tools/browser-verify/routes/feedback.mjs` opens the box on `/dev/feedback` and
measures the tried field, its label, the kind chips and the box buttons at
375px and 1440px, plus the sentence that stands in for the absent attach
control. **28 measurements, 0 outside threshold**, on `a70c9ef` plus this
branch's client work:

| measurement | 375px | 1440px |
| --- | --- | --- |
| horizontal overflow | 0px | 0px |
| tried textarea (min dim) | 57.3px | 57.3px |
| box buttons, smallest (min dim) | 44.0px | 44.0px |
| kind chips, smallest (min dim) | 44.0px | 44.0px |
| tried field label contrast | 4.64:1 | 4.64:1 |
| the no-attach sentence contrast | 4.64:1 | 4.64:1 |
| console errors | 0 | 0 |

Two limits belong with those numbers: the harness blocks every non-loopback
request (`fonts.googleapis.com` and `example-ref.supabase.co` were both
refused), so **text is measured in the fallback stack**; and
`prefers-reduced-motion` is `no-preference` throughout, so that path is not
exercised -- which costs nothing here, because nothing this bundle added
animates.

**THE PASS FOUND A REAL DEFECT, which is the whole reason for running it.** The
sentence explaining why there is no attach control rendered NOWHERE: it was
gated on the capability probe having answered, and on a surface with no session
the probe was fired at an origin the harness blocks and never resolved. So the
one case the note exists for -- a signed-out visitor -- was the one case it was
missing from, and in production it would have been missing for anyone offline
or behind a slow backend. Being signed out is not a question for the backend, so
that branch now answers locally and immediately, and the probe is not fired at
all without a client and a viewer. Measured before: `present 0` at both widths.
After: `present 1, visible 1` at both, at 4.64:1.

**The attach control itself is not reachable there**, and that is a fixture gap
rather than a defect: `SiteFeedback` builds its screenshot transport from a
client and a viewer id, a `/dev` route has neither, and
`src/routes/dev/feedback/` was outside this bundle's file surface. The spec says
so in its own header and names the one line the next bundle needs
(`uploadScreenshot={...}` at that mount) plus the two `tapTargets` rows to add
with it. `.fb-shot-choose` and `.fb-shot-remove` both carry `min-height: 44px`
in the component's stylesheet and that is **asserted in source**, which is not
the same thing as having been measured on a page, and this entry does not claim
otherwise.

## What is explicitly NOT verified

- **The live Supabase project.** Nothing here can apply a migration or run an
  RPC against it; the local `.env` is a placeholder project. `0170` is written
  and tested and **not applied**, and `supabase db push` was not run.
- **A real upload.** There is no Storage server in the db harness and no local
  stack in this session (`docker` is present but its daemon is not running, and
  no `supabase_*` container exists on 54321/54322 or 54421/54422). So
  `allowed_mime_types` is asserted as the POLICY VALUE the upload path reads --
  which is the whole of what the migration controls -- and no upload is
  simulated. The same limit `0168`'s own test states.
- **The thumbnail decoding under `Content-Disposition: attachment`.** That rests
  on the Chromium measurement already recorded in `CLAUDE.md` for the classroom
  proxy, not on a fresh one, which is why the img has an `onerror` fallback to
  the link rather than trusting it.
- **A signed-in surface in a browser.** `/dev/login` needs a local stack.

## Deferred, and named

- **The anonymous screenshot path**, which needs `/api/feedback` (out of scope
  here) to accept bytes and upload them server-side under the rate limit. The
  migration is already shaped for it.
- **The `meta.tried` bridge**, which becomes dead code the day that route names
  `p_tried`.
- **A `/dev/feedback` mount that exercises the attach control**, one line in a
  file this bundle did not own.
- **Deleting the object when a staged screenshot is detached.** The control
  detaches without deleting, deliberately (a second write that can fail, on a
  path whose whole point is that a picture never gets in the way of a report), so
  a bucket sweep for objects no row names is a real future bundle.

## Cold apply steps

Paste `supabase/migrations/0170_feedback_tried_and_screenshot.sql` into the
Supabase SQL editor, after `0169`. It is one transaction with a self-check at
the end, so a false claim rolls the whole file back rather than leaving a half
built schema. Expect one notice reading `0170: app_feedback has 0 row(s) with
tried and 0 with a screenshot` on a first apply.

Then confirm, read-only:

```
supabase db query --linked "select column_name from information_schema.columns
  where table_schema='public' and table_name='app_feedback'
    and column_name in ('tried','screenshot_path')"
supabase db query --linked "select public, file_size_limit, allowed_mime_types
  from storage.buckets where id='feedback-media'"
supabase db query --linked "select policyname, roles from pg_policies
  where schemaname='storage' and tablename='objects' and policyname like 'feedback media %'"
```

Four policies, none naming `anon`; the bucket private at 8388608 with exactly
the three raster types. Re-pasting the file is ordinary and lands the same end
state.

**Order does not matter here.** The widened function keeps every existing call
working (the deployed route sends seven named keys and the new form defaults
both extra parameters), and the client degrades by itself until the columns
exist -- so the deploy may land before the apply or after it.

What undoes it is at the top of the file, in order, including the part that
cannot be undone in SQL: the bucket row can only be deleted once its objects are
gone, and deleting `storage.objects` rows would not remove the bytes.
