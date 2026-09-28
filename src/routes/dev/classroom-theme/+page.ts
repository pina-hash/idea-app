import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for CLASS THEMES (decision 45, report R07, ledger 0347). It
 * mounts the REAL ClassView (whose header the REAL ClassThemeBanner wraps), the
 * REAL ClassThemePanel under it, the REAL MyClasses cards, the REAL
 * ClassroomShell strip keys and, for a teacher, the REAL ClassSettingsPanel
 * with its theme card -- all over in-memory transports shaped as 0225's six
 * RPCs answer. No auth, no Supabase; 404 in production.
 *
 *   ?role=teacher           the class's teacher: counts and no vote keys, and the Settings card
 *   ?voting=closed          the vote is closed
 *   ?votes=none             nobody has voted and no accent: every surface as before themes
 *   ?db=old                 a deployment without 0225: every theme surface absent
 *   ?theme=space-white      the light theme, forced (no session here)
 *   ?theme=matrix           the Matrix theme's tokens, forced
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
