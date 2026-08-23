import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * THE BUILD STEP THAT MAKES THE HOST BRANCH REACHABLE AT ALL.
 *
 * `hooks.server.ts` decides what the bundle host may serve, and it only
 * decides for requests that reach the function. Vercel answers `static/` and
 * `_app/immutable/*` off the filesystem WITHOUT INVOKING IT, so before
 * `scripts/foundry-edge-routes.mjs` existed those paths were served on the
 * apps host whatever the hook said -- measured on production:
 * `/coins/index.html` at 177,019 bytes of text/html, plus `/robots.txt`,
 * `/push-sw.js`, `/manifest.webmanifest` and every client asset.
 *
 * THIS IS THE TEST THAT MATTERS FOR THAT TIER, and the reason it is a test
 * rather than a browser pass is that its failure is SILENT: a script that
 * stops inserting its route leaves a deployment that looks completely normal
 * on the main host and quietly serves the whole static tier on the bundle one.
 * Nothing on screen reports it.
 *
 * IT ASSERTS POSITION, NOT PRESENCE. Being in the route table is not enough:
 * `adapter-vercel` emits `{ src: '/_app/immutable/.+', headers: {...} }` with
 * no `continue`, which terminates the pre-filesystem phase, and a route placed
 * after it cannot see those requests. That single rule is why a `vercel.json`
 * entry could not close this tier and a build-output edit can.
 */

const SCRIPT = path.resolve('scripts/foundry-edge-routes.mjs');

/** The shape `adapter-vercel` actually emits, in its actual order. */
const adapterConfig = () => ({
	version: 3,
	routes: [
		{ src: '/_app/immutable/.+', headers: { 'cache-control': 'public, immutable, max-age=31536000' } },
		{ handle: 'filesystem' },
		{ src: '/_app/immutable/.+', status: 404, headers: { 'cache-control': 'no-store' }, continue: false },
		{ src: '/.*', dest: '/![-]/catchall' }
	]
});

let dir: string | null = null;

function run(config: unknown, env: Record<string, string> = {}) {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-edge-'));
	fs.mkdirSync(path.join(dir, '.vercel', 'output'), { recursive: true });
	fs.writeFileSync(path.join(dir, '.vercel/output/config.json'), JSON.stringify(config));
	const stdout = execFileSync(process.execPath, [SCRIPT], {
		cwd: dir,
		encoding: 'utf8',
		env: { ...process.env, PUBLIC_FOUNDRY_APPS_HOST: '', ...env }
	});
	const written = JSON.parse(fs.readFileSync(path.join(dir, '.vercel/output/config.json'), 'utf8'));
	return { stdout, written };
}

afterEach(() => {
	if (dir) fs.rmSync(dir, { recursive: true, force: true });
	dir = null;
});

describe('foundry edge route', () => {
	it('puts the apps host ahead of the adapter rule that would otherwise win', () => {
		const { written } = run(adapterConfig(), { PUBLIC_FOUNDRY_APPS_HOST: 'apps.example.test' });

		expect(written.routes[0]).toEqual({
			src: '^/.*$',
			has: [{ type: 'host', value: 'apps.example.test' }],
			dest: '/![-]/catchall'
		});

		// POSITION IS THE POINT. The adapter's immutable rule is terminal, so
		// being anywhere behind it is being nowhere.
		const ours = 0;
		const immutable = written.routes.findIndex(
			(r: { src?: string; headers?: Record<string, string> }) =>
				r.src === '/_app/immutable/.+' && r.headers?.['cache-control']?.includes('immutable')
		);
		expect(immutable).toBeGreaterThan(ours);

		// And ahead of the filesystem handle, or static files answer first.
		const filesystem = written.routes.findIndex((r: { handle?: string }) => r.handle === 'filesystem');
		expect(filesystem).toBeGreaterThan(ours);

		// Nothing the adapter wrote was dropped.
		expect(written.routes.length).toBe(adapterConfig().routes.length + 1);
	});

	it('takes the destination from the generated config rather than a literal', () => {
		const renamed = adapterConfig();
		renamed.routes[3] = { src: '/.*', dest: '/__internal__/catchall' };
		const { written } = run(renamed, { PUBLIC_FOUNDRY_APPS_HOST: 'apps.example.test' });
		expect(written.routes[0].dest).toBe('/__internal__/catchall');
	});

	it('adds nothing when no apps host is configured, matching isFoundryAppsHost', () => {
		const { written, stdout } = run(adapterConfig());
		expect(written.routes).toEqual(adapterConfig().routes);
		expect(stdout).toContain('unset');
	});

	it('fails the build loudly rather than silently skipping', () => {
		const noCatchall = { version: 3, routes: [{ handle: 'filesystem' }] };
		expect(() => run(noCatchall, { PUBLIC_FOUNDRY_APPS_HOST: 'apps.example.test' })).toThrow();
	});
});
