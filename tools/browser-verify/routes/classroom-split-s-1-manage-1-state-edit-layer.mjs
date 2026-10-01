/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * A CLASS-LIST ROW'S EDIT LAYER IS ON TOP OF EVERYTHING IT COVERS (report R06
 * on the class page, ledger 0360; the item page's own edit is
 * `classroom-split-s-1-item-i-draft-manage-1-state-edit-layer`), on the REAL
 * class page inside the REAL classroom shell, as its teacher, nothing open
 * beside the list.
 *
 * The defect: `src/app.css` makes every `main` a z-index 1 stacking context,
 * and ClassView renders a row's full-viewport editor (`ContentComposer
 * screen`, z-index 60) inside its own `main`, so the classroom masthead
 * painted over the layer's title row and its Close. Measured before the fix,
 * by these same hit tests, at 375 and at 1440: Close and the title covered by
 * the masthead, the form's middle the layer. With nothing open beside the
 * list ClassSplit draws no separator, so there is none to test here.
 *
 * `aliasOf` because this is a STATE of the manage-1 route, not a route.
 */
import { CLOSE_AND_READ_BACK, LAYER_HITS } from './_edit-layer.mjs';

const EDITOR_OPEN = `() => !!document.querySelector('.composer-screen')`;
const MENU_OPEN = `() => !!document.querySelector('[data-testid="row-menu-open"] button[role="menuitem"]')`;

export default {
	path: '/dev/classroom-split/s-1?manage=1&state=edit-layer',
	aliasOf: '/dev/classroom-split/s-1?manage=1',
	label: 'R06: a class-list row edit layer is above the masthead (hit tests)',
	prepare: [
		{ waitFor: `() => !!document.querySelector('[data-testid="item-row"] [data-testid="row-menu"]')`, timeoutMs: 20000 },
		/* Forty attempts: the first width a run loads is the cold one, and the
		   server-rendered menu key sits unhydrated for a while (the item page's
		   twin measured it). */
		{ click: '[data-testid="item-row"] [data-testid="row-menu"]', until: MENU_OPEN, attempts: 40, gapMs: 500 },
		{ click: '[data-testid="row-menu-open"] button[role="menuitem"]', until: EDITOR_OPEN, attempts: 20, gapMs: 300 }
	],
	presence: [
		{ selector: '.composer-screen', label: 'the edit layer, open', expectPresent: 1, maxPresent: 1, expectVisible: 1, maxVisible: 1 },
		{ selector: 'main.classroom-page.edit-layer-open', label: 'the class page has dropped its stacking context while editing', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{ label: "the layer's Close, its title and its form are all hit as the layer", evaluate: LAYER_HITS, expected: ['close reachable', 'title reachable', 'form on top'] },
		{ label: 'the class page keeps its stacking context once the editor closes', evaluate: CLOSE_AND_READ_BACK, expected: ['layer closed', 'page class cleared'] }
	],
	/* The row's own attachment has no bytes behind the real proxy in a /dev
	   harness, so the editor's thumbnail of it 401s; nothing else may. */
	ignoreConsole: ['Failed to load resource: net::ERR_FAILED', '\\[401 http://127\\.0\\.0\\.1:\\d+/api/classroom/attachment/'],
	tapTargets: [{ selector: '[data-testid="composer-screen-close"]', label: 'Close (layer header)', min: 44 }],
	contrast: [{ selector: '.composer-screen-title', label: 'the layer heading', min: 4.5 }]
};
