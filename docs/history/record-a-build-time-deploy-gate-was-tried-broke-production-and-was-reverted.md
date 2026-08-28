---
title: "A build-time deploy gate was tried, broke production, and was reverted"
date: 2026-08-23
branches: []
migrations: []
subsystems: ["IDEA Foundry"]
record_order: 123
---

## A build-time deploy gate was tried, broke production, and was reverted

**Do not put the test suite on the Vercel build's critical path again without
reading this first.**

A prior session added `.github/workflows/ci.yml` (push to `main` and PRs
against it, running `npm run check` then `npm test`) and, separately, set
`vercel.json`'s `buildCommand` to `npm test -- --no-file-parallelism && npm
run build` so a broken suite would block the deploy rather than only being
reported after the fact. It was verified locally: the test gate passed twice
cold, and the chained `npm run build` completed its entire compile/bundle pass
before hitting an unrelated, pre-existing local Node-major limitation on the
verifying machine (see the adapter-vercel trap in `CLAUDE.md`'s Machine and
toolchain section). What was not, and could not be, verified locally was the
one thing that mattered: whether `npm test` runs at all inside Vercel's own
build container.

**It does not.** The Vercel build of that commit failed in **12 seconds**,
before a single test ran. `npm install` reported that its `allow-scripts`
policy had blocked the `postinstall` scripts for `esbuild` and
`@embedded-postgres/linux-x64` -- the two packages vitest's dependency
optimizer and the test harness's embedded Postgres respectively need their
native binaries fetched or built for. Immediately after, vitest's dependency
optimization (which runs through rolldown before a single test file loads)
died with `Could not resolve 'node:module'`, because the native `esbuild`
binary `allow-scripts` had just blocked was the thing rolldown needed to
resolve it. Production stayed on the previous deployed commit throughout --
Vercel does not promote a build that fails -- but every subsequent push was
now equally unable to build until this was reverted (`git revert eab3849`,
this session, pushed first and separately from the other two fixes below,
specifically so the unstick was not entangled with anything else).

**Why this is not a "fix the allow-scripts policy" problem.** Vercel's build
container runs `npm install` under a script-execution allowlist that this
repo's dependency tree was never vetted against, because nothing in this repo
previously needed a devDependency's native binary to exist for `vite build`
to succeed -- `esbuild` ships as a transitive dep of the Vite/SvelteKit build
chain either way, but *building the app* does not route through vitest's
optimizer, only *running the test suite* does. The moment the suite joined the
build's critical path, the build container's dependency-install policy became
something this deploy could fail on for reasons that have nothing to do with
whether the code is correct. Loosening `allow-scripts` for the Vercel project
is a workaround for that specific symptom, not an answer to the underlying
mismatch.

**The underlying mismatch, stated plainly: a test suite that stands up an
embedded Postgres with a native binary does not belong on the critical path of
a production deploy.** It has a real, non-code failure mode (a blocked native
postinstall) that a pure `vite build` never exercises, and that failure mode
is specific to Vercel's build container's own policy -- nothing about it would
have shown up running the same command on a developer's machine or on a
GitHub-hosted runner with no such allowlist. **GitHub Actions on a real
runner (`.github/workflows/ci.yml`, kept from the prior session, unaffected by
any of this) is where the suite's enforcement belongs**: it reports the same
information -- did `npm test` and `npm run check` pass -- without gating
whether `ideabosco.com` can receive the next commit on it succeeding.

**Fixed at the source, same session:** bare `npm test` (what both the
workflow and the abandoned `buildCommand` invoked) was independently found to
be racy for a second, unrelated reason -- vitest's default file parallelism
races `tests/db/supabase-stub.sql`'s `create role ... if not exists` guards
against the one shared embedded Postgres cluster and fails
nondeterministically. `--no-file-parallelism` is now passed to vitest by
`tools/run-tests.mjs`, which the `test` script in `package.json` runs, so there
is no bare, broken invocation left for a future build-gate attempt (or a
developer running the suite by hand) to reach for by mistake.

**If a build-time gate is ever wanted again, `npm run check` alone is the
candidate worth testing** -- it has no native dependency (`svelte-check` and
`svelte-kit sync` are pure TypeScript/Svelte tooling, nothing shells out to a
downloaded binary or a Postgres server) and so has no equivalent
allow-scripts failure mode to hit. **This has not been tested against
Vercel's build container.** Before wiring it into `buildCommand`, verify it
actually runs there the same way this session verified `npm test` did not --
a preview deployment on a branch, watched, not inferred from a local pass.

### NOT verified / not done

- **`npm run check` was not tried as a build gate.** Named above as the
  candidate worth testing next, specifically because it was NOT tested this
  session.
- **Vercel's `allow-scripts` policy was not changed or investigated further.**
  Loosening it was considered and rejected as the wrong fix (see above), not
  attempted.
- **No migration.** Nothing here touches the database schema.

---

