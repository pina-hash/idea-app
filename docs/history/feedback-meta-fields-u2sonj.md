---
title: "The feedback console reads its own row's meta instead of a fixed list; a dead GET on vanguard-run-state is removed; CLAUDE.md documents the integrate.yml auto-merge (`claude/feedback-meta-fields-u2sonj`, no migration)"
date: 2026-08-28
branches: [claude/feedback-meta-fields-u2sonj]
migrations: []
subsystems: ["Feedback", "VANGUARD", "Documentation"]
---

Three loose ends, each reported by a session that could not reach the owning
files. This bundle owned `src/lib/classroom/FeedbackConsole.svelte`,
`src/routes/api/vanguard-run-state/`, `docs/VANGUARD_BACKLOG.md` and
`CLAUDE.md`, and touched nothing else.

### 1. The feedback console rendered a fixed list of `meta` keys, and `meta` is free-form

`feedback.ts` already says `meta` is "free-form context the calling surface
attaches ... treat it as a debugging aid, never as authoritative data." Until
this bundle, `FeedbackConsole.svelte`'s on-screen `fb-context` list read it
through nine named accessors (`rowRoute`, `rowRole`, `rowSection`,
`rowViewport`, `rowUserAgentSummary`, `rowBuild`, `rowStatusCode`,
`rowErrorId`, plus `rowDistinctPath`) and nothing else -- any key outside that
set was stored and never shown.

That had already gone stale against the app's own single producer,
`captureMeta` in `context.ts`, not just against a new one: `captureMeta` sets
`meta.error` (the error boundary's message) for every error report and the
console never rendered it, confirmed by grepping `console.ts` and
`FeedbackConsole.svelte` for `meta.error` / `'error'` before touching either.
VANGUARD's in-game "Bug or idea?" composer (`window.__ideaVanguardReport` in
`src/routes/vanguard/+server.ts`, landed in `b146298` on 2026-08-28 earlier the
same day) made the gap concrete: it writes `meta.surface` (which control sent
the row) and `meta.initials` (the leaderboard initials a player typed,
explicitly documented in that file as "NOT AN IDENTITY") straight into the
same free-form column, and neither name was ever in the console's list.

**The fix reads the row instead of a list somebody once enumerated.**
`FeedbackConsole.svelte` now carries a `KNOWN_META_KEYS` set (the nine names
already given special rendering, plus `at` -- see below) and, for every key in
a row's `meta` that is NOT in that set, renders a generic `key value` line in
the same `fb-context` list the named fields already use. This is a change to
`FeedbackConsole.svelte` alone: `console.ts`'s markdown/JSON export path was
left untouched, both because it is outside this bundle's ownership and because
the JSON export already carries every row's `meta` verbatim (it does not
enumerate), so only the on-screen list and (unaudited here) the markdown
export's per-row facts were still list-shaped. That is a known follow-up, not
silently dropped: whoever next touches `console.ts` should be aware the
markdown export (`oneRow` in `console.ts`) has the same "fixed list" shape this
bundle fixed on screen.

Deliberate exclusions from the generic path:

- **`at`** -- `captureMeta` also stores an ISO timestamp under `meta.at`,
  which is the same instant as the row's own `created_at` column (already
  shown as "filed" via `whenLabel`). Rendering it again under a bare `at` key
  would read as a second, unexplained timestamp, so it stays in
  `KNOWN_META_KEYS` with no accessor -- excluded, not shown twice.
- **Objects and arrays** -- `build` is the one object shape this file
  understands (through `rowBuild`, which prints the value and what it means);
  any other object or array value found in `meta` is silently omitted from the
  generic list rather than rendered as `[object Object]`. A stray complex
  value is a debugging aid best read from the JSON export, where it survives
  intact, not a truncated string on the triage card.
- **Empty values** -- `null`, `undefined`, an empty string, and a
  whitespace-only string all produce no `<li>`. A key present with nothing in
  it must not read as a labeled blank row.
- **A 200-character cap** on any one extra value, since nothing here can
  promise a future producer keeps its values as short as VANGUARD's 8-character
  `initials`; a value over the cap is truncated with an ellipsis rather than
  left to overflow. `.fb-context li` also gained `overflow-wrap: anywhere;
  max-width: 100%` for the same reason -- unbounded strings must not push the
  card wider than its column.

**Escaping**: the generic values go through the exact same mechanism every
other field on this card already uses -- plain Svelte text interpolation, with
no `{@html}` anywhere in the component (an existing assertion in
`tests/feedback-untrusted-render.test.ts` sweeps for the literal string across
the whole feedback path and would have caught a second answer). No new
sanitizer was written; there is nothing to write. One thing worth flagging: my
first draft of the in-code comment explaining this literally contained the
substring `{@html}` as prose, which tripped that exact sweep -- proof the test
is reading raw source rather than something weaker, and a reminder that this
sentence has to describe the mechanism without spelling the forbidden token.

**New test**: `tests/feedback-meta-fields.test.ts`, covering (rendered through
`svelte/server`, the `feedback-untrusted-render.test.ts` convention): a VANGUARD
`surface`/`initials` pair reaching the screen, `meta.error` reaching the screen,
an arbitrary future key reaching the screen, null/empty/whitespace extras
producing no row, an object/array value producing no `[object Object]`,
numeric/boolean extras rendering as text, no double-rendering of the nine named
fields or `at`, a hostile key AND a hostile value both producing zero added DOM
elements (the whole-document element-delta instrument from
`feedback-untrusted-render.test.ts`, proven against a positive control before
trusting the zero), a 5000-character value being capped rather than printed in
full, and the extras rendering in a stable (alphabetical) order.

### 2. `GET /api/vanguard-run-state` deleted

`docs/VANGUARD_BACKLOG.md` already documented this as "a handler with no
caller," re-checked 2026-08-28 (earlier the same day, by a different session)
across the three actual call sites in the repo -- both `POST`s and the one
`DELETE` in `src/routes/vanguard/+server.ts`. Re-checked here a third time,
independently, with `grep -rn "vanguard-run-state" src tests static tools
src/lib/legacy` (the legacy build was checked specifically, since that is the
one place a caller could hide from a normal grep of `src/`): the only three
hits are `+server.ts:333` (`sendBeacon` POST), `:336` (`fetch` POST) and `:351`
(`fetch` DELETE). Nothing calls `GET` on this route. The saved checkpoints
reach the page a different way entirely -- `/vanguard`'s own GET handler reads
`vanguard_run_state` directly with the server-side Supabase client and injects
the rows into the served page as `window.__ideaRunStates` -- so the browser
never had a reason to fetch this endpoint back.

Deleted the `GET` handler. `POST` and `DELETE` are untouched and still do the
checkpoint save and clear; `json` and `RequestHandler` stayed imported (both
are still used by the surviving two handlers, so nothing was orphaned).
Confirmed no test imports `GET` from this module (`grep` for
`routes/api/vanguard-run-state` across `tests/` turns up no import, only the
two files that mock the `vanguard_run_state` *table* for `/vanguard`'s own
direct query, which is unrelated code). `docs/VANGUARD_BACKLOG.md`'s entry is
rewritten from "here is why deleting this would be safe" to "deleted,
2026-08-28," stating the same evidence in the past tense.

### 3. CLAUDE.md now documents `integrate.yml`

A separate, not-yet-merged session (branch `claude/automate-branch-merging-hdnppy`,
commit `0f263f8`) added `.github/workflows/integrate.yml` and
`.github/workflows/README.md`: CI going green on a `claude/**` branch now
merges it into a long-lived `integration` branch and deletes the source
branch. `CLAUDE.md` had no mention of this at all, and `CLAUDE.md` -- not the
workflow README -- is what a session reads before doing anything.

Added one bullet to "Working conventions," beside the existing branch-lifecycle
rules, in the file's own voice rather than restating the operator
documentation: a finished `claude/**` branch vanishing is correct, the commits
are not lost (they land on `integration`), `main` still moves only when a
person merges it (because that push is the deploy, mid-class, and some bundles
carry a migration CI cannot see and that must be applied by hand first before
that push), and a `claude/**` branch still standing after a session ends is a
signal (its CI failed, has not finished, or its merge into `integration`
conflicted) worth naming alongside the existing "report a branch left open"
rule. It links to `.github/workflows/README.md` rather than duplicating its
content, and restates the existing "push the branch, do not merge to main"
rule explicitly, since "merging is now automatic" is the obvious wrong thing to
infer from the new bullet.

### Verification

- `svelte-kit sync && svelte-check`: **0 errors, 37 warnings**, mix **31
  `state_referenced_locally` / 5 `css_unused_selector` / 1
  `perf_avoid_nested_class`** -- matches the documented baseline exactly, before
  and after (re-measured after, not assumed).
- `npm test`: **144 files, 3268 tests, all passing** (includes the new
  `tests/feedback-meta-fields.test.ts`).
- `npm run verify:browser`: **28 route/width runs, 200 measurements, 2 outside
  threshold** -- both the documented `/dev/pathways` 26.2px tap-target finding
  (harness controls, at both 375px and 1440px), nothing new.
- Fresh checkout: `npm ci`, `npx svelte-kit sync`, `.env` copied from
  `.env.example` for the sync/check pass. Neither `.env` nor `.vitest-result-*.json`
  (vitest's own leftover) was committed.

### Not verified

- No live Supabase project, no signed-in session, no screenshot. Every check
  above is `svelte-check`, the vitest suite (embedded Postgres, per the
  existing harness) and the headless `verify:browser` pass; nothing here
  touched a migration or needed one.
- The markdown export's per-row facts (`oneRow` in `src/lib/feedback/console.ts`)
  were not widened to match the console's generic meta rendering -- flagged
  above as a known gap, left alone because `console.ts` is outside this
  bundle's file ownership.
