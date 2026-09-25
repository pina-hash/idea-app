// tests/foundry-boards.test.ts
//
// THE GALLERY'S ORDERS, AND WHAT THE CONTROL SAYS WHEN AN ORDER HAS NOTHING TO
// RANK. The filename is historical: until decision 39 (2026-09-25) these orders
// were four ranked sections ("boards") above the list; they are one `<select>`
// over one list now, and every rule that was not about layout survived.
//
// WHY THIS IS A TEST. Which option is selected fails visibly the first time
// somebody looks. Three things do not:
//
//   1. THE FLATNESS RULE. On a gallery where nothing has been played, "Most
//      played", "Played this week", "Most hours" and "Trending" each rank every
//      app at zero, and a stable sort renders the list in exactly the order it
//      arrived. That is not a broken page -- it is a page that looks ranked and
//      tells the reader something false, because a ranking implies the order
//      was earned. The boards hid themselves; the control SAYS so instead, and
//      a sentence that stopped changing would look completely normal.
//
//   2. THE FIGURE BESIDE A CARD. It must be the metric in force. Before
//      decision 39 the list printed PLAYS under "Most hours" and "Most
//      updated", which is a ranking whose numbers do not explain its order --
//      and plausible on screen.
//
//   3. WHAT "TRENDING" MEANS. It is a formula over two stored counts, and a
//      formula that quietly became "plays this week" would make Trending a
//      second copy of the order beside it, with nothing to say so.

import { describe, expect, it } from 'vitest';
import {
	FOUNDRY_GALLERY_DEFAULT_SORT,
	FOUNDRY_GALLERY_SORTS,
	foundrySortFigure,
	foundrySortHasSignal,
	foundrySortNote,
	foundryTrendScore,
	gallerySortOption,
	isGallerySort,
	sortGallery,
	type FoundryGallerySort,
	type FoundryPlayCounts,
	type FoundrySortable
} from '$lib/foundry/telemetry';

/** Nine apps, with a different winner under every order. */
const APPS: (FoundrySortable & { slug: string })[] = [
	{ id: 'press', slug: 'cookie-press', version_count: 4, created_at: '2026-05-01T00:00:00Z' },
	{ id: 'sprout', slug: 'sprout-sim', version_count: 2, created_at: '2026-09-08T00:00:00Z' },
	{ id: 'orbit', slug: 'orbit-lab', version_count: 6, created_at: '2026-03-01T00:00:00Z' },
	{ id: 'maze', slug: 'maze-maker', version_count: 11, created_at: '2026-01-01T00:00:00Z' },
	{ id: 'frog', slug: 'frog-frenzy', version_count: 1, created_at: '2026-09-20T00:00:00Z' },
	{ id: 'tide', slug: 'tide-pool', version_count: 3, created_at: '2026-07-01T00:00:00Z' },
	{ id: 'pixel', slug: 'pixel-forge', version_count: 5, created_at: '2026-08-01T00:00:00Z' },
	{ id: 'quiet', slug: 'quiet-quest', version_count: 2, created_at: '2026-06-01T00:00:00Z' },
	{ id: 'bolt', slug: 'bolt-run', version_count: 1, created_at: '2026-09-12T00:00:00Z' }
];

/** Every order has a DIFFERENT winner, so one field ranking them all reddens. */
const COUNTS: FoundryPlayCounts = {
	press: { plays: 310, plays7d: 12, playsPrev7d: 40, seconds: 9_000 },
	sprout: { plays: 31, plays7d: 9, playsPrev7d: 1, seconds: 1_800 },
	orbit: { plays: 40, plays7d: 4, playsPrev7d: 3, seconds: 15_000 },
	maze: { plays: 96, plays7d: 6, playsPrev7d: 6, seconds: 4_200 },
	frog: { plays: 18, plays7d: 7, playsPrev7d: 0, seconds: 900 },
	tide: { plays: 12, plays7d: 2, playsPrev7d: 2, seconds: 2_400 },
	pixel: { plays: 7, plays7d: 1, playsPrev7d: 4, seconds: 600 },
	quiet: { plays: 0, plays7d: 0, playsPrev7d: 0, seconds: 0 },
	bolt: { plays: 5, plays7d: 3, playsPrev7d: 1, seconds: 300 }
};

const ZERO: FoundryPlayCounts = Object.fromEntries(
	APPS.map((a) => [a.id, { plays: 0, plays7d: 0, playsPrev7d: 0, seconds: 0 }])
);

describe('trending is a rise, not a level', () => {
	it('is this week minus the week before, and nothing else', () => {
		// The expected values are the fixture's own arithmetic, not the
		// function's: sprout is 9 - 1, press is 12 - 40.
		expect(foundryTrendScore(COUNTS.sprout)).toBe(8);
		expect(foundryTrendScore(COUNTS.press)).toBe(-28);
		expect(foundryTrendScore(COUNTS.maze)).toBe(0);
	});

	it('a missing or partial row is zero rather than NaN', () => {
		// NaN in a comparator does not throw. It silently leaves the list in the
		// order it arrived, which looks exactly like a gallery where nothing is
		// trending -- so this is the ladder case for a pre-0221 deployment.
		expect(foundryTrendScore(undefined)).toBe(0);
		expect(foundryTrendScore({ plays7d: 5 })).toBe(5);
		expect(Number.isNaN(foundryTrendScore({ plays7d: 5 }))).toBe(false);
	});

	it('ranks the climbing app above the popular one, which is the whole point', () => {
		// Cookie Press is the most played app on the fixture BY FAR and is
		// falling. If Trending ever quietly became "plays this week" it would
		// lead Trending, and nothing on screen would say so.
		const trending = sortGallery(APPS, COUNTS, 'trending').map((a) => a.id);
		const played = sortGallery(APPS, COUNTS, 'played').map((a) => a.id);
		expect(trending[0]).toBe('sprout');
		expect(played[0]).toBe('press');
		expect(trending[0]).not.toBe(played[0]);
		// And the falling app is at the BOTTOM of trending, not the top.
		expect(trending[trending.length - 1]).toBe('press');
	});
});

describe('every order ranks on its own field', () => {
	it('gives each order a different winner on this fixture', () => {
		const winner = (s: Parameters<typeof sortGallery>[2]) =>
			sortGallery(APPS, COUNTS, s)[0].id;
		const winners = {
			trending: winner('trending'),
			played: winner('played'),
			hours: winner('hours'),
			new: winner('new'),
			versions: winner('versions')
		};
		// FIVE DISTINCT WINNERS. A bug that ranked every order on one field
		// would collapse this to one id repeated, which is the failure that
		// renders as seven options that all show the same list.
		expect(new Set(Object.values(winners)).size).toBe(5);
		expect(winners).toEqual({
			trending: 'sprout',
			played: 'press',
			hours: 'orbit',
			new: 'frog',
			versions: 'maze'
		});
	});

	it('"brand new" reads created_at and "recent" reads the incoming order', () => {
		// The two are different questions, and this is the pair that would stop
		// disagreeing if `new` were pointed at `updated_at`: an app published
		// last term whose tagline was fixed this morning is the most recently
		// UPDATED app and is not new.
		expect(sortGallery(APPS, COUNTS, 'new')[0].id).toBe('frog');
		expect(sortGallery(APPS, COUNTS, 'recent').map((a) => a.id)).toEqual(
			APPS.map((a) => a.id)
		);
	});

	it('an app with no created_at sorts last under "brand new" rather than throwing', () => {
		const withHole = [...APPS, { id: 'hole', slug: 'hole' }];
		const out = sortGallery(withHole, COUNTS, 'new').map((a) => a.id);
		expect(out[out.length - 1]).toBe('hole');
	});

	it('never mutates its input', () => {
		const before = APPS.map((a) => a.id);
		for (const s of ['trending', 'hours', 'versions', 'new'] as const) {
			sortGallery(APPS, COUNTS, s);
		}
		expect(APPS.map((a) => a.id)).toEqual(before);
	});
});

/** The option for an order, read off the list rather than retyped here. */
const opt = (id: FoundryGallerySort) => gallerySortOption(id);

describe('the sentence beside the control', () => {
	/**
	 * THE POSITIVE CONTROL FOR EVERY FLAT CASE BELOW: on a lively gallery every
	 * order has something to rank and the control states what it counts.
	 * Without this, "the flat sentence appears" is also what a function that
	 * always answered the flat sentence would report.
	 */
	it('states what each order counts on a gallery where every order ranks something', () => {
		for (const o of FOUNDRY_GALLERY_SORTS) {
			expect(foundrySortHasSignal(APPS, COUNTS, o.id), o.id).toBe(true);
			expect(foundrySortNote(APPS, COUNTS, o.id), o.id).toBe(o.rule);
		}
	});

	/**
	 * THE FLATNESS RULE, GENERALISED FROM "every play board is suppressed when
	 * nothing has been played, keeping only Brand new". The four play orders
	 * are exactly the ones that go flat; the three that rank on facts about the
	 * app itself keep their rule.
	 */
	it('says every play order has nothing to rank when nothing has been played', () => {
		const flat = FOUNDRY_GALLERY_SORTS.filter((o) => !foundrySortHasSignal(APPS, ZERO, o.id)).map(
			(o) => o.id
		);
		expect(flat).toEqual(['played', 'trending', 'played7d', 'hours']);
		for (const id of flat) expect(foundrySortNote(APPS, ZERO, id)).toBe(opt(id).flat);
		for (const id of ['versions', 'new', 'recent'] as const) {
			expect(foundrySortNote(APPS, ZERO, id)).toBe(opt(id).rule);
		}
	});

	it('says nothing is climbing when plays are flat week on week, and only that', () => {
		// Every app has plays and hours, and every app played exactly as much
		// this week as last. Nothing is climbing, so Trending has nothing to
		// rank while the other play orders do.
		const flat: FoundryPlayCounts = Object.fromEntries(
			APPS.map((a) => [a.id, { plays: 10, plays7d: 3, playsPrev7d: 3, seconds: 600 }])
		);
		expect(foundrySortNote(APPS, flat, 'trending')).toBe(opt('trending').flat);
		expect(foundrySortNote(APPS, flat, 'played')).toBe(opt('played').rule);
		expect(foundrySortNote(APPS, flat, 'hours')).toBe(opt('hours').rule);
	});

	it('a gallery of only falling apps is not trending, even though it is not all tied', () => {
		// Scores 0, -2 and -5: there IS an order (the falling apps at the
		// bottom), but nothing is climbing, which is the word's whole meaning.
		const falling: FoundryPlayCounts = {
			press: { plays: 9, plays7d: 1, playsPrev7d: 6, seconds: 60 },
			sprout: { plays: 9, plays7d: 3, playsPrev7d: 5, seconds: 60 }
		};
		expect(foundrySortHasSignal(APPS, falling, 'trending')).toBe(false);
		// POSITIVE CONTROL: one app climbing by one play turns it back on.
		expect(
			foundrySortHasSignal(APPS, { ...falling, bolt: { plays: 1, plays7d: 1, playsPrev7d: 0 } }, 'trending')
		).toBe(true);
	});

	it('Most updated has nothing to rank only when every app has the same count', () => {
		const same = APPS.map((a) => ({ ...a, version_count: 1 }));
		expect(foundrySortNote(same, COUNTS, 'versions')).toBe(opt('versions').flat);
		const oneMore = same.map((a, i) => (i === 4 ? { ...a, version_count: 2 } : a));
		expect(foundrySortNote(oneMore, COUNTS, 'versions')).toBe(opt('versions').rule);
	});

	/**
	 * A FLAT SENTENCE THAT CLAIMS AN ORDER MUST BE TRUE OF THE ORDER. Several
	 * say "the list is in recently updated order", and that is only true when
	 * every app genuinely ties. The expected order is the INPUT order, a
	 * property of the fixture rather than of `sortGallery`.
	 */
	it('every flat sentence that names recently updated order is true when it shows', () => {
		const sameVersions = APPS.map((a) => ({ ...a, version_count: 3 }));
		const cases: [FoundrySortable[], FoundryPlayCounts][] = [
			[APPS, ZERO],
			[APPS, {}],
			[sameVersions, ZERO]
		];
		let checked = 0;
		for (const [apps, counts] of cases) {
			for (const o of FOUNDRY_GALLERY_SORTS) {
				if (foundrySortNote(apps, counts, o.id) !== o.flat) continue;
				if (!o.flat?.includes('recently updated order')) continue;
				expect(sortGallery(apps, counts, o.id).map((a) => a.id), o.id).toEqual(
					apps.map((a) => a.id)
				);
				checked++;
			}
		}
		// The sweep must have found something to check, or it proves nothing.
		expect(checked).toBeGreaterThanOrEqual(5);
	});

	it('an empty gallery answers without throwing', () => {
		for (const o of FOUNDRY_GALLERY_SORTS) {
			expect(() => foundrySortNote([], {}, o.id)).not.toThrow();
		}
	});
});

describe('the figure beside a card is the order’s own metric', () => {
	it('prints the rise on trending, the duration on hours, the count on played', () => {
		expect(foundrySortFigure('trending', APPS[1], COUNTS.sprout)).toBe('+8 this week');
		expect(foundrySortFigure('hours', APPS[2], COUNTS.orbit)).toBe('4h 10m');
		expect(foundrySortFigure('played', APPS[0], COUNTS.press)).toBe('310 plays');
		expect(foundrySortFigure('played7d', APPS[0], COUNTS.press)).toBe('12 plays this week');
		expect(foundrySortFigure('versions', APPS[3], COUNTS.maze)).toBe('11 versions');
	});

	it('prints nothing under an order that ranks on a date', () => {
		expect(foundrySortFigure('new', APPS[4], COUNTS.frog)).toBe('');
		expect(foundrySortFigure('recent', APPS[4], COUNTS.frog)).toBe('');
	});

	it('prints nothing rather than a zero or a minus', () => {
		// A falling app under Trending would read "-28 this week", which is a
		// verdict on somebody's work rather than a measurement.
		expect(foundrySortFigure('trending', APPS[0], COUNTS.press)).toBe('');
		expect(foundrySortFigure('hours', APPS[7], COUNTS.quiet)).toBe('');
		expect(foundrySortFigure('played', APPS[7], COUNTS.quiet)).toBe('');
	});

	/**
	 * THE DEFECT DECISION 39's REWRITE FIXED ON THE WAY PAST: the list printed
	 * an app's PLAY count under "Most hours". Orbit Lab leads hours on 40 plays;
	 * its card must say its time, and a play count there is the wrong metric.
	 */
	it('never prints the play count under an order that ranks on something else', () => {
		for (const id of ['hours', 'versions', 'trending'] as const) {
			expect(foundrySortFigure(id, APPS[2], COUNTS.orbit)).not.toBe('40 plays');
		}
		// POSITIVE CONTROL: the same app under Most played does print it.
		expect(foundrySortFigure('played', APPS[2], COUNTS.orbit)).toBe('40 plays');
	});
});

describe('the control offers every order, in decision 39’s order', () => {
	it('offers seven orders, Most played first, and the two former board orders among them', () => {
		// The EXPECTED list is decision 39's own, typed from the entry rather
		// than read off the array: Most played, Trending, Played this week,
		// Most hours, Most updated, Newest, Recently updated.
		expect(FOUNDRY_GALLERY_SORTS.map((s) => s.label)).toEqual([
			'Most played',
			'Trending',
			'Played this week',
			'Most hours',
			'Most updated',
			'Newest',
			'Recently updated'
		]);
		expect(FOUNDRY_GALLERY_SORTS.map((s) => s.id)).toEqual([
			'played',
			'trending',
			'played7d',
			'hours',
			'versions',
			'new',
			'recent'
		]);
	});

	/**
	 * GENERALISED FROM "keeps the two board-only orders out of the buttons".
	 * The rule was never "not these two ids"; it was "a stored or URL value may
	 * not put the control into a state with nothing under it". Each is an
	 * option now, so each is admitted, and a value that is NOT an option still
	 * is not.
	 */
	it('admits exactly the ids it offers', () => {
		for (const s of FOUNDRY_GALLERY_SORTS) expect(isGallerySort(s.id)).toBe(true);
		expect(isGallerySort('trending')).toBe(true);
		expect(isGallerySort('new')).toBe(true);
		expect(isGallerySort('board')).toBe(false);
		expect(isGallerySort('mostPlayedEver')).toBe(false);
		expect(isGallerySort(undefined)).toBe(false);
	});

	it('the default is an offered order', () => {
		expect(isGallerySort(FOUNDRY_GALLERY_DEFAULT_SORT)).toBe(true);
	});

	it('every order is one sortGallery can actually rank', () => {
		for (const o of FOUNDRY_GALLERY_SORTS) {
			expect(() => sortGallery(APPS, COUNTS, o.id)).not.toThrow();
			expect(sortGallery(APPS, COUNTS, o.id)).toHaveLength(APPS.length);
		}
	});

	it('the coverage note travels with exactly the orders that rank on plays', () => {
		expect(FOUNDRY_GALLERY_SORTS.filter((o) => o.ranksPlays).map((o) => o.id)).toEqual([
			'played',
			'trending',
			'played7d',
			'hours'
		]);
	});

	it('every order says what it counts, without calling anything best or popular', () => {
		for (const o of FOUNDRY_GALLERY_SORTS) {
			for (const words of [o.rule, o.flat ?? '', o.label]) {
				// A ranking is a measurement of attention through one portal,
				// not a verdict on the work.
				expect(words.toLowerCase()).not.toContain('best');
				expect(words.toLowerCase()).not.toContain('popular');
				// House rule: no em dashes in anything a student reads.
				expect(words).not.toContain('\u2014');
			}
			expect(o.rule.length).toBeGreaterThan(10);
		}
	});
});
