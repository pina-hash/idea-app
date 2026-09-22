/**
 * THE SPOTLIGHT TOUR'S OWN CONTROLS, WHICH NOTHING HAD EVER MEASURED.
 *
 * The tour is the first thing a new student is shown on this site, and until
 * this spec landed NO route spec asserted a single property of its callout.
 * One spec drove `/dev/tour` before it (`tour-mode-picker.mjs`), and that one
 * is about the pathway sheet's scroll lock: it DISMISSES the sheet and
 * measures the home page underneath, and never touches the callout at all. So
 * the findings below sat unmeasured for as long as the component has existed,
 * and that absence is the reason rather than an accident -- a surface with no
 * spec has no numbers, and a finding with no numbers is a sentence somebody
 * has to take on trust.
 *
 * WHAT WAS ACTUALLY FOUND, MEASURED HERE AT BOTH WIDTHS BEFORE THE REPAIR, AND
 * IT IS NOT WHAT THE REPORT SAID. The report was that the four controls paint
 * `--dim` on the callout's `--bg1` plate at 4.46:1, under the 4.5 floor. That
 * number is stale: `--dim` (#849080) on `--bg1` (#1a2a1a) measures 4.52:1 here
 * and CLEARS. What does not clear is the BOX around those controls -- the
 * `--dim` thinned to 45% composited to #4a5848 at 2.00:1, and the primary's
 * 55% gold to #817435 at 2.76:1 against its own wash, both against the 3:1
 * that CLAUDE.md's `--boundary` contract puts on the outer edge of an
 * interactive control. And the tap geometry was under the floor on all four:
 * Back and Next 26.8px tall, the close X 15x19.2, Skip tour 55.3x11.
 * `IDEA_INTERFACE_STANDARDS` 2.12 puts 44px on every student surface without
 * exception; the 24px density floor is a property a surface DECLARES with a
 * named class on its own root, and the tour declares none.
 *
 * `.tour-btn` MATCHES BOTH BACK AND NEXT AND THEY ARE DIFFERENT COLOURS (Next
 * is the gold primary), so the two are split by selector for contrast:
 * `contrast` reports the WORST of its matches, so one `.tour-btn` check would
 * let whichever of the pair is healthy speak for the other. They share one
 * `tapTargets` entry because geometry is the same question for both.
 *
 * WHY BACK IS READ AFTER AN ADVANCE. It carries `disabled` while `index === 0`,
 * which paints it at `opacity: 0.4`, so step 1 is not the state it is ever
 * pressed in. The prepare step advances one step where there is one to advance
 * to -- and refuses to where there is not, because `next()` on the LAST step
 * calls `onclose('completed')` and unmounts the whole callout.
 */

/*
 * THE DEV HARNESS'S OWN PANEL IS HIDDEN FIRST, AND THIS IS NOT TIDYING UP.
 * `/dev/tour` renders a fixed control panel over the page that production does
 * not have, and at 375 it sits ON TOP of the callout's action row. Measured
 * before this step existed: Back and Next both reported `COVERED by
 * svelte-1t7fjab` at 375 while rendering perfectly, `tapTargets` resolved
 * their centres to the panel's own Reset button, and a scripted press of Next
 * pressed the harness instead. Every number taken in that state is a number
 * about the wrong element. The panel is harness furniture, so removing it is
 * restoring the production geometry rather than arranging a pass -- and the
 * step REPORTS whether it found one, so the day the panel's class moves this
 * says "no panel found" instead of silently measuring under it again.
 */
const HIDE_HARNESS_PANEL = `() => {
	const panels = Array.from(document.querySelectorAll('.tour-harness'));
	if (!panels.length) return 'no dev harness panel found to hide (class moved?) -- readings below are unshielded';
	for (const p of panels) p.style.display = 'none';
	return 'hid ' + panels.length + ' dev harness panel(s); production has none';
}`;

/* The tour has to be ON, and its controls have to be REACHABLE, before
   anything below means anything. This is the POSITIVE CONTROL for every check
   in the file: if the auto-launch stops firing -- a fixture change, a flag
   left in storage, a step whose target went missing -- this reddens, rather
   than the contrast checks quietly reporting "no match" and a reader taking
   that for nothing being wrong. */
const TOUR_IS_UP = `() => {
	const callout = document.querySelector('.tour-callout');
	const parts = [['close', '.tour-x'], ['skip', '.tour-skip'], ['back', '.tour-btn:not(.primary)'], ['next', '.tour-btn.primary']];
	const missing = parts.filter((p) => !document.querySelector('.tour-callout ' + p[1])).map((p) => p[0]);
	if (!callout || missing.length) return 'THE TOUR IS NOT UP: ' + (callout ? 'missing ' + missing.join(', ') : 'no .tour-callout');
	const r = callout.getBoundingClientRect();
	return 'callout ' + Math.round(r.width) + 'x' + Math.round(r.height) + ' at ' + Math.round(r.left) + ',' + Math.round(r.top)
		+ '; step ' + ((document.querySelector('.tour-count') || {}).textContent || '?').trim()
		+ '; ' + parts.map((p) => {
			const el = document.querySelector('.tour-callout ' + p[1]);
			const b = el.getBoundingClientRect();
			const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
			return p[0] + ' ' + Math.round(b.width) + 'x' + Math.round(b.height) + (hit && (el.contains(hit) || hit === el) ? ' reachable' : ' COVERED by ' + (hit ? (hit.className || hit.tagName) : 'nothing'));
		}).join(', ');
}`;

/*
 * PRESSES NEXT ONLY WHEN THERE IS A STEP TO ADVANCE TO, and that guard is the
 * difference between measuring the tour and ENDING it: `next()` on the last
 * step calls `onclose('completed')`, which unmounts the callout and stamps the
 * profile. The tour drops steps whose targets are absent (`findTarget` treats
 * a zero box as absent), so how many steps exist is a function of the width
 * and cannot be assumed. The press is a HIT TEST rather than a `.click()` on a
 * selector, so a covered control presses whatever covers it and says so.
 */
const ADVANCE_IF_POSSIBLE = `() => {
	const count = ((document.querySelector('.tour-count') || {}).textContent || '').trim();
	const m = count.match(/([0-9]+) +of +([0-9]+)/);
	const at = m ? Number(m[1]) : 0, total = m ? Number(m[2]) : 0;
	if (!m) return 'could not read the step counter (' + count + '); nothing pressed';
	if (total <= 1 || at >= total) return 'on the last step (' + count + '): pressing Next would END the tour, so nothing is pressed and Back is read disabled';
	const next = document.querySelector('.tour-callout .tour-btn.primary');
	if (!next) return 'no Next control to press (counter said ' + count + ')';
	const r = next.getBoundingClientRect();
	const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
	if (hit) hit.click();
	return 'pressed whatever sits at Next s centre (' + (hit ? (hit.className || hit.tagName) : 'null') + '), counter was ' + count;
}`;

/*
 * THE CONTROL EDGES, COMPOSITED ON A CANVAS AND READ BACK AS PIXELS.
 *
 * WHY THIS LIVES IN A PREPARE STEP: `contrast` reads `cs.color` and nothing
 * else, so the box around a control is invisible to it, and the box is where
 * this surface's real contrast finding was. Adding a border check to
 * `checks.mjs` means adding its `--selftest` and `--break` controls with it,
 * which is a different bundle.
 *
 * WHY A CANVAS AND NOT A REGEX OVER THE COMPUTED STRING: Chromium reports a
 * `color-mix(..., transparent)` border as `color(srgb r g b / a)` with 0-to-1
 * FLOATS, not as `rgb()` 0-to-255. A reader that scraped numbers out of that
 * string read 0.784 as a red channel and reported the primary's gold edge as
 * rgb(7,10,6) at 1.26:1 -- near black, a plausible-looking failure that was
 * entirely the instrument. That is CLAUDE.md's own rule ("MEASURE BY PAINTING
 * TO A CANVAS AND READING THE PIXEL BACK") and this is what it is for. The
 * canvas also removes the alpha arithmetic altogether: the plate, the
 * element's own background and the border are painted IN ORDER, so whatever
 * syntax any of them arrives in, the pixel underneath is the ground.
 *
 * THE POSITIVE CONTROL IS THAT `fillStyle` REJECTS SILENTLY. Assigning an
 * unparseable colour leaves the previous one in place, so a canvas reader can
 * report a confident number about a colour it never painted. Every assignment
 * is read back and a refusal is named.
 *
 * EACH EDGE IS JUDGED AGAINST BOTH GROUNDS IT TOUCHES -- the element's own
 * background inside it, and the callout plate outside it -- because a border
 * separates the two and a reading against only the friendlier one is how a
 * failing edge passes.
 */
const EDGE_CONTRAST = `() => {
	const cv = document.createElement('canvas'); cv.width = cv.height = 1;
	const ctx = cv.getContext('2d', { willReadFrequently: true });
	const refused = [];
	const paint = (colors) => {
		ctx.clearRect(0, 0, 1, 1);
		for (const c of colors) {
			ctx.fillStyle = '#000000';
			ctx.fillStyle = c;
			if (ctx.fillStyle === '#000000' && !/^(#000000|rgb\\(0, ?0, ?0\\)|black)$/i.test(c.trim())) refused.push(c);
			ctx.fillRect(0, 0, 1, 1);
		}
		const d = ctx.getImageData(0, 0, 1, 1).data;
		return [d[0], d[1], d[2]];
	};
	const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
	const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return Math.round(100 * (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) / 100; };
	const show = (c) => 'rgb(' + c.join(',') + ')';
	const callout = document.querySelector('.tour-callout');
	if (!callout) return 'THE CALLOUT IS NOT UP: no edge to measure';
	const plateCss = getComputedStyle(callout).backgroundColor;
	const plate = paint([plateCss]);
	const out = [];
	for (const [name, sel] of [['Back', '.tour-callout .tour-btn:not(.primary)'], ['Next', '.tour-callout .tour-btn.primary']]) {
		const el = document.querySelector(sel);
		if (!el) { out.push(name + ' ABSENT'); continue; }
		const cs = getComputedStyle(el);
		const inside = paint([plateCss, cs.backgroundColor]);
		const edge = paint([plateCss, cs.backgroundColor, cs.borderTopColor]);
		out.push(name + ' edge ' + show(edge) + ' at ' + parseFloat(cs.borderTopWidth) + 'px: '
			+ ratio(edge, inside) + ':1 against its own fill ' + show(inside)
			+ ', ' + ratio(edge, plate) + ':1 against the plate ' + show(plate));
	}
	return out.join('  |  ') + '   [floor 3:1 -- a control edge is load-bearing]'
		+ (refused.length ? '   INSTRUMENT REFUSED: ' + refused.join(', ') : '');
}`;

/* The `until` above, as a predicate. Deliberately a second expression of the
   same arithmetic rather than a shared helper: a route spec's steps are
   strings evaluated in the page, so there is nowhere to put one, and the
   evaluate's job is to PRINT the numbers while this one's is to gate. */
const EDGES_CLEAR_3 = `() => {
	const cv = document.createElement('canvas'); cv.width = cv.height = 1;
	const ctx = cv.getContext('2d', { willReadFrequently: true });
	const paint = (colors) => { ctx.clearRect(0, 0, 1, 1); for (const c of colors) { ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1); } const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]]; };
	const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
	const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const callout = document.querySelector('.tour-callout');
	if (!callout) return false;
	const plateCss = getComputedStyle(callout).backgroundColor;
	const plate = paint([plateCss]);
	return ['.tour-callout .tour-btn:not(.primary)', '.tour-callout .tour-btn.primary'].every((sel) => {
		const el = document.querySelector(sel);
		if (!el) return false;
		const cs = getComputedStyle(el);
		const inside = paint([plateCss, cs.backgroundColor]);
		const edge = paint([plateCss, cs.backgroundColor, cs.borderTopColor]);
		return ratio(edge, inside) >= 3 && ratio(edge, plate) >= 3;
	});
}`;

export default {
	path: '/dev/tour?mode=student',
	label:
		'The first-time spotlight tour s callout: the four controls a student leaves it with, against the 4.5:1, 3:1 and 44px floors',
	/* `ssr = false` on this route and the tour waits on a settle timer before
	   auto-launching, so the default settle is far too short for it. */
	settleMs: 1500,
	prepare: [
		{ evaluate: HIDE_HARNESS_PANEL, until: `() => !document.querySelector('.tour-harness')
			|| getComputedStyle(document.querySelector('.tour-harness')).display === 'none'`, waitMs: 100 },
		{
			evaluate: TOUR_IS_UP,
			/* PRESENT IS NOT REACHABLE, and on this surface the two genuinely
			   differed: every control rendered while two of them handed their
			   taps to the dev panel. A hit test is the only read that tells
			   them apart -- `tapTargets` below reports geometry and gates on
			   size, so a covered control passes it. */
			until: `() => ['.tour-x', '.tour-skip', '.tour-btn:not(.primary)', '.tour-btn.primary'].every((sel) => {
				const el = document.querySelector('.tour-callout ' + sel);
				if (!el) return false;
				const b = el.getBoundingClientRect();
				const hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2);
				return !!hit && (hit === el || el.contains(hit));
			})`,
			waitMs: 250
		},
		{
			evaluate: ADVANCE_IF_POSSIBLE,
			/* Back ENABLED, which is the state it is read in below -- or the
			   honest admission that at this width the tour has nowhere to
			   advance to and Back never can be. Asserting the counter alone
			   would pass on a step that advanced without Back becoming
			   pressable. */
			until: `() => {
				const back = document.querySelector('.tour-callout .tour-btn:not(.primary)');
				if (!back) return false;
				const count = ((document.querySelector('.tour-count') || {}).textContent || '').trim();
				const m = count.match(/([0-9]+) +of +([0-9]+)/);
				if (m && Number(m[1]) >= Number(m[2])) return true;
				return !back.disabled;
			}`,
			waitMs: 300
		},
		{ evaluate: EDGE_CONTRAST, until: EDGES_CLEAR_3, waitMs: 100 }
	],
	presence: [
		{ selector: '.tour-callout', label: 'the callout itself', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.tour-callout .tour-x', label: 'close X', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.tour-callout .tour-skip', label: 'Skip tour', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.tour-callout .tour-btn:not(.primary)', label: 'Back', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.tour-callout .tour-btn.primary', label: 'Next / Done', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '.tour-callout .tour-x', label: 'close X on the callout plate', min: 4.5 },
		{ selector: '.tour-callout .tour-skip', label: 'Skip tour on the callout plate', min: 4.5 },
		{ selector: '.tour-callout .tour-btn:not(.primary)', label: 'Back on the callout plate', min: 4.5 },
		{ selector: '.tour-callout .tour-btn.primary', label: 'Next / Done on its own gold wash', min: 4.5 },
		/* The reading copy beside them, so a repair to the controls that cost the prose something shows up here. */
		{ selector: '.tour-callout .tour-body', label: 'the step body', min: 4.5 },
		{ selector: '.tour-callout .tour-count', label: 'the step counter', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.tour-callout .tour-x', label: 'close X', min: 44 },
		{ selector: '.tour-callout .tour-skip', label: 'Skip tour', min: 44 },
		{ selector: '.tour-callout .tour-btn', label: 'Back and Next together', min: 44 }
	]
};
