# 0195 IdeaCAD: mount the sharing and checkout panels on the real item page, then land

- Issued: 2026-09-12
- By: router chat
- Owns: the IdeaCAD region of `src/lib/classroom/ItemDetail.svelte` and nothing
  else in that file, the IdeaCAD region of
  `src/routes/classroom/[sectionId]/item/[itemId]/+page.svelte`,
  `tests/dom/ideacad-team-mount*`, `tools/browser-verify/routes/ideacad*.mjs`
  and its measured store entries, the merge of `integration` into `main`, the
  reconciling merge back, `docs/prompt-ledger/entries/0195-*`, and its own
  `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0208;
  `origin/integration` carried 0209. `0205` through `0209` are all applied to
  production by hand and verified; the chain ends at `0209` and the range was
  re-read immediately before the merge as well as at branch time.
- Status: pushed
- Branch: `claude/epic-noether-yw3cbp`, branched from `origin/integration` at
  `31c477f6`.
- Notes: ledger 0190 built `SharePanel`, `PartsPanel` and `checkout.ts` and
  could not mount them, because the only route to a Blade surface is
  `ItemDetail.svelte` and that file was another lane's. This bundle is the
  mount and nothing else: no panel is restyled, `checkout.ts` is not touched,
  and `store.ts` keeps its shape.
  **Two things were done outside the Owns line and both are named here rather
  than left to be found.** `classroom-updates.json` took an entry, because the
  standing directive in CLAUDE.md is unconditional for a change students can
  see and this one gives them sharing and part checkout. While writing it, two
  entry objects were found stranded inside that file's `_readme` array on
  `origin/integration` -- the IdeaCAD materials entry and the blade-concepts
  entry -- where `updates.ts` never reads them, so neither had ever rendered to
  a student. Both were moved into `entries` in the same edit.

## Outcome

Recorded after the landing sequence; see `docs/history/epic-noether-yw3cbp.md`
for the measurements and the reasoning.
