<script lang="ts">
	import StudentPreview from '$lib/coin-desk/StudentPreview.svelte';

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

<StudentPreview {data} />
