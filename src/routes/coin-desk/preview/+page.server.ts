import {
	withCategoryNames,
	type CoinBalanceTransaction,
	type EatingPassStatus
} from '$lib/coin-balance';
import type { PublicContractRow } from '$lib/coin-desk/contracts';
import type { PageServerLoad } from './$types';

/**
 * PREVIEW AS STUDENT — what one student sees, rendered for an admin.
 *
 * ================================================================
 * THIS IS NOT IMPERSONATION, AND THE DESIGN IS WHAT MAKES THAT TRUE.
 * ================================================================
 * No session is swapped. No token is minted. No cookie or header changes who
 * the caller is. Every read below runs as the ADMIN'S OWN session against
 * RPCs the admin already holds (`coin_admin_lookup`, `coin_admin_list_
 * contracts`) — the same calls `/coin-desk/students` and
 * `/coin-desk/contracts` make on the pages beside this one. Nothing here can
 * see anything an admin could not already see; the only thing that changed is
 * how it is arranged on screen.
 *
 * If a future change to this page needs a session swap, a service-role
 * client, or a new grant to make it work, that is the signal that it has
 * stopped being a preview and become impersonation — stop and reconsider
 * rather than building it.
 *
 * WRITES: there are none, structurally. `CoinBalanceView` has no write path
 * at all (it takes no Supabase client), and `ContractsView` is mounted with
 * `readOnly`, which removes every claim control from the markup AND makes
 * `claimContract` return before it can call anything. Its on-mount refresh is
 * skipped for the same reason: that read is RLS-scoped to the caller, so on
 * this page it would answer with the ADMIN'S claims under a student's name.
 *
 * Admin gating is the group's +layout.server.ts (404, never a redirect), so
 * this file adds none of its own.
 */
export const load: PageServerLoad = async ({ url, locals: { supabase } }) => {
	const email = (url.searchParams.get('student') ?? '').trim().toLowerCase();

	// The roster the picker offers. Only students, only admin-readable rows
	// (the "teachers select all profiles" policy — 0067's naming trap, it
	// means admins).
	const { data: roster } = await supabase
		.from('profiles')
		.select('email, display_name, full_name')
		.eq('role', 'student')
		.order('display_name', { ascending: true })
		.limit(500);

	const students = ((roster ?? []) as { email: string | null; display_name: string | null; full_name: string | null }[])
		.filter((r) => !!r.email)
		.map((r) => ({
			email: (r.email as string).toLowerCase(),
			name: r.display_name || r.full_name || (r.email as string).split('@')[0]
		}));

	if (!email) {
		return {
			students,
			email: null,
			displayName: null,
			configured: true,
			balance: 0,
			physicalBalance: 0,
			digitalBalance: 0,
			transactions: [],
			categoryKinds: {} as Record<string, string>,
			wageTier: null,
			eatingPass: { active: false, strikes: 0 } as EatingPassStatus,
			contracts: [] as PublicContractRow[],
			myClaimIds: [] as string[],
			loadError: ''
		};
	}

	const [{ data: lookup, error: lookupError }, { data: categories }, { data: contractRows }] =
		await Promise.all([
			supabase.rpc('coin_admin_lookup', { p_email: email }),
			supabase.from('coin_categories').select('id, name, kind'),
			supabase.rpc('coin_admin_list_contracts')
		]);

	const detail = (lookup ?? {}) as {
		balance?: number;
		physical_balance?: number;
		digital_balance?: number;
		wage_tier?: number;
		eating_pass_active?: boolean;
		eating_pass_strikes?: number;
		recent_transactions?: CoinBalanceTransaction[];
	};

	const rows = (detail.recent_transactions ?? []) as CoinBalanceTransaction[];

	// The claimants list is what makes "which contracts is this student on"
	// answerable from an admin-read RPC without ever asking the database to
	// pretend to be them.
	type AdminContractRow = PublicContractRow & {
		claimants?: { student_email?: string }[];
	};
	const rawContracts = (contractRows ?? []) as AdminContractRow[];
	const contracts: PublicContractRow[] = rawContracts.map(({ claimants: _claimants, ...c }) => c);
	const myClaimIds = rawContracts
		.filter((c) => (c.claimants ?? []).some((k) => (k.student_email ?? '').toLowerCase() === email))
		.map((c) => c.id);

	const student = students.find((s) => s.email === email);

	return {
		students,
		email,
		displayName: student?.name ?? email.split('@')[0],
		configured: !lookupError,
		// The RPC's own total, not a sum of `recent_transactions` -- that list
		// is capped at 25 rows, so summing it would understate a busy account.
		balance: lookupError ? 0 : (detail.balance ?? 0),
		physicalBalance: lookupError ? 0 : (detail.physical_balance ?? 0),
		digitalBalance: lookupError ? 0 : (detail.digital_balance ?? 0),
		transactions: withCategoryNames(rows, categories ?? []),
		// A row's kind is what tells a balance CORRECTION apart from an ordinary
		// award or fine; without it every non-payout row reads as a correction.
		categoryKinds: Object.fromEntries(
			((categories ?? []) as { id: string; kind?: string }[]).map((c) => [c.id, c.kind ?? ''])
		) as Record<string, string>,
		wageTier: detail.wage_tier ?? 1,
		eatingPass: {
			active: detail.eating_pass_active === true,
			strikes: detail.eating_pass_strikes ?? 0
		} as EatingPassStatus,
		contracts,
		myClaimIds,
		loadError: lookupError?.message ?? ''
	};
};
