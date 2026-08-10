import { redirect } from '@sveltejs/kit';
import type { PublicContractRow } from '$lib/coin-desk/contracts';
import type { PageServerLoad } from './$types';

/**
 * The student-facing contracts board (0077): browse open contracts, claim
 * one, see which ones you're currently on. Gated to signed-in
 * @boscotech.net students specifically, the exact /coin-balance pattern
 * (not admin-only like /coin-desk, not public like /coin-entry): an
 * anonymous visitor or a signed-in non-student is redirected to `/`.
 *
 * Reads run as the CALLER'S OWN session with no extra filter, the
 * /coin-balance doctrine: coin_contracts / coin_contract_status are granted
 * a broad signed-in SELECT (0077), and coin_contract_claims' RLS already
 * scopes a plain student to their own rows, so the filtering IS the policy,
 * not application code.
 */
export const load: PageServerLoad = async ({ locals: { supabase, claims } }) => {
	if (!claims) redirect(303, '/');

	const { data: profile } = await supabase
		.from('profiles')
		.select('role, email')
		.eq('id', claims.sub)
		.maybeSingle();

	if (profile?.role !== 'student') redirect(303, '/');

	const [contractsResp, statusResp, claimsResp] = await Promise.all([
		supabase
			.from('coin_contracts')
			.select(
				'id, title, description, payout_amount, max_contractors, section_id, created_by, created_at, completed_at, cancelled_at'
			)
			.order('created_at', { ascending: false }),
		supabase.from('coin_contract_status').select('id, claimed_count, status'),
		supabase.from('coin_contract_claims').select('contract_id')
	]);

	// Fails soft: 0077 not applied yet reads as a clearly-flagged "not
	// available" page rather than a crashed one (the /coin-desk convention).
	const configured = !contractsResp.error && !statusResp.error && !claimsResp.error;

	const statusById = new Map(
		((statusResp.data ?? []) as { id: string; claimed_count: number; status: PublicContractRow['status'] }[]).map(
			(s) => [s.id, s]
		)
	);
	const contracts: PublicContractRow[] = ((contractsResp.data ?? []) as Omit<
		PublicContractRow,
		'claimed_count' | 'status'
	>[]).map((c) => {
		const s = statusById.get(c.id);
		return { ...c, claimed_count: s?.claimed_count ?? 0, status: s?.status ?? 'open' };
	});

	return {
		configured,
		email: profile?.email ?? claims.email ?? null,
		contracts,
		myClaimIds: ((claimsResp.data ?? []) as { contract_id: string }[]).map((c) => c.contract_id)
	};
};
