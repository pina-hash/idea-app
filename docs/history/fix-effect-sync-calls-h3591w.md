---
title: "The injected-callback checker goes repo-wide and the six calls it found are wrapped, with a per-site allowlist instead of a method-name heuristic (`claude/fix-effect-sync-calls-h3591w`, no migration)"
date: 2026-08-28
branches: [claude/fix-effect-sync-calls-h3591w]
migrations: []
subsystems: ["Classroom", "Foundry", "GAUNTLET", "Svelte 5 reactivity", "Testing"]
---

## The injected-callback checker goes repo-wide and the six calls it found are wrapped, with a per-site allowlist instead of a method-name heuristic (`claude/fix-effect-sync-calls-h3591w`, no migration)

The previous bundle fixed two `$effect`s in `ContentComposer` that called an
injected transport synchronously, wrote the rule into `CLAUDE.md`, and left a
source checker parsing that one component. This bundle points the checker at the
tree, fixes what it found, and makes the sweep the durable artefact.

**The fix is the disposable half. The checker is the point.** Six unwrapped
calls, in five files, across three subsystems, none of them the classroom -- so a
checker aimed at the file the bug was found in was only ever going to prove that
one fix was still in place.

### What the sweep actually measured

350 `.svelte` files under `src/`, 164 `$effect` bodies, 16 synchronous calls into
a caller-supplied binding. Six were defects; ten were `Array.prototype` reads
over prop data. The six line numbers handed to this session were claims and were
re-derived rather than trusted; all six held.

| file | call | what it is |
| --- | --- | --- |
| `ClassView.svelte` | `load(ids)` | export-status transport |
| `PeoplePanel.svelte` | `load(sectionId, null)` | notebook-grid transport |
| `FoundryInspector.svelte` | `transports.listFiles(id)` | bundle file list |
| `FoundryPlayStats.svelte` | `load(id)` | play-stats transport |
| `CountdownOverlay.svelte` | `onDone?.()` | bare prop callback |
| `ChallengeForm.svelte` | `supabase.storage.from(...)` | prop-supplied client |

Each is now `untrack` around the CALL with the inputs still read tracked above
it, following the composer's own shape. Untracking the whole body would satisfy
the checker and quietly delete the reason each effect exists, which is why the
composer's shape assertion is kept as a separate test.

### Two of the six are worth naming individually

**`CountdownOverlay` is the clearest statement of what the rule is about.**
`onDone?.()` has no transport, no promise, nothing to await and nothing to
cancel. It is still the same defect, because the defect was never about async:
it is that a callback the MOUNTING surface wrote runs inside this effect's
tracking context, and whatever it reads reactively before it returns becomes a
dependency of an effect its author never saw. A parent whose handler flips the
flag this overlay's `active` is derived from is a loop, and nothing in the
overlay can see that. The two other `onDone?.()` calls in the same effect are
inside `setTimeout` callbacks and are correctly left alone.

**`ChallengeForm` was examined rather than swept in.** It calls an injected
`SupabaseClient`, not a callback, so the question "can this actually be
reactive here" was asked instead of assumed. Measured: both mounts
(`/gauntlet/author/new` and `/gauntlet/author/[id]`) pass the real
`createBrowserClient` object built in `+layout.ts`, no dev harness mounts this
component with a stub, and nothing on `@supabase/ssr`'s storage path reads a
rune. **It genuinely cannot loop today.** It is wrapped anyway, and the
reasoning is written beside it rather than left implied: the rule is about the
SHAPE, and "happens not to loop" is precisely the state the composer was in the
day before a harness handed it a stateful transport. One detail that is not
cosmetic -- `supabase` is hoisted to `const client = supabase` OUTSIDE the
untrack, because `data` is `$derived` on both author pages and an
`invalidate('supabase:auth')` hands the component a freshly constructed client
the URL has to be re-signed against. Wrapping the whole expression would have
bought the safety by silently costing that re-run.

### Two comments that proved half a case

`FoundryInspector` and `FoundryPlayStats` each carried a comment explaining that
only the id is read tracked BECAUSE THE BODY WRITES THE REST. That reasoning is
correct and stops one step short: it accounts for what the file itself reads and
never asks what the injected transport reads. A comment that proves half a case
reads as a comment that proved the case, which is how both survived review.
Both now state the two independent reasons.

`FoundryInspector`'s went further than incomplete -- it read "`untrack` is what
keeps this from spinning" while there was no `untrack` anywhere in the body. The
replacement says so explicitly, because a comment that describes a mechanism the
code does not have is worse than no comment.

### The allowlist, and the hole it closes

The checker classifies a call as pure when its member name is on a list of
`Array`/`Map` reads. At one-file scale that is fine because a human read the
file. At 350 files it has a hole: `get`, `has` and `find` are on that list for
`Map.get` and `Array.find`, so a transport named `transports.get(id)` would be
waved straight through by the method name alone.

So a pure-looking call now clears only when its `file::callee` is named in
`ALLOWED_PURE`, with the reason somebody checked. Nine entries covering ten
sites, each carrying a prose reason, an exact `count` (a second call at a blessed
site is still looked at), and deliberately no line numbers -- a list that has to
be renumbered is one that gets renumbered without being read. The length and the
site total are both pinned, a stale entry reddens, and an unparseable component
is a FAILURE rather than a skip: a file the checker could not read is a file it
never checked, and silently skipping it is how a sweep comes back clean over
code it never saw.

`.svelte.ts` modules are outside the sweep -- they have no `$props()`, so
"caller-supplied" is a different shape there and detecting it is a different
analysis. That gap is a TRIPWIRE rather than an omission: measured, no
`.svelte.ts` module in the repo calls `$effect(` today (the three that grep hits
mention it only in comments), and the test reddens the moment one does.

### The harness workaround is gone

`/dev/classroom`'s `loadCategorySuggestions` opened with a bare
`await Promise.resolve()` whose own comment said it existed to dodge this bug.
It fixed the symptom FROM THE CALLER'S SIDE, which is the wrong side: it made
every future harness transport responsible for a rule it cannot see, and a
transport written without the yield would have brought the loop straight back.
Removed, and the transport deliberately left in the shape a person would
naturally write -- synchronous, reading state, writing a log line -- so the
harness stays a real test of the fix rather than tiptoeing around it.

### Mutation proof

Run against the single test file, with every mutated source restored and
md5-verified afterwards.

- **Each of the six reverted individually reddens**, naming its own file and
  line: `ClassView:645`, `PeoplePanel:354`, `FoundryInspector:152`,
  `FoundryPlayStats:91`, `CountdownOverlay:35`, `ChallengeForm:159`. One failing
  test each, 18 passing.
- **A new unwrapped call in an unrelated component reddens.** `loadout.refresh()`
  added to `GaragePreview.svelte` (a GREENLINE component with zero findings
  before) reported `GaragePreview.svelte:36`.
- **The allowlist does not shield a real defect in a file it names.**
  `onsave([])` added to `RewardRulesEditor.svelte` reported
  `RewardRulesEditor.svelte:39` despite two allowlisted entries in that file.
- **The `get` hole is closed.** `loadout.get(1)` in `GaragePreview` -- a call the
  method-name heuristic clears on its own -- reddened as "a pure-looking call at
  an unlisted site".
- **A stale allowlist entry reddens.** A fabricated entry for a nonexistent file
  failed three assertions (stale, length pin, count pin).
- **An unparseable component reddens** rather than being skipped.
- **The scope tripwire reddens.** A `.svelte.ts` file containing `$effect(`
  failed the coverage assertion.

One negative result worth recording: the first attempt at the unrelated-component
mutation used `onsaved?.()` where the prop is actually named `onsave`, and the
checker correctly did NOT flag it. That is the checker declining to flag an
identifier that is not caller-supplied, which is the behaviour the allowlist
tests rest on.

### Three rules written into CLAUDE.md

The injected-callback rule already existed from the previous bundle, so it was
extended IN PLACE rather than restated: the headline widened from "callback" to
"injected code" to cover a prop-supplied client, the small-callback bullet gained
the "not about async" framing and the `CountdownOverlay` case, a new bullet
covers the injected-client shape and the hoist-the-client detail, and the
source-assertion bullet now describes the repo-wide sweep and the allowlist.

Two rules are new:

- **SvelteKit throws on any non-method export from a `+server.ts`**, except keys
  prefixed `_`. Verified at the source (`validate_server_exports` in
  `@sveltejs/kit/src/utils/exports.js`) and measured: with
  `export const helperTable = { a: 1 }` appended to a real `+server.ts`,
  `svelte-check` reported its usual 0 errors / 37 warnings, and a vitest file
  imported the module, read the export off it and passed. Vitest imports the
  module directly and never goes through the router, so the validator is not on
  the path. The repo already uses the `_` prefix for exactly this
  (`_NON_ADMIN_STRIPS`, `_stripForNonAdmin` in `src/routes/vanguard/+server.ts`).
- **Do not run prettier.** **The premise this session was handed was that
  prettier is installed with no config; the first half is not true of this repo
  and the rule is written to what was measured.** There is no `prettier` in
  `dependencies` or `devDependencies`, none in `node_modules`, and **zero
  occurrences in `package-lock.json`** -- and also no `.prettierrc`, no
  `prettier` key, no `.editorconfig` and no `format` script. But a bare
  `prettier` resolves anyway: it is installed GLOBALLY in the agent environments
  this repo is worked in (`/opt/node22/bin/prettier`), and `npx prettier` would
  fetch it on demand. That is worse than a pinned devDependency, not better --
  nothing in the repo pins its version, states the house style, or records that
  it ran, and the default is two spaces over a tab-indented codebase.

### Verified

- `svelte-check`: **0 errors, 37 warnings**, mix 31 `state_referenced_locally` /
  5 `css_unused_selector` / 1 `perf_avoid_nested_class`. Identical before and
  after, re-derived on this checkout rather than read off `CLAUDE.md`.
- Full suite before: **142 files, 3223 tests, all passing**. After:
  **142 files, 3230 tests, all passing** -- +7, which is exactly the single test
  file going 12 -> 19 as the one-file section became the repo-wide sweep. No
  other file's count moved.
- `npm run verify:browser`: **28 route/width runs, 200 measurements, 2 outside
  threshold**, both the known `/dev/pathways` harness-control tap target at
  194.7x26.2 (min dim 26.2px), once at 375px and once at 1440px. Unchanged.

### NOT verified

- **Nothing here is proven against a mounted component.** Effects do not run in
  this suite's environment: it is `environment: 'node'` with no DOM package, and
  `svelte` resolves to its server build, so `mount()` raises
  `lifecycle_function_unavailable` and even a bare `$effect.root` in a
  `.svelte.ts` fixture runs its effect zero times. Every assertion in this
  bundle is a SOURCE assertion. This is the same known gap the previous bundle
  recorded, with the same decision already made about it: closing it means
  changing `vitest.config.ts` and adding a DOM package, both explicitly out of
  bounds for this session, and a runtime control written in-bounds today would
  be green and vacuous.
- **No surface was driven in a browser.** `verify:browser` covers `/dev` routes
  only; none of the six components has a `/dev` harness that exercises the
  effects changed here, so the fixes are not confirmed to still load their data
  on a real page. `/dev/classroom` mounts `ContentComposer` but the harness was
  not driven by hand this session.
- **`ChallengeForm`'s two mounts were not opened.** Both are behind a signed-in
  GAUNTLET authoring surface. The claim that the client cannot be reactive is
  read off `+layout.ts` and both call sites, not observed at runtime.
- **No live Supabase project was touched** (the local `.env` is the
  `example-ref` placeholder), no migration was written, and no RPC was called.
- The `.svelte.ts` scope gap is pinned, not closed: if such a module ever needs
  an effect that calls injected code, the analysis for it does not exist yet.

### Not done

- The test file keeps the name `classroom-composer-effect-reactivity.test.ts`
  although it is no longer about the composer or the classroom. Renaming it was
  out of this session's file ownership; the header states the mismatch, the way
  `IDEA_VERIFICATION_ADDENDA.md` keeps its own filename deliberately.
- No `classroom-updates.json` entry. `ClassView` and `PeoplePanel` are classroom
  surfaces, but nothing a student or teacher can see changes: the effects behaved
  correctly in production, because the production transports are plain Supabase
  calls with no reactivity in them. A change with no student-visible effect needs
  no entry.
