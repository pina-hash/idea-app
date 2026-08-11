import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the /coin-desk route group. Mounts the REAL sub-nav
 * and the REAL per-area components against an in-memory ledger that mirrors
 * 0070's enforcement (debt lockout, Eating Pass strikes/revoke, Extra
 * Credit's cap, calendar-boundary caps, every formula) closely enough to
 * reach every refusal shape the real RPCs return, with no auth or live
 * Supabase project needed. 404s in production.
 */
export const ssr = false;
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
