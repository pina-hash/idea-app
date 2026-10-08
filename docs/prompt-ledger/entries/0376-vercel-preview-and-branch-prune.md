# 0376 Vercel: no previews for agent branches, and merged agent refs pruned on push to main

- Issued: 2026-10-08
- By: Mr. Pina, through the router chat, from his Vercel cost export (Deployment Storage 354 GB, $27.62 of $43.26 usage, Sep 13 to Oct 8).
- Repo: `pina-hash/idea-app`
- Branch: `claude/inspiring-clarke-yp97hp`, pushed straight to `main` (solo).
- Owns: `vercel.json`, `.github/workflows/prune.yml`, `.github/workflows/integrate.yml` (the comment above `contained_delete_marker` only), `.github/workflows/README.md`, `tests/workflows.test.ts`, the one `CLAUDE.md` rule under Working conventions, this entry, and its own `docs/history/` entry. Added mid-session at Mr. Pina's request ("last push failed so fix that too"): `tools/apply-migration.mjs` (one front-matter line), `docs/migrations-applied/0231-main.md` through `0235-main.md` (one line each), and `docs/migrations-applied/0230-idea-0356-0360-overnight-cc-f81yz3.md`.
- Does not touch: `src/**`, `supabase/**`, `materials/**`.
- Migration permitted: no.
- Status: pushed
- Notes: Audit held: `vercel.json` had no `git` key and no `ignoreCommand`; the contained-delete gate sits between its markers in `integrate.yml`; only `lane/**` previews are required (CLAUDE.md, IDEA_instructions.md); nothing requires an `integration` or agent preview. Recount at session time: 108 agent refs, 105 contained in `origin/main` or `origin/integration`, 3 standing (the router chat's 14:30 figure was 106 of 107). The red CI on `a0fedf31` (Ledger 0375) was `tests/db/migrations-applied-record.test.ts`: tool-written records carried no `source:` line, and 0230 had no record. The history entry is `docs/history/inspiring-clarke-yp97hp.md`.
