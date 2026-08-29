---
title: "A second vitest project gives `tests/dom/` a real DOM and svelte's client build, so an `$effect` can be proven behaviourally; ContentComposer's two `untrack`s are mounted and mutation-checked (`claude/vitest-dom-ssr-projects-5xp8ks`, no migration)"
date: 2026-08-28
branches: [claude/vitest-dom-ssr-projects-5xp8ks]
migrations: []
subsystems: ["Testing", "Toolchain", "Classroom"]
---

Three bundles this week ended with the same sentence: effects do not run in this
suite, so a reactivity claim can only be asserted from the source. One of them
proved a real defect by installing a DOM temporarily, measuring, and removing it
again. This makes that capability permanent and scoped.

Files owned: `package.json`, `package-lock.json`, `vitest.config.ts`, and the
test files created here. Nothing under `src/`, `tools/`, `.github/` or
`supabase/` was touched -- `git diff --stat src/` is empty, and the mutation
proof below was run against scratch COPIES of the component rather than against
the shipping file.

### The split, and why it is a split rather than one condition

`svelte`'s export map is `{ browser: './src/index-client.js', default:
'./src/index-server.js' }`. `mount()` and a real effect scheduler live in the
client build; twenty-two existing files server-render through `svelte/server`'s
`render()` and need the other one. One repo-wide `resolve.conditions:
['browser']` would have moved all twenty-two onto the client build as a side
effect of enabling one new capability.

So `vitest.config.ts` now declares two projects:

* **`node`** -- `environment: 'node'`, `include: ['tests/**/*.test.ts']`,
  `exclude: [...configDefaults.exclude, 'tests/dom/**']`. Identical resolution
  to what the whole suite had before. It keeps the embedded-Postgres
  `globalSetup`, because nothing in the other project touches a database and a
  second project asking for the cluster would boot a second one.
* **`dom`** -- `environment: 'happy-dom'`, `conditions: ['browser']`,
  `include: ['tests/dom/**/*.test.ts']`.

Both read the same `alias` object and the same `sveltePlugin()` factory, so the
only declared difference between them is the DOM and the one condition. A fresh
plugin instance per project, deliberately: vite-plugin-svelte caches compiled
output per instance and the two projects compile the same `.svelte` files to
different output.

**Routing is by DIRECTORY and it is opt-in.** No filename suffix, no docblock,
no glob that sweeps existing files in. A file's project is decided by where it
is, which is legible in every line vitest prints and is a question you answer by
creating the file rather than by remembering a rule. Both wrong choices fail
rather than pass: a mount test outside `tests/dom/` raises
`lifecycle_function_unavailable` on its first run, naming `mount`; an SSR test
inside it is refused by name (see below). `tests/dom/README.md` is the
directory's own note for whoever opens it.

### `sequence.sequencer` is a ROOT option, and a per-project copy is silently inert

The first full run under the new config came back **1 failed | 149 passed**, and
the failure was `tests/db-isolation-b.test.ts`'s POSITIVE CONTROL: `expected 0 to
be greater than 0`. `db-isolation-b` had run BEFORE `db-isolation-a`, so there
was no neighbouring database left behind to find.

`sequence: { sequencer: IdeaSequencer }` had been carried into the node project
alongside the other `test` options. Vitest reads sequencing from the ROOT config
-- ordering spans the whole run -- and ignored it there. Moved back to the root
`test` block beside `projects`, the pair runs in order and the suite is green.

This is worth writing down twice over. It is the exact failure this bundle
exists to guard against -- a config change quietly altering what the suite
means -- and the thing that caught it was the isolation proof's own positive
control, working as designed. A per-project `sequence` does not warn, does not
type-error and does not appear in the run output.

### What the pair of identity files pins, and the two instruments that do NOT work

`tests/vitest-project-node.test.ts` and `tests/dom/vitest-project-dom.test.ts`
each assert which build their own project got, so a config edit in either
direction reddens with a named path instead of 3000+ tests passing while meaning
something else.

Both cheaper instruments were tried and **both are wrong**:

* **`import.meta.resolve('svelte')` answers `src/index-server.js` in BOTH
  projects.** It runs Node's resolver, which knows nothing about Vite's
  conditions or aliases, so it reports the wrong answer confidently in the
  project that is actually on the client build.
* **The two builds export the SAME NAMES.** Measured: `Object.keys` of the
  `svelte` namespace is character-for-character identical in both projects --
  `afterUpdate,beforeUpdate,createContext,createEventDispatcher,createRawSnippet,flushSync,fork,getAbortSignal,getAllContexts,getContext,hasContext,hydratable,hydrate,mount,onDestroy,onMount,setContext,settled,tick,unmount,untrack`
  -- because the server build ships stubs rather than omitting anything.
  `typeof mount === 'function'` is true on the server build.

What separates them is what `mount()` DOES: `lifecycle_function_unavailable` on
the server build, a rendered element on the client build. That is the only
discriminator measured to work, so it is the one used, on one shared fixture
(`tests/fixtures/ProjectIdentity.svelte`) that the node file server-renders and
the DOM file mounts.

### The DOM and the build are independent axes, measured

Removing `conditions: ['browser']` from the dom project and leaving happy-dom in
place: `document` was still a real object, `happyDOM` was still present, and
`mount()` still raised `lifecycle_function_unavailable` with the target left
empty (`HTML:` blank). With the condition restored, the same file mounts and
renders `<p data-testid="trivial">hello</p>`. `vitest.config.ts` was restored
byte-identically afterwards (md5 `00d7cdc59134de3f22c985e620051138` both sides).

**Adding an environment does not change which build you are on.** So both
identity files assert both axes separately rather than testing one and inferring
the other. Somebody who "adds happy-dom" to get a mount working, and stops
there, gets a green-looking environment that still cannot mount.

### The SSR-into-the-DOM-project direction fails illegibly AND unreliably

A `render()` from `svelte/server` inside the dom project fails -- the component
is compiled to client output, which the server renderer cannot execute -- with
`Cannot read properties of undefined (reading 'call')`. That message names
nothing about builds, projects or conditions.

It also failed **inconsistently**: across several arrangements of the same file
it threw in most and returned without throwing in one, and the determining
factor was not isolated. An unstable symptom is a flaky test, so the rule is NOT
asserted at runtime. `tests/vitest-project-node.test.ts` refuses a
`svelte/server` import under `tests/dom/` as a source sweep instead, which is
stable, and names the reason. `svelte/server` itself resolves identically in
both projects (its export map has a `default` and no `browser` key), which is
what makes the symptom confusing rather than obvious.

### The proof nobody could write before

`tests/dom/classroom-composer-effect-mount.test.ts` mounts the real
`ContentComposer` with injected code that reads and writes reactive state before
its first `await`, and asserts it settles.

The fixture is the classroom dev harness's own `note()`
(`src/routes/dev/classroom/+page.svelte`), copied down to the `[new, ...old]`
and the 60-entry cap, because that function is what actually took the composer
down the first time somebody opened the harness. A fixture that merely WRITES
state does not reproduce it: the READ is what joins the calling effect's
dependency set, the write is what re-triggers it, and both in one synchronous
statement is the defect. It lives in `tests/dom/fixtures/reactive-log.svelte.ts`
-- a `.svelte.ts` module, because `$state` is a rune and only the svelte plugin
compiles one.

Both injected bindings are covered, and they are different shapes:

* `transports.loadCategorySuggestions` -- an `async` transport with no `await`
  before it touches state, so its whole body runs inside the tracking context.
* `ondirtychange` -- a plain prop callback with no promise in it at all, which
  is exactly why it reads as exempt and is not.

Measured on the shipping component: the transport is called **exactly once**,
with `[['course-1']]`; the log holds **1** entry; the component renders **6335
characters** of markup; and the effect's result reaches the DOM as **2**
`<datalist>` options (`Bench work`, `Sketching` -- the duplicate in the fixture
collapsed by the real `courseCategorySuggestions`). `ondirtychange` is called a
bounded number of times and every value is `false`, a composer nobody has typed
into being clean.

**Mutation-proved, each `untrack` independently.** Scratch copies of
`ContentComposer.svelte` were made under `tests/dom/fixtures/__mutant_*/`,
each differing from the shipping file by exactly one line (`diff` confirmed:
`untrack(() => load(courseIds)).then(` -> `load(courseIds).then(` at line 452,
and `untrack(() => ondirtychange?.(value));` -> `ondirtychange?.(value);` at
line 658). The SAME instrument, imported from `tests/dom/composer-mount.ts`
rather than retyped, was pointed at each. Both reproduced:

```
Svelte error: effect_update_depth_exceeded
Maximum update depth exceeded. This typically indicates that an effect reads and writes the same piece of state
```

11.81s and 11.85s respectively, against 0.22s for the green path. The mutants
and their driver files were deleted; nothing under `src/` was ever edited.

`tests/dom/fixtures/effect-probe.svelte.ts` is the one-line control for the
whole capability: a bare `$effect.root` reporting **1** run here, against the
**0** the node project reports and that
`tests/classroom-composer-effect-reactivity.test.ts`'s header records.

**The AST sweep is kept and is not redundant.** It walks every `.svelte` file in
`src/` and catches the next occurrence anywhere in the repo, in a file nobody
has thought about, in milliseconds. It cannot run anything: it would read an
`untrack` moved one paren too far exactly as it reads a correct one. The mount
test is depth over one component. Deleting either leaves a real gap.

### The dependency

`happy-dom@20.11.14`, pinned EXACTLY (no caret), `devDependencies`.

**7 packages, 9,225,228 bytes apparent (8.79 MiB), 20.7 MiB on disk.**
happy-dom itself is 8,598,177 bytes; the six transitive ones are
`@types/whatwg-mimetype` (7,556), `@types/ws` (42,347), `buffer-image-size`
(17,156), `entities` (392,254), `whatwg-mimetype` (16,809) and `ws` (150,929).
All marked `dev`. The `node_modules` delta measured independently at 9,228,153
bytes, which agrees.

**`npm install` rewrote `package-lock.json` to TABS** -- npm copies
`package.json`'s indentation, and this repo's `package.json` is tab-indented --
turning a one-package add into a 4,647-insertion / 4,552-deletion whole-file
diff. Re-serialised at 2 spaces, the diff is **95 lines, all additions**, which
is reviewable. Worth knowing before the next dependency lands here.

### Results

| | files | tests | duration | wall |
|---|---|---|---|---|
| before (`33c0202`) | 147 | 3327 | 142.52s | 2m25.1s |
| after | 150 | 3338 | 140.12s | 2m21.6s |
| ├ `node` project | 148 | 3333 | | |
| └ `dom` project | 2 | 5 | | |

**No existing test changed result.** +3 files and +11 tests are exactly the
three files added here (6 + 3 + 2). Runtime moved -2.4s, which is inside
run-to-run noise; the dom project's own contribution is 5.37s wall for a cold
start it does not otherwise have, and 0.26s of actual test time.

The prompt's stated baseline of 3314 over 146 files belongs to an earlier sha:
`tests/feedback-meta-fields.test.ts` (13 tests, 1 file) landed via `4f25bcb` and
PR #47 between that measurement and this session's `git fetch`. 3314 + 13 =
3327; 146 + 1 = 147.

`svelte-check`: **0 errors, 37 warnings**, mix **31 `state_referenced_locally` /
5 `css_unused_selector` / 1 `perf_avoid_nested_class`** -- the baseline exactly.
`tests/**` is inside svelte-check's include, so the new files are checked; one
error was introduced and fixed here (a `ClassroomSection` fixture built by
casting past the type rather than satisfying it, which is also the better
fixture).

`npm run verify:browser`: **34 route/width runs, 258 measurements, 2 outside
threshold**, 92.9s wall -- unchanged. Both findings are the same pre-existing
pair: `/dev/pathways`'s own harness controls at 194.7x26.2 against the 44px
threshold, once at 375px and once at 1440px, clearing the 24px floor. It shares
no config with vitest, so a movement there would have been a finding in its own
right.

**Compile warnings doubled but did not change.** The run prints 7
vite-plugin-svelte warnings against 4 before -- the SAME 4 distinct warnings,
with 3 of them emitted twice because two projects now compile those components.
No new warning content.

### Not verified

* Nothing was run against the live Supabase project, and no migration was
  written or applied.
* No signed-in surface was driven; `verify:browser` covers `/dev` routes only.
* **happy-dom has no layout engine, measured**: `getBoundingClientRect()`
  returns 0x0, `offsetWidth`/`offsetHeight` are 0, and
  `getComputedStyle(el).color` is empty. Geometry, contrast and tap-target
  claims stay with `npm run verify:browser` and must not migrate here. What DOES
  work: `IntersectionObserver`, `ResizeObserver`, `requestAnimationFrame` (it
  fires), `matchMedia` (`prefers-reduced-motion: no-preference` is true),
  `localStorage`, `elementFromPoint` and `CSS.supports`.
* The `render()`-inside-`tests/dom/` inconsistency was characterised, not
  root-caused.

### Deferred: which existing SSR files would gain from the dom project

Reported, nothing moved. See the session summary for the full list with what
each would then be able to assert.
