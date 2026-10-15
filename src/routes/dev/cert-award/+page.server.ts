import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE AWARD HARNESS. Dev only. The REAL `AwardPanel` per `?state=`: `locked`
 * (a part still pending: the key is dark with the locked sentence), `ready`
 * (every part checked, the key lit, the dialog closed), `confirm` (the dialog
 * open on load so a spec can measure it), `refused-unsigned` (the dialog open
 * with the no-signing-key refusal verbatim), `refused-self` (the certifier is
 * the student: the key is dark and says why).
 */
export const prerender = false;

const STATES = ['locked', 'ready', 'confirm', 'refused-unsigned', 'refused-self'] as const;
export type AwardState = (typeof STATES)[number];

export const load = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const wanted = url.searchParams.get('state');
	const state: AwardState = (STATES as readonly string[]).includes(wanted ?? '') ? (wanted as AwardState) : 'locked';
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
