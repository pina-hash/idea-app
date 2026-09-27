# 0338 Migrate is red on every push: the probe calls a superseded function body "not applied"

- Issued: 2026-09-27
- By: IDEA & FRC router chat, for one Claude Code session (Opus 5, high)
- Owns: `tools/deploy-probe.mjs`, the probe-derivation code in `tools/idea-status.py`, `.github/workflows/integrate.yml` (checkout depth only), `tests/git-refs-precondition.ts` (its message only), the tests for those, `docs/prompt-ledger/entries/0338-*`, and its own `docs/history/` entry.
- Does not touch: `supabase/**`, `src/**`, `materials/**`, `ci.yml`, `migrate.yml`, `deploy.yml`, `docs/standards/**`.
- Migration permitted: no. Claims: none.
- Status: pushed
- Notes: Confirmed from run 36350843846's own log. The only false probes were 0166 (`_app_short_link_reserved`) and 0214 (`_ideacad_part_owner`), and the later definers' markers (0215, 0216) read true in the same run. Nothing suggests either migration is unapplied. Every marker for a body a later migration replaces is now `kind: superseded`, and it reads applied when the live body is its own or any later definer's. It is deliberately not "the last definer's" alone: that would drag an applied migration to NOT APPLIED whenever a newer redefinition is still unapplied, and migrate.yml applies the lowest one. A missing function still reads NOT APPLIED, and with a record row it is still a CONFLICT. New test `tests/db/deploy-probe-superseded.test.ts` on a constructed chain: both mutants killed, file restored md5-identical. integrate.yml now fetches main (unshallowed) and integration instead of `fetch-depth: 0`, and the sweep's own all-branch fetch still comes before every ref it reads. History: `docs/history/upbeat-wozniak-vcjpzo.md`.
