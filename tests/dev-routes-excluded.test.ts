// tests/dev-routes-excluded.test.ts
//
// NO HARNESS IS COMPILED INTO A PRODUCTION BUILD, AND A NEW ONE INHERITS THAT.
//
// WHY THIS IS AUTOMATED when most feature work here is not: the regression is
// SILENT in both directions. A harness that starts shipping shows nothing on
// any screen -- it 404s either way -- and the only symptom is that its code is
// in the bundle, which nobody looks at. And a rule that stopped matching
// `src/routes/dev/` at all would still leave every route 404ing, because the
// runtime `if (!dev)` guards are still in the source; the build would just
// quietly carry 720 KB of harness again.
//
// WHAT THE MEASUREMENT WAS. Before this rule existed, a production build put
// 105 dev route entry files totalling 720,149 bytes into the server bundle,
// `/dev/login` and `/dev/classroom-upload` among them. After it: the same 105
// paths, 19,150 bytes, every one of them a 404 stub.
//
// THE SWEEP ASSERTS ITS OWN CASE COUNT, so a glob that matched nothing cannot
// pass as "everything is covered".

import { describe, expect, test } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DEV_ROUTE_PREFIX, devRouteStub, isDevRouteEntry } from '../src/lib/dev-routes';

const ROUTES_DIR = join(process.cwd(), 'src', 'routes');
const DEV_DIR = join(ROUTES_DIR, 'dev');

/** Every file under a directory, recursively, as repo-relative forward-slash paths. */
function walk(dir: string): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir)) {
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) out.push(...walk(full));
		else out.push(full.replace(/\\/g, '/').slice(process.cwd().replace(/\\/g, '/').length + 1));
	}
	return out;
}

const isEntryName = (path: string): boolean => {
	const name = path.slice(path.lastIndexOf('/') + 1);
	return /^\+(page|layout|server|error)(\.[a-z]+)*\.(svelte|ts|js)$/.test(name);
};

describe('the dev-route exclusion rule', () => {
	test('matches every route entry file under src/routes/dev, and the sweep is not empty', () => {
		const all = walk(DEV_DIR);
		const entries = all.filter(isEntryName);

		// The sweep's own case count. 105 entry files is what the production
		// build reported; this asserts the glob still finds a comparable set
		// rather than silently finding none.
		expect(all.length, 'files under src/routes/dev').toBeGreaterThan(50);
		expect(entries.length, 'route entry files under src/routes/dev').toBeGreaterThan(40);

		const missed = entries.filter((p) => !isDevRouteEntry(p));
		expect(missed, 'dev route entries the rule does not match').toEqual([]);
	});

	test('every matched entry gets a stub, and every stub is a 404', () => {
		const entries = walk(DEV_DIR).filter(isEntryName);
		let svelte = 0;
		let endpoint = 0;
		let loader = 0;

		for (const path of entries) {
			const stub = devRouteStub(path);
			expect(stub, `no stub for ${path}`).not.toBeNull();
			const name = path.slice(path.lastIndexOf('/') + 1);

			if (name.endsWith('.svelte')) {
				svelte += 1;
				// An empty component: no markup, no script, nothing to render.
				expect(stub).not.toContain('<script');
			} else if (name.startsWith('+server.')) {
				endpoint += 1;
				// `fallback` rather than per-verb handlers, so no method answers
				// 405 and thereby confirms the endpoint is there.
				expect(stub).toContain('export const fallback');
				expect(stub).toContain("error(404, 'Not found')");
			} else {
				loader += 1;
				expect(stub).toContain('export const load');
				expect(stub).toContain("error(404, 'Not found')");
			}
		}

		expect(svelte + endpoint + loader, 'entries classified').toBe(entries.length);
		expect(svelte, 'component entries').toBeGreaterThan(0);
		expect(loader, 'load entries').toBeGreaterThan(0);
	});

	test('the two routes that are an auth surface are covered by name', () => {
		// Named individually because these two are the reason the rule exists:
		// /dev/login is a password sign-in, /dev/classroom-upload drives the
		// real upload panel. A refactor that reorganised the sweep must not be
		// able to drop either without a test saying so.
		for (const path of [
			'src/routes/dev/login/+page.server.ts',
			'src/routes/dev/login/+page.svelte',
			'src/routes/dev/classroom-upload/+page.server.ts',
			'src/routes/dev/classroom-upload/+page.svelte'
		]) {
			expect(isDevRouteEntry(path), path).toBe(true);
			expect(devRouteStub(path), path).not.toBeNull();
		}
	});

	test('NOTHING OUTSIDE src/routes/dev is touched', () => {
		// THE POSITIVE CONTROL IS THE PREVIOUS TEST: the rule demonstrably
		// matches ~50 real files, so an empty result here is a boundary and not
		// a rule that matches nothing.
		const outside = walk(ROUTES_DIR).filter((p) => !p.includes(DEV_ROUTE_PREFIX));
		expect(outside.length, 'route files outside /dev').toBeGreaterThan(100);

		const wrongly = outside.filter((p) => isDevRouteEntry(p) || devRouteStub(p) !== null);
		expect(wrongly, 'non-dev files the rule would stub').toEqual([]);

		// The sharp cases: a real route whose path merely CONTAINS "dev", and
		// the classroom item route, which is the closest live neighbour.
		for (const path of [
			'src/routes/classroom/[sectionId]/+page.svelte',
			'src/routes/api/classroom/attachment/+server.ts',
			'src/routes/development/+page.svelte',
			'src/routes/dev-notes/+page.server.ts'
		]) {
			expect(isDevRouteEntry(path), path).toBe(false);
			expect(devRouteStub(path), path).toBeNull();
		}
	});

	test('a non-entry file inside /dev is left alone', () => {
		// Fixtures and helpers are reached only THROUGH an entry, so stubbing
		// the entry drops them from the graph on its own. Stubbing them
		// directly is the one way to break something outside /dev that imported
		// one.
		for (const path of [
			'src/routes/dev/classroom-upload/fixture.ts',
			'src/routes/dev/login/helpers.ts',
			'src/routes/dev/shared/sample-data.ts'
		]) {
			expect(isDevRouteEntry(path), path).toBe(false);
			expect(devRouteStub(path), path).toBeNull();
		}
	});

	test('windows backslash ids are matched the same as posix ones', () => {
		// Vite hands back native separators on Windows, which is where this
		// runs. A rule that only matched forward slashes would ship every
		// harness from a Windows build and nothing would say so.
		expect(isDevRouteEntry('C:\\idea-app\\src\\routes\\dev\\login\\+page.server.ts')).toBe(true);
		expect(devRouteStub('C:\\idea-app\\src\\routes\\dev\\login\\+page.svelte')).not.toBeNull();
	});

	test('a query suffix on the id does not defeat the match', () => {
		// vite-plugin-svelte appends `?svelte&type=style` and friends.
		expect(isDevRouteEntry('src/routes/dev/login/+page.svelte?svelte&type=style')).toBe(true);
	});
});
