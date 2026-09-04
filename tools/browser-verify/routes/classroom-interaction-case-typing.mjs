/* NO `order` EXPORT, deliberately -- see routes.mjs: that field belongs to the
   original 25 files only, and anything added since sorts after them by
   filename. */

/**
 * PROMPT 0012'S ONE DEFECT THAT ONLY A BROWSER CAN SEE.
 *
 * Reported by an instructor as: "Occasionally, while starting to type, random
 * modules or other drop down menus will suddenly minimize and entirely throw
 * the viewing to the bottom of the page. Also it deselects the text box."
 *
 * The mechanism, measured on the real components rather than reasoned about: a
 * `Disclosure`'s `collapseWhen` is read LIVE, and `SpecRenderer` derives both
 * of the ones on an assignment (`complete` on the module body, `started` on the
 * instructions) from the responses being typed. The region is hidden with
 * `display: none`, so the moment the signal flips the browser BLURS whatever
 * inside it had focus and the document loses that region's height, at which
 * point the scroll position is clamped to the new bottom. All three reported
 * symptoms are that one line, and they arrive together on a single character.
 *
 * WHY NEITHER LOCAL CHECK CATCHES IT. `svelte-check` reports 0 errors and 37
 * warnings across the defect -- it is valid Svelte. `tests/dom/` cannot either:
 * happy-dom has no layout engine, so nothing there blurs on a hide and there is
 * no scroll position to lose (see tests/dom/mount.ts). Worse, the two
 * `tests/dom/` files that DO exercise this path pin the defect as intended
 * behaviour -- `disclosure-instructions-collapse-mount.test.ts` has a case
 * literally named "POSITIVE CONTROL: the identical typing collapses a panel
 * nobody chose". A green suite is exactly what this defect has always had.
 *
 * ============================================================================
 * IT WAS RED ON THE TREE THAT SHIPPED IT. IT IS GREEN NOW, AND THAT IS THE
 * FIX LANDING RATHER THAN THE CHECK STOPPING.
 * ============================================================================
 * Prompt 0012 shipped these four measurements red on purpose: it owned the
 * spec and not `src/lib/Disclosure.svelte`. Prompt 0018 landed the fix there
 * -- `collapseWhen` LATCHED per panel, falling and never rising -- and all
 * four went green with nothing here edited, which is the shape a finding
 * should have. Re-verified by this bundle rather than taken on trust: with
 * that one line reverted to reading the signal live, the same four
 * measurements redden again at both widths ("module=false",
 * "focus=lost-to-body", "region=removed-332px-from-the-document",
 * "field=hidden"), and the arrival row added below stays green.
 * `npm run verify:browser` exits 0 with findings by design, so neither state
 * ever blocked a deploy.
 *
 * THE ORACLE IS HERE, NOT IN THE PAGE. `/dev/classroom-interaction` renders the
 * real `ItemDetail` and reports raw DOM facts only; every judgement below is
 * made in this file against a baseline this file stashed, so the harness cannot
 * satisfy an assertion by agreeing with itself.
 *
 * ONE OF THE FIVE DOES NOT DISCRIMINATE HERE, AND IT SAYS SO RATHER THAN BEING
 * QUIETLY DROPPED. `scroll=` reads `held` both with the defect and without it,
 * because synthetic `input` events do not make Chromium scroll a caret into
 * view: driven with REAL key events instead (playwright's `keyboard.type`, in
 * the raw reproduction recorded in this bundle's history entry) the same
 * sequence measured scrollY 1024 -> 1471 with the defect and 1024 -> 1024 with
 * the fix, which is the reported "throw the viewing to the bottom of the page".
 * What DOES discriminate from here is `region=`, which is that symptom's cause:
 * the disclosure's own body stops taking any height at all, and the scroll only
 * moves because it does. The assertion is kept as the thing actually wanted,
 * with its cause measured beside it.
 *
 * `region=` MEASURES THE DISCLOSURE'S BODY AND NOT THE DOCUMENT, and the first
 * draft measured the document. That was wrong in a way only the positive
 * control found: SpecRenderer's answer fields auto-resize, so the page
 * legitimately loses 136px at 1440 while typing with the fix in place, against
 * 468px with the defect. A document-height assertion therefore reddened on
 * BOTH trees and told the two apart only by a magic number. The region either
 * has a box or it does not.
 */
export default {
	path: '/dev/classroom-interaction?case=typing',
	label: 'Classroom: one keystroke must not fold a panel, drop focus or move the page',
	prepare: [
		/* HYDRATION, NOT A TIMER. `waitForApp` returns on DOM stability, which
		   the server-rendered markup satisfies BEFORE any handler is attached,
		   so a press here can land on a page that is not yet interactive. The
		   predicate is the EFFECT wanted -- this element genuinely holds focus --
		   and the runner prints the attempt count and the elapsed time, so the
		   gap between paint and interactivity is visible rather than papered
		   over with a fixed wait. */
		{
			click: 'textarea#tf-tf2',
			until: '() => document.activeElement === document.querySelector("textarea#tf-tf2")',
			attempts: 12,
			waitMs: 250
		},
		/* Put the module mid-viewport so there is a scroll position to lose, and
		   stash the baseline THIS FILE will compare against. */
		{
			evaluate: `() => {
				document
					.querySelector('[data-testid="module-body"]')
					.scrollIntoView({ block: 'center', behavior: 'instant' });
				const ta = document.querySelector('textarea#tf-tf2');
				ta.focus();
				const region = document.querySelector('#' + document
					.querySelector('[data-testid="module-body"]')
					.getAttribute('aria-controls'));
				/* THE ARRIVAL STATE, STASHED BEFORE A CHARACTER IS TYPED. This is
				   the oracle for the guard the fresh case cannot supply -- see
				   the arrival row under orderResult below for the whole
				   argument. It has to be read HERE, in the last step before the
				   keystrokes, because every check runs after them.
				   NO BACKTICKS IN THIS COMMENT: it lives inside a template
				   literal, so one would close the string and the module would
				   stop parsing (measured -- it did). */
				const at = (id) => {
					const el = document.querySelector('[data-testid="' + id + '"]');
					return id + '=' + (el ? el.getAttribute('aria-expanded') : 'absent');
				};
				window.__ci0 = {
					arrival: [at('module-body'), at('module-instructions'), at('item-body-disclosure')],
					scrollY: Math.round(window.scrollY),
					docH: Math.round(document.documentElement.scrollHeight),
					regionH: Math.round(region.getBoundingClientRect().height),
					focused: document.activeElement === ta,
					module: document.querySelector('[data-testid="module-body"]').getAttribute('aria-expanded')
				};
				return JSON.stringify(window.__ci0);
			}`,
			waitMs: 300
		},
		/* THE KEYSTROKES, ONE AT A TIME, AND THE PACING IS LOAD-BEARING. Setting
		   the value and dispatching `input` is the same path a typed character
		   takes into the engine's state, and it does not itself blur anything --
		   so a focus loss measured afterwards is the collapse's doing and nothing
		   else's. Writing the whole string in ONE event was measured folding the
		   panel and dropping focus but leaving `scrollY` where it was: the
		   collapse lands with the caret already at the end, and the scroll had
		   room. A person types into the middle of a sentence, the module completes
		   part-way through, and Chromium's scroll anchoring then moves the page
		   under them -- which is the "throw the viewing to the bottom" half of the
		   report and the half a single write cannot produce. The fixture already
		   carries an answer in the module's OTHER constrained block, so this is
		   the field that takes it from 1/2 to 2/2 and trips `complete`. */
		{
			evaluate: `async () => {
				const ta = document.querySelector('textarea#tf-tf2');
				const text = 'Thicken the gusset and add a rib along the top chord.';
				for (const ch of text) {
					ta.value += ch;
					ta.dispatchEvent(new Event('input', { bubbles: true }));
					await new Promise((r) => setTimeout(r, 8));
				}
				return 'typed ' + ta.value.length + ' chars into tf-tf2, one at a time';
			}`,
			waitMs: 700
		}
	],
	orderResult: [
		{
			/* ============================================================
			   THE GUARD `?case=fresh` CANNOT SUPPLY, ON THE SPEC THAT CAN.
			   ============================================================
			   `classroom-interaction-case-fresh.mjs` exists to refuse the
			   cheapest wrong fix for the typing collapse -- ignoring
			   `collapseWhen` outright -- and it CANNOT. Measured, not reasoned:
			   with `Disclosure`'s `collapsed` forced to `false`, both browser
			   cases came back 0 outside threshold, at both widths. The fixture
			   is why. `?case=fresh` answers nothing, so every `collapseWhen` on
			   that page is already false at arrival and "all three panels are
			   open" reads the same whether a false signal was honoured or the
			   signal was ignored. No assertion written against that page can
			   separate them, and the file's own header claimed a guard it could
			   not hold.

			   `?case=typing` CAN, because its fixture answers one of the two
			   constrained blocks, so the module is `started` and two panels
			   arrive with `collapseWhen` genuinely TRUE. Measured at both
			   widths across three states of `src/lib/Disclosure.svelte`:

			     arrival on ?case=typing   module-body  instructions  item-body
			     the fix as shipped        true         false         false
			     collapseWhen ignored      true         TRUE          TRUE
			     the fix reverted (live)   true         false         false

			   So this row reddens on exactly the mutation the fresh case was
			   built to refuse, and stays green on the one the typing rows below
			   already catch -- which reddened 4 measurements and left this row
			   untouched. Two mutations, two rows, no overlap: the pair
			   discriminates rather than measuring one thing twice.

			   IT READS THE STASH, NOT THE LIVE DOM. Every check runs after the
			   keystrokes, and after them the fix and the mutation agree again
			   (nothing closes an open panel under either). Arrival is the only
			   moment they differ, so arrival is what the prepare step above
			   records. `module-body` is carried even though it never moves: it
			   is the positive control that says the three testids resolved at
			   all, so an `absent` from a renamed hook reddens instead of
			   reading as a passing absence. */
			evaluate: `() => (window.__ci0 && window.__ci0.arrival) || ['NO ARRIVAL STASHED']`,
			expected: ['module-body=true', 'module-instructions=false', 'item-body-disclosure=false'],
			label: 'arrival on started work: the module open, its instructions and the item body collapsed'
		},
		{
			evaluate: `() => {
				const before = window.__ci0 || {};
				const ta = document.querySelector('textarea#tf-tf2');
				const mod = document.querySelector('[data-testid="module-body"]');
				const active = document.activeElement;
				return [
					'module=' + (mod ? mod.getAttribute('aria-expanded') : 'absent'),
					'focus=' + (active === ta ? 'kept' : 'lost-to-' + (active ? active.tagName.toLowerCase() : 'nothing')),
					'scroll=' + (Math.round(window.scrollY) === before.scrollY
						? 'held'
						: 'moved-by-' + (Math.round(window.scrollY) - before.scrollY)),
					'region=' + ((mod && document.querySelector('#' + mod.getAttribute('aria-controls'))
						.getBoundingClientRect().height > 0)
						? 'kept'
						: 'removed-' + before.regionH + 'px-from-the-document'),
					'field=' + (ta && ta.getBoundingClientRect().height > 0 ? 'visible' : 'hidden')
				];
			}`,
			expected: ['module=true', 'focus=kept', 'scroll=held', 'region=kept', 'field=visible'],
			label: 'typing: module open, focus kept, scroll held, region still in the document, field visible'
		}
	],
	presence: [
		{ selector: '[data-testid="module-body"]', label: 'the module disclosure under test', expectPresent: 1 },
		{ selector: 'textarea#tf-tf2', label: 'the answer field being typed into', expectPresent: 1 }
	],
	contrast: [{ selector: '.probes span', label: 'harness probe readout', min: 4.5 }],
	tapTargets: []
};
