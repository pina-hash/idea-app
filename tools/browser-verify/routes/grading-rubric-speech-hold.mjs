const ALIGN = "() => {\n\tconst area = document.querySelector(\"#grade-comment\");\n\tconst mirror = area?.closest('.dg-wrap')?.querySelector('.dg-mirror');\n\tif (!area || !mirror) return ['NO MIRROR OVER THE FIELD'];\n\tconst a = area.getBoundingClientRect(), b = mirror.getBoundingClientRect();\n\tconst off = Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));\n\tconst ca = getComputedStyle(area), cb = getComputedStyle(mirror);\n\tconst props = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'paddingTop', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'whiteSpace'];\n\tconst differ = props.filter((p) => ca[p] !== cb[p]);\n\tconst ghost = mirror.querySelector('.dg-ghost');\n\treturn [\n\t\toff <= 0.5 ? 'mirror box within 0.5px of the field' : 'MIRROR BOX OFF BY ' + off.toFixed(2) + 'px',\n\t\tdiffer.length ? 'METRICS DIFFER: ' + differ.map((p) => p + ' ' + ca[p] + ' vs ' + cb[p]).join('; ') : 'font, line height, padding and border equal',\n\t\tMath.abs(mirror.scrollTop - area.scrollTop) <= 1 ? 'mirror scrolled with the field' : 'SCROLL OFF: ' + mirror.scrollTop + ' vs ' + area.scrollTop,\n\t\tghost && ghost.textContent.includes('weld, but the fillet') && !area.value.includes('the fillet') ? 'the guess is drawn and not written' : 'GUESS ' + JSON.stringify(ghost && ghost.textContent) + ' VALUE ' + JSON.stringify(area.value)\n\t];\n}";
const INK = "() => {\n\tconst par = (c) => { const m = String(c).match(/[\\d.]+/g); return m ? m.map(Number) : null; };\n\tconst lum = (p) => { const f = (v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(p[0]) + 0.7152 * f(p[1]) + 0.0722 * f(p[2]); };\n\tconst ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };\n\tconst over = (fg, bg) => { const a = fg.length > 3 ? fg[3] : 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };\n\tconst area = document.querySelector(\"#grade-comment\");\n\tconst ghost = area?.closest('.dg-wrap')?.querySelector('.dg-ghost');\n\tif (!ghost || !area || !ghost.textContent.trim()) return ['NO GUESS ON SCREEN: the probe examined nothing'];\n\tlet n = area.parentElement, under = [0, 0, 0];\n\twhile (n && n !== document.documentElement) { const c = par(getComputedStyle(n).backgroundColor); if (c && (c.length < 4 || c[3] > 0.9)) { under = c.slice(0, 3); break; } n = n.parentElement; }\n\tconst cs = getComputedStyle(area);\n\tconst base = par(cs.backgroundColor);\n\tconst field = base ? over(base, under) : under;\n\tconst stops = [...String(cs.backgroundImage).matchAll(/rgba?\\([^)]+\\)/g)].map((m) => over(par(m[0]), field));\n\tconst grounds = [field, ...stops];\n\tconst inkc = par(getComputedStyle(ghost).color);\n\tlet worst = 99;\n\tfor (const g of grounds) worst = Math.min(worst, ratio(over(inkc, g), g));\n\treturn ['examined ' + grounds.length + ' ground(s) under the guess', worst >= 4.5 ? 'worst ' + worst.toFixed(2) + ':1 clears 4.5' : 'WORST ' + worst.toFixed(2) + ':1 FAILS 4.5'];\n}";

export default {
	path: '/dev/grading-rubric?speech=hold',
	label: 'Grading console: the comment being dictated, its words drawn grey over the box',
	/*
		REPORT 5ab3adb6 ON THE GRADING CONSOLE. The harness's `hold` script hears
		"clean weld, but the fillet" and never finishes on its own, so the
		words still being heard stay drawn over the comment box, where they will
		land, and are never written into it. The same three probes as the report
		box: the mirror sits exactly over the field, the guess is drawn and not
		written, and its ink clears 4.5:1 against the field's own ground.

		NO ABSOLUTE WIDTH IS QUOTED OFF THIS HARNESS: it does not set
		--cr-measure-route (CLAUDE.md), and every claim here is relative to the
		field itself, which is what alignment is.
	*/
	prepare: [
		{"waitFor": "() => document.querySelectorAll('[data-testid=\"console-pane\"] .roster-row').length === 3"},
		{"click": "[data-testid=\"console-pane\"] .roster-row:has-text(\"Alice Alvarez\")", "until": "() => !!document.querySelector('[data-testid=\"console-pane\"] .score-card')"},
		{
			click: '[data-testid="dictate-comment"]',
			until: '() => document.querySelector(\'[data-testid="dictate-comment"]\')?.getAttribute("aria-pressed") === "true"',
			attempts: 3,
			waitMs: 150
		},
		{
			evaluate: '() => {}',
			until: '() => (document.querySelector("#grade-comment")?.closest(".dg-wrap")?.querySelector(".dg-ghost")?.textContent ?? "").includes("weld, but the fillet")',
			attempts: 10,
			gapMs: 300
		}
	],
	presence: [
		{
			selector: '[data-testid="dictate-comment"][aria-pressed="true"]',
			label: 'the comment control, listening',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.grade-main .dg-mirror .dg-ghost',
			label: 'the guess over the comment box, and over nothing else',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		},
		{
			selector: '.dg-line',
			label: 'no fallback line under the field',
			expectPresent: 0
		}
	],
	textContains: [
		{
			selector: '[data-testid="dictate-comment"]',
			label: 'the word changed with the state',
			must: ['STOP'],
			mustNot: ['DICTATE']
		}
	],
	orderResult: [
		{
			label: 'the mirror sits exactly over the comment box, and the guess is not in it',
			evaluate: ALIGN,
			expected: [
				'mirror box within 0.5px of the field',
				'font, line height, padding and border equal',
				'mirror scrolled with the field',
				'the guess is drawn and not written'
			]
		},
		{
			label: 'the guess ink clears the comment box ground',
			evaluate: INK,
			/* MEASURED: the classroom plate paints the comment box with a gradient
			   over a colour, three grounds, and the lightest stop governs. */
			expected: ['examined 3 ground(s) under the guess', 'worst 6.82:1 clears 4.5']
		}
	],
	tapTargets: [{ selector: '[data-testid="dictate-comment"]', label: 'the comment STOP control', min: 44 }],
	motion: [
		{
			selector: '[data-testid="dictate-comment"]',
			label: 'the live dot pulses under no-preference and rests painted under reduce',
			expect: 'gated'
		}
	]
};
