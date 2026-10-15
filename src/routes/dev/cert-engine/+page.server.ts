import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

/**
 * THE ENGINE HARNESS. Dev only. `?state=`: `list` (the engine's list with
 * three certifications in three states, New certification and Settings),
 * `editor` (the REAL `EngineEditor` over a draft with publish problems, the
 * pool editor included, saving in memory), `import-diff` (the import panel
 * with step 1 already answered: a summary and a diff).
 */
export const prerender = false;

const STATES = ['list', 'editor', 'import-diff'] as const;
export type EngineState = (typeof STATES)[number];

export const load = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const wanted = url.searchParams.get('state');
	const state: EngineState = (STATES as readonly string[]).includes(wanted ?? '') ? (wanted as EngineState) : 'list';
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
