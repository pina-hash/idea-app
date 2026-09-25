# Overnight prompt (launched by the router chat on 2026-09-25; do not paste again)

Model: Opus 5.5 with ultracode. The routing row is "many independent fixes across files".

---

ultracode

Ledger 0298. Overnight run: every queued fix from the 2026-09-25 feedback export that can ship without a migration, class-critical first, merged to `main` tier by tier.

**Read first, in this order:** `docs/feedback/2026-09-25/OVERNIGHT_BRIEF.md` (your instructions; its section 1 outranks everything), `docs/feedback/2026-09-25/ROUND1_BRIEF.md` (the item specifications it refers to), `docs/feedback/2026-09-25/TRIAGE.md` (the evidence), `docs/feedback/2026-09-25/QUEUE.md`, decisions 37 to 40 in `docs/decisions/entries/`, and `CLAUDE.md`. They are on your starting ref, `claude/upbeat-pascal-p9krgk`. If not, `git fetch origin` and read them from that branch, `origin/main` or `origin/integration`.

Nobody will answer a question before morning. Decide, record the decision in your history entry, and keep going.

**Duplicate check:** run `git log --oneline origin/main..origin/integration` and `python3 tools/idea-status.py`. Stop only if a bundle there already did this exact work.

**Your FIRST commit, pushed alone,** is `docs/prompt-ledger/entries/0298-overnight-feedback-round.md`:

```
# 0298 Overnight: every no-migration fix from the 2026-09-25 feedback export, class-critical first

- Issued: 2026-09-25
- By: router chat (launched directly, unattended), for one Claude Code session (Opus 5.5, ultracode)
- Owns: `src/lib/ideacad/**`, `src/routes/ideacad/**`, `docs/ideacad/**`, `src/lib/shell/**`, `src/lib/classroom/**`, `src/routes/classroom/**`, `src/routes/api/classroom/**` (a signed-URL route for A6 only if needed), `src/lib/notebook/**`, `src/lib/notebook*.ts`, `src/routes/notebook/**`, `src/routes/api/notebook/**`, `src/lib/feedback/**`, the report-box room hooks in `src/lib/frc/**` and other room stylesheets, `src/lib/design-system/**`, `src/lib/theme.ts`, `src/app.css` (hover token and theme rules), `src/lib/brand/**`, `src/lib/marks/**`, `static/IDEA/` (new emblem copies), `tools/idea_logo_vector.py`, `tools/idea_icon_gen.py`, `src/lib/AppLauncher.svelte`, `src/routes/+page.svelte`, `src/routes/+page.server.ts`, `src/routes/+layout.svelte` (shell mounts only), `src/lib/ProfileMenu.svelte`, `src/lib/PathwayPicker.svelte` (scroll lock only), `src/lib/tour/**`, `src/lib/foundry/FoundryGallery.svelte` and the gallery sort in `src/lib/foundry/**`, `src/routes/foundry/+page.svelte`, `src/routes/tournaments/**` and `src/lib/tournaments/**` (the host settings form only), `src/lib/coin-desk/SectionManager.svelte`, `src/routes/dev/**`, tests for these surfaces, `tools/browser-verify/**` specs for these surfaces plus the generated counts in its `README.md`, `docs/frc/**`, `docs/feedback/2026-09-25/overnight/**`, the sections of `CLAUDE.md` whose truth changes, `classroom-updates.json`, `docs/prompt-ledger/entries/0298-*`, and its own `docs/history/` entry.
- Does not touch: `supabase/**` (proposals go under `docs/feedback/2026-09-25/overnight/proposed/`), `materials/**`, `.github/workflows/**`, `vercel.json`, `src/routes/frc/**` beyond the report-box hook.
- Migration permitted: no. Claims: none (0228 and 0229 are reserved for the proposals, which are NOT migrations and are not applied). Highest on origin/main at issue: 0224
- Status: issued
- Branch: assigned by the harness; the final report names it.
- Notes: Brief `docs/feedback/2026-09-25/OVERNIGHT_BRIEF.md`, which supersedes `ROUND1_PROMPT.md` (never pasted). Merges to `main` tier by tier as each goes green, approved by Mr. Pina on 2026-09-25. Tiers C to E hold between 07:30 and 15:30 Pacific on 2026-09-25. A6 (the bulk file download) was asked for on 2026-09-25 alongside the round.
```

Then follow the brief. Commit and push coherent slices as you go.

**Ending.** Follow the brief's section 5. Write your history entry and correct `CLAUDE.md` in place where its truth changed. Append the `classroom-updates.json` entries last. Run the full suite once at the end, reading the summary line and stderr. Ship the final eligible tier. Set the ledger entry's Status to `pushed` in your final commit. The final report goes to Mr. Pina, who reads it before first period.

---
