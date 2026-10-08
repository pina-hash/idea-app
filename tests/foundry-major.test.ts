// tests/foundry-major.test.ts
//
// THE PURE HALF OF MAJOR RELEASES (report 927b1c69): the predicates every
// surface asks, the house cards' source, and the mosaic style both of the
// gallery's lists now share.
//
// WHAT WOULD FAIL SILENTLY, and so is pinned here:
//
//   - "cannot tell" read as "no" offers no control on a deployment without
//     0233, and "cannot tell" read as "yes" would offer one whose only answer
//     is "not switched on". Both directions are asserted.
//   - A house id that stopped resolving in PORTAL_APPS would silently drop a
//     card; one that resolved to an admin-only app would put an admin door on
//     a student gallery.
//   - Moving the style string out of the gallery must not move it by a
//     character: the golden below was GENERATED from the gallery's inline code
//     before the move (n = 0..12), not retyped from the new function.

import { describe, expect, it } from 'vitest';
import { PORTAL_APPS } from '../src/lib/portal-apps';
import * as major from '../src/lib/foundry/major';
import {
	FOUNDRY_HOUSE_RELEASE_IDS,
	foundryHouseReleases,
	isMajorRelease,
	majorAckSentence,
	majorCanMark,
	majorMarkBlocker,
	majorRefusalSentence,
	majorReleaseReady
} from '../src/lib/foundry/major';
import {
	FOUNDRY_MOSAIC_FILL_STEPS,
	FOUNDRY_MOSAIC_MAX_COLUMNS,
	foundryMosaicStyle
} from '../src/lib/foundry/mosaic';

const GOLDEN: Record<number, string> = {
	0: '--fdy-cols: 1; --fdy-fill-2: 1; --fdy-fill-3: 1; --fdy-fill-4: 1; --fdy-fill-5: 1; --fdy-fill-6: 1; --fdy-fill-7: 1; --fdy-fill-8: 1',
	1: '--fdy-cols: 1; --fdy-fill-2: 1; --fdy-fill-3: 1; --fdy-fill-4: 1; --fdy-fill-5: 1; --fdy-fill-6: 1; --fdy-fill-7: 1; --fdy-fill-8: 1',
	2: '--fdy-cols: 2; --fdy-fill-2: 2; --fdy-fill-3: 2; --fdy-fill-4: 2; --fdy-fill-5: 2; --fdy-fill-6: 2; --fdy-fill-7: 2; --fdy-fill-8: 2',
	3: '--fdy-cols: 3; --fdy-fill-2: 2; --fdy-fill-3: 3; --fdy-fill-4: 3; --fdy-fill-5: 3; --fdy-fill-6: 3; --fdy-fill-7: 3; --fdy-fill-8: 3',
	4: '--fdy-cols: 4; --fdy-fill-2: 2; --fdy-fill-3: 2; --fdy-fill-4: 4; --fdy-fill-5: 4; --fdy-fill-6: 4; --fdy-fill-7: 4; --fdy-fill-8: 4',
	5: '--fdy-cols: 5; --fdy-fill-2: 2; --fdy-fill-3: 3; --fdy-fill-4: 3; --fdy-fill-5: 5; --fdy-fill-6: 5; --fdy-fill-7: 5; --fdy-fill-8: 5',
	6: '--fdy-cols: 6; --fdy-fill-2: 2; --fdy-fill-3: 3; --fdy-fill-4: 3; --fdy-fill-5: 3; --fdy-fill-6: 6; --fdy-fill-7: 6; --fdy-fill-8: 6',
	7: '--fdy-cols: 7; --fdy-fill-2: 2; --fdy-fill-3: 3; --fdy-fill-4: 4; --fdy-fill-5: 4; --fdy-fill-6: 4; --fdy-fill-7: 7; --fdy-fill-8: 7',
	8: '--fdy-cols: 8; --fdy-fill-2: 2; --fdy-fill-3: 3; --fdy-fill-4: 4; --fdy-fill-5: 4; --fdy-fill-6: 4; --fdy-fill-7: 4; --fdy-fill-8: 8',
	9: '--fdy-cols: 8; --fdy-fill-2: 2; --fdy-fill-3: 3; --fdy-fill-4: 3; --fdy-fill-5: 5; --fdy-fill-6: 5; --fdy-fill-7: 5; --fdy-fill-8: 5',
	10: '--fdy-cols: 8; --fdy-fill-2: 2; --fdy-fill-3: 3; --fdy-fill-4: 4; --fdy-fill-5: 5; --fdy-fill-6: 5; --fdy-fill-7: 5; --fdy-fill-8: 5',
	11: '--fdy-cols: 8; --fdy-fill-2: 2; --fdy-fill-3: 3; --fdy-fill-4: 4; --fdy-fill-5: 4; --fdy-fill-6: 6; --fdy-fill-7: 6; --fdy-fill-8: 6',
	12: '--fdy-cols: 8; --fdy-fill-2: 2; --fdy-fill-3: 3; --fdy-fill-4: 4; --fdy-fill-5: 4; --fdy-fill-6: 6; --fdy-fill-7: 6; --fdy-fill-8: 6'
};

describe('isMajorRelease and majorReleaseReady', () => {
	it('absent, null and empty are not a major release; a timestamp is', () => {
		expect(isMajorRelease({})).toBe(false);
		expect(isMajorRelease({ major_release_at: null })).toBe(false);
		expect(isMajorRelease({ major_release_at: '' })).toBe(false);
		expect(isMajorRelease({ major_release_at: '2026-10-07T18:00:00Z' })).toBe(true);
	});

	it('a payload without the key cannot tell; with the key at null it can', () => {
		// The pre-0233 payload: no key at all.
		expect(majorReleaseReady({ id: 'a', hidden_at: null })).toBe(false);
		expect(majorReleaseReady({ id: 'a', hidden_at: null, major_release_at: null })).toBe(true);
		expect(majorReleaseReady({ major_release_at: '2026-10-07T18:00:00Z' })).toBe(true);
	});
});

describe('what can be marked mirrors foundry_set_app_major', () => {
	const cases: [string | null, string | null, ReturnType<typeof majorMarkBlocker>][] = [
		['v1', null, null],
		[null, null, 'not_published'],
		['v1', '2026-10-01T00:00:00Z', 'hidden'],
		// The RPC checks hidden first, so a hidden draft answers hidden.
		[null, '2026-10-01T00:00:00Z', 'hidden']
	];
	it.each(cases)('published %s, hidden %s -> %s', (published, hidden, blocker) => {
		const app = { published_version_id: published, hidden_at: hidden };
		expect(majorMarkBlocker(app)).toBe(blocker);
		expect(majorCanMark(app)).toBe(blocker === null);
	});
	it('ran all four combinations', () => expect(cases).toHaveLength(4));
});

describe('the sentences', () => {
	it('every structured refusal has its own sentence, and anything else is the database verbatim', () => {
		const reasons = ['not_found', 'hidden', 'not_published', 'unavailable'];
		const said = reasons.map((reason) => majorRefusalSentence({ reason }));
		expect(new Set(said).size).toBe(4);
		expect(majorRefusalSentence({ message: 'Only a site administrator can make an app a major release.' })).toBe(
			'Only a site administrator can make an app a major release.'
		);
		expect(majorRefusalSentence({})).toBe('That did not go through. Try again.');
	});

	it('the acknowledgement says when nothing changed, in both directions', () => {
		const four = [
			majorAckSentence(true, true),
			majorAckSentence(true, false),
			majorAckSentence(false, true),
			majorAckSentence(false, false)
		];
		expect(new Set(four).size).toBe(4);
		expect(majorAckSentence(true, false)).toMatch(/already/);
		expect(majorAckSentence(false, false)).toMatch(/was not/);
	});

	it('no exported sentence carries an em dash, and the sweep found sentences to check', () => {
		const strings = (Object.values(major) as unknown[]).filter((v): v is string => typeof v === 'string');
		const generated = [
			...['not_found', 'hidden', 'not_published', 'unavailable'].map((reason) =>
				majorRefusalSentence({ reason })
			),
			majorAckSentence(true, true),
			majorAckSentence(true, false),
			majorAckSentence(false, true),
			majorAckSentence(false, false)
		];
		const all = [...strings, ...generated];
		expect(strings.length).toBeGreaterThanOrEqual(7);
		for (const s of all) expect(s).not.toContain('—');
	});
});

describe('the house releases', () => {
	it('every id resolves in PORTAL_APPS, is not admin-only, and carries the registry entry itself', () => {
		const cards = foundryHouseReleases();
		expect(cards.map((c) => c.id)).toEqual([...FOUNDRY_HOUSE_RELEASE_IDS]);
		for (const card of cards) {
			const entry = PORTAL_APPS.find((a) => a.id === card.id)!;
			expect(entry).toBeDefined();
			expect(entry.adminOnly ?? false).toBe(false);
			expect(card.title).toBe(entry.title);
			expect(card.href).toBe(entry.href);
			expect(card.sub).toBe(entry.sub);
		}
	});

	it('an admin-only or missing entry is left out rather than invented', () => {
		const gl = PORTAL_APPS.find((a) => a.id === 'greenline')!;
		expect(foundryHouseReleases([{ ...gl, adminOnly: true }])).toEqual([]);
		expect(foundryHouseReleases([gl]).map((c) => c.id)).toEqual(['greenline']);
		expect(foundryHouseReleases([])).toEqual([]);
	});
});

describe('foundryMosaicStyle', () => {
	it('is the string the gallery built inline before the move, for 0 to 12 cards', () => {
		const ns = Object.keys(GOLDEN).map(Number);
		expect(ns).toHaveLength(13);
		for (const n of ns) expect(foundryMosaicStyle(n)).toBe(GOLDEN[n]);
	});

	it('keeps the ceiling and the steps the gallery had', () => {
		expect(FOUNDRY_MOSAIC_MAX_COLUMNS).toBe(8);
		expect([...FOUNDRY_MOSAIC_FILL_STEPS]).toEqual([2, 3, 4, 5, 6, 7, 8]);
	});
});
