/**
 * ANSWERS LEFT, AS A LIST THAT TAKES YOU THERE (ledger 0431, report cb6d42bc:
 * "i want to be able to click on answers left, see all the stuff remaining in a
 * list that i can then click each andswer and ill be taken to it").
 *
 * The REAL rail with `onjump`, the REAL frame over the REAL `/hx/worksheet`
 * fixture, a 1400px spacer between them so a jump has to scroll the page to be
 * seen working. The fixture answers `idea:focus` the way the authoring kit
 * does: it focuses the field without scrolling and reports its box, which is
 * what the parent scrolls to and rings. Nothing here reads into the frame.
 */
export default {
	path: '/dev/html-assignment-live',
	label: 'HTML assignment: Answers left lists what is owed and jumps to it',
	prepare: [
		{ waitFor: '() => window.__hxLive?.ready === true', attempts: 40, gapMs: 250 },
		{
			click: '.hxp [data-testid="hx-answers-left"]',
			until: '() => !!document.querySelector(\'[data-testid="hx-answers-left-list"]\')'
		},
		{
			click: '[data-testid="hx-answers-left-list"] [data-hx-left-field="reflection"]',
			until: '() => (window.__hxLive?.jumps ?? []).length >= 1',
			attempts: 20,
			gapMs: 200
		}
	],
	presence: [
		{ selector: '.hxp [data-testid="hx-answers-left"]', label: 'the Answers left control on the rail', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: '.hxp [data-testid="hxp-mod-open"]', label: 'the module chip that says answers are left is a button', expectPresent: 1, maxPresent: 1 },
		{ selector: '[data-testid="hx-focus-ring"]', label: 'the ring over the answer the jump landed on', expectPresent: 1, maxPresent: 1 },
		/* POSITIVE CONTROL: one frame, still the one the page mounted. */
		{ selector: 'iframe[data-hx-frame]', label: 'the worksheet frame', expectPresent: 1, maxPresent: 1 }
	],
	orderResult: [
		{
			label: 'the list is the rail\'s own unmet answers, and the jump reached the answer',
			evaluate: `() => { const s = window.__hxLive ?? {}; return ['left=' + (s.left ?? []).join(','), 'jumps=' + (s.jumps ?? []).join(',')]; }`,
			expected: ['left=reflection,checkedOff', 'jumps=reflection=answer']
		},
		{
			/* THE PAGE SCROLLED TO THE ANSWER: the ring is on screen, the frame's
			   top is far above the viewport's top only if the spacer was passed,
			   and the list closed behind the jump. */
			label: 'the jump scrolled the page so the answer is on screen, and closed the list',
			evaluate: `() => { const r = document.querySelector('[data-testid="hx-focus-ring"]'); if (!r) return ['NO RING']; const b = r.getBoundingClientRect(); return [b.top >= 0 && b.bottom <= innerHeight ? 'ring on screen' : 'ring at ' + Math.round(b.top) + '..' + Math.round(b.bottom) + ' of ' + innerHeight, scrollY > 1000 ? 'page scrolled past the spacer' : 'scrollY ' + Math.round(scrollY), document.querySelector('[data-testid="hx-answers-left-list"]') ? 'list still open' : 'list closed']; }`,
			expected: ['ring on screen', 'page scrolled past the spacer', 'list closed']
		},
		{
			/* FOCUS WENT INTO THE WORKSHEET, which is where the student types next. */
			label: 'focus moved into the worksheet frame',
			evaluate: `() => [document.activeElement?.matches?.('iframe[data-hx-frame]') ? 'frame focused' : 'focus on ' + (document.activeElement?.tagName ?? 'nothing')]`,
			expected: ['frame focused']
		}
	],
	tapTargets: [
		{ selector: '.hxp [data-testid="hx-answers-left"]', label: 'Answers left', min: 44 },
		{ selector: '.hxp [data-testid="hxp-mod-open"]', label: 'a module chip with answers left', min: 44 }
	],
	contrast: [{ selector: '.hxp [data-testid="hx-answers-left"]', label: 'Answers left', min: 4.5 }]
};
