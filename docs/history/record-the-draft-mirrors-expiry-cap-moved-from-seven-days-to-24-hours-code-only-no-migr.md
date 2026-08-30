---
title: "The draft mirror's expiry cap moved from seven days to 24 hours (code only, no migration)"
date: 2026-08-26
branches: []
migrations: []
subsystems: ["Digital notebook"]
record_order: 150
---

**WHY.** The prior bundle shipped the seven-day cap and named the trade it was
making explicitly in its own "NOT verified" section, quoted just above: a
shared machine holds a student's unsaved writing in plain `localStorage`, not
encrypted, and never swept on sign-out. Mr. Pina decided that exposure window
should be a day, not a week, given these are shared school lab machines. The
number moved; nothing else about the mechanism did.

`DRAFT_MIRROR_MAX_AGE_MS` in `src/lib/notebook/draft-mirror.ts` is now
`24 * 60 * 60 * 1000`, and the comment above it was rewritten in place to state
the new figure and the reason (shared lab machines, unencrypted storage, no
sweep on sign-out) rather than the old rationale about surviving a weekend.
`CLAUDE.md` does not state the day count anywhere, so nothing there needed
updating. `docs/HISTORY.md`'s own prior entries above are a dated record and
were deliberately left saying "seven days" -- they describe what that bundle
shipped, not what is true today; this entry is what a reader should trust for
the current value, per this file's own rule that it is a dated record and not
edited to match later changes.

**Searched for a second statement of the number and found none to fix beyond
the constant and its comment.** No other constant encodes it; no test
asserted it before this bundle (the module had no test file); no user-facing
sentence in `NotebookView.svelte` or `draft-mirror.ts`'s own restore/unavailable
copy states a retention period at all -- the composer never told a student how
long the backup lives, only that it lives. `classroom-updates.json` gained one
entry (below) since the original feature's own arrival was announced there.

**Verified.** A new `tests/notebook-draft-mirror-expiry.test.ts` drives the
shipped `readMirror` with a hand-rolled in-memory `Storage` and a controlled
`now` argument -- never by editing the module or faking the system clock: a
slot written at `at = 0` reads back non-null at `now = 23h` and null (with the
slot removed) at `now = 24h + 1ms`. The same three cases plus a 25-hour and a
3-day case (which would have survived the old cap) were independently driven
against the real module bundled with esbuild outside the vitest pipeline,
because the sandbox's `npx vitest` initially failed for an unrelated reason
(see below) -- both runs agree.
- `npx svelte-kit sync && npx svelte-check`: 0 errors, 37 warnings, matching
  the documented baseline exactly, once `.env` existed locally (see below).
- Full suite: 114 files, 2557 tests, all green, including the new file.

**Two environment gaps found and fixed locally, neither a code defect and
neither committed:**
- `npx vitest` failed at startup on a clean checkout of this branch (confirmed
  by stashing every change and re-running) with a rolldown/vite error
  resolving `node:module`, because `.svelte-kit/tsconfig.json` did not exist
  yet. `npx svelte-kit sync` generates it; this is routine, gitignored
  generated output, not a fix to anything in the repo.
- `.env` did not exist in this sandbox, which made every `$env/static/public`
  import a `svelte-check` type error (11 of them) since none of that module's
  named exports existed. Copied from `.env.example` per its own header
  comment; it is gitignored and points at the placeholder project, never a
  live one.

**NOT verified.** No live Supabase project, no signed-in session, no real
lab-machine walkthrough. The trade this bundle makes is unchanged in kind, only
shorter: a shared machine can still hold a student's unsaved writing in plain
`localStorage` for up to a day, not encrypted, not swept on sign-out.

---

