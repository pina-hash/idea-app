# 0467 Identity and calendar colors from one library, no neon

- Issued: 2026-10-28
- By: Mr. Pina, in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("Fold in a site-wide color and geometry pass"). Queue: `docs/feedback/2026-10-28/QUEUE-site-ui-pass.md`, section "Lane 0467"
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: `src/lib/AppLauncher.svelte`, `src/lib/portal-apps.ts`, `src/lib/marks/**`, the layer colors in `src/lib/calendar/**`, the unit tint and class color definitions, the Foundry and Armory marks, a generated identity color file from `tools/hx-kit/kit/colors.json` through `solve()`; the lane's tests; one `classroom-updates.json` entry where students see a change; its `docs/history/` entry; this entry.
- Starts: after 0465 lands and after 0455, 0456, 0457, 0458 and 0463 land; alongside 0466
- Migration permitted: no. Claims: none
- Status: pushed
- Mode: solo
- Branch: main (solo)
