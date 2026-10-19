---
title: "Ledger 0416: feedback queue 2026-10-19, site items 1 to 12 and connector gaps C1 to C7 (0282)"
date: 2026-10-19
branches: [main]
migrations: ["0282"]
subsystems: [Connector, Classroom home feed, Class page, Post thumbnails, HTML assignments, Error boundary, Themes, Profile menu, Student page, Feedback, Standards]
---

A scheduled solo run of `docs/feedback/2026-10-19/QUEUE.md`, landed in two
pushes straight to `main`: the connector first (`a999731a`), then the site.

## What changed

### Push 1, the connector (C1 to C7)

- **C1** (a confirmed change re-filled arguments the preview never had):
  `engine.ts` keeps `givenArgs` separate from the `filled` defaults, so the
  confirm token is bound to what the caller sent, and a confirm can never
  widen it. Mutant against the token check went red.
- **C2a** (an overloaded RPC picked the wrong arity): `tools.ts` `fitOverload`
  chooses the signature whose parameters the call names.
- **C2b, C3, C4, C7** and the catch-up list (stocks, sending coins, hall pass
  time, the market): reached through the new generated layer, with
  hand-written tools for the feedback reads (`list_site_feedback`,
  `feedback_screenshot`, which signs the stored screenshot) and shared-post
  class resolution in `resolve.ts`.
- **C5** (new admin actions never reached the connector): the inventory now
  also counts functions a server wrapper calls by name; `tools/connector/
  auto.mjs` turns every admin-gated function the hand registry does not cover
  into a `proof: generic` tool (`auto.generated.json`,
  `endpoints.generated.ts`), with its volatility, gates and written tables
  read from `pg_proc` and the function bodies (`gates.mjs`, transitive through
  private helpers). `.github/workflows/connector.yml` regenerates and commits
  on push. Measured on the tree: 623 functions inventoried, 136 generated
  tools (29 reads, 107 ask first), 60 excluded with a reason each. Coverage
  test mutant went red.
- **C6**: migration `0282_app_feedback_file.sql` (the screenshot path the
  feedback read needs).
- `CLAUDE.md` gained the one-sentence connector standing trap.

### Push 2, the site (items 1 to 12)

- **Item 1, Matrix rain stood still**: `rain-motion.ts` plus a Falling code
  switch in the profile menu (Follow this computer / Always move) with a line
  saying what the rain is doing. "Always move" overrides the computer's
  reduced-motion setting by the person's own explicit choice, and only then.
- **Item 2, HTML thumbnails blank after a move**: `HtmlThumbnailFrame.svelte`
  routes messages by the iframe ELEMENT, rematching its current
  `contentWindow`. Measured: a reinserted iframe gets a new window
  (`same: false`), which is what the old window-keyed map lost.
- **Item 3, the error page**: rebuilt on the site plate (logo, title bar,
  status number and lamp chip, a sentence that says what to do for a bare 404,
  facts in a well, raised keys). `sitePlateClass` takes an error flag so a
  failed room still renders the plate.
- **Item 4, teacher rows cramped**: an editable stream uses a 28rem column,
  keyed on `.stream:has(.row-menu)`. A first version added a `data-editable`
  attribute and the full suite caught it: the null-layout golden in
  `tests/classroom-panel-layout-render.test.ts` holds the class page's markup
  byte for byte, so the rule now changes no markup at all (re-measured: 448px
  columns in manage mode at 375 to 1920, 356px for a student at 1440).
- **Items 5 and 6, "need attention" said nothing**: each class card counts
  only its own active roster's hand-ins (`rosterEmails` from the roster read
  the home page already makes), due-soon no longer counts as a teacher task,
  the header says what is owed ("2 to grade · 1 draft"), one owed thing makes
  the header a link to its fix, several open a short list of links, and a row
  with hand-ins opens grading.
- **Item 7**: found fixed by ledger 0396 (stable student-page row keys).
- **Item 8, hide sections**: the menu existed (0396); built the scope switch,
  this class or every class, stored per class in preferences.
- **Item 9**: found fixed by ledger 0396 (picture strip wraps and centres).
- **Item 10, two feedback windows**: found fixed by 0396; built the test in
  `tests/feedback-coverage.test.ts` that fails when a non-game page ships a
  second feedback component, with positive controls.
- **Item 11, banners**: generated banners now carry the post's kind and title;
  an animated GIF, WebP or APNG upload is kept as is (up to the 10MB upload
  cap) instead of being flattened; under reduced motion an animated banner
  shows a still first frame.
- **Item 12 / decision 69, the `//` motif**: swept to the middle dot across
  page titles, eyebrows and labels; two CSS `content: '// '` rules removed;
  `tests/slash-motif.test.ts` guards it.

## Measured (2026-10-19, this container)

- Item 4 on `/dev/post-thumbnails?manage=1`: at 1278px the row text column
  went from 120px (meta wrapping to 4 lines, 72px) to 318px (meta on 1 line,
  18px); 399px at 1440, 334px at 1920 (three columns), 341px at 2560; titles on
  one line throughout.
- Item 3 `/dev/no-such-page` at 375 and 1440: 0 horizontal overflow, contrast
  13.72:1 (sentence), 8.37:1 (address), 15.64:1 (status word), no `//` on the
  page.
- Home feed: all 34 home-feed route/width runs 0 outside threshold.
- Roster filter mutant (drop the roster test, permissive direction): 5 of 7
  in `tests/dom/classroom-feed-needs-mount.test.ts` failed; restored
  md5-identical (`696560b6...`) and green.
- `svelte-check`: 0 errors, 33 warnings in 18 files (the baseline).
- Full `npm test`, first run: 7 failed of 16397 in 2 files, both this
  bundle's (the golden above, and `tools/browser-verify/README.md`'s counts,
  which needed `verify:readme --static` plus a measurement for each new spec).
  Both fixed and their files re-run green before the second full run.

## NOT verified

- The live database: whether `migrate.yml` applied 0282, and the first run of
  `connector.yml` on `main`.
- A real drag on a signed-in class page for item 2: the harness's manage mode
  does not reorder, so the move was reproduced by reinserting the iframe.
- Why the reporter's rain was still: most likely their computer's reduced
  motion setting; the switch now says so and lets them choose.
- Signed-in sessions and production behaviour of every item.

## For a person to act on

- Confirm migration 0282 applied (the Migrate run after the connector push).
- Admin actions that write tables directly, not through an RPC, are still out
  of the connector's reach: the Maps editor, GAUNTLET series editing, and
  dashboard role edits. Each needs an RPC before the generator can see it.
- Pre-existing, not this bundle's: `/dev/profile-menu?pathway=none&refuse=rls`
  at 375 reports the panel under the sticky footer (807 > 774), on `HEAD`
  before this work too.
