import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { CONTRACT_FULL, contracts, devState } from '../../fixture';
import type { RequestHandler } from './$types';

/**
 * The harness's `/api/coin/claim`. Mirrors the REAL refusal shapes
 * `coin_contract_self_claim` returns (0077), so the page's refusal rendering
 * is driven by the same `{ ok, reason }` values production sends.
 */
export const GET: RequestHandler = async ({ setHeaders }) => {
	if (!dev) error(404, 'Not found');
	setHeaders({ 'cache-control': 'no-store' });
	return json({ contractIds: devState.signedIn ? devState.myClaimIds : [] });
};

export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');
	if (!devState.signedIn) return json({ ok: false, reason: 'not_signed_in' }, { status: 401 });

	const { contractId } = (await request.json()) as { contractId: string };
	const c = contracts.find((row) => row.id === contractId);
	if (!c) return json({ ok: false, reason: 'not_open' });
	if (devState.myClaimIds.includes(contractId)) return json({ ok: false, reason: 'already_claimed' });
	if (c.status === 'Completed' || c.status === 'Cancelled') return json({ ok: false, reason: 'not_open' });
	// The section-restricted one refuses, so the wrong_section message is
	// reachable on a real click rather than only in theory.
	if (c.section) return json({ ok: false, reason: 'wrong_section' });
	if (contractId === CONTRACT_FULL || c.claimed_count >= c.max_contractors) {
		return json({ ok: false, reason: 'full', max_contractors: c.max_contractors, claimed_count: c.claimed_count });
	}

	devState.myClaimIds = [...devState.myClaimIds, contractId];
	c.claimed_count += 1;
	c.contractors = c.contractors ? `${c.contractors} | Lovelace, Ada` : 'Lovelace, Ada';
	if (c.status === 'Open') c.status = 'In Progress';
	return json({ ok: true });
};
