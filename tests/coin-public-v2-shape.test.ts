// tests/coin-public-v2-shape.test.ts
//
// THE PUBLIC LEDGER AFTER COIN V2 (0239): ONE BALANCE, AND NOTHING ELSE.
//
// Two halves, both silent if they regress:
//
//   1. `readCoinPublic` over 0239's row shapes, through a fake client (no
//      database: the DB-backed files pin the RPCs themselves). The CSV the
//      page parses must carry the one balance, the wage exactly as sent and
//      the eating-pass flag, and must NOT carry a retired column, a medium,
//      a transfer id or an address.
//   2. The Ledger's own functions, lifted out of the shipping file and run.
//      A page that kept reading `Awarded` would render a column of dashes
//      and look like an empty board rather than a broken one; a weekly pay
//      that added 1 for a role holder printed a figure Coin Desk never paid.

import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { readCoinPublic } from '../src/lib/server/coin-public';

const BOARD = [
	{
		student_id: 'aa11bb22cc33dd44ee55ff6600112233',
		name: 'Lovelace, Ada',
		section: 'IDEA113 Block 3',
		balance: 155,
		weekly_wage: 3,
		wage_tier: 3,
		eating_pass: true
	},
	{
		student_id: 'bb22cc33dd44ee55ff6600112233aa11',
		name: 'Hopper, Grace',
		section: null,
		// numeric(12,2) arrives as a string from some drivers; passed through.
		balance: '-74.50',
		weekly_wage: '1.00',
		wage_tier: 1,
		eating_pass: false
	}
];

const TXNS = [
	{
		occurred_at: '2026-10-14T17:15:00Z',
		name: 'Lovelace, Ada',
		amount: -150,
		type: 'Purchase',
		reason: 'Eating Pass',
		category_id: 'eating_pass'
	},
	{
		occurred_at: '2026-10-13T17:15:00Z',
		name: 'Hopper, Grace',
		amount: 2.5,
		type: 'Award',
		reason: 'Above and Beyond',
		category_id: null
	}
];

function fakeClient(): SupabaseClient {
	return {
		async rpc(name: string) {
			if (name === 'coin_public_leaderboard') return { data: BOARD, error: null };
			if (name === 'coin_public_transactions') return { data: TXNS, error: null };
			// Session two (0247, 0245): a role badge and a reported count, both
			// keyed by the opaque id, never an address.
			if (name === 'coin_public_role_badges')
				return {
					data: [
						{ student_id: 'aa11bb22cc33dd44ee55ff6600112233', role_id: 'shop_steward', role: 'Shop Steward' },
						{ student_id: 'aa11bb22cc33dd44ee55ff6600112233', role_id: 'lab_tech', role: 'Lab Tech' }
					],
					error: null
				};
			if (name === 'coin_public_reported_coins')
				return { data: [{ student_id: 'aa11bb22cc33dd44ee55ff6600112233', coins: 12, reported_on: '2026-10-13' }], error: null };
			return { data: null, error: { message: `unexpected rpc ${name}` } };
		}
	} as unknown as SupabaseClient;
}

function parse(csv: string): Record<string, string>[] {
	const [head, ...rows] = csv.split('\r\n');
	const h = head.split(',');
	return rows.map((line) => Object.fromEntries(line.split(',').map((v, i) => [h[i], v])));
}

const RETIRED = [
	'Awarded',
	'Fines',
	'Spent',
	'Adjustments',
	'Paid Out',
	'Physical Balance',
	'Digital Balance',
	'Bank Balance',
	'Debt',
	'Medium',
	'Transfer Id'
];

describe('readCoinPublic over the 0239 shapes', () => {
	test('summary: exactly the ten columns, the values passed through', async () => {
		const { body, contentType } = await readCoinPublic(fakeClient(), 'summary', new URLSearchParams());
		expect(contentType).toContain('text/csv');
		expect(body.split('\r\n')[0]).toBe(
			'Name,Section,Wage,Coin Balance,Wage Tier,Eating Pass,Student Id,Roles,Coins On Hand,Coins On Hand Date'
		);
		const rows = parse(body);
		expect(rows).toHaveLength(2);
		// The quoted name breaks the naive split, so read by position-safe keys.
		expect(body).toContain(
			'"Lovelace, Ada",IDEA113 Block 3,3,155,3,true,aa11bb22cc33dd44ee55ff6600112233,Shop Steward | Lab Tech,12,2026-10-13'
		);
		// A student with no role and no report: three empty cells, never "null".
		expect(body).toContain('"Hopper, Grace",,1.00,-74.50,1,false,bb22cc33dd44ee55ff6600112233aa11,,,');
	});

	test('transactions: the six columns, signed amounts and the category id', async () => {
		const { body } = await readCoinPublic(fakeClient(), 'transactions', new URLSearchParams());
		expect(body.split('\r\n')[0]).toBe('Date / Time,Name,Amount,Type,Reason,Category Id');
		expect(body).toContain(',-150,Purchase,Eating Pass,eating_pass');
		// A null category is an empty cell, never the string "null".
		expect(body).toMatch(/,2\.5,Award,Above and Beyond,$/m);
		expect(body).not.toContain('null');
	});

	test('no retired column and no address in either feed (with a positive control)', async () => {
		const summary = (await readCoinPublic(fakeClient(), 'summary', new URLSearchParams())).body;
		const txns = (await readCoinPublic(fakeClient(), 'transactions', new URLSearchParams())).body;
		const headers = [...summary.split('\r\n')[0].split(','), ...txns.split('\r\n')[0].split(',')];
		expect(headers).toContain('Coin Balance'); // positive control
		for (const col of RETIRED) expect(headers, col).not.toContain(col);
		expect(summary + txns).not.toContain('@');
	});
});

// ---------------------------------------------------------------------------
// The Ledger's own code, lifted out of the shipping file.
// ---------------------------------------------------------------------------
const LEDGER = readFileSync('src/lib/legacy/coins/index.html', 'utf8');

/** The source of one top-level `function name(...) {...}` in the Ledger. */
function fnSource(name: string): string {
	const start = LEDGER.indexOf(`function ${name}(`);
	expect(start, `function ${name} in the Ledger`).toBeGreaterThan(-1);
	let depth = 0;
	for (let i = LEDGER.indexOf('{', start); i < LEDGER.length; i++) {
		if (LEDGER[i] === '{') depth++;
		else if (LEDGER[i] === '}' && --depth === 0) return LEDGER.slice(start, i + 1);
	}
	throw new Error(`unbalanced ${name}`);
}

const ledgerFns = new Function(
	'txnRows',
	[
		fnSource('pick'),
		fnSource('fmtNum'),
		fnSource('coinBalanceOf'),
		fnSource('weeklyPayOf'),
		fnSource('holdsEatingPass'),
		'return { fmtNum, coinBalanceOf, weeklyPayOf, holdsEatingPass };'
	].join('\n')
) as (txnRows: Record<string, string>[]) => {
	fmtNum(n: unknown): string;
	coinBalanceOf(r: Record<string, string>): number;
	weeklyPayOf(r: Record<string, string>): number;
	holdsEatingPass(r: Record<string, string>, name: string): boolean;
};

describe('the Ledger page reads the one balance', () => {
	const fns = ledgerFns([
		{ Name: 'Old Feed', 'Category Id': 'eating_pass', Type: 'Purchase' },
		{ Name: 'Someone Else', 'Category Id': 'song_request', Type: 'Purchase' }
	]);

	test('a whole number prints bare, anything else with two decimals', () => {
		expect(fns.fmtNum(12)).toBe('12');
		expect(fns.fmtNum(-74.5)).toBe('-74.50');
		expect(fns.fmtNum('40.25')).toBe('40.25');
		expect(fns.fmtNum(0.1 + 0.2)).toBe('0.30');
		expect(fns.fmtNum(2.999999)).toBe('3');
		expect(fns.fmtNum(NaN)).toBe('—');
	});

	test('the weekly pay is the Wage column exactly, never wage + 1', () => {
		expect(fns.weeklyPayOf({ Wage: '3' })).toBe(3);
		expect(fns.weeklyPayOf({ Wage: '1.50' })).toBe(1.5);
		expect(fns.weeklyPayOf({})).toBe(0);
		// The function takes the ROW and nothing that could name a role.
		expect(fnSource('weeklyPayOf')).not.toMatch(/role/i);
	});

	test('the balance is the Coin Balance column, signed', () => {
		expect(fns.coinBalanceOf({ 'Coin Balance': '-74.50' })).toBe(-74.5);
		expect(fns.coinBalanceOf({ 'Coin Balance': '155' })).toBe(155);
		expect(fns.coinBalanceOf({})).toBe(0);
	});

	test('the Eating Pass badge keys on data, in both directions', () => {
		expect(fns.holdsEatingPass({ 'Eating Pass': 'true' }, 'Ada')).toBe(true);
		expect(fns.holdsEatingPass({ 'Eating Pass': 'false' }, 'Old Feed')).toBe(false);
		// No column: falls back to a purchase row whose CATEGORY ID is the pass.
		expect(fns.holdsEatingPass({}, 'Old Feed')).toBe(true);
		expect(fns.holdsEatingPass({}, 'Someone Else')).toBe(false);
		expect(fnSource('holdsEatingPass')).not.toMatch(/Classroom Eating Pass/);
	});

	test('no retired column is read anywhere in the page (with a positive control)', () => {
		// Every column read goes through pick(...)('<header>', ...).
		const reads = [...LEDGER.matchAll(/\('((?:[A-Z][A-Za-z]* ?)+)'/g)].map((m) => m[1].trim());
		expect(reads).toContain('Coin Balance'); // positive control
		for (const col of RETIRED) {
			expect(LEDGER.includes(`('${col}'`), `the Ledger reads '${col}'`).toBe(false);
		}
		expect(LEDGER).not.toMatch(/Lifetime Earned \(/);
		expect(LEDGER).not.toMatch(/'(?:Physical|Digital)'/);
	});

	test('analytics show counts, never an awarded, fined or spent sum', () => {
		// Positive control: the counts the panel does show are there.
		expect(LEDGER).toContain("wRow('Transactions Logged'");
		for (const label of ['Coins Awarded', 'Fines Issued', 'Coins Spent', 'Adjustments (net)']) {
			expect(LEDGER.includes(`'${label}'`), label).toBe(false);
		}
		expect(LEDGER).toContain('<th>Type</th><th>Count</th></tr>');
		expect(LEDGER).not.toContain('<th>Count</th><th>Total</th>');
	});

	test('the stats bar is exactly the two V2 tiles', () => {
		const tiles = [...LEDGER.matchAll(/<div class="stat-label">([^<]*)<\/div>/g)].map((m) => m[1]);
		expect(tiles).toEqual(['Coins in Circulation', 'Students in Debt']);
	});
});

// ---------------------------------------------------------------------------
// The Ledger follows the site theme through the site's own decision.
// ---------------------------------------------------------------------------
describe('the Ledger theme script asks themeAttrFor, and nothing else', () => {
	test('signed out paints the default: no script at all', async () => {
		const { ledgerThemeScript } = await import('../src/lib/server/coin-public');
		expect(ledgerThemeScript(false)).toBe('');
	});

	test('signed in, the table holds exactly the themes the site paints on /coins', async () => {
		const { ledgerThemeScript, LEDGER_THEME_PATH } = await import('../src/lib/server/coin-public');
		const { SITE_THEMES, themeAttrFor } = await import('../src/lib/theme');
		const script = ledgerThemeScript(true);
		const table = JSON.parse(/var m=(\{.*?\}\}),k=/.exec(script)![1]) as Record<string, { a: string }>;
		let painted = 0;
		for (const t of SITE_THEMES) {
			const attr = themeAttrFor(t, LEDGER_THEME_PATH, true);
			if (attr) painted++;
			expect(table[t]?.a, t).toBe(attr);
		}
		expect(painted).toBeGreaterThan(0); // positive control: matrix is unscoped
		// It follows another tab's change, and announces it to the page.
		expect(script).toContain('addEventListener("storage"');
		expect(script).toContain('idea-theme-change');
	});

	test('the Ledger carries the boot marker once, and the route fills it', async () => {
		const { THEME_BOOT_MARKER } = await import('../src/lib/theme');
		const { injectLedgerTheme } = await import('../src/lib/server/coin-public');
		expect(LEDGER.split(THEME_BOOT_MARKER)).toHaveLength(2);
		expect(injectLedgerTheme(LEDGER, false)).not.toContain(THEME_BOOT_MARKER);
		expect(injectLedgerTheme(LEDGER, true)).toContain('idea_site_theme');
		expect(readFileSync('src/routes/coins/[...path]/+server.ts', 'utf8')).toContain('injectLedgerTheme(');
	});

	test('every Space White ink the page declares clears 4.5:1 on every light ground', () => {
		const block = /:root\[data-theme='space-white'\] \{([\s\S]*?)\n\}/.exec(LEDGER)![1];
		const tok = (n: string) => new RegExp(`--${n}:\\s*(#[0-9a-f]{6})`, 'i').exec(block)![1];
		const lum = (h: string) => {
			const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
			return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
		};
		const ratio = (a: string, b: string) => {
			const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
			return (x + 0.05) / (y + 0.05);
		};
		const grounds = ['bg0', 'lp-panel-top', 'lp-panel-ground', 'lp-face-top', 'lp-face-bot', 'lp-chip-ground', 'lp-well-face'].map(tok);
		const inks = ['white', 'green', 'gold', 'cyan', 'amber', 'teal', 'dim', 'ice', 'red', 'blue', 'violet', 'pink', 'lp-btn-ink'];
		for (const ink of inks) for (const g of grounds) expect(ratio(tok(ink), g), `${ink} on ${g}`).toBeGreaterThanOrEqual(4.5);
		for (const g of grounds) expect(ratio(tok('lp-hair'), g), `hair on ${g}`).toBeGreaterThanOrEqual(3);
	});
});
