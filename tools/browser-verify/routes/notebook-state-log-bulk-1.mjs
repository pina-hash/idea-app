import { IGNORE_PHOTO_PROXY, WAIT_AUTOPICK, WAIT_EDITOR } from './_notebook-log.mjs';

/**
 * THE LOG'S HEAD STAYS WHERE IT CAN BE USED ONCE A LONG LOG IS SCROLLED (ledger
 * 0298, R32). Above 1024px the log is one scrolling pane with the composer at
 * its top, so the composer scrolls away and the list head -- the search and
 * the list controls -- sticks at the top of the pane. Below 1024px nothing is
 * a pane scroller: the page scrolls and the head sits in the flow under the
 * composer, with nothing offsetting it.
 *
 * `?bulk=1` puts 40 more entries behind the fixture, so the log is long enough
 * for the head to reach the top at all (nine entries in three columns are
 * not). A HIT TEST at the search box's own centre is what tells a head that is
 * on screen from one something paints over; a presence check is green on both.
 * The `scroll-padding` the sticky head needs is read back and compared with
 * the head's MEASURED height, because a constant there is the defect the
 * CLAUDE.md sticky-header rule is about.
 */
export default {
	path: '/dev/notebook?state=log&bulk=1',
	label: "Notebook log, a long one scrolled: the list head stays at the top above 1024px and flows below it",
	prepare: [WAIT_AUTOPICK, WAIT_EDITOR],
	orderResult: [
		{
			label: 'the list head is where this width puts it once the log is scrolled (stuck at the top above 1024px; in the flow of the page below it)',
			evaluate: `async () => {
				window.scrollTo({ top: 0, behavior: 'instant' });
				const pane = document.querySelector('.nb-pane-card');
				const head = pane.querySelector(':scope > .list-head');
				const search = head.querySelector('.search input');
				const wide = window.innerWidth >= 1024;
				const padding = () => parseFloat(getComputedStyle(pane).scrollPaddingTop) || 0;
				if (wide) {
					/* 'instant': app.css makes every programmatic scroll smooth, and a
					   read taken mid-animation is a head that has not reached the top. */
					pane.scrollTo({ top: pane.scrollHeight, behavior: 'instant' });
					await new Promise((r) => setTimeout(r, 200));
					const p = pane.getBoundingClientRect();
					const h = head.getBoundingClientRect();
					const s = search.getBoundingClientRect();
					const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
					const scrolled = pane.scrollTop > 0;
					const stuck = Math.abs(h.top - p.top) < 1;
					const answers = !!hit && (hit === search || search.contains(hit) || hit.contains(search));
					const pad = padding();
					pane.scrollTo({ top: 0, behavior: 'instant' });
					return [
						scrolled ? 'the log scrolls the way this width scrolls' : 'THE PANE DID NOT SCROLL',
						stuck && answers ? 'the list head is where this width puts it, its search answering' : 'HEAD ' + h.top + ' PANE ' + p.top + ' hit=' + (hit && hit.className),
						Math.abs(pad - h.height) < 1 ? 'no offset is a written-down constant' : 'PADDING ' + pad + ' HEAD ' + h.height
					];
				}
				/* A phone: the page scrolls, the pane is no scroller, and the head sits
				   in the flow under the composer with nothing offsetting it. */
				const c = document.querySelector('[data-testid="nb-compose"]').getBoundingClientRect();
				const h = head.getBoundingClientRect();
				const s = search.getBoundingClientRect();
				const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
				const answers = !!hit && (hit === search || search.contains(hit) || hit.contains(search));
				return [
					pane.scrollHeight <= pane.clientHeight + 1 ? 'the log scrolls the way this width scrolls' : 'A PANE SCROLLER ON A PHONE',
					h.top >= c.bottom - 0.5 && (answers || s.top > window.innerHeight) ? 'the list head is where this width puts it, its search answering' : 'HEAD ' + h.top + ' COMPOSER BOTTOM ' + c.bottom,
					padding() === 0 ? 'no offset is a written-down constant' : 'PADDING ' + padding() + ' ON A PHONE'
				];
			}`,
			expected: [
				'the log scrolls the way this width scrolls',
				'the list head is where this width puts it, its search answering',
				'no offset is a written-down constant'
			]
		}
	],
	ignoreConsole: IGNORE_PHOTO_PROXY
};
