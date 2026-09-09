/**
 * THE PROJECTOR'S ROSTER, PAGED, AND A BODY THAT SCROLLS (prompt 0110, item 1).
 *
 * The first report off the TV route was that a student could not scroll to
 * see all the teams. Two defects behind one sentence: the register view
 * showed six entries and a "+N more", so sixteen of twenty-two were never
 * on the wall at all; and `.tv-body` inherited the fixed shell's
 * `overflow: hidden`, so at a phone's height whatever did not fit the frame
 * could not be reached by wheel, keyboard or touch. MEASURED before the
 * change at 375x667: the body's scrollHeight exceeded its clientHeight and
 * nothing below the fold could be reached.
 *
 * Now the roster shows EVERY entry, eight to a page (`rosterWindow`, 22
 * entries = three pages of 8 / 8 / 6), turning on its own timer and on
 * ArrowRight / ArrowLeft, and the body scrolls INSIDE the frame so the head
 * and the foot -- and the exit control in the foot -- stay pinned.
 *
 * THE TIMER IS THE ONE THING TO KNOW READING THIS SPEC. `ROSTER_PAGE_MS` is
 * 7000ms from mount, and pages 1 and 2 hold eight banners where page 3
 * holds six. The presence row asserting eight is read within the first
 * page turn (load + a 900ms settle + two prepare steps is well under 7s in
 * this container, measured); the second probe below is TICK-INDEPENDENT --
 * it reads the indicator and checks the banner count against the window
 * the indicator claims -- so a slow run reddens on nothing but the honest
 * row. `--width 1920` is the projector figure; 375 is the phone the report
 * came from.
 */
export default {
	path: '/dev/tournaments?view=tv&status=registration_open&field=22',
	label: 'Projector stage, registration open: a 22-entry roster paged eight at a time in a body that scrolls',
	settleMs: 900,
	prepare: [
		{
			/* THE NUMBERS, PRINTED. An `evaluate` step's string return lands in
			   the report beside the step, so the geometry the probes below
			   assert on is readable at every width the run is driven at. */
			evaluate: () => {
				const body = document.querySelector('.tv .tv-body');
				if (!body) return 'tv-body MISSING';
				const cs = getComputedStyle(body);
				const roster = document.querySelectorAll('[data-testid="tv-roster"] .entry-banner').length;
				const ind = (document.querySelector('[data-testid="tv-roster-page"]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
				return `window ${window.innerWidth}x${window.innerHeight}; tv-body clientHeight ${body.clientHeight}px, scrollHeight ${body.scrollHeight}px (content past the frame ${Math.max(0, body.scrollHeight - body.clientHeight)}px), overflow-y ${cs.overflowY}, overscroll-behavior ${cs.overscrollBehaviorY || cs.overscrollBehavior}; roster ${roster} banner(s); indicator "${ind}"`;
			},
			label: 'body geometry and the roster page (printed)'
		},
		{
			/* THE KEYBOARD TURNS THE PAGE. A real keydown on the document, the
			   way a presenter's arrow key arrives (the handler is on
			   `svelte:window`; the body is not a text-entry target). The
			   step's own `until` waits for the indicator to say page 2, so a
			   page that ignored the key reddens here. The step awaits a
			   flush before returning so the retry does not stack a second
			   press on a first that already landed. */
			evaluate: async () => {
				document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
				await new Promise((r) => setTimeout(r, 120));
				return (document.querySelector('[data-testid="tv-roster-page"]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
			},
			until: () => /page 2 of 3/.test(document.querySelector('[data-testid="tv-roster-page"]')?.textContent ?? ''),
			label: 'ArrowRight turns to page 2 of 3 (until the indicator says so)'
		},
		{
			evaluate: async () => {
				document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }));
				await new Promise((r) => setTimeout(r, 120));
				return (document.querySelector('[data-testid="tv-roster-page"]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
			},
			until: () => /page 1 of 3/.test(document.querySelector('[data-testid="tv-roster-page"]')?.textContent ?? ''),
			label: 'ArrowLeft turns back to page 1 of 3'
		}
	],
	presence: [
		{ selector: '[data-testid="tv-roster"] .entry-banner', label: 'banners on the roster page (eight of twenty-two)', expectPresent: 8, maxPresent: 8, expectVisible: 8 },
		{ selector: '[data-testid="tv-roster-page"]', label: 'the page indicator', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.tv .split-side canvas, .tv .split-side svg, .tv .split-side img', label: 'the QR panel', expectPresent: 1 },
		/* NOT IN FULLSCREEN, SO NO EXIT CONTROL: the control exists only
		   where there is a fullscreen to exit (the field-4 tv spec drives
		   that state). The roster and the QR above are the positive controls
		   for the three absences. */
		{ selector: '.tv .tv-exit', label: 'no exit control while not in fullscreen', expectPresent: 0 },
		{ selector: '.tv a, .tv button, .tv input', label: 'controls on the projector (none, by design)', expectPresent: 0 },
		{ selector: '.tv .tnm-live', label: 'no LIVE indicator during registration', expectPresent: 0 }
	],
	textContains: [
		/* The page count and the total are the tick-proof phrases; the page
		   NUMBER turns every seven seconds and is asserted by the probe. */
		/* THE RANGE IS SPELLED WITH THE WORD "to" (`Showing 1 to 8 of 22 · page 1
		   of 3`): no en-dash range in user-facing copy, and the middot stays.
		   `mustNot` is what catches the dash coming back. */
		{ selector: '[data-testid="tv-roster-page"]', label: 'the indicator names the window (with the word "to"), the total and the page count', must: ['Showing', ' to ', 'of 22', '· page', 'of 3'], mustNot: ['–', '—'] },
		{ selector: '.tv .sub-line', label: 'the entry count', must: ['22 entries so far'] },
		{ selector: '.tv .big-line', label: 'the state', must: ['Registration is open'] }
	],
	orderResult: [
		{
			/* THE REACHABILITY PROBE. Not "is overflow-y auto" alone -- a
			   scroll container whose content still cannot be reached is the
			   defect wearing the right computed style -- but an actual scroll
			   to the bottom and a read of where the LAST banner then sits
			   against the frame. Width-independent by construction: at a
			   height where everything fits, nothing scrolls and the last
			   banner is inside the frame already; at 375x900 the content is
			   taller and the scroll has to land. The printed prepare step
			   says which case a run was. The document itself must not have
			   grown either way: `.tv` is a fixed shell, and a body that
			   scrolled the PAGE instead would drag the exit control off
			   screen. scrollTop is put back so nothing later measures a
			   scrolled stage. */
			evaluate: () => {
				const body = document.querySelector('.tv .tv-body');
				if (!body) return ['body:MISSING'];
				const cs = getComputedStyle(body);
				const banners = document.querySelectorAll('[data-testid="tv-roster"] .entry-banner');
				const last = banners[banners.length - 1];
				const taller = body.scrollHeight > body.clientHeight + 1;
				body.scrollTop = 1e6;
				const scrolled = body.scrollTop;
				const frame = body.getBoundingClientRect();
				const lb = last ? last.getBoundingClientRect() : null;
				const lastIn = !!lb && lb.bottom <= frame.bottom + 1 && lb.top >= frame.top - 1;
				body.scrollTop = 0;
				const de = document.documentElement;
				const docX = de.scrollWidth - de.clientWidth;
				const docY = de.scrollHeight - de.clientHeight;
				return [
					'body:present',
					'overflow-y:' + cs.overflowY,
					'overscroll:' + (cs.overscrollBehaviorY || cs.overscrollBehavior),
					!taller || scrolled > 0 ? 'content:reachable' : 'content:STUCK-BEHIND-THE-FRAME',
					lastIn ? 'last-banner:inside-the-frame-after-scroll' : 'last-banner:CLIPPED',
					docX === 0 && docY === 0 ? 'document-overflow:0' : 'document-overflow:' + docX + 'x' + docY
				];
			},
			expected: [
				'body:present',
				'overflow-y:auto',
				'overscroll:contain',
				'content:reachable',
				'last-banner:inside-the-frame-after-scroll',
				'document-overflow:0'
			],
			label: 'the body scrolls inside the fixed shell and the last banner is reachable; the document does not grow'
		},
		{
			/* TICK-INDEPENDENT ROSTER ARITHMETIC. The indicator says which
			   window is on screen; the banner count must match it whatever
			   page the timer is on, and the page size falls out of the two
			   numbers (page 3 of 3 holds the remainder, so it is derived from
			   the total rather than read). */
			evaluate: () => {
				const ind = (document.querySelector('[data-testid="tv-roster-page"]')?.textContent ?? '').replace(/\s+/g, ' ').trim();
				const n = document.querySelectorAll('[data-testid="tv-roster"] .entry-banner').length;
				const m = /Showing (\d+) to (\d+) of (\d+)(?:.*?page (\d+) of (\d+))?/.exec(ind);
				if (!m) return ['indicator:UNPARSED(' + ind + ')'];
				const a = Number(m[1]), b = Number(m[2]), total = Number(m[3]);
				const page = Number(m[4] ?? 1), pages = Number(m[5] ?? 1);
				const win = b - a + 1;
				const pageSize = page < pages ? win : pages > 1 ? (total - win) / (pages - 1) : win;
				return [
					'indicator:parsed',
					'total:' + total,
					'pages:' + pages,
					'page-size:' + pageSize,
					n === win ? 'banners-match-window:yes' : 'banners-match-window:NO(' + n + ' banners for ' + win + ')'
				];
			},
			expected: ['indicator:parsed', 'total:22', 'pages:3', 'page-size:8', 'banners-match-window:yes'],
			label: 'the banners on screen are exactly the window the indicator names (22 entries, 3 pages of 8)'
		},
		{
			/* THE STAGE STILL TAKES THE WHOLE SCREEN (the 880px `main` cap,
			   from the field-4 spec), at this width too. */
			evaluate: () => {
				const m = document.querySelector('.tv .tv-body');
				if (!m) return ['stage:MISSING'];
				const b = m.getBoundingClientRect();
				return [
					Math.round(b.width) >= window.innerWidth - 4 ? 'stage:full-width' : 'stage:capped-at-' + Math.round(b.width),
					getComputedStyle(m).maxWidth === 'none' ? 'cap:none' : 'cap:' + getComputedStyle(m).maxWidth
				];
			},
			expected: ['stage:full-width', 'cap:none'],
			label: 'the stage takes the whole screen (the global 880px `main` cap is overridden)'
		}
	],
	contrast: [
		{ selector: '.tv .stage-label', label: 'Scan to enter (accent)', min: 4.5 },
		{ selector: '.tv .big-line', label: 'Registration is open', min: 4.5 },
		{ selector: '.tv .sub-line', label: 'entry count', min: 4.5 },
		{ selector: '[data-testid="tv-roster-page"]', label: 'the page indicator (ink-dim, mono)', min: 4.5 },
		/* Unstyled banners only: a styled banner's ink is measured against its
		   own art by `bannerInk`, and the sweep's ancestor walk lands on the
		   panel BEHIND the art (see the field-8 tv spec). The sim styles its
		   first five entries, so page 1 carries both kinds. */
		{ selector: '[data-testid="tv-roster"] .entry-banner:not(.has-bg) .name', label: 'roster names (unstyled banners)', min: 4.5 },
		{ selector: '.tv .tv-name', label: 'tournament name', min: 4.5 },
		{ selector: '.tv .tv-foot', label: 'footer address', min: 4.5 }
	]
};
