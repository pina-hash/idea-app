# Phase 0 audit, ledger 0297

- Written: 2026-09-23, before any build work, as `OVERHAUL_0297.md` section 2 requires.
- Tree: branch `claude/bold-archimedes-x146d0`, started from `33849402` (equal to `origin/main` at start; ledger 0296's IdeaCAD overnight run had already landed there). Working directory `/home/user/idea-app`.
- Method: six read-only auditors (shell, themes and home; student surfaces; teacher surfaces; notebook; reliability and deploy safety; claims, preferences and shortcuts), each driving the real components through the `/dev` harness routes on its own Vite server in the container's Chromium 141 at 1440x900, 1366x768, 960x900 and 375x812, rasterizing and looking at the states it scored. About 450 screenshots and the driver scripts are in the session scratch directory (`phase0/<auditor>/`); they are not committed. The friction lines they found are `FRICTION.md`; the scores are `MATURITY.md`.

## 1. Baselines on the untouched tree

| Instrument | Command | Result |
|---|---|---|
| Type check | `npx svelte-kit sync && npx svelte-check` with a placeholder `.env` | **0 errors, 37 warnings in 20 files**: 31 `state_referenced_locally`, 5 `css_unused_selector`, 1 `perf_avoid_nested_class`. Matches `CLAUDE.md`. |
| Test suite | `npm test` (summary line and stderr read, not the exit code) | **573 files passed (573), 10861 tests passed (10861), 0 failed, 0 skipped**, 1411s. `tests/identity-style-shared.test.ts` passed 28 of 28 (see claim 1 below). |
| Build | `npm run build` | Succeeds in 50s on Node 22; output deleted afterwards (`CLAUDE.md`'s 440MB trap). |
| Harness counts (static) | `npm run verify:counts -- --check` | Agrees with the tree: 287 route specs, 103 routes, 129 `/dev` pages, 574 runs. |
| Harness counts (measured) | the committed `measured/` sum | 287 specs measured at `165f36d`, 574 runs, 10298 measurements, **226 outside threshold** (the baseline this run is compared against). |
| Production weight | `node docs/classroom/overhaul-0297/tools/weight.mjs` after a build (static imports only, gzip 9) | Class page JS 798.8 KB (256.3 KB gz), CSS 208.4 KB (42.2 KB gz). Item page JS 1057.7 KB (343.2 KB gz), CSS 281.9 KB (56.1 KB gz). Home JS 532.8 KB (167.9 KB gz). Notebook JS 674.7 KB (215.7 KB gz). Plus the masthead logo, a 2,024 KB and a 518 KB PNG drawn at 104px on every classroom and notebook page. |
| Dev page weight | the reliability auditor's `weight.mjs` on `/dev/classroom-split/s-1` | 231 requests, 11,245 KB (dev, unbundled; not a production number), hydrated at 783-813ms warm. |
| Node | `node --version` | v22.22.2 in this container. CI pins Node 24, which the container does not have (`/opt/node20`, `21`, `22` only). |
| Production | `curl https://ideabosco.com/` | **Unreachable from this container**: the egress proxy answers 403 to `CONNECT ideabosco.com:443` (measured by two auditors). The served version cannot be read here, so the ship step must say so rather than claim a deploy (brief section 9 step 5). |

## 2. Claims in the brief, checked

142 statements were checked against the tree: 84 true, 30 partly true, 7 false, 2 unverifiable from here. Every one that is not plainly true is listed in `CLAIMS.md` beside this file with its evidence. The ones that change the plan:

1. **`tests/identity-style-shared.test.ts` does not fail on `main`.** It did at `bf04a223`; commit `82721563` pinned its reference to `f9d43b49^` and it passes 28 of 28. The record of the expiry is `docs/history/gracious-ride-cdf7jw.md`, not `new-session-avpli9.md`. Section 9 step 4 has nothing to fix unless `main` regresses.
2. **Migration 0226 is not held by ledger 0296**; 0296 wrote no proposed SQL and released it. 0225 is unused (ledger 0285 has no entry on any ref). This run still takes only 0227, as instructed.
3. **Ledger 0296 has landed on `main`**, so `docs/ideacad/VISION.md` and `IdeaCadMark.svelte` are on this tree; there is nothing to fetch from `claude/gracious-ride-cdf7jw`.
4. **Panes are not bounded by `100vh - --cr-chrome-h`.** The room is `100dvh` and the chrome measures itself (`split.css:264-285`); `--cr-chrome-h` is dead for the classroom.
5. **A photographed page costs 3 taps (in-app camera) or 4 (native camera), not five**, and the desktop composer is open on load (no "New entry" first). The real capture defect is the one the brief names last: photos live only in memory until Turn in.
6. **A failed lazy chunk does not white-screen.** A failed route chunk renders the root error page inside the app chrome; a failed editor chunk leaves a dead editor. What is lost is state (an open composer) and a working input.
7. **`IDEA_INTERFACE_STANDARDS.md` "2.12" is a version, not a section.** The 24px-floor-by-named-class rule is section 10.
8. **Several "missing" things exist in part**, as the brief warned: the home feed already shows per-class "N need attention" and "N to grade"; the Grades tab already labels "resubmitted after grading"; 0090 instructor-only materials can hold hidden grading standards today; the class page already shows check-in status and an outstanding count beside "My notebook"; IdeaCAD (0296) ships a command registry and palette (not importable here: it pulls in the sketch engine); the notebook already has a search box; `planDeck` lets the uploader pick among several root pages rather than refusing.
9. **Teams have no student surface** although the post acknowledgement tells the teacher "The whole class can see these teams" (`PeoplePanel`).
10. **The v3 ported HTML and v4 IdeaCAD item pages never show a returned grade or the teacher's comment**, though the payload carries both (`transports.ts:1276-1311`); and a v3 assignment has no local draft mirror.

## 3. Task runs from nothing (brief section 2 step 4)

Action counts measured in the harness. The full table with stalls is in `CLAIMS.md`.

| Task | Persona | Now |
|---|---|---|
| Find what is due today and what is missing, all classes | Student, 1366 / 375 | 3 / 5 actions from the site home (feed below the fold at y=917 / y=1422); **cannot be done inside `/classroom`** (about 13 actions by eye across three classes). No "Missing" anywhere; an overdue unstarted item reads "Not started" like a future one. |
| Open today's assignment, photograph two pages, write two sentences, turn in | Student, 375 / 1366 | 12 taps plus 4 swipes (iOS) / 10 clicks plus 2 scrolls; lands in a separate app; photos not stored until Turn in; afterwards "Home" goes to `/`, not back to the assignment. |
| Find the rubric before starting | Student, 1366 / 375 | 7 actions for v1 (rubric is the last card, below Submit); **cannot be done** for v3 ported HTML. |
| See a returned grade and read the feedback, on a phone | Student, 375 | About 7 actions for v1 (comment 1065px below the grade); **cannot be done** for v3 and v4. |
| Agenda on the projector, 10-minute timer, who has not opened / gone idle, one hall pass, nothing private | Mr. Pina, 1440 | **Cannot be done**: no agenda, clock or timer exists; presence lives only inside the grading console, which is private; the manager hall-pass chip names the student. |
| Post one material to three IDEA209H sections, scheduled tomorrow, with a check-in | Mr. Pina, 1440 | 12 clicks plus 5 typed fields, all first-attempt. The check-in's unit, day and name start empty. |
| Grade twenty HTML submissions, then the day's notebook entries, no menu between | Mr. Pina, 1440 | 10 keys per student; Return does not advance and N stops on "Not submitted" rows; the notebook half is 3 navigations into a separate app. |
| Find every ungraded or resubmitted piece of work, every class | Mr. Pina, 1440 | At least 20 actions and a hand tally; `/classroom` itself shows no counts; resubmissions unlabeled on home. |
| The last three, unaided | Mr. Cosso, 1440 | Finds the hall pass and the Grades tab; never finds presence, keys, or where the notebook is reviewed. |

## 4. Maturity at Phase 0

See `MATURITY.md`. Lowest is **1**, held by five areas: live class and the teacher at the front; notebook integration; search, palette and shortcuts; customization and preferences; learnability. Creation and grading sit at 3, two above the lowest, so they get defect fixes only until the lowest reaches 2.

## 5. The plan

### Order

The foundation lands first because nearly everything else reads it: deploy safety (F6) because nothing ships without it, the theme layer (F1) because every later surface is measured under both themes, then preferences and the command registry (F5, F3) because customization, search and learnability are three of the five lowest areas and all three read them, then the notebook inside the classroom (F4, the lowest area the vision names first), with layout and density (F2) and the named defects beside it. Catch-up rounds then take the lowest areas in turn: the live class and the projector, the student to-do, the item page seeds (returned feedback on v3 and v4, lightbox and gallery, inline video thumbnails, drop refusal), the teacher walkthrough, and, once nothing is below 2, grading depth (carousel, one needs-attention queue, comment bank).

### Rounds and work packages

Each work package is one build agent in its own git worktree, committing to its own branch; the orchestrator reviews, merges into `claude/bold-archimedes-x146d0`, runs the touched tests and `svelte-check`, and pushes after every round, so an interrupted run leaves landed work. At most three run at once (four CPUs), and two only when their file sets overlap.

| Round | Package | Owns (single writer for the round) |
|---|---|---|
| 1 | **F6 deploy safety** | `svelte.config.js`, new `src/hooks.client.ts`, `src/routes/+error.svelte`, `src/lib/save-guard.svelte.ts`, new `src/lib/shell/deploy-safety.ts` and `DeployWatch.svelte`, `src/routes/+layout.svelte` (mount), hold registrations in `file-upload.ts`, `deck-upload.ts`, the section layout's composer and the notebook upload transports, the editor chunk-failure fallback in `RichTextEditor.svelte` / `NoteEditor.svelte`, `/dev/deploy-safety`, its tests and spec. |
| 1 | **F1a Space White core** | `src/lib/theme.ts`, `theme.svelte.ts`, `src/lib/design-system/**`, `src/app.html`, theme handling in `src/hooks.server.ts`, `tests/theme-*.test.ts`, `/dev/themes`, the projector washout model in `tools/browser-verify/checks.mjs` and the theme specs, `ProfileMenu.svelte`'s theme rows, a new `src/lib/shell/ThemeSwitch.svelte` mounted once in `ClassroomShell`'s header. |
| 2 | **F1b the sweep and the banners** | Component styles that assume a dark ground across the classroom, notebook, shell and home; the theme and banner rules in `src/app.css`; `src/routes/+page.svelte`'s hero; `src/lib/brand/**`; `AppLauncher.svelte` theme treatment; `ClassroomMark` and `NotebookMark` redesigned in place; the other rooms measured and scoped. |
| 2 | **F5 + F3 preferences, registry, palette, search** | New `src/lib/preferences/**` store (read-then-merge over `profiles.preferences`, no migration); new `src/lib/shell/commands.ts` and palette component; the grading and review key tables moved into modules without changing them; search and filter inside a class; the existing preference writers moved onto the store. |
| 3 | **F4 the notebook inside the classroom** | `src/lib/notebook/**`, `src/lib/notebook*.ts`, `src/routes/notebook/**`, new notebook routes under `src/routes/classroom/**`, `nav.ts` tabs, capture from the item page, upload-on-take, the old URLs kept, the masthead and plate picker retired with stored ids mapped, the entry frame consolidated. |
| 3 | **F2 layout, density and the named defects** | `classroom.css`, `split.css`, `ClassroomShell.svelte`, the measure tokens, People, Grades, Duplicates, the item page's width and title, the stream's column void, the floating Voice and Report controls docked into chrome on classroom and notebook pages, class icons in the banner (report 26), back controls top-left (report 34), the instructor density class. |
| 4 | **Live class** | New projector route and teacher control surface, timer, agenda, a students-by-work grid from existing presence, hall-pass status in student-scope words. |
| 4 | **Student to-do** | A To-do inside `/classroom` (Assigned, Missing, Done by week), an overdue tone in the stream, a due view in a class, doors from the switcher and My Classes. |
| 5 | **Item page seeds** | Returned feedback and the rubric before starting on every engine, a classroom lightbox with zoom and download, an image-zip gallery through ordinary attachments, inline video thumbnails with no new outbound fetch, drop refusal (report 21). |
| 5 | **Learnability and grading depth** | A never-blocking teacher walkthrough on `SpotlightTour` for Mr. Cosso; prose instructions replaced by controls and registry tooltips; then, if nothing is below 2, the grading carousel, one needs-attention queue, and a per-teacher comment bank in the preferences store. |
| 6 | **Phase 3 friction loop**, then **ship** | Whatever `FRICTION.md` and new task runs surface, until the budget calls for shipping. |

The orchestrator is the single writer of `classroom-updates.json` (appended last), `CLAUDE.md`, the standards documents and their `REGISTER.md` rows, `docs/classroom/**`, and the history entry.

### Rules every package carries

No migration and nothing under `supabase/migrations/`; schema a seed genuinely needs goes to `0227_PROPOSED.sql` in this directory. Nothing under `src/lib/ideacad/**`, `src/routes/ideacad/**`, `docs/ideacad/**`, `IdeaCadMark.svelte`, the IdeaCAD launcher entry, `.github/workflows/**`, `vercel.json` or `materials/**`. Every existing URL keeps working; no work is lost; stored preferences, plates and themes from before this run load and resolve to something changeable. Student surfaces hold 44px; the 24px floor is declared by a named class on an instructor surface's root. Every changed surface has a `/dev` harness mounting the real component and a browser-verify spec at 375 and 1440 at least (plus 1366, 960 and the 1280x800 projector profile where they are the point), and is rasterized and looked at. Mutation proofs for the load-bearing behavior, restored from a hashed byte copy, judged by the summary line and stderr.
