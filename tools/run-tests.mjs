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
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------
// `--docs-only`: THE TEST FILES A DOCS-ONLY PUSH CAN CHANGE THE ANSWER OF
// (ledger 0335).
//
// `ci.yml` takes a fast path when a push touches nothing but `docs/**` and
// `*.md`. Skipping the suite outright would stop testing the files that READ
// those documents -- the standards version-header check, the CLAUDE.md name
// check, the ledger and history readers -- which is a loss, not a speed-up. So
// the fast path runs exactly the test files that reference a document, chosen
// by a RULE over each file's own source rather than a list somebody keeps: a
// list is stale the day a new doc-reading test lands, and the rule is not.
//
// THE RULE: with comments stripped, the file carries a string literal that
// names `docs`, a `.md` file, `CLAUDE`, `AGENTS` or `README`, or that names a
// path under `tools/` (a tool the test drives may read the documents itself).
// Comments are stripped because this repo's comments cite `docs/history/` on
// every other page, and counting a citation as a read would put most of the
// suite on the fast path and buy nothing.
//
// WHAT IT WAS MEASURED AGAINST: every working-tree read of `docs/**` or `*.md`
// by every test file, its workers and the node processes it spawned, recorded
// by an fs-tracing preload over one full run. Every file that read a document
// is matched by this rule; see ledger 0335's history entry for the counts.
// ---------------------------------------------------------------------------

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * Line and block comments out, string literals left alone.
 * @param {string} source
 * @returns {string}
 */
export function stripComments(source) {
	return source
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

const DOC_LITERAL = /['"`][^'"`\n]*(?:\bdocs\b|\.md\b|CLAUDE|AGENTS|README)[^'"`\n]*['"`]/;
const TOOL_LITERAL = /['"`][^'"`\n]*\btools\/[^'"`\n]*['"`]/;

/**
 * True when a test file's own source names a document or a tool.
 * @param {string} source
 * @returns {boolean}
 */
export function readsDocuments(source) {
	const code = stripComments(source);
	return DOC_LITERAL.test(code) || TOOL_LITERAL.test(code);
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
function testFiles(dir) {
	/** @type {string[]} */
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...testFiles(full));
		else if (entry.name.endsWith('.test.ts')) out.push(full);
	}
	return out;
}

// ---------------------------------------------------------------------------
// `--names-in-src`: A DOCUMENT THE APP ITSELF READS IS NOT DOCUMENTATION.
//
// The path rule in `ci.yml` (`docs_only_paths`) cannot see that
// `src/lib/frc/mdm-content.ts` imports `mdm-content-seed.md?raw` -- a root
// `*.md` file that is FRC page content, not a note about the code -- or that
// `src/lib/coin-desk/transaction-types.ts` names
// `docs/coin-economy/archive/2026-08-11-transactions.csv`, which
// `tests/coin-transaction-types.test.ts` then reads through that constant.
// Both were found by the same fs-tracing run, and neither is visible from the
// test file's own source. So a push whose documents are NAMED BY CODE under
// `src/` is not docs-only, and this is the check: it reads changed paths on
// stdin and exits 1, naming them, when a string literal in `src/` (comments
// stripped) is the path, or ends with `/<path>` after a `?query` is dropped
// (which is how a relative `?raw` import spells it). A path it cannot rule out
// is a full run; a path only a comment mentions is not a reason for one.
// ---------------------------------------------------------------------------

const SOURCE_EXTENSIONS = ['.ts', '.js', '.mjs', '.svelte'];
const STRING_LITERAL = /(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;

/**
 * @param {string} dir
 * @returns {string[]}
 */
function sourceFiles(dir) {
	/** @type {string[]} */
	const out = [];
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) out.push(...sourceFiles(full));
		else if (SOURCE_EXTENSIONS.some((e) => entry.name.endsWith(e))) out.push(full);
	}
	return out;
}

/**
 * The changed paths that a string literal in `root/src` names, in input order.
 * @param {string[]} paths
 * @param {string} [root]
 * @returns {string[]}
 */
export function pathsNamedBySource(paths, root = process.cwd()) {
	const literals = new Set();
	for (const f of sourceFiles(join(root, 'src'))) {
		const code = stripComments(readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, ''));
		for (const m of code.matchAll(STRING_LITERAL)) literals.add(m[2].replace(/\?.*$/, ''));
	}
	/** @param {string} p */
	const named = (p) => {
		for (const lit of literals) if (lit === p || lit.endsWith(`/${p}`)) return true;
		return false;
	};
	return paths.filter((p) => p !== '' && named(p));
}

/**
 * Every test file the docs-only fast path runs, repo-relative and sorted.
 * @param {string} [root]
 * @returns {string[]}
 */
export function docsReaderTests(root = REPO_ROOT) {
	return testFiles(join(root, 'tests'))
		.filter((f) => readsDocuments(readFileSync(f, 'utf8')))
		.map((f) => relative(root, f).replace(/\\/g, '/'))
		.sort();
}

function namesInSrc() {
	const paths = readFileSync(0, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);
	const named = pathsNamedBySource(paths);
	for (const p of named) console.log(`named by src/: ${p}`);
	process.exitCode = named.length > 0 ? 1 : 0;
}

function main() {
	if (process.argv.includes('--names-in-src')) return namesInSrc();

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

	// `--docs-only` is this script's flag, never vitest's: it is taken out of the
	// argument list and replaced by the file filters it stands for. An empty
	// selection is a FAILURE rather than a run of everything, because vitest reads
	// no filters as "every file", which would quietly turn the fast path into the
	// slow one -- or, worse, a rule that stopped matching into a green run of
	// nothing.
	let args = process.argv.slice(2);
	if (args.includes('--docs-only')) {
		const selected = docsReaderTests();
		if (selected.length === 0) {
			console.error('run-tests.mjs: --docs-only selected no test files; refusing to run.');
			process.exitCode = 1;
			return;
		}
		console.log(`run-tests.mjs: --docs-only selected ${selected.length} test file(s).`);
		args = [...args.filter((a) => a !== '--docs-only'), ...selected];
	}

	const started = Date.now();
	const result = spawnSync(
		process.execPath,
		[
			vitestBin,
			'run',
			'--no-file-parallelism',
			'--reporter=default',
			'--reporter=json',
			`--outputFile=${reportPath}`,
			...args
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

	// The wall clock of the vitest child, printed so a CI log and a local run
	// report the same figure (ledger 0335 measured its before and after with it).
	console.log(`run-tests.mjs: vitest wall ${((Date.now() - started) / 1000).toFixed(1)}s (status ${result.status ?? result.signal})`);

	process.exitCode = success ? 0 : 1;
}

// Run only as a script. A test imports this module for `docsReaderTests`, and
// importing it must not start a second vitest.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
