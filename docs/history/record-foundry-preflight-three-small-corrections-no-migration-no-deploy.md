---
title: "Foundry preflight, three small corrections (no migration, no deploy)"
date: 2026-08-23
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 122
---

## Foundry preflight, three small corrections (no migration, no deploy)

### 1. mailto: and tel: are permitted references now

Both carry no network request -- they hand off to the device's mail or phone
app -- so refusing them alongside http:/https:/ftp:/etc. read as arbitrary.
`data:` was previously the one hardcoded exception in `classifyReference`; it
is now one of three in a named `NO_NETWORK_SCHEMES` list, so a fourth one (if
ever needed) is a one-line addition rather than a second special case.

### 2. The scheme message names the scheme in the INSTRUCTION, not only the description

Old: `"...uses tel:555-1234, which is a tel: address. ... Remove it, or..."`
-- the actionable sentence said "Remove it", leaving the pronoun to resolve
against an object two clauses back. New:

    index.html line 6 uses ftp://files.example.com/x.zip, a ftp: link. Your
    app can only open files that are inside its own folder, so remove the
    ftp: link, or replace it with a file you have included and a relative
    path, like href="x.zip".

The scheme now appears twice -- once naming what the value is, once naming
what to remove -- so a student pasting this into an AI tool has the specific
scheme to delete named in the sentence that tells them to delete it, not just
implied by an earlier clause.

### 3. The draft-only invocation gate is now a named, tested, mutation-proven rule

Extracted `versionIsIngestable(status): boolean` into `src/lib/foundry/
preflight.ts` (the one module both the Deno function and any future test
import), and `foundry-ingest/index.ts` now calls it instead of an inline
`!== 'draft'` comparison.

**Why this stopped being a convenience check.** 0131 added the SELECT policy
`foundry-uploads` was missing, and that policy's side effect is that an
own-prefix OVERWRITE of the uploaded zip is now reachable where it previously
failed on RLS. So a student CAN replace the bytes at `zip_path` after their
version has been reviewed. The draft gate is the ONLY thing left stopping a
swapped zip from ever being extracted and served -- there is no second gate.

**Unit-tested and mutation-proven.** `tests/foundry-preflight.test.ts` asserts
`draft` -> true and `submitted`/`approved`/`rejected` -> false, plus a
defence-in-depth case (`''`, `'DRAFT'`, `'draft '` all refuse). Mutating the
predicate to `return true` reddened exactly those two tests and nothing else;
`preflight.ts` was restored md5-identical
(`99636864732c1c34a4462c83d5aa2ccb`) and re-verified green.

**Also proven against the REAL running function and the REAL local Storage
service**, not only the pure predicate (scratchpad scripts, not committed --
this is the class of proof the local stack exists for, per prior bundles):

- A version ingested once for real, then forced to each of `submitted`,
  `approved`, `rejected`. Re-invocation for all three: HTTP 200,
  `{"ok":false,"reason":"not_draft"}`, message names the actual status. The
  version's `student_app_files` rows, its `foundry-bundles` object list, and
  the SHA-256 of every stored byte were identical before and after the
  refused attempt, in each of the three cases -- 24 assertions, 0 failures.
- **The concrete 0131 scenario, driven end to end:** a version ingested,
  approved, then its zip overwritten in place with different content (which
  now succeeds, exactly as 0131's own header warns). Re-invoking is still
  refused with the same `not_draft` message, and the SERVED bundle was
  downloaded and confirmed to still read "Original" -- the swapped "SWAPPED"
  content never reached `foundry-bundles`. This is the failure this rule
  exists to prevent, reproduced and shown blocked.

`svelte-check`: 0 errors, 37 warnings (31/5/1), unmoved. Full suite: 90 files,
2186 tests (2182 + 4 new), all passing.

### NOT verified / not done

- **The deployed function on production was NOT updated.** These three fixes
  are in the repo only; `foundry-ingest` on `ifxbufvugkzfxhwcwqhf` is still the
  version deployed in the previous bundle, which does not have them. No
  redeploy was requested and none was made.
- **No migration.** Nothing here touches the database schema.

---

