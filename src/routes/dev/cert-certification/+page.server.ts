import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * THE CERTIFICATION PAGE HARNESS (ledger 0391). Dev only: 404 in production,
 * no auth, no Supabase. The REAL `CertificationPage` over a fixture
 * `cert_get` with every part exercised, a fake watch transport and fake
 * actions, one state per `?state=` (`fresh`, `training`, `guided`, `exam`,
 * `review`, `cooldown`, `complete`) or every state stacked under
 * `[data-view]`. `?signed=1` hands the page a MOCK SESSION, the /dev/armory
 * shape, so the header's ProfileMenu renders its trigger.
 */
export const prerender = false;

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const state = url.searchParams.get('state');
	if (url.searchParams.get('signed') !== '1') return { state };
	return {
		state,
		claims: { sub: 'mock-cert-user', email: 'ana.reyes@boscotech.net' },
		userProfile: {
			id: 'mock-cert-user',
			email: 'ana.reyes@boscotech.net',
			full_name: 'Ana Reyes',
			display_name: null,
			avatar_url: null,
			avatar: 'preset:hex',
			role: 'student',
			section_id: null,
			pathway: 'IDEA',
			preferences: {}
		}
	};
};
