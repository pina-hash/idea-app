# 0160 IdeaCAD: the first look at a visual surface nobody has ever seen

- Issued: 2026-09-11
- By: router chat
- Owns: `src/lib/ideacad/**`, `src/routes/dev/ideacad/**`, `tests/ideacad*`,
  `tests/dom/ideacad*`, `tools/browser-verify/routes/ideacad*.mjs` and the generated
  regions of its README, `docs/prompt-ledger/entries/0160-*`, and its own
  `docs/history/` entry
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0201
- Status: pushed
- Branch: `claude/ecstatic-maxwell-juawx5`, branched from `origin/integration` at `87ba98a`
- Notes: Ledger 0145 built the IdeaCAD subsystem in a Codex container with no Chromium and
  a Vite that would not stay up, and said so: screenshots, the 375 and 1440 measurements
  and a frame-time p95 could not be established. The data model and the arithmetic are
  proven by `tests/`; the ENTIRE VISUAL SURFACE has never been looked at. This bundle is
  the first look: audit what exists against `docs/prompts/0145-ideacad.md`, drive
  `/dev/ideacad` in real Chromium at 375 and 1440, report what is broken rather than
  assuming it works because tests pass, then fix and cover what it finds.
  **NO MIGRATION**, and no `supabase/` file: `0201` is applied and verified on production,
  and ledger 0161 is in flight carrying the hand-applied grant repair as `0202`. A grant
  problem found here is REPORTED to that lane, never fixed here.

## Outcome

**Duplicate check, three ways, all clear.** (1) `git log --oneline origin/main..origin/integration`
-- seven subjects, one of them the `codex/execute-instructions-from-ideacad.md` merge that IS
ledger 0145's build; nothing there had done this bundle's work. (2) `tools/idea-status.py
--since 195` read the ledger across `origin/main`, `origin/integration` and every `claude/**`
and `codex/**` branch: 140 entries in flight, no `0160`, and the only entry owning
`src/lib/ideacad/**` is 0145 itself, `Status: pushed`. A live fetch of
`contents/docs/prompt-ledger/entries` confirmed no `0160-*` on `main`. (3)
`node tools/migration-claims.mjs`: highest landed 0201, next free 0202 (which ledger 0161
holds), and this entry claims none, so no number can collide.

**Fetches and identity.** The ledger listing live from the GitHub contents API; the standards
`REGISTER.md` from raw (agreed with the local mirror, `IDEA_instructions.md` 4.26 /
2026-09-10); `tools/idea-status.py`'s own clone of every ref. Identity read from the session
rather than asserted: configured `claude-opus-5`, last served `claude-opus-5`, effort `high`.

**Found versus built.** Four of the prompt's eight parts had landed. The migration, the
physics and geometry layer, the live transport, the discriminator and the records were built
and are reported, not rebuilt. `src/lib/ideacad/geometry.ts` (the three.js geometry builder)
and `src/lib/ideacad/config.ts` have zero importers in the whole tree; `viewport/controls-math.ts`
is imported only by its own test; there is no `Viewport.svelte`, no canvas and no
PropertyManager. `createIdeacadTransports` is constructed at the item page and never passed
anywhere, which is 0145's surface and is reported, not touched.

**Claims corrected.** `CLAUDE.md`'s verification baseline says 0 errors / 37 warnings; measured
on `origin/integration` at branch time it is **0 / 40 in 22 files** (34 `state_referenced_locally`,
5 `css_unused_selector`, 1 `perf_avoid_nested_class`). This bundle ends at **0 / 38 in 21
files**. `CLAUDE.md` is not this bundle's surface, so the figure is reported rather than edited.

**The measurements** (Chromium 141.0.7390.37, Vite on 5199, 2026-09-11). Before: the console
628.0x760 in a 1440 window, the 3D viewport pane **0.0x431.3** at 1440 and 234.5x360 at 375,
`grid-template-columns: 300px 0px 280px`, one control under the 44px floor. After: 1440.0x760,
858.0x559.3, 373.0x360, `300px 858px 280px`, zero under the floor. The prediction gate opened
on one keystroke with no concept picked and Reveal never pressed. Five concept controls had no
handler. Covered by `tests/dom/ideacad-editor-mount.test.ts` (14) and three route specs (108
measurements, three states, two widths, 0 outside threshold), mutation-proved both directions
with the file restored byte-identical. One full `verify:readme` on the clean committed tree at
`51a1c98`: **388 runs, 6790 measurements, 0 outside threshold, 1027.0s**.

**Reported to other lanes, and one of them fixed it mid-flight.**
`tests/grant-surface.test.ts` failed 4 tests at this branch's point, measured identical
before and after this bundle's changes in a worktree at `87ba98a`: `0201` left all four
`ideacad_*` tables granted to `anon` and `authenticated` with
`select, insert, update, delete, truncate, references, trigger`. **Ledger 0161 landed
`0202_ideacad_anon_grant_repair.sql` while this session ran** and ledger 0162 merged it
ahead of the main landing; merging `integration` back in takes the repair and the file is
green here. This bundle wrote no `supabase/` file.
`tests/db/migration-0177-tombstone.test.ts` reported hole `0200` and named this branch as
holding `0190` and `0191`: **a stale local ref view, not a finding.** A session that has
fetched only `main` and `integration` has no `origin/claude/**` refs, so every in-flight
claim is invisible; `git fetch origin '+refs/heads/*:refs/remotes/origin/*'` and the file
passes 4 of 4 unchanged, which is why CI was green on the identical tree.
`tests/derived-numbers.test.ts` was red at the branch point on a stale counts region and is
green here. **The suite on the merged tree ends at 0 failures of 7632.**

**Not verified:** no frame-time p95 (PART 4's 300-frame drag has no canvas, no camera and no
controls binding to drag); nothing signed in; no production database; web fonts blocked by the
harness so every ratio is the fallback stack; `prefers-reduced-motion` unexercised.

