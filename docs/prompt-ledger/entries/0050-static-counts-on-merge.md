# 0050 integration goes red every time a branch adds a route spec
- Issued: 2026-09-05
- By: router chat for IDEA portal work
- Owns: `.github/workflows/integrate.yml`, `.github/workflows/README.md`, `tools/integrate-gate-proof.sh`, `tools/browser-verify/readme-counts.mjs`, the generated regions of its README, `tests/workflows.test.ts`, `tests/derived-numbers.test.ts`, `docs/prompt-ledger/entries/0050-*`, and its own `docs/history/` entry.
- Migration permitted: no. Highest on origin/main at issue: 0180
- Status: pushed
- Branch: `claude/integration-route-spec-red-upd2no`
- Notes: Three bundles in three days started work and found the suite ALREADY
  RED on their base commit, every time for the same reason: a branch added a
  route spec, merged cleanly, and nothing regenerated the static counts
  region. Prompt 0041 found it red. Prompt 0042 found the measured region
  recorded several route-adding bundles earlier and called it stale. Prompt
  0047 found five of eighteen failing in `derived-numbers` on its base,
  because prompt 0045 had added `foundry-admin-refusal.mjs`.

  Prompt 0035 built mechanical conflict resolution and it works: when a merge
  CONFLICTS on the counts README, the sweep takes the target's side and
  regenerates the static half in about 0.2 seconds. The gap is the merge that
  does NOT conflict. A branch adding a new spec file adds a file, touches
  nothing else, merges clean, and leaves the static region describing a tree
  that no longer exists.

  So every bundle after it opens on a red suite it did not cause, spends part
  of its audit establishing that, and regenerates as a side effect. That cost
  is paid by whoever comes next rather than by whoever caused it, which is the
  shape that makes a recurring tax invisible.

  The static half needs no browser. That is the whole reason prompt 0019 split
  the block: `npm run verify:counts` is a tree read.

  Deliberately excluded: the MEASURED half, which needs a browser and six
  minutes and which prompt 0046 taught to declare its own staleness instead;
  and `deploy.yml`, which is settled.
