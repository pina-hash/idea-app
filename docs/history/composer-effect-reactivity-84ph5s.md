---
title: "ContentComposer stops calling an injected transport inside its effect's tracking window, and the rule is written down as a property of injected callbacks (`claude/composer-effect-reactivity-84ph5s`, no migration)"
date: 2026-08-28
branches: [claude/composer-effect-reactivity-84ph5s]
migrations: []
subsystems: ["Classroom", "Svelte 5 reactivity"]
---

`ContentComposer`'s grading-category effect read `categoryCourseIds`, looked up
`transports.loadCategorySuggestions`, and then CALLED it, all synchronously in
the effect body. Reading state inside an `$effect` subscribes to it, including
state read inside the functions the effect calls, so every reactive read the
transport performed before its first `await` became a dependency of that effect
and every reactive write re-triggered it. A dev-harness transport that read
fixture state and appended a log line was enough: `effect_update_depth_exceeded`
the moment the composer opened.

**Production never looped, and that is the finding rather than the reassurance.**
The shipping transport is a plain Supabase call with no reactivity anywhere in
it. `loadCategorySuggestions` is an INJECTED interface -- written by whoever
mounts the composer, who cannot see the effect calling it -- so its contract
silently forbade something nothing in the codebase said it forbade, and the only
thing standing between the deployed app and the loop was the coincidence that
nobody had yet written a transport that touches state.

### The fix

`untrack` around the CALL, in both of this file's effects that invoke
caller-supplied code. It is this codebase's existing convention for the general
case (`CLAUDE.md`'s "wrap the work in `untrack` and pass its inputs explicitly",
and thirteen files already doing it, `PiecePreview3D` and `CheckInGuidance`
being the closest analogues), and `untrack` was already imported here.

- **The inputs stay tracked and the invocation does not.** `categoryCourseIds`
  and the `transports.loadCategorySuggestions` lookup are still read at the top
  of the body, so a change of course scope still re-runs the effect and the
  `cancelled` flag still drops a stale in-flight response. Only
  `untrack(() => load(courseIds))` moved.
- **Untracking the whole effect body was the rejected repair.** It buys the same
  safety by deleting the reason the effect exists, and nothing on screen reports
  an effect that quietly stopped re-running.
- **`ondirtychange?.(dirty)` got the same treatment**, and it is the more
  instructive of the two: one prop call, no `await` in it at all, no transport
  in sight. It is the same defect, because the parent's handler is still
  somebody else's code executing inside this effect's tracking context.
- **The `.then` handler is untouched.** It runs in a microtask, outside the
  tracking context, so the stale-response guard written there was already safe.

### What is proven, and what is not

**`tests/classroom-composer-effect-reactivity.test.ts` asserts the property on
the shipping bytes**: it parses the real `ContentComposer.svelte` with
`svelte/compiler`, walks every `$effect`, and reddens on any synchronous call
into a caller-supplied binding that is not `untrack`-wrapped. It is deliberately
wider than the bug -- it catches the NEXT one somebody writes, in any effect in
the file, rather than the one that was fixed.

- **Mutation-proved in both directions.** Reverting the `untrack` reddens 3 of
  12 assertions naming `ContentComposer.svelte:452`; adding a *different*
  unwrapped call (`transports.loadCategorySuggestions?.([])`) to the unrelated
  staged-spec effect reddens naming `:344`. The file was restored md5-identical
  after each.
- **The instrument has its own controls, and they found two real bugs in it.**
  Nine checker tests put it to synthetic sources: it must flag a transport call,
  a prop callback, a call nested in a plain `if` block, an aliased transport, and
  a non-allowlisted member on a prop object; it must clear an `untrack`ed call,
  a call inside a nested `.then`, a pure collection read over prop data, and a
  method on an object this file constructed. Writing those controls is what
  caught (a) `untrack(() => ...)` being skipped as "a nested function", which
  counted every correctly fixed call as absent and would have let the file pass
  vacuously, and (b) `transports.load().then(...)` reporting one defect twice.
  An earlier hand-rolled brace-matching version of the same sweep failed both
  the `if`-block control and the concise-arrow control, which is why the shipped
  one parses instead of counting braces.
- **Non-vacuity is asserted, not assumed:** the real-file case asserts at least
  4 effects walked and at least 2 wrapped candidate calls found, so a sweep that
  generated nothing cannot pass its own absence assertion.

**NOT PROVEN: that the real component, mounted, survives a hostile transport.**
That is the thing worth naming plainly. Effects do not run under `svelte/server`,
this suite is `environment: 'node'` with no DOM package installed, and `svelte`
resolves to its SERVER build. Measured, not assumed: `mount()` raises
`lifecycle_function_unavailable`, and a bare `$effect.root` in a `.svelte.ts`
fixture runs its effect **zero** times, so a runtime control written in-bounds
today would be green and prove nothing -- worse than no control. What WOULD
prove it is recorded below.

**Measured out of tree, and reported rather than shipped.** With `happy-dom`
installed and `resolve.conditions: ['browser']` added to `vitest.config.ts`, the
real composer mounts, and the hostile transport (a `$state` array read and
appended to before the first `await`) reproduces `effect_update_depth_exceeded`
against the unfixed source and settles against the fixed one. That instrument
was built and run in this session and then removed: `package.json`,
`package-lock.json` and `vitest.config.ts` are outside this bundle's ownership,
two sessions were live, and a lockfile conflict is a dependency tree rather than
a text merge. Adding a component-test environment is a repo-wide change that
outlives this bundle and deserves its own deliberate decision, not arrival
underneath a one-line reactivity fix.

### The same shape elsewhere -- enumerated, six of them real

161 effects across 80 components were parsed. Every synchronous call into a
caller-supplied binding, with the pure collection reads over prop DATA
(`sections.map`, `folders.some`, `staged.map` and the rest -- they invoke no
caller code) and the locally-constructed `save.attach()` / `saveState.attach()`
set aside, leaves **eight** call sites, of which six invoke genuinely injected
code and would loop against a transport that touches reactive state:

| file:line | calls | fixed |
|---|---|---|
| `src/lib/classroom/ContentComposer.svelte:452` | `transports.loadCategorySuggestions` via `load` | yes |
| `src/lib/classroom/ContentComposer.svelte:658` | `ondirtychange?.(dirty)` | yes |
| `src/lib/classroom/ClassView.svelte:638` | `loadExportStatuses` via `load` | no, not owned |
| `src/lib/classroom/PeoplePanel.svelte:346` | `loadNotebookGrid` via `load` | no, not owned |
| `src/lib/foundry/FoundryInspector.svelte:136` | `transports.listFiles(id)` | no, not owned |
| `src/lib/foundry/FoundryPlayStats.svelte:77` | `load(id)` | no, not owned |
| `src/lib/gauntlet/viewport/CountdownOverlay.svelte:24` | `onDone?.()` | no, not owned |
| `src/lib/gauntlet/ChallengeForm.svelte:134` | `supabase.storage...createSignedUrl` | no, not owned |

Nothing prevents the loop in any of the six unfixed ones; each is protected only
by the same coincidence ContentComposer was -- the transport its real caller
happens to pass is not reactive. `FoundryInspector` and `FoundryPlayStats` both
carry comments explaining that only `version.id` / `appId` is read tracked
*because the body writes the rest*, which is the same hazard diagnosed one step
short: the reasoning covers the effect's own reads and stops at the transport's.
`ChallengeForm` is the mildest -- `supabase` is an injected client rather than a
callback, and a `SupabaseClient` is not reactive -- but it is injected, so it
rests on the same coincidence. The four in `classroom/` and `foundry/` are the
ones a dev harness will hit first, because a harness transport is exactly where
reactive fixture state lives.

### Also true, and deliberately left alone

`src/routes/dev/classroom/+page.svelte:1081` on
`claude/browser-verify-harness-fixtures-lc4ojo` carries an `await
Promise.resolve()` at the top of its `loadCategorySuggestions` harness transport
whose only job is to yield one microtask past this effect's synchronous tracking
window. Its comment diagnoses the bug correctly and independently, and records
the same measured `effect_update_depth_exceeded on mount`. **Once this bundle
lands, that line is removable** -- the composer no longer calls the transport
tracked, so the microtask buys nothing. It is not touched here: the file is on
another session's unmerged branch, and it is harmless where it stands.

No `classroom-updates.json` entry: nothing a student sees changes.

### Verification

- `svelte-check`: **0 errors, 37 warnings**, mix **31 `state_referenced_locally`
  / 5 `css_unused_selector` / 1 `perf_avoid_nested_class`** -- baseline held, and
  re-derived after `svelte-kit sync` with the two `PUBLIC_SUPABASE_*` placeholders
  exported (a fresh checkout with no `.env` otherwise reports the documented 11
  phantom errors).
- `npm test`: **138 files / 3174 tests green before**, **139 files / 3186 tests
  green after** -- the delta is exactly this bundle's one new file.
- `npm run verify:browser`: 24 route/width runs, 174 measurements, **2 outside
  threshold**, both the known pre-existing `/dev/pathways` harness-controls
  finding at 194.7x26.2 (min dim 26.2px, above the 24px floor, under 44px) at
  375px and 1440px. Unchanged by this bundle, which touches no styling.
- **Not verified:** anything against the live Supabase project, any signed-in
  surface, and -- as set out above -- the mounted component's runtime behaviour
  under a hostile transport within the committed suite.
