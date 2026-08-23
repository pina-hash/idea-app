// tools/run-tests.mjs
//
// npm test runs THIS, not vitest directly, because vitest's own process exit
// code cannot be trusted in this repo.
//
// THE BUG. `tests/db/cluster.ts` (vitest's globalSetup, so it runs in the
// MAIN vitest process, once per run) imports `embedded-postgres`. Importing
// that package -- not starting it, not touching it, merely importing it --
// calls `AsyncExitHook(gracefulShutdown)` at module load time
// (node_modules/embedded-postgres/dist/index.js). `async-exit-hook` responds
// to Node's `beforeExit` event -- which fires whenever the event loop is
// about to drain, i.e. on every ordinary, non-crashing exit -- by calling
// `process.exit(0)` UNCONDITIONALLY. That clobbers whatever `process.exitCode`
// vitest had already set to report a failure, and the CLI exits 0 no matter
// how many tests failed.
//
// Reproduced with nothing but the import:
//
//   process.exitCode = 1;
//   await import('embedded-postgres');
//   // process exits 0 anyway.
//
// This is upstream (async-exit-hook@2.0.1, still current on the version
// embedded-postgres pins), not something this repo's config causes or can
// disable -- there is no flag to skip the hook. Confirmed on a real
// GitHub-hosted Linux runner as well as locally, so it is not a Windows
// artifact of this dev machine either. It went unnoticed for as long as it
// did because a human reads the printed "N failed" summary directly; only an
// automated gate that trusts the exit code is fooled.
//
// THE FIX DOES NOT TOUCH THE EXIT CODE AT ALL, because nothing here can stop
// async-exit-hook from resetting it. Instead: ask vitest to ALSO write a JSON
// summary (`--reporter=json`, alongside the normal human output), and read
// that file's own `success` boolean, which is written to disk before the
// clobbering `beforeExit` handler ever runs. That boolean is this script's
// entire truth, and `process.exitCode` is set from it, not from vitest's.
//
// Upgrading embedded-postgres was considered and rejected here: the pinned
// version is several majors behind latest, and swapping it as a side effect
// of a CI fix is exactly the kind of change CLAUDE.md's "surgical edits"
// convention rules out -- it would touch the Postgres version every migration
// test runs against, which is a decision on its own.

import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const reportPath = `.vitest-result-${randomUUID()}.json`;

// vitest's OWN cli entry (node_modules/vitest/vitest.mjs), run directly with
// `node` rather than through `npx`. `npx` resolves to `npx.cmd` on Windows, a
// batch file Node's spawnSync cannot exec without `shell: true` -- and
// `shell: true` with an argv array is a documented Node footgun (DEP0190):
// the arguments are concatenated into one command line rather than passed
// through as discrete argv entries, so anything forwarded from
// `process.argv` (a caller running `npm test -- some/path with spaces`) would
// need shell-escaping this file does not do. Invoking the package's real bin
// file with plain `node` needs no shell on either platform and has none of
// that risk.
const vitestBin = fileURLToPath(new URL('../node_modules/vitest/vitest.mjs', import.meta.url));

const result = spawnSync(
	process.execPath,
	[
		vitestBin,
		'run',
		'--no-file-parallelism',
		'--reporter=default',
		'--reporter=json',
		`--outputFile=${reportPath}`,
		...process.argv.slice(2)
	],
	{ stdio: 'inherit' }
);

// A crash before the JSON reporter could write anything (vitest itself
// failing to start, a config error) has no report to read -- that case is a
// real failure and the spawn's own signal/status says so directly.
//
// `finally` always runs here, on every path, including the catch: nothing
// below ever calls `process.exit()` directly (which would terminate before
// `finally` had a chance to), only sets `process.exitCode` and lets the
// script reach its natural end. This wrapper's own process never imports
// `embedded-postgres` -- vitest runs as a CHILD via spawnSync -- so it has no
// `beforeExit` handler of its own to fight and `process.exitCode` here is
// trustworthy.
let success = false;
try {
	success = JSON.parse(readFileSync(reportPath, 'utf8')).success === true;
} catch {
	console.error(
		'\nrun-tests.mjs: no JSON report was written -- vitest did not complete a run to report on.'
	);
} finally {
	rmSync(reportPath, { force: true });
}

if (!success) {
	console.error(
		'\nrun-tests.mjs: vitest reported failures (or produced no report); ' +
			'failing the process because vitest’s own exit code cannot be trusted here (see the comment at the top of this file).'
	);
}

process.exitCode = success ? 0 : 1;
