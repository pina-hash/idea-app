const ALIGN = "() => {\n\tconst area = document.querySelector(\".crit-comment\");\n\tconst mirror = area?.closest('.dg-wrap')?.querySelector('.dg-mirror');\n\tif (!area || !mirror) return ['NO MIRROR OVER THE FIELD'];\n\tconst a = area.getBoundingClientRect(), b = mirror.getBoundingClientRect();\n\tconst off = Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top), Math.abs(a.width - b.width), Math.abs(a.height - b.height));\n\tconst ca = getComputedStyle(area), cb = getComputedStyle(mirror);\n\tconst props = ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'wordSpacing', 'paddingTop', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth', 'whiteSpace'];\n\tconst differ = props.filter((p) => ca[p] !== cb[p]);\n\tconst ghost = mirror.querySelector('.dg-ghost');\n\treturn [\n\t\toff <= 0.5 ? 'mirror box within 0.5px of the field' : 'MIRROR BOX OFF BY ' + off.toFixed(2) + 'px',\n\t\tdiffer.length ? 'METRICS DIFFER: ' + differ.map((p) => p + ' ' + ca[p] + ' vs ' + cb[p]).join('; ') : 'font, line height, padding and border equal',\n\t\tMath.abs(mirror.scrollTop - area.scrollTop) <= 1 ? 'mirror scrolled with the field' : 'SCROLL OFF: ' + mirror.scrollTop + ' vs ' + area.scrollTop,\n\t\tghost && ghost.textContent.includes('weld, but the fillet') && !area.value.includes('the fillet') ? 'the guess is drawn and not written' : 'GUESS ' + JSON.stringify(ghost && ghost.textContent) + ' VALUE ' + JSON.stringify(area.value)\n\t];\n}";

export default {
	path: '/dev/grading-rubric?speech=hold&field=crit',
	label: 'Grading console: a criterion note dictated, after a switch from the comment',
	/*
		THE SWITCH BETWEEN TWO FIELDS IS A QUEUE, AND THE OUTGOING FIELD'S LAST
		SENTENCE IS CLOSED THERE. Dictating into the comment, then pressing a
		criterion note's DICTATE: the `hold` script's stop finishes the words it
		was hearing (as a real service does), they land in the COMMENT with their
		period, and only then does the note start listening. The `field` query is
		ignored by the page; it only names this spec's file.
	*/
	prepare: [
		{"waitFor": "() => document.querySelectorAll('[data-testid=\"console-pane\"] .roster-row').length === 3"},
		{"click": "[data-testid=\"console-pane\"] .roster-row:has-text(\"Alice Alvarez\")", "until": "() => !!document.querySelector('[data-testid=\"console-pane\"] .score-card')"},
		{
			click: '[data-testid="dictate-comment"]',
			until: '() => (document.querySelector("#grade-comment")?.closest(".dg-wrap")?.querySelector(".dg-ghost")?.textContent ?? "").includes("the fillet")',
			attempts: 3,
			waitMs: 600
		},
		{
			click: '[data-testid="console-pane"] .override-toggle',
			until: '() => !!document.querySelector(\'[data-dictate-field^="crit:"]\')',
			attempts: 3,
			waitMs: 300
		},
		{
			click: '[data-dictate-field^="crit:"]',
			until: '() => document.querySelector(\'[data-dictate-field^="crit:"]\')?.getAttribute("aria-pressed") === "true" && (document.querySelector(".crit-comment")?.closest(".dg-wrap")?.querySelector(".dg-ghost")?.textContent ?? "").includes("the fillet")',
			attempts: 3,
			waitMs: 900
		}
	],
	orderResult: [
		{
			label: 'the comment got its sentence, closed, before the note started',
			evaluate: '() => [document.querySelector("#grade-comment").value, document.querySelector(\'[data-testid="dictate-comment"]\').getAttribute("aria-pressed")]',
			expected: ['Clean weld, but the fillet.', 'false']
		},
		{
			label: 'the mirror sits exactly over the criterion note',
			evaluate: ALIGN,
			expected: [
				'mirror box within 0.5px of the field',
				'font, line height, padding and border equal',
				'mirror scrolled with the field',
				'the guess is drawn and not written'
			]
		}
	],
	presence: [
		{
			selector: '[aria-pressed="true"][data-dictate-field]',
			label: 'exactly one field listening',
			expectPresent: 1,
			maxPresent: 1,
			expectVisible: 1
		}
	],
	tapTargets: [{ selector: '[data-dictate-field^="crit:"]', label: 'the criterion note STOP control', min: 44 }]
};
