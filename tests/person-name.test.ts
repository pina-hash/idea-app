// One display order for a person's name everywhere (report 715c8421).
import { describe, expect, it } from 'vitest';
import { personName } from '$lib/person-name';
import { parseStocksBoard } from '$lib/coin-stocks/stocks';

describe('personName', () => {
	it('flips only the unambiguous Last, First shape', () => {
		expect(personName('Delgadillo, Seth')).toBe('Seth Delgadillo');
		expect(personName('De La Cruz, Maria')).toBe('Maria De La Cruz');
		expect(personName('Seth Delgadillo')).toBe('Seth Delgadillo');
		expect(personName('Smith, Jr.')).toBe('Smith, Jr.');
		expect(personName('a, b, c')).toBe('a, b, c');
		expect(personName(' ,Seth')).toBe(',Seth');
		expect(personName(null)).toBe('');
	});
	it('the leaderboard shows every row in the same order, the viewer included', () => {
		const board = parseStocksBoard({
			signed_in: true,
			stocks: [],
			portfolio: {},
			leaderboard: [
				{ name: 'Delgadillo, Seth', value: 10, me: true },
				{ name: 'Ina Inactive', value: 9, me: false }
			]
		});
		expect(board?.leaderboard.map((r) => r.name)).toEqual(['Seth Delgadillo', 'Ina Inactive']);
	});
});
