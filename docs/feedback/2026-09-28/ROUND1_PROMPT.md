# The prompt for ledger 0347: every 2026-09-28 fix, one session, one push

Routing: many independent fixes across files, one large redesign and one migration, so Opus 5.5 with ultracode
(`IDEA_instructions.md` routing table). Mr. Pina starts it himself: a session launched from inside
another session gets no effort setting and no Workflow tool, so `ultracode` would do nothing.

Start a NEW Claude Code session on `pina-hash/idea-app` from `main`, model Opus 5.5, ultracode on.
Paste everything between the two rules below, once. A prompt already pasted is never pasted again.

---

ultracode

Mode: solo

Ledger 0347. Every fix from the 2026-09-28 feedback export, all eighteen reports, in one session and
one push to `main`: the grading console redesign (decision 43), team edits after posting (decision
44), class themes by class vote (decision 45) and everything else in the brief.

**Read first, in this order:** `docs/feedback/2026-09-28/ROUND1_BRIEF.md` (your instructions),
`docs/feedback/2026-09-28/TRIAGE.md` (the evidence), decisions 42 to 45 in
`docs/decisions/entries/`, and `CLAUDE.md`. These were written on branch
`claude/sleepy-cannon-iobdf9` and pushed to `main`; if they are not on your ref, `git fetch origin`
and read them from `origin/main`, then from that branch. If neither has them, stop and say so.

**Duplicate check before anything else:** run `git log --oneline -20 origin/main` and
`python3 tools/idea-status.py`. Stop if a commit already did this work or a prompt in flight owns an
overlapping path. If your branch slug already has a `docs/history/` entry, add a suffix and say why.

**Your FIRST commit (it goes out in the same single push as everything else)** is this ledger entry at
`docs/prompt-ledger/entries/0347-feedback-2026-09-28-round-1.md`:

```
# 0347 Feedback 2026-09-28: every fix in one push, including the grading redesign, team edits and class themes

- Issued: 2026-09-28
- By: router chat, for one Claude Code session (Opus 5.5, ultracode), Mode: solo
- Owns: `src/lib/classroom/GradingConsole.svelte`, `src/lib/classroom/BulkFileDownload.svelte`, `src/lib/classroom/grading-*.ts`, `src/lib/classroom/presence/**` (placement only), `src/routes/classroom/[sectionId]/item/[itemId]/grade/**`, `src/routes/classroom/grading/**`, `src/lib/classroom/MyClasses.svelte`, `src/lib/classroom/ClassroomShell.svelte`, `src/lib/classroom/ClassView.svelte`, `src/lib/classroom/ItemDetail.svelte`, `src/lib/classroom/UnitManager.svelte`, `src/lib/classroom/PeoplePanel.svelte`, `src/lib/classroom/nav.ts`, `src/routes/classroom/[sectionId]/**` (the new Settings tab and the page drop), `src/routes/classroom/+page.server.ts`, `src/lib/classroom/ContentComposer.svelte`, `src/lib/classroom/composer-drop.ts`, `src/lib/classroom/SpecImporter.svelte`, `src/lib/classroom/InfoTip.svelte`, `src/lib/classroom/ClassroomSettings.svelte`, `src/lib/preferences/classroom.ts` (help strings), `src/lib/classroom/FeedbackConsole.svelte`, `src/routes/classroom/feedback/**`, `src/routes/admin/feedback/**`, `src/lib/feedback/**`, `src/lib/maps/viewer/**`, `src/lib/MatrixRain.svelte`, `src/lib/design-system/themes/matrix-rain.ts`, `src/lib/CodeCounter.svelte`, `src/lib/code-census.ts`, `src/lib/site-versions.ts`, `vite.config.ts` (the numstat gather only), a shared count-up module and its GAUNTLET caller, `src/lib/classroom/plate.css` (panel list only), `tools/idea_logo_vector.py`, `tools/idea_emblem_raster.mjs`, `static/IDEA/` (new light emblem copies), `src/lib/brand/AnimatedLogo.svelte`, `src/routes/dev/**` harnesses for these surfaces, tests for these surfaces, `tools/browser-verify/**` specs for these surfaces and the generated counts in its `README.md`, `docs/feedback/2026-09-28/round1/**`, the sections of `CLAUDE.md` whose truth changes, `docs/decisions/entries/40-*` (one amendment line for R13), `supabase/migrations/0230_classroom_team_edits_and_class_themes.sql` and its `tests/db/` tests, `src/lib/classroom/teams.ts`, `src/lib/classroom/class-teams.ts`, `src/lib/classroom/ClassTeams.svelte`, `src/lib/classroom/sort-drag.ts` (callers only), a new `src/lib/classroom/class-theme.ts` and its components, `classroom-updates.json`, this entry, and its own `docs/history/` entry.
- Does not touch: `supabase/**` beyond 0230, `materials/**`, `.github/**`, `vercel.json`, the 2026-09-25 SQL proposals.
- Migration permitted: yes, exactly one. Claims: 0230. Highest on origin/main at issue: 0224. Not this entry's: 0228 and 0229 (the 2026-09-25 proposals).
- Status: issued
- Branch: assigned by the harness; the final report names it.
- Notes: Brief `docs/feedback/2026-09-28/ROUND1_BRIEF.md`, evidence `docs/feedback/2026-09-28/TRIAGE.md`, decisions 42 to 45. ONE push to `main` when everything is green (solo mode; Mr. Pina, 2026-09-28: "all of these fixes pushed in one go, directly to main").
```

Then follow the brief. Commit locally as you go and push to `main` once, as the brief's rule 2 says.
Never force-push `main`.
