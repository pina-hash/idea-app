/* NO `order` EXPORT, deliberately -- see routes.mjs: that field belongs to the
   original 25 files only, and anything added since sorts after them by
   filename. */

/**
 * THE CLASSROOM FILE PICKER'S DROP ZONE, AND THE ORDERED, EDITABLE LISTS
 * (prompt 0118, item NINE and the FOUR file half), measured in a real browser
 * at 375 and 1440.
 *
 * WHAT THE DOM TESTS CANNOT SAY. `tests/dom/classroom-upload-picker-parity-
 * mount.test.ts` and `tests/dom/classroom-attachment-list-mount.test.ts` pin
 * the arithmetic: a rename changes `files()[i].name`, ArrowDown reorders,
 * `runAll` calls the transport in list order, `onreorder` gets the new id
 * array. happy-dom lays nothing out, so every claim about a BOX is made here
 * and nowhere else: the zone is visible at rest (a dashed box a person can
 * see, not a listener nobody is told about), its sentence clears 4.5:1 on
 * the classroom plate, every control on a staged row and an existing row is
 * 44px, and the page scrolls nowhere sideways at a phone width with three
 * rows of controls wrapping.
 *
 * THE DRIVES ARE REAL EVENTS ON A REAL HYDRATED PAGE. A keydown dispatched at
 * a grip reaches `sortDrag`'s listener on the list; a click on Rename opens
 * the real input; typing into it and pressing Save goes through the real
 * handler. Every step's `until` is written against something only the step
 * can produce (the order moving, the input appearing, the name changing), so
 * a press that landed on un-hydrated markup is retried rather than counted.
 *
 * THE ORACLE IS HERE. The page exposes raw probes (`__stagedOrder`,
 * `__existingOrder`, `__existingNames`, `__uploadOrder`); every expected value
 * is written in this file.
 *
 * BOTH DIRECTIONS. The existing list is mounted twice: once with the three
 * props handed in (grips, Move, Rename present) and once with none (zero of
 * each, three rows), so an absence can never be a list that failed to render.
 */
const STAGED = '[data-testid="ordered-mode"]';
/* The plain staged section, seeded with two rows that survive the drives
   (the ordered section's rows are uploaded by the last step), so a staged
   row's own controls have a box to measure. */
const PLAIN = '[data-testid="staged-mode"]';
const EXISTING = '[data-testid="existing-mode"]';
const READONLY = '[data-testid="existing-readonly"]';

export default {
	path: '/dev/classroom-upload',
	label: 'Classroom upload: the drop zone at rest, and reorder/rename on staged and existing files',
	prepare: [
		/* A `File` exists nowhere but in a browser's memory, so the three seeded
		   rows appear only once the client has mounted -- which is also the
		   moment every handler below is attached. */
		{
			waitFor: `() => document.querySelectorAll('${STAGED} [data-testid="fup-row"]').length === 3 && document.querySelectorAll('${PLAIN} [data-testid="fup-row"]').length === 2`
		},
		/* KEYBOARD REORDER ON A STAGED ROW: ArrowDown on alpha's grip. The
		   predicate is "alpha is no longer first" rather than "alpha is second",
		   so a retry after a missed dispatch cannot walk it past the answer. */
		{
			evaluate: `() => {
				const grip = document.querySelector('${STAGED} [data-testid="fup-grip"]');
				grip.focus();
				grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
				return 'staged=' + window.__stagedOrder().join(',');
			}`,
			until: `() => window.__stagedOrder()[0] !== 'alpha.txt'`,
			attempts: 8,
			waitMs: 120
		},
		/* RENAME A STAGED ROW: the first row is beta.png now. Press Rename,
		   which only a hydrated handler can turn into an input. */
		{
			click: `${STAGED} [data-testid="fup-rename-start"]`,
			until: `() => !!document.querySelector('${STAGED} [data-testid="fup-rename-input"]')`,
			attempts: 8,
			waitMs: 120
		},
		{
			evaluate: `() => {
				const input = document.querySelector('${STAGED} [data-testid="fup-rename-input"]');
				input.value = 'renamed-beta.png';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
				return 'staged=' + window.__stagedOrder().join(',');
			}`,
			until: `() => window.__stagedOrder().includes('renamed-beta.png')`,
			attempts: 8,
			waitMs: 120
		},
		/* KEYBOARD REORDER ON AN EXISTING ROW: ArrowDown on notes.pdf's grip,
		   which reaches the page's own `onreorder` and moves a-1 under a-2. */
		{
			evaluate: `() => {
				const grip = document.querySelector('${EXISTING} [data-testid="attach-grip"]');
				grip.focus();
				grip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
				return 'existing=' + window.__existingOrder().join(',');
			}`,
			until: `() => window.__existingOrder()[0] !== 'a-1'`,
			attempts: 8,
			waitMs: 120
		},
		/* A RENAME THAT LANDS: notes.pdf (second row) to a name with a space and
		   parentheses, which the sanitizer rewrites -- the stored name is what
		   the row shows afterwards. */
		{
			click: `${EXISTING} [data-testid="attach-row"]:nth-child(2) [data-testid="attach-rename-start"]`,
			until: `() => !!document.querySelector('${EXISTING} [data-testid="attach-rename-input"]')`,
			attempts: 8,
			waitMs: 120
		},
		{
			evaluate: `() => {
				const input = document.querySelector('${EXISTING} [data-testid="attach-rename-input"]');
				input.value = 'Lab notes (final).pdf';
				input.dispatchEvent(new Event('input', { bubbles: true }));
				document.querySelector('${EXISTING} [data-testid="attach-rename-save"]').click();
				return 'names=' + window.__existingNames().join(',');
			}`,
			until: `() => window.__existingNames().includes('Lab-notes-final-.pdf')`,
			attempts: 8,
			waitMs: 150
		},
		/* SAVE THE STAGED BATCH: the transport is called once per row, in the
		   order on screen, one after another. */
		{
			click: `${STAGED} [data-testid="ordered-run"]`,
			until: `() => window.__uploadOrder().length === 3`,
			attempts: 8,
			waitMs: 250
		},
		/* THE BLOCKED RENAME, LAST: figure.png is first now, and its Rename
		   shows the sentence instead of an input. Last because the list holds
		   ONE editor state at a time -- opening a rename on another row
		   dismisses the sentence, which is correct and is also why this step
		   measured 0 present when it sat before the notes.pdf rename. */
		{
			click: `${EXISTING} [data-testid="attach-row"]:nth-child(1) [data-testid="attach-rename-start"]`,
			until: `() => !!document.querySelector('${EXISTING} [data-testid="attach-rename-blocked"]')`,
			attempts: 8,
			waitMs: 120
		}
	],
	orderResult: [
		{
			label: 'the staged order when Save was pressed: renamed beta first, alpha second',
			evaluate: '() => window.__stagedOrderAtSave()',
			expected: ['renamed-beta.png', 'alpha.txt', 'gamma.pdf']
		},
		{
			/* THE WHOLE `runAll` CLAIM: the order sent is the order shown. Read
			   together with the row above, and identical to it by construction
			   only if the uploads went out one at a time in list order. */
			label: 'runAll called the transport in that same order',
			evaluate: '() => window.__uploadOrder()',
			expected: ['renamed-beta.png', 'alpha.txt', 'gamma.pdf']
		},
		{
			/* All three landed (mode "ok"), so nothing is left staged. */
			label: 'nothing left staged once everything landed',
			evaluate: '() => window.__stagedOrder()',
			expected: []
		},
		{
			label: 'the existing list after ArrowDown on the first grip',
			evaluate: '() => window.__existingOrder()',
			expected: ['a-2', 'a-1', 'a-3']
		},
		{
			label: 'the existing rename stored the sanitized name, in the row',
			evaluate: '() => window.__existingNames()',
			expected: ['figure.png', 'Lab-notes-final-.pdf', 'bracket.sldprt']
		}
	],
	presence: [
		{ selector: '.cr-root', label: 'classroom room mounted', expectPresent: 1 },
		/* THE ZONE IS VISIBLE AT REST: three panels, three zones, all painted. */
		{
			selector: '[data-testid="fup-zone"]',
			label: 'the dashed drop zone, one per panel',
			expectPresent: 3,
			maxPresent: 3,
			expectVisible: 3
		},
		{ selector: '.fup-drop-hint', label: 'the drag/paste sentence, one per zone', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		/* The drop-active overlay is absent when nothing is being dragged. */
		{ selector: '.fup-drop-overlay', label: 'no drop overlay at rest', expectPresent: 0 },
		/* THE EXISTING LIST, BOTH DIRECTIONS. */
		{ selector: `${EXISTING} [data-testid="attach-row"]`, label: 'existing rows (props handed in)', expectPresent: 3, maxPresent: 3 },
		{ selector: `${EXISTING} [data-testid="attach-grip"]`, label: 'grips where onreorder is given', expectPresent: 3, maxPresent: 3, expectVisible: 3 },
		{ selector: `${EXISTING} [data-testid="attach-rename-blocked"]`, label: 'the blocking sentence on the figure row', expectPresent: 1, maxPresent: 1, expectVisible: 1 },
		{ selector: `${EXISTING} [data-testid="attach-rename-input"]`, label: 'no input left open after the rename landed', expectPresent: 0 },
		/* STAGED ROWS, BOTH DIRECTIONS: two rows, two grips, two of each Move,
		   two Rename, two Remove -- and none of them on the emptied ordered
		   panel, whose three rows all landed. */
		{ selector: `${PLAIN} [data-testid="fup-row"]`, label: 'staged rows on the plain panel', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: `${PLAIN} [data-testid="fup-grip"]`, label: 'staged grips', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: `${PLAIN} [data-testid="fup-rename-start"]`, label: 'staged Rename controls', expectPresent: 2, maxPresent: 2, expectVisible: 2 },
		{ selector: `${STAGED} [data-testid="fup-row"]`, label: 'no rows left on the ordered panel', expectPresent: 0 },
		{ selector: `${READONLY} [data-testid="attach-row"]`, label: 'readonly rows (nothing handed in)', expectPresent: 3, maxPresent: 3 },
		{ selector: `${READONLY} [data-testid="attach-grip"]`, label: 'no grip without onreorder', expectPresent: 0 },
		{ selector: `${READONLY} [data-testid="attach-move-up"]`, label: 'no Move up without onreorder', expectPresent: 0 },
		{ selector: `${READONLY} [data-testid="attach-rename-start"]`, label: 'no Rename without onrename', expectPresent: 0 }
	],
	contrast: [
		{ selector: '.fup-zone-text', label: 'the zone sentence on the classroom plate', min: 4.5 },
		{ selector: `${PLAIN} .fup-name`, label: 'a staged filename', min: 4.5 },
		{ selector: `${PLAIN} .fup-btn`, label: 'staged Move / Rename / Remove', min: 4.5 },
		{ selector: '.fup-pick span', label: 'Choose files', min: 4.5 },
		{ selector: `${EXISTING} .attach-btn`, label: 'Move / Rename pills', min: 4.5 },
		{ selector: `${EXISTING} .attach-blocked span`, label: 'the blocking sentence', min: 4.5 }
	],
	tapTargets: [
		{ selector: '.fup-zone .fup-pick', label: 'Choose files / Take a photo, inside the zone' },
		{ selector: `${PLAIN} .fup-grip`, label: 'staged-row grip' },
		{ selector: `${PLAIN} .fup-btn`, label: 'staged-row Move / Rename / Remove' },
		{ selector: `${EXISTING} .attach-grip`, label: 'existing-row grip' },
		{ selector: `${EXISTING} .attach-btn`, label: 'existing-row Move / Rename / OK' },
		{ selector: `${STAGED} .run`, label: 'Save (run the batch in order)' }
	]
};
