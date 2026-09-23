// tests/foundry-boards.test.ts
//
// THE RANKED SECTIONS (reports 30 and 32b), AND THE SUPPRESSION RULE.
//
// WHY THIS IS A TEST. Which boards render and in what order fails visibly the
// first time somebody looks. Two things do not:
//
//   1. THE FLATNESS RULE. On a gallery where nothing has been played,
//      "Trending", "Most played" and "Most hours" each rank every app at zero,
//      and a stable sort renders the IDENTICAL row three times under three
//      different headings. That is not a broken page -- it is a page that looks
//      completely normal and tells the reader something false, because a
//      leaderboard implies the order was earned. Nobody reviewing a screenshot
//      of four tidy sections would catch it.
//
//   2. THE SIZE FLOOR. Below six apps every board is the same five cards in a
//      different order above a list of the same five. Same shape of failure:
//      plausible on screen, wrong.
//
// AND ONE THAT DECIDES WHOSE WORK GETS SEEN FIRST: what "trending" means. It is
// a formula over two stored counts, and a formula that quietly became "plays
// this week" would make the Trending board a second copy of the board beside
// it, with nothing to say so.

import { describe, expect, it } from 'vitest';
import {
	FOUNDRY_BOARD_SIZE,
	FOUNDRY_GALLERY_BOARDS,
	FOUNDRY_GALLERY_SORTS,
	foundryBoardFigure,
	foundryBoards,
	foundryTrendScore,
	sortGallery,
	type FoundryPlayCounts,
	type FoundrySortable
} from '$lib/foundry/telemetry';

/** Nine apps, so a board of five is provably a TOP five and not the list. */
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

/** Every board has a DIFFERENT winner, so one field ranking all four reddens. */
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
		// lead this board, and nothing on screen would say so.
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
	it('gives each board a different winner on this fixture', () => {
		const winner = (s: Parameters<typeof sortGallery>[2]) =>
			sortGallery(APPS, COUNTS, s)[0].id;
		const winners = {
			trending: winner('trending'),
			played: winner('played'),
			hours: winner('hours'),
			new: winner('new'),
			versions: winner('versions')
		};
		// FIVE DISTINCT WINNERS. A bug that ranked every board on one field
		// would collapse this to one id repeated, which is the failure that
		// renders as four tidy identical sections.
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

describe('which boards render', () => {
	it('renders four, in report 32b’s order, on a lively gallery', () => {
		const boards = foundryBoards(APPS, COUNTS);
		expect(boards.map((b) => b.sort)).toEqual(['trending', 'played', 'hours', 'new']);
	});

	it('caps every board at FOUNDRY_BOARD_SIZE, leaving four apps off each', () => {
		const boards = foundryBoards(APPS, COUNTS);
		expect(FOUNDRY_BOARD_SIZE).toBe(5);
		for (const b of boards) expect(b.apps).toHaveLength(FOUNDRY_BOARD_SIZE);
		// The fixture is bigger than a board, which is what makes the cap an
		// assertion rather than a coincidence.
		expect(APPS.length).toBeGreaterThan(FOUNDRY_BOARD_SIZE);
	});

	/**
	 * THE FLATNESS RULE, WITH ITS POSITIVE CONTROL IN THE SAME TEST. On a
	 * gallery nobody has played, three of the four boards would be the same row
	 * under three headings.
	 */
	it('suppresses every play board when nothing has been played, keeping only Brand new', () => {
		const boards = foundryBoards(APPS, ZERO);
		expect(boards.map((b) => b.sort)).toEqual(['new']);
		// POSITIVE CONTROL: the same apps with real counts get all four.
		expect(foundryBoards(APPS, COUNTS)).toHaveLength(4);
	});

	it('suppresses trending alone when plays are flat week on week', () => {
		// Every app has plays and hours, and every app played exactly as much
		// this week as last. Nothing is climbing, so Trending has nothing to
		// say while the other three do.
		const flat: FoundryPlayCounts = Object.fromEntries(
			APPS.map((a) => [a.id, { plays: 10, plays7d: 3, playsPrev7d: 3, seconds: 600 }])
		);
		expect(foundryBoards(APPS, flat).map((b) => b.sort)).toEqual(['played', 'hours', 'new']);
	});

	it('renders nothing at all on a gallery no bigger than one board', () => {
		// Five apps and four sections is the same five cards four times over,
		// above a list of the same five.
		expect(foundryBoards(APPS.slice(0, FOUNDRY_BOARD_SIZE), COUNTS)).toEqual([]);
		// POSITIVE CONTROL: one more app and the boards appear.
		expect(foundryBoards(APPS.slice(0, FOUNDRY_BOARD_SIZE + 1), COUNTS).length).toBeGreaterThan(0);
	});

	it('an empty gallery renders no boards and does not throw', () => {
		expect(foundryBoards([], {})).toEqual([]);
	});
});

describe('the figure beside a card is the board’s own metric', () => {
	it('prints the rise on trending, the duration on hours, the count on played', () => {
		expect(foundryBoardFigure('trending', APPS[1], COUNTS.sprout)).toBe('+8 this week');
		expect(foundryBoardFigure('hours', APPS[2], COUNTS.orbit)).toBe('4h 10m');
		expect(foundryBoardFigure('played', APPS[0], COUNTS.press)).toBe('310 plays');
		expect(foundryBoardFigure('versions', APPS[3], COUNTS.maze)).toBe('11 versions');
	});

	it('prints nothing on Brand new, because a date is not the same kind of thing', () => {
		expect(foundryBoardFigure('new', APPS[4], COUNTS.frog)).toBe('');
	});

	it('prints nothing rather than a zero or a minus', () => {
		// A falling app on the trending board would read "-28 this week", which
		// is a verdict on somebody's work rather than a measurement. It can only
		// surface at the bottom of a board that has a real climber at the top.
		expect(foundryBoardFigure('trending', APPS[0], COUNTS.press)).toBe('');
		expect(foundryBoardFigure('hours', APPS[7], COUNTS.quiet)).toBe('');
		expect(foundryBoardFigure('played', APPS[7], COUNTS.quiet)).toBe('');
	});

	it('the board’s figures line up with its own rows, one for one', () => {
		for (const b of foundryBoards(APPS, COUNTS)) {
			expect(b.figures).toHaveLength(b.apps.length);
		}
	});
});

describe('the control and the boards are two different sets, deliberately', () => {
	it('offers five buttons and keeps the two board-only orders out of them', () => {
		const offered = FOUNDRY_GALLERY_SORTS.map((s) => s.id);
		expect(offered).toEqual(['recent', 'played', 'played7d', 'hours', 'versions']);
		// Seven buttons in one group is a control nobody reads at 375px.
		expect(offered).not.toContain('trending');
		expect(offered).not.toContain('new');
	});

	it('every board names an order sortGallery can actually rank', () => {
		for (const spec of FOUNDRY_GALLERY_BOARDS) {
			expect(() => sortGallery(APPS, COUNTS, spec.sort)).not.toThrow();
			expect(sortGallery(APPS, COUNTS, spec.sort)).toHaveLength(APPS.length);
		}
	});

	it('every board says what it counts, without calling anything best or top', () => {
		for (const spec of FOUNDRY_GALLERY_BOARDS) {
			expect(spec.rule.length).toBeGreaterThan(10);
			// A board is a measurement of attention through one portal, not a
			// verdict on the work.
			expect(spec.rule.toLowerCase()).not.toContain('best');
			expect(spec.rule.toLowerCase()).not.toContain('popular');
			// House rule: no em dashes in anything a student reads.
			expect(spec.rule).not.toContain('—');
			expect(spec.title).not.toContain('—');
		}
	});
});
