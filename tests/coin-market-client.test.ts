// tests/coin-market-client.test.ts
//
// THE MARKET'S CLIENT RULES (ledger 0402) whose regressions are silent: a
// banner pin that would send a student off the site, a filter that drops a
// classmate's listing, a restitution job shown to a student not in debt, the
// private-fee preview disagreeing with the database's minimum, and a typed
// amount with three decimals slipping past the parser.

import { describe, expect, test } from 'vitest';
import { bannerSteps, cardsWindow, DEFAULT_BANNER_STYLE, parseBanner } from '$lib/coin-market/banner';
import { filterListings, parseBoard, parseCoinsTyped, parsePrice, privateFee, transferRefusalWords, type Listing } from '$lib/coin-market/market';
import { officialTiles } from '$lib/coin-market/official';
import { fixtureBoard } from '../src/routes/dev/coin-market/fixture';

describe('the banner payload', () => {
	test('only same-site pins survive, the rest are dropped by name', () => {
		const p = parseBanner({
			style: 'cards',
			pins: [
				{ id: 'a', kind: 'shop', title: 'Shop', href: '/coin-balance' },
				{ id: 'b', kind: 'link', title: 'Away', href: 'https://evil.example' },
				{ id: 'c', kind: 'link', title: 'Protocol relative', href: '//evil.example' },
				{ id: 'd', kind: 'link', title: 'Backslash', href: '/\\evil.example' }
			]
		});
		expect(p?.style).toBe('cards');
		expect(p?.pins.map((x) => x.id)).toEqual(['a']);
	});
	test('an unknown look falls back to the default', () => {
		expect(parseBanner({ style: 'marquee', pins: [] })?.style).toBe(DEFAULT_BANNER_STYLE);
		expect(DEFAULT_BANNER_STYLE).toBe('spotlight');
	});
	test('the cards look walks every pin in windows of three, and a single pin never rotates', () => {
		const pins = [1, 2, 3, 4, 5];
		expect(bannerSteps('cards', 5)).toBe(2);
		expect(cardsWindow(pins, 0)).toEqual([1, 2, 3]);
		expect(cardsWindow(pins, 1)).toEqual([4, 5, 1]);
		expect(bannerSteps('spotlight', 1)).toBe(1);
		expect(bannerSteps('spotlight', 4)).toBe(4);
	});
});

describe('the board', () => {
	const board = parseBoard(fixtureBoard())!;
	const theirs = board.listings.filter((l) => !l.mine);
	const all = { query: '', sectionId: '', category: '', kind: '' as const };
	test('no filter keeps every listing (positive control)', () => {
		expect(filterListings(theirs, all).length).toBe(6);
	});
	test('a class filter keeps exactly that class', () => {
		const b4 = filterListings(theirs, { ...all, sectionId: 's-b' });
		expect(b4.map((l: Listing) => l.title).sort()).toEqual(['Help sanding my bridge', 'SolidWorks tutoring']);
	});
	test("a search matches a classmate's name as well as the title", () => {
		expect(filterListings(theirs, { ...all, query: 'maya' }).length).toBe(2);
		expect(filterListings(theirs, { ...all, query: 'calipers borrow' }).length).toBe(1);
	});
	test('offers and requests split the board', () => {
		const o = filterListings(theirs, { ...all, kind: 'offer' }).length;
		const r = filterListings(theirs, { ...all, kind: 'request' }).length;
		expect([o, r]).toEqual([4, 2]);
	});
});

describe('the official zone', () => {
	const base = {
		shop: { eatingPass: 150, extraCreditPerPoint: 2, payRaiseCost: 100, gramsPerCoin: 10, printActive: true },
		donations: [{ id: 'd1', name: 'Tissue box', rate: 1 }],
		contracts: [
			{ id: 'c1', title: 'Shelf', pay_type: 'flat' as const, payout_amount: 3, hourly_rate: null, debt_only: false, section: null },
			{ id: 'c2', title: 'Sweep', pay_type: 'hourly' as const, payout_amount: null, hourly_rate: 2, debt_only: true, section: null }
		],
		staffCards: [],
		inDebt: false
	};
	test('a restitution job is shown only to a student in debt', () => {
		expect(officialTiles(base).some((t) => t.key === 'contract:c2')).toBe(false);
		expect(officialTiles({ ...base, inDebt: true }).some((t) => t.key === 'contract:c2')).toBe(true);
	});
	test('every tile opens a page on this site and buys nothing on its own', () => {
		const tiles = officialTiles({ ...base, inDebt: true });
		expect(tiles.length).toBe(8); // two contracts, four shop items, one want-ad, the background
		for (const t of tiles) expect(t.href.startsWith('/')).toBe(true);
	});
});

describe('typed amounts and fees', () => {
	test('a price has at most two decimals and sits between 0.1 and 1000', () => {
		expect(parsePrice('2.5')).toBe(2.5);
		expect(parsePrice('2.505')).toBeNull();
		expect(parsePrice('0.05')).toBeNull();
		expect(parsePrice('1001')).toBeNull();
		expect(parseCoinsTyped('0.10')).toBe(0.1);
		expect(parseCoinsTyped('-1')).toBeNull();
	});
	test('the private fee is ten percent with a floor, as the database charges it', () => {
		expect(privateFee(2, 10, 0.1)).toBe(0.2);
		expect(privateFee(0.5, 10, 0.1)).toBe(0.1);
		expect(privateFee(0, 10, 0.1)).toBe(0);
	});
	test('a lock refusal names when sending opens again', () => {
		expect(transferRefusalWords({ reason: 'locked', locked_until: '2026-10-19T20:15:00Z' })).toMatch(/locked until 1:15 PM/);
	});
});
