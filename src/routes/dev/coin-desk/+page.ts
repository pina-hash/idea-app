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

export const load: PageLoad = async ({ url }) => {
	if (!dev) error(404, 'Not found');
	// "Import from class roster" (SectionManager): `?roster=none` hands no
	// classroom transport in, which must remove the control; `?roster=degraded`
	// answers the pre-0138 roster that cannot tell a teacher from a student,
	// which must refuse. Anything else is the full transport.
	const roster = url.searchParams.get('roster');
	return {
		rosterMode: roster === 'none' ? 'none' : roster === 'degraded' ? 'degraded' : 'full'
	} as { rosterMode: 'none' | 'degraded' | 'full' };
};
