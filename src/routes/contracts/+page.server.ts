import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * `/contracts` folded into the IDEA Coin Ledger.
 *
 * The Ledger's Contracts tab is the contracts board — it always was — and it
 * now carries the claim control too, so a standalone route is a second board
 * to keep in step with the first.
 *
 * A redirect rather than a delete because the URL is in bookmarks.
 * `ContractsView.svelte` is deliberately KEPT: `/coin-desk/preview` mounts it
 * to show an admin what a student sees.
 */
export const load: PageServerLoad = async () => {
	redirect(308, '/coins/index.html');
};
