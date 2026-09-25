import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for POSTED TEAMS ON THE CLASS PAGE (ledger 0298, R23). It
 * mounts the class page's list pane the way src/routes/classroom/[sectionId]/
 * +layout.svelte does -- the REAL ClassSplit, the tools row with the REAL
 * HallPass, the REAL ClassTeams with the same three props, the REAL ClassView
 * under it -- over a board shaped exactly as `classroom_team_board` answers
 * the viewer, projected by the REAL `postedTeamSets`. No auth, no Supabase;
 * 404 in production.
 *
 *   ?role=teacher     the class's teacher: the "Teams posted until" strip, no own card
 *   ?window=closed    the draw was posted, and its window has already ended
 *   ?window=forever   posted with no end ("until I take it down")
 *   ?mine=0           the student is on no team in the draw (joined after it)
 *   ?sets=2           two draws posted at once
 *   ?teams=none       nothing saved at all
 *   ?later=posted     the page loaded before the draw was posted: it arrives only through refresh
 *   ?theme=space-white  the class page's light theme, forced (no session here)
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
