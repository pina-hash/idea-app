// original array position 10 of 25 -- see ../README.md for what `order` means
export const order = 10;

/**
 * THE BOTTOM OF THE PAGE IS REACHABLE, as three numbers rather than a look.
 *
 * Filed by a student on 2026-09-15 against build 8b115a7, from an IDEA209H
 * item page at 2133x1058: "screen cuts off at bottom sometimes". Nothing in
 * this spec could have caught it -- presence, contrast and tap targets are
 * all green over a clipped layout, and a screenshot is no help either,
 * because this Chromium paints no scrollbar into one at any colour.
 *
 * THE RULE IS THE WIDTH'S, WHICH IS WHY THIS IS A COMPUTED VERDICT AND NOT A
 * RAW NUMBER. Above 1024px the room IS the viewport: the panes are the scroll
 * regions and the document must not move. Below it the document is the scroll
 * region and its overflow is the design. One expectation cannot be written as
 * a measurement that means opposite things at the two widths, so the probe
 * applies the right rule per width and returns the SAME token when it holds;
 * when it does not, the token names what it measured, so a red row is
 * diagnosable from the report alone.
 *
 * THE SCROLL CARRIES ITS OWN POSITIVE CONTROL. `src/app.css` sets a global
 * `scroll-behavior: smooth`, so a plain `scrollTo(0, y)` ANIMATES and the
 * rect read on the next line is the position before the scroll -- measured
 * here: the footer read 849px below the fold at 375px on a page where it is
 * perfectly reachable. Both scrolls are `behavior: 'instant'`, and the probe
 * refuses to call anything reachable unless it can also say it actually
 * arrived at the end (`scrollTop` within 1px of the maximum).
 */
const BOTTOM_REACHABLE = `() => {
	const round = (n) => Math.round(n * 10) / 10;
	const wide = window.matchMedia('(min-width: 1024px)').matches;
	const detail = document.querySelector('[data-testid="class-detail-pane"]');
	const footer = detail && detail.querySelector('.page-footer');
	if (!detail || !footer) return ['fixture:missing-' + (detail ? 'footer' : 'detail-pane')];

	/* 1. The room does not push the document past the viewport. */
	const overflow = round(document.documentElement.scrollHeight - window.innerHeight);
	const bounded = wide
		? (overflow <= 1 ? 'room-bounded:yes' : 'room-bounded:no-overflows-' + overflow + 'px')
		: 'room-bounded:yes';

	/* 2. THE SCROLL IS ARRANGED THE WAY THIS WIDTH WANTS IT. Above the
	   breakpoint the pane is the scroll region and gets the REST OF THE
	   COLUMN -- its bottom edge lands ON the viewport bottom, neither past it
	   (the clip) nor short of it (viewport spent on nothing). That is the
	   assertion a constant cannot satisfy: the same 168px read -10.1px short
	   on an item, 16.3px past on an item whose breadcrumb trail wrapped, and
	   33.3px past on a class page. Below the breakpoint the opposite is
	   correct -- the pane must NOT bound itself, because the document is the
	   one scroll region there. */
	const gap = round(detail.getBoundingClientRect().bottom - window.innerHeight);
	const paneBounds = getComputedStyle(detail).maxHeight !== 'none';
	const fills = wide
		? (Math.abs(gap) <= 1
			? 'scroll-arrangement:ok'
			: 'scroll-arrangement:pane-' + (gap > 0 ? 'past-fold-by-' : 'short-by-') + Math.abs(gap) + 'px')
		: (paneBounds ? 'scroll-arrangement:pane-bounded-itself-on-a-phone' : 'scroll-arrangement:ok');

	/* 3. Scrolling to the end reaches the item's last child. */
	detail.scrollTo({ top: detail.scrollHeight, behavior: 'instant' });
	window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' });
	const paneMax = round(detail.scrollHeight - detail.clientHeight);
	const winMax = round(document.documentElement.scrollHeight - window.innerHeight);
	const arrived = Math.abs(round(detail.scrollTop) - paneMax) <= 1 && Math.abs(round(window.scrollY) - winMax) <= 1;
	const below = round(Math.max(0, footer.getBoundingClientRect().bottom - window.innerHeight));
	const reach = !arrived
		? 'footer-reachable:cannot-say-scroll-did-not-reach-end'
		: below <= 1
			? 'footer-reachable:yes'
			: 'footer-reachable:no-' + below + 'px-below-fold';

	return [bounded, fills, reach];
}`;

export default {
	path: '/dev/classroom-split/s-1/item/i-crowded?manage=1',
	label: 'Item detail, second notebook check-in attach door (teacher, one already attached)',
	/* THE SECOND DOOR never ran in a browser before this either: the attach
	   control used to be the {:else} of `{#if checkIns.length}`, so an item
	   that already carried a check-in had no way to add a second one. It is
	   now mounted beside the list unconditionally once `canManageCheckIn`
	   holds. i-crowded carries one check-in (classroom-split/fixture.ts,
	   CHECK_INS) and this route now wires `checkInTransports` (previously
	   omitted here entirely, which is the whole reason this state was
	   unreachable from any dev route this session may touch). The
	   inspector strip is collapsed by default (`itemInspector.open` starts
	   false), so it has to be opened first. */
	prepare: [
		{
			click: '[data-testid="inspector-toggle"]',
			until: '() => !!document.querySelector("#item-inspector-body")'
		}
	],
	presence: [
		{ selector: '[data-testid="insp-check-in"]', label: 'check-in already attached', expectPresent: 1 },
		{ selector: '[data-testid="detach-check-in"]', label: 'detach control on the attached check-in', expectPresent: 1 },
		{ selector: '[data-testid="check-in-open"]', label: 'second attach door (Add a check-in)', expectPresent: 1 }
	],
	contrast: [
		{ selector: '[data-testid="insp-check-in"] strong', label: 'attached check-in label', min: 4.5 }
	],
	/* Same chip-sized control as the composer route above -- neither
	   `.cr-console` nor `.engine-host`, so the 24px floor applies rather
	   than the 44px one (classroom.css:195). */
	tapTargets: [
		{ selector: '[data-testid="check-in-open"]', label: 'second attach door control', min: 24 },
		{ selector: '[data-testid="detach-check-in"]', label: 'detach control', min: 24 }
	],
	/* THE ONE MOUNT WHERE THE ATTACHMENT ROWS ARE PACKED, and the only one
	   where the defect showed. `.attach-name` carries `.tap-reach-44` with a
	   height-only reach, and on this fixture the two rows sat 41.3px apart
	   centre to centre -- so the second row's reach, which paints later, took
	   the bottom of the first row's and the first filename walked 88 x 41.5 at
	   both widths. `/dev/classroom-images` mounts the same component with the
	   rows further apart and measured a clean 45 throughout, which is why a row
	   there could never have caught this: the spacing is the variable and this
	   is the fixture that has it. Fixed 2026-09-05 by giving `.attach-meta` a
	   44px floor, so every row owns its own band and two reaches cannot overlap
	   whatever the content; measured after, 88 x 45 on both rows at both
	   widths, list height 74.5 -> 96. */
	tapReach: [
		{ selector: 'a.attach-name', label: 'attachment filename links (packed rows)', min: 44 }
	],
	orderResult: [
		{
			evaluate: BOTTOM_REACHABLE,
			expected: ['room-bounded:yes', 'scroll-arrangement:ok', 'footer-reachable:yes'],
			label: 'item pane owns the scroll, fills the column, and its footer is reachable'
		}
	],
	/* THE CROWDED FIXTURE'S OWN IMAGE ATTACHMENT (span-photo.jpg), not this
	   bundle's doing: `AttachmentList` always renders through
	   `attachmentSrc()` -> `/api/classroom/attachment/<id>`, a real server
	   route that needs a session this placeholder-.env dev server cannot
	   provide, so it 401s. Every route in this file with fixture-only
	   errors gets its own documented ignore, same as the harness's own
	   external-block pattern above. */
	ignoreConsole: ['Failed to load resource: the server responded with a status of 401']
};
