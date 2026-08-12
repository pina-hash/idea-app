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
		balance: 155,
		transactions: [
			{
				id: 't1',
				category_id: 'weekly_wage',
				category_name: 'Weekly Wage',
				amount: 3,
				quantity: null,
				note: null,
				meta: {},
				created_at: new Date().toISOString()
			},
			{
				id: 't2',
				category_id: 'eating_pass',
				category_name: 'Eating Pass',
				amount: -150,
				quantity: null,
				note: null,
				meta: {},
				created_at: new Date(Date.now() - 86_400_000).toISOString()
			}
		],
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
