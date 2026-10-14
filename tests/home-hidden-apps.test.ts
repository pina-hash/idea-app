// Ledger 0380, report 125e674f: a person hides apps on their own home screen.
// What would be invisible if it broke: an app that cannot be got back, a
// stored list that names an app that no longer exists, and a layout that moves
// for somebody who hides nothing.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	PORTAL_APPS,
	arrangeApps,
	readHiddenIds,
	setAppHidden,
	splitHidden,
	type HomepagePrefs
} from '$lib/portal-apps';

const ids = PORTAL_APPS.map((a) => a.id);

describe('which apps are hidden', () => {
	it('keeps only strings that name an app, each once, and ignores anything else', () => {
		const prefs = { hidden: [ids[0], ids[0], 'no-such-app', 7, null, ids[1]] } as unknown as HomepagePrefs;
		expect(readHiddenIds(prefs)).toEqual([ids[0], ids[1]]);
		expect(readHiddenIds({})).toEqual([]);
		expect(readHiddenIds({ hidden: 'classroom' } as unknown as HomepagePrefs)).toEqual([]);
	});
	it('splits an arranged grid in its own order, and nothing is lost between the halves', () => {
		const arranged = arrangeApps(PORTAL_APPS, { pinned: [ids[2]] }, 'default');
		const { shown, hidden } = splitHidden(arranged, { hidden: [ids[2], ids[4]] });
		expect(hidden.map((a) => a.id)).toEqual(arranged.map((a) => a.id).filter((i) => i === ids[2] || i === ids[4]));
		expect(shown.length + hidden.length).toBe(arranged.length);
		expect(shown.some((a) => a.id === ids[2])).toBe(false);
	});
	it('a person who hides nothing sees exactly the grid they saw before', () => {
		const arranged = arrangeApps(PORTAL_APPS, {}, 'default');
		expect(splitHidden(arranged, {}).shown.map((a) => a.id)).toEqual(arranged.map((a) => a.id));
		expect(splitHidden(arranged, {}).hidden).toEqual([]);
	});
});

describe('hiding and showing', () => {
	it('hides an app, unpins it, and keeps every other preference', () => {
		const prefs: HomepagePrefs = { pinned: [ids[0], ids[1]], compact: false, sort: 'custom', order: ids };
		const out = setAppHidden(prefs, ids[0], true);
		expect(out.hidden).toEqual([ids[0]]);
		expect(out.pinned).toEqual([ids[1]]);
		expect(out.compact).toBe(false);
		expect(out.order).toEqual(ids);
		// The input was not mutated.
		expect(prefs.pinned).toEqual([ids[0], ids[1]]);
	});
	it('showing the last hidden app leaves no empty list behind, so an untouched layout stores nothing new', () => {
		const out = setAppHidden(setAppHidden({}, ids[3], true), ids[3], false);
		expect('hidden' in out).toBe(false);
	});
	it('hiding twice is hiding once', () => {
		expect(setAppHidden(setAppHidden({}, ids[3], true), ids[3], true).hidden).toEqual([ids[3]]);
	});
});

describe('the launcher keeps a way back', () => {
	const src = readFileSync('src/lib/AppLauncher.svelte', 'utf8');
	it('Customize shows every app and the page lists the hidden ones with a Show key', () => {
		expect(src).toMatch(/const gridApps = \$derived\(customizing \? arranged : split\.shown\)/);
		expect(src).toContain('data-testid="hidden-apps"');
		expect(src).toContain('data-testid="hidden-app-show"');
		expect(src).toContain('data-testid="hidden-show-all"');
		// Every hide key carries a word (Hide or Show) and says which app.
		expect(src).toMatch(/aria-label="\{hiddenIds\.has\(app\.id\) \? 'Show' : 'Hide'\} \{app\.title\} on my home screen"/);
	});
});
