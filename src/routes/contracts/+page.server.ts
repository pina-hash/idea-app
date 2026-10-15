import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * `/contracts` folded into the IDEA Coin Ledger.
 *
 * The Ledger's Contracts tab is the contracts board — it always was — and it
 * now carries the claim control too, so a standalone route is a second board
 * to keep in step with the first.
 *
 * A redirect rather than a delete because the URL is in bookmarks. A student
 * claims and marks a contract done on their own coin page (/coin-balance)
 * since IDEA Coin V2 session two; the old ContractsView and the Coin Desk
 * preview that mounted it are gone.
 */
export const load: PageServerLoad = async () => {
	redirect(308, '/coins/index.html');
};
