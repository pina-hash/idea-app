/* NO `order` EXPORT, deliberately -- see routes.mjs: that field belongs to the
   original 25 files only, and anything added since sorts after them by
   filename. */

/**
 * 0061 IN A REAL BROWSER: HOW MANY ROWS ONE COMPOSING SESSION WRITES.
 *
 * The report is a COUNT -- "i click save draft and instead of just saving one
 * draft it starts making infinite copies of that draft" -- and the two things
 * that produced it are both invisible to a type check and to a node test:
 *
 *   1. A draft save reset the composer. It dropped `createdItemId`, so the
 *      next press had no record to add to and created a second one, and it
 *      emptied every field, so the writing disappeared out of the box while
 *      the message said it had been saved. That is the second report from the
 *      same feedback pull -- "Homework progress didn't save" -- and it is the
 *      same line of code.
 *   2. `SaveState`'s durability net fires on `visibilitychange` and
 *      `pagehide` whenever the machine is `dirty`, and `dirty` includes
 *      `failed`. So a create the client read as failed was re-issued IN FULL
 *      on every tab switch, screen lock and navigation, with nobody having
 *      pressed anything. Any attempt that had actually committed became
 *      another copy.
 *
 * WHY A BROWSER AND NOT ONLY `tests/dom/`. The DOM project pins both counts
 * already (`tests/dom/composer-draft-checkpoint-mount.test.ts`) and that is
 * where the arithmetic belongs. What it cannot do is press a real button on a
 * real hydrated page: happy-dom has no layout engine, so the control's box is
 * a vacuous zero there and a click that landed on nothing would read exactly
 * like a click that worked. Here the presses are real clicks on a real
 * `ContentComposer` at 375 and 1440, and the counters are read off the page.
 *
 * THE ORACLE IS HERE, NOT IN THE PAGE. `/dev/composer-draft` renders the real
 * component and reports raw counts only -- creates, updates, and the rows a
 * database would be left holding. Every judgement below is made in this file.
 *
 * PAINT IS NOT INTERACTIVITY. `waitForApp` returns on DOM stability, which the
 * server-rendered markup satisfies before a single handler is attached, so the
 * first press is retried against its OWN effect (the create counter moving)
 * rather than after a fixed wait, and the runner prints the attempt count.
 */
const COUNT = `(id) => {
	const el = document.querySelector('[data-testid="' + id + '"]');
	return el ? el.textContent.trim() : id + '=absent';
}`;

export default {
	path: '/dev/composer-draft',
	label: 'Composer: one composing session writes one row, however many times Save draft is pressed',
	prepare: [
		/* Type a title, because an assignment with none is refused by 0085 and
		   a refusal would make every count below the count of nothing. */
		{
			evaluate: `() => {
				const f = document.querySelector('[data-testid="composer-here"] input[type="text"]');
				f.value = 'Bridge lab writeup';
				f.dispatchEvent(new Event('input', { bubbles: true }));
				return 'title=' + f.value;
			}`,
			waitMs: 150
		},
		/* PRESS ONE, RETRIED AGAINST ITS OWN EFFECT. The predicate is the thing
		   actually wanted -- a create was issued -- so a press that landed on
		   un-hydrated markup is retried rather than counted as a failure. */
		{
			click: '[data-testid="composer-draft-top"]',
			until: `() => /creates 1/.test(document.querySelector('[data-testid="count-creates"]').textContent)`,
			attempts: 12,
			waitMs: 250
		},
		/* FOUR MORE PRESSES. Five in total, which is well over the two that
		   would let "exactly one row" pass on a save that simply worked once. */
		{
			evaluate: `async () => {
				const btn = document.querySelector('[data-testid="composer-draft-top"]');
				for (let i = 0; i < 4; i++) {
					btn.click();
					await new Promise((r) => setTimeout(r, 250));
				}
				return 'pressed 4 more';
			}`,
			waitMs: 600
		},
		/* AND SIX TAB SWITCHES, which is the half nobody presses. */
		{
			evaluate: `async () => {
				const hide = document.querySelector('[data-testid="hide-tab"]');
				for (let i = 0; i < 6; i++) {
					hide.click();
					await new Promise((r) => setTimeout(r, 120));
				}
				return 'hid the tab 6 times';
			}`,
			waitMs: 500
		}
	],
	orderResult: [
		{
			evaluate: `() => {
				const count = ${COUNT};
				const field = document.querySelector('[data-testid="composer-here"] input[type="text"]');
				const msg = document.querySelector('[data-testid="composer-here"] p.feedback');
				return [
					count('count-rows'),
					count('count-creates'),
					count('count-updates'),
					'title=' + (field ? JSON.stringify(field.value) : 'absent'),
					'said=' + (msg ? (/updated \\(draft\\)/i.test(msg.textContent) ? 'updated-draft' : msg.textContent.trim()) : 'nothing')
				];
			}`,
			expected: [
				'rows 1',
				'creates 1',
				'updates 4',
				'title="Bridge lab writeup"',
				'said=updated-draft'
			],
			label:
				'five presses and six tab switches: ONE row, four updates of it, the writing still in the box'
		}
	],
	presence: [
		{
			selector: '[data-testid="composer-draft-top"]',
			label: 'the Save draft control under test',
			expectPresent: 1
		},
		{ selector: '[data-testid="call-log"] li', label: 'the write log', expectPresent: 5 }
	],
	contrast: [
		{ selector: '[data-testid="draft-counters"] .counter', label: 'the counters', min: 4.5 }
	],
	tapTargets: [
		{ selector: '[data-testid="composer-draft-top"]', label: 'Save draft' },
		{ selector: '[data-testid="hide-tab"]', label: 'Hide the tab' }
	]
};
