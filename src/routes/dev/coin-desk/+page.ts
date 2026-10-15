import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { COIN_DESK_AREAS, type CoinDeskAreaId } from '$lib/coin-desk/nav';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the /coin-desk route group: the REAL sub-nav and the
 * REAL per-area components against an in-memory ledger (fake-ledger.ts), no
 * auth, no live Supabase project. 404s in production.
 *
 * `?scope=section` mounts the desk as a section coin staff member sees it
 * (decision 68): the section tier's areas only, and the Students area with no
 * tools and no amount edit. `?area=<id>` opens one area directly, so a
 * browser spec can measure an area without clicking its way there.
 */
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	const scope = url.searchParams.get('scope') === 'section' ? 'section' : 'full';
	const raw = url.searchParams.get('area');
	const area = COIN_DESK_AREAS.some((a) => a.id === raw) ? (raw as CoinDeskAreaId) : null;
	return { scope, area } as { scope: 'full' | 'section'; area: CoinDeskAreaId | null };
};
