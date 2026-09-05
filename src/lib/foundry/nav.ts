/**
 * WHERE A FOUNDRY URL IS, for the persistent shell's active tab.
 *
 * Pure data, no Svelte and no router, the `$lib/classroom/nav` shape: the
 * layout reads the pathname and hands the answer to the shell, so the shell
 * can be mounted in a harness with no router at all.
 *
 * THE INFORMATION ARCHITECTURE, stated once:
 *
 *   gallery    /foundry           the front door: everything published
 *   mine       /foundry/mine      the student's own shelf
 *   contract   /foundry/contract  the build contract, a TOP-LEVEL place
 *   submit     /foundry/submit    the publish flow
 *                /foundry/starter   a DOWNLOAD inside the publish flow
 *   classes    /foundry/classes   a SECTION MANAGER's own control: close the
 *                                 Foundry for a class and open it again
 *                                 (0173). The tab renders only for somebody
 *                                 who manages a section; the RPC's own
 *                                 `classroom_manages_section` is the boundary
 *   review     /foundry/review    admin only; the tab renders only for admins
 *                                 and the route 404s everyone else regardless
 *
 * THE CONTRACT USED TO NEST UNDER `submit` AND THAT WAS THE BUG: with nothing
 * published, the gallery's empty state links to it, but once one app exists
 * that link is gone and the only route in was `submit`'s own resolution --
 * which is not a link anywhere, so a student who has already published once
 * has no way back to the document without typing the URL. It is the one
 * thing every student needs BEFORE they build anything, published or not, so
 * it gets its own permanent tab and its own resolved place. The starter stays
 * nested: it exists to be downloaded while publishing and nowhere else. THE
 * URLS THEMSELVES ARE PERMANENT (printed handouts and pasted links keep
 * resolving); only the map changed.
 */

export type FoundryPlace = 'gallery' | 'mine' | 'contract' | 'submit' | 'classes' | 'review';

export function locateFoundry(pathname: string): FoundryPlace | null {
	const p = pathname.replace(/\/+$/, '') || '/';
	if (p === '/foundry') return 'gallery';
	if (p === '/foundry/mine') return 'mine';
	if (p === '/foundry/contract') return 'contract';
	if (p === '/foundry/submit' || p === '/foundry/starter') return 'submit';
	if (p === '/foundry/classes') return 'classes';
	if (p === '/foundry/review') return 'review';
	return null;
}
