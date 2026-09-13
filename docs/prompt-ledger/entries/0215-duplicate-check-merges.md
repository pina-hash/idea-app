# 0215 Duplicate check, the three stalled branches, and the landing

- Issued: 2026-09-13
- By: router chat
- Owns: the merges of `claude/dazzling-ramanujan-i2hry6`,
  `claude/blissful-ptolemy-8c1toe` and `claude/gracious-hopper-a46lec` into
  `integration`, the conflict resolutions those merges need,
  `docs/prompt-ledger/entries/0215-*`, and its own `docs/history/` entry. NO OTHER
  SOURCE FILE.
- Migration permitted: no. **Claims: none.**
- Status: issued
- Branch: `claude/0215-duplicate-check-merges-stoxut`, branched from `origin/main` at
  `ee4a1c42`.
- Notes: A merge-and-land bundle. Five branches stood outside `integration`; two of
  them (`claude/busy-feynman-aupq55` and `claude/sharp-einstein-cqrnx6`, ledgers
  `0207` and `0212`, carrying migrations `0212` and `0213`) were named in the prompt
  as in flight and were not touched. The load-bearing merge was ledger `0205`'s,
  which carried `IDEA_instructions.md` 4.27 -- ten standards rules that existed on
  no shared ref.

  **The duplicate check ran three ways and all three came back clean.** (1) A live
  fetch of `docs/prompt-ledger/entries/` from `origin/main` answers 404 for
  `0215-duplicate-check-merges.md`, and the GitHub contents listing for that path on
  `main` tops out at `0201`. (2) Every remote ref was swept with
  `git ls-tree -r --name-only <ref> -- docs/prompt-ledger/entries`: the highest
  `021x` entry on any ref is `0212`, on `claude/sharp-einstein-cqrnx6`, and no ref
  carries a `0215-*` file; `git log --all -i --grep='ledger 0215'` matches nothing.
  (3) `node tools/migration-claims.mjs` reports highest landed `0211`, next free
  `0214`, with `0212` held by `claude/busy-feynman-aupq55` and `0213` by
  `claude/sharp-einstein-cqrnx6`. This bundle claims nothing, so it collides with
  none of it.

  **Two of the three branches merged; the third was already rescued.** `0205`
  conflicted on exactly the two files predicted -- `IDEA_instructions.md` and
  `REGISTER.md` -- and both were resolved by taking `integration`'s 4.28, after
  proving 4.28 is a strict superset of 4.27 rather than assuming the supersede: of
  the 126 non-blank body lines 4.27 adds over 4.26, 125 appear verbatim in 4.28 and
  the one that does not is the version header itself. `0206` was docs-only and
  merged with no conflict at all. `0196`'s merge conflicted in
  `src/lib/ideacad/store.ts`, which is not one of the three files with a required
  method and is a source file this bundle does not own, so it was a STOP -- and then
  became moot: ledger `0211` (`claude/eager-curie-6s4xcz`) merged `0196`'s tip and
  landed the whole surface into `integration` at 06:15:46Z, mid-session, which is the
  same mid-run tip movement ledger `0195` was bitten by.

  **`REGISTER.md` was reconciled against what actually landed, in both directions.**
  `0210` had moved only the `IDEA_instructions.md` row and left
  `IDEA_VERIFICATION_ADDENDA.md` at 2.5 because `0205`'s 2.6 was outside its surface;
  with both files on one ref the addenda row moves to 2.6. All 20 rows were then
  checked against their files' own version headers, zero mismatches.
