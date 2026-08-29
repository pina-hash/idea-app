# `tests/dom/` -- the DOM vitest project

Everything in this directory runs in a **second vitest project** with a DOM
(`happy-dom`) and svelte's **client build**. Everything else under `tests/` runs
in the node project, on the **server build**, exactly as the whole suite did
before this directory existed.

The two projects are declared in `vitest.config.ts`; its header carries the full
argument. This file is the short version, for whoever opens this directory.

## What you get here that you do not get anywhere else

- `mount()` works, so a component's `$effect`s **actually run**.
- `flushSync()`, `tick()` and the real effect scheduler.
- `document`, `window` and real DOM APIs.

That is the entire reason the split exists. Everywhere else in the suite,
`mount()` raises `lifecycle_function_unavailable` and a bare `$effect.root`
invokes its callback **zero times** -- so a reactivity control written outside
this directory is green and vacuous, which is worse than no control.

It also means real events reach real listeners: `dispatchEvent` on a mounted
node runs the component's handler, `preventDefault` is readable afterwards, and
`localStorage` is a real store that survives an unmount. Six files here now
depend on that -- the disclosure toggle, the manager write boundary, the upload
drag/drop/paste, the module collapse, the Foundry stage's full-screen and stop
controls, and the feedback box's optional contact field.

**And it is the only place a claim about DOM IDENTITY can be made at all.**
`svelte/server`'s `render()` produces one string per call, so "the same node
survived this state change" is not a question it can be asked -- there is no
node, and no second render to compare one against.
`foundry-app-stage-mount.test.ts` exists for exactly that: full screen must add
a class to the stage while the running bundle's `<iframe>` keeps its identity
and its `src`, because a remount restarts a student's app at the moment they
asked for more room. It renders pixel-identically either way, so nothing else
can see it.

## THE HARD LIMIT: THERE IS NO LAYOUT ENGINE

happy-dom parses and cascades; it does not lay out. Measured in this project:

| read | happy-dom answers |
| --- | --- |
| `el.getBoundingClientRect()` | `{x:0, y:0, width:0, height:0, ...}` |
| `el.offsetWidth` | `0` |
| `getComputedStyle(el).color` | `""` (the empty string) |
| `getComputedStyle(el).display` | `"block"` -- a cascade answer, not a laid-out one |

So a geometry, contrast or tap-target assertion written here **reads zero and
passes vacuously**. That is not a hypothetical: it is the shape of instrument
bug that hid in the browser harness for weeks. `display` resolving correctly is
the trap inside the trap -- some computed properties are real here, which makes
the ones that are not look trustworthy.

**Those claims belong in `npm run verify:browser` and nowhere else.** It drives
a real Chromium at 375px and 1440px and reports measured numbers. What belongs
HERE is structure, events, effects and storage.

An assertion in this directory that reads a box, a colour, or a 44px target is
a bug in the test, whatever it currently reports.

## What you should NOT do here

- **Do not `import { render } from 'svelte/server'`.** Components here compile
  to client output, which the server renderer cannot execute. It fails -- but
  measured across arrangements it failed *inconsistently*, and when it does fail
  the message is `Cannot read properties of undefined (reading 'call')`, which
  names nothing about builds, projects or conditions.
  `tests/vitest-project-node.test.ts` refuses that import by name so nobody has
  to debug it. **SSR `render()` tests belong in `tests/`**, where 22 of them
  already live.
- **Do not put a database test here.** The embedded-Postgres cluster is
  `globalSetup` on the node project only; asking for it here would boot a second
  one.
- **Do not assert geometry, contrast or a tap target here.** See the section
  above; there is no layout engine and the read comes back zero.

## Two environment facts measured here, both of which cost a detour

**happy-dom NAVIGATES an `<iframe>` for real.** A frame whose `src` is an
absolute https URL makes an actual network request when it is connected -- so a
mount test that renders one reaches the host in the URL, and its teardown
aborts the request and prints a page of `AsyncTaskManager` traces. Turning it
off with `disableIframePageLoading` stops the network but reports every blocked
navigation to the page console instead (12 `NotSupportedError` traces for the
ten tests in the Foundry stage file), and happy-dom's
`handleDisabledFileLoadingAsSuccess` is not read on the iframe path -- only by
script and link elements. **The setting that works is a fetch interceptor**,
`window.happyDOM.settings.fetch.interceptor`, which answers the frame from
memory: no socket, no console output, and the element behaves as the component
expects. `foundry-app-stage-mount.test.ts` sets one in `beforeAll`.

**Tiptap/ProseMirror runs here, fully.** Probed against the real
`NoteEditor.svelte` (measured, this bundle, not migrated): the editor mounts
with no throw, the element carries a real `pmViewDesc`, `onready` fires once
with `{"type":"doc","content":[{"type":"paragraph"}]}`, and a real `paste`
`ClipboardEvent` carrying `text/html` reaches ProseMirror and produces the
edited document. Note that `onchange` fires ONCE AT MOUNT from the seeding
transaction, before anybody has typed -- which is the defect `EditBaseline`
exists to absorb, and it behaves correctly here too: seeded on the ready doc,
`changed()` is `false` for that seeding transaction and `true` after the paste.
So the notebook's dirty-signal surfaces are a viable next bundle rather than a
dead end. **The pane's keyboard limitation still applies**: drive an editor with
a `paste` event, not with dispatched Enter/Tab keys.

## The instruments

`mount.ts`, `drag-events.ts` and `reactive-props.svelte.ts` are the shared
driving code, and `composer-mount.ts` is one test's own.

`reactive-props.svelte.ts` is what lets a test change a prop on a MOUNTED
component. `mount(C, { props })` reads props off the object it is handed, so an
ordinary object is a one-shot and an effect keyed on a prop can never be made to
re-run; wrapping it in `$state` gives the component the same reactive reads a
real parent gives it. It is a `.svelte.ts` module because runes need one, and
`mount.ts` beside it stays plain TypeScript so the files already importing it
do not move. They are **not** `.test.ts`, so vitest
does not collect them, and they are kept apart from the assertions for the
reason `composer-mount.ts` states in its own header: a mutation proof drives the
identical instrument against a deliberately broken component, and a body retyped
into a test file characterizes what somebody believed it did.

`drag-events.ts` documents the one payload happy-dom will not build correctly --
its `DataTransfer.types` reports a file's MIME type where a browser reports the
literal `'Files'` that `isFileDrag` reads by specification -- and overrides that
and nothing else.

## Which project does my new file land in?

Its **directory** decides, and only its directory. There is no filename suffix,
no docblock and no glob to remember:

- a file under `tests/dom/` -> DOM project;
- a file anywhere else under `tests/` -> node project.

**Prefer the node project when either would do.** A mount costs about an order
of magnitude more per test than a server render. Measured on the same four
components, same fixtures, both halves of this directory's classroom work:

| | tests | test time | per test |
| --- | --- | --- | --- |
| the four SSR files (node) | 46 | 71ms | ~1.5ms |
| the four mount files (dom) | 26 | 871ms | ~33ms |

About 22x. In absolute terms that is still small -- the whole DOM project is
31 tests in ~1.1s of test time, and adding these four files moved the full
suite's wall clock from 116.3s to 114.8s, i.e. not at all against run-to-run
noise. So the cost is worth paying for a behavioural claim and is not worth
paying for one a `render()` string already settles.

Both wrong choices fail rather than pass, which is what makes this safe to
forget:

- a mount test written **outside** this directory fails on its first run with
  `mount(...) is not available on the server`, which names the problem;
- an SSR test written **inside** it is refused by name by
  `tests/vitest-project-node.test.ts`.

## How you would notice if a project silently changed build

This is the failure the whole arrangement guards against, because it does not
announce itself: a config edit that put the `browser` condition on the node
project, or took it off this one, would leave 3000+ tests passing while meaning
something else.

`tests/vitest-project-node.test.ts` and `tests/dom/vitest-project-dom.test.ts`
are a matched pair that assert, **behaviourally**, which build their own project
got. Both obvious cheaper instruments were measured here and both are wrong:

- `import.meta.resolve('svelte')` answers `src/index-server.js` in **both**
  projects -- it uses Node's resolver, which knows nothing about Vite's
  conditions.
- The two builds **export the same names**. `Object.keys` of the `svelte`
  namespace is identical in both, `flushSync` and `mount` included; the server
  build ships stubs rather than omitting anything.

What separates them is what `mount()` *does*. That is what the pair asserts.

## The DOM and the build are two different axes

Measured, by removing `conditions: ['browser']` from this project and leaving
happy-dom in place: `document` was still a real object, and `mount()` still
raised `lifecycle_function_unavailable` with the target left empty.

**Adding an environment does not change which build you are on.** Both files in
the pair therefore assert both axes separately rather than testing one and
inferring the other.
