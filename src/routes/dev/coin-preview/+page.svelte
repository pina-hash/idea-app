<script lang="ts">
	import StudentPreview from '$lib/coin-desk/StudentPreview.svelte';
	/**
	 * THE COIN DESK'S ROOM, imported here and wrapped below, because production
	 * has it and this harness did not.
	 *
	 * The preview route's own page component mounts the component and nothing
	 * else; the room arrives from `/coin-desk/+layout.svelte`, which wraps every
	 * area in `.cd-root` and imports exactly this stylesheet. Both halves are
	 * needed -- `split.css` is where `.cd-root` is REGISTERED (`--cr-gutter`,
	 * `--cr-thumb`, the scrollbar treatment, the split geometry), so without the
	 * import the wrapper is a class with no rules: a room in the markup that
	 * paints nothing, which is a worse fixture than no wrapper at all.
	 *
	 * WHAT THIS ROOM DOES NOT DO IS REPAINT, and that is worth having measured
	 * rather than assumed. split.css says it in words: "the coin desk sits on
	 * the portal's own dark plate rather than bringing a room palette." So
	 * unlike `.cr-root` or `.gt-root`, this wrapper moves geometry and
	 * scrollbars and not colour -- the banner and picker ratios came back
	 * identical either side of it (10.67:1 and 5.31:1), and what moved was the
	 * page measure.
	 */
	import '$lib/shell/split.css';

	/**
	 * Dev harness for /coin-desk/preview (404 in production, no auth, no
	 * Supabase). Mounts the REAL StudentPreview against sample data shaped
	 * exactly like the route's own load returns, so the banner, the picker,
	 * and — the part that matters — the ABSENCE of every mutating control can
	 * be checked in a browser without an admin session.
	 */
	const data = {
		students: [
			{ email: 'ada.lovelace@boscotech.net', name: 'Lovelace, Ada' },
			{ email: 'grace.hopper@boscotech.net', name: 'Hopper, Grace' }
		],
		email: 'ada.lovelace@boscotech.net',
		displayName: 'Lovelace, Ada',
		configured: true,
		// Total, then the split (0096). 120 physical + 35 digital = 155, so
		// the preview shows a student who has withdrawn most of what they
		// earned and still has a little banked.
		balance: 155,
		physicalBalance: 120,
		digitalBalance: 35,
		/**
		 * Every shape the row renderer has to tell apart, in one list:
		 *
		 *   * an AWARD and a PURCHASE -- the ordinary two, and the control that
		 *     keeps the correction styling from being unfalsifiable;
		 *   * a POSITIVE and a NEGATIVE balance correction. Both used to render
		 *     exactly like an award and a fine, which is the defect: a refund
		 *     read as money earned and a clawback as money spent;
		 *   * TWO payouts, each stored as the pair it really is (a digital debit
		 *     and an equal physical credit sharing one transfer id). More than
		 *     one on purpose -- a single payout cannot tell a correct pair
		 *     collapse from one that merges every withdrawal into one row.
		 */
		transactions: [
			{
				id: 't1',
				category_id: 'weekly_wage',
				category_name: 'Weekly Wage',
				amount: 3,
				medium: 'physical' as const,
				transfer_id: null,
				quantity: null,
				note: null,
				meta: {},
				created_at: new Date().toISOString()
			},
			{
				id: 't2',
				category_id: 'balance_correction',
				category_name: 'Balance Correction / Refund',
				amount: 40,
				medium: 'digital' as const,
				transfer_id: null,
				quantity: null,
				note: 'Refunded the eating pass',
				meta: {},
				created_at: new Date(Date.now() - 3_600_000).toISOString()
			},
			{
				id: 't3',
				category_id: 'eating_pass',
				category_name: 'Eating Pass',
				amount: -150,
				medium: 'physical' as const,
				transfer_id: null,
				quantity: null,
				note: null,
				meta: {},
				created_at: new Date(Date.now() - 86_400_000).toISOString()
			},
			{
				id: 't4',
				category_id: 'balance_correction',
				category_name: 'Balance Correction / Refund',
				amount: -15,
				medium: 'digital' as const,
				transfer_id: null,
				quantity: null,
				note: 'Logged twice by mistake',
				meta: {},
				created_at: new Date(Date.now() - 172_800_000).toISOString()
			},
			{
				id: 't5a',
				category_id: 'coin_payout',
				category_name: 'Coin Payout',
				amount: -40,
				medium: 'digital' as const,
				transfer_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
				quantity: null,
				note: null,
				meta: {},
				created_at: new Date(Date.now() - 259_200_000).toISOString()
			},
			{
				id: 't5b',
				category_id: 'payout_physical_credit',
				category_name: 'Coin Payout (physical credit)',
				amount: 40,
				medium: 'physical' as const,
				transfer_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
				quantity: null,
				note: null,
				meta: {},
				created_at: new Date(Date.now() - 259_200_000).toISOString()
			},
			{
				id: 't6a',
				category_id: 'coin_payout',
				category_name: 'Coin Payout',
				amount: -25,
				medium: 'digital' as const,
				transfer_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
				quantity: null,
				note: null,
				meta: {},
				created_at: new Date(Date.now() - 259_200_000).toISOString()
			},
			{
				id: 't6b',
				category_id: 'payout_physical_credit',
				category_name: 'Coin Payout (physical credit)',
				amount: 25,
				medium: 'physical' as const,
				transfer_id: 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb',
				quantity: null,
				note: null,
				meta: {},
				created_at: new Date(Date.now() - 259_200_000).toISOString()
			}
		],
		/**
		 * What the real load reads off `coin_categories`. Without it every
		 * non-payout row would read as a correction -- see `coinTxnType`.
		 */
		categoryKinds: {
			weekly_wage: 'award',
			eating_pass: 'purchase',
			balance_correction: 'adjustment',
			coin_payout: 'purchase',
			payout_physical_credit: 'adjustment'
		},
		wageTier: 3,
		eatingPass: { active: true, strikes: 1 },
		contracts: [
			{
				id: '11111111-1111-4111-8111-111111111111',
				title: 'Rebuild the shop cart',
				description: 'Two people, one afternoon.',
				payout_amount: 20,
				max_contractors: 2,
				section_id: null,
				created_by: 'apina@boscotech.edu',
				created_at: new Date(Date.now() - 86_400_000).toISOString(),
				completed_at: null,
				cancelled_at: null,
				claimed_count: 1,
				status: 'open' as const
			},
			{
				id: '22222222-2222-4222-8222-222222222222',
				title: 'Inventory the fastener wall',
				description: 'Count and label every bin.',
				payout_amount: 30,
				max_contractors: 3,
				section_id: null,
				created_by: 'apina@boscotech.edu',
				created_at: new Date(Date.now() - 172_800_000).toISOString(),
				completed_at: null,
				cancelled_at: null,
				claimed_count: 1,
				status: 'open' as const
			}
		],
		myClaimIds: ['22222222-2222-4222-8222-222222222222'],
		loadError: ''
	};
</script>

<!-- The room, and the same `main.coin-desk-page` measure the layout gives every
     coin desk area. Not an approximation of the chain: `split.css` sets
     `--cr-measure` on a room that CONTAINS a split, and the page measure is read
     off `--cr-measure` on the page element, so a harness that dropped the main
     would be measuring an unbounded column no coin desk area ever renders at. -->
<div class="cd-root">
	<main class="coin-desk-page">
		<StudentPreview {data} />
	</main>
</div>

<style>
	/* Copied from `/coin-desk/+layout.svelte`, which is where production's copy
	   lives; a harness cannot import a layout's scoped styles. Two declarations,
	   and they are the page measure and the gutter -- everything else on this
	   page comes from the room or from the component. */
	.coin-desk-page {
		max-width: var(--cr-measure, 52rem);
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 2rem;
	}
</style>
