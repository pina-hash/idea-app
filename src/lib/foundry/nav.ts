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
 *                /foundry/author/<id>  ONE PUBLISHER'S SHELF (report 31), which
 *                                 resolves to the GALLERY tab rather than to a
 *                                 tab of its own. It is a filtered view of
 *                                 published apps -- `foundry_list_apps` with an
 *                                 owner -- reached by following a name on the
 *                                 gallery, so a tab for it would be a permanent
 *                                 door to a page that means nothing until you
 *                                 have picked a person. The active tab staying
 *                                 on Gallery is also what tells a reader where
 *                                 the back door is.
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

export type FoundryPlace =
	| 'gallery'
	| 'requests'
	| 'mine'
	| 'contract'
	| 'submit'
	| 'classes'
	| 'review';

/**
 * LEDGER 0360 ADDS THREE PATHS, AND EACH ONE RESOLVES TO A PLACE THAT ALREADY
 * HAS A DECISION BEHIND IT RATHER THAN TO A NEW ONE WHERE IT CAN.
 *
 *   requests          /foundry/requests   the game request board (report
 *                                         b2ba6d74). A TAB OF ITS OWN, because
 *                                         it is a place a student goes to on
 *                                         purpose, and a NEW place, because
 *                                         nothing else here is like it: it
 *                                         runs no bundle and holds no app.
 *   apply   -> mine   /foundry/apply      the trusted-publisher application
 *                                         (report 6d076258). It is about the
 *                                         student's OWN standing as a
 *                                         publisher, which is what `mine` is
 *                                         for, and resolving it there is what
 *                                         keeps a class closure off it.
 *   publishers -> review  /foundry/review/publishers  the admin half of the
 *                                         same feature, plus the trust roster
 *                                         that used to sit under the queue
 *                                         (report 647d1201). Under the review
 *                                         tab because it is the review lane's.
 */
export function locateFoundry(pathname: string): FoundryPlace | null {
	const p = pathname.replace(/\/+$/, '') || '/';
	if (p === '/foundry') return 'gallery';
	if (p.startsWith('/foundry/author/')) return 'gallery';
	if (p === '/foundry/requests') return 'requests';
	if (p === '/foundry/mine' || p === '/foundry/apply') return 'mine';
	if (p === '/foundry/contract') return 'contract';
	if (p === '/foundry/submit' || p === '/foundry/starter') return 'submit';
	if (p === '/foundry/classes') return 'classes';
	if (p === '/foundry/review' || p.startsWith('/foundry/review/')) return 'review';
	return null;
}

/**
 * THE TWO PAGES THAT ARE FULL-HEIGHT APPLICATIONS, AND NO OTHERS.
 *
 * The layout puts `.cr-app` (a 100dvh column that does not scroll itself) on
 * the room for a page whose body is a `scroll="fill"` split: the gallery, and
 * the review queue. It used to read that off `locateFoundry`, as
 * `active === 'gallery' || active === 'review'` -- and `locateFoundry` maps a
 * PUBLISHER'S PAGE (`/foundry/author/<id>`) to `gallery` so the right tab is
 * lit. So the author page, which is an ordinary document with a long list of
 * cards and no split at all, was ALSO put in a 100dvh box with `overflow:
 * hidden`, and at desktop widths its lower cards were clipped with no way to
 * scroll to them. Found while grounding report 647d1201.
 *
 * WHICH TAB IS LIT AND WHETHER THE PAGE IS AN APPLICATION ARE TWO QUESTIONS,
 * so they are two functions. This one is an EXACT path match on purpose: a
 * page added under either prefix later (`/foundry/review/publishers` is the
 * first) is an ordinary document until somebody decides otherwise, which is
 * the safe default -- the worst a wrongly-unmarked page does is scroll the
 * document, and the worst a wrongly-marked one does is clip its own content.
 */
export function foundryIsApplication(pathname: string): boolean {
	const p = pathname.replace(/\/+$/, '') || '/';
	return p === '/foundry' || p === '/foundry/review';
}
