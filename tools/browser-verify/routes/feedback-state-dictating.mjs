/* The typed message: long enough to wrap and to scroll the field at both
   widths, so the mirror's wrapping and scrolling are measured against a field
   that actually wraps and scrolls rather than one short line. */
const TYPED =
	'I typed this first: on the grading page the export panel opened, I picked the spreadsheet, ' +
	'pressed download and nothing came down. I tried it again with the identity toggle off and with ' +
	'it on, I reloaded the page twice, and I asked the student next to me to try it on their laptop, ' +
	'which did the same thing. The other exports in the same panel all worked, the JSON pair and ' +
	'Download all files, so it is only the spreadsheet, and only since this morning, and';

/* The probes, as page-side source. Each returns an array of words, never a
   number that changes with the width: the expected arrays below are the same
   at 375 and at 1440. */
const ALIGN = `() => {
	const area = document.querySelector('#fb-msg');
	const mirror = document.querySelector('.dg-mirror');
	if (!area || !mirror) return ['NO MIRROR OVER THE FIELD'];
	const a = area.getBoundingClientRect(), b = mirror.getBoundingClientRect();
	const off = Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
	const ca = getComputedStyle(area), cb = getComputedStyle(mirror);
	const props = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'paddingTop', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'whiteSpace'];
	const differ = props.filter((p) => ca[p] !== cb[p]);
	return [
		off <= 0.5 ? 'mirror box within 0.5px of the field' : 'MIRROR BOX OFF BY ' + off.toFixed(2) + 'px',
		differ.length ? 'METRICS DIFFER: ' + differ.map((p) => p + ' ' + ca[p] + ' vs ' + cb[p]).join('; ') : 'font, line height, padding and border equal',
		Math.abs(mirror.scrollTop - area.scrollTop) <= 1 ? 'mirror scrolled with the field' : 'SCROLL OFF: ' + mirror.scrollTop + ' vs ' + area.scrollTop
	];
}`;

/* THE WRAP: a copy of the mirror WITHOUT the guess must be exactly as tall as
   the field's own text, which is only true when every line breaks where the
   field's do. The field must actually scroll, or the comparison is two equal
   box heights and proves nothing. */
const WRAP = `() => {
	const area = document.querySelector('#fb-msg');
	const mirror = document.querySelector('.dg-mirror');
	if (!area || !mirror) return ['NO MIRROR OVER THE FIELD'];
	const copy = mirror.cloneNode(true);
	copy.querySelector('.dg-ghost')?.remove();
	copy.style.visibility = 'hidden';
	copy.style.paddingBottom = getComputedStyle(area).paddingBottom;
	mirror.parentElement.appendChild(copy);
	const h = copy.scrollHeight;
	copy.remove();
	const own = area.scrollHeight;
	return [
		own > area.clientHeight ? 'the field scrolls (its text is taller than its box)' : 'THE FIELD DOES NOT SCROLL: nothing is being compared',
		Math.abs(h - own) <= 1 ? 'the mirror wraps the field text onto the same lines' : 'WRAP DIFFERS: ' + h + ' vs ' + own
	];
}`;

/* THE GUESS INK AGAINST THE FIELD'S OWN GROUND, every gradient stop. The
   plate paints a textarea with a gradient over a colour, which the ancestor
   walk of the contrast check cannot see through; this composites the field's
   own computed values instead and reports the worst pair and how many it
   examined (a probe that examined nothing would otherwise read as perfect). */
const GHOST_INK = `() => {
	const par = (c) => { const m = String(c).match(/[\\d.]+/g); return m ? m.map(Number) : null; };
	const lum = (p) => { const f = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); };
	const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
	const over = (fg, bg) => { const a = fg.length > 3 ? fg[3] : 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };
	const ghost = document.querySelector('.dg-ghost');
	const area = document.querySelector('#fb-msg');
	if (!ghost || !area || !ghost.textContent.trim()) return ['NO GUESS ON SCREEN: the probe examined nothing'];
	let n = area.parentElement, under = [0, 0, 0];
	while (n && n !== document.documentElement) { const c = par(getComputedStyle(n).backgroundColor); if (c && (c.length < 4 || c[3] > 0.9)) { under = c.slice(0, 3); break; } n = n.parentElement; }
	const cs = getComputedStyle(area);
	const base = par(cs.backgroundColor);
	const field = base ? over(base, under) : under;
	const stops = [...String(cs.backgroundImage).matchAll(/rgba?\\([^)]+\\)/g)].map((m) => over(par(m[0]), field));
	const grounds = [field, ...stops];
	const ink = par(getComputedStyle(ghost).color);
	let worst = 99;
	for (const g of grounds) worst = Math.min(worst, ratio(over(ink, g), g));
	return ['examined ' + grounds.length + ' ground(s) under the guess', worst >= 4.5 ? 'worst ' + worst.toFixed(2) + ':1 clears 4.5' : 'WORST ' + worst.toFixed(2) + ':1 FAILS 4.5'];
}`;

/* NEVER WRITTEN: the guess is on screen and is not in the value. */
const NEVER_WRITTEN = `() => {
	const area = document.querySelector('#fb-msg');
	const ghost = document.querySelector('.dg-ghost');
	return [
		ghost && ghost.textContent === '. Then the page' ? 'the guess reads ". Then the page", period first' : 'GUESS READS ' + JSON.stringify(ghost && ghost.textContent),
		area && !area.value.includes('then the page') && !area.value.includes('Then the page') ? 'the guess is not in the field value' : 'THE GUESS WAS WRITTEN INTO THE FIELD',
		area && area.value.endsWith(' the launch button did nothing') ? 'the committed sentence is open: no period yet' : 'VALUE ENDS ' + JSON.stringify(area && area.value.slice(-40))
	];
}`;

export default {
	path: '/dev/feedback?state=dictating',
	label: 'Report affordance, box open and LISTENING: the dictate control mid-session',
	/*
		THE SAME BOX AS feedback.mjs, ONE PRESS FURTHER IN. The harness's
		scripted recogniser (mode "transcribes a sentence", the default) answers
		start() with an interim fragment at 350ms, a final sentence at 900ms and
		a second phrase heard from 2600ms that it never finishes, so pressing
		DICTATE puts the control into its listening state for real: the word
		becomes STOP, a live dot and the loudness bars appear beside it (the
		harness hands the box a stand-in meter, no microphone), the status line
		says what listening means here, and the words still being heard are drawn
		GREY OVER THE FIELD, where they will land (report 5ab3adb6). Every one of
		those is a thing that could silently stop being true, which is why the
		state is measured and not only the control.

		WHAT IS ASSERTED ABOUT THE RULE ITSELF: the field is filled BEFORE the
		press and read AFTER the final sentence lands, and the typed text must
		still be its prefix (prompt 0111's never-overwrite rule, measured in the
		browser the way tests/dom/feedback-dictation-mount measures it under
		happy-dom). And the guess is never in the value.

		THE GREY IS A MIRROR, AND ITS ALIGNMENT IS THE CLAIM. Three probes: the
		mirror's box and metrics equal the field's; a copy of it without the
		guess is exactly as tall as the field's text (so every line breaks where
		the field's does, on a message long enough to wrap and scroll); and the
		guess ink clears 4.5:1 against the field's OWN ground, every gradient
		stop composited, because the plate paints a textarea with a gradient the
		ancestor-walking contrast check cannot see through.

		THE DOT AND THE BARS ARE WHAT ANIMATE. The dot pulses and the bars scale
		under no-preference; under reduce the dot rests painted at full opacity
		and the bars rest at a still height with no transform. `expect: 'gated'`
		is both halves in one row.
	*/
	prepare: [
		{
			click: '.sfb-relocated .sfb-trigger',
			until: '() => { const t = document.querySelector("#fb-msg"); return !!t && t.getBoundingClientRect().height > 0; }',
			attempts: 8,
			waitMs: 300
		},
		{
			/* Type first, through the same input event a person's typing raises,
			   so `bind:value` and `oninput` both see it. */
			evaluate: `() => { const t = document.querySelector("#fb-msg"); t.value = ${JSON.stringify(TYPED)}; t.dispatchEvent(new Event("input", { bubbles: true })); }`,
			until: `() => document.querySelector("#fb-msg").value === ${JSON.stringify(TYPED)}`,
			attempts: 3,
			waitMs: 100
		},
		{
			/* Press DICTATE ONCE. The control is a TOGGLE: a click step whose
			   predicate was "the sentence landed" re-clicked at 400ms, which is
			   STOP (measured, the first full run). So this predicate is the
			   pressed state and the sentence is waited on below. */
			click: '.fb-dictate',
			until: '() => document.querySelector(".fb-dictate")?.getAttribute("aria-pressed") === "true"',
			attempts: 3,
			waitMs: 150
		},
		{
			/* The final sentence lands AFTER what was typed: the prefix rule. */
			evaluate: '() => {}',
			until: `() => { const v = document.querySelector("#fb-msg").value; return v.startsWith(${JSON.stringify(TYPED)}) && v.endsWith(" the launch button did nothing"); }`,
			attempts: 8,
			gapMs: 300
		},
		{
			/* Then the second phrase is heard and drawn grey over the field. */
			evaluate: '() => {}',
			until: '() => (document.querySelector(".dg-ghost")?.textContent ?? "").includes("Then the page")',
			attempts: 10,
			gapMs: 300
		}
	],
	presence: [
		{
			selector: '.fb-dictate[aria-pressed="true"]',
			label: 'the control in its pressed (listening) state',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fb-dictate-dot',
			label: 'the live dot beside the word STOP',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fb-dictate [data-dictation-level]',
			label: 'the loudness bars beside the dot (the harness meter)',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.fb-dictate-status',
			label: 'the status line',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.dg-mirror .dg-ghost',
			label: 'the guess, drawn over the field',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			/* The fallback line under the field is for a field with no layout;
			   with one, the mirror lines up and the line never renders. */
			selector: '.dg-line',
			label: 'no fallback line under the field',
			expectPresent: 0
		},
		{
			/* The scripted recogniser never refuses in this mode. */
			selector: '.fb-dictate-error',
			label: 'no refusal while transcribing',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '.fb-dictate',
			label: 'the word changed with the state',
			must: ['STOP'],
			mustNot: ['DICTATE']
		},
		{
			selector: '.fb-dictate-status',
			label: 'the status says what listening means here, on a computer',
			must: ['Listening', 'pauses are fine', 'Escape']
		},
		{
			selector: '.fb-dictate-keys',
			label: 'the dictation key, in words',
			must: ['Shift+Space', 'starts and stops dictation']
		}
	],
	orderResult: [
		{
			label: 'the guess is drawn, period first, and never written into the field',
			evaluate: NEVER_WRITTEN,
			expected: [
				'the guess reads ". Then the page", period first',
				'the guess is not in the field value',
				'the committed sentence is open: no period yet'
			]
		},
		{
			label: 'the mirror sits exactly over the field',
			evaluate: ALIGN,
			expected: [
				'mirror box within 0.5px of the field',
				'font, line height, padding and border equal',
				'mirror scrolled with the field'
			]
		},
		{
			label: 'the mirror breaks lines where the field does',
			evaluate: WRAP,
			expected: [
				'the field scrolls (its text is taller than its box)',
				'the mirror wraps the field text onto the same lines'
			]
		},
		{
			label: 'the guess ink clears its own field ground',
			evaluate: GHOST_INK,
			/* MEASURED, written down so a regression moves it. This harness is not
			   plated (the box's own --fb-field ground, one ground); the plated
			   field, gradient and all, in every theme, is
			   home-order-dictation-ink.mjs. */
			expected: ['examined 1 ground(s) under the guess', 'worst 5.51:1 clears 4.5']
		}
	],
	contrast: [
		{ selector: '.fb-dictate', label: 'STOP, on the listening control', min: 4.5 },
		{ selector: '.fb-dictate-status', label: 'the status line', min: 4.5 },
		{ selector: '.fb-dictate-keys', label: 'the dictation key line', min: 4.5 }
	],
	tapTargets: [{ selector: '.fb-dictate', label: 'the control while listening', min: 44 }],
	motion: [
		{
			selector: '.fb-dictate',
			label: 'the live dot and the bars: move under no-preference, rest painted under reduce',
			expect: 'gated'
		}
	]
};
