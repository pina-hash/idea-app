import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for the two things the Live package puts on the CLASS PAGE
 * (ledger 0297): the Live door in the class-tools row (a teacher's only) and
 * the posted teams (everyone's). Mounts the REAL LiveDoor, the REAL HallPass
 * tool beside it and the REAL ClassTeams, in the `.cr-root` room and a
 * `.class-tools` row styled as the section layout styles it. No auth, no
 * Supabase; 404 in production.
 *
 *   ?role=student   the class page as a student reads it: no door, their team
 *   ?teams=none     nothing posted: no teams region at all
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
