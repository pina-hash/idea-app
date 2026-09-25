/**
 * THE INJECTED REPORT CONTROL ON THE BLADE RULEBOOK, THE ONE ASSIGNMENT PAGE
 * THAT HIDES THE MOUSE POINTER (ledger 0298 review of report 20).
 *
 * `IDEA-Blade_Rulebook_v2_2.html` sets `*,*::before,*::after{cursor:none}` and
 * draws its own dot at z-index 99999. The injected panel sits above that, so
 * before the fix every element in the box -- the scrim, the card, the text
 * field -- and the word on the trigger computed `cursor: none`, and a desktop
 * reader lost the pointer the moment the box opened. The panel now carries an
 * id-scoped `cursor` rule that outranks the page's universal one.
 *
 * WHAT IS READ: that the page really does hide its own cursor (the positive
 * control, without which a zero proves nothing), that no element of the
 * control or the box computes `cursor: none`, and that Escape closes the box
 * and hands focus back to Report (the box is reopened afterwards so any read
 * after this one still has it).
 */
import { openPanel, TRIGGER_FACTS, TRIGGER_FACTS_EXPECTED } from './_legacy-report.mjs';

export default {
	path: '/dev/feedback/assignment?slug=IDEA-Blade_Rulebook_v2_2&signedIn=0',
	label: 'Blade Rulebook (hides its own cursor): the report box keeps a visible pointer, and Escape closes it',
	prepare: [
		{ waitFor: '() => !!document.getElementById("idea-legacy-report-btn")', timeoutMs: 20000, label: 'the injected trigger has mounted' },
		openPanel(`() => !!document.querySelector('#idea-legacy-report input[type="text"]')`)
	],
	presence: [
		{ selector: '#idea-legacy-report-btn', label: 'the floating Report control', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '#idea-legacy-report', label: 'the report panel, once opened', expectPresent: 1, maxPresent: 1, expectVisible: 1 }
	],
	contrast: [
		{ selector: '#idea-legacy-report-btn span', label: 'the Report word on the floating control', min: 4.5 },
		{ selector: '#idea-legacy-report > div > div:nth-child(2)', label: 'the panel note', min: 4.5 }
	],
	tapTargets: [
		{ selector: '#idea-legacy-report-btn', label: 'the floating Report control', min: 44 },
		{ selector: '#idea-legacy-report button', label: 'every control inside the panel', min: 44 }
	],
	orderResult: [
		{
			label: 'the control answers a tap at its centre, its edge clears 3:1 on the page, and the panel took the page palette',
			evaluate: TRIGGER_FACTS,
			expected: TRIGGER_FACTS_EXPECTED
		},
		{
			label: 'the page hides its own cursor, and nothing in the report control or box does',
			evaluate: `() => {
				const p = document.getElementById('idea-legacy-report');
				const t = document.getElementById('idea-legacy-report-btn');
				if (!p || !t) return ['NO PANEL OR TRIGGER'];
				const els = [p, ...p.querySelectorAll('*'), t, ...t.querySelectorAll('*')];
				const hidden = els.filter((el) => getComputedStyle(el).cursor === 'none').length;
				return [
					getComputedStyle(document.body).cursor === 'none' ? 'the page hides its own cursor' : 'THE PAGE DOES NOT HIDE ITS CURSOR (the fixture lost its point)',
					hidden === 0 ? 'no element of the report control or box hides the pointer' : hidden + ' OF ' + els.length + ' ELEMENTS HIDE THE POINTER'
				];
			}`,
			expected: ['the page hides its own cursor', 'no element of the report control or box hides the pointer']
		},
		{
			label: 'Escape in the box closes it and hands focus back to Report',
			evaluate: `() => {
				const p = document.getElementById('idea-legacy-report');
				const t = document.getElementById('idea-legacy-report-btn');
				if (!p || !t) return ['NO PANEL OR TRIGGER'];
				const ta = p.querySelector('textarea');
				ta.focus();
				ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
				const closed = getComputedStyle(p).display === 'none';
				const back = document.activeElement === t;
				t.click();
				return [closed ? 'Escape closes the box' : 'ESCAPE LEFT THE BOX OPEN', back ? 'focus returns to Report' : 'FOCUS DID NOT RETURN TO REPORT'];
			}`,
			expected: ['Escape closes the box', 'focus returns to Report']
		}
	]
};
