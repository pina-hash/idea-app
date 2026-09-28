# Round 1 prompt (2026-09-28), ledger 0347

Routing: many independent fixes across files plus one large redesign, so Opus 5.5 with ultracode
(`IDEA_instructions.md` routing table). Mr. Pina starts it himself: a session launched from inside
another session gets no effort setting and no Workflow tool, so `ultracode` would do nothing.

Start a NEW Claude Code session on `pina-hash/idea-app` from `main`, model Opus 5.5, ultracode on.
Paste everything between the two rules below, once. A prompt already pasted is never pasted again.

---

ultracode

Mode: solo

Ledger 0347. Round 1 of the 2026-09-28 feedback: redesign the grading console (decision 43) and
land every fix from that export that needs no migration.

**Read first, in this order:** `docs/feedback/2026-09-28/ROUND1_BRIEF.md` (your instructions),
`docs/feedback/2026-09-28/TRIAGE.md` (the evidence), decisions 42 and 43 in
`docs/decisions/entries/`, and `CLAUDE.md`. These were written on branch
`claude/sleepy-cannon-iobdf9` and pushed to `main`; if they are not on your ref, `git fetch origin`
and read them from `origin/main`, then from that branch. If neither has them, stop and say so.

**Duplicate check before anything else:** run `git log --oneline -20 origin/main` and
`python3 tools/idea-status.py`. Stop if a commit already did this work or a prompt in flight owns an
overlapping path. If your branch slug already has a `docs/history/` entry, add a suffix and say why.

**Your FIRST commit, pushed to `main` alone before any other work,** is this ledger entry at
`docs/prompt-ledger/entries/0347-feedback-2026-09-28-round-1.md`:

```
# 0347 Feedback 2026-09-28 round 1: the grading console redesign and every no-migration fix

- Issued: 2026-09-28
- By: router chat, for one Claude Code session (Opus 5.5, ultracode), Mode: solo
- Owns: `src/lib/classroom/GradingConsole.svelte`, `src/lib/classroom/BulkFileDownload.svelte`, `src/lib/classroom/grading-*.ts`, `src/lib/classroom/presence/**` (placement only), `src/routes/classroom/[sectionId]/item/[itemId]/grade/**`, `src/routes/classroom/grading/**`, `src/lib/classroom/MyClasses.svelte`, `src/lib/classroom/ClassroomShell.svelte`, `src/lib/classroom/ClassView.svelte`, `src/lib/classroom/ItemDetail.svelte`, `src/lib/classroom/UnitManager.svelte`, `src/lib/classroom/PeoplePanel.svelte`, `src/lib/classroom/nav.ts`, `src/routes/classroom/[sectionId]/**` (the new Settings tab and the page drop), `src/routes/classroom/+page.server.ts`, `src/lib/classroom/ContentComposer.svelte`, `src/lib/classroom/composer-drop.ts`, `src/lib/classroom/SpecImporter.svelte`, `src/lib/classroom/InfoTip.svelte`, `src/lib/classroom/ClassroomSettings.svelte`, `src/lib/preferences/classroom.ts` (help strings), `src/lib/classroom/FeedbackConsole.svelte`, `src/routes/classroom/feedback/**`, `src/routes/admin/feedback/**`, `src/lib/feedback/**`, `src/lib/maps/viewer/**`, `src/lib/MatrixRain.svelte`, `src/lib/design-system/themes/matrix-rain.ts`, `src/lib/CodeCounter.svelte`, `src/lib/code-census.ts`, `src/lib/site-versions.ts`, `vite.config.ts` (the numstat gather only), a shared count-up module and its GAUNTLET caller, `src/lib/classroom/plate.css` (panel list only), `tools/idea_logo_vector.py`, `tools/idea_emblem_raster.mjs`, `static/IDEA/` (new light emblem copies), `src/lib/brand/AnimatedLogo.svelte`, `src/routes/dev/**` harnesses for these surfaces, tests for these surfaces, `tools/browser-verify/**` specs for these surfaces and the generated counts in its `README.md`, `docs/feedback/2026-09-28/round1/**`, the sections of `CLAUDE.md` whose truth changes, `docs/decisions/entries/40-*` (one amendment line for R13), `classroom-updates.json`, this entry, and its own `docs/history/` entry.
- Does not touch: `supabase/**`, `materials/**`, `.github/**`, `vercel.json`, the teams RPCs and team editing (session 3), class themes (session 4).
- Migration permitted: no. Claims: none. Highest on origin/main at issue: 0224. Reserved for later sessions and not this entry's: 0228, 0229, 0230, 0231, 0232.
- Status: issued
- Branch: assigned by the harness; the final report names it.
- Notes: Brief `docs/feedback/2026-09-28/ROUND1_BRIEF.md`, evidence `docs/feedback/2026-09-28/TRIAGE.md`, decisions 42 and 43. Pushes to `main` tier by tier as each goes green (solo mode; decision 43, "straight to main"). Sessions 2 to 4 are queued in `docs/feedback/2026-09-28/QUEUE.md` and are not this entry's work.
```

Then follow the brief. Commit and push coherent slices tier by tier as the brief's rule 2 says.
Never force-push `main`.
