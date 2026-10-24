// tests/coin-bar.test.ts
//
// THE IDEA COIN BAR AND THE COIN HOME (ledger 0422, feedback 7e4a2a15 and
// d299d864). Every coin page carries one bar naming every other coin page; the
// Ledger, frozen legacy HTML, carries the same component rendered into its
// served string; the Coin Desk tab is offered only to coin staff; the coin home
// shapes one preview per page from that page's own read.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COIN_PAGES, coinPageFor, coinPagesFor } from '../src/lib/coin-bar/pages';
import { COIN_BAR_TOKENS, coinBarTokenCss, injectCoinBar, tokenFrom } from '../src/lib/server/coin-bar';
import { coinHomeFrom, parseLeaderboard } from '../src/lib/coin-bar/home';
import type { CoinMyPage } from '../src/lib/coin-balance';
import type { MarketBoard } from '../src/lib/coin-market/market';
import type { StocksBoard } from '../src/lib/coin-stocks/stocks';

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const LEDGER = read('src/lib/legacy/coins/index.html');

describe('which coin page an address is', () => {
	it('the longest prefix wins, and a near miss is no page', () => {
		const cases: Array<[string, string | null]> = [
			['/coin', 'home'],
			['/coin/', 'home'],
			['/coin-balance', 'mine'],
			['/coin-balance/role', 'mine'],
			['/coins/index.html', 'ledger'],
			['/coins', 'ledger'],
			['/market', 'market'],
			['/market/stocks', 'stocks'],
			['/market/stocks/abc', 'stocks'],
			['/coin/fine', 'desk'],
			['/coin/log', 'desk'],
			['/coin/settings/x', 'desk'],
			['/coin/finex', 'home'],
			['/coin-desk/fine', null],
			['/coinsx', null],
			['/marketing', null],
			['/', null]
		];
		for (const [path, id] of cases) expect(coinPageFor(path), path).toBe(id);
	});

	it('the Coin Desk is offered to coin staff and to nobody else (both directions)', () => {
		expect(coinPagesFor({ desk: true }).map((p) => p.id)).toEqual(['home', 'mine', 'ledger', 'market', 'stocks', 'desk']);
		expect(coinPagesFor({ desk: false }).map((p) => p.id)).toEqual(['home', 'mine', 'ledger', 'market', 'stocks']);
	});
});

describe('the Coin Desk folded into the coin home (ledger 0432)', () => {
	it('every old address redirects: an area to its new place, the rest to the coin home', async () => {
		const { coinDeskRedirect } = await import('../src/lib/coin-desk/nav');
		expect(coinDeskRedirect('')).toBe('/coin');
		expect(coinDeskRedirect('contracts')).toBe('/coin');
		expect(coinDeskRedirect('log')).toBe('/coin');
		expect(coinDeskRedirect('nonsense/deep')).toBe('/coin');
		expect(coinDeskRedirect('fine')).toBe('/coin/fine');
		expect(coinDeskRedirect('students', '?student=a%40b')).toBe('/coin/students?student=a%40b');
		expect(coinDeskRedirect('/settings/')).toBe('/coin/settings');
	});
	it('the redirect route exists and the old pages are gone', () => {
		expect(read('src/routes/coin-desk/[...path]/+server.ts')).toMatch(/redirect\(308, coinDeskRedirect/);
		expect(() => read('src/routes/coin-desk/+page.svelte')).toThrow();
		expect(() => read('src/routes/coin/(staff)/contracts/+page.svelte')).toThrow();
	});
});

describe('every coin page mounts the bar, naming itself current', () => {
	it('each page component and the desk layout carry CoinBar with its own page', () => {
		const mounts: Array<[string, string]> = [
			['src/lib/coin-balance/CoinPageView.svelte', 'mine'],
			['src/lib/coin-balance/CoinRolePortal.svelte', 'mine'],
			['src/lib/coin-market/MarketPage.svelte', 'market'],
			['src/lib/coin-stocks/StocksPage.svelte', 'stocks'],
			['src/lib/coin-stocks/StockDetailPage.svelte', 'stocks'],
			['src/routes/coin/(staff)/+layout.svelte', 'desk'],
			['src/lib/coin-bar/CoinHomePage.svelte', 'home']
		];
		for (const [file, id] of mounts) expect(read(file), file).toMatch(new RegExp(`<CoinBar current="${id}"`));
		// Every page in the list is one of them, or the Ledger (below).
		expect(new Set([...mounts.map((m) => m[1]), 'ledger'])).toEqual(new Set(COIN_PAGES.map((p) => p.id)));
	});

	it('every coin loader answers coinDesk from the desk\'s own gate', () => {
		for (const f of [
			'src/routes/coin-balance/+page.server.ts',
			'src/routes/coin-balance/role/+page.server.ts',
			'src/routes/market/+page.server.ts',
			'src/routes/market/stocks/+page.server.ts',
			'src/routes/market/stocks/[id]/+page.server.ts'
		]) {
			expect(read(f), f).toContain('coinBarDesk(event.locals)');
		}
		expect(read('src/lib/server/coin-bar.ts')).toContain('coinStaff(locals.supabase');
	});
});

describe('the Ledger carries the real bar', () => {
	it('under its header, Ledger current, every other page linked, the Desk only for staff', () => {
		const out = injectCoinBar(LEDGER, false);
		const header = out.indexOf('</header>', out.indexOf('<body'));
		const bar = out.indexOf('data-testid="coin-bar"');
		expect(bar).toBeGreaterThan(header);
		expect(bar - header).toBeLessThan(120);
		expect(out).toMatch(/data-testid="coin-bar-ledger"[^>]*aria-current="page"|aria-current="page"[^>]*data-testid="coin-bar-ledger"/);
		for (const href of ['/coin', '/coin-balance', '/market', '/market/stocks']) expect(out).toContain(`href="${href}"`);
		expect(out).not.toContain('href="/coin/log"');
		expect(injectCoinBar(LEDGER, true)).toContain('href="/coin/log"');
		// The rules ride in the head, once.
		expect(out.split('id="idea-coin-bar-css"').length).toBe(2);
		expect(out.indexOf('id="idea-coin-bar-css"')).toBeLessThan(out.indexOf('</head>'));
		// The frozen file is untouched outside the two insertions.
		expect(out.length).toBeGreaterThan(LEDGER.length);
		expect(out.startsWith(LEDGER.slice(0, LEDGER.indexOf('</head>')))).toBe(true);
	});

	it('a page with no header comes back unchanged (control: nothing half-added)', () => {
		const bare = '<html><head></head><body><p>x</p></body></html>';
		expect(injectCoinBar(bare, true)).toBe(bare);
	});

	it('a div with role navigation, so the Ledger\'s `nav a` key rules never reach the tabs', () => {
		const out = injectCoinBar(LEDGER, false);
		expect(out).toMatch(/<div class="coin-bar" role="navigation" aria-label="IDEA Coin pages"/);
		expect(LEDGER).toMatch(/^nav a \{/m);
	});

	it('the site tokens it re-declares are read out of the design system, both themes, never typed', () => {
		const colors = read('src/lib/design-system/colors.css');
		const light = read('src/lib/design-system/themes/space-white.css');
		// The module reads these as raw imports; vitest serves a CSS import
		// empty, so the test hands in the same files read off disk.
		const css = coinBarTokenCss({ colors, spaceWhite: light, type: read('src/lib/design-system/typography.css') });
		expect(css).toContain("--font-mono: 'Share Tech Mono', monospace;");
		for (const name of COIN_BAR_TOKENS) {
			const dark = tokenFrom(colors, ':root', name);
			const sw = tokenFrom(light, ":root[data-theme='space-white']", name);
			expect(dark, name).toBeTruthy();
			expect(sw, name).toBeTruthy();
			expect(css).toContain(`${name}: ${dark};`);
			expect(css).toContain(`${name}: ${sw};`);
		}
		// The Ledger's own neon green is not the bar's green.
		expect(css).not.toMatch(/#00ff41/i);
		const mod = read('src/lib/server/coin-bar.ts');
		expect(mod).not.toMatch(/#[0-9a-f]{6}\b/i);
		for (const f of ['coin-bar/coin-bar.css?raw', 'design-system/colors.css?raw', 'design-system/themes/space-white.css?raw']) expect(mod).toContain(f);
	});
});

describe('the coin home\'s previews', () => {
	const board = parseLeaderboard([
		{ name: 'Ana', section: 'B1', balance: '40' },
		{ name: 'Ben', section: null, balance: 90 },
		{ name: 'Cal', section: 'B2', balance: -5 },
		{ name: 'Dee', section: 'B2', balance: 12.5 },
		{ bogus: true }
	]);

	it('the Ledger preview is the top three by balance, with the board\'s own totals', () => {
		const h = coinHomeFrom({ signedIn: false, mine: null, leaderboard: board, market: null, stocks: null, staff: null });
		expect(h.ledger!.top.map((r) => r.name)).toEqual(['Ben', 'Ana', 'Dee']);
		expect(h.ledger).toMatchObject({ students: 4, circulation: 137.5, inDebt: 1 });
		// Signed out: nothing but the public board.
		expect(h.mine).toBeNull();
		expect(h.market).toBeNull();
		expect(h.stocks).toBeNull();
		expect(h.desk).toBeNull();
	});

	it('my coins, the market and the stocks each shape from their page\'s own read', () => {
		const mine = {
			in_economy: true,
			balance: 20,
			weekly_wage: 5,
			payday: '2026-10-23',
			history: [
				{ amount: -3, name: 'Undo', reversed: false, reverses: 'h0' },
				{ amount: 3, name: 'Fine', reversed: true, reverses: null },
				{ amount: 5, name: 'Weekly wage', reversed: false, reverses: null }
			]
		} as unknown as CoinMyPage;
		const market = {
			listings: [
				{ id: 'a', title: 'A', price: 2, kind: 'offer', created_at: '2026-10-01T00:00:00Z', closed: false, expired: false, hidden: false },
				{ id: 'b', title: 'B', price: 3, kind: 'request', created_at: '2026-10-03T00:00:00Z', closed: false, expired: false, hidden: false },
				{ id: 'c', title: 'C', price: 4, kind: 'offer', created_at: '2026-10-04T00:00:00Z', closed: true, expired: false, hidden: false }
			],
			orders: [{ status: 'held' }, { status: 'released' }]
		} as unknown as MarketBoard;
		const stocks = {
			stocks: [
				{ id: 'i', kind: 'index', ticker: 'IDEAX', name: 'Index', active: true, last: { close: 100, change_percent: 1 }, series: Array.from({ length: 50 }, (_, i) => ({ at: String(i), close: i })) },
				{ id: 'x', kind: 'class', ticker: 'B2', name: 'B2', active: true, last: { close: 5, change_percent: 3 }, series: [] }
			],
			portfolio: { positions: [{ shares: 2 }, { shares: 0 }], value: 10, cost_basis: 8 }
		} as unknown as StocksBoard;
		const h = coinHomeFrom({ signedIn: true, mine, leaderboard: board, market, stocks, staff: 'section' });
		expect(h.mine).toMatchObject({ balance: 20, weeklyWage: 5, payday: '2026-10-23' });
		expect(h.mine!.recent).toEqual([{ amount: 5, label: 'Weekly wage' }]);
		expect(h.market).toMatchObject({ offers: 1, requests: 1, openTrades: 1 });
		expect(h.market!.newest.map((l) => l.id)).toEqual(['b', 'a']);
		expect(h.stocks).toMatchObject({ index: { ticker: 'IDEAX', price: 100 }, gainer: { ticker: 'B2' }, holdings: 1, value: 10 });
		// The last forty recorded prices, newest last.
		expect(h.stocks!.index!.series).toHaveLength(40);
		expect(h.stocks!.index!.series.at(-1)!.close).toBe(49);
		// Section staff get only their areas.
		expect(h.desk!.areas.map((a) => a.label)).not.toContain('Settings');
		expect(h.desk!.areas.length).toBeGreaterThan(0);
	});

	it('the home is public and reads the public board signed out', () => {
		const src = read('src/routes/coin/+page.server.ts');
		expect(src).toContain("soft(sb.rpc('coin_public_leaderboard')");
		expect(src).toMatch(/signedIn \? soft\(sb\.rpc\('coin_my_page'\)/);
		expect(read('src/hooks.server.ts')).not.toMatch(/'\/coin'[,\]]/);
	});
});
