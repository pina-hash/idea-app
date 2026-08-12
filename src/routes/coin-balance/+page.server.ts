import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * `/coin-balance` folded into the IDEA Coin Ledger.
 *
 * The Ledger at `/coins/index.html` is the single student hub again — it
 * carries the balance, the leaderboard, the transaction log, analytics,
 * contracts and roles together, which is what it always was — so a separate
 * balance page is a second place for the same fact to be right or wrong.
 *
 * This stays as a redirect rather than a delete because the URL is in
 * bookmarks and muscle memory. `CoinBalanceView.svelte` is deliberately KEPT:
 * `/coin-desk/preview` mounts it to show an admin what a student sees.
 */
export const load: PageServerLoad = async () => {
	redirect(308, '/coins/index.html');
};
