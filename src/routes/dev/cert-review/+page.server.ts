import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE REVIEW HARNESS. Dev only. One submission through the REAL `ReviewPanel`
 * per `?state=`: `guided` (text, a link, two pictures, a file, the
 * self-inspection, the spec beside it), `checkout-video` (the embedded
 * unlisted video and the continuous-take note, the checkout card beside it),
 * `decided` (a failed review already on record, the way back to the desk).
 */
export const prerender = false;

const STATES = ['guided', 'checkout-video', 'decided'] as const;
export type ReviewState = (typeof STATES)[number];

export const load = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const wanted = url.searchParams.get('state');
	const state: ReviewState = (STATES as readonly string[]).includes(wanted ?? '') ? (wanted as ReviewState) : 'guided';
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
