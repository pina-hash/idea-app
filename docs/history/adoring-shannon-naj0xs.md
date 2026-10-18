---
title: "Ledger 0396: the tab icon, the Install app key, one-click classes, the class page toolbar, post thumbnails, one feedback window and the per-student page (`claude/adoring-shannon-naj0xs`)"
date: 2026-10-18
branches: [claude/adoring-shannon-naj0xs]
migrations: ["0268", "0269"]
subsystems: [Tab icon, Install app, Home page, Classroom, Class page, Post thumbnails, HTML assignments, Feedback, Student page, Short links, Migrations, Standards]
---

Mr. Pina's prompt 0396 (solo mode) asked for seven parts, each built to a high
standard and refined through independent review until a review came back clean,
then pushed straight to `main` by the session that built them. It also answered
six reports from the 2026-10-16 feedback round: bd38fa25, 08bafda7 and 169b931d
(the per-student page), 0fe82a80 and 80bb4d23 (the feedback window on the Coin
Ledger and in GAUNTLET), and a6a037f3 (post thumbnails). This entry is the
record of all seven parts: what was built, the decisions behind it, what was
measured, the review rounds, what was not verified, and what is left for Mr.
Pina.

## How the bundle was run

- **One git worktree per part**, under `/home/user/wt/pN-*`, each on a local
  branch with its own dev-server port (5301 to 5307), so seven builders never
  shared a working tree or a server. `node_modules` was hard-linked from the
  main checkout and each worktree had a placeholder `.env`. None of the
  worktree branches was pushed; each part reached the session branch as one
  squash commit.
- **Builders ran four at a time** (Mr. Pina chose four over two partway through,
  in answer to a question about whether more should build at once). The
  workflow runner caps one workflow at two agents on this four-CPU container,
  so two workflows ran side by side. Widening it meant stopping the first
  workflow, and the restart killed two builders in flight (parts 1 and 6). Each
  replacement resumed from the commits and notes already in its worktree and
  kept that work.
- **Every part went build, independent review, fix, and review again**, until a
  review found no blocker, no wrong behaviour and no confusion. A polish round
  followed for every part, and its own review. Each part's section below lists
  its rounds with their counts. Accepted polish items name their measured band
  and the reason they were accepted.
- **Merge order onto the session branch**: part 1, 3, 6, 5, 4, 7, 2. Conflicts
  were the generated README count block (taken from ours, then
  `npm run verify:counts`), the classroom settings-help spec (parts 4 and 6 each
  added a teacher setting, resolved to thirteen), and a `page` import that the
  part 3 + 6 merge duplicated in `src/routes/dev/home-feed/+page.svelte`. After
  each merge the touched test files were run and svelte-check read off its
  summary line.
- **The migration numbers.** The ledger claimed 0268 to 0272. Part 6 wrote
  0268 and part 5 wrote 0271, so the integrator renamed part 5's file and test
  to 0269 and updated every reference (`src/lib/short-links.ts`, `CLAUDE.md`,
  `tests/short-link-redirect.test.ts`, `tests/short-link-reserved-names.test.ts`)
  so that the bundle's two files apply in order with no gap. 0270, 0271 and 0272
  were not used.
- **Commit ids.** The eleven commits on `main` are, in order: the ledger entry,
  the seven parts (`e5d7329b` part 1, `83ecf259` part 3, `623c2893` part 6,
  `5bf865a4` part 5, `fb59e703` part 4, `699455f9` part 7, `ce7fde46` part 2),
  the browser measurements (`eb1c64fb`), the integration fixes (`a37e1cc0`) and
  the records. Any other id in this entry names a working commit, either in a
  part's worktree or on the session branch before the integration fixes were
  folded into `a37e1cc0`, and is not on any pushed branch.
- **The one full-suite failure, and its fix.** The final full run (832 files,
  15,230 tests) failed one: `tests/db/cert-0260-engine.test.ts` re-applied
  0260 over the whole chain, which now ends with 0269, so 0260's 37-name
  `_app_short_link_reserved` replaced 0269's 38-name one, and the fingerprint
  moved. The same suite's 37-name count then passed only BECAUSE of that
  revert. The re-apply test now runs on its own chain ending at 0260 (the
  shape the 0233 suites already use), and the count became the rule it stood
  for: every one of 0260's 37 names, written out, is still reserved, and the
  total belongs to the newest reservation file's own test (0269 pins 38). A
  mutant renaming one of 0260's names in 0269 reddens it; a mutant dropping a
  name is refused by 0269's own self-check first. The fix is folded into part
  5's commit beside 0269, and that file plus 0269's own test pass 28 of 28.
  The full suite was not run a second time after this test-only change.
- **Browser measurements**: every new or changed spec was measured on the merged
  tree with `npm run verify:readme` (the ones the parts added and the ones
  their merges touched, 127 specs over four runs, 0 outside threshold), and the
  records are in the `Browser checks: ledger 0396 measurements` commit. After
  the integration rounds the 52 specs whose behaviour those rounds changed
  were measured again on the final tree: 104 runs, 1,784 measurements, 0
  outside threshold. The changelog specs were left out of that run because
  this container's checkout holds 84 commits of history and they expect 150
  rows.

## Part 1: the tab icon (Gear Key), static and live

Built by two builder sessions: the first was stopped after about 36 minutes (to widen parallelism) while adding harness specs, and a second resumed from its commit (`2aa53c78`), kept all of it, and finished the part (`481d6240`). One polish round followed (`8d3f0715`). All three are squashed into `e5d7329b`.

### What changed

The browser tab now shows a machined IDEA key (the Plate's graphite key) instead of the shrunk emblem. The glyph on the key says which section you are in (Home is the emblem's gear with a mint LED hub), and a lamp plus the key's hairline edge say what is happening: error, live, unread, attention, progress, saving, done or offline. The home-screen icons are the same key, with no black square behind it on iPhone or Android.

- `src/lib/tab-icon/geometry.ts`: a pure TypeScript port of `BASES.gearkey` from the attached `idea-tab-icon.js` (upload `8f9f8be6-idea-tab-icon.js`). `swkey`, `freegear` and `idkey` are deleted with the helpers only they used. It is held byte for byte to `tests/fixtures/tab-icon-golden.json`, which `tools/tab-icon/golden.mjs` records mechanically from the attachment: 771 cases (every section plus null, every status and phase, two uids) and 10 whole SVGs, with the attachment's sha256 in `source_sha256` (prefix `8002914d9d96bb5c`).
- `src/lib/tab-icon/sections.ts`: path to section by longest prefix over every `route` and `also`, on a path boundary; anything unclaimed is Home.
- `src/lib/tab-icon/status.ts`: the registry. `TAB_STATUS_PRIORITY` is error, live, unread, attention, progress, saving, done, offline; done clears itself after `DONE_CLEAR_MS` (4000); error stays until cleared; unread counts add.
- `src/lib/tab-icon/live.ts`: `raise(kind, opts)` and `clear(handle)`, and the painter. `TabIcon.svelte` mounts it once from `src/routes/+layout.svelte:27,175` and raises unread from the root layout's `certUnread`. The painter rewrites only the SVG icon link's `href`, at most every `TAB_ICON_FRAME_MS` (250), never adds or removes a link and never touches the ICO link. Unread also prefixes the title with `(n) ` through one `MutationObserver` on `<head>`, and goes to `navigator.setAppBadge` in standalone mode behind a feature check. Offline follows the `online`/`offline` events.
- `npm run tab-icon:build` (`tools/tab-icon/build.mjs`, with its own PNG/ICO codec `tools/tab-icon/png.mjs` on `node:zlib`, so no new dependency) writes `favicon.svg`, `favicon.ico` (16 and 32 px PNG frames), `apple-touch-icon.png`, `icon-192.png`, `icon-512.png` and `icon-maskable-512.png` into `static/IDEA/` from the geometry alone, rasterized by playwright-core's Chromium. It refuses to write a wrong icon and is byte-reproducible.
- `src/app.html:43`: the ICO link is `sizes="32x32"` (was `any`). `static/manifest.webmanifest` needed no edit: the filenames are kept and its purposes were already any, any, maskable.
- `/dev/tab-icon` (`src/routes/dev/tab-icon/`): every glyph in every state at 16 and 32 px on the six tab grounds, the shipped and geometry-drawn home-screen icons on a mid-blue wallpaper, and keys that drive this tab's real icon. The matrix's Section column is sticky, and two notes say the tab strips and the tables scroll sideways.
- `docs/design/tab-icon/README.md`: the decisions, the three-layer table, the states and sections tables, the rules, how to raise a status, and the signals not wired.
- Call sites (one each): `src/lib/save-state.svelte.ts` (`#syncTab`), `src/lib/classroom/upload-progress.ts:58`, `src/lib/classroom/deck-upload.ts:130`, `src/lib/classroom/feedback/FeedbackPanel.svelte:126`, `src/lib/tournaments/MatchDetail.svelte:98`, `src/routes/gauntlet/rooms/[id]/+page.svelte:124`, `src/lib/tab-icon/TabIcon.svelte:38`.
- `CLAUDE.md`, Commands block only, in place: the `tools/idea_icon_gen.py` line became a `npm run tab-icon:build` line and a `tools/idea_logo_vector.py` line.
- Tests: `tests/tab-icon-geometry.test.ts`, `tests/tab-icon-status.test.ts`, `tests/site-icons.test.ts` (extended), and `tests/dom/tab-icon-live.test.ts`, `tab-icon-save-state.test.ts`, `tab-icon-upload-progress.test.ts`, `tab-icon-signals.test.ts`. Browser specs: `tools/browser-verify/routes/_tab-icon.mjs` (shared), `tab-icon.mjs`, `tab-icon-theme-matrix.mjs`, `tab-icon-theme-space-white.mjs`.

### Load-bearing decisions

- **At rest on Home the painter restores the original `href`, not a data URL**, because `favicon.svg` is byte for byte `icon('gearkey','home')`; `tests/site-icons.test.ts` pins that. It compares the resolved `href` property, because SvelteKit's router rewrites icon hrefs to absolute URLs at start.
- **Each animated kind starts at its own point in the cycle** (`PHASE_START` and `framePhase(kind, frame)` in `live.ts:111-122`), sampled mid-quarter so no frame lands on a zero crossing. The drawing lights live while `cos(2 pi phase) > 0` and saving while `sin(4 pi phase) > 0` (`geometry.ts:338-339`), so no single start opens both lit; live starts half a frame early (lit, lit, low, low) and saving half a frame late (on, off, on, off). The cycle restarts at frame 0 when the animated kind changes (`animKind`). Identical frames are never written, so the live pulse is 2 writes a second.
- **Reduced motion holds the lit opening frame** (`stillPhase`). The drawing's default phase 0 was rejected: it sits on the saving lamp's zero crossing and draws it dark.
- **Raise the next status before clearing the last.** `#syncTab` raises saving or error before it clears, and the success path raises done before saving clears, so the resting icon never paints between them. Rejected: coalescing paints on a microtask (a deferral on every paint, and every fake-timer test reads the href synchronously) or on `setTimeout(0)` (throttled in a hidden tab, where the icon matters most). The README states the rule for callers.
- **One `<head>` observer applies the title prefix**, because titles are set in some 273 `<svelte:head>` blocks and there is no single place.
- **The painter stands down if a third icon link appears** (`foreignIcon()`, `live.ts:200`), so a product that sets its own icon is never fought.
- **Progressive feedback counts only open unseen notes**, because a resolved note never wants attention.
- **The module's section colors were kept as literals**, as decided, though most do not match the launcher (see claims below).

### Audit answers

1. **Where icons, the manifest and theme-color are declared.** `src/app.html:43-47` (ICO, SVG, apple-touch, manifest, theme-color `#0A0C0D`); `static/manifest.webmanifest:9-27` and the Fine shortcut's icon at `:35-41`; theme-color is rewritten at run time from `SITE_THEME_COLORS` (`src/lib/theme.ts:120`) by the boot script and `src/lib/design-system/themes/ThemeRoot.svelte:99`. No `<svelte:head>` and no `+layout` declares an icon or theme-color, and nothing outside `src/lib/tab-icon` writes an icon link or `document.title`. Products that serve their own HTML outside the root layout: the Coin Ledger (`src/lib/legacy/coins/index.html:7`, `/IDEA/android-chrome-512x512.png`) and the legacy assignments (line 7 of each `src/lib/legacy/assignments/*.html`) keep their own icons; VANGUARD (`src/lib/legacy/vanguard/index.html:4-6`) declares none; `/hx/<docId>`, `/a/`, `/b/` and the FSP static decks (`static/fsp/day1-slides.html`, `static/fsp/day2/index.html`, no icon) are outside too. FSP, GREENLINE, GAUNTLET, IdeaCAD, FRC, Tournaments, Maps, Foundry, Certifications and Armory are Svelte pages under the root layout and none sets an icon, so the live icon applies there.
2. **Routes against `G`.** Every module `route` exists, but four sections answer on more prefixes, added as `also` (`geometry.ts:184,192,221,285`): Classroom `/reference`, Notebook `/notebook` (307 addresses), Coins `/coin-balance` and `/coins`, Admin `/admin`. `/classroom/notebook` resolves to Notebook (longer prefix). A class's own Notebook tab, `/classroom/<id>/notebook`, is deliberately Classroom: it is a tab inside one class. Unmapped and Home: `/archive`, `/fsp*`, `/contracts`, `/auth/error`, short links, `/dev/*`. The Coins glyph paints on the desk and the student coin page; the Ledger keeps its own icon.
3. **Signals.** Wired: the one save state (covers the notebook, HTML assignments through the bridge, the composer, the grading console, Maps and every other caller), the classroom file upload, the deck upload's byte progress, unseen open progressive-feedback notes as unread, a tournament match in progress, a live GAUNTLET room round, the certification unread count, and offline. Not wired, with reasons (also in the README):
   - Attention / your turn: no such signal exists (nothing marks a match called for a player; the classroom has no resubmit-requested state).
   - Running timers (GAUNTLET's run clock, the certification exam countdown, the Live tab's class timer): no designed clock state, progress is designed for a known transfer fraction, a clock-driven repaint breaks the reduced-motion rule, GAUNTLET counts up with no limit, and the exam tab is one a student may not leave.
   - The live class: there is no in-session state, so a pulse while the Live tab is open would mean nothing.
   - Recording: dictation is foreground, and the browser draws its own microphone indicator.
   - The deck's unpack stage: server work counted in files; a second fill of the hairline would read as a restart.
   - Queue sizes that are a page's own subject (Foundry review queue, coin desk queue, the feedback inbox's Needs you, a proctor's flags): none has a seen state or is re-read while hidden.
   - The certification exam release: read once at load.
4. **Rasterizer.** Chromium 141.0.7390.37 at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome` rasterizes a data-URL SVG `<img>` at device scale 1, and `screenshot({ omitBackground: true })` keeps alpha. The build re-encodes with its own codec so iOS and maskable carry no alpha channel.

### Migrations

None.

### Measured

- **Navigation in Chromium** (dev server, signed-in session from a loopback fake Supabase): `/` to `/maps` to `/classroom/notebook` to `/classroom` to `/` gave the SVG link static `favicon.svg`, Maps, Notebook, Classroom, static file. The ICO link stayed `/IDEA/favicon.ico sizes=32x32` with exactly 2 icon links and 1 apple-touch link at every step. Signed out, `/classroom/notebook` redirected to `/` and showed Home.
- **Error vs live on `/maps`:** error, live and rest are three different pictures; error outranks live; after clearing the icon is back to rest byte for byte.
- **Pulse:** live gave 4 writes in 2 s, 2 distinct frames (well under the 4-a-second cap); idle 0 writes in 3 s; reduced motion 1 write in 3 s.
- **Title:** `certUnread=3` gave `(3) ` across two client navigations with no doubling, and a plain title after it went back to null.
- **Hand-off** on `/dev/check-in-guidance` (Home, 250 ms save), from the keystroke: after the fix, full motion dark beat +1058 then done +1309 (refused: error +1311); reduced motion done +1061 (refused: error +1060); no resting write in any case. The pre-fix code, put back temporarily and restored by md5, gave dark +817, resting +1068, done +1319, and under reduced motion dark +808, resting +1059, done +1309.
- **Static files:** the build rewrites all six byte-identical (md5). `favicon.ico` is 3192 bytes, 2 frames (873 and 2281 byte PNGs), alpha 0 at all four corners of both. `icon-192.png` and `icon-512.png` have alpha 0 corners and an outer ring of the key's tray `#070908`. `apple-touch-icon.png` is 180x180 RGB with no alpha, corners `#161917`. `icon-maskable-512.png` is fully opaque (262144 of 262144). No pure-black or pure-white pixel in any of them.
- **Harness, all three themes at 375, 960 and 1440:** 0 px page overflow; 1980 of 1980 matrix images decoded; contrast lowest 5.17:1 (wallpaper captions on `#3a6fae`), section names 10.01:1 on the worst ground; smallest key 44 px. At 375 the sticky Section header stays at the box's left edge (33 = 33) with the table scrolled to 582; the order-result hit-tests all 90 section names, and with the rule set to `position: static` it reads PINNED 0 OF 90 at 375 in every theme.
- **verify:browser** after polish: 9 runs, 267 measurements, 0 outside threshold.
- **Tests:** after polish, 10 files, 158 passed. Mutation proofs: the signals test (resolved-note filter removed, deck `tab.clear` removed) gave 3 failed; five polish mutants (saving opens dark, still frame at phase 0, no cycle restart, done after saving cleared, saving cleared before error) each reddened 1 to 5 tests. svelte-check 0 errors, 33 warnings, 18 files (the baseline).

### Refinement rounds

- **Builder self-review** fixed: the harness showed the shell's green `//` h2 prefix (neutralized); the wallpaper captions' contrast was read off the card behind the gradient (18.68:1, and 1.06:1 under Space White) and now measures the wallpaper's own color (5.17:1); the theme specs could pass on the wrong theme and now wait for and count `html[data-theme]`.
- **Review 1:** 0 blockers, 0 wrong behavior, 0 confusion, 5 polish. The fixer: made the saving lamp open lit and the reduced-motion still frames lit; removed the resting frame between saving and done or error; made the README describe offline truthfully (FRC keeps its red and blue bumpers and bone wheels, Foundry its bone crucible and mold, GREENLINE its bone pole, because the attached geometry draws them so; the drawing is unchanged); made the harness's Section column sticky with a scroll note. The fifth (the full suite red by 2 `tests/derived-numbers.test.ts` assertions until the three specs are measured) went to the integrator's `verify:readme` step.
- **Final review:** 0 blockers, 0 wrong behavior, 0 confusion, 2 polish. (a) The tab strips scroll sideways at every width but the note named only the tables: fixed by the integrator with one sentence (`+page.svelte:285`). (b) Under reduced motion, saving on a Home route looks exactly like resting: accepted, because the lit saving lamp is the resting mint hub in the attached drawing (`geometry.ts:334,339`), and changing that is a drawing change.

### Not verified

- Safari and Firefox. Only Chromium was driven; Safari does not take SVG favicons, so there only the ICO and apple-touch icon show and the live icon does nothing.
- A real iPhone or Android home screen; the PNGs were judged by decoding pixels and by CSS masks on a mock wallpaper.
- A real tab strip: this Chromium draws no favicon UI, so every claim rests on recorded href writes and the drawing's lamp color.
- The installed-app badge in a real standalone PWA (DOM test only).
- A real Supabase project; the signed-in proof used a loopback fake, so the production session path and data-full pages were not exercised.
- The GAUNTLET room wiring in a browser (needs a session and a live room; no `/dev` harness). It is the same three-line effect as `MatchDetail`, tested both ways; checked by svelte-check and reading only.
- The `FeedbackPanel` unread and deck upload wiring were tested on the real components in happy-dom with a mutation proof, but not in a browser tab.
- The section case of the hand-off in a browser: every `/dev` route resolves to Home. It is covered on `/classroom/notebook` in `tests/dom/tab-icon-save-state.test.ts` under full and reduced motion.
- Hidden-tab timer throttling (about once a second, once a minute after 5 minutes), which would slow a hidden live pulse.
- The three specs' files under `tools/browser-verify/measured/` were not in the part's commit; the integrator's `verify:readme` step writes them.

### Deferred, and out of scope for Mr. Pina

- Making Home's saving distinguishable from resting under reduced motion needs a drawing change (a new board and a new golden fixture). Mr. Pina's call.
- A `CLAUDE.md` rule for the tab-icon conventions: the builder was limited to in-place edits, so `docs/design/tab-icon/README.md` carries them for promotion if wanted.
- VANGUARD's tab shows the browser's default icon: its document declares none and `/favicon.ico` answers 404 (measured). Fixes: a serve-time injection of the static icon links in `src/routes/vanguard/+server.ts`, or a root `/favicon.ico`, which is slug-shaped and needs a reservation migration. The two FSP static decks under `static/fsp/` fall back to the same 404.
- `tools/idea_icon_gen.py` now produces nothing the site serves (it writes retired variants to an outdir) and is a deletion candidate. `tools/idea_logo_vector.py:2` still calls itself the "site icon generator" and keeps an `icon_svg()` exporter for icons the site no longer ships.

### Prompt claims that turned out wrong

- "Unit tests in `src/lib/tab-icon/`": vitest collects only `tests/**` (`vitest.config.ts:137,176`), so the tests live in `tests/` and `tests/dom/`.
- "Section glyph colors are the same values `AppLauncher.svelte` already declares": true only for GAUNTLET, GREENLINE, Tournaments, Foundry, Maps and Admin. Classroom (`#D3C68E`), Notebook (`#E0B060`), IdeaCAD (bone) and Armory (`#A79BE8`) take the launcher's default `--gold #c8a848`; VANGUARD's `#C8FF00` is the launcher's secondary (primary `#00ff41`); FRC draws `#ED3B42`/`#2F8CF0` against the launcher's `#ed1c24`/`#0066b3`; Certifications has no launcher card; Coins' `#C8FF00` is the Ledger card's, while the module's `/coin-desk` card takes the default pair. The literals were kept.
- The module's `route` values were incomplete for Classroom, Notebook, Coins and Admin (audit 2).
- The audit list implied GREENLINE, GAUNTLET, IdeaCAD, FRC and FSP might set their own icon. None does; only the Ledger and the legacy assignments do, and VANGUARD sets none.
- `CLAUDE.md`'s old line said `tools/idea_icon_gen.py` "regenerates the site icons". It never wrote into `static/IDEA/`.
- Review 1's "resting at 1536 ms" on Home was partly saving's lit frame, which is byte-identical to resting there; a genuine cleared-state flash also existed and was fixed.

## Part 2: the Install app key in the home header

### What changed

The home page header (`src/routes/+page.svelte:585`, `<header class="home-header" use:fitHomeHeader>`) has an **Install app** key, signed in and signed out. It is an `.auth-link` Plate key placed first among the right-aligned controls, so Take the tour and Sign in hold still when it arrives after hydration. What it does is `installKeyMode` in `src/lib/install-app.ts`:

- `prompt` (desktop Chrome and Edge, Android Chrome, once the browser has offered): calls the stashed `beforeinstallprompt` event's `prompt()`.
- `ios` (iPhone and iPad; a Mac user agent with touch points counts as an iPad): opens a Plate card with the pop-up's own sentence and Safari's Share glyph drawn inline. Escape, an outside tap, Close, focus leaving both key and card, and the key scrolling out of the window each close it; focus returns to the key when it was in the card.
- `mac-safari` (Safari 26 and later on a Mac): the same card worded for Add to Dock. The builder's extension.
- `menu` (after the browser's own dialog was declined): a card pointing at the browser's install controls, because a page cannot reopen the dialog until the browser offers again. The builder's extension, for the prompt's "at any time"; a new offer puts the key back on `prompt`.
- Hidden when running installed (`display-mode: standalone` or `navigator.standalone`), after `appinstalled` or an accepted prompt, and where no install path exists (Firefox, Safari before 26 on a Mac, a Chromium that has not offered).

The phone pop-up keeps its once-and-dismissed memory (`INSTALL_POPUP_DISMISSED_KEY`, `idea_pwa_prompt_dismissed`). Dismissing it never reaches the key, and it steps aside while the key's card is open, so the iOS steps never show twice. When the row is short, controls give way in one fixed order, each once as the window narrows: the lines-of-code readout, then the key's word (a 44x44 icon key whose accessible name stays "Install app"), then the class chip (ellipsis, full name in `title`).

Files (squash commit `ce7fde46`, 24 files):
- `src/app.html:75`: the one `beforeinstallprompt` / `appinstalled` listener, an inline head script before `<title>` (`:91`) that writes `window.__ideaInstall`.
- `src/lib/install-app.ts` (new): the shared reader with no listener of its own (`readInstall`, `subscribeInstall`, `promptInstall`, `installPlatform`, `installKeyMode`, `installPopupMode`, `setInstallCardOpen` / `installCardOpen`, `INSTALL_COPY`).
- `src/lib/InstallAppKey.svelte` (new), `src/lib/InstallSteps.svelte` (new; the steps with the inline glyph, mounted by both the pop-up and the card), `src/lib/InstallPrompt.svelte` (own listener removed, reads the module). The root layout's `<InstallPrompt />` line (`src/routes/+layout.svelte:182`) is unchanged.
- `src/lib/home-header-fit.ts` (new): `fitHomeHeader`, the give-way decision for the whole row.
- `src/app.css`: one block headed "THE HOME PAGE'S HEADER", every rule naming `.legacy-index header.home-header`. `src/lib/classroom/plate.css:1592`: `:where(.legacy-index) .ia-card` joins the floating-panel housing list.
- `/dev/home-order` gains `?ua=iphone|ipad|android|mac-safari|firefox` and `?display=standalone` (`src/routes/dev/home-order/install-devices.ts`).
- Tests: `tests/install-app.test.ts`, `tests/dom/install-app-key-mount.test.ts`, `tests/home-header-fit.test.ts`, `tests/dom/home-header-fit-resize.test.ts`. Specs: six new `tools/browser-verify/routes/home-order-*` specs with shared steps in `routes/_install-key.mjs`, and the standalone instrument `tools/browser-verify/_home-header-sweep.mjs`.

### Load-bearing decisions

- **One listener, in `src/app.html`, not in a module.** Chromium fires the event once per page load, and a module or mount-time listener can arrive after it. Measured on the dev server: an offer fired during head parse (`readyState` `loading`) was kept with `defaultPrevented` true, and the app wired its mailbox 1690ms later at 1440 and 4165ms later on a cold 375 load. `tests/install-app.test.ts` runs the app.html script read off disk, asserts the module adds no listener, and sweeps `src/` for any other, with app.html as the positive control.
- **One event is prompted once.** `promptInstall` takes the event out of the mailbox and marks it `prompted` before calling `prompt()`; a second caller gets `unavailable`, and the key ignores presses while the dialog is up.
- **`installKeyMode` takes no dismissal argument**, so the pop-up's "no" structurally cannot hide the key.
- **Mac Safari is gated at `MAC_SAFARI_DOCK_VERSION` (26).** Safari 17 and 18 also run on Ventura and Monterey, which have no Add to Dock, and the user agent freezes macOS at 10_15_7.
- **The words exist once.** `INSTALL_COPY.ios` is the pop-up's original sentence split where the glyph goes, pinned byte for byte; the glyph is `aria-hidden`, so the spoken sentence is unchanged.
- **The card's layer moves to the room root (`toRoom`).** `.legacy-index header` carries `backdrop-filter`, which makes it the containing block of every `position: fixed` descendant, so the viewport coordinates `$lib/shell/anchored` writes landed offset by the scroll. The layer sits inside a static `.ia-slot` that stays in the header, so the moved node is never a Svelte block's edge (a teardown walk by `nextSibling` would otherwise run on through Take the tour and Admin). Tab order is walked by hand (key, Close, Take the tour), and Close carries its own 44px floor because the header's floor rule no longer reaches it.
- **The card closes when its key leaves the window** (an `IntersectionObserver`), rather than staying clamped to the top over the launcher, matching how the profile menu and quick note scroll away.
- **The fit is measured, not set by breakpoints, and it is one-way.** `fitCandidates` is [word plus readout, word, icon]. `chooseFit` keeps an arrangement only if it costs nothing the compact one does not (header height, sideways overflow including a control pushed into the header's side padding, which `scrollWidth` cannot see, chip cut, overlap) at this width and at every wider one. `fitChecks` returns the real row held on one line (`data-fit-line`) plus the row just above each `HEADER_FLOORS` width the window is narrower than: 900 (quick note), 769 (padding and gaps), 521 (a signed-in phone's tools row), 401 (signed-out tightening), laid out in `data-fit-probe` modes `wide`, `mid` and `narrow`. `lengthAtWidth` evaluates the logo's own clamp at the probed width. Reason: four media queries elsewhere give the row room back as the window narrows, so any fit read off the real row alone flips (measured with the probe removed).
  - Rejected: adding `:not([data-fit-probe])` to the shared header rules, which would raise their specificity on every page in the room. Instead the probe restates its lengths and `tests/home-header-fit.test.ts` holds every one equal to the media query it stands for.
- **Below 900px the readings run on a hidden copy (`copyOf`)**: a `cloneNode`, `position: fixed`, hidden and inert, made and removed in one task. Probing the real header moved the page through scroll anchoring (a teacher at 375 drifted 2px per fit); turning anchoring off moved a student 40px per fit instead. From 900 up there is one in-place reading.
- **When it re-runs:** at once in the `MutationObserver` microtask when a control arrives or leaves (so the word never paints for a frame), on a `ResizeObserver` deferred to a timeout, when fonts load, and on a window resize only when `innerWidth` changed (the integrator's last fix).
- **The header was re-laid as a tools group (chip, key, Take the tour, Admin) and an account group**, with `.header-right` no longer wrapping. This fixed two overlaps already there at 375: the chip 3.1px under Take the tour, and Admin 10.3px over the logo. The signed-out phone tightening applies from 400px from first paint, key or no key, in one step (header gap 0.5rem, key gap 0.4rem, text-key padding 0.45rem).
- **Scoped to `header.home-header`.** The shared `.legacy-index .header-left` and `.header-right` rules are back to their original text, because `/archive`, `/fsp/class` and the admin console share them.
- **Device emulation lives in the harness**, because route specs cannot set a user agent and this Chromium ignores CDP display-mode emulation.

### State of the tree before this part (at `2673393d`)

The only install path was `src/lib/InstallPrompt.svelte`, whose `beforeinstallprompt` listener was attached in `onMount` and only when `isAndroid()`. So desktop Chrome and Edge never had the event captured, and on Android an event fired before hydration was lost until the next full load.

### Migrations

None.

### Measured

- **Give-way order, final code**, 1440 down to 320 in 10px steps (W/i the key's word or icon, L/- readout shown or hidden; the upward sweep is the exact mirror, 0 header and 0 page overflow at every width):

  | viewer | after the review 2 fix | final |
  | --- | --- | --- |
  | student, one class | 1440 to 1040 WL, 1030 to 900 W-, 890 to 320 i- | 1440 to 1040 WL, 1030 to 800 W-, 790 to 320 i- |
  | student, two classes | not swept | 1440 to 920 WL, 910 to 630 W-, 620 to 320 i- |
  | teacher | 1440 to 810 WL, 800 to 670 W-, 660 to 320 i- | 1440 to 770 WL, 760 to 320 W- |
  | teacher and admin | 1440 to 890 WL, 880 to 750 W-, 740 to 320 i- | 1440 to 790 WL, 780 to 600 W-, 590 to 320 i- |
  | signed out | 1440 to 770 WL, 760 to 530 W-, 520 to 320 i- | 1440 to 770 WL, 760 to 470 W-, 460 to 320 i- |

  On the code review 2 looked at, a student's arrangement changed eleven times between 1440 and 320, the word coming back at narrower windows.
- **Header height:** signed out 70.6px at 360, 375 and 393 (icon key 44x44 on Sign in's row) and 64px at 960 and 1440 (word key 111.3x44); signed in 106.2px at 375 (an admin's was 116.2 with an overlap before). At 320 signed out the no-key header is now one 70.6px row (it was 120.5).
- **Contrast** (key face / card title / sentence / Close): IDEA 8.93 / 7.04 / 13.72 / 10.46; Matrix 8.86 / 7.05 / 13.19 / 10.33; Space White 9.30 / 4.95 / 14.99 / 6.85. Projector-washed worst: 4.52 for key, sentence and Close on Space White (gate 4.5), card title 4.00 (gate 3.0).
- **The card after a scroll:** before the portal fix, 24px of scroll put the card 15.8px over the key at 375 (15.5 at 1440) and 44px put its top at -23. After: 8.2px (375) and 8.5px (1440) under the key at scroll 0, 24, 30 and 44; after a real wheel of 300 the card is closed, `scrollY` holds at 300 and focus is on the key; after a wheel of 25 it stays open 8 to 9px under the key. Close is 68.7x44.
- **Phone row stillness:** from no-JS first paint to after the key arrived (Chrome offer and iPhone user agent), Take the tour and Sign in moved 0.0px at 355, 360, 375, 393, 400, 414 and 430.
- **Other pages untouched:** `/archive`, `/fsp/class` and `/dev/portal-admin` at 320, 375 and 1440, as served and with a profile stand-in, each header element's box plus 15 computed properties: 0 differing readings in 18 of 18 configurations (the round-2 tree differed in 33).
- **Cost of one fit** (median of 15, this container; 4x CPU in brackets): teacher 375 15ms (61ms), student 375 4.8ms (22.5ms), admin 600 12.2ms (41.4ms), signed out 360 3.5ms (20.3ms), student 1440 1.8ms (9.1ms). With the copy: 0px drift over four fits at scroll 300, 700 and 1200, and 0 header attribute changes in 1.5s at rest (no observer loop).
- **Harness, final:** `verify:browser --route home-order`, 54 runs, 1146 measurements, 56 outside threshold, all 56 in the Portal Updates changelog specs because the worktree was a shallow clone (same 56 on the baseline); every install, header, theme and signed-out spec passed. `_home-header-sweep.mjs`: 5 of 5 cases in both directions.
- **Mutation proofs** (copy, restore from the copy, md5 checked), all killed: the app.html script removed; consume-after-prompt; a second module listener; standalone ignored; the pop-up's dismissal reaching the key; Escape not returning focus; no busy guard; no menu mode; `toRoom` a no-op (iPhone spec 4 outside, DOM test red); the key's `onfocusout` removed; the observer's close removed; the probe removed (sweep exits 1); `fitChecks` back to one desktop probe ("the icon at 660, where the word fits here and at every wider width"); `fitChecks` reading the real row alone ("word back at 760, 750, 520, 510"); the resize guard removed (`tests/dom/home-header-fit-resize.test.ts` red).
- `svelte-check`: 0 errors, 33 warnings in 18 files after every round (the baseline).

### Refinement rounds

- **Build review 1:** 0 blocker, 1 wrong, 0 confusion, 4 polish. The wrong: the card opened over its key, or off the top, after a little scroll. Fixer: card layer portalled to the room root; new `home-header-fit.ts` so the readout gives way before the class chip (the chip cut at 769 went from 42/102px without/with the key to 0/0); signed-out phone rules from first paint; the pop-up steps aside while the card is open; the files outside the Owns line recorded (`src/app.html`, `src/app.css`, `src/lib/classroom/plate.css`).
- **Build review 2:** clean, 6 polish. Fixed four: the card closes when its key scrolls away; the one-way give-way order with the probe; focus leaving key and card closes it, and Escape reclaims focus only from the card, the key or nothing; the new CSS scoped to `header.home-header`. Accepted two (below).
- **Polish review 1:** 2 polish. Fixed: a teacher's key showed only its icon on a phone although the word fit (the fit now reads every wider floor). Accepted: a signed-in student's header grows in a phone-landscape band.
- **Final review:** 2 polish, no blocker, wrong or confusion. A height-only resize (a phone's address bar while scrolling) re-ran the whole fit, copy included, 22.6ms a fit and long tasks of 57 to 81ms at 4x CPU: fixed by the integrator. Signed out at 320 to 350px the key's arrival wraps the row: accepted.

**Accepted, with their measured bands:**
- **The class chip slides and a signed-in student's header grows when Chrome's offer arrives late.** The chip moved 825.5 to 698.2px at 1440 and 345.5 to 218.2 at 960 (the readout hiding in the same frame at 960). A one-class student's header goes 75.5 to 135.5px (+60, the controls wrap under the logo) from 625 to 675px; a two-class student's +60 from 525 to 560px; teachers and admins never grow. On an iPhone the key is there on every load, so in those bands the header grows at hydration on every visit. Reason: the key exists only once the browser offers an install, and reserving room for a key that may never appear would leave a hole for every Safari and Firefox user.
- **Signed out at 320 to 350px the key's arrival drops Take the tour and Sign in to a second row** (70.6 to 112.5px, +41.9; at 320 Take the tour moves from (113.1, 12.8) to (66.4, 54.7) and the hero moves down the same 41.9px). At 355 and up nothing moves. Reason: the prompt's fit requirement is 375, and Sign in stays on the key's row; same cause as above. Identical on the round-2 code.
- **A phone student's class chip is cut further with the key:** 13px without, 67px with, at 375. The second row is 343px and holds the chip (217.4px natural), the key (44), Take the tour (129.3) and two 9.6px gaps; the chip's full name is its `title`.
- Also recorded in round 1: at some widths below 1040 the server render paints the readout and the fit hides it after hydration (round 1 measured the chip's left edge moving 7.3 to 40.7px at 769 to 900, nothing to its right moving). A first-paint CSS guess was rejected: whether the readout fits depends on the chip's name and on the key.

### Not verified

- A real Chrome, Edge or Android install dialog: `beforeinstallprompt` was always synthetic, since headless Chromium here cannot be made installable.
- A real iPhone, iPad or Safari 26 Add to Dock, and WebKit's `IntersectionObserver`: user agents were emulated on Chromium. `navigator.standalone` is unit-tested only.
- A real installed window: this Chromium accepts CDP display-mode emulation and does nothing with it, so standalone is a harness `matchMedia` override.
- Whether Chrome re-fires `beforeinstallprompt` after a decline within one page; the design handles both answers.
- The `menu` card's generic sentence against every Chromium menu.
- Web fonts: the harness blocks them, so every give-way width is a fallback-font number and will move a few pixels with Orbitron and Rajdhani loaded.
- Classic (non-overlay) scrollbars, which this Chromium does not draw; the probe should allow for one by construction.
- Production-build timing of the early-offer window (dev server only), and fit timing on a real old phone or school desktop (container plus CPU throttling only).
- The signed-in `/archive` and `/fsp/class` header used a 110px stand-in for `ProfileMenu`.

### Deferred, and for Mr. Pina

- A `CLAUDE.md` rule may be worth promoting: "`beforeinstallprompt` has one listener, in `src/app.html`; every reader goes through `$lib/install-app`." No existing paragraph covered install, so `CLAUDE.md` was not edited.
- On iOS the server could render the key from the request's user agent and avoid the hydration growth above. Not built: it is a server-rendering change, and the growth was accepted.
- Putting the key on the first row of a signed-in phone header: considered and deferred; it needs a grid rebuild and gives the chip about 37px back.
- The `menu` card names no browser's menu path; name them per browser only if wanted.
- Out of scope, reported and not changed: `src/lib/CodeCounter.svelte`'s breakdown panel has the identical `backdrop-filter` scroll defect (1440: 9.7px under its chip at scroll 0, -14.3 at 24, -34.3 at 44), and Escape does not close it with focus on its chip. `.legacy-index header` is declared `position: sticky` but computes `relative` in the harness, so the home header scrolls away; the cascade was not traced. `src/lib/notebook/QuickNote.svelte` hides the header's quick note from 521 to 899px with its own media query; if that hide joined the fit's give-way order, a student's word would gain about 100px of range.

### Prompt claims that turned out wrong

- "Move the capture into a small shared module both readers import" is not enough on its own: a module evaluates after Chromium can fire the event (measured 1.7s to 4.2s later on dev). The listener went into `src/app.html` and the module reads its mailbox.
- "Emulate standalone display mode": this container's Chromium ignores CDP display-mode emulation, so standalone is emulated in the harness.
- Confirmed true: the only install path was the phone-only, once-dismissed pop-up, and the header block was at about lines 583 to 640. The integrator's note to extract the header into a component did not apply: `/dev/home-order` already mounts the real `src/routes/+page.svelte`, signed out included. One reviewer figure was off: the two-class growth band starts at 525px, not 550.

## Part 3: one click into a class from the home page

Squash commit `83ecf259` ("Open a class from the home page in one click").

### What changed

On the home page's Your Classes list, one click on a class card's name now opens the class. The card no longer has to be expanded first; expanding is only for picking one assignment from the card's list.

- The header is no longer one `<button class="course-header collapsible">`. It is `div.course-header.feed-head` (`src/lib/classroom/ClassroomFeed.svelte:329`) holding two siblings:
  - `a.feed-open` (`data-testid="feed-open"`, line 330), one real link to `{basePath}/{section.id}` wrapping the whole identity: course code, section badge, attention flag, title, block and teacher. A plain click goes in; Ctrl-click and middle-click open a new tab like any link.
  - `button.changelog-toggle.feed-toggle` (`data-testid="feed-toggle"`, lines 365 to 379) at the right edge, with `aria-expanded`, `aria-controls` pointing at the list, `class:on` while open, a visible Show or Hide word, a visually hidden class name (`.feed-sr`) and the arrow as an `aria-hidden` SVG. It calls the parent's `onToggle` exactly as the old header did.
- The list container gains `inert={!open}` (line 382). It was already invisible when folded (max-height 0, opacity 0) but stayed tabbable and in the accessibility tree, so Tab after a folded card's key landed on rows nobody could see. This is the only attribute change inside the list.
- The attention flag, the summary, the rows and the bottom `.feed-more` link (line 401) are unchanged. The component's top comment (lines 47 to 57) now describes the two-control header and keeps the no-delegated-handler rule.
- Harness: `/dev/home-feed?base=dev` points the link at a new dev landing, `src/routes/dev/home-feed/class/[sectionId]/` (its `+page.ts` 404s outside dev). The landing prints the fold record kept in `src/routes/dev/home-feed/toggle-log.ts`; a module's state survives client-side navigation, which is what lets a spec prove a link click did not also fold the card. With no parameter the harness links to the production `/classroom/<id>`.
- Tests and specs: `tests/dom/classroom-feed-header-mount.test.ts` (8 tests) and five browser specs under `tools/browser-verify/routes/`: `home-feed-state-fold-key.mjs`, its `-theme-matrix` and `-theme-space-white` aliases, `home-feed-base-dev-state-class-link.mjs` and (polish round) `home-feed-state-teacher-header.mjs`.
- Part 6 also edited `ClassroomFeed.svelte` (the expanded list's rows). The two merged without conflict. The merge left a duplicated `page` import in `src/routes/dev/home-feed/+page.svelte`, which svelte-check caught and the integrator removed.

### Load-bearing decisions

- **The fold key carries a word.** A glyph alone is not a control, and `Disclosure.svelte` sets the site's Show/Hide convention. Its accessible name is the word plus the class ("Hide IDEA100 Period 1"), so a screen reader does not hear four identical "Hide" buttons.
- **The arrow points where the press goes**: down while folded, up while open, matching the Changelog key on the same page. The old header pointed up on a folded card, which would contradict a "Show" beside it. It is drawn as an SVG path because the font triangle rode visibly high once rotated.
- **The key wears `.changelog-toggle`**, the home page's own key class (Clear and Show more already wear it), so `plate.css` draws it as a raised key in every theme with no `plate.css` edit, and lit while open (report R15's rule).
- **Header rules sit at specificity 0,3,0** (`.course-card .feed-head`, `.feed-head .feed-toggle`). In dev the stylesheet order between `app.css` and the component varied between loads (1 of 6 cold loads put the component's sheet at index 4 and `app.css` at 17), and on one load a 0,2,0 tie drew the key across the whole header.
- **At 480px and narrower the arrow stands above its word** (`column-reverse`, line 768), giving a 44x44 key. Side by side the key pushed a card's subline onto a second line (79.4px to 102.4px at 375).
- **One hover for the whole header** (polish). The 4% green wash moved off the link onto `.course-card .feed-head:hover` (lines 611 to 615), inside `@media (hover: hover)` so a tap does not leave a phone's header washed. The underlined title still marks the link and the key's lit edge marks the fold. Hovering the header as a whole was chosen over `:has(.feed-open:hover)` because it reproduces how the header behaved when it was one button.
- **The fold answers its whole column without a second control** (polish). A transparent `.feed-toggle::before` runs from the key's left edge to 20rem past the header's top, bottom and right, and the header clips it with `overflow: clip` (lines 704 to 716). Both sit behind `@supports (overflow: clip)`: without clip the reach would spill over the list rows, so an unsupporting browser keeps the old dead band instead. Rejected: a stretched button with an inner face, which would have needed the plate key recipe copied onto an inner element, a second copy CLAUDE.md forbids. `plate.css` draws nothing on a `.changelog-toggle`'s pseudo-elements (its lit `::before`/`::after` are for `.btn`, `.nav-toggle` and `.todo-view`).
- **At least 12px between the words and the key** (polish): `.feed-open` keeps 0.75rem right padding at every width (lines 635 and 753). It had been 0.25rem at 480px and 0.5rem at 768px. A subline that no longer fits wraps instead; shrinking the key's margin or the left inset would not have avoided it (6.6px was needed).
- **The focus ring follows the card's corner** (polish): the link takes `calc(var(--plate-r-panel, 4px) - 1px)` at its top left, and at its bottom left while the card is folded (lines 639 and 642). The 4px fallback is `app.css`'s, for the `SITE_PLATE = ''` revert.
- **Reduced motion**: `app.css`'s `.legacy-index .course-collapse-arrow` transition ignores it; this component turns it off for its own arrow only (line 733).

### Migrations

None.

### Measured

Chromium 141 through `npm run verify:browser`, IDEA, Matrix and Space White, final state unless marked.

- **Navigation, with real input at 375 and 1440.** A plain click on a folded card's link lands on that class (`/dev/home-feed/class/sec-p2`) with folds recorded 5 against 5 made on purpose. Ctrl-click and middle-click open a new tab at the class, leave this tab on `/dev/home-feed?base=dev`, and add no fold. A click 2px left of the key navigates with the fold count unchanged (6, then 6 at the landing).
- **Keyboard.** Tab goes link, fold key, that card's 8 rows, Open class, then the next card's link. With a card folded, Tab from its key goes straight to the next card's link (folded lists inert 1/1). Enter on the key flips `aria-expanded` with the URL unchanged and focus kept; Space flips it back; Enter on the link opens the class.
- **Accessibility tree**: link "IDEA100 Period 1 4 to do Intro to Engineering Design Block A · tvargas" to `/classroom/sec-p1`, then button "Hide IDEA100 Period 1" [expanded]; the arrow is hidden.
- **Hit grid**, 40x7 points over each header: 19 of 280 landed on the bare header at 1440 and 960 and 24 to 28 at 375 before the polish round; 0 of 280 on all 54 headers after, teacher and student. Real clicks above, below and right of the key and in the far corner fold the card with the path unchanged. The reach stops at the header: 0 of 48 points down each open list's right side hit the fold.
- **Hover ground**, sampled pixels: before, a seam (Space White 230,236,233 on the link against 237,241,240 beside the key; IDEA 37,52,37 against 34,46,34; Matrix 21,31,21 against 17,25,17). After, identical across the header at all 9 theme and width combinations.
- **Gap, words to key**: teacher at 375 was 5.4px on cards 2 and 3; now 95.8px with those sublines wrapped. Teacher at 390 is 20.4px with no wrap; student at 375 is 47px or more; 446px and up at 960 and 1440.
- **Header height**, teacher fixture: 85.8px at 960 and 1440 throughout. At 375, 159.6 / 136.5 / 79.4px before the part, 133.7 / 110.6 / 79.4 after the build, 133.7 / 133.7 / 102.4 after the polish round. Student mode at 375 is 133.7 / 110.6 / 79.4. No horizontal page overflow from 320 to 1440.
- **Sizes**: fold key 44x44 at 480px and narrower, 74.1x44 at 960 and 1440 (69x44 from 481 to 768 after the build). Link area 936x85 at 1440, 287x78.4 at 375. The link's top-left radius is 11px (12px card less its 1px border), and 11px at a folded card's bottom left; the key's own focus ring and glow are not clipped by the header.
- **Contrast** on the real ground: fold word 8.93 (IDEA), 8.86 (Matrix), 9.3 (Space White); class title 11.34, 14.34, 16.49; the link's focus ring 6.0, 7.59, 5.45 (reviewer's reading).
- **Specs**: final run of the five specs at 375, 960 and 1440, 15 route/width runs, 222 measurements, 0 outside threshold. The existing home-feed and home-order specs after the build: 26 runs, 316 measurements, 0 outside.
- **Mutation proofs**, each file copied first and restored by md5. Build: the link click also folds (DOM test 1 failed, class-link spec 2 outside), the folded list not inert (1 failed, fold-key spec 2 outside), a fixed href instead of `basePath` (1 failed, class-link spec 6 outside), the key nested inside the link (2 failed, fold-key spec 10 outside). Polish: the pre-polish file reddens the grid, gap and corner rows (5 outside threshold); removing only the header's `overflow: clip` reddens the reach-stop row (36/48 and 48/48 list points on the fold).
- **svelte-check**: 0 errors, 33 warnings in 18 files after both rounds, the baseline.

### Refinement rounds

- **Builder self-review, three rounds from screenshots** (before the independent review): the key drawn full width by a CSS tie (fixed by specificity); the arrow off-centre in the open state (drawn as an SVG); the key costing a line of subline on a phone (stacked at 480px and narrower).
- **Review 1**: 0 blockers, 0 wrong behaviour, 0 confusion, 4 polish. The part was clean on its first review. The polish findings: the hover tint stopped at the link's edge and left a seam around the key; mouse clicks in the header's right column outside the 44px key did nothing; at 375 the teacher subline ran to 5.4px from the key; the link's square focus ring was clipped by the card's rounded top-left corner.
- **Polish fix**: the header carries the hover wash; the key's `::before` reach clipped by the header; 0.75rem right padding at every width; the link takes the card's inner radius. New spec `home-feed-state-teacher-header.mjs` pins all four.
- **Confirming review (polish-1)**: no findings. Nothing remained to accept or report.

### Not verified

- **A production build.** The specificity raise exists because the dev server's stylesheet order varies; production SSR lists the layout's CSS before the page's and is expected to be stable, but no build was run.
- **The real `/classroom/<id>` link with a session.** Navigation was proven against the dev landing; the production href is asserted in the DOM test but was not followed, because the classroom routes need a signed-in session.
- **Touch hardware, iOS Safari and VoiceOver.** The 375 runs used a mouse in a 375px viewport; the reviewer saw Chromium's tap adjustment rescue a tap 8px above the key in emulation. The `(hover: hover)` gate was not exercised on a touch device. Accessible names come from Chromium's tree only.
- **Safari and Firefox.** The reach needs `overflow: clip` (Safari 16+, Firefox 81+); without it the old dead band returns, never a reach over the list. Not run.
- **The `SITE_PLATE = ''` revert**, where the link radius falls to 3px, was reasoned from the CSS, not rendered. Reduced motion was not re-checked in the polish round (no motion was added).
- The build's note that webfonts were not verified is superseded: the polish round found the header's faces (Share Tech Mono, Orbitron, Rajdhani) report `loaded` from `@fontsource` on loopback, so the gap and height figures are in the real faces.
- When this section was written, `tools/browser-verify/measured/` held no file for the five new specs; `tests/derived-numbers.test.ts` reports them unmeasured until the integrator's `verify:readme` run writes them.

### Deferred and out of scope, for Mr. Pina

- **Dead CSS in `src/app.css`**: `.legacy-index .course-header.collapsible` (line 2649) and `.legacy-index button.course-header` with its `:hover` and `:focus-visible` (lines 2878 to 2895) now match nothing in `src/`. Harmless; safe to delete in a later change.
- **The `.feed-row` dev-order tie**: `ClassroomFeed`'s `.feed-row` grid rule (line 429) ties on specificity with `app.css`'s `.legacy-index .assignment-item` flex rule (line 2768). On some cold dev loads the component's sheet arrives first and the expanded rows render as flex with centred titles, which can make harness screenshots and readings differ between runs. The rows are part 6's surface and were left; raising the selectors to 0,3,0 (for example `.assignment-list .feed-row`) would settle it. Likely dev-only; not checked on a build.
- **`.legacy-index .course-collapse-arrow`** (`app.css:2738`) has a transform transition that ignores reduced motion for any other user of that class.
- **`tools/browser-verify/run.mjs:616`** prints "web fonts do not load; text is measured in the fallback stack" whenever `fonts.googleapis.com` is blocked, which is false for the `@fontsource` faces and led the reviewer to discount measurements. It could read `document.fonts` instead of inferring from the blocked request.

### Prompt claims that turned out wrong

- No claim was wrong in substance. The header was one `<button>`, the bottom link was the only way in, and the header comment did forbid a delegated handler.
- Imprecise: the bottom door the prompt calls the "Open class" link reads "N more in this class ›" when the card hides items (`ClassroomFeed.svelte:402`). It is the same link and stays.
- A reviewer claim, not a prompt claim, was corrected: review 1 said the gap was measured in the fallback font stack; it was measured in the real faces (see Not verified).

## Part 4: the per-student page (reports bd38fa25, 08bafda7, 169b931d)

Squash commit `fb59e703` ("Student pages: choose which sections show, grade from Needs attention, and a picture strip that wraps around"). The route is `/classroom/[sectionId]/people/[studentEmail]`, built into a conference dashboard by ledger 0392.

### What changed

- **Sections (bd38fa25).** A Sections key in the page header opens a popover with one checkbox per section, plus Show all and Done. The choice is per teacher, follows them across computers, and applies to every student page in every class. A hidden section is not rendered, so it leaves no gap and is not printed. What belongs to a section goes with it: its At a glance tile, and for the notebook its Needs attention rows, its photos in Their work and the Open full notebook key. With every section hidden the page says so in one line (`so-all-hidden`, not printed). Settings reads the choice out to a teacher (group "Student pages", setting "Sections shown") with a Reset.
- **Needs attention keys (08bafda7).** Grade and Full screen are one snippet, `rowKeys` (`StudentOverview.svelte:367`), rendered on each Needs attention assignment row (`:623`) and each Assignments row (`:727`). Same keys, same order, same links. They sit on the title's line wherever they fit.
- **Picture strip (169b931d).** Picking the first picture no longer sends the strip to its far end; every move wraps both ways; the strip scrolls itself (never the page) to centre the selected thumbnail, and re-centres when its width changes. The auto-advance timer takes the same wrapping step.
- **Found and fixed on the way (pre-existing from 0392):** the play key was `aria-pressed` while paused, so a stopped slideshow showed a lit "Play"; and pressing Play with a mouse or the keyboard did not restart it (see the polish rounds).
- **Files.** New: `src/lib/classroom/student-sections.ts` (pure: the 13 ids, `studentPageLayout`, `studentGalleryFor`, `studentColumns`, `studentTileColumns`, `studentDuoStacks`, `studentSectionsMenuFit`) and `src/lib/classroom/StudentSectionsMenu.svelte`. Changed: `StudentOverview.svelte`, `StudentWorkSlideshow.svelte`, `student-overview.ts` (`slideIndex` `:922`, `stripScrollLeft` `:944`), `src/lib/preferences/classroom.ts` (the `studentPage` account group, `:254`; its Settings entry, `:620`), the `/dev/classroom-student` harness (new flags `&pictures=N`, `&attention=N`, `&checkins=N`, `&hide=...`, `&prefs=0`), `tools/browser-verify/_student-print.mjs` (now measures type size; `--port` flag), and the `ONE STUDENT'S PAGE` bullets in `CLAUDE.md`.
- **Tests and specs.** New: `tests/classroom-student-sections.test.ts`, `tests/dom/student-overview-sections-mount.test.ts`, `tests/dom/student-work-slideshow-mount.test.ts`; new browser specs `classroom-student-state-sections`, `classroom-student-state-strip-pictures-12` (each with a Space White twin) and `classroom-student-attention-1-checkins-1`, with shared checks in `tools/browser-verify/routes/_classroom-student.mjs`.

### Load-bearing decisions

- **The strip follows `index`, not a handler.** An `$effect` re-centres it after any move (keys, thumbnails, timer, the Lightbox closing on another picture, a broken picture leaving the set) with `strip.scrollTo` on the strip alone (`StudentWorkSlideshow.svelte:162-169`). A bare `scrollIntoView` was rejected because it scrolls the page too. A `ResizeObserver` re-centres on width change; the glide is smooth under no-preference and instant under reduce.
- **The thumbnail is measured against the strip's own box** (`thumbStart: t.left - box.left - strip.clientLeft + strip.scrollLeft`), so no positioned ancestor can move it; `stripScrollLeft` centres and clamps.
- **When the timer holds.** Under a resting mouse (never a finger: `pointerType === 'touch'` is ignored, because a tap's compat `mouseenter` never got a `mouseleave`), on keyboard focus only (`:focus-visible`, the WAI-ARIA carousel rule; a browser that cannot answer holds), and for `BROWSE_HOLD_MS` (6 s) after a wheel, touch or press on the strip, so a tablet swipe is not snapped away. **The play key itself never holds** (`onPlayKey`, `focusHolds`), and pressing Play ends the browse hold. Rejected: letting Play clear the focus hold until focus moves, under which tabbing onto a held key would announce "Pause the slideshow" over a slideshow that is not moving.
- **The play key's word is the action** (Pause or Play), with `aria-label` "Pause the slideshow" / "Play the slideshow" and no pressed state; both words share one grid cell (`.sws-play-words`, the unused one `visibility: hidden`), so the key never changes width.
- **Hiding is not the print box.** The per-visit "Include when printing" box is unchanged and never stored; hiding is a standing choice that removes the section from screen and paper. `studentPageLayout` is the one decision of both, so they cannot disagree. The grade still follows Scores and Assignments on paper while either is shown and prints on its own when both are hidden; Coming up follows Assignments the same way.
- **13 stored, append-only ids** (`student-sections.ts:33`): grade, upcoming, gallery, glance, attention, scores, assignments, notebook, activity, hall-passes, teams, coins, models. The identity block is not a section: it holds the h1 and the Print key.
- **No gap after a hide, by construction:** a card group takes as many columns as it has cards, capped at 2 (`studentColumns`, the CLAUDE.md multicol ceiling); At a glance uses the fewest columns that keep the row count the width forces (`studentTileColumns`: 6 + 1 at 960 became 4 + 3, never an extra row); the top card is `hero: 'split' | 'stack' | 'solo'`. In `stack` (pictures shown, a figure hidden) the gallery sits under the identity, centred, as wide as a 16:9 stage at the `--sws-stage-max` height (24rem, about 683px), with any remaining figure in `.so-hero-duo` (`fit-content(60%) minmax(18rem, 1fr)`). Rejected: capping the gallery to the left column's height, which with only the grade hidden would have made the slide 60px tall.
- **Needs attention and Scores share a line only while within 100px of each other's height** (`studentDuoStacks`, `STUDENT_DUO_STACK_PX`), decided from row counts (`STUDENT_DUO_ROW_PX = { attention: 77, checkIn: 77, score: 31, empty: 30 }`, measured at 960), not from a measurement, so the server render already has the final arrangement and the decision cannot oscillate. Otherwise each takes the full width and a wide Scores card lays its bars in up to three columns. Paper keeps two columns: a gap there costs no sheet.
- **The menu is a popover over `anchored`, never over its own key.** Its params carry the hidden list, so hiding a section above the key re-places the panel. `studentSectionsMenuFit` (`:218`) opens it on the side with more room and caps it there, with no fixed floor; too tight for the note plus two rows, the note is hidden visually but kept for a screen reader (`.ssm-tight`); no room for even one row on either side, `makeRoom` scrolls the page once on open (`behavior: 'instant'`). A foot fade (`mask-image`) and "N more below" mark a list that scrolls. Focus leaving to a node outside closes it (`onFocusOut`, focus not moved); Escape closes and returns focus; the key is lit (`.on`) while open. With no store in context there is no key.
- **Settings gets a read-out** because the classroom store's own test requires every group to be offered in Settings, and it answers "where did my sections go". The control itself stays the header key, as the prompt decided.
- **Row keys reach 44px height-only** (`.tap-reach-44`, `--tap-reach-w: 0px`) on a 44px key row with a 20px row gap, because the two keys sit 6px apart. This changes the Assignments rows and Needs attention together, since they share the snippet.
- **A due date never sits inside the title link's 44px box.** Rejected: `pointer-events: none` on a tucked date, which passes a hit test but leaves part of the date opening the assignment and the rest inert.

### Audit answers

- **Why the first picture sent the strip right.** At base `2673393d`, `StudentWorkSlideshow.svelte:65` computed `thumb.offsetLeft - stripEl.clientWidth / 2 + thumb.clientWidth / 2`. `offsetLeft` counts from the offset parent; the strip is not positioned but `main` is (`src/app.css:81`, `z-index: 1`), so the parent was `.classroom-page`. The first thumbnail read 609px at 1278 and 684px at 1440, and the target clamped to the strip's maximum. At 375 the gallery starts about 43px in, which is why phones looked nearly right.
- **Wrapping already worked on the index.** Base `:61` was `((next % shown.length) + shown.length) % shown.length` and the timer at `:73` called `go(at + 1)`. After Next on the last picture the strip stayed at its far end with picture 1 out of view, so the wrap was invisible.
- **The per-user store already existed.** `profiles.preferences.classroom` holds the classroom store's account groups, written read-first through `$lib/preferences/profile-io`, and the classroom layout provides the store to the page. A new account group, `studentPage`, holds the choice.
- **The two lists did not share keys.** Grade and Full screen were inline markup on the Assignments row only.

### Migrations

None. The choice lives in the existing `profiles.preferences` store, so the claimed number 0270 is unused.

### Measured

Chromium 141 through `npm run verify:browser` and scratch scripts on `/dev/classroom-student`, IDEA, Matrix and Space White.

- **Strip before:** first thumbnail selected left `scrollLeft` at 271 of 271 (1278) and 184 of 184 (1440), selection out of view; a screenshot reproduced "1 of 11" showing pictures 4 to 11.
- **Strip after (11 pictures):** first picture `scrollLeft` 0 at every width; middle centred 0px off; last at the maximum (184 / 424 / 592 at 1440 / 960 / 375); Next from the last lands on 1 at 0, Previous from the first on 11 at the end; page `scrollY` never moved (421 / 286 / 1023). The 12-picture specs read "selected in view" for all five moves and the timer's wrap at 375 and 1440.
- **Mutation proofs (restored from a copy, md5 checked):** `offsetLeft` put back read "first: 1 of 12, strip at its end, SELECTED OUT OF VIEW"; a bare `scrollIntoView` read "PAGE MOVED 271 to 724" (1440) and "873 to 1276" (375). Later rounds' checks (panel on key, hero hole, menu cue, date reach, date column, bar titles, play key) were each mutation-run and reddened.
- **Top card hole with a figure hidden:** grade / Coming up / both, before 333 / 238 / 442px at 1440, 284 / 190 / 393 at 1278, 146 / 52 / 255 at 960; after 0 in every case and theme. Stacked picture fills 80% of its stage (was 548 of 1326px, 41%).
- **Needs attention beside Scores, nothing hidden:** gap 251 / 251 / 427px at 1440 / 1278 / 960 before; 0 after (stacked, 414px over 136px). Row height in the side column 102px to 71px.
- **Sections menu:** 12 window sizes and key positions (including 960x600 at three heights, 375x667, 667x375, 667x320) never cover the key and stay on screen; the page scrolled only at 667x375 (7px) and 667x320 (34px). Tap targets: key 169.7x44, rows 231x44 (1440) and 317x44 (375), Show all and Done 72.7x44. Contrast (heading / note / names / key): IDEA 15.42 / 7.27 / 15.42 / 8.93, Space White 17.77 / 9.72 / 17.77 / 9.3.
- **Reach:** row keys walked 53.3x45, 0 of 22 under 44px, 66 of 66 hit tests at -21/0/+21px; title links 129 of 129 hit points answer the link at 375, 960, 1278 and 1440 (was 111 of 129 at 960, 18 landing on the date).
- **Play key, real mouse and keyboard, 9 runs:** mouse Play with the pointer resting on the key moves on after 4.83 to 4.85 s (was never); keyboard Tab, Space, Space after 4.92 to 4.95 s (was 11 s or more); key box identical in both states (was a 50px jump at 375).
- **Print:** 2 Letter pages in every theme, smallest type 9pt over 224 text boxes; 2 pages and 9pt with three sections hidden.
- **Final runs:** 52 route/width runs, 1220 measurements, 0 outside at 375 / 960 / 1278 / 1440 (polish round C); 39 runs, 942 measurements, 0 outside at 375 / 960 / 1440 (last fix); svelte-check 0 errors, 33 warnings in 18 files throughout.

### Refinement rounds

The builder self-reviewed once (four findings fixed: menu keys below the visible panel on a 375x812 window, the timer fighting a swipe, ragged Needs attention keys and dates).

- **Review 1: 1 confusion, 7 polish.** Fixed: the menu re-places after a tick and never covers its key; it closes when focus leaves; notebook photos leave Their work with the notebook; an every-section-hidden sentence; Coming up keeps its own height; Needs attention rows wrap one way per card (container-width grid); At a glance spreads evenly (4 + 3 at 960). One sub-point, space under Scores at 1440, was left as the multicol ragged bottom (closed later by `studentDuoStacks`).
- **Review 2: 1 wrong, 3 polish.** Fixed: the split / stack / solo hero ends the 200 to 442px hole; row keys gain a height-only 44px reach; Needs attention shares one chip column so titles align; the menu list fades and counts "N more below". Also fixed unasked: the no-pictures empty box stretches to its column instead of leaving a 272 to 324px void.
- **Review 3: clean, 3 polish.** Polish round B fixed all three: keys on the title line plus `studentDuoStacks`; `studentSectionsMenuFit` replaces the 300px floor; the stacked gallery is capped at a 16:9 stage width. Two older `classroom-student.mjs` checks that assumed a 1024px window breakpoint now read container widths, so the spec is correct at 960.
- **Review of round B: clean, 4 polish (2 pre-existing).** Polish round C fixed all four: the date no longer covers the title link's tap box; check-in rows share the assignment grid so dates form one column (`STUDENT_DUO_ROW_PX` re-measured; the side-by-side spec moved to `?attention=1&checkins=1` and was renamed to match); the play key drops `aria-pressed`; score bar titles wrap instead of ellipsizing.
- **Review of round C: 1 wrong, 2 polish.** Fixed: Play with a mouse or keyboard now plays (the play key never holds the timer; keyboard focus only); the play key keeps one width; wrapped check-in labels keep the same 12.5px air above their date.
- **Final confirming review: clean, no findings.**

### Not verified

- The real signed-in route with a Supabase session: the harness mounts the same `StudentOverview` and the real classroom store and read-first writer, with only the profile column stood in by `localStorage`. No session here reaches production.
- Real touch devices (iPad, phone): the browse hold and the ignored-touch hover were driven by synthetic events and Chromium mouse input only.
- Safari and Firefox: the `:focus-visible` fallback and the `mask-image` fade were seen only in Chromium 141.
- The reduced-motion strip path, a real screen reader, real web fonts (the harness blocks Google Fonts), and a real printer (Chromium print emulation and PDF only).
- Matrix in the new strip and sections specs (they have IDEA and Space White twins; Matrix was screenshots plus the existing Matrix theme spec).
- Tall portrait photos in the stacked stage, real data with long titles or many score bars (the stacking estimate is calibrated on fixture rows; a wrapped title makes it run short, which can only keep a pair side by side), and the menu's page scroll when the key sits in an inner scrolling pane.

### Deferred, and for Mr. Pina

- **The enlarged Lightbox still clamps at the ends** (`lightboxStep`, `src/lib/media/lightbox.ts:178`, a site-wide rule). Opened from the student page's slide, Next on the last picture does nothing. Whether it should wrap there too is your call.
- **The default split top card keeps 0392's gaps** with nothing hidden: 129px under the left column at 1440, 80px at 1278, gallery 58px short at 960. Closing them means resizing the approved 0392 slide, a design call.
- Score bar rows are separate grids, so tracks differ by a few px with the figure's width; readings are correct. Lining them up needs a subgrid across the multicol form.
- Every harness load of `/dev/classroom-student` logs one `net::ERR_FAILED` and one aborted `__data.json` request (the harness invalidates on mount). Predates this part.
- No `classroom-updates.json` entry: the page is teacher-only.

### Prompt claims that turned out wrong

- "Next on the last image wraps to the first": the index already wrapped, keys and timer alike. The defect was the strip not following the wrap.
- "Every item listed under Needs Attention gets Grade and Full screen": the list also holds flagged and missing notebook check-ins, which have no assignment row, so only assignment rows get the keys.
- The integrator note to keep "no text under 9pt" honest assumed it was measured: `_student-print.mjs` counted pages but never measured type size. It does now.
- The settings-help spec's count of 10 teacher setting tips was already wrong on the base tree, which had 11 (Class banner motion, ledger 0381). With this part's "Student pages" and part 6's "Post thumbnails" it is 13 (`classroom-palette-s-1-manage-1-state-settings-help.mjs:38`); the integrator resolved the merge.

## Part 5: one feedback window, everywhere (reports 0fe82a80, 80bb4d23)

One builder, four review and fix rounds, a fifth review that came back clean, a polish round and a final clean review, squashed into `5bf865a4`. The builder wrote its migration as 0271; the integrator renumbered it to 0269 (file, test and every reference) so the bundle's migrations run in order, 0268 (part 6) then 0269.

### What changed

The home page's Send feedback box is now the one window on every page except VANGUARD and GREENLINE. The button sits in the same bottom-right corner everywhere, the classroom, Armory, the deck, the projector, the error page, the Coin Ledger, the assignment handouts, GAUNTLET and IdeaCAD included, and every room restyles it through colour tokens only: never its position, its words or its typeface. The Ledger and the `/assignments/<slug>` handouts carry the real button, server-rendered into their bytes; pressing it opens `/feedback/embed`, a same-origin page that renders `SiteFeedback` alone, in a transparent overlay frame placed exactly where the home box opens. The report records the opener's route, live path and build (and the Ledger's active tab), never the frame. The frozen Ledger HTML was not edited, and the look-alike panel is deleted.

- `src/lib/feedback/FeedbackTrigger.svelte` (new): the button, extracted from `SiteFeedback` so the same component can be server-rendered into a legacy page. It declares `--feedback-clear-block` and `--feedback-clear-inline` on `body:has(.sfb-shell)` (`:128-134`), the clearance every room reads to keep its own last controls out of the corner.
- `src/lib/feedback/SiteFeedback.svelte`: gained `place="embed"`, opener focus return, the `FEEDBACK_OPENING` pending word ("Opening…"), Tab wrapping inside the box, and the GAUNTLET colour hooks on `body:has(.gt-root)`.
- `src/routes/feedback/embed/` (new): the window page; `+page.server.ts:22-25` sends `frame-ancestors 'self'`, `x-frame-options: SAMEORIGIN` and `private, no-store`.
- `src/lib/feedback/embed.ts` (new): the postMessage protocol (`FEEDBACK_EMBED_MESSAGES`: ready, open, opened, closed, failed, close, room), the room-token allowlist (`FEEDBACK_ROOM_HOOKS`, `FEEDBACK_ROOM_PLATE_TOKENS`, `FEEDBACK_ROOM_TOKENS`), `roomTokenValueOk`, `parseRoomTokens`, `filterRoomTokens` and `FEEDBACK_EMBED_MARKER`.
- `src/lib/server/feedback-launch.ts` (new): `injectFeedbackLaunch`, the launcher script (frame, `syncRoom`, `inertPage`, the did-not-load note) and the legacy-page foot clearance; called from `src/routes/coins/[...path]/+server.ts:68` and `src/routes/assignments/[slug]/+server.ts:39`.
- `src/lib/feedback/embed-typeset.ts` (new): warms the box's two font families when the window page loads and holds every open up to `FEEDBACK_EMBED_TYPESET_WAIT_MS` (800ms) for them.
- `src/lib/feedback/opener.ts` (new): `openSiteFeedback`, so the error card's "Tell us what happened" (`src/routes/+error.svelte:106`) opens the same window instead of mounting a second one.
- `src/lib/feedback/embed-dev-sink.ts` (new): the dev-only recording sinks (`?sink=memory` on the window, `?feedbackSink=memory` on the root layout), both gated on `dev`.
- `src/lib/gauntlet/GauntletFoot.svelte` (new): GAUNTLET's trademark line and version stamp as one component, mounted by `src/routes/gauntlet/+layout.svelte` and `/dev/gauntlet-shell`, padded past the button.
- `FEEDBACK_EXCLUSIONS` (`src/lib/feedback/context.ts:162`) is now exactly `greenline` (plus `/dev/greenline-portal`), `vanguard`, `coins` and `embed`; `feedbackExclusion` answers null for any error page; `feedbackWearsClassroomPlate` wraps the window in `CLASSROOM_PLATE` on classroom routes (`src/routes/+layout.svelte:188`).
- Deleted: `src/lib/server/legacy-report-panel.ts`, `/api/coin-feedback`, `/api/assignment-feedback`, the handout session probe, their dev stubs and `tools/browser-verify/routes/_legacy-report.mjs`. `src/lib/server/legacy-feedback-post.ts` stays as `/api/vanguard-feedback`'s alone. The docked mounts in `ClassroomShell.svelte`, `ArmoryFrame.svelte`, the deck page, the projector page, the student-work page and `+error.svelte` are gone.
- Clearance readers: `.cr-root`'s foot (`classroom.css:85`), `ClassSplit`'s panes (`split.css:651-664`), the grading dock below 1024px (`GradingConsole.svelte:6698`), Armory's foot (`armory.css:30`), the projector strip (`ProjectorView.svelte:1129`), the deck stage (`DeckViewer.svelte:348`), the home footer (`src/app.css:3341`) and IdeaCAD's footer row (`SolidWorkspace.svelte:865`, `--foot-h`).
- `/feedback` joined `THEME_SCOPE_PREFIXES` (`src/lib/theme.ts:212`) so the framed window follows the stored theme. `CLAUDE.md`'s feedback paragraphs were edited in place.
- Tests: `tests/feedback-launch.test.ts` (new), `tests/feedback-coverage.test.ts`, `tests/db/short-link-reserve-feedback-0269.test.ts` (new). Specs added: `gauntlet-shell-report-room`, `gauntlet-shell-foot-clear`, `coins-signedin-1-space-white`, `theme-switch-report-corner` (and its Space White twin, replacing the deleted `theme-switch-report-slot*`), `ideacad-solid-state-feedback-corner`, with helpers `_corner-feedback.mjs` and a much larger `_report-room.mjs`; `controlFit` in `checks-visual.mjs` gained a `floating` option.

### Load-bearing decisions

- **The window is the component, never a rebuild.** `/feedback/embed` renders `SiteFeedback place="embed"` (`+page.svelte:234-236`), so every field, string and refusal is the home box's own; `tests/feedback-launch.test.ts` asserts the Ledger's served bytes contain the component's own server render of the button. A second implementation is exactly what Mr. Pina rejected.
- **The opener is session-blind.** The window reads the root layout's own claims, so the injected bytes are identical signed in and out, the handouts stay one public cache entry with no `Vary`, and the probe and both signed-in endpoints could be deleted. The Ledger keeps `Vary: Cookie` for its theme only.
- **One position, and the room makes space, not the button (review 1's blocker).** The builder first kept six docked placements, each with a recorded reason (report 30's hit-test collisions in the classroom, Armory's 2026-10-07 decision, the deck, projector, error and student-work pages). The reviewer ruled that a blocker; the collisions are now solved by the clearance variables, which exist only while a floating button is on the page and default to 0px.
- **A room changes colours only.** Values arrive as a checked allowlist (`?room=<json>`, each through `roomTokenValueOk`: no `url()`, no `var()`, balanced parentheses, at most 200 characters, set one property at a time) and are re-posted as a `room` message when the page's theme changes. Round 4 removed the `--fb-room-font` hooks everywhere rather than two lines in FRC and FSP, so no room can change the box's type again.
- **One outline and one focus ring.** The button's radius is `var(--fb-room-radius, var(--plate-r-control, 11px))` in every room; focus is drawn through `--fb-room-focus` and `--fb-focus-ring`, whose default `none` keeps GREENLINE's own `FeedbackBox` byte-identical.
- **A frame that is not the window fails at once.** A document without `FEEDBACK_EMBED_MARKER` ends the press with a worded note beside the button instead of a 15s wait.
- **Fonts are warmed, not the frame.** Loading the window on idle was rejected: it is a full SvelteKit page (session read, `DeployWatch` polling every 120s) for every reader of a public handout, most of whom never report. The warm-up reads the faces off `--font-display` and `--font-mono` instead of keeping a weight list (about 60 KB of unused Rajdhani weights is the cost).
- **IdeaCAD's footer grows to the button** (`--foot-h: max(48px, var(--feedback-clear-block))`), costing 16px of canvas on a desktop and 32px on a phone. Rejected: narrowing the tool strip, and lifting the strip and its five companions by a variable.
- **"Closes on submit" is read as the home box's own flow, and kept.** After SEND the framed window shows the home box's thanks state ("Thanks, that went through." with SEND ANOTHER and DONE) and closes on DONE, Escape, Cancel, the close key or a click outside, with focus back on the button, exactly as the home box does. The prompt's first requirement is the identical window everywhere; closing the instant SEND lands would hide the confirmation and make this window differ from the home box. **Mr. Pina should confirm this reading.**

### Audit: every feedback entry point

- **Home `/` and every Svelte page under the root layout** (Foundry, Certifications through `CertShell`, the coin desk, FRC, FSP, Tournaments, Maps): the root mount, `SiteFeedback` at `src/routes/+layout.svelte:196` drawing `FeedbackTrigger`, in the corner set at `FeedbackTrigger.svelte:140-141` (0.75rem from right and bottom) and `:158-161` at 30rem and under (1rem right, 1.5rem up, 48px tall). Maps and the real FSP pages were placed from source only.
- **Every `/classroom` route** (class page, item page with its ported HTML worksheet, notebook, grading, People, Live, one student's page and the student-work reset page), **Armory, the deck, the projector and the error page**: before, the same `SiteFeedback` docked in a header, bar or strip; now the root corner button, plated on classroom routes, with the projector's fading with its strip.
- **Coin Ledger `/coins`**: before, the look-alike panel from `legacy-report-panel.ts` with a header button; now `injectFeedbackLaunch` (`coins/[...path]/+server.ts:68`) and the framed window.
- **Handouts `/assignments/[slug]`**: before, the look-alike plus a session probe; now `injectFeedbackLaunch` (`assignments/[slug]/+server.ts:39`), light palette on a white handout, still `public, max-age=0, s-maxage=60` (`:68`).
- **GAUNTLET**: before, the same `SiteFeedback` docked in the viewport footer under a `gauntlet` exclusion; now the corner, in GAUNTLET colours from hooks on `body:has(.gt-root)` (`SiteFeedback.svelte:676`), because `viewport.css` is the game's own design system.
- **IdeaCAD**: the root mount, which `SolidWorkspace.svelte` moved 2px/8px and stripped of its word below 700px until round 4; now the corner with its word.
- **`/hx/[docId]` served directly**: no control, by the named exemption at `tests/feedback-coverage.test.ts:300` (a sandboxed document; the item page framing it carries the button).
- **The two that keep their own:** VANGUARD's injected panel (`src/routes/vanguard/+server.ts:633`, posting through `/api/vanguard-feedback`), and GREENLINE's menus, which mount `FeedbackBox` directly (`src/routes/greenline/+page.svelte:32,834`).

### Migration

- `supabase/migrations/0269_short_link_reserve_feedback.sql` adds `feedback` to `_app_short_link_reserved` (38 names), because `src/routes/feedback/` is now a top-level route directory. Same signature, no row written, grant block naming the roles (the 0166 shape, `service_role` only), a self-check over the set, a negative control, the count, one overload and no client execute. An existing `feedback` short link is left in place and reported, not moved: `/feedback` itself is not a page, so such a link still resolves. Client mirror: `src/lib/short-links.ts:73`.
- **Reversal:** re-paste 0260's PART F definition of `_app_short_link_reserved` (37 names) with its grant block. No data to undo.

### Measured

- **Corner:** right 12 / bottom 12, 150x44 at 1440 and 960; right 16 / bottom 24, 161x48 at 375; the centre hit-tests to the button on 21 routes plus the Ledger, handouts, GAUNTLET, IdeaCAD, FRC, FSP and Tournaments harnesses; 0px horizontal overflow; radius 11px on the seven surfaces measured.
- **Same box:** home and framed Ledger both [480,38,480x824] at 1440x900 (822 of 822 content, SEND inside), [240,38,480x824] at 960, [16,32,343x747] at 375; textarea in Rajdhani everywhere. FRC and FSP before round 4: 877 in 826 with SEND below the edge.
- **Same row:** home, GAUNTLET and the Ledger, each with typed text, a pasted 8x5 PNG and a fake voice note, produced identical entry keys (`app, context, kind, message, meta, screenshotPath, tried`) and row keys (`... screenshot_path, tried, user_id`); the Ledger's `meta` adds `tab`. Signed out, the sink records the real `submitAnonymousFeedback` POST to `/api/feedback`.
- **Contrast:** Space White chosen chips in the Ledger window 5.96:1 (was 2.35); typed text after a theme switch 17.85 / 17.99 / 14.17:1 in IDEA, Matrix and Space White (was 1.03 and 1.00); focus ring 852 to 2115 changed pixels (was 0 of 9128 on plated pages), worst ring 3.46:1 on Space White.
- **Speed and modality:** did-not-load note 121 to 267ms (was 15137ms); cold tap "Opening…" at 120ms, window at 687 and 755ms; 12/12 and 10/10 body children inert while open, 0 left after; 24 Tabs, 0 escaped. First opens: 12 of 12 with every face loaded at first paint; control without the warm-up reflowed on 2 of 4 (871 in 826).
- **Clearance:** GAUNTLET stamp 15px above the button, 0 of 63 points covered (control 1029 sq px, 28 of 63); grading dock at 375 62px tall (was 131), every key 9 of 9 on itself; IdeaCAD 0 controls under the button at three widths and three themes.
- **Mutation proofs, all killed:** token grammar, route grammar `//host`, the `dev &&` sink gate, an embed frameable by any origin, drifted `</head>` and `</body>` anchors (4 tests each), 0269's self-check (at apply) and 0269 with it neutered (5 of 6), raw room tokens, focus `outline: none`, the font hook re-added, the old `SolidWorkspace.svelte`, the dock offset removed, `syncRoom` removed, the warm-up removed, the stale-opened guard removed.
- **Last builder runs:** `feedback-launch` 43 passed, `feedback-coverage` 87, the 0269 db test 6 (run as 0271, before the renumbering); `svelte-check` 0 errors, 33 warnings, 18 files; every touched spec 0 outside threshold.

### Refinement rounds

- **Review 1:** 1 blocker, 3 wrong, 0 confusion, 8 polish. Fixed: the button moved to the corner on every docked surface; Space White lit ink handed to the window; the font override dropped; focus return, an "Opening…" state, frame modality (`inert`, Tab wrap) and the version chip hidden under the note. Kept: the room-dependent shape (fixed in round 2), "closes on DONE". `controlFit` gained `floating`; selftest 110 controls, 0 failures.
- **Review 2:** 0 / 1 wrong / 0 / 8 polish. Fixed: the window follows a theme change (`syncRoom` and the `room` message, ink and field handed together); the grading dock pins at the button's top; the home footer clears the button; one 11px outline; `/dev/greenline-portal` joins GREENLINE. Kept: the deck's reserved band (it is the deck's own `#000` letterbox, `static/fsp/day2/deck-stage.js:156`), the error page's warning glyph.
- **Review 3:** 0 / 1 wrong / 0 / 6 polish. Fixed: a visible focus ring on the button and every key, with per-room rings (Ledger cyan, GAUNTLET lime, FRC `#0066b3`, FSP `#123a5e`); the Ledger and handout feet clear the button; the launcher comment; the signed-out sink. Kept: the 960 dock transient.
- **Review 4:** 0 / 2 wrong / 0 / 3 polish. Fixed: the room font hooks removed site-wide (FRC and FSP had Roboto and the system stack); IdeaCAD's override removed and its footer grown, with a source sweep refusing any stylesheet outside `src/lib/feedback` that moves the button or hides its word.
- **Review 5 (clean):** 5 polish. The polish round fixed GAUNTLET's foot, the first-open typeface reflow and a stale deck exemption reason, and closed an Escape race it found (an Escape just after the press left a box mounted in a hidden frame in 3 of 3 runs; 0 of 3 after).
- **Final review (clean), 1 polish:** `gauntlet-shell-countdown` flakes while another session loads the machine. Reported to the integrator's measuring step; it is load, not a defect in the part. Carried throughout and accepted: "closes on DONE" (reason above, for Mr. Pina), and `tests/derived-numbers.test.ts` red until the new specs are measured, which the lane was told to leave to the integrator's `verify:readme`.

### Not verified

- A real signed-in report through the production RLS insert, and the frame behind production cookies on a Vercel host: rows were proven through the dev sinks only. 0269 has run only on the test cluster.
- A real microphone or speech service in the frame (voice used a fake `SpeechRecognition`; `allow="microphone"` is set), a real phone, touch, WebKit and iOS safe-area insets (which also add to IdeaCAD's footer).
- A real second tab (the theme switch was a `localStorage` write plus a dispatched `StorageEvent`), production font timing and the 800ms cap on a slow network (unit test only).
- The real `/frc`, `/ideacad`, signed-in `/gauntlet`, Maps viewer and FSP pages (harnesses or source only; FSP's ring on its own paper is inferred), the full-screen deck with a real Fullscreen grant, and a loaded Claude Design deck.
- The full suite was not run by the builders; that is the integrator's gate.

### Deferred, and out of scope, for Mr. Pina

- Confirm "closes on DONE". The deck in full screen shows no button (exit full screen to report). On the grading console at 960 the dock passes under the button for about 100px of scroll at the top: a bottom-sticky dock cannot rise above `.grade-main`, and unbinding it breaks `CLAUDE.md`'s rule.
- VANGUARD's panel stays a look-alike by the prompt's decision, beside its older in-game composer (two controls). GREENLINE's own box shows focus only as a faint border; it is one `--fb-focus-ring` line in its override if wanted.
- FRC and FSP pages' own controls use the site ring `#5abda8`, 2.00 to 2.26:1 on their paper, the failure the button had there.
- The home box has the Escape-while-pending gap the launcher had: Escape while the box's code is still loading does not cancel the open (a one-line fix in `SiteFeedback`'s keydown).
- The signed-out home tour (z 1100 to 1102) covers an open box (z 120).
- Dead rules: `#idea-ledger-report-btn` in `src/lib/legacy/coins/index.html:1975` (needs an unfreezing), `.cr-header .sfb-trigger` and `.sfb-word` in `src/lib/classroom/plate.css` (`:706`, `:1469`), and `.vnav-shell` in `SolidWorkspace.svelte:773`.
- Pre-existing harness findings: `classroom-tour-s-1-item-i-missing-manage-0-tour-offered` expects an 18rem floor against `NAV_WIDTH_MIN_REM` 16 (ledger 0383); `button.attach-preview "Enlarge"` sits 0 to -1px from its edge; `armory-state-many-out` reads 1833px against its 1800px predicate; `/dev/feedback?view=incidents` filters read 9 of 9; `/dev/home-order`'s debug bar covers the box head at 375; `tests/derived-numbers.test.ts`'s negative halves turn red for any bundle that adds a spec.
- `CLAUDE.md` still says the classroom projector is the one layout reset; the student-work page is a second.
- The `classroom-updates.json` line this part owed (Send feedback in the bottom-right corner on every page, classes included) was written by the integrator, who owns that file.
- Two builders on this 4-CPU container already produce flaky harness runs (one GREENLINE spec failed twice in a batch and passed 2 of 2 alone).

### Prompt claims that turned out wrong

- "GAUNTLET's feedback is present but hidden and laid out differently": it was already the official `SiteFeedback`, docked in its viewport footer, never an imitation. What changed is its place and colours.
- "Closes on submit": the home box, the stated official window, does not close on SEND (above).
- "The frame reports the route and build": it must also report the live path and, on the Ledger, the active tab, which the deleted panel recorded as `meta.tab`.

## Part 6: thumbnails, a visual identity for every post (report a6a037f3)

Squash commit `623c2893` ("Every post gets a thumbnail: a picture, a live HTML thumbnail, or a generated look"), plus an integrator's fixup (folded into it), which removed a `page` import that the merge with part 3 had duplicated in `src/routes/dev/home-feed/+page.svelte`. Mr. Pina, dictated: finding an assignment at a glance on a class page "is not convenient at all ... with all this text and with no real visual separation in between posts". The first builder was stopped after about 2.5 hours, while verifying, so the bundle could run more parts in parallel; a second builder resumed from its commits and finished the verification.

### What changed

- **Every post has a thumbnail SLOT**, showing one of three sources: a picture (uploaded, pasted, or picked from the post's own images, with its natural size and a focal point the teacher nudges), a live HTML thumbnail the HTML assignment declares in its manifest, or the generated identity (the post's type glyph on a Plate tile tinted by its unit). No row means the generated identity.
- **The shape is a display setting, never part of the post**: Off, Tile, Wide (16:9) or Banner. Each person picks it in Display settings ("Post thumbnails", `display.thumbShape`), remembered per device; a teacher sets the class default on the class Settings tab (`ClassThumbnailSettings.svelte`, mounted from `ClassSettingsPanel.svelte`); with neither set it is Tile.
- **Where it shows**: class page rows (items and notebook check-ins, every shape), the home page's class card rows (every shape, since the polish round) and the to-do rows (a 30px tile, which honours Off).
- **Live HTML thumbnails** are served by `/hx/<doc>/thumbnail`: the author's `<template id="idea-thumbnail">` contents, byte for byte, inside a fixed shell holding a charset and the published shim. The parent tells the frame its size, shape, site theme and scheme, reduced motion and pause state, live; a frame marked `"interactive": true` keeps its own clicks, and any click it does not handle opens the post.
- **Setting one**: `ThumbnailEditor.svelte`, inside `ContentComposer`, previews the post in every shape at once and offers upload, paste, pick, generated, or Automatic (back to the manifest), with a focal-point nudge.
- **Main files.** New: `PostThumbnail.svelte` (the one renderer), `html-assignment/HtmlThumbnailFrame.svelte` (frame lifecycle), `html-assignment/thumbnail.ts` (template extraction, shell, shim, bridge), `thumbnail.ts` (`thumbnailPlan`, `liveTemplateMissing`, `focalObjectPosition`), `thumbnail-shape.ts` (`THUMB_SHAPES`, `resolveThumbShape`), `thumbnail-image.ts` (`prepareThumbnailFile`), `thumbnail-transports.ts`, all under `src/lib/classroom/`; routes `src/routes/hx/[docId]/thumbnail/+server.ts`, `src/routes/api/classroom/thumbnail/+server.ts` (record), `.../sign/+server.ts` and `.../[itemId]/+server.ts` (the picture); the harness `/dev/post-thumbnails`. Changed: `ClassView.svelte`, `ClassroomFeed.svelte`, `TodoPage.svelte`, `file-upload.ts`, `transports.ts`, `student-work.ts`, `preferences/classroom.ts`, `upload-limits.ts`, `plate.css`, `src/routes/hx/_documents.ts`.
- **Standards**: `IDEA_HTML_ASSIGNMENT_SPEC.md` 1.9 (section 4.10, the key; section 6.8, the route and bridge, with the frame-timing figures), `IDEA_HTML_ASSIGNMENT_AUTHORING.md` 1.25 (including 10d's interactive CSS), their `REGISTER.md` rows, and a working animated thumbnail in `src/lib/legacy/assignments/_TEMPLATE.html`. `tools/validate-assignment-spec.py` gained `thumbnail_warnings`, the mirror of `manifestThumbnailWarnings`, held together by `tests/html-assignment-manifest-parity.test.ts`. Every thumbnail problem is a warning, never a refusal.
- **`CLAUDE.md`**, two in-place edits where a sentence became false: the upload path has FIVE roles (a post's thumbnail picture since 0268), and the thumbnail picker keeps `image/*` beside the deck's `.zip`.

### Load-bearing decisions

- **A one-to-one table, not columns on `classroom_items`.** Items are copied, snapshotted by the revision chain and exported; a column joins every one of those paths. `classroom_item_thumbnails` is read through one embed on its own ladder rung (`ITEM_SELECT_THUMBS`, `transports.ts:230`) and written only by 0268's functions.
- **Manual beats the manifest, structurally.** The document trigger's upsert in `_classroom_thumbnail_sync` carries `where not t.manual`; Automatic deletes the hand-set row and re-reads the manifest.
- **A manifest naming a template the document does not carry writes no live row** (polish round). `_classroom_html_may_carry_template` is deliberately WIDER than the route's exact `servedThumbnailTemplate`: a second copy of the tag walk in plpgsql would be the copy that stops matching, and measured, per-call string conversion makes a loop quadratic on a 2 MB document. The direction is the contract: a document the route serves always gets a row; one only the wide test passes gets the route's 404, then the generated look.
- **Precedence is the person's choice, then the class default, then Tile** (`resolveThumbShape`, `thumbnail-shape.ts:54`). Tile, not Off, because a list must never be a wall of text; per device, because the Display group is (`preferences/classroom.ts:259`) and a phone and a projector want different shapes.
- **The shape is CSS.** `PostThumbnail` reads `--thumb-w`, `--thumb-h`, `--thumb-ratio` and `--thumb-shape` from `data-shape`; a new shape is a rule and a `THUMB_SHAPES` entry. Pictures are `object-fit: cover` around the stored focal point.
- **The Tile sits INSIDE the row's link** (`ClassView.svelte:1734`), so the row stays one 44px target. Rejected: the first build's separate 36x36 tile link, which the themes-shape tap sweep caught. Only an interactive live thumbnail sits beside the link (`:1896`, `keepsOwnClicks` at `:653`), lined up to the pixel.
- **Click-through on a cross-origin sandboxed frame**: the parent never learns whether a click was handled, so a non-interactive frame is `inert` and the slot forwards the pointer (`idea:pointer`). Where the slot is inside somebody else's link (`passive`: the class tile, a home row, a to-do row) an interactive thumbnail is mounted inert (`ownClicks`, `PostThumbnail.svelte:108`), and the link stays over an interactive one until it reports ready, and after it fails.
- **Performance is the parent's job** (`HtmlThumbnailFrame.svelte`): frames are made within `NEAR_MARGIN` (50%, also a `scrollMargin`, so it works inside the 1440 pane), one per idle period, never while scrolling (wheel and touchmove count; `SCROLL_SETTLE_MS` 250); taken down past `KEEP_MARGIN` (150%) after `RELEASE_AFTER_MS` (3000); held frames away from the screen get `visibility: hidden`; paused off screen, in a hidden tab and while scrolling; no hover forwarded while scrolling; the shim writes an attribute only when it changes.
- **Under reduced motion a thumbnail draws a still frame, not nothing**: `still()` in the shim lets callbacks run for `HX_THUMB_STILL_FRAMES` (2) display frames after load and after any change a still frame must show (size, shape, theme, scheme, a window resize). `HX_THUMB_SHELL_VERSION` is 2, so cached copies revalidate once.
- **No live frame for a post the route refuses**: `thumbnailPlan` (`thumbnail.ts:189`) plans the generated look for a draft or a post scheduled ahead of the loader clock, threaded from ClassView's `clock`, never the device's. A draft's picture still shows.
- **The row hover never wraps `:hover` in `:has()`**: descendant rules only, measured below.
- **A thumbnail picture is the fifth role on the one upload path** (`file-upload.ts:127`, `ENDPOINTS.thumbnail`), into the post's own `classroom-attachments` prefix (no new storage policy), capped at 10 MiB (`THUMBNAIL_UPLOAD_MAX_BYTES`) after a browser redraw to 1600px (`THUMBNAIL_MAX_EDGE`). The picker offers only what 0268 accepts (`THUMBNAIL_RASTER_RE`), so HEIC is never offered. Every picture loads from `/api/classroom/thumbnail/<item>`: a signed URL on the caller's session, the attachment route, or a manifest alias through `resolveFigureSrc` (SVG refused).
- **Home cards read the person's shape after mount** (`readDeviceClassroomPreferences`, `ClassroomFeed.svelte:134`), because the server cannot see the device slot and reading it before hydration would draw a different page than the server sent. The class default rides an opt-in rung (`SECTION_SELECT_THUMBS`, asked only by `src/routes/+page.server.ts:99`), so `/classroom`'s pinned single sections read is unchanged.
- **An open home card's list has no ceiling** (`max-height: max-content`, `overflow: clip`, each with a fallback declared first, and `interpolate-size: allow-keywords` on both states so the fold still eases). The old `src/app.css` cap (`max-height: 1200px; overflow: hidden`) was harmless while every row was a 34px mark. Wide lays rows in columns of at least 20rem (3 at 1440, 2 at 960, 1 at 375); its deadline marker is a real element (`.feed-mark`), because a row's edge read as a column divider and Svelte prunes a scoped pseudo-element.

### Audit answers

- **The "empty area in front of the title" is not an unused slot**: it is the selection checkbox's 30x44 label, the drag grip, the expand caret and the 1.15rem kind glyph inside the row link. The Tile replaced the glyph inside the link.
- **The SQL manifest gate does not refuse an unknown top-level key.** `_classroom_check_html_manifest` (`supabase/migrations/0195_classroom_html_assignments.sql:219`) reads only `schemaVersion`, `kind`, `title`, `course`, `points`, `modules` and `header`, and no later migration redefines it. `thumbnail` was already stored verbatim, so this is not a gate widening; `tests/db/classroom-item-thumbnails.test.ts` proves it against 0195's setter before 0268 applies.
- **Display settings** is the classroom header's per-person panel (`ClassroomShell.svelte:291`, command `settings.open`), not a class-page menu; its `display` group follows the device.
- **The bridge**: `bridge.ts` spoke only to a worksheet and carried only `idea:theme`. The thumbnail half is new: `idea:thumb`, `idea:pointer`, `idea:thumb-ready`, `idea:thumb-open`, accepted only from the sandbox's expected (opaque) origin AND the frame's own `contentWindow` (`hxThumbReceive`).
- **Sandbox and CSP**: the thumbnail route calls the worksheet route's `hxOnServingHost`, `hxStoredDocumentHead` and `hxDocumentHeaders` and writes no header of its own; the frame reads `HX_SANDBOX_FLAGS`, so `allow-same-origin` is never granted. `tests/hx-thumbnail-route.test.ts` asserts the two routes' header sets are equal. The worksheet route is untouched, and a `<template>`'s contents are inert inside the worksheet, so the byte rule holds.
- **`plate.css`**: `.pt-media` (a picture or live thumbnail) joins the `@scope` lower bound (`plate.css:659`); the generated tile around it is the plate's.
- **Before the migration**: every read degrades one rung, every slot draws the generated identity, and the editor says `THUMBNAILS_UNAVAILABLE` (on `PGRST202` alone).
- **Lists given thumbnails**: `ClassView.svelte` (class page rows, every shape), `ClassroomFeed.svelte` (home class card rows, every shape), `TodoPage.svelte` (to-do rows, Tile, `:207`, Off at `:79`).
- **Lists NOT given thumbnails, and why**:
  - Grades tab (`GradesPanel.svelte`): posts are spreadsheet COLUMNS; a picture per header widens a table that already outruns the window at thirty students.
  - Grading console (`GradingConsole.svelte`): its list is people; the one post is named in the header.
  - One student's page (`StudentOverview.svelte`): a printable record held to two Letter pages, and its slideshow already carries the student's pictures.
  - Live tab and projector (`live-class/LiveControl.svelte`, `LiveGrid.svelte`): a control view and a wall; the projector frame is a closed key set (`PROJECTOR_FRAME_KEYS`), and a live document per agenda row is a cost a projected lesson must not pay.
  - The class Videos panel and the header's Next due key (`ClassVideos.svelte`, `ClassHeader.svelte`): already a grid of video cards, and a one-line key with measured caps, both in part 7's region.
  - The command palette (`$lib/shell/commands.ts`): keyboard-first, posts are a few of its rows.
  - The progressive feedback inbox (`FeedbackInbox`): notes, not posts.
  - The notebook and its review console: entries and check-ins, and the review grid's density is a locked contract.
  - My Classes, the archived list and the class strip (`MyClasses.svelte`, `nav.ts`): classes, not posts.
  - Duplicate drafts (`DuplicateDrafts.svelte`): an admin cleanup list compared by text and date.
  - The updates page (`UpdatesPage.svelte`): changelog entries.

### Migrations

- **`supabase/migrations/0268_classroom_item_thumbnails.sql`**, additive and re-pastable, 0166 revoke shape throughout. Adds the table `classroom_item_thumbnails` (RLS on, read by the item's readers, no client write grant), the column `classroom_sections.thumbnail_shape`, private helpers `_classroom_manifest_thumbnail(jsonb)`, `_classroom_html_may_carry_template(text, text)` and `_classroom_thumbnail_sync(uuid)`, the trigger `classroom_html_assignment_thumbnail` on `classroom_html_assignments` (function `_classroom_thumbnail_follow_document()`), and three client RPCs: `classroom_set_item_thumbnail` and `classroom_set_item_thumbnail_focus` (gated on `_classroom_manages_item`) and `classroom_set_section_thumbnail_shape` (gated on `classroom_manages_section`). A guarded backfill reads every stored document that names a thumbnail once; the self-check counts 3 client functions closed to anon and 4 private functions closed to every client. The manifest gate is not touched. The template check was added in place during the polish round (0268 was unshipped).
- **Reversal** (a paste by a person; `tools/apply-migration.mjs` refuses drops): `drop trigger classroom_html_assignment_thumbnail on public.classroom_html_assignments;` then drop `_classroom_thumbnail_follow_document()`, `classroom_set_item_thumbnail(uuid, text, text, uuid, integer, integer, real, real)`, `classroom_set_item_thumbnail_focus(uuid, real, real)`, `classroom_set_section_thumbnail_shape(uuid, text)`, `_classroom_thumbnail_sync(uuid)`, `_classroom_html_may_carry_template(text, text)`, `_classroom_manifest_thumbnail(jsonb)`, the table, and `alter table public.classroom_sections drop column thumbnail_shape;`. Every hand-set thumbnail and class default is lost; uploaded pictures stay in the bucket; the client then draws the generated identity everywhere. Part 6 needed this one migration; the bundle's other file, 0269, is part 5's.

### Measured

All in the harness Chromium 141 (headless, software rendering) through `/dev/post-thumbnails`, which mounts the real `ClassView` in the real `ClassSplit` with the real preference store, on a 4-CPU container shared with other builders (load average 1.5 to 13), so timing cases are medians of three beside a no-thumbnail baseline taken in the same run. CDP throttling slows only the page's renderer, not the out-of-process thumbnail renderer.

- **Final frame timing** (thirty live thumbnails, CSS and canvas alternating, 6s of scrolling, CPU slowed 4x, three runs each; the reviewer's script, with the fixer's matrix run for 960 and 1440 Tile): 1440 Wide 53.4/56.5/59.2 fps, Banner 59.5/59.0/59.2, Tile 59.7 (it barely scrolls), nothing set 60/60/60; 960 Wide 60/59.3/59.7, Banner 60/59.8/60, Tile 60; 375 Tile 54.2/54.0/56.5, Wide 59.8/57.0/59.0, Banner 57.2/57.8/58.3, nothing set 59.2/60/60. At full CPU every live case held 57.8 or more. A second matrix run gave 1440 Wide 54.4/52.3/54.6. These replace the build's own table, which review 1 showed did not reproduce; SPEC 6.8 now states these figures.
- **The last review's reading**: about 55 fps with roughly 3 frames over 50ms per 6s of scrolling for 1440 Wide at 4x (57.7 to 59.5 with nothing set). Home cards in Wide or Banner scroll at 36 to 48 fps at 4x in a dev build.
- **How the cost came down**: before `f5f96bd9` (every frame made the moment its row came near, a listener per frame, nothing paused while scrolling) Wide measured 28.4 and Banner 35.7 at full CPU, 25.1 and 25.3 at 4x. The `:has(a.row-main:hover)` rule, traced at 4x, 1440 Banner: 704ms of style recalculation and 10 tasks over 50ms in 3s, against 237ms and none without it. Main-thread task time over 6s at 4x, 1440 Wide: 3.3 to 3.8s before round 1, about 1.6 to 2.0s after (0.8 to 1.0 with no live thumbnails). Thumbnail renderer during a 5s scroll: messages 250 to 82, subtree restyles 285 to 119.
- **Rejected variants** (4x, 1440 Wide): `content-visibility: auto` on every box 50.7; on none 47.9; only on boxes holding a frame 58.7 at 1440 but 42.8 at 960, where the document scrolls; `contain: strict` 46.2; the shipped `visibility: hidden` 57.5 at 1440, 59.8 at 960.
- **Reduced motion**, canvas bytes read inside the sandboxed frame (`tools/browser-verify/_post-thumbnails-still.mjs`): before round 1, 0% spokes in 4 of 14 cases; after, 3.0 to 24.8% in every shape and theme, two reads 1.2s apart byte-identical, a theme change flips the ground, a 48 to 96px resize redraws. 16 of 16 rows pass; with `still()` emptied, 11 of 16.
- **The bridge**, on a fixture that reports what it was told and what it drew: Tile 48x48 drew a 36px gear with no label; Wide 351x197 drew 102px (52%) with its label; Banner 386x56 drew 41px; a 96px tile 71px; 36x36 at 375 drew 27px; Space White arrived as `light`, Matrix as `dark`; reduced motion and a hidden tab both arrived. Lazy creation: 30 of 30 frames at 1440x900, 20 of 30 at 375x812.
- **Clicks**, real presses: the non-interactive live tile's hit test lands in the row link and opens `/item/as-gears`; on the interactive thumbnail two presses of its + button counted 13 and 14 with no navigation, and a press on its background opened `/item/as-teeth`. The pointer arrives as `{x: 0.25, y: 0.75, inside: true}`.
- **Rows**: at 1440 Tile rows are 57.6px against 45.8px for a two-line row Off. At 375 a teacher's narrowest title is 120px Off (4 of 13 cut) and 105px in Tile (5 cut); a student's 148 and 133, none cut. Check-in slots match the posts' left edge and width at 1440, 960 and 375. At the 18rem pane 6 of 6 picture rows keep their type word, 0 of 7 generated rows do.
- **Template check**: `_classroom_html_may_carry_template` answers both cases over a 2,070,090-character document in 34ms; on a 24-document corpus 13 pass both tests, 5 the wide one only, 6 neither, and the exact test never accepts what the wide one refuses.
- **Home cards**: before the cap was lifted, Wide at 375 clipped 1200 of 2349px and focusing Open class scrolled the list 1149px; Wide at 960 lost 270px; Banner at 375 lost 88px (the Open class link). After: every list fits, 0px overflow, every Open class link 44px, in all three themes and both roles. The fold eases 2349 to 0 over 500ms.
- **Editor network**: draft and scheduled forms make 0 requests to `/hx/*/thumbnail`; a refused live post makes 3, and 3 more after Try again.
- **Browser specs**: 23 new (`post-thumbnails*`, 15; `home-feed-thumbs*`, 8), each with its `measured/` file now; final pass 46 route/width runs, 632 measurements, 0 outside threshold. In the build round, every spec mounting `ClassView` after the tile moved into the link: 256 runs, 4080 measurements, 14 outside, every one also outside on base `2673393`. Screenshots at 375, 960 and 1440 in IDEA, Matrix and Space White: no clipped tile, 0 rows with horizontal overflow.
- **Tests**: `tests/db/classroom-item-thumbnails.test.ts` 32, `tests/classroom-thumbnail.test.ts` 38, `tests/hx-thumbnail-route.test.ts` 9, plus every touched file green; `svelte-check` 0 errors, 33 warnings in 18 files (29/3/1), unchanged. Mutation proofs, each restored from a copy and md5-checked: the select policy opened to `using (true)` reddens 2; dropping `where not t.manual` reddens 3; the sync ignoring the template check reddens 3; the wide test narrowed to double quotes reddens 11; overriding the route's CSP and dropping its publish check are each caught; removing `published: live` from the editor's preview makes 3 frames on a draft.

### Refinement rounds

- **Review 1** (4 wrong, 1 confusion, 6 polish). Fixed: the reduced-motion still frame (`still()`); frame timing (the lifecycle rules above, replacing `content-visibility`); the editor picker (raster only, a failed tile names its file, staged pictures drawn from object URLs, an `attachment:` alias previewed from a staged file); every manifest form driven through the real composer with in-memory import transports mirroring the sync, plus the picture route's GET tested as a request (11 refusals); the class default card (only the chosen key lit, 12px gap); bridge reads keyed by the sending frame; the interactive fixture's buttons (32px, Wide and Banner only); Off reaching the to-do; check-in slots aligned; `thumbnailPlan` refusing draft and scheduled posts. Left: the teacher Tile at 375.
- **Review 2** (clean; 6 polish). The integrator's polish round fixed three: the missing-template case (now a data fix in 0268, not only editor wording), every shape on the home cards, a stale `content-visibility` comment in `post-thumbnails-view-bridge.mjs`. It also fixed 0268's header path (`src/lib/classroom/html-assignment/thumbnail.ts`). Accepted: the teacher Tile at 375 and the Wide timing. Reported: the brief.
- **Review polish-1** (1 blocker, 1 confusion, 2 polish). Fixed: home cards clipping rows and the Open class link (the list cap); the editor blaming the template for a draft's or scheduled post's 404 (no frame for those, a Try again key for a live post, "may not carry" only where the form cannot tell); the Wide deadline marker (`.feed-mark`). Declined: the server-render shape flash. Found on the way: the earlier "requests 0" assertions read resource timing, which records 0 entries for a sandboxed frame's load (1 network request, 0 entries), so they were vacuous; the harness now counts frames made (`window.__framesMade`) with a positive control.
- **Final review, polish-2** (clean; 3 polish):
  - Home cards draw Tile before hydration for a reduced-motion reader: **accepted**. Under the default motion setting cards are `opacity: 0` until the page's own `IntersectionObserver` reveals them, after `ClassroomFeed`'s `onMount` has applied the shape (measured with JavaScript off); closing it needs the server to know a device-stored choice.
  - Home cards in Wide or Banner scroll at 36 to 48 fps at 4x in a dev build: **accepted**.
  - A folded home card keeps its rows, and now its live frame, in the tab order: **reported**; the folding predates this part.
- Also accepted by the integrator: the teacher Tile at 375 cuts one more title than Off (a teacher row carries a checkbox, a grip, an expand control and a menu; the 36px tile replaces a 20px glyph, and moving it into the link and shrinking it from 48px had already taken the cuts from 9 to 5), and 1440 Wide at about 55 fps with roughly 3 long frames per 6s at 4x.

### Not verified, and why

- **Production**: 0268 is not applied anywhere a session can see; until it is, every class page reads one rung narrower and shows the generated identity.
- **A real signed-in class or home page**: every UI claim is the `/dev` harness over in-memory transports; `/dev/login` against a local stack was not run. The image route was proven against a faked PostgREST-shaped client.
- **Safari, iOS, Firefox**: no WebKit here. The HEIC redraw success path needs Safari's `createImageBitmap`; only Chromium's refusal was exercised. `scrollMargin` on `IntersectionObserver` is Chromium 120+; elsewhere frames are made only once visible. The fold without `interpolate-size` (folds at once by design) was not seen.
- **Real hardware**: CPU throttling stood in for a 6 to 8 year old school desktop; no phone GPU or projector.
- **`PUBLIC_HX_SANDBOX_ORIGIN` on a second host**, a Drive-backed attachment picked as a thumbnail (no Google credentials), and opening an interactive thumbnail by keyboard focus (no screen reader run).
- **The production route refusing a draft end to end**: the dev route serves fixtures whatever their state; the refusal is pinned by `tests/hx-thumbnail-route.test.ts`.

### Deferred, and out of scope for Mr. Pina

- **Reported, not in this bundle's Owns line**: `docs/standards/IDEA_HTML_ASSIGNMENT_BRIEF.md`, the one file handed to a chat that builds HTML assignments, does not mention the thumbnail field and still says it was condensed from AUTHORING 1.24 and SPEC 1.8; `IDEA_HTML_ASSIGNMENT_TEMPLATE.md` does not mention it either.
- **Per device or per account** is Mr. Pina's call: the Display group is per device today, so the shape follows the device. A cookie copy of the `display` group would close the server-render window on both the home cards and the class page, and is a preference-store change.
- **A replaced or cleared thumbnail picture is not deleted** from `classroom-attachments`; no row names it, nothing serves it, nothing sweeps it.
- **The `CLAUDE.md` section for the slot** (one renderer, the shape is CSS, manual beats manifest, the tile is part of the row link, the parent owns creation and pause) was left to the integrator by the builder; it is the integrator's `POST THUMBNAILS` section, and the `classroom-updates.json` entry is the integrator's too.
- **`_TEMPLATE.html` cannot be imported as a ported document** (the importer refuses it: "never sends idea:ready"), so its thumbnail reaches only documents authored from it and then ported.
- **Pre-existing, unchanged**: in ClassView's narrow pane a meta line whose kind word is hidden starts with a stray space (the hidden `.meta-sep` leaves its `&nbsp;`, ledger 0368); `classroom-palette ... state-palette-at` expects "Notebook in this class" where the row reads "Work, notebook and activity in this class"; the `i-crowded` sweep finds Enlarge's label 1.0px over its edge; themes-shape's list-expand controls read 0 visible at 375 and two `sw-group-label` labels sit under 11px. At 375 the home card header (part 3's region) wraps its fold caret onto its own line in the teacher view.

### Prompt claims that turned out wrong

- "the class page's existing Display settings menu": it is the classroom header's per-person panel, shared by every classroom page.
- "The site's per-user display preferences remember the choice": that group follows the device (`CLASSROOM_PREFERENCE_HOMES.display = 'device'`).
- "every post row has an empty area in front of its title": the area is the checkbox, grip, caret and kind glyph.
- "Through the existing parent bridge the thumbnail receives ... reduced-motion": the existing bridge spoke only to a worksheet and carried only `idea:theme`; the thumbnail messages are new.
- "Pointer events reach the thumbnail" for every thumbnail: impossible across a sandboxed frame without losing click-through; only an `"interactive": true` one takes the pointer, and the rest get it forwarded.
- "the stream, the class work list": there is no separate work list; the class page is the stream, and the to-do page got tiles.
- "add an animated thumbnail to `_TEMPLATE.html` so every future HTML assignment carries one": the file is the legacy template and the importer refuses it as it stands.
- The export named `idea-feedback-2026-10-16T13-43-40.json` is `f3b4136a-idea-feedback-2026-10-16T13-44-08.zip`, a zip of report folders.
- The integrator's note that `thumbnail` might be a gate widening: 0195 never read unknown top-level keys. And the review 2 reading of the missing template as wording only: the tree showed a data problem, fixed in the sync.

## Part 7: the class page header, no dead space between the banner and the class

Squash commit `699455f9` ("Class page: one toolbar row under the banner, so the class starts sooner"). Mr. Pina, with a screenshot: "The space between the class banner and the content of the class is too large." Under the banner the class page stacked the search and kind filter on one row, the closed Videos section on a full-width row of its own, and a teacher's Select all on a third row, each spending a whole line of a projector on one small control.

### What changed

- **One wrapping toolbar row under the banner**: the search, the kind filter (with the status chips, the duplicates door and the filter count that belong to it), a Videos key showing its count ("Videos 7"), and, for a teacher, Select all at the right edge. Opening Videos drops the list into a full-width band under the row; closing it gives the space back. Students get no Select all, as before.
- **Ticking a post turns on a selection mode.** The selection's tray (Publish, File into, Delete, Clear selection) leads the row where the filters were; the search, kind filter, chips and duplicates door step aside, still mounted, and come back as they were, half-typed word included. The narrowed count and the Videos key stay; Select all stays last. Asking for the search while anything is ticked (`focusSearch`, `ClassView.svelte:950`) clears the selection first.
- **On a phone the row wraps with no small key stranded on a line** where the same keys fit in the same number of lines another way, and the server render already draws those lines, so hydration moves nothing.
- **Typing in the search moves nothing on the row.** A key the word takes away (the Videos key, whose videos are the ones the search leaves showing) leaves a gap; emptying the field gives the row at rest. The count and Clear of a narrowed list are a line of their own under the keys.
- **Clear on the count line puts the focus back in the search field** from a key, a mouse or a tap (`clearFilterFrom`, `ClassView.svelte:868`); Clear selection puts it on Select all in the same row (`clearSelectionFrom`, `:1307`). Both used to drop the focus to the page.
- **The row follows each person's page layout.** `find` and `videos` stay two panels a person moves and hides (`panel-layout.ts:109-110`); they join only when adjacent on the same side of the posts and both shown, in that person's order. The bulk controls join only the row directly above the posts; otherwise they are a `.bulk-row` at the top of the posts, as before.
- **Main files.** New: `src/lib/classroom/class-toolbar.ts` (pure: `classToolbars` :71, `toolbarShape` :113, `toolbarCost` :215, `compareToolbarCost` :195, `toolbarLines` :232, `toolbarFit` :316, `heldStarts` :424, `toolbarPinnedLines` :436) and `src/lib/classroom/toolbar-lines.ts` (the `balanceToolbar` action :118, `keyId` :103). Changed: `ClassView.svelte` (`findControls`, `videosKey`, `bulkActions`, `selectAllKey`, `findResult`, `lineBreak` snippets, the `.class-toolbar` rules, the nine `@container class-toolbar` line-break rules), `ClassVideos.svelte` (an `inline` prop, header at :35-53), `plate.css` (`:where(.class-toolbar) .disc-trigger` joined the key lists, so the Videos key is a plate key). Harness: `/dev/class-header` gained `items=class`, `folded=0`, `drafts=0`, `videos=0` and the layouts `videos-first`, `videos-hidden` and `split` (`src/routes/dev/class-header/+page.svelte`, `class-fixture.ts`). No migration; `CLAUDE.md` untouched (no sentence in it became false).

### Load-bearing decisions

- **The search field never changes slot.** Whether the Videos key exists depends on the search, so a row keyed on its first member would rebuild the `<input>` mid-word whenever Videos was arranged first. A toolbar holding `find` always renders in `find`'s slot (`host`, `class-toolbar.ts:77`). Mutating `host` to `run[0]` reddens 3 unit tests and the DOM focus test.
- **Selection mode, not a reserve.** Round 1 laid the tray out at rest, unpainted and `inert`, so a tick moved nothing; review 2 found it left Select all alone on a second line at Mr. Pina's 1223px and squeezed the search to a bare magnifier. Round 2 replaced it: the tray exists only once something is ticked, and the filters are hidden by one rule (`.class-toolbar.selecting :is(.find-field, .find-kind, .find-chips, .find-door)`, `:4466`), safe because `setFilter` already clears the selection. Each changing label holds its longest form in one grid cell (`data-reserve`, sized by `bulkDigits` on the class's item count), and Delete's armed words wrap inside its 44px key, so it is 105px rather than 169.4.
- **Where the ticked row still needs one more line** (a phone, windows about 650 to 876px), the page scrolls by exactly what the row grew. `$effect.pre` reads an anchor before the DOM moves and `$effect` scrolls the nearest scroller (`scrollerOf`) after (`:1392-1438`); the anchor is the control just pressed in the list (`lastPress`), else the list's top. A sticky or floating action bar was rejected as a location change nobody asked for.
- **The lines are planned, never reordered, never more than the plain wrap.** `toolbarLines` is an exact dynamic programme judged in order: lines, lone small keys, a status-chip group split across lines, a lone key on the last line, then closeness to greedy. Adding a line to avoid a lone key was rejected, because it moves the list under the pointer. Pairing the last two keys in a `nowrap` wrapper was impossible: the open Videos band is the `Disclosure`'s own body laid out as a full-width flex item, and a wrapper would hold the band too.
- **The stylesheet draws the plan; the script only corrects.** The row carries `data-shape` (its keys word by word), four empty `aria-hidden` breaks (`.tb-br`) sit where a line may end, and nine container rules show them by shape and width. The rows' lines are spaced by the keys' own half-step margins (`--tb-line-gap`) with `row-gap: 0`, so a break adds no gap. The kind picker holds one width in every class (`8.387rem`, its "Announcements" option, `:4580`) so the thresholds hold. `balanceToolbar` scores what landed and writes nothing when it is as good; otherwise it sets `data-planned` and plans the row itself (two-digit counts, unnamed shapes, the plate off).
- **While a word is in the box the row is held** (`toolbarPinnedLines`): each key known by identity across a remount (`keyId`), the field's width frozen, the room of a key that sat before it kept open (`reserve`), every held line kept while it fits. The accepted cost: a line may hold one key (Select all, or Done) until the field is emptied. A ghost Videos key was rejected: it needed ClassView state and a second rendering of `ClassVideos`.
- **Clear refocuses the search on every device.** Polish round 1 sent a tap to the first non-text key to keep the phone keyboard down; that lit the kind select's focus ring, because Chromium matches `:focus-visible` on a select for any focus. The `coarsePointer` import is gone from ClassView.
- **CSS `order` is used only for the open Videos band**, as in the grading console's header. Tab therefore runs from the Videos key through the open videos before Select all; recorded as a known limit in `ClassVideos.svelte`'s header, because moving the band means moving a node the `Disclosure` renders.
- **The golden moved deliberately and mechanically.** `tests/fixtures/class-view-null-layout-golden.json` had its toolbar span (from the search row's `<div` to `<div class="stream`) replaced by the current render in rounds 0, 1, 2 and the first polish round, each time after checking everything outside the span equal under the test's normalization; the method is written in `tests/classroom-panel-layout-render.test.ts`'s header.

### Audit answers

No audit was asked of this part. The builder confirmed the prompt's picture against `2673393d`: `findPanel` (`ClassView.svelte:2167`) was a `.find` row with `margin: 0 0 var(--space-4)` (`:3714-3719`); `videosPanel` (`:2249`) mounted `ClassVideos`, a section with a 12px bottom margin (`ClassVideos.svelte:113-114`) whose `Disclosure` trigger is `width: 100%` (`Disclosure.svelte:256`), which is why one closed control took a row; the resting bulk bar sat in `streamPanel` (`:2260`, bar `:2289`, `.bulk-bar.resting` `:2858`) with Select all at `:2323`; students have no Select all (`editable`, `:460`).

### Migrations

None.

### Measured

Banner bottom edge to the first unit's top edge, one fixture (the old ClassView from `2673393d` with this part's harness files, against the final tree), identical in IDEA, Matrix and Space White, measured by the final reviewer:

| Viewer | Before, 1440 / 960 / 375 | After, 1440 / 960 / 375 |
| --- | --- | --- |
| Teacher (with a draft) | 188 / 188 / 240 | 68 / 68 / 172 |
| Teacher, no draft (Mr. Pina's screenshot) | 188 / 188 / 240 | 68 / 68 / 120 |
| Student | 130 / 130 / 286 | 68 / 68 / 172 |

- 68 is 12 (`--space-3` under the banner) + one 44px line + 12 (`--space-3` over the first unit). The row is one line from 752px wide (teacher with a draft), 644px (no draft) and 832px (student).
- First tick, real mouse on row 1's checkbox, every 4px from 360 to 1920, both teacher variants: the list moved 0px at all 782 width/variant pairs, and the second click at row 2's old spot gives "2 selected" (the old bar grew 20px on the first tick at desktop widths). Arming Delete and pressing Select all move nothing; Delete is 105.0x44 at rest and armed.
- Server render (scripts off) against hydrated: identical at 133 readings (19 widths from 320 to 1920 x 7 fixtures) and in a 4px sweep from 320 to 1920 over 6 shapes, with the planner writing nothing. Before the first polish round they differed at teacher 360 to 430 and 744, no-draft 600, student 320, 390 to 430 and 744 to 820. The unit test reads the nine rules back and checks them against the planner at 197,286 widths.
- Typing "glossary" and deleting it, 24 cases (three roles, default and videos-first, 375/390/960/1440): 0 key moves in 408 readings and 0 field moves; before the last polish round the kind filter moved on 13 of 17 readings in three of those cases.
- Clear, touch emulation at 390: the focus lands on `stream-search` in all four layouts, with no lit ring on a select.
- Videos band width equals the toolbar's (1262 / 896 / 311 at 1440 / 960 / 375), the first unit sits 12px under it, and closing returns the unit exactly. Videos key 10.46:1 on IDEA; the search field's drawn words 7.37 / 7.91 / 5.87:1 in IDEA / Matrix / Space White. Every key 44px tall; horizontal page scroll 0 everywhere. In Chromium 141's accessibility tree `group "Show by status"` and `region "Videos in this class"` stay exposed under `display: contents`.
- Final runs: `tests/classroom-class-toolbar.test.ts` 58 passed, `tests/dom/class-view-toolbar-mount.test.ts` 14, `tests/classroom-panel-layout-render.test.ts` 8; the five typing specs 10 runs, 0 outside threshold (3 outside with the earlier toolbar code behind them, the negative control). Mutation proofs killed: the `host` rule, the bulk rule (`abovePosts && atEnd` to `atEnd`), scroll compensation off, four line-break rule mutants (two thresholds, a deleted rule, the split term forced to 0), the field-line-only hold, the round-1 hold, and the `coarsePointer` Clear branch; every file restored from a copy by md5. `svelte-check` held at 0 errors, 33 warnings, 18 files every round.
- Part 6 changed the rows of the same `ClassView.svelte` in another worktree; the two merged without conflict, and the class page golden test, the toolbar tests and the thumbnail tests pass together (119 tests).

### Refinement rounds

- **Review 1**: 0 blocker, 1 wrong, 1 confusion, 2 polish. Fix 1: laid the tray out at rest, unpainted and `inert`, with `data-reserve` labels, so the first tick moved nothing; the search field drew its own words (`.find-ph`) instead of losing its placeholder while ticked; File into capped; the Tab order through open videos recorded as a known limit; a wrong before figure corrected.
- **Review 2**: 0 blocker, 1 wrong (Select all alone on a line at 1223), 2 confusion (arming Delete moved the bar up a line; a phone tick moved the list 156px), 1 polish. Fix 2: selection mode instead of the reserve, constant label widths, Delete's armed words wrapped in its key, scroll compensation, the kind well's 1px edge taken back so the row is 44 (68 rather than 70), the search's 10rem minimum restored.
- **Review 3**: 0 blocker, 1 wrong (Select all or a student's Videos key alone on a line at phone and tablet widths), 2 polish (one out of scope). Fix 3: the `toolbarLines` / `toolbarFit` planner and `balanceToolbar`; search basis 9.25rem; Clear selection focuses Select all.
- **Review 4**: clean, 5 polish (lines rearranged at hydration; the field halving under the caret on a phone; a student's chips split at iPad widths; a wrong note about font loading; the unit header, out of scope). Polish round: the stylesheet draws the plan (`data-shape`, `.tb-br`, nine rules, `--tb-line-gap`, the fixed kind width) and the planner only corrects; the typing hold; the chip group kept whole.
- **Polish review 1**: 0 blocker, 1 wrong (a returning Videos key took a line of its own and kept it after Escape), 1 confusion (videos-first: the field slid sideways while typing), 2 polish. Polish round 1: `keyId`, `heldStarts`, the `reserve`, a held line above the field kept open, Escape and Clear end the hold, Clear hands the focus on, the hold kept while a selection hides the field.
- **Polish review 2**: clean, 3 polish. Polish round 2: every held line kept so no key moves while typing; Clear refocuses the search on every device.
- **Final review**: no blocker, wrong or confusion. Remaining:
  - ACCEPTED: after a width change mid-word (a phone rotated while a word is in the search) in the videos-first layout, the field moves on each keystroke that brings back or hides the Videos key (52px down for a student at 667 to 375, 146px sideways for a teacher at 1440 to 1200), not only once, until the search is emptied. A width change is a new layout and this is an edge case. The commit before the last polish round behaved the same, and a teacher in the default layout at 1440 to 1024 no longer moves.
  - RESOLVED here: the before figures in earlier notes did not reproduce; the table above is the final reviewer's one fixture.
  - REPORTED, out of scope and pre-existing: at 375 a unit's name stacks letter by letter ("UNI T 3", then U / N / I / T / 3) while Deselect all and File here show in its header. Unit columns are not part 7's region.

### Not verified

- Real phones, iOS Safari, Android, Firefox and any WebKit: none in the container; Chromium 141 only. So whether a phone's keyboard comes back when Clear refocuses the field, how iOS reports `pointerdown` on a checkbox tap (the scroll anchor), and `focusVisible: false` in a browser that honours it are unmeasured.
- Screen readers (VoiceOver, and which event detail a screen reader's Clear sends).
- The signed-in `/classroom` route: only `/dev/class-header` and `/dev/classroom-split` were driven; the `/` palette shortcut was exercised only through `runCommand('class.search')` in a DOM test.
- Rows the nine rules were not measured on (two-digit counts, a duplicates door, the plate off, a cold-cache font swap): the planner corrects them at hydration, so such a row can still move once on load; checked only through the planner's own tests.
- The typing specs dispatch input events (the harness has no keyboard step); the builders' scripts used real keys. `prefers-reduced-motion: reduce` was not exercised (nothing here animates).
- The part wrote no `tools/browser-verify/measured/` file for its 15 `class-header-view-class-items-class*` specs; that is the integrator's `npm run verify:readme`.

### Deferred, and out of scope for Mr. Pina

- When teams are posted, the collapsed "All teams" row (`ClassTeams.svelte`, the section layout's `teams` panel) is still a full-width row between the banner and the toolbar (report a6a037f3's second screenshot shows it). Making it a key in the toolbar would finish this job; it is not part 7's surface.
- The unit header's letter-by-letter name at 375 (above).
- `ClassVideos` cards: a long "Posted in" title wraps so its first line sits above the word (pre-existing, visible in the open band).
- Accepted limits: the Videos key shifts sideways on a tick (nothing under the pointer moves); below about 344 to 360px a lone key is unavoidable and is kept off the last line; with the toolbar moved below the posts the bulk row holds Select all alone at rest.
- Browser specs that fail on the tree before this part too: `classroom-palette` `state=palette-at` (wants "Notebook in this class"), its `settings-help` (11 tips against 10; part 6 edits that spec), the `classroom-tour` Narrower floor, the `view=class-bulk` no-units spec at 375 (a cold-server click race), and `view=class-teacher`'s `new-post` click. The `i-crowded` item page's "Enlarge" control-fit reading was not checked against the earlier tree.

### Prompt and record claims that turned out wrong

- "The Plate's spacing tokens": `plate.css` has no spacing scale (only `--plate-led-gap`); the tokens are the design system's `--space-*` in `src/lib/design-system/effects.css:34-41`. The part uses `--space-3` and `--space-2`.
- Earlier figures superseded by the table above: the student's before at 375 (234, measured 286), the no-draft teacher's before at 375 (round 1 "confirmed" 188; it is 240 on the final fixture, where All kinds sat alone on a row), and an after of 70 (68 since round 2's kind-well fix; a stale "70px" stylesheet comment was corrected).
- The accepted rotation item was first recorded as moving the field "once"; it moves on every Videos-key change until the field is emptied.
- Round 3's note that `document.fonts` `loadingdone` never fires in the harness was wrong: only `fonts.googleapis.com` is blocked, and the `@fontsource` faces load locally.
- Two reviewer details: the toolbar row is 896px at 960, not 893; and the lit ring after a tap on Clear in round 1 was the kind select's, not the Videos key's.

## Integration review: the parts together

Every part had a clean review alone, and none of those reviews could see the
parts together on the surfaces they share. The merged branch went through its
own review. The first attempt (2026-10-17 morning) ran no agent at all: every
one of the four reviewers came back with the account's weekly usage limit, and
Mr. Pina asked for it to be tried again. The second attempt ran.

**Round 1.** Four reviewers, read-only, on separate ports:

- **The class page** (parts 5, 6 and 7): 144 loads across both roles, three
  widths, three themes and four shapes.
- **The home page** (parts 1, 2, 3, 5 and 6).
- **The per-student page and the feedback window in every room** (parts 1, 4 and 5).
- **A completeness critic**, which checked every requirement in the prompt
  against the tree.

They found 10 findings serious enough to fix and 11 polish. A fixer on the
merged tree then committed eight fixes:

- **The class page's last row ended under the corner button above 1024px.**
  This hit every width from 1024 to 1920, for a teacher and a student. The
  pane's 64px foot clearance landed partway through the content, because
  `split.css` caps every direct child of the pane at the pane's height and the
  class page overflowed it. `ClassView`'s root now opts out of the cap, as
  `ClassTeams` already did. At 1440x900 the last row went from 13px under the
  button to 42px clear (`075eacdd`).
- **A popover could open under the corner button**: a row menu's Unit select,
  and on phones the student page's Sections menu, whose Show all and Done were
  hidden and whose Done tap opened the feedback window instead (a blocker).
  - The cause is one: a panel placed by `$lib/shell/anchored` lives inside
    `main`, whose stacking context paints under the root-level button.
  - The button's wrapper now carries `data-corner-reserve`, and
    `anchorPosition` takes an `avoid` box. The action reads the box live and
    keeps clear by default (`keepClear: false` opts out). The Sections menu
    measures its room below with `clearBottom` (`b0d9525b`).
  - Row menus: 0 of 167 covered, against 3 with the attribute removed as a
    control. Sections menu: 0 of 56 bad placements, against 24 of 56.
- **The one-time install pop-up on iPhone, iPad and Android covered the corner
  button**, so the only feedback control on the page could not be pressed. The
  home tour's Send feedback step also ringed the pop-up. The pop-up now sits
  above the button's clearance (`eb5ef83f`).
- **Home class cards did not match the class page's generated look.** No unit
  tint was drawn in any shape, and Tile and Off used an older glyph set, so a
  post's icon changed with the shape.
  - The owed-work load gained an opt-in units read: one `classroom_units`
    query, skipped while nothing is filed. The home page takes it and the to-do
    page does not.
  - Every home row now draws `KIND_GLYPHS` with the class page's `unitTint`
    (`f56789db`). `tests/home-classroom-load-budget.test.ts` pins the read at
    0, then 1.
- **Polish fixed:**
  - Hovering a Wide or Banner home row no longer shrinks its picture (`306b7744`).
  - The home tour has an Install app step (`34799690`).
  - The tab icon README states the Live decision as it was made, with a note
    that saving also blinks per the build list (`14cd07df`).
  - `CLAUDE.md` names the corner reserve (`9e223f24`) and the shared home and
    class look (in `f56789db`).

A confirming reviewer then measured each fix:

- **Fixed:** F1 (28 combinations, 0 controls under the button), the row
  menus (0 covered in 324 menus over five sizes), F5 (84 placements, Show all
  and Done whole every time), F4, and the regression re-runs: 1616
  measurements, 2 outside, both the pre-existing tour spec below.
- **Left:** one wrong and two polish, which went to round 2:
  - The feedback window opened UNDER the install pop-up, hiding Send and
    Cancel on an iPad.
  - The Sections menu opened upward from the window's bottom edge clipped 8
    to 9px of Done.
  - In landscape-phone windows a row menu could cover its own key.

**Round 2.** A fixer committed three changes:

- **The install pop-up steps aside while the feedback window is open**
  (`05fde841`). It is the same rule it already used for the Install app key's
  card, now `stepInstallPopupAside` and `installPopupAside` in
  `$lib/install-app`, and it comes back, not dismissed, when the window closes.
  Painting the window above the pop-up was rejected because it would also bury
  GAUNTLET's custom cursor layer. Before the fix 48 of 527 probes of the open
  window's controls landed on the pop-up; after it, 0.
- **A panel opening above its key keeps clear of the corner button too**
  (`0f2cdf58`). `anchorRooms` is the one statement of both rooms, and the
  Sections menu sizes itself by it instead of a copy. Probes hitting the button
  went from 32 of 504 to 0.
- **A menu with no room above the button moves beside its key, never over it**
  (`cef8aa6f`). Menus covering their own key went from 50 of 218 to 0, and the
  confirming reviewer found 0 in 642 opens.

Two browser batches (113 specs, 3,442 measurements) came back with 0 outside
threshold. The confirming reviewer passed all three. A regression sweep of
every caller of the anchored action and of `anchorPosition` found two wrong
and three polish, which went to round 3:

- **Wrong:** the Quick note panel was placed while its editor was still
  loading. It grew 104px afterwards, so in short windows it opened under the
  button and then jumped over its own key on the first scroll.
- **Wrong:** IdeaCAD's right-click menu and the other direct `anchorPosition`
  callers got no corner reserve.
- **Polish:** the pop-up covered the Quick note's Save on 320px phones.
- **Polish:** the pop-up stayed hidden for good if the feedback window's code
  failed to load.
- **Polish:** an install spec's tour-close step settled too early.

**Round 3.** Five fixes:

- **A popover follows its own size** (`08840247`). The anchored action
  re-places a panel when the panel's own box changes size, and ignores a scroll
  that happens inside the panel. On every placement it writes `--anchor-room`
  (`anchorFitHeight`): the tallest the panel may be beside its key without
  reaching the button. A loop guard stops following resizes after four
  sideways placements in a row. Proved with a deliberately oscillating panel:
  224 style writes in 2s without the guard, 12 with it.
- **Every direct `anchorPosition` caller keeps clear of the button too**
  (`0c760583`): IdeaCAD's right-click menu, tree row menu, command search and
  context toolbar, and the grading roster card, through `anchorInWindow`.
  `tests/anchored-direct-callers.test.ts` fails on a call that leaves the
  reserve out.
- **The install pop-up also steps aside while the Quick note is open**
  (`e188851e`).
- **A feedback window that fails to load lets go of the pop-up**
  (`dad53746`). Before, `open` stayed true for good; the deploy-reload hold it
  also held is released with it.
- **The install specs' tour-close step waits for the tour it closes**
  (`25ee60df`).

21 mutants across the five were all killed. The fixer's spec runs gave 1
outside threshold in 4,444 measurements: `post-thumbnails-view-editor-editdoc-refused`
read "frames 1", and it flakes on the round-2 tree too. The confirming reviewer
passed all five. A sweep found three wrong and two polish, which went to
round 4:

- **Wrong:** the image popover in the rich-text editor now covered its own key
  on short phones, and was not given the new room cap.
- **Wrong:** the home page's Quick note panel was placed against the blurred
  home header rather than the window, so it did not follow a page scroll
  (pre-existing, on a panel this bundle reworked).
- **Wrong:** Chromium never retries a failed dynamic import, so the failure
  sentence's "press it again" could not work.
- **Polish:** that sentence was drawn under the install pop-up.
- **Polish:** the room cap shortened a panel where a short sideways move
  would have kept it whole.

**Round 4.** Six commits:

- **A panel taller than the room beside its key scrolls inside rather than
  covering the key** (`5ea8dcd5`). The rich-text editor's image popover, the
  class page's row menu, IdeaCAD's Views menu, the Archived list and the code
  census panel cap their height with `--anchor-room`.
  `tests/anchored-room-cap.test.ts` holds every `use:anchored` panel to the cap
  or a stated reason. InfoTips and the grading level tip are exempt, because
  they take no pointer, and the Install card is exempt at 182px.
- **The home header's panels are placed against the window again**
  (`9e2135d2`). The plate made the home header scroll with the page and paint
  an opaque face, so its `backdrop-filter` blurred nothing anybody could see.
  Its only effect was to make the header the containing block for the Quick
  note and the code census panels, which then drifted off their keys on a
  page scroll. `plate.css` drops the filter from the header it unsticks. The
  header differs from before by at most 5/255 on 238 of 92,160 pixels at 1440
  on IDEA.
- **A feedback window that did not load says to reload the page, with a 44px
  Reload page key** (`c7e8949a`). Chromium caches a failed dynamic import, so
  pressing again could never work, and a refetching retry would need the
  hashed chunk name at run time, which the build does not provide.
- **The install pop-up steps aside while that sentence is showing**
  (`e020be7a`). If the load keeps failing and nobody reloads, the pop-up stays
  away for the rest of the visit, with the sentence on screen saying why.
- **A panel that crosses the corner by a little moves beside its key before it
  is shortened** (`e89c8590`). `anchorFitHeight` and `besideCorner` share
  `sidewaysColumns`, so the cap and the placement agree.
- **`CLAUDE.md`** names the room cap and the containing-block trap (`dbc647c0`).

The fixer killed 11 of 12 mutants. The survivor, a launcher building no key,
is caught by the handout browser spec, which reddened on it. Spec runs: 496
runs and 7,752 measurements. The outside-threshold readings were 5 from a
class-teacher editor spec that passes alone, 56 from the changelog specs, and
2 from `/dev/feedback?view=incidents`, which fails identically on the tree
before the round. The changelog specs expect 150 rows, and this container's
checkout has 84 commits of history.

**The loop stopped here, by the integrator's call and not because a review
came back clean.** Round 4's own confirming review and sweep were stopped
before they reported. Each round had been finding smaller things, often in
the previous round's own fixes, and the session had run for more than a day.
Instead, the integrator re-measured the 52 browser specs whose behaviour the
rounds changed (results below).

**Found in round 4 and not fixed, for a later bundle:** in a short window a
row menu that opens upward is partly drawn under the classroom header (at
1280x400 its Edit and Pin rows hit-test as the header). It predates the round.
Keeping clear of the header as well as the corner button is a design call.

**Pre-existing, found by the integration reviewers and not changed:**

- A long Quick note scrolls its title, Close, toolbar and Save out of view.
- Opening the Quick note leaves focus on the Note key, so Escape does not
  close it.
- Right-clicking IdeaCAD's Origin row throws in `normalTarget` (`sketch/model.ts`).
- The install pop-up covers the lower rows of an anchored menu until it is
  dismissed (deliberate per `install-app.ts`: a passing menu does not ask it to
  step aside).
- `post-thumbnails-view-editor-editdoc-refused` flakes.

## For Mr. Pina

**Calls that read the prompt one way and could go the other.** Each one is
built, measured and kept for the reason given in its part's section. Each is
yours to confirm or reverse:

1. **The framed feedback window closes on DONE, not the instant SEND lands.**
   On the Coin Ledger and the assignment handouts, SEND shows the home box's
   own "Thanks, that went through." with Send another and Done. Done closes the
   frame and hands focus back to the button, and Escape closes it at any time.
   The home box is the official window and behaves this way, so the framed copy
   does too. The prompt's sentence "it closes on submit and on Escape" read
   literally would close it before the thanks.
2. **The thumbnail shape is remembered per device, not per account.** The
   Display settings group follows the device, so a teacher who picks Banner on
   the projector's computer still sees their own choice (or the class default)
   on a laptop. The prompt says "the site's per-user display preferences
   remember the choice". Moving the shape to the account is one line in
   `src/lib/preferences/classroom.ts` and would make every device share it.
3. **An interactive live thumbnail keeps its own clicks on the class page only.**
   The home page's class card rows and the to-do rows mount the slot inside
   the row's own link (`passive`). A control inside another control's link is
   the defect, so there an interactive thumbnail is inert and every click opens
   the post.
4. **Ticking a post on the class page puts the toolbar in a selection mode.**
   The tray (Publish, File into, Delete, Clear selection) takes the place of
   the search, the kind filter, the status chips and the duplicates door until
   the selection is cleared, and `/` (or the palette's class search) clears a
   selection before focusing the search. The prompt says "nothing is removed
   and no control changes what it does". The first build kept everything on
   the row and left Select all stranded on a line of its own at 1223px, which
   is why it changed.
5. **The Install app key wraps some headers when it arrives.**
   - A signed-in student with one class: +60px from 625 to 675px wide.
   - With two classes: +60px from 525 to 560px.
   - Signed out: +41.9px from 320 to 350px.

   The key exists only once the browser offers to install. Reserving room for
   it would leave a hole for every Safari and Firefox user. 375px, the
   prompt's own test, does not wrap.
6. **Under reduced motion, saving on a Home page looks the same as resting.**
   The lit saving lamp is the resting mint hub in the drawing you chose, and
   changing that is a drawing change: a new board and a new golden fixture.

**The two products that keep their own feedback**, as the prompt decided:

- **GREENLINE.** Its own box shows focus only as a faint border; one
  `--fb-focus-ring` line in its override would fix it.
- **VANGUARD.** Its injected look-alike panel stays, woven into the game,
  beside its older in-game composer, so the game has two feedback controls.

**Two places where the corner button is not simply in the corner:**

- **The deck in full screen draws no button**, because the full-screen element
  is the stage. Exit full screen to report.
- **On the grading console at 960** the Return dock passes under the button
  for about 100px of scroll at the top. A bottom-sticky dock cannot rise above
  `.grade-main` without breaking the dock rule in `CLAUDE.md`.

**Signals the tab icon does not show, and why** (also in
`docs/design/tab-icon/README.md`):

- **Attention, or your turn:** no such signal exists. Nothing marks a match
  called for a player, and the classroom has no resubmit-requested state.
- **Running timers** (GAUNTLET's run clock, the certification exam countdown,
  the Live tab's class timer): no clock state was designed. A clock-driven
  repaint breaks the reduced-motion rule, and the exam's tab is one a student
  may not leave.
- **The live class:** there is no in-session state.
- **Recording:** the browser draws its own microphone indicator.

**Lists not given thumbnails** (the reasons are in part 6's audit answers):

- the Grades tab and the grading console
- one student's page
- the Live tab and the projector
- the class Videos panel and the header's Next due key
- the command palette
- the progressive feedback inbox
- the notebook and its review console
- My Classes, the archived list and the class strip
- duplicate drafts
- the updates page

**Found outside this bundle's surfaces; reported, not changed:**

- **The HTML assignment brief does not mention the thumbnail.**
  `docs/standards/IDEA_HTML_ASSIGNMENT_BRIEF.md` is the one file handed to a
  chat that builds HTML assignments. It still says it was condensed from
  AUTHORING 1.24 and SPEC 1.8. `IDEA_HTML_ASSIGNMENT_TEMPLATE.md` does not
  mention it either.
- **At 375 a unit's name stacks letter by letter** ("UNI" / "T 3") once a row
  is ticked. The File here key from ledger 0383 squeezes the label to 27px.
- **The collapsed "All teams" row** is still a full-width row between the
  banner and the toolbar when teams are posted. Making it a toolbar key would
  finish part 7's job.
- **VANGUARD's tab shows the browser's default icon**: its document declares
  none, and `/favicon.ico` answers 404 (measured). The two FSP static decks
  hit the same 404.
- **`tools/idea_icon_gen.py` produces nothing the site serves** and is a
  deletion candidate.
- **The home feedback box has an Escape gap**: Escape while the box's code is
  still loading does not cancel the open. It is a one-line fix in
  `SiteFeedback`'s keydown.
- **The signed-out home tour draws over an open feedback box** (z 1100 to 1102
  against 120).
- **FRC and FSP pages' own controls** use the site ring `#5abda8`, which
  measures 2.00 to 2.26:1 on their paper.
- **The enlarged Lightbox still stops at the ends**, where the student page's
  strip now wraps both ways. It is a site-wide rule.
- **Dead CSS:**
  - `.legacy-index .course-header.collapsible` and
    `.legacy-index button.course-header` in `src/app.css`
  - `.cr-header .sfb-trigger` and `.sfb-word` in
    `src/lib/classroom/plate.css`
  - `.vnav-shell` in `SolidWorkspace.svelte`
  - `#idea-ledger-report-btn` in the frozen Ledger HTML, which needs an
    unfreezing to remove
- **`CodeCounter`'s breakdown panel** slides under its chip on scroll, and
  Escape does not close it from the chip.
- **A pre-existing browser spec fails on `main` too.**
  `classroom-tour-s-1-item-i-missing-manage-0-tour-offered` expects an 18rem
  list floor against `NAV_WIDTH_MIN_REM` 16 (ledger 0383).

**The six reports** this bundle answers: bd38fa25, 08bafda7, 169b931d (the
per-student page), 0fe82a80, 80bb4d23 (the feedback window) and a6a037f3 (post
thumbnails). No session can sign in to production, so they were not marked
reviewed. Mark them from `/admin/feedback`.
