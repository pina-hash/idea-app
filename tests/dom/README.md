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

## Which project does my new file land in?

Its **directory** decides, and only its directory. There is no filename suffix,
no docblock and no glob to remember:

- a file under `tests/dom/` -> DOM project;
- a file anywhere else under `tests/` -> node project.

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
