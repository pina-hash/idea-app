/**
 * THE PROGRESS RAIL ABOVE A PORTED HTML ASSIGNMENT, MEASURED IN A REAL BROWSER
 * AT BOTH WIDTHS, WHICH IS THE ONLY PLACE ITS DEFECTS ARE VISIBLE.
 *
 * WHY A BROWSER AT ALL. `tests/html-assignment-progress.test.ts` proves the
 * NUMBER: weighted by points, the sentence floor judged by the Submit gate's
 * own count, an image judged by its file, 0 and 100 at the ends. It cannot see
 * whether the bar is 14px tall or 0, whether a five-point segment is visibly
 * wider than a one-point one, whether the fill can be told from the track, or
 * whether a chip ellipsised the count off its own end at 375 -- which it did,
 * on the first render of this page, and only looking found it. Ledger 0141
 * shipped a pane 275px wide at 1440 with every content check green; this spec
 * exists so the rail cannot do the same.
 *
 * THE PAGE HOLDS EVERY STATE THE BRIEF NAMES, EACH AS ITS OWN CARD, so one
 * load measures all of them: zero, the one-point module alone (10%, where a
 * count would say 17%), the five-point module alone (50%, where a count would
 * say 33%), an answer short of its sentence floor, an image as the only unmet
 * block, complete, a one-module document half done and complete. Then an
 * INTERACTIVE card driven one block at a time, and the REAL `ItemDetail` over a
 * real `HxAnswersStore` against the real `/hx/worksheet` document, driven by
 * the same synthetic-message technique the boundary harness's positive control
 * uses -- the sandboxed document is an opaque origin and cannot be typed into
 * from outside, so the exact `MessageEvent` it would post is constructed
 * instead and travels the real gate, controller, store and mount.
 *
 * THE ORACLE ROW. `window.__hxp.oracle` is the pure module's answer for every
 * card, computed by the page from the same fixtures; the row below reads the
 * RENDERED `data-percent` off each rail and prints both side by side. A rail
 * drawing the wrong number over the right computation reddens, and so does the
 * reverse.
 *
 * THE COLOUR ROW READS PIXELS, NOT STRINGS. The fill is a `color-mix()` in
 * oklab, which a regex over computed styles cannot parse; each fill and its
 * track are painted to a 1x1 canvas and read back, the contrast ratio is taken
 * from the composited pixels, and the oklab `a` axis (positive is red,
 * negative is green) is read straight off the computed colour to prove the
 * ramp runs red to green rather than merely being coloured.
 */
export default {
	path: '/dev/html-progress',
	label: 'HTML assignment progress rail: weighted by points, red to green, not a grade',

	prepare: [
		{
			/* The real card's frame is mounted. Nothing below reaches into it; the
			   element only has to EXIST for a synthetic message to name its
			   window as the source. */
			waitFor: `() => !!document.querySelector('[data-sc="real"] iframe[data-hx-frame]')`,
			attempts: 40,
			gapMs: 250
		},
		/*
			SIX PRESSES, ONE COUNTED BLOCK EACH, IN MANIFEST ORDER, and the number
			after every press is worked by hand from the fixture's points (5, 1, 4
			over 2, 1, 3 blocks): 2.5, 5, 6, 7.33, 8.67, 10 of 10. Each `until`
			names the NEXT value, which nothing at rest satisfies, so a click that
			did not fire cannot short-circuit the step.
		*/
		{ click: '[data-drive="fill"]', until: `() => document.querySelector('[data-sc="interactive"] [data-hx-progress]')?.dataset.percent === '25'` },
		{ click: '[data-drive="fill"]', until: `() => document.querySelector('[data-sc="interactive"] [data-hx-progress]')?.dataset.percent === '50'` },
		{ click: '[data-drive="fill"]', until: `() => document.querySelector('[data-sc="interactive"] [data-hx-progress]')?.dataset.percent === '60'` },
		{ click: '[data-drive="fill"]', until: `() => document.querySelector('[data-sc="interactive"] [data-hx-progress]')?.dataset.percent === '73'` },
		{ click: '[data-drive="fill"]', until: `() => document.querySelector('[data-sc="interactive"] [data-hx-progress]')?.dataset.percent === '87'` },
		{ click: '[data-drive="fill"]', until: `() => document.querySelector('[data-sc="interactive"] [data-hx-progress]')?.dataset.percent === '100'` },
		/*
			THE REAL MOUNT. Two synthetic messages through the real bridge: the
			checkbox is one of two counted blocks in a ten-point module (50%), then
			a two-sentence reflection clears its floor (100%). The rail read here is
			the one `ItemDetail` mounted, not a card's.
		*/
		{ click: '[data-drive="type"]', until: `() => document.querySelector('[data-sc="real"] [data-hx-progress]')?.dataset.percent === '50'` },
		{ click: '[data-drive="type"]', until: `() => document.querySelector('[data-sc="real"] [data-hx-progress]')?.dataset.percent === '100'` }
	],

	presence: [
		/* THE ROOM. Both components ship under `/classroom/**`, whose layout gives
		   every surface `.cr-root`; without the stylesheet the class paints the
		   portal plate and every contrast row below reads the wrong ground. */
		{ selector: '.cr-root', label: 'the classroom room', expectPresent: 1, expectVisible: 1 },
		/* Ten rails: eight fixed cards, the interactive one, and the one the real
		   ItemDetail mounted. */
		{ selector: '[data-hx-progress]', label: 'a progress rail', expectPresent: 10, maxPresent: 10, expectVisible: 10 },
		{ selector: '[data-sc="real"] .engine-host [data-hx-progress]', label: "the rail inside ItemDetail's own work section", expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-sc="real"] iframe[data-hx-frame]', label: 'the real sandboxed frame below the rail', expectPresent: 1, maxPresent: 1 },
		/* Three modules, three segments, three chips; one module, one of each. */
		{ selector: '[data-sc="zero"] [data-hx-seg]', label: 'segments on the three-module document', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-sc="zero"] [data-hx-mod]', label: 'chips on the three-module document', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: '[data-sc="single"] [data-hx-seg]', label: 'segments on the one-module document', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-sc="single"] [data-hx-mod]', label: 'chips on the one-module document', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* Done segments: all three at 100%, none at 0%. The first is the
		   positive control for the second. */
		{ selector: '[data-sc="full"] .hxp-seg.is-done', label: 'done segments at 100%', expectPresent: 3, maxPresent: 3 },
		{ selector: '[data-sc="zero"] .hxp-seg.is-done', label: 'done segments at 0%', expectPresent: 0 },
		{ selector: '[data-sc="weighted-heavy"] .hxp-seg.is-done', label: 'done segments with only the five-point module met', expectPresent: 1, maxPresent: 1 },
		/* The header never becomes a segment or a chip. */
		{ selector: '[data-hx-seg="hb-name"], [data-hx-mod="hb-name"]', label: 'a header field drawn as a segment or chip', expectPresent: 0 },
		/* The note is on every rail, zero and one hundred included. */
		{ selector: '[data-hx-progress] [data-testid="hxp-note"]', label: 'the not-a-grade note', expectPresent: 10, maxPresent: 10, expectVisible: 10 },
		/* The bar is a real progressbar with a value, on every rail. */
		{ selector: '[data-hx-progress] [role="progressbar"][aria-valuenow]', label: 'a progressbar role with a value', expectPresent: 10, maxPresent: 10 },
		/* The interactive card ended at 100%, so its control is disabled -- the
		   contract, not a synthetic click, per CLAUDE.md's `disabled` rule. */
		{ selector: '[data-drive="fill"][disabled]', label: 'the fill control, disabled once complete', expectPresent: 1, maxPresent: 1 }
	],

	textContains: [
		{
			selector: '[data-sc="zero"] [data-hx-progress]',
			label: 'zero: the number, the stage, the next line, the note',
			must: ['0% filled in', 'Not started', 'Next up: "Bench setup" has an empty answer.', 'Bench setup: 2 answers left', 'First cut: 1 answer left', 'Reflection: 3 answers left', 'This measures how much you have filled in, not how well. Grades come from your teacher.'],
			mustNot: ['All filled in', 'done', 'point']
		},
		{
			selector: '[data-sc="weighted-light"] [data-hx-progress]',
			label: 'the one-point module alone reads 10%, not the count-weighted 17%',
			must: ['10% filled in', 'Just started', 'First cut: done'],
			mustNot: ['17%', 'point']
		},
		{
			selector: '[data-sc="weighted-heavy"] [data-hx-progress]',
			label: 'the five-point module alone reads 50%, not the count-weighted 33%',
			must: ['50% filled in', 'Past halfway', 'Bench setup: done', 'Next up: "First cut" is waiting for a photo.'],
			mustNot: ['33%', 'point']
		},
		{
			selector: '[data-sc="short"] [data-hx-progress]',
			label: 'an answer short of its floor is not met, and the next line says how many sentences',
			must: ['25% filled in', 'Building up', 'Next up: "Bench setup" needs 1 more sentence.', 'Bench setup: 1 answer left'],
			mustNot: ['Bench setup: done']
		},
		{
			selector: '[data-sc="image-only"] [data-hx-progress]',
			label: 'the only unmet block is a photo',
			must: ['90% filled in', 'Almost there', 'Next up: "First cut" is waiting for a photo.', 'Bench setup: done', 'Reflection: done', 'First cut: 1 answer left'],
			mustNot: ['All filled in']
		},
		{
			selector: '[data-sc="full"] [data-hx-progress]',
			label: 'complete: All filled in, the completion note, and STILL the not-a-grade note',
			must: ['100% filled in', 'All filled in', 'Every answer is in. That is completeness, not a grade: your teacher still scores the work.', 'This measures how much you have filled in, not how well. Grades come from your teacher.', 'Bench setup: done', 'First cut: done', 'Reflection: done'],
			mustNot: ['Next up', 'point', 'answers left']
		},
		{
			selector: '[data-sc="single"] [data-hx-progress]',
			label: 'a one-module document, half done',
			must: ['50% filled in', 'Reflection: 1 answer left'],
			mustNot: ['done']
		},
		{
			selector: '[data-sc="single-full"] [data-hx-progress]',
			label: 'a one-module document, complete',
			must: ['100% filled in', 'All filled in', 'Reflection: done']
		},
		{
			selector: '[data-sc="interactive"] [data-hx-progress]',
			label: 'the interactive card, after six presses',
			must: ['100% filled in', 'All filled in']
		},
		{
			selector: '[data-sc="real"] .engine-host',
			label: "the real ItemDetail's work section carries the rail above the frame, at 100% after two messages",
			must: ['Your work', '100% filled in', 'All filled in', 'One module, three block types: done']
		},
		{
			/* THE WHOLE PAGE, and the direction that matters most: no rail, chip,
			   next line or note names a point value, a score or a mark. The
			   completion note says "scores the work", which is the teacher's verb
			   and is allowed; what is refused is a NUMBER of points. */
			selector: '[data-hx-progress]',
			label: 'no rail prints a point value anywhere',
			must: ['filled in'],
			mustNot: [' pts', 'points', ' of 10', '/10']
		}
	],

	orderResult: [
		{
			/* EVERY RENDERED NUMBER AGAINST THE PURE MODULE'S, side by side, and
			   the expected list is worked by hand from 5/1/4 over 2/1/3. */
			evaluate: `() => {
				const oracle = (window.__hxp && window.__hxp.oracle) || {};
				return [...document.querySelectorAll('[data-sc]')].map((card) => {
					const id = card.dataset.sc;
					const rail = card.querySelector('[data-hx-progress]');
					const o = oracle[id];
					return id + '=' + (rail ? rail.dataset.percent : 'none') + '/' + (o ? o.percent : 'none') + ':' + (rail ? rail.dataset.stage : 'none') + ':' + (rail ? rail.dataset.basis : 'none');
				});
			}`,
			expected: [
				'zero=0/0:blank:points',
				'weighted-light=10/10:started:points',
				'weighted-heavy=50/50:halfway:points',
				'short=25/25:building:points',
				'image-only=90/90:nearly:points',
				'full=100/100:complete:points',
				'single=50/50:halfway:points',
				'single-full=100/100:complete:points',
				'interactive=100/100:complete:points',
				'real=100/100:complete:points'
			],
			label: 'every rail renders the number, stage and basis the pure module computed, on every card'
		},
		{
			/* THE WEIGHTING IS VISIBLE. The three segments' widths, at whatever
			   width this runs, in the ratio of the modules' points: 5:1:4. Measured
			   530/108/424 at 1440 and 142/30/114 at 375, so the rounded ratios to
			   the one-point segment are 5 and 4 at both. */
			evaluate: `() => {
				const w = [...document.querySelectorAll('[data-sc="zero"] [data-hx-seg]')].map((s) => s.getBoundingClientRect().width);
				const bar = document.querySelector('[data-sc="zero"] [data-testid="hxp-bar"]').getBoundingClientRect();
				return [
					'segments=' + w.length,
					'first/second=' + Math.round(w[0] / w[1]),
					'third/second=' + Math.round(w[2] / w[1]),
					'bar-height>=12=' + (bar.height >= 12),
					'smallest-segment>=24=' + (Math.min(...w) >= 24)
				];
			}`,
			expected: ['segments=3', 'first/second=5', 'third/second=4', 'bar-height>=12=true', 'smallest-segment>=24=true'],
			label: 'a five-point segment is five times the width of a one-point one, and the smallest is still a visible slot'
		},
		{
			/* THE RAMP IS RED TO GREEN, READ OFF THE COMPUTED COLOUR'S oklab a
			   AXIS (positive red, negative green), strictly falling across five
			   rising values; and every fill clears 3:1 against its own track,
			   taken from PIXELS painted to a canvas because the fill is a
			   color-mix() no regex can parse. Measured 4.96 / 5.27 / 5.70 / 7.05 /
			   7.44 at 1440, the floor of which is pinned here. */
			evaluate: `() => {
				const c = document.createElement('canvas'); c.width = c.height = 1; const g = c.getContext('2d');
				const rgb = (css) => { g.fillStyle = '#000'; g.fillRect(0, 0, 1, 1); g.fillStyle = css; g.fillRect(0, 0, 1, 1); const d = g.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
				const lum = ([r, gg, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(gg) + 0.0722 * f(b); };
				const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
				const ids = ['weighted-light', 'short', 'weighted-heavy', 'image-only', 'full'];
				const a = []; const ratios = [];
				for (const id of ids) {
					const seg = document.querySelector('[data-sc="' + id + '"] [data-hx-seg]');
					const fill = seg.querySelector('[data-hx-fill]');
					const css = getComputedStyle(fill).backgroundColor;
					const m = css.match(/oklab\\(\\s*([\\d.]+)\\s+(-?[\\d.]+)\\s+(-?[\\d.]+)/);
					a.push(m ? Number(m[2]) : NaN);
					ratios.push(ratio(rgb(css), rgb(getComputedStyle(seg).backgroundColor)));
				}
				const falling = a.every((v, i) => i === 0 || v < a[i - 1]);
				return [
					'oklab-a-parsed=' + a.every((v) => Number.isFinite(v)),
					'red-at-10%=' + (a[0] > 0.1),
					'green-at-100%=' + (a[4] < -0.05),
					'strictly-falling=' + falling,
					'min-fill-vs-track>=4.5=' + (Math.min(...ratios) >= 4.5),
					'fills-measured=' + ratios.length
				];
			}`,
			expected: ['oklab-a-parsed=true', 'red-at-10%=true', 'green-at-100%=true', 'strictly-falling=true', 'min-fill-vs-track>=4.5=true', 'fills-measured=5'],
			label: 'the fill runs red to green as the number rises, and every fill clears 4.5:1 against its track'
		},
		{
			/* THE REAL CONTROLLER WROTE THE ROWS. The synthetic messages did not
			   only move a number: the store's transports recorded a save under
			   each BLOCK ID (never the field), which is what says the rail sits on
			   the same records the database will hold. */
			evaluate: `() => {
				const rows = (window.__hxp && window.__hxp.savedRows) || [];
				return [...rows].sort();
			}`,
			expected: ['hxw-done', 'hxw-reflection'],
			label: 'the two synthetic messages landed as saves under their block ids, through the real controller'
		},
		{
			/* NO CHIP ELLIPSISES. The defect the first render had at 375: a chip
			   whose text overflowed hid the count behind "...". Every chip's word
			   span is at least as wide as its own scroll width, at both widths. */
			evaluate: `() => {
				const words = [...document.querySelectorAll('[data-hx-progress] .hxp-mod-word')];
				const clipped = words.filter((w) => w.scrollWidth > w.clientWidth + 1).length;
				return ['chips=' + words.length, 'clipped=' + clipped];
			}`,
			expected: ['chips=24', 'clipped=0'],
			label: 'no module chip clips its own text at this width'
		}
	],

	contrast: [
		{ selector: '[data-sc="zero"] .hxp-num', label: 'the percentage', min: 4.5 },
		{ selector: '[data-sc="zero"] .hxp-sign', label: 'the percent sign', min: 4.5 },
		{ selector: '[data-sc="zero"] .hxp-pct-word', label: 'the words beside the number', min: 4.5 },
		{ selector: '[data-sc="zero"] .hxp-stage-word', label: 'the stage word', min: 4.5 },
		{ selector: '[data-sc="full"] .hxp-stage-word', label: 'the stage word at 100%, in green', min: 4.5 },
		{ selector: '[data-sc="zero"] .hxp-next', label: 'the next line', min: 4.5 },
		{ selector: '[data-sc="full"] .hxp-next', label: 'the completion note', min: 4.5 },
		{ selector: '[data-sc="zero"] .hxp-note', label: 'the not-a-grade note', min: 4.5 },
		{ selector: '[data-sc="zero"] .hxp-mod-word', label: 'a chip with answers left', min: 4.5 },
		{ selector: '[data-sc="full"] .hxp-mod.is-done .hxp-mod-word', label: 'a done chip, in green', min: 4.5 },
		{ selector: '[data-sc="real"] .engine-host .hxp-num', label: "the percentage inside the real ItemDetail", min: 4.5 }
	],

	tapTargets: [
		/* The rail has no control of its own -- nothing in it is tappable, so
		   the floor has nothing to measure there. The harness's three drive
		   controls are measured at 44. */
		{ selector: '.h-buttons .btn', label: 'a harness drive control', min: 44 }
	],

	motion: [
		/* The gloss sweep on the fill and the pop on the stage line, both only
		   at 100%: animating under no-preference, still and painted under
		   reduce. The zero card's stage line is the `never` control: the pop
		   belongs to completion and nothing else. */
		{ selector: '[data-sc="full"] [data-hx-fill]', label: 'the completion gloss on the fill', expect: 'gated' },
		{ selector: '[data-sc="full"] .hxp-stage', label: 'the completion pop on the stage line', expect: 'gated' },
		{ selector: '[data-sc="zero"] .hxp-stage', label: 'the stage line at 0% (never animated)', expect: 'never' }
	],

	/* The harness blocks every non-loopback request, so the fixture's own font
	   fetch resets. Nothing to do with this surface. */
	ignoreConsole: ['ERR_CONNECTION_RESET', 'ERR_BLOCKED_BY_CLIENT']
};
