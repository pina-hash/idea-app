import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the BADGE EMBLEMS (ledger 0360, report R16). It mounts
 * the REAL `BadgeIcon` and nothing else that draws a badge: every emblem at the
 * four sizes the site draws it at, a row of real plate keys holding them the
 * way the class theme ballot and the profile picker do (hover motion, one
 * pressed), and a row in `once` motion with a Replay control. No auth, no
 * Supabase; 404 in production. Under `/dev/classroom`, so the theme scope and
 * the plate already cover it with no list edited.
 *
 *   ?theme=space-white      the light theme, forced (no session here)
 *   ?theme=matrix           the Matrix theme's tokens, forced
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
