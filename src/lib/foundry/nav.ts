/**
 * WHERE A FOUNDRY URL IS, for the persistent shell's active tab.
 *
 * Pure data, no Svelte and no router, the `$lib/classroom/nav` shape: the
 * layout reads the pathname and hands the answer to the shell, so the shell
 * can be mounted in a harness with no router at all.
 *
 * THE INFORMATION ARCHITECTURE, stated once:
 *
 *   gallery   /foundry           the front door: everything published
 *   mine      /foundry/mine      the student's own shelf
 *   submit    /foundry/submit    the publish flow
 *               /foundry/contract  a REFERENCE inside the publish flow
 *               /foundry/starter   a DOWNLOAD inside the publish flow
 *   review    /foundry/review    admin only; the tab renders only for admins
 *                                and the route 404s everyone else regardless
 *
 * The contract and the starter are not top-level places: they exist to be
 * read or saved while publishing, so both resolve to the `submit` tab and the
 * contract page carries its own way back. THE URLS THEMSELVES ARE PERMANENT
 * (printed handouts and pasted links keep resolving); only the map changed.
 */

export type FoundryPlace = 'gallery' | 'mine' | 'submit' | 'review';

export function locateFoundry(pathname: string): FoundryPlace | null {
	const p = pathname.replace(/\/+$/, '') || '/';
	if (p === '/foundry') return 'gallery';
	if (p === '/foundry/mine') return 'mine';
	if (p === '/foundry/submit' || p === '/foundry/contract' || p === '/foundry/starter')
		return 'submit';
	if (p === '/foundry/review') return 'review';
	return null;
}
