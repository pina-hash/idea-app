/* NO `order` EXPORT, deliberately -- see routes.mjs: that field belongs to the
   original 25 files only, and anything added since sorts after them by
   filename. */

/**
 * 0070 IN A REAL BROWSER: WHAT A DISCARDED TAB TAKES WITH IT.
 *
 * The report is "Homework progress didn't save", and the measurement behind it
 * was taken against the real `AssignmentEngine` before this bundle: sixty
 * characters typed at 110ms a character produced ZERO dispatches over 6694ms
 * and ZERO keys in `localStorage`. Every keystroke cancels and re-arms the
 * 800ms autosave debounce, so the window is not 800ms -- it is the whole of
 * the typing plus 800ms -- and for all of it the answer lives in one `$state`
 * record and nowhere else.
 *
 * WHY A BROWSER AND NOT ONLY `tests/dom/`. The DOM project pins the arithmetic
 * already (`tests/dom/assignment-mirror-mount.test.ts`) and that is where it
 * belongs. What it cannot do is type into a real hydrated textarea, hit a real
 * `localStorage` on a real origin, and then measure the recovery card's
 * CONTRAST and its Copy control's TAP TARGET -- happy-dom has no layout
 * engine, so every such read there is a vacuous zero. Those are the rows
 * below, at 375 and at 1440.
 *
 * THE ORACLE IS HERE, NOT IN THE PAGE. `/dev/assignment-mirror` renders the
 * real component and reports raw counts and raw storage only; every judgement
 * is made in this file.
 *
 * PAINT IS NOT INTERACTIVITY. `waitForApp` returns on DOM stability, which the
 * server-rendered markup satisfies before a single handler is attached, so
 * each step is retried against its OWN effect -- the mirror slot appearing,
 * the remount happening -- rather than after a fixed wait, and the runner
 * prints the attempt count.
 */
const COUNT = `(id) => {
	const el = document.querySelector('[data-testid="' + id + '"]');
	return el ? el.textContent.trim() : id + '=absent';
}`;

/**
 * TYPE THE ANSWER, RETRIED AGAINST ITS OWN EFFECT.
 *
 * PAINT IS NOT INTERACTIVITY, and this step is where that cost a real
 * measurement rather than a hypothetical one. `waitForApp` returns on DOM
 * stability, which the server-rendered markup satisfies before a single
 * handler is attached -- so on the FIRST page load after a cold `vite dev`
 * boot, where hydration is slowest, the keystrokes landed on un-hydrated
 * markup, `queueSave` never ran, nothing was ever dirty, and every check
 * downstream measured a state the run had not reached. Measured: 1 of 2 full
 * passes red at @375 (the first run of the pass) and green at @1440 (the
 * second), which is the signature of exactly that and of nothing else.
 *
 * AND THE `until` FIELD IS NOT THE ANSWER HERE. `run.mjs` judges an
 * `evaluate` step on whether it THREW; only a `click` step's `until` is
 * evaluated and reported. An `until` written on this step would sit in the
 * file looking like a guard and do nothing at all -- which is how this got
 * past a first reading.
 *
 * So the retry is INSIDE the step, against the one effect only a hydrated
 * engine produces (a mirror slot in this browser's storage), and it reports
 * the attempt count so a step that needed six is visible rather than silently
 * lucky. It THROWS when the effect never lands, because a step that quietly
 * gave up is the "honest reading of a state the run never reached" that
 * `prepareEvalResult` exists to stop.
 */
const TYPE = (text) => `async () => {
	const setter = Object.getOwnPropertyDescriptor(
		window.HTMLTextAreaElement.prototype, 'value'
	).set;
	const text = ${JSON.stringify(text)};
	const registered = () =>
		/in this browser [1-9]/.test(
			document.querySelector('[data-testid="count-slots"]').textContent
		);
	for (let attempt = 1; attempt <= 10; attempt++) {
		const ta = document.querySelector('[data-testid="engine-here"] textarea');
		if (ta) {
			for (let i = 1; i <= text.length; i++) {
				setter.call(ta, text.slice(0, i));
				ta.dispatchEvent(new Event('input', { bubbles: true }));
				await new Promise((r) => setTimeout(r, 25));
			}
			/* The mirror debounce is 400ms and the counter polls every 150ms. */
			for (let i = 0; i < 8; i++) {
				if (registered()) {
					return 'typed ' + text.length + ' characters, registered on attempt ' + attempt;
				}
				await new Promise((r) => setTimeout(r, 150));
			}
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error('typed ' + text.length + ' characters 10 times and the engine never registered one');
}`;

const ANSWER = 'The lower chord buckled first because it was in compression.';

export default {
	path: '/dev/assignment-mirror',
	label: 'Assignment mirror: a tab discarded mid-answer gives the answer back',
	prepare: [

		{ evaluate: TYPE(ANSWER), waitMs: 250 },
		/* BACKGROUND THE TAB, FORCED, AND THE ANNOTATION IS THE POINT.
		   `SaveState` flushes here and the harness never settles that write,
		   which is what a frozen page does to a request it has already sent.
		   But by the time the typing step above has retried its way to a
		   registered keystroke, the 800ms autosave debounce has usually fired
		   on its own -- so `dispatched 1` HOLDS AT REST and the runner
		   correctly refuses to count it (measured: 4 passes, the step reported
		   "the predicate ALREADY HELD" in 7 of 8 runs). There is no predicate
		   only this click can produce that is not the harness counting its own
		   presses, so it is forced, and the line says so. What the hide
		   actually guarantees -- that the mirror is written SYNCHRONOUSLY,
		   before the handler returns, where the save's fetch can be abandoned
		   -- is asserted in `tests/dom/assignment-mirror-mount.test.ts`, which
		   can hold the clock still. */
		{
			click: '[data-testid="hide-tab"]',
			force: true,
			until: `() => /dispatched [1-9]/.test(document.querySelector('[data-testid="count-dispatched"]').textContent)`,
			attempts: 12,
			waitMs: 250
		},
		/* AND THROW THE PAGE AWAY. The engine is remounted from nothing, with
		   the server still holding no answer -- the state a lost write leaves. */
		{
			click: '[data-testid="reload-page"]',
			until: `() => !!document.querySelector('[data-testid="engine-mirror-note"]')`,
			attempts: 12,
			waitMs: 250
		}
	],
	orderResult: [
		{
			evaluate: `() => {
				const count = ${COUNT};
				const ta = document.querySelector('[data-testid="engine-here"] textarea');
				const note = document.querySelector('[data-testid="engine-mirror-note"]');
				return [
					count('count-acknowledged'),
					'answer=' + (ta ? JSON.stringify(ta.value) : 'absent'),
					'said=' + (note && /put back from this browser/.test(note.textContent)
						? 'put-back'
						: (note ? note.textContent.trim().slice(0, 40) : 'nothing')),
					'claimed-saved=' + (note ? /has been saved|is saved\\b/.test(note.textContent) : 'no-note')
				];
			}`,
			expected: [
				'acknowledged 0',
				'answer=' + JSON.stringify(ANSWER),
				'said=put-back',
				'claimed-saved=false'
			],
			label:
				'nothing was ever acknowledged, the answer is back in the field, and the card says so without claiming it is saved'
		}
	],
	presence: [
		{
			selector: '[data-testid="engine-mirror-note"]',
			label: 'the recovery card',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			/* THE ABSENCE ROW, WITH ITS POSITIVE CONTROL ABOVE. A recovery with no
			   conflict must render no conflict list -- a card that always showed
			   one would read as "we could not put this back" on the ordinary
			   case, which is the recovery working. */
			selector: '[data-testid="engine-mirror-conflicts"]',
			label: 'the conflict list (absent when nothing conflicted)',
			expectPresent: 0
		},
		{
			selector: '[data-testid="engine-mirror-blocked"]',
			label: 'the storage-unavailable note (absent where storage works)',
			expectPresent: 0
		},
		{
			/* THE SLOT IS STILL THERE AFTER THE RECOVERY, and that is the rule
			   rather than a leftover: the restored answer has been marked dirty
			   and its write hangs, so the server has still not acknowledged it
			   and the copy that would survive a SECOND discard has to stay. It
			   goes when an acknowledgement arrives, which is
			   `tests/dom/assignment-mirror-mount.test.ts`'s second control. */
			selector: '[data-testid="slot-list"] .slot',
			label: 'the mirror slot (still held, because the recovery is not acknowledged either)',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	contrast: [
		{ selector: '[data-testid="engine-mirror-note"] .mirror-line', label: 'the recovery sentence', min: 4.5 },
		{ selector: '[data-testid="mirror-counters"] .counter', label: 'the counters', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="hide-tab"]', label: 'Hide the tab' },
		{ selector: '[data-testid="reload-page"]', label: 'Reload the page' },
		{ selector: '[data-testid="engine-here"] textarea', label: 'the answer field' }
	]
};
