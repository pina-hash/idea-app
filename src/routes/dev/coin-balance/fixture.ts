import type { CoinPageHistoryRow } from '$lib/coin-balance';
import type { CoinPageExtras } from '$lib/coin-balance/extras';
import {
	parseAuditorQueue,
	parseDonationItems,
	parseMyContracts,
	parseMyStats
} from '$lib/coin-balance/extras';

/**
 * Representative `coin_my_page()` payloads for the /dev/coin-balance harness,
 * written in the jsonb shape 0241 returns (numerics as strings where pg would
 * send them) and run through the REAL `parseCoinMyPage` by the harness, so the
 * harness exercises the same parse the route does.
 */

function row(
	id: string,
	at: string,
	amount: number | string,
	category_id: string,
	name: string,
	kind: string | null,
	note: string | null = null,
	extra: Partial<CoinPageHistoryRow> = {}
) {
	return { id, at, amount, category_id, name, kind, note, reverses: null, reversed: false, automatic: false, ...extra };
}

const RULES = [
	{ type: 'Award', reason: 'Weekly Wage', detail: '1 i¢ times your wage tier, every school week', sort_order: 1, category_id: 'weekly_wage', explanation: 'Paid automatically at the start of each school week to every student in a class using IDEA Coins. A Pay Raise moves you up a tier.' },
	{ type: 'Award', reason: 'Highest Grade', detail: '3 i¢', sort_order: 2, category_id: 'highest_grade_weekly', explanation: 'The highest score on graded work in each class over the last two weeks earns this automatically.' },
	{ type: 'Award', reason: 'Perfect Score', detail: '2 i¢', sort_order: 3, category_id: 'perfect_score_graded_work', explanation: 'A full-marks score on work your teacher turned this on for.' },
	{ type: 'Award', reason: 'Above and Beyond', detail: '1-5 i¢', sort_order: 4, category_id: 'above_and_beyond', explanation: 'Helping a classmate, cleaning up past your own station, or work well past what was asked.' },
	{ type: 'Fine', reason: 'Shop Safety Violation', detail: '5 i¢', sort_order: 1, category_id: 'shop_safety_violation', explanation: 'No safety glasses, loose clothing at a machine, or any unsafe act in the shop. You also lose the shop for the rest of the day.' },
	{ type: 'Fine', reason: 'Eating Violation', detail: '2 i¢', sort_order: 2, category_id: 'eating_violation', explanation: 'Eating in class. With an Eating Pass it is a strike instead; the third strike revokes the pass.' },
	{ type: 'Fine', reason: 'Long Bathroom Break', detail: '0.25 i¢ per minute', sort_order: 3, category_id: 'long_bathroom_break', explanation: 'Logged automatically when a hall pass stays out past the limit. You get a warning first.' },
	{ type: 'Fine', reason: 'Property Damage (Accident)', detail: 'Amount set when logged', sort_order: 4, category_id: 'property_damage_accident', explanation: null },
	{ type: 'Purchase', reason: 'Eating Pass', detail: '15 i¢', sort_order: 1, category_id: 'eating_pass', explanation: 'Lets you eat in class until three strikes revoke it.' },
	{ type: 'Purchase', reason: 'Pay Raise', detail: '100 i¢ times your current tier', sort_order: 2, category_id: 'pay_raise', explanation: 'Moves your weekly wage up one tier for good.' },
	{ type: 'Purchase', reason: '3D Printing', detail: '1 i¢ per 10 grams', sort_order: 3, category_id: 'three_d_printing', explanation: 'Charged by the weight the slicer reports. Print time is free.' },
	{ type: 'Purchase', reason: 'Extra Credit', detail: '2.5 i¢ per point', sort_order: 4, category_id: 'extra_credit', explanation: 'Points on one of your returned assignments, up to a limit per class each semester.' }
];

const HISTORY = [
	row('h12', '2026-10-15T15:40:00Z', '-5', 'shop_safety_violation', 'Shop Safety Violation', 'fine', 'No safety glasses at the drill press.'),
	row('h11', '2026-10-14T16:10:00Z', '3', 'highest_grade_weekly', 'Highest Grade', 'award', 'Engineering I Honors, Lab 4.', { automatic: true }),
	row('h10', '2026-10-13T20:00:00Z', '2', 'reversal', 'Undo', null, 'Logged on the wrong student.', { reverses: 'h9' }),
	row('h9', '2026-10-13T19:58:00Z', '-2', 'eating_violation', 'Eating Violation', 'fine', null, { reversed: true }),
	row('h8', '2026-10-13T07:05:00Z', '2', 'weekly_wage', 'Weekly Wage', 'award', 'Tier 2.', { automatic: true }),
	row('h7', '2026-10-09T18:30:00Z', '-7.50', 'extra_credit', 'Extra Credit', 'purchase', 'Bought by the student.', {
		edited: true,
		original_amount: -10,
		edits: [{ at: '2026-10-10T16:00:00Z', old: -10, new: -7.5, undone: false }]
	}),
	row('h6', '2026-10-08T17:12:00Z', '-0.75', 'long_bathroom_break', 'Long Bathroom Break', 'fine', 'Out 13 minutes, 3 over the limit.', { automatic: true, disputable: true }),
	row('h5', '2026-10-07T21:00:00Z', '4', 'above_and_beyond', 'Above and Beyond', 'award', 'Helped two classmates set up their sketch constraints.'),
	row('h4', '2026-10-06T07:05:00Z', '2', 'weekly_wage', 'Weekly Wage', 'award', 'Tier 2.', { automatic: true }),
	row('h3', '2026-10-01T18:00:00Z', '-100', 'pay_raise', 'Pay Raise', 'purchase', 'Bought by the student.'),
	row('h2', '2026-09-30T17:00:00Z', '20', 'balance_correction', 'Balance Correction / Refund', 'adjustment', 'Carried over from last year.'),
	row('h1', '2026-09-29T07:05:00Z', '1', 'weekly_wage', 'Weekly Wage', 'award', null, { automatic: true })
];

export type Scenario = 'populated' | 'auditor' | 'debt' | 'outside' | 'empty' | 'pre0250' | 'signed_out' | 'updating';

export const SCENARIOS: { id: Scenario; label: string }[] = [
	{ id: 'populated', label: 'Populated (held pass, no shop today, coins out held)' },
	{ id: 'auditor', label: 'Student Auditor, a fine disputed, nothing held' },
	{ id: 'debt', label: 'In debt, pass revoked' },
	{ id: 'outside', label: 'Not in the economy' },
	{ id: 'empty', label: 'New student, no history' },
	{ id: 'pre0250', label: 'Database before session two (no new fields, no new reads)' },
	{ id: 'signed_out', label: 'Signed out' },
	{ id: 'updating', label: 'Database not updated (0241 missing)' }
];

/** A stand-in picture for the harness: an inert SVG drawn in an img, 16:9. */
export const FIXTURE_PICTURE =
	'data:image/svg+xml;charset=utf-8,' +
	encodeURIComponent(
		'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90" width="1920" height="1080"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b3d2e"/><stop offset="1" stop-color="#1f6f8b"/></linearGradient></defs><rect width="160" height="90" fill="url(#g)"/><circle cx="118" cy="30" r="14" fill="#f2c14e" opacity="0.85"/><path d="M0 70 L40 45 L70 62 L105 38 L160 66 L160 90 L0 90 Z" fill="#082a20"/></svg>'
	);

const BG_RULES = {
	guidance:
		'Your background must be 16:9, at least 1920 by 1080 pixels, sharp and high quality, never grainy, blurry or cheap looking. Think cinematic. It must pass the parent and tour test.',
	prompt: 'A cinematic, ultra high resolution 16:9 desktop wallpaper of [your idea], dramatic lighting, sharp detail, rich color, no text, no logos.',
	min_width: 1920,
	min_height: 1080,
	min_kb_per_megapixel: 100,
	days_between: 14,
	award: '2'
};

function sessionTwo(s: Scenario): Record<string, unknown> {
	if (s === 'pre0250') return {};
	const populated = s === 'populated';
	const auditor = s === 'auditor';
	return {
		payout: populated ? { id: 'po1', coins: '20', requested_at: '2026-10-12T17:00:00Z' } : null,
		payday: '2026-11-02',
		background:
			populated || auditor
				? { request_id: 'rq0', photo_path: 'u1/bg.png', approved_at: '2026-09-28T18:00:00Z', width: 1920, height: 1080 }
				: null,
		background_rules: BG_RULES,
		donation_rules: { cap_coins: '10', cap_days: 14, room: populated ? '6' : '10' },
		requests:
			populated || auditor
				? [
						{ id: 'rq4', kind: 'donation', status: 'pending', amount: '3', note: null, decision_note: null, created_at: '2026-10-14T17:00:00Z', decided_at: null, item: 'Tissue box', count: null, quantity: 3, result: null },
						{ id: 'rq3', kind: 'reported_coins', status: 'denied', amount: null, note: null, decision_note: 'The count did not match the coins in your pouch.', created_at: '2026-10-11T17:00:00Z', decided_at: '2026-10-12T15:00:00Z', item: null, count: 14, quantity: null, result: null },
						{ id: 'rq2', kind: 'split', status: 'pending', amount: '5', note: null, decision_note: null, created_at: '2026-10-10T17:00:00Z', decided_at: null, item: 'eating_pass', count: null, quantity: null, result: null },
						{ id: 'rq1', kind: 'background', status: 'approved', amount: '2', note: null, decision_note: null, created_at: '2026-09-27T17:00:00Z', decided_at: '2026-09-28T18:00:00Z', item: null, count: null, quantity: null, result: { paid: 2 } }
					]
				: []
	};
}

/** Every day from `from` for `n` days, 'YYYY-MM-DD'. */
function days(from: string, n: number): string[] {
	const t0 = Date.parse(`${from}T00:00:00Z`);
	return Array.from({ length: n }, (_, i) => new Date(t0 + i * 86400000).toISOString().slice(0, 10));
}

/** The session-two reads a route would hand down, run through the REAL parsers. */
export function fixtureExtras(s: Scenario): CoinPageExtras {
	if (s === 'signed_out' || s === 'updating' || s === 'pre0250' || s === 'empty') return {};
	const debt = s === 'debt';
	const contracts = [
		{ id: 'k1', title: 'Sweep the CNC enclosure', description: 'Vacuum chips and wipe the rails after the last class.', pay_type: 'hourly', payout_amount: null, hourly_rate: '2', debt_only: false, max_contractors: 2, claimed_count: 1, section: 'Engineering I Honors, Block 2', mine: true, done_at: null, paid_at: null, request_status: null, estimate: '0' },
		{ id: 'k2', title: 'Label the bolt bins', description: null, pay_type: 'flat', payout_amount: '6', hourly_rate: null, debt_only: false, max_contractors: 1, claimed_count: 1, section: null, mine: true, done_at: '2026-10-13T20:00:00Z', paid_at: null, request_status: 'pending', estimate: '6' },
		{ id: 'k3', title: 'Reorganize the filament shelf', description: 'Sort by material and color, and label each spool.', pay_type: 'quality', payout_amount: '8', hourly_rate: null, debt_only: false, max_contractors: 3, claimed_count: 1, section: null, mine: false, done_at: null, paid_at: null, request_status: null, estimate: '8' },
		...(debt
			? [{ id: 'k4', title: 'Scrape the paint booth floor', description: 'A restitution job.', pay_type: 'flat', payout_amount: '10', hourly_rate: null, debt_only: true, max_contractors: 1, claimed_count: 0, section: null, mine: false, done_at: null, paid_at: null, request_status: null, estimate: '10' }]
			: [])
	];
	const span = days('2026-09-17', 28);
	let bal = debt ? 10 : 90;
	const series = span
		.filter((_, i) => i % 3 === 0)
		.map((day, i) => {
			bal += debt ? (i % 2 ? -4.5 : 1) : i % 4 === 3 ? -20 : 8;
			return { day, balance: Math.round(bal * 100) / 100 };
		});
	if (series.length) series[series.length - 1] = { ...series[series.length - 1], balance: debt ? -12.25 : 138.5 };
	const stats = {
		balance: debt ? '-12.25' : '138.50',
		series,
		weeks: [
			{ week_start: '2026-09-07', earned: '6', spent: '0' },
			{ week_start: '2026-09-14', earned: '9', spent: '2' },
			{ week_start: '2026-09-21', earned: '4', spent: '0.75' },
			{ week_start: '2026-09-28', earned: '21', spent: '100' },
			{ week_start: '2026-10-05', earned: '8', spent: '8.25' },
			{ week_start: '2026-10-12', earned: '5', spent: debt ? '40' : '5' }
		],
		categories: [
			{ category_id: 'weekly_wage', name: 'Weekly Wage', kind: 'award', total: '5', count: 3 },
			{ category_id: 'above_and_beyond', name: 'Above and Beyond', kind: 'award', total: '4', count: 1 },
			{ category_id: 'shop_safety_violation', name: 'Shop Safety Violation', kind: 'fine', total: '-5', count: 1 },
			{ category_id: 'pay_raise', name: 'Pay Raise', kind: 'purchase', total: '-100', count: 1 }
		],
		events: HISTORY.filter((h) => h.kind && !h.reversed && !h.reverses).map((h) => ({ id: h.id, at: h.at, category_id: h.category_id, name: h.name, kind: h.kind, amount: h.amount, edited: h.id === 'h7', reversed: false }))
	};
	return {
		contracts: parseMyContracts(contracts),
		stats: parseMyStats(stats),
		donationItems: parseDonationItems([
			{ id: 'd1', name: 'Tissue box', rate: '1', photo_path: null, active: true },
			{ id: 'd2', name: 'Pack of AAA batteries', rate: '2', photo_path: null, active: true },
			{ id: 'd3', name: 'Retired item', rate: '1', photo_path: null, active: false }
		]),
		auditor:
			s === 'auditor'
				? parseAuditorQueue({
						auditor: true,
						pending: [
							{ id: 'aq1', name: 'Mateo Ruiz', count: 22, created_at: '2026-10-15T16:00:00Z' },
							{ id: 'aq2', name: 'Priya Shah', count: 9, created_at: '2026-10-15T16:20:00Z' }
						]
					})
				: null,
		hasRole: s === 'populated' || s === 'auditor',
		backgroundUrl: s === 'populated' || s === 'auditor' ? FIXTURE_PICTURE : null
	};
}

export function fixturePage(s: Scenario): Record<string, unknown> | null {
	if (s === 'signed_out' || s === 'updating') return null;
	const debt = s === 'debt';
	const empty = s === 'empty';
	return {
		...sessionTwo(s),
		signed_in: true,
		in_economy: s !== 'outside',
		balance: debt ? '-12.25' : empty ? '0' : '138.50',
		wage_tier: debt || empty ? 1 : 2,
		weekly_wage: debt || empty ? '1' : '2',
		pay_raise: debt || empty
			? { tier: 1, new_tier: 2, cost: '100', wage_now: '1', wage_after: '2' }
			: { tier: 2, new_tier: 3, cost: '200', wage_now: '2', wage_after: '3' },
		eating_pass: debt
			? { active: false, strikes: 3, revoked_at: '2026-10-10T19:20:00Z', price: '15' }
			: empty
				? { active: false, strikes: 0, revoked_at: null, price: '15' }
				: { active: true, strikes: 1, revoked_at: null, price: '15' },
		no_shop_today: s === 'populated',
		print: { grams_per_coin: '10', active: true, ...(s === 'pre0250' ? {} : { spool_grams: s === 'populated' ? '120' : '0' }) },
		extra_credit: {
			price_per_point: '2.5',
			classes: [
				{
					section_id: 'sec-eng1',
					label: 'Engineering I Honors, Block 2',
					room: { semester: '2026-fall', total_points: 400, cap_points: 8, used_points: 3, remaining_points: 5 },
					submissions: empty
						? []
						: [
								{ submission_id: 'sub-lab4', item_id: 'i4', title: 'Lab 4: Gear Train', score: '18', extra_credit: '0', out_of: '20' },
								{ submission_id: 'sub-lab3', item_id: 'i3', title: 'Lab 3: Sketch Constraints', score: '17', extra_credit: '3', out_of: '20' }
							]
				},
				{
					section_id: 'sec-cad',
					label: 'CAD Fundamentals, Block 5',
					room: { semester: '2026-fall', total_points: 150, cap_points: 3, used_points: 3, remaining_points: 0 },
					submissions: [{ submission_id: 'sub-cad1', item_id: 'c1', title: 'Bracket Drawing', score: '9', extra_credit: '0', out_of: '10' }]
				}
			]
		},
		history: empty
			? []
			: debt
				? HISTORY.filter((h) => h.id !== 'h12')
						.concat([row('h0', '2026-10-10T19:20:00Z', '-40', 'shop_safety_violation', 'Shop Safety Violation', 'fine', 'Grinder without a face shield.')])
						.sort((a, b) => b.at.localeCompare(a.at))
				: s === 'auditor'
					? HISTORY.map((h) => (h.id === 'h6' ? { ...h, dispute: { status: 'pending', decision_note: null } } : h))
					: s === 'pre0250'
						? HISTORY.map(({ id, at, amount, category_id, name, kind, note, reverses, reversed, automatic }) => ({ id, at, amount, category_id, name, kind, note, reverses, reversed, automatic }))
						: HISTORY,
		rules: RULES
	};
}
