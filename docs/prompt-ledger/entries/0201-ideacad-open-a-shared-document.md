# 0201 IdeaCAD: the shared-open path, and a place to see what was shared with you

- Issued: 2026-09-13
- By: router chat
- Owns: the shared-open path in `src/lib/ideacad/store.ts`, the
  shared-documents surface under `src/lib/ideacad/`,
  `tests/dom/ideacad-shared-open*`, `tests/db/ideacad-shared-open*`,
  `tools/browser-verify/routes/ideacad*.mjs` and its measured store entries,
  `docs/prompt-ledger/entries/0201-*`, and its own `docs/history/` entry.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0208;
  `origin/integration` carries 0209 and 0210, both of which the prompt states
  are applied to production and verified against Mr. Pina's own queries.
- Status: pushed
- Branch: `claude/peaceful-wright-hupa6x`, branched from `origin/integration`
  at `f4616dca`.
- Notes: ledger 0195 named the gap this bundle closes.
  `ideacad_shared_with_me` and `ideacad_open_shared_document` have been applied
  to production since `0205` and have had NO CALLER; `store.ts` has no
  `openShared`. So a student can GRANT access -- ledger 0190 built
  `SharePanel` and 0195 mounted it -- and the person granted it has no way to
  open the document. The feature is half live and this is the other half.
  Ledger 0200 owns the landing of the standing range; nothing is merged here
  beyond the six-item checklist this prompt's own NO-MIGRATION status permits.
  **The instructor path is not rebuilt.** `0201`'s read policies carry
  `_classroom_manages_item`, so a teacher of record already reads everything
  with no grant; that was confirmed by reading and left alone.

## Outcome

**Landed on `integration` at `14b143c4`; NOT merged to `main`, and the stop is
this prompt's own rule firing exactly as written.**

The prompt permits `0209` and `0210` in the range, both attested applied, and
says **any OTHER migration is a stop**. At branch time (`f4616dca`) the range
carried those two. At the re-read immediately before the merge -- which this
prompt required, and which ledger 0195 required for the same reason one day
earlier -- the range carries:

```
supabase/migrations/0211_ideacad_realtime_policy.sql
```

`0211` is ledger 0203's claimed migration (`claude/lucid-dirac-8b6m2f`, decision
25 option B, private Realtime channels), swept into `integration` in the minutes
between this bundle's CI going green and its branch being swept in. **There is no
record for it under `docs/migrations-applied/`**, so nothing in this container can
say whether it is applied to production, and `CLAUDE.md` is explicit that applied
state is a property of production that no file in this repo records.

`0209` and `0210` were confirmed on the way past, and they are the reason the
range read clean for part of this session: both now carry
`docs/migrations-applied/` records attesting them applied by hand on 2026-09-13
on Mr. Pina's report, and both are on `main` already.

The six-item checklist, each with its command and its answer, read against
`origin/integration` at `14b143c4` and `origin/main` at `ee4a1c42`:

1. `git merge-base --is-ancestor origin/main origin/integration` -- **PASS**, exit 0.
2. CI on this bundle's own work -- **PASS**. `ci.yml` run 34732720093 on
   `f1416f60` concluded `success`; the merged tip `f035e23e` then went green and
   `integrate.yml` swept the branch into `integration` and deleted it, which is
   how a landed branch is supposed to end. No `ci.yml` run exists for
   `integration`'s own tip and structurally cannot: `integrate.yml` pushes with
   `GITHUB_TOKEN` and GitHub starts no run from it, which is ledger 0191's
   finding and `ci.yml`'s own documented behaviour.
3. `git merge-tree --write-tree origin/main origin/integration` -- **PASS**,
   exit 0, clean.
4. `node tools/deploy-probe.mjs --ref origin/integration` -- **CANNOT SAY**,
   `DEPLOY_PROBE_URL` unset. **Ledger 0114's substitution is VOID here**, because
   it applies only while the migration range is empty and gate 5's range is not.
   So gate 4 is decisive rather than waivable, and it points the same way as
   gate 5.
5. Migration range -- **STOP**. `0211` is outside the set this prompt vouches for.
6. Four ledger entries are new in the range (0197, 0200, 0202, 0203) and **all
   four read `Status: pushed`**, checked against `origin/integration` rather than
   the working tree.

**THE BASIS IS STATED BECAUSE THE PROMPT ASKED FOR IT: this bundle merged on
NEITHER basis, because neither was available.** The `0209`/`0210` permission does
not cover `0211`; ledger 0114's substitution is void the moment the range is
non-empty. Two independent gates refuse and the answer is the same from both.

**What is needed to land this range** is one thing and it is not this session's
to do: confirmation that `0211` is applied to production, from somebody who can
see the database -- or a `docs/migrations-applied/0211-*` record, which is the
mechanism ledger 0197 built in this same range for exactly this question. `main`
then takes `integration` with no further work on this bundle's part. The
reconciling merge back is not owed, because no merge to `main` was made.

**PRODUCTION WAS REACHABLE FROM THIS CONTAINER, FOR THE FIRST TIME IN FOUR
DAYS.** `curl -o /dev/null -w '%{http_code}' https://ideabosco.com/` answered
**200**, and `apps.ideabosco.com` answered **200**. Ledgers 0188, 0190 and 0195
each recorded `CONNECT tunnel failed, response 403` and `000` on the three
preceding days, and this prompt warned that the last six containers were refused.
The egress policy has changed, or this container drew a different one; either way
it is worth the next session knowing the refusal is not permanent. The rendered
version string could not be read out of the HTML by the grep used, so no claim is
made about which sha is live.
