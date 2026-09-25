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
- Notes: Brief `docs/feedback/2026-09-25/ROUND1_BRIEF.md`, evidence `docs/feedback/2026-09-25/TRIAGE.md`, decisions 37-40. Sessions 2-6 are queued in `docs/feedback/2026-09-25/QUEUE.md` and are NOT this entry's work. Migration numbers 0228 and 0229 are reserved for sessions 2 and 3 and are not this entry's to use.
```

Then follow the brief. Commit and push coherent slices as you go.

**Ending.** When the work is done or the budget is nearly spent: write your history entry,
correct `CLAUDE.md` in place where its truth changed, append the `classroom-updates.json`
entries last, and run the full suite once, reading the summary line and stderr. Merge your
branch into `main` only if all six gates of decision 16 hold (read
`docs/decisions/entries/16-a-lane-may-merge-to-main.md`). Mr. Pina wants this live as soon as
it is ready. If any gate fails, push the branch and stop. Then confirm the deploy against the
version production serves. Your final commit sets the ledger entry's Status to `pushed`. The
final report lists: every item done, with its measured evidence; every item not done, and
why; every claim in the brief that was wrong; what was NOT verified; and the branch name.

---
