// tests/vanguard-achievement-merge.test.ts
//
// ACHIEVEMENTS HAVE TO FOLLOW THE STUDENT, AND THE TWO COPIES OF THE RULE HAVE
// TO AGREE.
//
// The three keys the game writes -- `vanguard_ach` (unlocked ids),
// `vanguard_ach_best` (the numbers behind the progress bars) and
// `vanguard_ach_title` (the badge worn on the leaderboard) -- were classified as
// PREFERENCES, which are stored per device class. A student who earned a badge
// on one Chromebook and signed in on another was handed the second machine's
// bucket and started over. They are progression now.
//
// TWO THINGS ARE ASSERTED HERE, AND THE SECOND IS THE REASON THIS FILE EXISTS.
//
//   1. The merge itself, seeded with GENUINELY DIFFERENT state on both sides.
//      A union that returned one side whole, or a max that returned one object
//      whole, passes any round trip seeded from empty or from equal halves --
//      so every case below gives each side at least one thing the other lacks,
//      and asserts BOTH survive.
//
//   2. THE MIRROR AGREES WITH THE CANONICAL COPY. `mergeProgression` exists
//      twice: once here in TypeScript (server-side, in the save API) and once
//      as ES5 inside the bootstrap `src/routes/vanguard/+server.ts` injects,
//      which cannot import a module because it runs before the game reads
//      localStorage. Two copies of one rule is a known hazard and the comments
//      in both files say so; a comment is not a check. The mirror is EXTRACTED
//      FROM THE SHIPPING ROUTE FILE, evaluated, and run against the same
//      inputs as the TypeScript, so the day the two drift this reddens rather
//      than a second Chromebook quietly disagreeing with a first.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	PROGRESSION_KEYS,
	mergeIntoStored,
	mergeProgression,
	splitSnapshot
} from '../src/lib/vanguard-save';

// ---------------------------------------------------------------------------
// The mirror, taken out of the route that ships it.
// ---------------------------------------------------------------------------

const ROUTE = fileURLToPath(new URL('../src/routes/vanguard/+server.ts', import.meta.url));

/**
 * The bootstrap's merge block, between the marker comment that opens it and the
 * first function that is NOT part of it. Extracted rather than copied: a copy in
 * this file would be a third version of the rule, and the third would drift too.
 */
function extractMirror(): string {
	const src = readFileSync(ROUTE, 'utf8');
	const start = src.indexOf('// --- merge logic (keep aligned with src/lib/vanguard-save.ts) ---');
	const end = src.indexOf('function deviceClass()', start);
	expect(start).toBeGreaterThan(-1);
	expect(end).toBeGreaterThan(start);
	return src.slice(start, end);
}

interface Mirror {
	PROGRESSION_KEYS: string[];
	mergeProgression: (
		a: Record<string, string>,
		b: Record<string, string>
	) => Record<string, string>;
}

function loadMirror(): Mirror {
	const block = extractMirror();
	// The block is plain ES5 inside a template literal; nothing in it is
	// interpolated, so it evaluates as written.
	expect(block).not.toContain('${');
	const factory = new Function(
		`${block}\nreturn { PROGRESSION_KEYS: PROGRESSION_KEYS, mergeProgression: mergeProgression };`
	);
	return factory() as Mirror;
}

const mirror = loadMirror();

// ---------------------------------------------------------------------------
// Seeded state: two devices that share nothing they did not have to.
// ---------------------------------------------------------------------------

/** The Chromebook in the lab. Earned four badges, wears MARKSMAN. */
const LAB: Record<string, string> = {
	vanguard_ach: JSON.stringify({
		first_boss: 1_700_000_000_000,
		sector5: 1_700_000_100_000,
		marksman: 1_700_000_200_000,
		style_s: 1_700_000_300_000
	}),
	vanguard_ach_best: JSON.stringify({
		bestScore: 250_000,
		bestSector: 6,
		bestParries: 40,
		bestPerfect: 2,
		bestMeltUses: 9,
		bestBosses: 3,
		totalGames: 30,
		qualGames: 22
	}),
	vanguard_ach_title: 'marksman'
};

/** The laptop at home. Three badges, ONE of them shared, wears APEX. */
const HOME: Record<string, string> = {
	vanguard_ach: JSON.stringify({
		// Shared with LAB, but earned LATER here: the earlier stamp is the true
		// first unlock and is what the panel prints as the earn date.
		first_boss: 1_700_009_000_000,
		style_ss: 1_700_009_100_000,
		parries50: 1_700_009_200_000
	}),
	vanguard_ach_best: JSON.stringify({
		bestScore: 90_000, // lower than LAB
		bestSector: 11, // higher than LAB
		bestParries: 55,
		bestPerfect: 1,
		bestMeltUses: 12,
		bestBosses: 2,
		totalGames: 18,
		qualGames: 25
	}),
	vanguard_ach_title: 'style_ss'
};

const ids = (blob: string | undefined) => Object.keys(JSON.parse(blob ?? '{}')).sort();
const stamps = (blob: string | undefined) =>
	JSON.parse(blob ?? '{}') as Record<string, number>;
const bests = (blob: string | undefined) => JSON.parse(blob ?? '{}') as Record<string, number>;

describe('the three achievement keys are progression', () => {
	it('classifies all three as progression, not as per-device preferences', () => {
		for (const key of ['vanguard_ach', 'vanguard_ach_best', 'vanguard_ach_title']) {
			expect(PROGRESSION_KEYS).toContain(key);
		}
		const split = splitSnapshot({ ...LAB, vanguard_gfx: 'low', vanguard_did: 'abc' });
		expect(Object.keys(split.progression).sort()).toEqual([
			'vanguard_ach',
			'vanguard_ach_best',
			'vanguard_ach_title'
		]);
		// The device-local key is still never synced and gfx is still a preference.
		expect(split.prefs).toEqual({ vanguard_gfx: 'low' });
	});

	it('ships the same key list in the injected bootstrap', () => {
		expect(mirror.PROGRESSION_KEYS).toEqual(PROGRESSION_KEYS);
	});
});

describe('vanguard_ach merges as a union of unlocked ids', () => {
	it('keeps every badge from both devices', () => {
		const merged = mergeProgression(LAB, HOME);
		expect(ids(merged.vanguard_ach)).toEqual([
			'first_boss',
			'marksman',
			'parries50',
			'sector5',
			'style_s',
			'style_ss'
		]);
		// Neither side's set is a superset of the other, so returning either side
		// whole would lose badges. Stated as the count that would result.
		expect(ids(LAB.vanguard_ach)).toHaveLength(4);
		expect(ids(HOME.vanguard_ach)).toHaveLength(3);
		expect(ids(merged.vanguard_ach)).toHaveLength(6);
	});

	it('is order-independent: neither device wins by pushing second', () => {
		expect(ids(mergeProgression(HOME, LAB).vanguard_ach)).toEqual(
			ids(mergeProgression(LAB, HOME).vanguard_ach)
		);
	});

	it('keeps the earlier unlock stamp for a badge earned on both', () => {
		expect(stamps(mergeProgression(LAB, HOME).vanguard_ach).first_boss).toBe(1_700_000_000_000);
		expect(stamps(mergeProgression(HOME, LAB).vanguard_ach).first_boss).toBe(1_700_000_000_000);
	});

	it('never drops a badge when the other side is missing, empty or corrupt', () => {
		expect(ids(mergeProgression(LAB, {}).vanguard_ach)).toHaveLength(4);
		expect(ids(mergeProgression({}, LAB).vanguard_ach)).toHaveLength(4);
		expect(ids(mergeProgression(LAB, { vanguard_ach: 'not json' }).vanguard_ach)).toHaveLength(4);
		expect(ids(mergeProgression({ vanguard_ach: '[]' }, LAB).vanguard_ach)).toHaveLength(4);
	});
});

describe('vanguard_ach_best merges per field, taking the maximum', () => {
	it('takes each field from whichever device is further along', () => {
		const merged = bests(mergeProgression(LAB, HOME).vanguard_ach_best);
		expect(merged).toEqual({
			bestScore: 250_000, // LAB
			bestSector: 11, // HOME
			bestParries: 55, // HOME
			bestPerfect: 2, // LAB
			bestMeltUses: 12, // HOME
			bestBosses: 3, // LAB
			totalGames: 30, // LAB
			qualGames: 25 // HOME
		});
		// Four fields come from each side: no single-side result can equal this.
		expect(merged).not.toEqual(bests(LAB.vanguard_ach_best));
		expect(merged).not.toEqual(bests(HOME.vanguard_ach_best));
	});

	it('is order-independent', () => {
		expect(bests(mergeProgression(HOME, LAB).vanguard_ach_best)).toEqual(
			bests(mergeProgression(LAB, HOME).vanguard_ach_best)
		);
	});

	it('carries a field only one side has ever written', () => {
		const merged = bests(
			mergeProgression(
				{ vanguard_ach_best: JSON.stringify({ bestScore: 10, bestFuture: 7 }) },
				{ vanguard_ach_best: JSON.stringify({ bestScore: 4 }) }
			).vanguard_ach_best
		);
		expect(merged).toEqual({ bestScore: 10, bestFuture: 7 });
	});
});

describe('vanguard_ach_title follows the vanguard_lastInitials rule', () => {
	it('lets the last writer to the cloud win', () => {
		expect(mergeProgression(LAB, HOME).vanguard_ach_title).toBe('style_ss');
		expect(mergeProgression(HOME, LAB).vanguard_ach_title).toBe('marksman');
		// Exactly what lastInitials does, side by side.
		expect(mergeProgression({ vanguard_lastInitials: 'AAA' }, { vanguard_lastInitials: 'BBB' })
			.vanguard_lastInitials).toBe('BBB');
	});

	it('keeps the only title there is when one side has none', () => {
		expect(mergeProgression(LAB, {}).vanguard_ach_title).toBe('marksman');
		expect(mergeProgression({}, LAB).vanguard_ach_title).toBe('marksman');
	});
});

describe('the stored blob', () => {
	it('carries a second device the badges the first earned', () => {
		// Device 1 (desktop) pushes, then device 2 (mobile) pushes its own state.
		const afterLab = mergeIntoStored(null, LAB, 'desktop', '2026-01-01T00:00:00.000Z');
		const afterHome = mergeIntoStored(afterLab, HOME, 'mobile', '2026-01-02T00:00:00.000Z');
		expect(ids(afterHome.progression.vanguard_ach)).toHaveLength(6);
		expect(bests(afterHome.progression.vanguard_ach_best).bestScore).toBe(250_000);
		expect(bests(afterHome.progression.vanguard_ach_best).bestSector).toBe(11);
		expect(afterHome.progression.vanguard_ach_title).toBe('style_ss');
		// And nothing achievement-shaped is left in a per-device bucket.
		for (const bucket of [afterHome.prefs.mobile, afterHome.prefs.desktop]) {
			expect(bucket?.vanguard_ach).toBeUndefined();
			expect(bucket?.vanguard_ach_best).toBeUndefined();
			expect(bucket?.vanguard_ach_title).toBeUndefined();
		}
	});

	it('rescues badges a save written before the reclassification left in a pref bucket', () => {
		// What a save from the previous build looks like: the achievements sat in
		// the pref buckets, one per device class, and progression had none.
		const legacy = {
			v: 2,
			progression: { vanguard_games: '12' },
			prefs: {
				mobile: { _ts: '2025-12-01T00:00:00.000Z', vanguard_gfx: 'low', ...HOME },
				desktop: { _ts: '2025-12-02T00:00:00.000Z', ...LAB }
			}
		};
		// A desktop pushes with NO achievements of its own (fresh Chromebook).
		const merged = mergeIntoStored(
			legacy,
			{ vanguard_games: '13' },
			'desktop',
			'2026-01-03T00:00:00.000Z'
		);
		expect(ids(merged.progression.vanguard_ach)).toEqual([
			'first_boss',
			'marksman',
			'parries50',
			'sector5',
			'style_s',
			'style_ss'
		]);
		expect(bests(merged.progression.vanguard_ach_best).bestSector).toBe(11);
		expect(merged.prefs.mobile?.vanguard_ach).toBeUndefined();
		expect(merged.prefs.mobile?.vanguard_gfx).toBe('low');
	});
});

// ---------------------------------------------------------------------------
// The two copies, run against the same inputs.
// ---------------------------------------------------------------------------

describe('the injected bootstrap merges exactly as the server does', () => {
	const CASES: [string, Record<string, string>, Record<string, string>][] = [
		['two devices with different achievements', LAB, HOME],
		['reversed', HOME, LAB],
		['one side empty', LAB, {}],
		['other side empty', {}, HOME],
		['both empty', {}, {}],
		['corrupt achievement blobs', { vanguard_ach: '[]' }, { vanguard_ach: 'nope' }],
		['a bests field only one side has', LAB, { vanguard_ach_best: '{"bestFuture":3}' }],
		[
			'achievements alongside the rest of progression',
			{
				...LAB,
				vanguard_games: '30',
				vanguard_tutdone: '1',
				vanguard_lastInitials: 'ADP',
				vanguard_scores: '[{"name":"ADP","score":900}]',
				vanguard_build: '{"spent":40,"_bts":5,"up":{"dmg":2},"drone":true}'
			},
			{
				...HOME,
				vanguard_games: '44',
				vanguard_lastInitials: 'ZZZ',
				vanguard_scores: '[{"name":"ZZZ","score":1200}]',
				vanguard_build: '{"spent":10,"_bts":9,"up":{"dmg":1},"drone":false}'
			}
		]
	];

	for (const [name, a, b] of CASES) {
		it(`agrees on: ${name}`, () => {
			const canonical = mergeProgression(a, b);
			const mirrored = mirror.mergeProgression(a, b);
			expect(mirrored).toEqual(canonical);
			// Key order too: both are read back as JSON by the same game.
			expect(Object.keys(mirrored)).toEqual(Object.keys(canonical));
		});
	}

	it('agrees on the seeded pair in both directions, field by field', () => {
		for (const [a, b] of [
			[LAB, HOME],
			[HOME, LAB]
		]) {
			const canonical = mergeProgression(a, b);
			const mirrored = mirror.mergeProgression(a, b);
			expect(ids(mirrored.vanguard_ach)).toEqual(ids(canonical.vanguard_ach));
			expect(bests(mirrored.vanguard_ach_best)).toEqual(bests(canonical.vanguard_ach_best));
			expect(mirrored.vanguard_ach_title).toBe(canonical.vanguard_ach_title);
		}
	});
});
