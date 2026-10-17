import { error } from '@sveltejs/kit';
import { version as buildId } from '$app/environment';
import { deploy } from 'virtual:site-versions';
import ledgerHtmlRaw from '$lib/legacy/coins/index.html?raw';
import { rewriteLegacyLinks } from '$lib/legacy';
import { injectVersionBadge } from '$lib/version-badge';
import { injectFeedbackLaunch } from '$lib/server/feedback-launch';
import { injectLedgerTheme } from '$lib/server/coin-public';
import { injectLedgerLogo } from '$lib/server/ledger-logo';
import type { RequestHandler } from './$types';

/**
 * THE IDEA COIN LEDGER, served so that something can be injected into it.
 *
 * WHY IT MOVED. The Ledger was `src/lib/legacy/coins/index.html`, legacy pattern 1
 * (copy unchanged into `static/`, served at the site root). That is the right
 * pattern right up to the moment the page needs anything added to it: a static
 * asset is served by the platform before any SvelteKit code runs, so there is
 * no serve-time hook, and the ONLY way to put a report control on the page
 * would have been to edit the frozen file. CLAUDE.md answers both halves of
 * that -- "Do not modify the internals of carried-over legacy files" and
 * "Serve-time injection is the convention for anything added to legacy HTML" --
 * so the file moved to `src/lib/legacy/coins/`, pattern 2, which is what
 * `/vanguard` and `/assignments/<slug>` already are. **The file itself is
 * BYTE-IDENTICAL to the one that was in `static/`** (md5
 * 68deffdd07685aa14572b763a627a167 before and after the move); the freeze
 * holds and every edit below is to the served STRING.
 *
 * THE URL DID NOT MOVE, AND THAT IS THE CONSTRAINT THIS ROUTE IS SHAPED
 * AROUND. `/coins/index.html` is printed on handouts, sits in `portal-apps.ts`,
 * is where `/coin-balance` and `/contracts` 308 to, and is the `next` the coin
 * sign-in route sends people back to. An authored URL is a permanent contract.
 * A rest parameter answers `/coins`, `/coins/` and `/coins/index.html` from one
 * handler, so no form of the address that worked before stops working.
 *
 * ANYTHING ELSE UNDER `/coins/` IS A 404. There has only ever been one file in
 * that directory -- no per-page assets, no images -- so a path that names
 * something else is naming something that has never existed, and answering the
 * ledger for it would make every typo look like a working URL.
 *
 * IT IS PUBLIC, exactly as it was. The Ledger is the public coin leaderboard
 * and reads its data through `/api/coin/public`, which projects every address
 * away inside the database. This route reads no session for authorization; it
 * reads one only to decide the site theme the page paints (`injectLedgerTheme`).
 *
 * ITS FEEDBACK IS THE SITE'S OWN (ledger 0396, report 80bb4d23: "it should just
 * be the same exact system that's on the rest of the website"). The real
 * `FeedbackTrigger` is server-rendered into the page at the bottom right and
 * opens the real window, `/feedback/embed`, in a frame placed exactly where the
 * home page's box opens; see `$lib/server/feedback-launch.ts`. The injected
 * look-alike panel this route used to carry is deleted, and the session no
 * longer decides anything about feedback here: the window knows who is signed
 * in the way every page of the site does.
 */

/** The one path this route serves, plus the two bare forms of it. */
const LEDGER_PATHS = new Set(['', 'index.html']);

export const GET: RequestHandler = async ({ params, locals: { claims } }) => {
	// A rest parameter is '' for `/coins` and `/coins/`, so both land here
	// without a redirect. Anything deeper never existed.
	if (!LEDGER_PATHS.has(params.path ?? '')) error(404, 'Not found');

	// The site theme, decided by the site's own `themeAttrFor` for `/coins`
	// and this visitor's session (see `ledgerThemeScript`). Signed out, the
	// marker is simply removed and the Ledger paints its default.
	const html = injectVersionBadge(
		injectFeedbackLaunch(injectLedgerLogo(injectLedgerTheme(rewriteLegacyLinks(ledgerHtmlRaw), !!claims)), {
			route: '/coins',
			room: 'ledger',
			deploy,
			buildId,
			tabSelector: '.tab-btn.active'
		}),
		'coins'
	);

	return new Response(html, {
		headers: {
			'content-type': 'text/html; charset=utf-8',
			/* IT USED TO BE A STATIC ASSET AND IS NOW A FUNCTION RESPONSE, so the
			   caching has to be said out loud rather than inherited. The document
			   is a shell -- every figure on the page is fetched from
			   `/api/coin/public` after load -- so a short shared cache costs a
			   reader nothing and keeps this off the function on a class-wide
			   refresh. `private` is wrong here: the bytes do not vary by caller
			   except for the site-theme table `injectLedgerTheme` writes, which
			   only a session may turn on. `Vary: Cookie` is what keeps a
			   signed-in shell from being served to a signed-out reader. */
			'cache-control': 'public, max-age=0, s-maxage=60, must-revalidate',
			vary: 'Cookie'
		}
	});
};
