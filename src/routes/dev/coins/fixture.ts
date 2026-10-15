/**
 * Sample data for the /dev/coins harness (404 in production, no auth, no
 * Supabase).
 *
 * These are RPC-SHAPED ROWS, not finished responses: the harness feeds them
 * to the REAL `readCoinPublic` through a fake client whose `.rpc()` answers
 * from this file, so everything the page then parses -- the CSV headers, the
 * date formatting, the one-balance mapping, the contract field
 * names, the per-section role grouping -- is produced by the shipping code
 * and not re-implemented here.
 *
 * The one thing they deliberately do NOT contain is an email address, for the
 * same reason the real RPCs project it away: if the fixture carried one, a
 * regression that leaked it would still look clean in the harness.
 */

import { COIN_SYMBOL } from '$lib/coin-format';

export interface DevFixtureState {
	signedIn: boolean;
	isStudent: boolean;
	myClaimIds: string[];
}

export const devState: DevFixtureState = {
	signedIn: false,
	isStudent: true,
	myClaimIds: []
};

const ID_ADA = 'aa11bb22cc33dd44ee55ff6600112233';
const ID_GRACE = 'bb22cc33dd44ee55ff6600112233aa11';
const ID_WALKUP = 'cc33dd44ee55ff6600112233aa11bb22';

export const CONTRACT_OPEN = '11111111-1111-4111-8111-111111111111';
export const CONTRACT_MINE = '22222222-2222-4222-8222-222222222222';
export const CONTRACT_FULL = '33333333-3333-4333-8333-333333333333';
export const CONTRACT_DONE = '44444444-4444-4444-8444-444444444444';
export const CONTRACT_OTHER_SECTION = '66666666-6666-4666-8666-666666666666';
export const CONTRACT_GONE = '55555555-5555-4555-8555-555555555555';

/*
 * COIN V2 (0239) SHAPES. One balance (the sum of digital rows), the wage
 * exactly as the database computes it, and whether an Eating Pass is active.
 * Sections are IDEA Classroom labels (course code, then section label), which
 * is what the roster sends since 0239, with no color of their own.
 *
 * The three students cover the three states the board has to draw: a
 * positive whole balance with a pass, a NEGATIVE balance (the debt is the
 * balance, never a second figure), and a FRACTIONAL balance, which prints
 * with two decimals where a whole number prints bare.
 */
export const leaderboard = [
	{
		student_id: ID_ADA,
		name: 'Lovelace, Ada',
		section: 'IDEA113 Block 3',
		balance: 155,
		weekly_wage: 3,
		wage_tier: 3,
		eating_pass: true
	},
	{
		student_id: ID_GRACE,
		name: 'Hopper, Grace',
		section: 'IDEA209H Block 2',
		balance: -74.5,
		weekly_wage: 1,
		wage_tier: 1,
		eating_pass: false
	},
	{
		student_id: ID_WALKUP,
		name: 'de la Loza, Joseph',
		section: 'IDEA113 Block 3',
		balance: 40.25,
		weekly_wage: 2,
		wage_tier: 2,
		eating_pass: false
	}
];

function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	d.setHours(10, 15, 0, 0);
	return d.toISOString();
}

/**
 * Digital rows only, with the STORED SIGNED amount and the category id, which
 * is what 0239's feed returns. A payout is one debit row now. The positive
 * `balance_correction` is the case the old display got visibly wrong: a +40
 * credit rendered as a red -40, because the sign was reconstructed from the
 * type string instead of read off the row.
 */
export const transactions = [
	{ occurred_at: daysAgo(0), name: 'Lovelace, Ada', amount: 3, type: 'Award', reason: 'Weekly Wage', category_id: 'weekly_wage' },
	{ occurred_at: daysAgo(0), name: 'Hopper, Grace', amount: -2.5, type: 'Fine', reason: 'Disruptive Behavior', category_id: 'disruptive_behavior' },
	{ occurred_at: daysAgo(1), name: 'Lovelace, Ada', amount: 40, type: 'Adjustment', reason: 'Balance Correction / Refund', category_id: 'balance_correction' },
	{ occurred_at: daysAgo(1), name: 'Lovelace, Ada', amount: -150, type: 'Purchase', reason: 'Eating Pass', category_id: 'eating_pass' },
	{ occurred_at: daysAgo(2), name: 'de la Loza, Joseph', amount: 40.25, type: 'Award', reason: 'Above and Beyond', category_id: 'above_and_beyond' },
	{ occurred_at: daysAgo(3), name: 'Hopper, Grace', amount: -15, type: 'Adjustment', reason: 'Balance Correction / Refund', category_id: 'balance_correction' },
	{ occurred_at: daysAgo(8), name: 'Hopper, Grace', amount: 1, type: 'Award', reason: 'Weekly Wage', category_id: 'weekly_wage' },
	{ occurred_at: daysAgo(9), name: 'Lovelace, Ada', amount: -40, type: 'Payout', reason: 'Coin Payout', category_id: 'coin_payout' },
	{ occurred_at: daysAgo(10), name: 'Hopper, Grace', amount: -10, type: 'Fine', reason: 'Property Damage (Careless)', category_id: 'property_damage_careless' }
];

// Enough filler to push the log past the page's 50-row page size, so
// pagination is a state the harness can actually reach.
for (let i = 0; i < 60; i++) {
	const who = ['Lovelace, Ada', 'Hopper, Grace', 'de la Loza, Joseph'][i % 3];
	transactions.push({
		occurred_at: daysAgo(11 + i),
		name: who,
		amount: i % 2 === 0 ? 1 : -1,
		type: i % 2 === 0 ? 'Award' : 'Fine',
		reason: i % 2 === 0 ? 'Correct Answer in Class' : 'Off Task',
		category_id: i % 2 === 0 ? 'correct_answer' : 'off_task'
	});
}

function historyOf(name: string) {
	return transactions
		.filter((t) => t.name === name)
		.map(({ occurred_at, amount, category_id, type, reason }) => ({
			occurred_at,
			amount,
			category_id,
			type,
			reason
		}));
}

export const studentDetail: Record<string, Record<string, unknown>> = {
	[ID_ADA]: {
		ok: true,
		student_id: ID_ADA,
		name: 'Lovelace, Ada',
		section: 'IDEA113 Block 3',
		balance: 155,
		wage_tier: 3,
		weekly_wage: 3,
		eating_pass_held: true,
		history: historyOf('Lovelace, Ada')
	},
	[ID_GRACE]: {
		ok: true,
		student_id: ID_GRACE,
		name: 'Hopper, Grace',
		section: 'IDEA209H Block 2',
		balance: -74.5,
		wage_tier: 1,
		weekly_wage: 1,
		eating_pass_held: false,
		history: historyOf('Hopper, Grace')
	},
	[ID_WALKUP]: {
		ok: true,
		student_id: ID_WALKUP,
		name: 'de la Loza, Joseph',
		section: 'IDEA113 Block 3',
		balance: 40.25,
		wage_tier: 2,
		weekly_wage: 2,
		eating_pass_held: false,
		history: historyOf('de la Loza, Joseph')
	}
};

/** 0239's rules list: the price line (`detail`) and the rule's own words. */
export const reasons = [
	{ type: 'Award', reason: 'Weekly Wage', detail: `1 ${COIN_SYMBOL} times your wage tier, every school week`, sort_order: 1, category_id: 'weekly_wage', explanation: 'Paid automatically at the start of each school week you are enrolled.' },
	{ type: 'Award', reason: 'Above and Beyond', detail: `1-3 ${COIN_SYMBOL}`, sort_order: 2, category_id: 'above_and_beyond', explanation: 'For work that goes past what was asked.' },
	{ type: 'Fine', reason: 'Disruptive Behavior', detail: `2 ${COIN_SYMBOL}`, sort_order: 1, category_id: 'disruptive_behavior', explanation: null },
	{ type: 'Fine', reason: 'Property Damage (Careless)', detail: 'Calculated', sort_order: 2, category_id: 'property_damage_careless', explanation: 'Based on what the repair or replacement costs.' },
	{ type: 'Purchase', reason: 'Eating Pass', detail: `150 ${COIN_SYMBOL}`, sort_order: 1, category_id: 'eating_pass', explanation: 'Lets you eat in class. Three strikes and it is revoked.' },
	{ type: 'Purchase', reason: 'Song Request', detail: `2 ${COIN_SYMBOL}`, sort_order: 2, category_id: 'song_request', explanation: null }
];

export const contracts = [
	{
		id: CONTRACT_OPEN,
		title: 'Rebuild the shop cart',
		description: 'Two people, one afternoon. Bring gloves.',
		payout_amount: 20,
		max_contractors: 2,
		claimed_count: 0,
		status: 'Open',
		section: null,
		contractors: '',
		created_at: daysAgo(1),
		completed_at: null,
		cancelled_at: null,
		cancel_reason: null
	},
	{
		id: CONTRACT_MINE,
		title: 'Inventory the fastener wall',
		description: 'Count and label every bin.',
		payout_amount: 30,
		max_contractors: 3,
		claimed_count: 1,
		status: 'In Progress',
		section: null,
		contractors: 'Lovelace, Ada',
		created_at: daysAgo(2),
		completed_at: null,
		cancelled_at: null,
		cancel_reason: null
	},
	{
		id: CONTRACT_FULL,
		title: 'Repaint the safety lines',
		description: 'Tape, prime, paint.',
		payout_amount: 60,
		max_contractors: 1,
		claimed_count: 1,
		status: 'In Progress',
		section: 'IDEA209H Block 2',
		contractors: 'Hopper, Grace',
		created_at: daysAgo(3),
		completed_at: null,
		cancelled_at: null,
		cancel_reason: null
	},
	{
		// Open, but restricted to a section the harness student is not in, so
		// the `wrong_section` refusal is reachable on a real click.
		id: CONTRACT_OTHER_SECTION,
		title: 'Sort the 208-1 fastener bins',
		description: 'Period 2 only.',
		payout_amount: 12,
		max_contractors: 2,
		claimed_count: 0,
		status: 'Open',
		section: 'IDEA209H Block 2',
		contractors: '',
		created_at: daysAgo(1),
		completed_at: null,
		cancelled_at: null,
		cancel_reason: null
	},
	{
		id: CONTRACT_DONE,
		title: 'Wire the new bench outlets',
		description: 'Done and inspected.',
		payout_amount: 45,
		max_contractors: 2,
		claimed_count: 2,
		status: 'Completed',
		section: null,
		contractors: 'Lovelace, Ada | de la Loza, Joseph',
		created_at: daysAgo(20),
		completed_at: daysAgo(12),
		cancelled_at: null,
		cancel_reason: null
	},
	{
		id: CONTRACT_GONE,
		title: 'Build a parts cage',
		description: 'Superseded by the new shelving.',
		payout_amount: 25,
		max_contractors: 1,
		claimed_count: 0,
		status: 'Cancelled',
		section: null,
		contractors: '',
		created_at: daysAgo(30),
		completed_at: null,
		cancelled_at: daysAgo(14),
		cancel_reason: 'Superseded by the new shelving.'
	}
];

export const roles = [
	{
		section_id: 'idea113-block-3',
		section: 'IDEA113 Block 3',
		role_id: 'safety_officer',
		role: 'Safety Officer',
		description: 'Keeps the shop safe.',
		capacity: 2,
		held: 1,
		open: 1
	},
	{
		section_id: 'idea113-block-3',
		section: 'IDEA113 Block 3',
		role_id: 'quartermaster',
		role: 'Quartermaster',
		description: 'Owns the tool crib.',
		capacity: 1,
		held: 0,
		open: 1
	},
	{
		section_id: 'idea113-block-3',
		section: 'IDEA113 Block 3',
		// Zero open slots, so the board can show a full role too.
		role_id: 'lab_tech',
		role: 'Lab Tech',
		description: 'Runs the machines.',
		capacity: 2,
		held: 2,
		open: 0
	},
	{
		section_id: 'idea209h-block-2',
		section: 'IDEA209H Block 2',
		role_id: 'shop_steward',
		role: 'Shop Steward',
		description: 'Speaks for the class.',
		capacity: 1,
		held: 0,
		open: 1
	}
];

/**
 * Safety Officer has real questions; Quartermaster deliberately has NONE, so
 * the "no questions configured yet" path (0076's content-ownership rule) is
 * a state the harness can actually reach.
 */
export const roleQuestions: Record<string, unknown[]> = {
	safety_officer: [
		{
			question_id: 'q-1111',
			sequence: 1,
			type: 'mc',
			question_text: 'Where is the shop eyewash station?',
			options: ['By the door', 'Behind the mill', "There isn't one"]
		},
		{
			question_id: 'q-2222',
			sequence: 2,
			type: 'written',
			question_text: 'Describe a time you stopped unsafe work.',
			options: null
		}
	],
	quartermaster: [],
	lab_tech: [],
	shop_steward: []
};

export const sections = [
	{ section: 'IDEA113 Block 3', color: null },
	{ section: 'IDEA209H Block 2', color: null }
];
