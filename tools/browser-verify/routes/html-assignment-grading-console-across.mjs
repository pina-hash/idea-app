/**
 * THE CROSS-CLASS GRADING CONSOLE ON A PORTED WORKSHEET (ledger 0298, the
 * consistency follow-up to Tier A item 3).
 *
 * WHAT WAS WRONG. `/classroom/grading/<item>` handed the console no work
 * snippet, so with no spec its work column fell through to "Nothing handed in
 * yet" for a student who had typed every answer (and to an empty pane for one
 * whose only files hang off blocks), beside a roster chip that said Complete.
 * Both grade routes now mount the one `HtmlGradingWork`, and this harness
 * mounts the console the way the cross-class route does: a bulk transport
 * carrying `loadAcross`, no live bus, no close control.
 *
 * WHAT IS MEASURED, both directions on one fixture:
 *   - this IS the cross-class console: the "grade across every class" link,
 *     which only the per-class console carries, is absent (the default state
 *     of this harness is its positive control, where it is present);
 *   - Bruno, who has nothing stored, gets the empty worksheet in the read-only
 *     frame and the Responses heading, and NOT "Nothing handed in yet";
 *   - the roster still reads Alice Complete and Bruno Not submitted.
 */
import { ROSTER_STATES } from './_html-assignment-roster.mjs';

export default {
	path: '/dev/html-assignment-grading?console=across',
	label: 'Cross-class grading console: a ported worksheet shows the document, not "Nothing handed in yet"',
	prepare: [
		{ waitFor: `() => document.querySelectorAll('.roster-row').length > 1`, attempts: 40, gapMs: 250 },
		{
			evaluate: `() => { const r = [...document.querySelectorAll('.roster-row')].find((x) => x.textContent.includes('Bruno')); r?.click(); return r ? 'clicked' : 'no row'; }`,
			until: `() => (document.querySelector('.work-name')?.textContent || '').includes('Bruno') && !!document.querySelector('.hx-frame-wrap')`,
			attempts: 25,
			gapMs: 300
		}
	],
	orderResult: [
		{ label: 'Alice finished, Bruno has nothing', evaluate: ROSTER_STATES, expected: ['Alice Alvarez: Complete', 'Bruno Baptiste: Not submitted'] },
		{
			label: 'the work pane is Bruno\'s, and it is the document',
			evaluate: `() => [document.querySelector('.work-name')?.textContent.trim(), document.querySelectorAll('.hx-frame-wrap').length]`,
			expected: ['Bruno Baptiste', 1]
		}
	],
	presence: [
		{ selector: '[data-testid="cross-class-link"]', label: 'no link across (this is the cross-class console)', expectPresent: 0 },
		{ selector: '.hx-frame-wrap', label: 'the read-only worksheet', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.responses-label', label: 'the Responses heading', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '[data-testid="html-work-unavailable"], [data-testid="html-work-not-live"]', label: 'no unavailable or not-live sentence', expectPresent: 0 }
	],
	textContains: [
		{ selector: 'section.work', label: 'the work pane does not say nothing was handed in', must: ['Responses'], mustNot: ['Nothing handed in yet'] }
	],
	tapTargets: [{ selector: '.roster-row', label: 'roster rows' }]
};
