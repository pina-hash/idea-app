import type { CoinMyPage, CoinPageHistoryRow } from '$lib/coin-balance';

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
	row('h7', '2026-10-09T18:30:00Z', '-7.50', 'extra_credit', 'Extra Credit', 'purchase', 'Bought by the student.'),
	row('h6', '2026-10-08T17:12:00Z', '-0.75', 'long_bathroom_break', 'Long Bathroom Break', 'fine', 'Out 13 minutes, 3 over the limit.', { automatic: true }),
	row('h5', '2026-10-07T21:00:00Z', '4', 'above_and_beyond', 'Above and Beyond', 'award', 'Helped two classmates set up their sketch constraints.'),
	row('h4', '2026-10-06T07:05:00Z', '2', 'weekly_wage', 'Weekly Wage', 'award', 'Tier 2.', { automatic: true }),
	row('h3', '2026-10-01T18:00:00Z', '-100', 'pay_raise', 'Pay Raise', 'purchase', 'Bought by the student.'),
	row('h2', '2026-09-30T17:00:00Z', '20', 'balance_correction', 'Balance Correction / Refund', 'adjustment', 'Carried over from last year.'),
	row('h1', '2026-09-29T07:05:00Z', '1', 'weekly_wage', 'Weekly Wage', 'award', null, { automatic: true })
];

export type Scenario = 'populated' | 'debt' | 'outside' | 'empty' | 'signed_out' | 'updating';

export const SCENARIOS: { id: Scenario; label: string }[] = [
	{ id: 'populated', label: 'Populated (held pass, no shop today)' },
	{ id: 'debt', label: 'In debt, pass revoked' },
	{ id: 'outside', label: 'Not in the economy' },
	{ id: 'empty', label: 'New student, no history' },
	{ id: 'signed_out', label: 'Signed out' },
	{ id: 'updating', label: 'Database not updated (0241 missing)' }
];

export function fixturePage(s: Scenario): Record<string, unknown> | null {
	if (s === 'signed_out' || s === 'updating') return null;
	const debt = s === 'debt';
	const empty = s === 'empty';
	return {
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
		print: { grams_per_coin: '10', active: true },
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
				: HISTORY,
		rules: RULES
	};
}
