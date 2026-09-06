/* NO `order` EXPORT, deliberately -- see routes.mjs. */

/**
 * 0070, THE BRANCH THAT MUST NOT SILENTLY OVERWRITE ANYTHING.
 *
 * A mirror differing from the server is TWO different situations wanting
 * opposite outcomes: an answer the server never received, or an answer the
 * server has since replaced with a newer one. `planAssignmentRestore` separates
 * them on the baseline the mirror recorded, and the second case is the one with
 * teeth -- putting an older local copy over newer saved work is data loss
 * dressed as a recovery.
 *
 * So on a conflict the SAVED answer stays on screen, nothing is dispatched, and
 * the copy this browser kept is rendered as selectable text with its own Copy
 * control. That control's geometry and that text's contrast are exactly what
 * `tests/dom/` cannot measure -- happy-dom has no layout engine -- and they are
 * the affordance the whole "nothing was thrown away" claim rests on, so they
 * are measured here at 375 and at 1440.
 *
 * `aliasOf` names the same dev page: this is a STATE of it, reached by the
 * prepare steps, not a second route.
 */

const ANSWER = 'Typed on the phone, and never saved.';

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

export default {
	path: '/dev/assignment-mirror?state=conflict',
	aliasOf: '/dev/assignment-mirror',
	label: 'Assignment mirror: a newer saved answer is never overwritten, and the local copy is handed back',
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
		/* Meanwhile the student carried on somewhere else, and THAT answer
		   reached the server. */
		{
			click: '[data-testid="server-moved"]',
			until: `() => /Written on the laptop/.test(document.querySelector('[data-testid="server-state"]').textContent)`,
			attempts: 12,
			waitMs: 250
		},
		{
			click: '[data-testid="reload-page"]',
			until: `() => !!document.querySelector('[data-testid="engine-mirror-conflicts"]')`,
			attempts: 12,
			waitMs: 250
		}
	],
	orderResult: [
		{
			evaluate: `() => {
				const ta = document.querySelector('[data-testid="engine-here"] textarea');
				const note = document.querySelector('[data-testid="engine-mirror-note"]');
				const list = document.querySelector('[data-testid="engine-mirror-conflicts"]');
				const ack = document.querySelector('[data-testid="count-acknowledged"]');
				return [
					'field=' + (ta ? JSON.stringify(ta.value) : 'absent'),
					'kept=' + (list && list.textContent.includes(${JSON.stringify(ANSWER)}) ? 'yes' : 'no'),
					'said=' + (note && /NOT put back/.test(note.textContent) ? 'not-put-back' : 'other'),
					(ack ? ack.textContent.trim() : 'absent')
				];
			}`,
			expected: [
				'field="Written on the laptop, and saved."',
				'kept=yes',
				'said=not-put-back',
				'acknowledged 0'
			],
			label:
				'the SAVED answer is in the field, the browser copy is on screen rather than dropped, and nothing was written over it'
		}
	],
	presence: [
		{
			selector: '[data-testid="engine-mirror-conflicts"] .conflict',
			label: 'the conflicted answer, handed back',
			expectPresent: 1,
			expectVisible: 1
		},
		{
			selector: '[data-testid="engine-mirror-copy"]',
			label: 'the Copy control on it',
			expectPresent: 1,
			expectVisible: 1
		}
	],
	contrast: [
		{
			selector: '[data-testid="engine-mirror-conflicts"] .conflict-text',
			label: "the browser's copy of the answer",
			min: 4.5
		},
		{
			selector: '[data-testid="engine-mirror-conflicts"] .conflict-where',
			label: 'which question it belongs to',
			min: 4.5
		}
	],
	tapTargets: [{ selector: '[data-testid="engine-mirror-copy"]', label: 'Copy' }]
};
