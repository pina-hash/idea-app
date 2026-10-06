import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE IDEA ARMORY HARNESS. Dev only: 404 in production, no auth, no Supabase.
 * The REAL Armory components with seeded fake data, one state per
 * `?state=` (for screenshots) or every state stacked (no query, for the
 * browser-verify spec).
 *
 * `?signed=1` hands the page a MOCK SESSION (claims and a profile, the
 * /dev/profile-menu shape) so the header's ProfileMenu renders its trigger:
 * that is what the dropdown hit test opens over the Armory page (ledger 0366,
 * Mr. Pina's "things on the Armory page overlap the profile dropdown"). The
 * profile carries a pathway so the first-login picker stays away. Without the
 * flag the page is signed out, exactly as before.
 */
export const prerender = false;

export const load = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const only = url.searchParams.get('state');
	if (url.searchParams.get('signed') !== '1') return { only };
	return {
		only,
		claims: { sub: 'mock-armory-user', email: 'apina@boscotech.edu' },
		userProfile: {
			id: 'mock-armory-user',
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
