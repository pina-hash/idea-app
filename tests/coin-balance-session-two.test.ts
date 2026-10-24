// tests/coin-balance-session-two.test.ts
//
// The pure half of the student coin page's session-two sections (IDEA Coin V2,
// 0245 to 0250): the CSV export, the upload rules, the background checks, the
// spool arithmetic, the new coin_my_page fields, the role portal's reading of
// coin_my_role, the chart geometry, and the words for every refusal. Expected
// values are written out by hand from the migrations, never derived from the
// helper under test.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { COIN_SYMBOL } from '../src/lib/coin-format';
import { coinPrintWithSpool, parseCoinMyPage } from '../src/lib/coin-balance';
import { coinRowsCsv, parseExportRows, COIN_EXPORT_COLUMNS } from '../src/lib/coin-balance/export';
import {
	COIN_UPLOAD_MAX_BYTES,
	coinBackgroundProblem,
	coinUploadExt,
	coinUploadMime,
	coinUploadPath,
	coinUploadRefusal
} from '../src/lib/coin-balance/uploads';
import {
	backgroundRefusalWords,
	coinDay,
	parseAuditorQueue,
	parseDonationItems,
	parseMyStats,
	requestCancellable,
	requestStatusWords,
	requestTitle,
	sentence
} from '../src/lib/coin-balance/extras';
import { parseMyRole, roleDayCheckable, roleDayWords, roleRulesWords, clockWords } from '../src/lib/coin-balance/role';
import { balanceLine, niceBounds, weekBars } from '../src/lib/coin-balance/charts';
import { coinBuyRefusalWords } from '../src/lib/coin-balance';

describe('coinRowsCsv', () => {
	const rows = parseExportRows({
		rows: [
			{ id: 'a', created_at: '2026-10-01T17:00:00Z', category_id: 'weekly_wage', category: 'Weekly Wage', kind: 'award', amount: 2, medium: 'digital', quantity: null, note: null, actor: 'system', transfer_id: null, meta: { x: 1 } },
			{ id: 'b', created_at: '2026-10-02T17:00:00Z', category_id: 'shop_safety_violation', category: 'Shop Safety Violation', kind: 'fine', amount: '-5', medium: 'digital', quantity: null, note: 'No glasses, "again"\nat the drill', actor: 't@x.edu', transfer_id: null },
			{ id: 'c', created_at: '2026-10-03T17:00:00Z', category_id: 'above_and_beyond', category: 'Above', kind: 'award', amount: 1, medium: 'digital', quantity: null, note: '=HYPERLINK("x")', actor: 't@x.edu', transfer_id: null },
			'not a row'
		]
	});
	const csv = coinRowsCsv(rows);
	const lines = csv.split('\r\n');

	it('a header, one record per row, CRLF, a trailing line break, and a non-object dropped', () => {
		expect(rows).toHaveLength(3);
		expect(lines[0]).toBe('When,Reason,Category id,Kind,Amount,Medium,Quantity,Note,Logged by,Transfer id,Row id');
		expect(csv.endsWith('\r\n')).toBe(true);
		expect(lines[1]).toBe('2026-10-01T17:00:00Z,Weekly Wage,weekly_wage,award,2,digital,,,system,,a');
		expect(COIN_EXPORT_COLUMNS).toHaveLength(11);
	});
	it('a quote is doubled and a field with a line break is quoted', () => {
		expect(csv).toContain('"No glasses, ""again""\nat the drill"');
	});
	it('a negative amount stays a number, and a typed formula is defused', () => {
		expect(csv).toContain(',-5,');
		expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
		expect(csv).not.toMatch(/,=HYPERLINK/);
	});
	it('an empty export is the header alone', () => {
		expect(coinRowsCsv(parseExportRows({ rows: [] }))).toBe(lines[0] + '\r\n');
		expect(parseExportRows(null)).toEqual([]);
	});
});

describe('the upload rules', () => {
	it('the ceiling is the bucket limit, 20 MiB', () => {
		expect(COIN_UPLOAD_MAX_BYTES).toBe(20971520);
	});
	it('the extension comes from the type, else the name, lowercased', () => {
		expect(coinUploadExt({ name: 'IMG_1.HEIC', type: '' })).toBe('heic');
		expect(coinUploadExt({ name: 'x.bin', type: 'image/png' })).toBe('png');
		expect(coinUploadExt({ name: 'a.JPEG', type: '' })).toBe('jpeg');
		expect(coinUploadExt({ name: 'a.jpg', type: 'image/jpeg' })).toBe('jpg');
	});
	it('a type the bucket refuses is refused, even under a picture name', () => {
		expect(coinUploadExt({ name: 'evil.png', type: 'image/svg+xml' })).toBeNull();
		expect(coinUploadExt({ name: 'doc.pdf', type: '' })).toBeNull();
		expect(coinUploadExt({ name: 'noext', type: '' })).toBeNull();
	});
	it('the media type is never empty', () => {
		expect(coinUploadMime({ type: '' }, 'heic')).toBe('image/heic');
		expect(coinUploadMime({ type: 'image/jpg' }, 'jpg')).toBe('image/jpeg');
		expect(coinUploadMime({ type: 'image/webp' }, 'webp')).toBe('image/webp');
	});
	it('the path is <uid>/<uuid>.<ext>, the shape _coin_own_upload_ok accepts', () => {
		const uid = '11111111-2222-4333-8444-555555555555';
		const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
		const p = coinUploadPath(uid, 'png', id);
		expect(p).toBe(`${uid}/${id}.png`);
		expect(p).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic|heif)$/);
	});
	it('too large is refused with the size AND the limit; the limit itself passes', () => {
		const w = coinUploadRefusal({ name: 'a.png', type: 'image/png', size: COIN_UPLOAD_MAX_BYTES + 1 });
		expect(w).toContain('20.0 MB');
		expect(w).toContain('the limit is 20.0 MB');
		expect(coinUploadRefusal({ name: 'a.png', type: 'image/png', size: COIN_UPLOAD_MAX_BYTES })).toBeNull();
	});
});

describe('the background checks, in coin_submit_background order', () => {
	const rules = { min_width: 1920, min_height: 1080, min_kb_per_megapixel: 100 };
	const mp = (w: number, h: number) => (w * h) / 1e6;
	it('a sharp 1920 by 1080 passes', () => {
		expect(coinBackgroundProblem(1920, 1080, Math.ceil(100 * mp(1920, 1080) * 1024), rules)).toBeNull();
	});
	it('16:9 within 1%: 1920x1090 passes, 1920x1100 is refused', () => {
		expect(coinBackgroundProblem(1920, 1090, 10e6, rules)).toBeNull();
		expect(coinBackgroundProblem(1920, 1100, 10e6, rules)).toContain('not 16:9');
	});
	it('a 16:9 picture below the floor is too small', () => {
		expect(coinBackgroundProblem(1600, 900, 10e6, rules)).toContain('at least 1920 by 1080');
	});
	it('under the KB per megapixel floor is too compressed; one byte over passes', () => {
		const need = 100 * mp(3840, 2160) * 1024;
		expect(coinBackgroundProblem(3840, 2160, Math.floor(need) - 1, rules)).toContain('too compressed');
		expect(coinBackgroundProblem(3840, 2160, Math.ceil(need), rules)).toBeNull();
	});
	it('a picture that would not decode says so', () => {
		expect(coinBackgroundProblem(0, 0, 1e6, rules)).toContain('could not be measured');
	});
	it('every database refusal has a sentence', () => {
		for (const reason of ['no_upload', 'size_unknown', 'not_16_9', 'too_small', 'low_quality', 'too_soon', 'not_available']) {
			const w = backgroundRefusalWords({ reason, data: { width: 1, height: 1, min_width: 2, min_height: 2, kb: 1, min_kb: 2, next_at: '2026-10-29T17:00:00Z' } });
			expect(w, reason).not.toMatch(/did not go through/);
		}
		expect(backgroundRefusalWords({ reason: 'too_soon', data: { next_at: '2026-10-29T17:00:00Z' } })).toContain('Oct 29');
	});
});

describe('the spool goes before coins (0250 coin_buy_print)', () => {
	it('what the spool covers is free, and only the rest is priced', () => {
		expect(coinPrintWithSpool(42, 10, 0)).toEqual({ spool: 0, cost: 4 });
		expect(coinPrintWithSpool(42, 10, 30)).toEqual({ spool: 30, cost: 1 });
		expect(coinPrintWithSpool(42, 10, 100)).toEqual({ spool: 42, cost: 0 });
		expect(coinPrintWithSpool(45, 10, 0)).toEqual({ spool: 0, cost: 5 });
	});
});

describe('coin_my_page session-two fields', () => {
	const base = { signed_in: true, balance: '5', history: [], rules: [] };
	it('a payload before 0250 parses to the no-information answers', () => {
		const p = parseCoinMyPage(base)!;
		expect(p.payout).toBeNull();
		expect(p.payday).toBeNull();
		expect(p.background).toBeNull();
		expect(p.requests).toBeNull();
		expect(p.donation_rules).toBeNull();
		expect(p.print.spool_grams).toBe(0);
		expect(p.background_rules.min_width).toBe(1920);
		expect(p.background_rules.days_between).toBe(14);
	});
	it('reads every new field, numerics as strings included', () => {
		const p = parseCoinMyPage({
			...base,
			print: { grams_per_coin: '10', active: true, spool_grams: '250.5' },
			payout: { id: 'p1', coins: '12.5', requested_at: '2026-10-01T00:00:00Z' },
			payday: '2026-11-02',
			background: { request_id: 'r', photo_path: 'u/x.png', approved_at: '2026-10-01T00:00:00Z', width: 1920, height: 1080 },
			background_rules: { guidance: 'G', prompt: 'P', min_width: 2560, min_height: 1440, min_kb_per_megapixel: '80', days_between: 7, award: '2' },
			donation_rules: { cap_coins: '10', cap_days: 14, room: '4' },
			requests: [
				{ id: 'q1', kind: 'donation', status: 'approved', amount: '3', created_at: '2026-10-01T00:00:00Z', item: 'Tissues', quantity: 3, result: { paid: 3, capped: false } },
				{ id: 'q2', kind: 'not_a_kind', status: 'pending', created_at: '2026-10-01T00:00:00Z' }
			],
			history: [
				{ id: 'h', at: '2026-10-01T00:00:00Z', amount: '-0.25', category_id: 'long_bathroom_break', name: 'Long', kind: 'fine', edited: true, original_amount: '-1', edits: [{ at: '2026-10-02T00:00:00Z', old: '-1', new: '-0.25', undone: false }], disputable: true, dispute: { status: 'denied', decision_note: 'Logged correctly.' } }
			]
		})!;
		expect(p.print.spool_grams).toBe(250.5);
		expect(p.payout).toEqual({ id: 'p1', coins: 12.5, requested_at: '2026-10-01T00:00:00Z' });
		expect(p.payday).toBe('2026-11-02');
		expect(p.background?.photo_path).toBe('u/x.png');
		expect(p.background_rules).toMatchObject({ guidance: 'G', prompt: 'P', min_width: 2560, min_kb_per_megapixel: 80, days_between: 7, award: 2 });
		expect(p.donation_rules).toEqual({ cap_coins: 10, cap_days: 14, room: 4 });
		expect(p.requests?.map((r) => r.id)).toEqual(['q1']);
		const h = p.history[0];
		expect(h.edited).toBe(true);
		expect(h.original_amount).toBe(-1);
		expect(h.edits).toEqual([{ at: '2026-10-02T00:00:00Z', old: -1, new: -0.25, undone: false }]);
		expect(h.disputable).toBe(true);
		expect(h.dispute).toEqual({ status: 'denied', decision_note: 'Logged correctly.' });
	});
});

describe('a student submission, in words', () => {
	const r = (x: Record<string, unknown>) =>
		({ id: 'q', kind: 'donation', status: 'pending', amount: null, note: null, decision_note: null, created_at: '', decided_at: null, item: null, count: null, quantity: null, result: null, ...x }) as never;
	it('pending, approved with what it paid, denied with the reason, capped said', () => {
		expect(requestStatusWords(r({}))).toBe('Waiting for your teacher');
		expect(requestStatusWords(r({ status: 'approved', result: { paid: 3 } }))).toBe(`Approved, paid 3${COIN_SYMBOL}`);
		expect(requestStatusWords(r({ status: 'approved', result: { paid: 10, capped: true } }))).toContain('up to the donation limit');
		expect(requestStatusWords(r({ status: 'denied', decision_note: 'Blurry.' }))).toBe('Denied: Blurry.');
		expect(sentence('Denied: Blurry.')).toBe('Denied: Blurry.');
		expect(sentence('Approved')).toBe('Approved.');
	});
	it('a split and a contract are never cancellable; a pending donation is, a decided one is not', () => {
		expect(requestCancellable(r({ kind: 'split' }))).toBe(false);
		expect(requestCancellable(r({ kind: 'contract' }))).toBe(false);
		expect(requestCancellable(r({ kind: 'donation' }))).toBe(true);
		expect(requestCancellable(r({ kind: 'donation', status: 'approved' }))).toBe(false);
	});
	it('a title names the item', () => {
		expect(requestTitle(r({ kind: 'split', item: 'eating_pass' }))).toBe('Split payment: Eating Pass');
		expect(requestTitle(r({ kind: 'reported_coins', count: 14 }))).toBe('Coins on hand: 14');
	});
});

describe('the other reads', () => {
	it('the auditor queue is null unless auditor is true', () => {
		expect(parseAuditorQueue({ auditor: false })).toBeNull();
		expect(parseAuditorQueue(null)).toBeNull();
		expect(parseAuditorQueue({ auditor: true, pending: [{ id: 'a', name: 'N', count: '3' }] })).toEqual([{ id: 'a', name: 'N', count: 3, created_at: '' }]);
	});
	it('the want list keeps active items only', () => {
		expect(parseDonationItems([{ id: 'a', name: 'X', rate: '1', active: true }, { id: 'b', name: 'Y', rate: '1', active: false }]).map((i) => i.id)).toEqual(['a']);
	});
	it('stats: signed out is null; a payload with neither list is null', () => {
		expect(parseMyStats({ signed_in: false })).toBeNull();
		expect(parseMyStats({})).toBeNull();
		expect(parseMyStats({ series: [{ day: '2026-10-01', balance: '3' }], weeks: [] })?.series).toEqual([{ day: '2026-10-01', balance: 3 }]);
	});
	it('a day prints with no weekday', () => {
		expect(coinDay('2026-10-15')).toBe('Oct 15');
	});
});

describe('the role portal', () => {
	const raw = {
		signed_in: true,
		roles: [
			{
				holder_id: 'h1',
				role: 'Shop Steward',
				rules: { min_gap_minutes: 45, photos_per_day: 2, window_start: '07:00', window_end: '16:00' },
				today: '2026-10-15',
				days: [
					{ day: '2026-10-13', photos: 2, gap_minutes: 20, reason: 'gap_too_short', status: 'failed', class_day: true, photo_paths: [{ path: 'u/a.jpg', taken_at: 'x' }] },
					{ day: '2026-10-14', photos: 0, status: 'none', class_day: false, photo_paths: [] },
					{ day: '2026-10-15', photos: 1, reason: 'too_few_photos', status: 'failed', class_day: true, photo_paths: ['u/b.jpg'] }
				]
			}
		]
	};
	const role = parseMyRole(raw)![0];
	it('signed out is null; photos read either shape', () => {
		expect(parseMyRole({ signed_in: false })).toBeNull();
		expect(role.days[0].photo_paths[0]).toEqual({ path: 'u/a.jpg', taken_at: 'x', url: null });
		expect(role.days[2].photo_paths[0]).toEqual({ path: 'u/b.jpg', taken_at: null, url: null });
	});
	it('the rules and each day in words', () => {
		expect(clockWords('16:00')).toBe('4:00 PM');
		expect(roleRulesWords(role.rules)).toBe(
			'Take a start photo and an end photo of the same spot, the last at least 45 minutes after the first, all between 7:00 AM and 4:00 PM on the same day.'
		);
		expect(roleDayWords(role.days[0], role.rules)).toBe('Failed: the photos were too close together (20 minutes apart, 45 needed)');
		expect(roleDayWords(role.days[1], role.rules)).toBe('Not a class day');
		expect(roleDayWords(role.days[2], role.rules)).toBe('Failed: not enough photos (1 of 2)');
	});
	it('a failed day can be checked once it is over, never today', () => {
		expect(roleDayCheckable(role.days[0], role.today)).toBe(true);
		expect(roleDayCheckable(role.days[2], role.today)).toBe(false);
		expect(roleDayCheckable(role.days[1], role.today)).toBe(false);
	});
});

describe('chart geometry', () => {
	it('bounds include zero and land on a tidy step', () => {
		expect(niceBounds([3, 17])).toMatchObject({ min: 0, max: 20, step: 5 });
		expect(niceBounds([-12.25, 30])).toMatchObject({ min: -20, max: 40, step: 20 });
	});
	it('the balance line steps between days and ends at the last balance', () => {
		const g = balanceLine([{ day: '2026-10-01', balance: 0 }, { day: '2026-10-11', balance: 10 }])!;
		expect(g.points).toHaveLength(2);
		expect(g.path.startsWith('M')).toBe(true);
		expect(g.path).toMatch(/H[\d.]+V[\d.]+$/);
		expect(g.points[1].y).toBeLessThan(g.points[0].y);
		expect(balanceLine([])).toBeNull();
	});
	it('earned rises above zero and spent falls below it', () => {
		const g = weekBars([{ week_start: '2026-10-05', earned: 8, spent: 4 }])!;
		const b = g.bars[0];
		expect(b.earnedY + b.earnedH).toBeCloseTo(g.zeroY, 5);
		expect(b.spentY).toBe(g.zeroY);
		expect(b.earnedH).toBeCloseTo(b.spentH * 2, 5);
		expect(weekBars([])).toBeNull();
	});
});

describe('split refusals have sentences', () => {
	it('in_debt, already_pending, physical_part with the price', () => {
		expect(coinBuyRefusalWords({ reason: 'in_debt' })).toContain('below zero');
		expect(coinBuyRefusalWords({ reason: 'already_pending' })).toContain('waiting');
		expect(coinBuyRefusalWords({ reason: 'physical_part', price: 15 })).toContain(`15${COIN_SYMBOL}`);
	});
});

describe('copy rules on the session-two sources', () => {
	const ROOT = fileURLToPath(new URL('..', import.meta.url));
	const FILES = [
		'src/lib/coin-balance/extras.ts',
		'src/lib/coin-balance/role.ts',
		'src/lib/coin-balance/uploads.ts',
		'src/lib/coin-balance/export.ts',
		'src/lib/coin-balance/charts.ts',
		'src/lib/coin-balance/CoinPayout.svelte',
		'src/lib/coin-balance/CoinBackgroundPanel.svelte',
		'src/lib/coin-balance/CoinDonationPanel.svelte',
		'src/lib/coin-balance/CoinOnHand.svelte',
		'src/lib/coin-balance/CoinRequestsList.svelte',
		'src/lib/coin-balance/CoinStatsPanel.svelte',
		'src/lib/coin-balance/CoinAuditorPanel.svelte',
		'src/lib/coin-balance/CoinDispute.svelte',
		'src/lib/coin-balance/CoinRoleCamera.svelte',
		'src/lib/coin-balance/CoinRolePortal.svelte'
	];
	const WEEKDAYS = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/;
	for (const f of FILES) {
		it(`${f}: no em dash, no weekday, no literal coin symbol, no {@html}`, () => {
			const src = readFileSync(ROOT + f, 'utf8')
				.replace(/\/\*[\s\S]*?\*\//g, ' ')
				.replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
				.replace(/<!--[\s\S]*?-->/g, ' ');
			expect(src).not.toMatch(/—/);
			expect(src).not.toMatch(WEEKDAYS);
			expect(src).not.toContain(COIN_SYMBOL);
			expect(src).not.toContain('{@html');
			expect(src).not.toMatch(/\sdisabled[=\s>]/);
		});
	}
});
