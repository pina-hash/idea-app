/**
 * Sample data for the /dev/coins harness (404 in production, no auth, no
 * Supabase).
 *
 * These are RPC-SHAPED ROWS, not finished responses: the harness feeds them
 * to the REAL `readCoinPublic` through a fake client whose `.rpc()` answers
 * from this file, so everything the page then parses -- the CSV headers, the
 * date formatting, the honest Bank Balance/Debt mapping, the contract field
 * names, the per-section role grouping -- is produced by the shipping code
 * and not re-implemented here.
 *
 * The one thing they deliberately do NOT contain is an email address, for the
 * same reason the real RPCs project it away: if the fixture carried one, a
 * regression that leaked it would still look clean in the harness.
 */

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

export const leaderboard = [
	{
		student_id: ID_ADA,
		name: 'Lovelace, Ada',
		section: 'IDEA-113',
		// TWO exclusions apply to Ada, and she is here because they have to
		// compose. 0103: `awarded` and `spent` EXCLUDE her 40i¢ WITHDRAWAL,
		// whose halves are +40 physical and -40 digital. 0107: they also
		// exclude her +40 REFUND, which is an adjustment-kind row and so is
		// neither earned nor spent -- it is the 40 in `adjustments` below.
		// Pre-0107 `awarded` read 214 here, and her Lifetime Earned headline
		// read 195 for coins she was handed back rather than earned.
		awarded: 174,
		fines: 19,
		spent: 40,
		// A refund, at its stored sign. Ada and Grace carry opposite signs and
		// Joseph carries none, so the harness shows all three states at once.
		adjustments: 40,
		// A withdrawal IS counted here: this is how much has left the digital
		// balance as coins in hand.
		paid_out: 40,
		balance: 155,
		debt: 0,
		weekly_wage: 3,
		wage_tier: 3,
		// 0096: the two media always sum to `balance`. Ada holds both.
		physical_balance: 120,
		digital_balance: 35
	},
	{
		student_id: ID_GRACE,
		name: 'Hopper, Grace',
		section: 'IDEA-208-1',
		awarded: 88,
		fines: 12,
		// Pre-0107 this read 150: her -15 CLAWBACK fell into `spent`, because
		// that bucket was "any negative that is not a fine", so a correction
		// read as a purchase.
		spent: 135,
		adjustments: -15,
		paid_out: 0,
		balance: -74,
		debt: 74,
		weekly_wage: 1,
		wage_tier: 1,
		// A NEGATIVE physical balance is a real state -- fined past what she
		// was holding -- and the drawer shows it rather than hiding it, which
		// the positive-only `Bank Balance` stand-in could not.
		physical_balance: -14,
		digital_balance: -60
	},
	{
		student_id: ID_WALKUP,
		name: 'de la Loza, Joseph',
		section: 'IDEA-304',
		awarded: 40,
		fines: 0,
		spent: 0,
		// No correction of any kind: the control that keeps "the Adjustments
		// figure appears only when it is nonzero" from being unfalsifiable.
		adjustments: 0,
		paid_out: 0,
		balance: 40,
		debt: 0,
		weekly_wage: 2,
		wage_tier: 2,
		// Coins entirely in hand and nothing banked -- the other end of the
		// split from Ada.
		physical_balance: 40,
		digital_balance: 0
	}
];

/** The one transfer in the fixture: Ada's 40i¢ withdrawal, as two linked rows. */
const TRANSFER_ADA = '77777777-7777-4777-8777-777777777777';

function daysAgo(n: number): string {
	const d = new Date();
	d.setDate(d.getDate() - n);
	d.setHours(10, 15, 0, 0);
	return d.toISOString();
}

/**
 * Every row carries its STORED SIGNED amount and its medium, because that is
 * what the RPC returns and what the page must render from. Two rows deserve
 * particular attention:
 *
 *   * The two `balance_correction` adjustments, one POSITIVE and one
 *     NEGATIVE. The positive one is the case the old display got visibly
 *     wrong: a +40 credit rendered as a red -40, because the sign was
 *     reconstructed from the type string instead of read off the row.
 *   * The payout PAIR sharing `TRANSFER_ADA` -- a digital debit and an equal
 *     physical credit, the two halves of one withdrawal, which the page
 *     collapses back into the single event it was.
 */
export const transactions = [
	{ occurred_at: daysAgo(0), name: 'Lovelace, Ada', amount: 3, type: 'Award', reason: 'Weekly Wage', medium: 'physical', transfer_id: null },
	{ occurred_at: daysAgo(0), name: 'Hopper, Grace', amount: -2, type: 'Fine', reason: 'Disruptive Behavior', medium: 'physical', transfer_id: null },
	{ occurred_at: daysAgo(1), name: 'Lovelace, Ada', amount: 40, type: 'Adjustment', reason: 'Balance Correction / Refund', medium: 'digital', transfer_id: null },
	{ occurred_at: daysAgo(1), name: 'Lovelace, Ada', amount: -150, type: 'Purchase', reason: 'Eating Pass', medium: 'physical', transfer_id: null },
	{ occurred_at: daysAgo(2), name: 'de la Loza, Joseph', amount: 40, type: 'Award', reason: 'Above and Beyond', medium: 'physical', transfer_id: null },
	{ occurred_at: daysAgo(3), name: 'Hopper, Grace', amount: -15, type: 'Adjustment', reason: 'Balance Correction / Refund', medium: 'digital', transfer_id: null },
	{ occurred_at: daysAgo(8), name: 'Hopper, Grace', amount: 1, type: 'Award', reason: 'Weekly Wage', medium: 'digital', transfer_id: null },
	{ occurred_at: daysAgo(9), name: 'Lovelace, Ada', amount: -40, type: 'Payout', reason: 'Coin Payout', medium: 'digital', transfer_id: TRANSFER_ADA },
	{ occurred_at: daysAgo(9), name: 'Lovelace, Ada', amount: 40, type: 'Payout', reason: 'Coin Payout (physical credit)', medium: 'physical', transfer_id: TRANSFER_ADA },
	{ occurred_at: daysAgo(10), name: 'Hopper, Grace', amount: -10, type: 'Fine', reason: 'Property Damage (Careless)', medium: 'physical', transfer_id: null }
];

// Enough filler to push the log past the page's 50-row page size, so
// pagination is a state the harness can actually reach (the real ledger has
// 216 rows and climbing).
for (let i = 0; i < 60; i++) {
	const who = ['Lovelace, Ada', 'Hopper, Grace', 'de la Loza, Joseph'][i % 3];
	transactions.push({
		occurred_at: daysAgo(11 + i),
		name: who,
		amount: i % 2 === 0 ? 1 : -1,
		type: i % 2 === 0 ? 'Award' : 'Fine',
		reason: i % 2 === 0 ? 'Correct Answer in Class' : 'Off Task',
		medium: i % 3 === 0 ? 'digital' : 'physical',
		transfer_id: null
	});
}

export const studentDetail: Record<string, Record<string, unknown>> = {
	[ID_ADA]: {
		ok: true,
		student_id: ID_ADA,
		name: 'Lovelace, Ada',
		section: 'IDEA-113',
		balance: 155,
		physical_balance: 120,
		digital_balance: 35,
		wage_tier: 3,
		weekly_wage: 3,
		eating_pass_held: true,
		history: transactions.filter((t) => t.name === 'Lovelace, Ada')
	},
	[ID_GRACE]: {
		ok: true,
		student_id: ID_GRACE,
		name: 'Hopper, Grace',
		section: 'IDEA-208-1',
		balance: -74,
		physical_balance: -14,
		digital_balance: -60,
		wage_tier: 1,
		weekly_wage: 1,
		eating_pass_held: false,
		history: transactions.filter((t) => t.name === 'Hopper, Grace')
	},
	[ID_WALKUP]: {
		ok: true,
		student_id: ID_WALKUP,
		name: 'de la Loza, Joseph',
		section: 'IDEA-304',
		balance: 40,
		physical_balance: 40,
		digital_balance: 0,
		wage_tier: 2,
		weekly_wage: 2,
		eating_pass_held: false,
		history: transactions.filter((t) => t.name === 'de la Loza, Joseph')
	}
};

export const reasons = [
	{ type: 'Award', reason: 'Weekly Wage', detail: '1 i¢ — paid at your own wage tier', sort_order: 1 },
	{ type: 'Award', reason: 'Above and Beyond', detail: '1-3 i¢', sort_order: 2 },
	{ type: 'Fine', reason: 'Disruptive Behavior', detail: '2 i¢', sort_order: 1 },
	{ type: 'Fine', reason: 'Property Damage (Careless)', detail: 'Calculated', sort_order: 2 },
	{ type: 'Purchase', reason: 'Eating Pass', detail: '150 i¢', sort_order: 1 },
	{ type: 'Purchase', reason: 'Song Request', detail: '10 i¢', sort_order: 2 }
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
		section: 'IDEA-208-1',
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
		section: 'IDEA-208-1',
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
		section_id: 'idea-113',
		section: 'IDEA-113',
		role_id: 'safety_officer',
		role: 'Safety Officer',
		description: 'Keeps the shop safe.',
		capacity: 2,
		held: 1,
		open: 1
	},
	{
		section_id: 'idea-113',
		section: 'IDEA-113',
		role_id: 'quartermaster',
		role: 'Quartermaster',
		description: 'Owns the tool crib.',
		capacity: 1,
		held: 0,
		open: 1
	},
	{
		section_id: 'idea-113',
		section: 'IDEA-113',
		// Zero open slots, so the board can show a full role too.
		role_id: 'lab_tech',
		role: 'Lab Tech',
		description: 'Runs the machines.',
		capacity: 2,
		held: 2,
		open: 0
	},
	{
		section_id: 'idea-208-1',
		section: 'IDEA-208-1',
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
	{ section: 'IDEA-113', color: '#00FF41' },
	{ section: 'IDEA-208-1', color: '#00F0FF' }
];
