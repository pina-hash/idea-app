// tests/gauntlet-community.test.ts
//
// The community speedrun module's words and refusals (ledger 0433, item 15).
// The database is the authority (tests/db/gauntlet-community-0296.test.ts);
// these pin that the builder's Save button says the same things it would.

import { describe, expect, it } from 'vitest';
import {
	movePart,
	routeDraftProblem,
	routeProgress,
	ROUTE_STATUS_WORDS,
	type RouteStatus
} from '../src/lib/gauntlet/community';

describe('routeDraftProblem', () => {
	it('names the first thing in the way, in the database order', () => {
		expect(routeDraftProblem('  ', ['a', 'b'])).toBe('Name your speedrun.');
		expect(routeDraftProblem('x'.repeat(61), ['a', 'b'])).toBe('Keep the name to 60 characters.');
		expect(routeDraftProblem('Run', ['a'])).toBe('Pick at least 2 parts.');
		expect(routeDraftProblem('Run', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'])).toBe('A speedrun holds at most 8 parts.');
		expect(routeDraftProblem('Run', ['a', 'a'])).toBe('Each part can be in a speedrun once.');
	});
	it('answers null for a draft the database would take', () => {
		expect(routeDraftProblem('Run', ['a', 'b'])).toBeNull();
		expect(routeDraftProblem('Run', ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'])).toBeNull();
	});
});

describe('movePart', () => {
	it('swaps neighbours and ignores a move off either end', () => {
		expect(movePart(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
		expect(movePart(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
		expect(movePart(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
		expect(movePart(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
	});
});

describe('routeProgress and the status words', () => {
	it('counts ranked and held parts apart', () => {
		const p = (s: 'ranked' | 'pending_verification' | null) => ({
			id: String(Math.random()),
			title: 't',
			difficulty: 1,
			published: true,
			my_seconds: null,
			my_state: s
		});
		expect(routeProgress([p('ranked'), p('pending_verification'), p(null)])).toEqual({ done: 1, held: 1, total: 3 });
	});
	it('gives every state a word and a glyph, with no em dash', () => {
		for (const s of ['private', 'pending', 'listed', 'hidden'] as RouteStatus[]) {
			const w = ROUTE_STATUS_WORDS[s];
			expect(w.word.length).toBeGreaterThan(0);
			expect(w.glyph.length).toBeGreaterThan(0);
			expect(`${w.word} ${w.hint}`).not.toContain('—');
		}
	});
});
