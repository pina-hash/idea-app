# Round 1 prompt, ready to paste

Start a NEW Claude Code session on `pina-hash/idea-app` from `main`, with model Opus 5.5 and
ultracode on. Paste everything between the two rules below, once. A prompt that has
already been pasted is never pasted again.

---

ultracode

Ledger 0298. Feedback round 1: fix what is broken in class and land every fix that needs no
migration, from the 2026-09-25 feedback export.

**Read first, in this order:** `docs/feedback/2026-09-25/ROUND1_BRIEF.md` (your instructions),
`docs/feedback/2026-09-25/TRIAGE.md` (the evidence for every report), decisions 37 to 40 in
`docs/decisions/entries/`, and `CLAUDE.md`. These files were written on
branch `claude/upbeat-pascal-p9krgk`; if they are not on your ref, `git fetch origin` and read them
from `origin/main`, then `origin/integration`, then that branch (in that order). If none has them,
stop and say so.

**Duplicate check before anything else:** run `git log --oneline origin/main..origin/integration`
and `python3 tools/idea-status.py`. Stop if a bundle already there did this work, or if a prompt
in flight owns an overlapping path. A branch slug that already has a `docs/history/` entry gets a
suffix, and you say why.

**Your FIRST commit, pushed alone before any other work,** is this ledger entry at
`docs/prompt-ledger/entries/0298-feedback-round-1.md`:

```
# 0298 Feedback round 1: broken in class, and every no-migration fix from the 2026-09-25 export

- Issued: 2026-09-25
- By: router chat, for one Claude Code session (Opus 5.5, ultracode)
- Owns: `src/lib/ideacad/app/IdeaCadApp.svelte` (style block only), `src/routes/ideacad/preview/+page.svelte` (style block only), the IdeaCAD context-menu component only (R04), `src/lib/shell/**`, `src/lib/classroom/**`, `src/routes/classroom/**`, `src/lib/feedback/**` (the report control is `src/lib/feedback/SiteFeedback.svelte`), the room-hook declarations in `src/lib/frc/**` and other room stylesheets for the report box only, `src/lib/design-system/**`, `src/lib/theme.ts`, `src/app.css` (hover token and theme rules), `src/lib/brand/**`, `src/lib/marks/**`, `static/IDEA/` (new emblem copies), `tools/idea_logo_vector.py`, `tools/idea_icon_gen.py`, `src/lib/AppLauncher.svelte`, `src/routes/+page.svelte`, `src/routes/+page.server.ts`, `src/lib/ProfileMenu.svelte`, `src/lib/PathwayPicker.svelte` (scroll lock only), `src/lib/tour/**`, `src/lib/foundry/FoundryGallery.svelte` and the gallery sort in `src/lib/foundry/**`, `src/routes/foundry/+page.svelte`, `src/routes/tournaments/**` and `src/lib/tournaments/**` (the host settings form only), `src/lib/coin-desk/SectionManager.svelte` (P3 only), `src/routes/dev/**` harnesses for these surfaces, tests for these surfaces, `tools/browser-verify/**` specs for these surfaces plus the generated counts in its `README.md`, `docs/feedback/2026-09-25/round1/**`, the sections of `CLAUDE.md` whose truth changes, `classroom-updates.json`, `docs/prompt-ledger/entries/0298-*`, and its own `docs/history/` entry.
- Does not touch: `supabase/**`, `materials/**`, `.github/workflows/**`, `vercel.json`, the IdeaCAD kernel, sketch and document code, `src/lib/notebook/**` beyond what the check-in counts read, `src/routes/frc/**` beyond the report-box room hook.
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0224
- Status: issued
- Branch: assigned by the harness; the final report names it.
- Notes: Brief `docs/feedback/2026-09-25/ROUND1_BRIEF.md`, evidence `docs/feedback/2026-09-25/TRIAGE.md`, decisions 37-40. Sessions 2-6 are queued in `docs/feedback/2026-09-25/QUEUE.md` and are NOT this entry's work. Migration numbers 0228 and 0229 are reserved for sessions 2 and 3 and are not this entry's to use. Merges its own branch into `main` tier by tier (P0, P1, then the rest) as each goes green, approved by Mr. Pina on 2026-09-25 ("merging committing and pushing directly to main ... so that changes are live as soon as they're done. But not at the cost of total development time").
```

Then follow the brief. Commit and push coherent slices as you go.

**Shipping: live as each tier lands, straight to `main`.** Mr. Pina approved on 2026-09-25 that
this session merges, commits and pushes directly to `main`, so every change is live as soon as
it is done, without waiting on the `integration` sweep or a person. Ship in TIERS rather than
once at the end: when every P0 item is done, then when P1 is done, then when P2 and P3 are done,
do this:
1. `git fetch origin main` and merge `origin/main` into your branch; resolve on the branch.
2. Run `npx svelte-kit sync && npx svelte-check`, the test files for the surfaces this tier
   touched, and `npm run build`, reading summary lines and stderr, never exit codes alone. At
   the FINAL tier, run the full suite once instead of the touched files.
3. If they are clean against Phase 0's baseline, merge your branch into `main` with `--no-ff`
   and push `main`. Never force-push `main`. If anything is red, do not merge that tier: fix it,
   or leave it on the branch and say why in the report.
4. Confirm the deploy against the version production serves, then keep working.
A tier that fails its checks never blocks the next tier's work; it just does not ship until it
is green. This round carries no migration, so there is nothing to apply and deploy ordering does
not arise.

**Ending.** When the work is done or the budget is nearly spent: write your history entry,
correct `CLAUDE.md` in place where its truth changed, append the `classroom-updates.json`
entries last, ship the final tier as above, and set the ledger entry's Status to `pushed` in that
final commit. The final report lists every item done with its measured evidence, every item not
done and why, every claim in the brief that was wrong, what was NOT verified, which tiers
reached `main` and at which commits, and the branch name.

---
