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

**Landed on `integration` at `f94bbe3d`; NOT merged to `main`, and the reason is
another lane's migration arriving inside this session.** This prompt's own stop
rule fired exactly as it was written to: `0205` through `0209` are applied and
verified, the chain ends at `0209`, and **any other migration in the range is a
stop**.

At branch time (`31c477f6`) the range ended at `0209` and was clean. On the
re-read immediately before the merge -- which this prompt required precisely
because ledger 0159 read a clean range and one landed forty seconds later --
the range is:

```
supabase/migrations/0209_ideacad_history.sql
supabase/migrations/0210_notebook_note_grid.sql
```

`0210` is ledger 0192's claimed migration (`claude/vigilant-hopper-vt669h`,
swept into `integration` at `e6a43f94` while this bundle's test suite was
running). It is the notebook spreadsheet's VALIDATION GATE widening, which by
`0192`'s own header lands alone and before any producer can emit the shape.
Nothing in this session can say whether it has been applied to production, and
`CLAUDE.md` is explicit that applied state is a property of production that no
file in this repo records. So the merge stops here rather than being reasoned
around, and the six-item checklist is reported as far as it goes:

1. `git merge-base --is-ancestor origin/main origin/integration` -- **PASS**, exit 0.
2. CI on `integration`'s CURRENT tip -- **PASS**. Dispatched by hand on the full
   forty-character sha (`ci.yml` run 34726961641), because `integrate.yml`
   pushes with `GITHUB_TOKEN` and GitHub starts no run from it, which is ledger
   0191's finding and `ci.yml`'s own documented behaviour. The RECORDED INPUT
   was read rather than `head_sha`, per this prompt's warning -- the aggregator
   printed `ref tested: f94bbe3d254759257007ab339f3209185a1650f8 (HEAD)` -- and
   the four `outcome` values were read rather than the rolled-up conclusion:
   `check: success`, `test: success`, `vanguard-changelog: success`,
   `history-verify: success`.
3. `git merge-tree --write-tree origin/main origin/integration` -- **PASS**,
   exit 0, clean.
4. `node tools/deploy-probe.mjs` -- **CANNOT SAY**, and here that is decisive
   rather than waivable: gate 5's range is NOT empty, so ledger 0114's
   substitution does not apply and the stop rule above fires first regardless.
5. Migration range -- **STOP**. `0210` is outside the set this prompt vouches for.
6. Six ledger entries are new in the range (0189, 0190, 0192, 0193, 0194, 0195)
   and **all six read `Status: pushed`** -- checked against
   `origin/integration`, not the working tree.

**What is needed to land this range** is one thing and it is not this session's
to do: confirmation that `0210` is applied to production, from somebody who can
see the database. `main` then takes `integration` with no further work on this
bundle's part. The reconciling merge back is not owed, because no merge to
`main` was made.

**Production was unreachable and was not routed around.**
`curl -sS -o /dev/null -w '%{http_code}' https://ideabosco.com/` answered
`curl: (56) CONNECT tunnel failed, response 403` and `000`. No Vercel URL was
substituted. Ledgers 0188 and 0190 recorded the identical refusal on the two
preceding days, so the sha now live on `ideabosco.com` could not be read; what
can be said is that `main` is unmoved at `85543209`, so production is whatever
that deploy produced.

See `docs/history/epic-noether-yw3cbp.md` for the measurements and the reasoning.
