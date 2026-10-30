# 0469 The 11px floor, 44px controls, 72ch prose and container layouts, checked by verify:browser

- Issued: 2026-10-28
- By: Mr. Pina, in the IDEA & FRC chat "IDEA Website Feedback Pass Ranked List" ("Fold in a site-wide color and geometry pass"). Queue: `docs/feedback/2026-10-28/QUEUE-site-ui-pass.md`, section "Lane 0469"
- Model: Opus 5.5, effort high
- Repo: `pina-hash/idea-app`
- Owns: the font-size, tap-target and width rules across `src/` (onto the `--fs-*` scale), `tools/browser-verify/**` (the 1152 width, the 11px, control-floor and squeeze checks); the lane's tests; one `classroom-updates.json` entry where students see a change; its `docs/history/` entry; this entry.
- Starts: after 0468 lands
- Migration permitted: no. Claims: none
- Status: pushed
- Mode: solo
- Branch: main (solo)
- Notes: the launcher specs and `src/lib/AppLauncher.svelte` were left to lane 0472, which took them over mid-lane, so the launcher's words are still under 11px. `tools/hx-kit/kit/plate.css` changed (its label parts read `--plate-label-size`, 11px). `tools/hx-kit/test.mjs` also changed, outside this lane's one permitted kit file: its squeeze check moved into `tools/browser-verify/checks-floor.mjs` and `test.mjs` imports it, because a script with top-level work cannot be imported and a second copy was ruled out; named for the HTML standards chat. Armory left alone (another chat). Record: `docs/history/type-taps-width-0469.md`.
