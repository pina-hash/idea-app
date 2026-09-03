# 0019 Decision 12: stop the counts block serialising every branch
- Issued: 2026-09-03
- By: router chat for IDEA portal work
- Owns: `tools/browser-verify/readme-counts.mjs`, `tools/browser-verify/README.md`, `tests/derived-numbers.test.ts`, the scripts block in `package.json`, `.github/workflows/ci.yml` and `integrate.yml` if the chosen design needs them, `docs/prompt-ledger/entries/0019-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0174
- Status: pushed
- Branch: `claude/counts-block-serialization-dys0yu`, branched from `origin/main` at `5d79b6f`.
- Notes: On 2026-09-03 five finished, CI-green branches all failed to merge,
  every one of them on `tools/browser-verify/README.md`. Each had regenerated
  the counts block against its own tree, each wrote different numbers into
  the same lines, and the automation correctly refused five mutually
  exclusive edits to one generated file. Unpicking it took a whole bundle,
  0017, whose resolution was to discard four of the six blocks unread and
  regenerate once at the end.

  The block mixes two kinds of number with different costs.
  STATIC counts (route specs, distinct routes, dev pages, runs) are a cheap
  tree read. MEASURED numbers (measurements, outside-threshold rows, wall
  clock, selftest controls) need a real browser and about six minutes.
  `assembleCounts` requires a measured report for both, so moving a static
  count costs a six-minute browser run, and any branch adding a route spec
  must pay it or go red.

  That is the coupling to break. Adding a route spec should not make a
  branch unmergeable against every other branch that added one.

  Deliberately excluded: changing what the harness measures, the two
  documented flaky specs, and the four standing outside-threshold findings.
