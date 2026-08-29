#!/usr/bin/env node
// NEGATIVE CONTROLS for `../../routes.mjs`'s loader guards, the same argument
// `../../selftest.mjs`'s header makes about a browser check: a guard nobody
// has fired is a guard nobody has tested. The split's loader refuses on two
// failure modes -- a filename that disagrees with its own spec's `path`, and
// two files claiming the same `path` -- and until this script existed, neither
// had ever actually thrown.
//
//   node tools/browser-verify/routes/_tools/verify-loader-guards.mjs
//
// Both controls mutate the REAL routes/ directory (there is nowhere else the
// loader will look -- `ROUTES_DIR` in routes.mjs is a sibling of routes.mjs
// itself, not a parameter), and restore it from an in-memory copy taken
// before the mutation, never with `git checkout --` (CLAUDE.md: that is a
// discard-to-HEAD, not a scoped undo, and it has cost three sessions their own
// uncommitted work). Each control re-imports routes.mjs with a cache-busting
// query string, because a bare `import('../../routes.mjs')` would resolve to
// whatever this process already has cached from an earlier import.
//
// Exits 0 with "ALL GUARDS FIRED" if both controls threw the right way, exits
// 1 and names which one did not otherwise -- the same contract selftest.mjs's
// CASES loop keeps for a browser check.

import { readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROUTES_DIR = fileURLToPath(new URL('../', import.meta.url));
const ROUTES_MJS = fileURLToPath(new URL('../../routes.mjs', import.meta.url));

async function importFresh() {
	return import(`${ROUTES_MJS}?bust=${Date.now()}-${Math.random()}`);
}

async function expectThrow(label, run, mustInclude) {
	try {
		await run();
	} catch (err) {
		const msg = String(err && err.message ? err.message : err);
		if (!msg.includes(mustInclude)) {
			return { label, ok: false, detail: `threw, but message did not name what it should:\n  got: ${msg}\n  wanted to see: ${mustInclude}` };
		}
		return { label, ok: true, detail: msg };
	}
	return { label, ok: false, detail: 'loader did not throw at all -- the guard is silently gone' };
}

const results = [];

// Control 1: a filename that disagrees with its own spec's `path`.
{
	const victim = `${ROUTES_DIR}pathways.mjs`;
	const decoy = `${ROUTES_DIR}pathways-renamed-wrong.mjs`;
	if (!existsSync(victim)) throw new Error(`fixture route missing: ${victim} -- did routes/pathways.mjs move?`);
	renameSync(victim, decoy);
	try {
		results.push(
			await expectThrow(
				'filename disagrees with its own path',
				importFresh,
				'filename does not match its own path'
			)
		);
	} finally {
		renameSync(decoy, victim);
	}
}

// Control 2: two files naming the same route `path`. The loader reads the
// directory in SORT ORDER (readdirSync().sort()), and the duplicate/slug
// checks only see a collision against a path or slug ALREADY recorded by an
// earlier file in that order -- so the decoy's filename must sort AFTER
// `pathways.mjs` (never `pathways-*`, which sorts before it: '-' < '.' in
// ASCII, so any `pathways-...` name is processed first and would report its
// OWN filename mismatch, not a duplicate of one that has not loaded yet).
{
	const source = `${ROUTES_DIR}pathways.mjs`;
	const dupe = `${ROUTES_DIR}zzz-duplicate-of-pathways.mjs`;
	if (existsSync(dupe)) throw new Error(`fixture collision: ${dupe} already exists -- leftover from a prior failed run?`);
	const original = readFileSync(source, 'utf8');
	// Same `path:` (and therefore the same slug the loader derives from it),
	// under a filename that does NOT match that slug -- proving the guard
	// fires on the PATH collision itself, independent of whether the second
	// file also happens to be misnamed.
	writeFileSync(dupe, original.replace(/export const order = \d+;/, ''));
	try {
		results.push(await expectThrow('duplicate route path across two files', importFresh, 'duplicate route path'));
	} finally {
		unlinkSync(dupe);
	}
}

// A mutation left behind by a failed run must not read as the fixture
// restoring itself byte-identically -- assert the directory is back to what
// it started as.
{
	const after = readFileSync(`${ROUTES_DIR}pathways.mjs`, 'utf8');
	results.push({
		label: 'pathways.mjs restored byte-identically after both controls',
		ok:
			existsSync(`${ROUTES_DIR}pathways.mjs`) &&
			!existsSync(`${ROUTES_DIR}pathways-renamed-wrong.mjs`) &&
			!existsSync(`${ROUTES_DIR}zzz-duplicate-of-pathways.mjs`),
		detail: after.length ? `${after.length} bytes` : 'MISSING'
	});
}

let allOk = true;
for (const r of results) {
	console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.label}`);
	console.log(`  ${r.detail.split('\n').join('\n  ')}`);
	if (!r.ok) allOk = false;
}

if (allOk) {
	console.log('\nALL GUARDS FIRED');
	process.exit(0);
} else {
	console.error('\nA LOADER GUARD DID NOT FIRE AS EXPECTED -- see FAIL lines above');
	process.exit(1);
}
