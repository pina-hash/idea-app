---
title: "Scope guardrails"
date: 2026-06-20
branches: []
migrations: []
subsystems: ["Build, theme, tests, conventions"]
record_order: 83
---

Phase 1 (done) was the **foundation**: Google login, profiles/roles backend,
and the public-vs-protected route split.

Phase 2 (done) was **carrying over legacy content** without rebuilding it: the
serving patterns above, with every assignment/reference HTML carried over, the
VANGUARD game and coin leaderboard available, the coin entry tool gated to
teachers, and the `/IDEA/` asset paths handled by the `static/IDEA/` mirror plus
the serve-time `.html` link rewrite. Do not modify legacy HTML internals (except
VANGUARD, which is now unfrozen, see the standing rule above).

Phase 3 (done) was the **public-first pivot**: the original IDEA index restored
as the public landing page `/`, assignments made public, optional sign-in, and
the first signed-in feature **VANGUARD cloud saves** (see the VANGUARD endpoint
section).

Phase 4 (done) reshaped the portal around the **2026-27 curriculum**: the
homepage is the student dashboard (the dashboard is teacher-only), students
self-select their class (`profiles.section_id`) and see it pinned, the
discontinued IDEA-113/208/303/403 courses moved to `/archive`, and the changelog
is auto-generated from git history. Per-user IDEA Coin login is still deferred:
the coin system lives entirely in Google Sheets / Apps Script, with no Supabase
coin backend yet. No coin economy logic in this repo. Do not modify legacy HTML
internals, with the standing exception of VANGUARD's
`src/lib/legacy/vanguard/index.html`, which is now the editable canonical game
source (surgical edits only, see "VANGUARD is unfrozen" above).

Phase 5 (current) is the **IDEA // GAUNTLET** foundation: the CAD skills dojo
shell, the full data model for all six modes, and the first mode (Drawing
Reading) end to end with server-side grading and a leaderboard view. See the
"IDEA // GAUNTLET" section above and `docs/GAUNTLET.md`. Out of scope for this
phase and deliberately deferred to later prompts: Speedrun, the SolidWorks VBA
macro, coin payouts, and the full authoring UI. The schema and shell anticipate
them; do not build them early.

