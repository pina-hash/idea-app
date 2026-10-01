import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for THE CLASS HEADER AND ITS QUICK POSTS (ledger 0360,
 * reports R19, R21 and R22). It mounts the REAL ClassHeader (inside the REAL
 * ClassThemeBanner), with the REAL HallPass, SongQueue and LiveDoor in the
 * section layout's tools row, the REAL ClassThemePanel folded into the key row,
 * the REAL QuickPosts and QuickPostComposer under it, and the REAL ClassTeams
 * after them -- the order the class page mounts them in -- over in-memory
 * transports shaped as 0230's three RPCs answer. No auth, no Supabase; 404 in
 * production.
 *
 *   ?role=teacher        the class's teacher: Quick post, the teams key, Take down
 *   ?theme=space-white   the light theme, forced (no session here); also matrix
 *   ?pane=1              an item is open beside the list (the header is an h2)
 *   ?banner=none         nobody has voted: no banner, the header as it is
 *   ?pattern=stripes     the voted pattern (stripes, rings, rays, ripples, plain)
 *   ?posts=0|1|4         how many notices are up
 *   ?expiring=1          one notice ends four seconds after the page loads
 *   ?compose=1           the composer is open on load
 *   ?teams=0             nothing posted on the teams board
 *   ?poll=2000           the notices' refresh floor, for a spec that watches one arrive
 *   ?panel=open          read by nothing here: the spec that opens the theme vote from the row
 *   ?view=class          the REAL ClassView under the header (the section layout's snippets)
 *   ?layout=hidden       (view=class) a stored arrangement: hidden (tools, theme vote, teams),
 *                        search-first, posts-first or find-hidden; Arrange opens the REAL settings
 *   ?opens=todo          (view=class, a student) the class opens on To do
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
