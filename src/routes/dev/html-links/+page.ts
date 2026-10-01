import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for LINK HAND-INS ON A PORTED WORKSHEET (ledger 0360): the
 * student's own `HtmlLinkCheck` under the progress rail, and the grader's
 * `AnswerLinks` and `HtmlAnswerList`, each the REAL component with
 * representative answers. No auth, no Supabase, no network. 404s in production.
 *
 * `?state=valid` (the default), `?state=invalid` and `?state=none` put the
 * student's link field in its three readings; `none` is the empty field, which
 * renders nothing, so a pass can assert the absence beside the two presences.
 */
export const prerender = false;

export const load: PageLoad = async () => {
	if (!dev) error(404, 'Not found');
	return {};
};
