# 0182 Resolving the standing notebook overhaul branch, one way or the other

- Issued: 2026-09-12T16:40:00Z
- By: router chat
- Owns: the resolution of `claude/notebook-ui-theme-overhaul-0gnx0f` onto
  `integration`, whatever files that merge touches,
  `docs/prompt-ledger/entries/0182-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0203
- Status: pushed
- Branch: claude/affectionate-newton-xkuftf (cut from origin/integration
  `b0a8101d`, which is level with `origin/main`)
- Notes: `claude/notebook-ui-theme-overhaul-0gnx0f` is ledger 0119's LOSING
  branch of a fork -- 0119 was issued once and run twice, and
  `claude/notebook-ui-theme-overhaul-t3dc3a` won by arriving first. The loser
  has stood since 2026-09-09 and `merge-tree` refuses it against `integration`
  across TEN files. Ledger 0122 harvested it by content; ledger 0163
  recommended archiving what was left. This bundle VERIFIES that harvest
  against the tree rather than taking either report's word, and then either
  archive-tags the branch or merges it properly. It does not split the
  difference and does not leave it standing.

  A cloud session cannot delete a remote branch -- the proxy refuses the RPC
  with HTTP 403 and git reports "Everything up-to-date" over the failure -- so
  the outcome of an archive decision is a TAG, pushed and verified with
  `git ls-remote`, with the deletion left to Mr. Pina or to `integrate.yml`.

  NO MIGRATION, so the six-item merge checklist is available with ledger
  0114's gate 4 substitution applying: `DEPLOY_PROBE_URL` is unset in this
  container and the probe fails closed, and the range carries no migration for
  it to prove.
