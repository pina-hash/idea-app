---
title: The Foundry upload caps raised from 50/75 MB to 75/110 MB, not to the 150/250 MB target
date: 2026-09-02
branches: ["claude/foundry-upload-limit-mlg0eb"]
migrations: []
subsystems: ["foundry"]
---

### What changed

`FOUNDRY_LIMITS` in `src/lib/foundry/preflight.ts`:

- `maxZipBytes`: 50 MB -> 75 MB
- `maxTotalBytes`: 75 MB -> 110 MB
- `maxFiles` (1500) and `warnAssetBytes` (5 MB) unchanged; they are gated on a
  different axis (function duration, not memory) and this bundle does not
  touch that argument.

The comment above the constant is rewritten to reason about the new numbers
and is dated. No test file needed an edit: `tests/foundry-preflight.test.ts`,
`tests/foundry-contract.test.ts` and `tests/foundry-preflight-parity.test.ts`
already derive every assertion from `FOUNDRY_LIMITS` rather than hardcoding
50/75, so the new values flowed through with all 107 of their tests passing
unchanged. No migration was written.

### Why not the requested 150 MB / 250 MB

The prompt's target was subordinate to the memory arithmetic, and the
arithmetic could not defend it.

`foundry-ingest` (Deno, Supabase Edge Function) buffers the whole zip in one
`Uint8Array` and inflates every file into one `built` array before writing
anything to Storage, so peak resident bytes for one invocation is roughly
`zipBytes + totalBytes` plus a transient decode string and the isolate's own
baseline. That much was already established by the previous raise (0050/75 ->
current) and did not change.

What is new is that the platform ceiling itself could not be pinned down.
Public sources disagree with each other: some name 150 MB per invocation on
the smallest Supabase tier, others 256 MB on a paid tier, and a Supabase
maintainer in a GitHub discussion names 512 MB as the underlying Deno Deploy
engine limit outright. Nothing in this session could load-test the real
function, and nothing in the repo records which tier this project runs on.

The reasoning that survived: the CURRENT caps (50 MB zip + 75 MB unpacked =
~125 MB combined worst case) have been running in production with no
recorded out-of-memory failure anywhere in `docs/history/`. That rules out
150 MB as the binding ceiling here -- 125 of 150 would leave almost nothing
for the isolate's baseline, the transient decode string and
`DecompressionStream`'s own buffers, and something that tight would have
surfaced by now. Treating 256 MB as the credible floor instead:

- New combined worst case: 75 MB + 110 MB = 185 MB, which is 72% of 256 MB,
  leaving about 70 MB of headroom -- comparable in absolute terms to the
  margin the previous, unincident caps were already running on.
- The requested 150 MB + 250 MB = 400 MB combined is 156% of the 256 MB
  floor, and even against the most generous figure found (512 MB) it is 78%
  with zero margin left for overhead. Shipping it would trade a clean
  refusal for a plausible out-of-memory crash on a real student's upload,
  which is the worse failure mode this constant exists to avoid.
- The shipped raise is therefore ~1.5x on the zip and ~1.47x on the unpacked
  total -- smaller than the previous raise's ~2.5x, deliberately, because the
  ceiling is no better known now than it was then and the previous jump
  already spent a share of whatever margin exists.

### Storage bucket ceiling (A4) -- confirmed not to need a migration

`foundry-uploads` (0130, line ~1272) is created with
`insert into storage.buckets (id, name, public) values ('foundry-uploads', 'foundry-uploads', false)`
-- no `file_size_limit` column at all, so it inherits the project-wide
default. `0133`/`0135` already push classroom buckets to `file_size_limit =
209715200` (200 MB), so the project ceiling is at least 200 MB. The new 75 MB
`maxZipBytes` is well under that, so no `0173` migration was written. Highest
migration on `origin/main` at issue was 0171 (`0171_classroom_extra_credit.sql`);
0172 was still unclaimed; 0173 remains free for a future bundle.

### Consumer sweep (A2) -- everything derives from the constant

Grepped every reference to `maxZipBytes`/`maxTotalBytes` in `src/` and
`tests/`: `supabase/functions/foundry-ingest/index.ts`,
`src/lib/foundry/preflight-browser.ts`, `src/lib/foundry/FoundrySubmit.svelte`
and `src/lib/foundry/zip-write.ts` all read `FOUNDRY_LIMITS` directly, none
hardcodes 50/75/a megabyte string. Nothing needed editing outside the owned
constant.

### Two findings reported, neither fixed (out of scope for this bundle)

1. **`src/lib/foundry/zip.ts`'s own header comment is stale**, independent of
   this change: it says "capped at 25 MB" and "500 files", which predates the
   50 MB/1500-file caps this bundle found already in place on `main`. It was
   already wrong before this bundle touched anything. `zip.ts` is not an
   owned file here, so it is reported rather than corrected.
2. **`src/lib/server/foundry-bundle.ts`** (the owner-download zip builder, on
   Vercel Node rather than Deno) also buffers a whole bundle in memory to
   rebuild a zip for download, and its own header comment cites a MEASURED
   peak RSS -- 268 MB worst case, 224 MB half-compressible -- taken against
   the OLD caps (75 MB unpacked, 1500 files) against a stated 1024 MB Vercel
   Node budget. Scaling roughly with the new 110 MB unpacked cap (~1.47x),
   the new worst case is plausibly ~390 MB, still comfortably under 1024 MB,
   so this is very likely still safe -- but it was not re-measured, and this
   file is not owned by this bundle. A future session touching either cap
   again should re-check this comment and re-measure rather than trust the
   scaling estimate.

### Verified

- `npm ci` (no `node_modules` in this fresh checkout), then
  `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` placeholders exported
  before `npx svelte-kit sync` and `npx svelte-check`, per the documented
  fresh-checkout trap.
- `svelte-check`: 0 errors, 37 warnings, breakdown 31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class` -- matches the
  documented baseline exactly.
- `npm test`: 231 files, 4774 tests, all passing, including
  `tests/derived-numbers.test.ts` green (confirms no static route/spec count
  moved, so no browser pass or counts regeneration was needed for this
  bundle).
- The three owned test files re-run alone: 107 tests, all passing, with no
  edits needed -- every assertion in them already derives from
  `FOUNDRY_LIMITS` rather than a hardcoded number.

### What was NOT verified

Nothing here uploaded a real ~75-110 MB zip through the live Supabase Edge
Function. The memory ceiling is reasoned from public documentation (itself
inconsistent, 150-512 MB across sources) and from the absence of a recorded
production incident at the previous caps, not measured against this
project's actual plan tier. Mr. Pina's check on the Vercel preview: upload a
zip that unpacks to just under 110 MB and confirm it succeeds; then a zip
built to land at roughly 115-120 MB unpacked and confirm the refusal message
names the 110 MB limit cleanly, with no server-side crash or timeout in its
place. If either shows memory pressure (a hung request, a 500 with no
Foundry-shaped message, a cold-start-looking failure), that is the
measurement this session could not take, and the numbers here should come
back down.
