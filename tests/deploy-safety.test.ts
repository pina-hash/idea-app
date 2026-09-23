import { existsSync, readFileSync, statSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
	CHUNK_LOAD_MESSAGE,
	PROJECTOR_ROUTES,
	WAKE_CHECK_MIN_GAP_MS,
	activeDeployHolds,
	beginResumedNavigation,
	deployHoldsWarnOnUnload,
	deployReloadVerdict,
	holdDeployReload,
	isChunkLoadError,
	isProjectorRoute,
	onDeployHoldsChange,
	registerVersionCheck,
	requestVersionCheck,
	resumedNavigation,
	trackInFlight,
	type DeployVerdictInput
} from '../src/lib/shell/deploy-safety';

/**
 * DEPLOY SAFETY, asserted where it fails SILENTLY.
 *
 * A reload that should not have happened looks like an ordinary page load, and
 * one that should have happened and did not looks like nothing at all -- both
 * are invisible until a student's typed answer or a teacher's staged files are
 * gone, or a tab runs a stale build into a 404. So every rule of
 * `deployReloadVerdict` is asserted in BOTH directions here, against a base
 * navigation that DOES reload, with `updated: false` as the negative control
 * that must refuse everything.
 *
 * WHERE THE EXPECTED VALUES COME FROM: the rules in the brief (ledger 0297,
 * package F6) and SvelteKit's own route ids, read off `src/routes` on disk --
 * never from the implementation's own tables. The route registry is checked
 * against the directory tree so a renamed route reddens here rather than
 * silently falling out of protection.
 */

/** A navigation that reloads: every rule satisfied. Each case moves ONE field. */
const RELOADS: DeployVerdictInput = {
	updated: true,
	type: 'link',
	fromPath: '/classroom/s-1',
	toPath: '/classroom/s-1/item/i-9',
	fromRouteId: '/classroom/[sectionId]',
	fullscreen: false,
	holds: [],
	resumed: false
};

const verdict = (patch: Partial<DeployVerdictInput>) => deployReloadVerdict({ ...RELOADS, ...patch });

describe('deployReloadVerdict: the positive control and the negative one', () => {
	it('reloads a link to a new page when a newer version exists and nothing holds', () => {
		expect(deployReloadVerdict(RELOADS)).toEqual({ reload: true, reason: 'reload' });
	});

	it('never reloads when there is no newer version, whatever else is true', () => {
		expect(verdict({ updated: false })).toEqual({ reload: false, reason: 'not-updated' });
		// ...including every input that would otherwise reload on its own.
		for (const type of ['link', 'popstate', 'goto']) {
			expect(verdict({ updated: false, type, resumed: true }).reload).toBe(false);
		}
	});
});

describe('rule: only a navigation the person made', () => {
	const cases: [string, Partial<DeployVerdictInput>, boolean][] = [
		['a link', { type: 'link' }, true],
		['the back or forward button', { type: 'popstate' }, true],
		['a programmatic goto', { type: 'goto' }, false],
		['the save guard re-issuing a link after its flush', { type: 'goto', resumed: true }, true],
		['a form', { type: 'form' }, false],
		['a form, even marked resumed', { type: 'form', resumed: true }, false],
		['the initial enter', { type: 'enter' }, false],
		['leaving the site', { type: 'leave' }, false],
		['no type at all', { type: null }, false]
	];
	it.each(cases)('%s', (_label, patch, reloads) => {
		const v = verdict(patch);
		expect(v.reload).toBe(reloads);
		if (!reloads) expect(v.reason).toBe('navigation-type');
	});
	it('covered every case it lists', () => {
		expect(cases.length).toBe(9);
		expect(cases.filter((c) => c[2]).length).toBe(3);
	});
});

describe('rule: the pathname must change', () => {
	it('refuses a query-only move, which keeps the same component and its memory', () => {
		expect(
			verdict({ fromPath: '/ideacad', toPath: '/ideacad' })
		).toEqual({ reload: false, reason: 'same-path' });
		expect(
			verdict({ fromPath: '/notebook', toPath: '/notebook', type: 'popstate' })
		).toEqual({ reload: false, reason: 'same-path' });
	});
	it('refuses when either end is unknown', () => {
		expect(verdict({ fromPath: null }).reason).toBe('same-path');
		expect(verdict({ toPath: null }).reason).toBe('same-path');
	});
	it('allows a real change of page', () => {
		expect(verdict({ fromPath: '/notebook', toPath: '/classroom' }).reload).toBe(true);
	});
});

describe('rule: nothing reloads out of fullscreen', () => {
	it('refuses with any element fullscreen', () => {
		expect(verdict({ fullscreen: true })).toEqual({ reload: false, reason: 'fullscreen' });
	});
	it('allows with none', () => {
		expect(verdict({ fullscreen: false }).reload).toBe(true);
	});
});

describe('rule: never reload FROM a projector surface', () => {
	const ROUTE_DIR = (id: string) => `src/routes${id}`;

	it('names only routes that exist, so a rename reddens here', () => {
		for (const r of PROJECTOR_ROUTES) {
			const dir = ROUTE_DIR(r.id);
			expect(existsSync(dir) && statSync(dir).isDirectory(), `${r.id} -> ${dir}`).toBe(true);
		}
	});

	it('carries every surface the brief names, and the deck route exactly', () => {
		const ids = PROJECTOR_ROUTES.map((r) => r.id);
		for (const id of [
			'/classroom/[sectionId]/item/[itemId]/deck',
			'/tournaments/[id]/tv',
			'/fsp/live',
			'/greenline',
			'/gauntlet',
			'/ideacad'
		]) {
			expect(ids).toContain(id);
		}
	});

	const refused: string[] = [
		'/classroom/[sectionId]/item/[itemId]/deck',
		'/tournaments/[id]/tv',
		'/fsp/live',
		'/greenline',
		'/greenline/builder',
		'/gauntlet',
		'/gauntlet/speedrun',
		'/ideacad',
		'/ideacad/preview'
	];
	it.each(refused)('refuses leaving %s', (fromRouteId) => {
		expect(verdict({ fromRouteId })).toEqual({ reload: false, reason: 'projector' });
	});

	const allowed: string[] = [
		'/classroom/[sectionId]',
		'/classroom/[sectionId]/item/[itemId]',
		'/tournaments/[id]',
		'/gauntletx',
		'/fsp/ask',
		'/'
	];
	it.each(allowed)('allows leaving %s', (fromRouteId) => {
		expect(verdict({ fromRouteId }).reload).toBe(true);
	});

	it('asks about the route being LEFT, so arriving at a deck may reload', () => {
		expect(
			verdict({
				fromRouteId: '/classroom/[sectionId]/item/[itemId]',
				fromPath: '/classroom/s-1/item/i-9',
				toPath: '/classroom/s-1/item/i-9/deck'
			}).reload
		).toBe(true);
	});

	it('matches an exact entry exactly and a tree entry below itself', () => {
		expect(isProjectorRoute('/classroom/[sectionId]/item/[itemId]/deck/extra')).toBe(false);
		expect(isProjectorRoute('/fsp/live/anything')).toBe(true);
		expect(isProjectorRoute(null)).toBe(false);
		expect(isProjectorRoute('')).toBe(false);
	});
});

describe('rule: a hold refuses', () => {
	it('refuses while anything holds', () => {
		expect(verdict({ holds: ['uploading "photo.png"'] })).toEqual({ reload: false, reason: 'held' });
	});
	it('allows with nothing held', () => {
		expect(verdict({ holds: [] }).reload).toBe(true);
	});
	it('names the FIRST rule that refuses, in the documented order', () => {
		const all: Partial<DeployVerdictInput> = {
			type: 'goto',
			toPath: RELOADS.fromPath,
			fullscreen: true,
			fromRouteId: '/fsp/live',
			holds: ['x']
		};
		expect(verdict(all).reason).toBe('navigation-type');
		expect(verdict({ ...all, type: 'link' }).reason).toBe('same-path');
		expect(verdict({ ...all, type: 'link', toPath: '/x' }).reason).toBe('fullscreen');
		expect(verdict({ ...all, type: 'link', toPath: '/x', fullscreen: false }).reason).toBe('projector');
		expect(
			verdict({ ...all, type: 'link', toPath: '/x', fullscreen: false, fromRouteId: '/' }).reason
		).toBe('held');
	});
});

describe('the hold registry', () => {
	afterEach(() => {
		// Nothing a test takes may outlive it: the registry is module state.
		expect(activeDeployHolds()).toEqual([]);
	});

	it('holds until released, and releasing twice releases once', () => {
		const a = holdDeployReload('a');
		const b = holdDeployReload('b', { warnOnUnload: true });
		expect(activeDeployHolds()).toEqual(['a', 'b']);
		expect(deployHoldsWarnOnUnload()).toBe(true);
		b();
		b();
		expect(activeDeployHolds()).toEqual(['a']);
		expect(deployHoldsWarnOnUnload()).toBe(false);
		a();
	});

	it('tells a listener about every change, and stops when unsubscribed', () => {
		const heard = vi.fn();
		const stop = onDeployHoldsChange(heard);
		const release = holdDeployReload('x');
		release();
		expect(heard).toHaveBeenCalledTimes(2);
		stop();
		holdDeployReload('y')();
		expect(heard).toHaveBeenCalledTimes(2);
	});

	it('holds a request while it is in flight and returns the same promise', async () => {
		let resolve!: (v: string) => void;
		const pending = new Promise<string>((r) => (resolve = r));
		const tracked = trackInFlight(pending, 'uploading');
		expect(tracked).toBe(pending);
		expect(activeDeployHolds()).toEqual(['uploading']);
		expect(deployHoldsWarnOnUnload()).toBe(true);
		resolve('landed');
		expect(await tracked).toBe('landed');
		await Promise.resolve();
		expect(activeDeployHolds()).toEqual([]);
	});

	it('releases a request that fails, without swallowing the failure', async () => {
		let reject!: (e: Error) => void;
		const pending = new Promise<string>((_r, j) => (reject = j));
		const tracked = trackInFlight(pending, 'uploading');
		reject(new Error('dropped'));
		await expect(tracked).rejects.toThrow('dropped');
		await Promise.resolve();
		expect(activeDeployHolds()).toEqual([]);
	});
});

describe('the save guard re-issuing a navigation', () => {
	it('is recognised only for its own target, and only for a link or the back button', () => {
		const end = beginResumedNavigation(new URL('http://x/classroom/s-1/item/i-2?tab=1'), 'link');
		expect(resumedNavigation('/classroom/s-1/item/i-2')).toBe(true);
		expect(resumedNavigation('/classroom/s-1')).toBe(false);
		end();
		expect(resumedNavigation('/classroom/s-1/item/i-2')).toBe(false);

		const back = beginResumedNavigation('/notebook', 'popstate');
		expect(resumedNavigation('/notebook')).toBe(true);
		back();

		const form = beginResumedNavigation('/search', 'form');
		expect(resumedNavigation('/search')).toBe(false);
		form();
		expect(resumedNavigation(null)).toBe(false);
	});
});

describe('asking for a new version', () => {
	it('does nothing with no checker registered', () => {
		expect(requestVersionCheck({ force: true })).toBe(false);
	});

	it('throttles wake checks and never throttles a forced one', () => {
		const check = vi.fn(async () => false);
		const unregister = registerVersionCheck(check);
		const t0 = 1_000_000_000;
		expect(requestVersionCheck({ now: t0 })).toBe(true);
		expect(requestVersionCheck({ now: t0 + WAKE_CHECK_MIN_GAP_MS - 1 })).toBe(false);
		expect(requestVersionCheck({ now: t0 + 1, force: true })).toBe(true);
		expect(requestVersionCheck({ now: t0 + 1 + WAKE_CHECK_MIN_GAP_MS })).toBe(true);
		expect(check).toHaveBeenCalledTimes(3);
		unregister();
		expect(requestVersionCheck({ force: true })).toBe(false);
	});

	it('survives a checker that rejects', async () => {
		const unregister = registerVersionCheck(async () => {
			throw new Error('offline');
		});
		expect(requestVersionCheck({ force: true })).toBe(true);
		await Promise.resolve();
		unregister();
	});
});

describe('isChunkLoadError', () => {
	const chunk = [
		'Failed to fetch dynamically imported module: https://ideabosco.com/_app/immutable/nodes/7.abc.js',
		'error loading dynamically imported module: https://ideabosco.com/_app/immutable/chunks/x.js',
		'Importing a module script failed.',
		'Unable to preload CSS for /_app/immutable/assets/7.css'
	];
	it.each(chunk)('recognises %s', (message) => {
		expect(isChunkLoadError(new TypeError(message))).toBe(true);
		expect(isChunkLoadError(message)).toBe(true);
		expect(isChunkLoadError({ message })).toBe(true);
	});

	const other = [
		new Error('Cannot read properties of undefined'),
		new TypeError('Failed to fetch'),
		'Not found: /classroom/x',
		null,
		undefined,
		42,
		{ message: 7 }
	];
	it.each(other)('does not mistake %s for one', (err) => {
		expect(isChunkLoadError(err)).toBe(false);
	});

	it('has one sentence for the error page', () => {
		expect(CHUNK_LOAD_MESSAGE).toMatch(/could not be downloaded/);
	});
});

describe('the poll interval', () => {
	it('asks every two minutes and leaves the version name at its default', async () => {
		const config = (await import('../svelte.config.js')).default as {
			kit: { version?: { pollInterval?: number; name?: string } };
		};
		expect(config.kit.version?.pollInterval).toBe(120_000);
		expect(config.kit.version?.name).toBeUndefined();
	});
});

describe('the wiring, read off the source', () => {
	const read = (rel: string) => readFileSync(rel, 'utf8');

	it('mounts DeployWatch once, in the root layout', () => {
		const layout = read('src/routes/+layout.svelte');
		expect(layout.match(/<DeployWatch\s*\/>/g)?.length).toBe(1);
	});

	it('reloads from onNavigate, never by assigning location.href from beforeNavigate', () => {
		const watch = read('src/lib/shell/DeployWatch.svelte');
		const code = watch.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
		expect(code).toContain('onNavigate(');
		expect(code).toContain('location.reload()');
		expect(code).not.toMatch(/beforeNavigate\s*\(/);
		expect(code).not.toMatch(/location\.href\s*=/);
		// Vite's own failure is only a reason to ASK: never cancelled (that would
		// make a failed import resolve to nothing) and never a reload.
		expect(code).toMatch(/const onPreloadError = \(\) => requestVersionCheck\(\{ force: true \}\);/);
		expect(code).toContain("window.addEventListener('vite:preloadError', onPreloadError)");
	});

	it('holds at every choke point the brief names', () => {
		expect(read('src/lib/classroom/file-upload.ts')).toContain('trackInFlight(');
		expect(read('src/lib/classroom/transports.ts')).toContain("holdDeployReload('uploading a deck'");
		expect(read('src/routes/classroom/[sectionId]/+layout.svelte')).toMatch(
			/if \(!composing \|\| !composerDirty\) return;\s*return holdDeployReload\(/
		);
		// The notebook's transports moved out of its page into one module
		// (ledger 0297), built by every surface that writes a notebook.
		const notebook = read('src/lib/notebook/transports.ts');
		expect(notebook.match(/trackInFlight\(/g)?.length).toBe(2);
		expect(read('src/lib/feedback/SiteFeedback.svelte')).toMatch(
			/if \(!open\) return;\s*return holdDeployReload\(/
		);
	});
});
