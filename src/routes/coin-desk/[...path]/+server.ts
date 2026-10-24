import { redirect } from '@sveltejs/kit';
import { coinDeskRedirect } from '$lib/coin-desk/nav';
import type { RequestHandler } from './$types';

/**
 * THE COIN DESK IS PART OF THE COIN HOME NOW (ledger 0432, Mr. Pina
 * 2026-10-23). Every old /coin-desk address answers a 308 to where it lives
 * now: an area to `/coin/<area>`, the front door and the retired Contracts
 * area to the coin home. The target never depends on who is asking, so the
 * redirect says nothing about who may open an area; each area answers its
 * own 404 to anyone who is not coin staff.
 */
export const GET: RequestHandler = ({ params, url }) => {
	redirect(308, coinDeskRedirect(params.path ?? '', url.search));
};
