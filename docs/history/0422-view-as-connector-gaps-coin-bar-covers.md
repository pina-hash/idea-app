---
title: "View as and act as, test student accounts, every open connector gap, one IDEA Coin bar with a coin home, and Foundry covers (ledger 0422, migrations 0288 to 0292)"
date: 2026-10-21
branches: [main]
migrations: ["0288", "0289", "0290", "0291", "0292"]
subsystems: ["Portal shell", "IDEA Coin economy", "Foundry", "The IDEA Website connector", "Classroom", "Profiles", "Browser harness", "Testing"]
---

Ledger 0422, a scheduled solo session. Five tasks in the order the prompt set.
Each was built, checked and committed on its own.

**NOT DEPLOYED, AND NOT PUSHED.** Every `git push origin HEAD:main` from this
session was refused by the git proxy: "pina-hash/idea-app is not in this
session's authorized repository set". It was tried after each task and refused
each time, so nothing below is on `main` or on ideabosco.com. The live site
footer version could not be read as a result of this work, because there is no
deploy of it. The five commits sit on a local `main` rebased over `origin/main`
`3d4f42f2`, and a git bundle of them was sent to Mr. Pina in the chat as a
backup. The commit ids below are the local ones; they change when the work is
rebased to land.

| Task | Local commit | Migration |
| --- | --- | --- |
| 1. Delivery rule, idea-code-prompt section 6 | `c92106d7` | none |
| 2. View as / act as, test student accounts (feedback d1c9ed15) | `c3aa7634` | 0288, 0289 |
| 3. Every open connector gap, the nightly replay, lookups by name | `8236cee3` | 0290 |
| 4. One IDEA Coin bar and a coin home (feedback 7e4a2a15, d299d864) | `ea2555c0` | none |
| 5. Foundry covers (feedback 1cc58a6e) | `ad08bdc5` | 0291 |
| What the full suite found (below) | the commit after `ad08bdc5` | 0292 |

## Found against built

Every item was checked against the tree at `e4fc3d01` before building.

- **Task 1**: section 6 still carried the 2026-10-19 "he pastes every prompt"
  rule. It now says chats start Claude Code sessions themselves as one-time
  scheduled tasks and interrupt him only for decisions that are his. The
  skill's frontmatter description still says "handed to Mr. Pina to paste".
  This task owned section 6 only, so the description was left alone.
- **Task 2**: nothing existed. Built: view as, act as, test accounts, the
  floating exit panel, `/admin/view-as`, `/admin/test-accounts`, the dashboard
  panel, the connector routes (`/api/admin/test-accounts*`). Read-only view is
  enforced in the database: a statement trigger on every public table
  (`zz_view_as_guard`, keyed on the JWT `session_id`) plus restrictive storage
  policies. Act mode writes are logged in `act_as_log`, the student gets an
  account notice, and grading shows "Handed in by Mr. Pina acting for this
  student". Test accounts (`@test.ideabosco.com`) are filtered out of every
  roster, grade view, count, leaderboard, stock ranking and badge (0289).
- **Task 3**: the nine gaps were open. The nightly replay was a stored list
  that nothing ran. Built: team progress inside an HTML document over the
  bridge (`idea:team-progress`), retire-on-replace, every student's answers in
  one call, fuzzy name lookup (one edit away), a tournament team with real
  players, an important notice with a named link, uploads of any size from a
  chat (signed upload or numbered parts) with start-to-published for Foundry
  games and post attachments, the market card list with feature and unfeature,
  contract editing, assignment and restore, and market item remove, restore,
  create and award. The replay now runs from the autopay route at most once
  every 20 hours and records its results. Every generated argument that said
  "the id, as the site's own page sends it" now names the kind of record and
  takes its name (`connector_lookup`).
- **Task 4**: coin pages linked to each other piecemeal and there was no coin
  home. Built: `CoinBar` on My coins, the role page, the Market, Stocks, a
  stock's page and the Coin Desk. It is also server-rendered into the frozen
  Ledger by serve-time injection (`injectCoinBar`). The Ledger file is
  byte-identical. The bar's site tokens are re-declared inside `.coin-bar`,
  read out of the design-system stylesheets, because the Ledger's own
  `--green` is its old neon. The Coin Desk tab shows only for coin staff
  (`coinBarDesk`, the desk's own gate, failing closed). `/coin` is the coin
  home: public, one condensed card per coin page, each card a single link.
  Tabs wrap and never scroll, the lesson the Ledger's own spec recorded.
- **Task 5**: the gallery's override layer (0237) already let an admin replace
  a card's picture on `/foundry/review/gallery`. Built on it rather than
  beside it. `foundry_cover_set` sets a picture, an HTML cover or neither, and
  never touches the student's record. The cover editor opens from the card,
  in the gallery's staff wrapper (`FoundryDetail` keeps no staff branch). An
  HTML cover is served only on the apps origin at `/c/<app id>`, under
  `sandbox allow-scripts` and a policy with no network at all. The card frames
  it with the same sandbox, out of the tab order, and a click inside it still
  opens the card. The connector sets covers through `set_foundry_cover`
  (`/api/admin/files/foundry-cover`) or `foundry_cover_set`.

## Measured

- `svelte-check`: 0 errors, 33 warnings in 18 files after every task (the
  baseline), read off its own summary line, 2026-10-21.
- Mutation proofs, each against its own test file, each restored
  byte-identically (md5 checked):
  - 0288 and 0290 gates.
  - 0291 `foundry_cover_html` visibility. Made permissive, the
    hidden/unpublished test failed.
  - 0291 admin gate. Removed, two tests failed.
  - The `/c/` host gate. Removed, the session-host test failed.
- Browser harness, 375 and 1440:
  - `coin-home`, `coin-home-who-staff`, `coin-home-who-out`: 0 outside
    threshold.
  - `foundry-cover-editor`: 0 outside threshold. Its frame reads as sealed
    (`contentDocument` null) and the sample is served under the cover policy.
  - Every existing coin spec re-run after the bar landed: 6 outside threshold,
    all in `coin-stocks`. Those 6 also fail on the tree before this work
    (stale counts: "four stocks" against a fixture of 7, "a chart each"
    against 8). Not touched here.
- One existing test was updated because task 2 added a step to the site's
  request handling: `tests/theme-preference.test.ts` asserts the hook order,
  which now includes `viewAs`.
- **The one full `npm test`**, run after task 5 (2026-10-21):
  `Test Files 11 failed | 870 passed (881)`, `Tests 19 failed | 16526 passed
  (16545)`. Eighteen of the nineteen were this work's, and each was fixed in
  the owning file, not by loosening the check:
  - `act_as_log`'s sequence was open to the client roles. 0288 now revokes it
    by name, and the sweep's count moves to 16.
  - `view_as_write_allowed` was granted to anon, which needs none: its
    storage policies are `to authenticated`. Narrowed in 0288.
    `foundry_cover_html` joins the declared anon surface with its reason.
  - The chat-upload bucket stated 100 MB, above the project's 50,000,000-byte
    global limit. 0290's bucket and the upload code now use the global, read
    from `SUPABASE_PROJECT_FILE_SIZE_LIMIT_BYTES`.
  - Three new top-level names were not reserved as short links. 0292 reserves
    `coin`, `c` and `view-as`, in SQL and in `RESERVED_SLUGS`. It refuses and
    names any existing link of those names, as 0275 did.
  - Smaller fixes:
    - `/c/` is exempt from the report control, with its reason.
    - 0290's name lookup joins 0287 as a declared Armory reader.
    - The cover route's refusals no longer read like raw upstream sentences.
    - The connector inventory was regenerated.
    - The 0263 re-apply check now re-applies the later file that redefines
      `cert_holders` (0289).
  - The nineteenth, `tests/notebook-text-only-entry.test.ts` (`on_time`
    false), is not this work's. That test's chain stops at 0137, before every
    file here, and it fails the same way run alone. It reads like a
    time-of-day dependence in the test; it was left alone.
  - After the fixes, every one of those eleven files passed, along with the
    four new test files, 2026-10-21. A second full run after the fixes read
    `Test Files 1 failed | 880 passed (881)`, `Tests 1 failed | 16544 passed
    (16545)`: the one failure is the notebook test above.

## For Mr. Pina

1. **Give the 0422 scheduled task access to pina-hash/idea-app** (add it as a
   source), then re-run it. Nothing here is live until a session can push.
   That session rebases onto `main`. If anyone has landed a migration numbered
   0288 or above by then, it renames the five files to the next free numbers
   and updates the `Claims:` line.
   **0292 refuses to apply if a short link named `coin`, `c` or `view-as`
   already exists**, because the new page would hide it for good. Migrate
   then stops at 0292 and the error names the link. If that happens, re-issue
   that link under another name on the short-links admin, and Migrate
   continues on its next run.
2. **After the deploy**, the session that lands this marks feedback d1c9ed15,
   7e4a2a15, d299d864 and 1cc58a6e and the nine connector gaps resolved
   through the site's own admin action. That could not be done before deploy.

## Not done, and why

- Not pushed and not deployed (above). So no live check, no footer version,
  and no feedback or gaps marked resolved.
- Not in this ledger's Owns, so left for a session that owns them:
  - The student changelog (`classroom-updates.json`, repo root).
  - `CLAUDE.md` (the access model should list `/coin` as public and
    `/c/<app id>` as an apps-origin route).
  - `docs/subsystems/` entries: coins, foundry and origin-split for the coin
    bar and HTML covers; the environment census for one more service-role
    reader, `src/lib/server/view-as/service.ts`.
  - `vercel.json`: the replay rides the autopay route instead of its own cron.
- A click inside an HTML cover opens the card through the window's focus
  moving to the frame. A cover that never takes focus (`pointer-events: none`
  in its own CSS) opens nothing when clicked on its picture. The card's name
  plate and keyboard focus still open it.
