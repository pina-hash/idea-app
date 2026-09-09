# 0121 The build stamp's missing date, the two doubling blade exports, and the integrate.yml ordering

- Issued: 2026-09-09
- By: Mr. Pina, carrying prompt 0115's diagnosis and prompt 0116's live
  confirmation of the build stamp, prompt 0105's measurement of the blade
  exports, and the 2026-09-10 red `integration` landing.
- Owns: `src/lib/site-versions.ts`,
  `src/lib/legacy/assignments/idea113-blade-03.html`,
  `src/lib/legacy/assignments/idea113-blade-04.html`,
  `docs/standards/IDEA_VERIFICATION_ADDENDA.md`,
  `docs/standards/REGISTER.md`, ONE new entry under `docs/decisions/entries/`,
  `tests/site-versions*`, `docs/prompt-ledger/entries/0121-*`, and its own
  `docs/history/` entry. It owns NO other source file, and specifically NOT
  `.github/workflows/integrate.yml`, which item FOUR is about.
- Migration permitted: no. Claims: none.
- Lands on: `main`.
- Status: pushed
- Branch: `claude/site-versions-build-blade-fix-gqksqp`, branched from
  `origin/main` at `b03a9410`.
- Notes: four items, three of which change files and one of which deliberately
  does not.

  **ONE, THE BUILD STAMP.** `deriveDeploy` corroborates `VERCEL_GIT_COMMIT_SHA`
  against the head of a build-time `git log --no-merges` before it will state a
  date. Since 2026-09-09 `main` advances by `--no-ff` merge commits, which that
  log excludes, so a deployment built from a merge commit finds no
  corroboration and renders `local build` where the date belongs. Diagnosed by
  ledger 0115 and confirmed empirically by 0116 against live production thirty
  seconds apart -- `d7dd04c` (a plain export commit) rendered `Sep 9, 2026`,
  `786702d` (a merge) rendered `local build` -- so this bundle does not
  re-derive it. **The `agrees` check is not deleted.** It exists to refuse a
  date from a build whose sha it cannot corroborate, which is the whole reason
  the stamp is trustworthy; what is wrong is its field of view, not its
  judgement. The fix widens what it can see to include merge commits and tests
  both shapes.

  **TWO, THE TWO BLADE EXPORTS.** `idea113-blade-03.html` and `-04.html` write
  every uploaded photo into their export twice, invisibly, because their
  renderers self-clear. Prompt 0105 measured it -- `data:image/png;base64,`
  occurring 8 and 4 times against 4 and 2 real images, giving 20.4 MB and
  10.2 MB exports roughly half of which is duplicate -- and left both alone
  because its own prompt forbade touching files without the doubling defect.
  Mr. Pina has now called it. **Prompt 0105's own fix in
  `idea100-blade-01.html` (commit `22016bbd`, "export a blank template plus its
  data") is the shape, reused rather than reinvented**: a second implementation
  of the same repair is the thing that stops matching. Proof is a round trip in
  the container's real Chromium over `file://` -- two images in, export, load
  the export back, report how many came back and whether any `data-field` is
  duplicated -- because the defect is invisible to every static reading of the
  file, which is exactly how it survived.

  **THREE, `IDEA_VERIFICATION_ADDENDA.md` TO 2.5.** From the mirror at
  `origin/main` and NOT from any pasted copy: a sweep on 2026-09-09 found the
  project-knowledge copy self-inconsistent at header 2.4 over a 2.3 changelog
  entry, which is the stale-base condition `IDEA_instructions.md` refuses to
  edit from. Two rules earned this week, both of which are about a check that
  reported success over something it never saw: a coverage check reconciled BY
  NAME misses a route the harness logs under a different string (0116, eight of
  nine reconciled and one vanished; what caught it was arithmetic, 678 new
  measurements over 18 new runs), and a session that starts a background timer
  and polls before it elapses reads its own arithmetic rather than the clock
  (0114, a healthy CI job diagnosed as hung at 17, then 30, then 38 minutes
  against a 4m39s norm, when four minutes had passed). The header and the
  `REGISTER.md` row move in the same commit, because a header that has fallen
  behind its own changelog is the defect this item exists to answer.

  **FOUR, REPORT AND PROPOSE, DO NOT CHANGE.**
  `.github/workflows/integrate.yml` merges a branch, pushes, and DELETES it,
  and only then runs the suite on the merged tree -- so a red merged tree
  cannot stop a merge, and `integration` keeps accepting work while red. This
  landed `integration` red on 2026-09-10 and cost a full landing cycle. **It is
  the file every other lane depends on to land, and four lanes are running
  right now, so changing it is the one kind of bundle that runs alone.** This
  bundle writes a decision entry with `Status: open` stating the problem, the
  exact proposed change, what it costs and the revert, and does not edit the
  workflow. A decision entry is the correct output for a change whose risk is
  entirely in its timing rather than in its content.

  **FOUR LANES RUN BESIDE THIS ONE AND NONE OWNS THESE FILES.** Anything else
  found is reported and not changed.
