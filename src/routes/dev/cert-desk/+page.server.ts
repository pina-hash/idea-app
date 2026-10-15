import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE CERTIFIER DESK HARNESS. Dev only: 404 in production, no auth, no
 * Supabase. The REAL desk components over the seeded fixtures, one state per
 * `?state=`: `empty` (nothing waiting, no telemetry) or `busy` (two
 * submissions in the queue, one request, the tiles and every chart).
 *
 * `?signed=1` hands the page a MOCK SESSION (claims and a profile, the
 * /dev/armory shape) so a Disclosure's per-person memory has a viewer.
 */
export const prerender = false;

const STATES = ['empty', 'busy'] as const;
export type DeskState = (typeof STATES)[number];

export const load = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const wanted = url.searchParams.get('state');
	const state: DeskState = (STATES as readonly string[]).includes(wanted ?? '') ? (wanted as DeskState) : 'busy';
	if (url.searchParams.get('signed') !== '1') return { state };
	return {
		state,
		claims: { sub: 'mock-cert-admin', email: 'apina@boscotech.edu' },
		userProfile: {
			id: 'mock-cert-admin',
			email: 'apina@boscotech.edu',
			full_name: 'Mr. Pina',
			display_name: null,
			avatar_url: null,
			avatar: 'preset:hex',
			role: 'teacher',
			section_id: null,
			pathway: 'IDEA',
			preferences: {}
		}
	};
};
