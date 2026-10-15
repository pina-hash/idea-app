import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE TELEMETRY HARNESS. Dev only. The REAL tiles and charts per `?state=`:
 * `empty` (every chart says there is nothing to chart yet) or `data` (bars
 * on every chart, the stalled list, the hours per part).
 */
export const prerender = false;

const STATES = ['empty', 'data'] as const;
export type TelemetryState = (typeof STATES)[number];

export const load = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const wanted = url.searchParams.get('state');
	const state: TelemetryState = (STATES as readonly string[]).includes(wanted ?? '') ? (wanted as TelemetryState) : 'data';
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
