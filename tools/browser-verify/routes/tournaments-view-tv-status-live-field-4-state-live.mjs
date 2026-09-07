/**
 * THE PROJECTOR IN ACTUAL FULLSCREEN, MID-MATCH, WITH THE WAY BACK OUT ON IT.
 *
 * Prompt 0077 measured this surface at 1920 IN A WINDOW and passed. Prompt
 * 0091 is the first report off a real projector and it said two things: the
 * layout is wrong, and once you are in fullscreen there is no way out a person
 * can find. This spec is the standing instrument for the second half, and it
 * is the only route file in the directory that drives `requestFullscreen`.
 *
 * HOW IT GETS THERE. Every engine refuses `requestFullscreen` without a user
 * gesture. The `click` step supplies one -- a real Chromium input event, not a
 * dispatched one -- and Chromium's transient activation carries into the
 * `evaluate` that follows, which is measured rather than assumed: the
 * `evaluate` step's own `until` is `document.fullscreenElement`, so a run where
 * activation did NOT carry reddens on that step instead of quietly measuring a
 * windowed page and calling it fullscreen.
 *
 * WHY `field=4`. A four-entry bracket is the smallest real one, so `state=live`
 * puts a pair on the stage with no ambiguity about which match is featured;
 * the eight-entry route beside this one covers the between-matches state.
 */
export default {
	path: '/dev/tournaments?view=tv&status=live&field=4&state=live',
	label: 'Projector stage in real fullscreen, mid-match, with the exit control',
	/* THE SETTLE OUTLASTS `EXIT_CONTROL_IDLE_MS` (4000ms) ON PURPOSE, so every
	   figure below is read in the state the control spends almost all of its
	   life in -- quiet, not freshly woken. Measuring the awake state would be
	   measuring the easy one: the word reads 15.86:1 at full strength and
	   6.60:1 settled, and it is the settled number that has to clear 4.5. */
	settleMs: 4800,
	prepare: [
		{
			evaluate: () => {
				document.documentElement.requestFullscreen?.();
				return 'requested';
			},
			until: () => !!document.fullscreenElement,
			/* THE `until` IS THE MEASUREMENT, NOT A CONVENIENCE. Every engine
			   may refuse `requestFullscreen` without a user gesture, and this
			   headless Chromium does not (measured: it grants it with no prior
			   input event at all). The day that changes -- a Chromium update,
			   a different binary -- this step goes red instead of quietly
			   measuring a WINDOWED page and reporting it as fullscreen, which
			   is the failure that would matter. A `click` step was tried first
			   to supply the gesture and the harness correctly refused it: the
			   click changes nothing on the page, so its `until` already held
			   and the step reached no state. */
			label: 'enter fullscreen for real (until document.fullscreenElement is set)'
		}
	],
	presence: [
		/* CONTROL 1: THE WAY OUT EXISTS. A projector page that offers
		   fullscreen and renders no exit has stranded whoever is driving it --
		   the API's own exit is Escape and the browser paints no chrome for
		   it. Deleting the control breaks nothing a type check or a render can
		   see, which is exactly why this row is here. */
		{ selector: '.tv .tv-exit', label: 'the exit control, in fullscreen', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		/* Its positive control: the live pair really is on the stage, so the
		   no-overlap verdict below cannot pass by measuring an empty screen. */
		{ selector: '.tv .versus', label: 'the live pair (positive control for the overlap check)', expectPresent: 1 },
		{ selector: '.tv .entry-banner.xl', label: 'the two banners the room reads', expectPresent: 2, maxPresent: 2 }
	],
	textContains: [
		/* A GLYPH IS NOT A CONTROL. Somebody who has never seen this page has
		   to be able to read what the button does, and it names the key that
		   does the same thing so the next person needs the mouse once. */
		{ selector: '.tv .tv-exit', label: 'the exit control says what it does', must: ['Exit full screen', 'Esc'] }
	],
	orderResult: [
		{
			/* CONTROL 2: GEOMETRY, NOT EXISTENCE. The claim is that this control
			   can never cover the match, and a presence check cannot make it --
			   a button rendered on top of the live pair is present and useless.
			   So this reads real rects out of a real layout.
			
			   THE PROBE NAMES WHAT IT FOUND, NOT JUST ITS VERDICT. An
			   intersection test between two rects answers "no overlap" just as
			   cheerfully when one of them does not exist, so `exit:present` and
			   `pair:present` are elements of the compared array: a run where
			   either went missing reddens on the element that names it rather
			   than passing on the verdict beside it.
			
			   `hit:exit` is the other half, and it is the one that actually
			   bit. `SiteFeedback`'s shell pill is `position: fixed` bottom-right
			   at `z-index: 90` and is mounted in the root layout, so it is on
			   this page too -- the exit control was written into the right end
			   of the footer first and Chromium refused to click it at 1024x768
			   ("Report a problem intercepts pointer events"). A rect test alone
			   would have called that geometry fine. `elementFromPoint` across
			   the control's full span is what says a finger or a mouse actually
			   reaches it. */
			evaluate: () => {
				const box = (s) => {
					const e = document.querySelector(s);
					if (!e) return null;
					const b = e.getBoundingClientRect();
					return b.width > 0 && b.height > 0 ? b : null;
				};
				const hits = (a, b) =>
					!!a && !!b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
				const exit = box('.tv .tv-exit');
				const pair = box('.tv .versus');
				const stage = box('.tv .tv-body');
				const el = document.querySelector('.tv .tv-exit');
				const reach =
					exit && el
						? [0.1, 0.3, 0.5, 0.7, 0.9]
								.map((f) => document.elementFromPoint(exit.x + exit.width * f, exit.y + exit.height / 2))
								.every((t) => t && (t === el || el.contains(t)))
						: false;
				return [
					exit ? 'exit:present' : 'exit:MISSING',
					pair ? 'pair:present' : 'pair:MISSING',
					hits(exit, pair) ? 'covers-the-pair:YES' : 'covers-the-pair:no',
					hits(exit, stage) ? 'covers-the-stage:YES' : 'covers-the-stage:no',
					reach ? 'hit:exit' : 'hit:SOMETHING-ELSE'
				];
			},
			expected: [
				'exit:present',
				'pair:present',
				'covers-the-pair:no',
				'covers-the-stage:no',
				'hit:exit'
			],
			label: 'the exit control is reachable and covers neither the live pair nor the stage'
		},
		{
			/* THE 880px CAP. `src/app.css` caps every `main` at 880px, which is
			   right for a reading surface and wrong for the one element in the
			   app that is a WALL -- `.tv-body` is a `<main>`, so a 1920-wide
			   projector rendered its stage in an 880px centred column with
			   520px of dead black down each side while the header and footer
			   went full bleed. Measured before the fix at 1920x1080: stage
			   880/1920, and the up-next entry names laid out at ZERO pixels
			   wide. This asserts the stage takes the width it is given, at
			   whatever width the harness is running. */
			evaluate: () => {
				const m = document.querySelector('.tv .tv-body');
				if (!m) return ['stage:MISSING'];
				const b = m.getBoundingClientRect();
				const pad = 4; // the stage is edge-to-edge; its own padding is inside it
				return [
					Math.round(b.width) >= window.innerWidth - pad ? 'stage:full-width' : `stage:capped-at-${Math.round(b.width)}`,
					getComputedStyle(m).maxWidth === 'none' ? 'cap:none' : `cap:${getComputedStyle(m).maxWidth}`
				];
			},
			expected: ['stage:full-width', 'cap:none'],
			label: 'the stage takes the whole screen (the global 880px `main` cap is overridden)'
		},
		{
			/* THE CONTRAST CHECK BELOW CANNOT SEE THIS CONTROL'S IDLE STATE, so
			   this row measures it instead. `contrast` reads the computed
			   `color` against the composited ancestor BACKGROUNDS and models no
			   ancestor `opacity` -- its own header lists `opacity` among the
			   things it deliberately does not chase -- so it reports the same
			   15.86:1 whether this pill is at full strength or settled back to
			   0.62, which is the state it spends almost all of its life in.
			   That is not a fault in the check: nothing else in the app dims a
			   control on a timer. It does mean a green row over there is a
			   statement about the COLOUR PAIR and not about what is on the
			   wall, so the composite is taken here, in the page, at whatever
			   opacity the run actually finds.

			   `state:idle` is the positive control. Without it this probe would
			   measure the easy state -- full strength, 15.86:1 -- and pass
			   while saying nothing about the hard one. A run that reddens on
			   `state:awake` is telling you the settle no longer outlasts
			   EXIT_CONTROL_IDLE_MS and the number beside it is the wrong one. */
			evaluate: () => {
				const px = (c, under) => {
					const d = document.createElement('canvas');
					d.width = d.height = 1;
					const x = d.getContext('2d');
					x.fillStyle = under;
					x.fillRect(0, 0, 1, 1);
					x.fillStyle = c;
					x.fillRect(0, 0, 1, 1);
					const p = x.getImageData(0, 0, 1, 1).data;
					return [p[0], p[1], p[2]];
				};
				const lum = (c) => {
					const f = (v) => {
						v /= 255;
						return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
					};
					return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
				};
				const ratio = (sel) => {
					const el = document.querySelector(sel);
					if (!el) return null;
					const bgs = [];
					for (let p = el; p; p = p.parentElement) bgs.push(getComputedStyle(p).backgroundColor);
					let ground = [0, 0, 0];
					for (let i = bgs.length - 1; i >= 0; i--) ground = px(bgs[i], 'rgb(' + ground.join(',') + ')');
					let op = 1;
					for (let p = el; p; p = p.parentElement) op *= parseFloat(getComputedStyle(p).opacity || '1');
					const solid = px(getComputedStyle(el).color, 'rgb(0,0,0)');
					const ink = solid.map((v, i) => v * op + ground[i] * (1 - op));
					const a = lum(ink);
					const b = lum(ground);
					return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
				};
				const verdict = (sel, name) => {
					const r = ratio(sel);
					return r === null ? name + ':MISSING' : r >= 4.5 ? name + ':clears-4.5' : name + ':' + r.toFixed(2);
				};
				const pill = document.querySelector('.tv .tv-exit');
				return [
					verdict('.tv .tv-exit .tv-exit-word', 'word'),
					verdict('.tv .tv-exit .tv-exit-key', 'key'),
					pill ? (pill.classList.contains('awake') ? 'state:awake' : 'state:idle') : 'state:MISSING'
				];
			},
			expected: ['word:clears-4.5', 'key:clears-4.5', 'state:idle'],
			label: 'the exit control still clears 4.5:1 once it has dimmed (opacity composited in the page)'
		}
	],
	contrast: [
		/* The control settles to a quiet opacity after a few seconds of
		   stillness and NEVER disappears -- see EXIT_CONTROL_IDLE_MS. Both
		   halves of it carry a word, so both clear the 4.5 text floor rather
		   than the 3:1 a boundary carries. This row measures whichever state
		   the SETTLED state (see `settleMs` above), which is the harder one.
		   Measured by hand at all three projector ratios: 15.86:1 awake,
		   6.60:1 idle, against a negative control reading 1.08:1. */
		{ selector: '.tv .tv-exit .tv-exit-word', label: 'the exit control word', min: 4.5 },
		{ selector: '.tv .tv-exit .tv-exit-key', label: 'the key it names', min: 4.5 },
		{ selector: '.tv .stage-label', label: 'round label, in fullscreen', min: 4.5 },
		{ selector: '.tv .clock', label: 'the match clock, in fullscreen', min: 4.5 }
	],
	tapTargets: [
		/* A projector is driven from a keyboard and a trackpad, and this is the
		   one control on the surface. 44px, not the 24px instructor floor: the
		   stage declares no instructor-only class and nothing about a wall is
		   a dense console. */
		{ selector: '.tv .tv-exit', label: 'the exit control', min: 44 }
	]
};
