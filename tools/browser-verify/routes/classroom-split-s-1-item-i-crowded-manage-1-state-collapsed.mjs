/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * PROMPT 0098, ITEM H: "Hide other items" HIDES THE LIST AND NOT THE ITEM.
 *
 * Measured before the fix at 1024, 1440 and 1920: pressing the control set
 * the split's tracks to `0px <rest>` and, with the nav out of the grid flow,
 * the detail pane auto-placed into the empty first track and painted 0px
 * wide -- the item vanished with the list. This spec presses the control and
 * reads both panes afterwards.
 *
 * THE CONTROL EXISTS ONLY ABOVE 1024px (ClassroomShell renders it and
 * classroom.css hides it below, where the split already shows the item alone
 * and full width). The harness has no per-width gating, so the probe presses
 * the control when it is visible and does nothing when it is not, and every
 * claim is stated in terms that hold in BOTH states: no list pane painted,
 * and the item pane spanning the split. At 375 that is the split's own `swap`
 * behaviour; at 1440 it is the press. The control's own presence and 44px
 * box are the base spec's claims (classroom-split-s-1-item-i-crowded-manage-1).
 *
 * `aliasOf` because this is a STATE of the manage-1 item route, not a route.
 */
export default {
	path: '/dev/classroom-split/s-1/item/i-crowded?manage=1&state=collapsed',
	aliasOf: '/dev/classroom-split/s-1/item/i-crowded?manage=1',
	label: '0098: Hide other items hides the list pane and keeps the item at full width',
	/* The same fixture attachment the base spec tolerates: its thumbnail goes
	   through a route that needs a session this placeholder-.env dev server
	   cannot provide, so it 401s. Fixture-only, documented, ignored. */
	ignoreConsole: ['Failed to load resource: the server responded with a status of 401'],
	orderResult: [
		{
			label: 'after the press: no list pane painted, and the item pane spans the split with its heading visible',
			/* THE PRESS IS INSIDE THE MEASUREMENT, on purpose: a `prepare` step
			   whose `until` already holds at rest (the control hidden by width)
			   is a finding, and a `click` on a hidden control cannot fire. So the
			   probe presses when the control is visible, waits for the grid to
			   settle, and reads facts that hold in both states. */
			evaluate: `async () => {
				const t = document.querySelector('[data-testid="nav-collapse-toggle"]');
				if (t && t.getBoundingClientRect().width > 0 && t.getAttribute('aria-pressed') !== 'true') {
					for (let i = 0; i < 12 && t.getAttribute('aria-pressed') !== 'true'; i++) {
						t.click();
						await new Promise((r) => setTimeout(r, 250));
					}
				}
				await new Promise((r) => setTimeout(r, 300));
				const split = document.querySelector('.cr-split');
				const nav = document.querySelector('.cr-split > .cr-nav');
				const detail = document.querySelector('.cr-split > .cr-detail');
				const h1 = detail && detail.querySelector('h1');
				const w = (el) => (el ? el.getBoundingClientRect().width : 0);
				const navPainted = nav ? getComputedStyle(nav).display !== 'none' && w(nav) > 0 : false;
				return [
					navPainted ? 'list painted' : 'list hidden',
					w(detail) >= 0.9 * w(split) ? 'item spans the split' : 'item ' + Math.round(w(detail)) + 'px of ' + Math.round(w(split)),
					w(h1) > 200 ? 'heading visible' : 'heading ' + Math.round(w(h1)) + 'px'
				];
			}`,
			expected: ['list hidden', 'item spans the split', 'heading visible']
		}
	]
};
