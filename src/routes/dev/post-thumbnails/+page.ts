import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/**
 * Dev-only harness for post thumbnails (ledger 0396, report a6a037f3): the
 * REAL ClassView over a class whose posts carry every kind of thumbnail, and
 * the REAL ContentComposer with the thumbnail editor on it. No auth, no
 * Supabase; 404 in production.
 *
 *   ?shape=off|tile|wide|banner   the class's default shape (no value: the
 *                                 built-in Tile)
 *   ?theme=matrix|space-white     force the theme attribute (no session here)
 *   ?manage=1                     the class's teacher (the draft shows)
 *   ?pane=1                       the class list as the column beside an item
 *   ?count=30                     thirty live HTML thumbnails, for frame timing
 *   ?count=30&live=0              the same thirty posts with nothing set (the
 *                                 generated look), the timing baseline
 *   ?count=30&quiet=1             the thirty live thumbnails with no harness
 *                                 reports (what a real thumbnail sends back)
 *   ?view=editor                  the composer: a new post, and an HTML
 *                                 assignment being edited, each with the
 *                                 thumbnail editor over in-memory writes
 *   ?view=settings                the class's Settings tab, with the class
 *                                 default card over an in-memory writer
 *   ?view=bridge                  the class page (any other view is), named
 *                                 for the spec that drives Display settings,
 *                                 a resize and a theme change through it
 *   ?view=editor&editdoc=notemplate         the edited assignment stores a
 *                                 document whose manifest names a template it
 *                                 does not carry (no live thumbnail recorded)
 *   ?view=editor&editdoc=notemplate-manual  the same under a hand-set look
 *   ?view=editor&editdoc=draft|scheduled    the gear assignment unpublished,
 *                                 or published for later: no live preview
 *   ?view=editor&editdoc=refused            a live post whose document the
 *                                 route does not serve: the preview fails
 *   ?mine=wide                    a person who already chose a shape in
 *                                 Display settings (the panel is on the page)
 *
 * Every live thumbnail is the real `/hx/<id>/thumbnail` route serving the dev
 * fixtures in `src/routes/hx/_documents.ts`, and each reports what it was told
 * to `window.__thumbReports` (a `harness:` message the class page ignores),
 * which is how the browser pass reads a frame it cannot reach into.
 */
export const load: PageLoad = () => {
	if (!dev) error(404, 'Not found');
	return {};
};
