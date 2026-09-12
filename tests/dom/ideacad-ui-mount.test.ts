// tests/dom/ideacad-ui-mount.test.ts
//
// THE FOUR SURFACES 0171 BUILT, DRIVEN AGAINST THE REAL `BladeEditor`.
//
// `tests/dom/ideacad-ui-model.test.ts` proves the arithmetic with nothing
// mounted. What is here is the half that only exists once the component is
// wired: a keystroke reaching the right handler, a pane genuinely REPLACED
// rather than hidden, a preview that moves before an accept and a readout that
// does not, and a gate that opens on a WRITE rather than on a press.
//
// THE ONE THAT WOULD REGRESS SILENTLY, and is therefore the reason this file
// exists rather than a harness note: `reveal()` used to set `revealed` BEFORE
// awaiting `ideacad_set_prediction`. A rejected write then left the comparative
// physics on screen with nothing recorded -- the student is taught the lesson
// and the evidence of their prediction is gone. Nothing on screen says so, and
// the happy path is identical either way, so only a transport that REJECTS can
// tell the two apart.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ASSERT: any width, any ratio, any tap
// target. happy-dom has no layout engine, so every one of those reads zero and
// passes vacuously (`tests/dom/README.md`). They are measured against a real
// Chromium in `tools/browser-verify/routes/ideacad*.mjs`.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import BladeEditor from '$lib/ideacad/BladeEditor.svelte';
import { DEFAULT_BLADE_CONFIG, DEFAULT_BLADE_TREE } from '$lib/ideacad/blade/materials';
import { mountInto } from './mount';

const Editor = BladeEditor as unknown as Component<Record<string, unknown>>;

const THREE = [
	{ id: 'c1', name: 'Concept 1', features: structuredClone(DEFAULT_BLADE_TREE) },
	{ id: 'c2', name: 'Wide four', features: structuredClone(DEFAULT_BLADE_TREE) },
	{ id: 'c3', name: 'Concept 3', features: structuredClone(DEFAULT_BLADE_TREE) }
];

/**
 * EVERY MOUNT IS UNMOUNTED, EVEN WHEN ITS TEST THROWS, AND THAT IS NOT TIDINESS.
 * `BladeEditor` listens for its undo keystrokes on the DOCUMENT, so a mount a
 * failed assertion left standing keeps handling them -- and it calls
 * `preventDefault`, which the NEXT test's editor correctly reads as "the
 * viewport already claimed this" and ignores. Measured: two genuine failures in
 * this file turned three unrelated keyboard tests red, which is a cascade that
 * points at the wrong line.
 */
const live: { stop(): Promise<void> }[] = [];
afterEach(async () => {
	while (live.length) await live.pop()!.stop();
});

function open(props: Record<string, unknown> = {}) {
	const m = mountInto(Editor, {
		tree: DEFAULT_BLADE_TREE,
		config: DEFAULT_BLADE_CONFIG,
		concepts: structuredClone(THREE),
		...props
	});
	live.push(m);
	return m;
}

type M = ReturnType<typeof open>;

const rows = (m: M) => m.all<HTMLButtonElement>('.tree [role="treeitem"]');
const rowNamed = (m: M, text: string) => rows(m).find((b) => b.textContent?.includes(text));
const button = (m: M, label: string) => m.all<HTMLButtonElement>('button').find((b) => b.textContent?.trim() === label);
const pmOpen = (m: M) => m.all('[data-testid="ideacad-property-manager"]').length > 0;
const mass = (m: M) => m.all('.readouts .metric strong')[3]?.textContent ?? '';
const type = (input: HTMLInputElement, value: string) => {
	input.value = value;
	input.dispatchEvent(new Event('input', { bubbles: true }));
};
const press = (m: M, key: string, mods: Record<string, boolean> = {}) => {
	document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
	m.flush();
};

describe('the FeatureManager tree', () => {
	it('lists the six features in build order plus the two read nodes, with the body collapsed', async () => {
		// COLLAPSED IS THE MEASURED DEFAULT. Expanded, the four station rows push
		// Materials and Standard Parts off the bottom of a 566.6px pane at 1440 --
		// two nodes 0145 PART 5 names, gone, with nothing on screen saying so.
		const m = open();
		expect(rows(m).map((b) => b.querySelector('.name')?.textContent?.split('  ')[0])).toEqual([
			'Body Revolve',
			'Hex Extension',
			'Blade Sketch',
			'Blade Extrude',
			'Circular Pattern',
			'Blade Mount',
			'Materials',
			'Standard Parts'
		]);
		await m.stop();
	});

	it('shows the body’s stations as child rows once the body is expanded, and hides them again', async () => {
		const m = open();
		const twist = m.one<HTMLButtonElement>('.tree .twist');
		expect(twist.getAttribute('aria-expanded')).toBe('false');
		twist.click();
		m.flush();
		expect(twist.getAttribute('aria-expanded')).toBe('true');
		const names = rows(m).map((b) => b.querySelector('.name')?.textContent?.split('  ')[0]);
		expect(names.slice(0, 6)).toEqual(['Body Revolve', 'Station 1', 'Station 2', 'Station 3', 'Station 4', 'Hex Extension']);
		// The two read nodes are still there, which is the thing collapsing bought.
		expect(names.at(-1)).toBe('Standard Parts');
		twist.click();
		m.flush();
		expect(rows(m)).toHaveLength(8);
		await m.stop();
	});

	it('expands and collapses the body from the keyboard, which is the tree pattern’s own pair', async () => {
		const m = open();
		const list = m.one('.tree [role="tree"]');
		const arrow = (key: string) => {
			list.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
			m.flush();
		};
		arrow('ArrowRight');
		expect(rows(m)).toHaveLength(12);
		arrow('ArrowLeft');
		expect(rows(m)).toHaveLength(8);
		await m.stop();
	});

	it('is ONE tab stop with a roving tabindex, not twelve', async () => {
		const m = open();
		const tabbable = rows(m).filter((b) => b.getAttribute('tabindex') === '0');
		expect(tabbable).toHaveLength(1);
		expect(tabbable[0].getAttribute('aria-selected')).toBe('true');
		await m.stop();
	});

	it('moves the selection with the arrows and keeps exactly one selected', async () => {
		const m = open();
		const list = m.one('.tree [role="tree"]');
		list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
		m.flush();
		expect(rows(m).filter((b) => b.getAttribute('aria-selected') === 'true')).toHaveLength(1);
		expect(rows(m)[1].getAttribute('aria-selected')).toBe('true');
		list.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
		m.flush();
		expect(rows(m).at(-1)!.getAttribute('aria-selected')).toBe('true');
		await m.stop();
	});

	it('selects on a single click and opens Edit Feature only on the deliberate second intent', async () => {
		const m = open();
		const hex = rowNamed(m, 'Hex Extension')!;
		hex.click();
		m.flush();
		expect(pmOpen(m)).toBe(false); // a click is a look, not an edit
		hex.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		m.flush();
		expect(pmOpen(m)).toBe(true);
		expect(m.one('#pm-label').textContent).toBe('Hex Extension');
		await m.stop();
	});

	it('opens Edit Feature on Enter, which is the keyboard half of the same intent', async () => {
		const m = open();
		m.one('.tree [role="tree"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
		m.flush();
		expect(pmOpen(m)).toBe(true);
		await m.stop();
	});

	it('marks a feature whose parameters break a rule, the way SolidWorks marks a rebuild error', async () => {
		// Two blades is legal; one is not, and validateBladeTree says so against
		// the pattern's own id -- so the chip has to land on that row and no other.
		const broken = structuredClone(DEFAULT_BLADE_TREE);
		const pattern = broken.features.find((f) => f.type === 'circularPattern')!;
		if (pattern.type === 'circularPattern') pattern.count = 1;
		const m = open({ concepts: [{ id: 'c1', name: 'One blade', features: broken }] });
		const flagged = rows(m).filter((b) => b.classList.contains('trouble'));
		expect(flagged).toHaveLength(1);
		expect(flagged[0].textContent).toContain('Circular Pattern');
		expect(flagged[0].textContent).toContain('REBUILD');
		await m.stop();
	});

	it('says the two verbs it does not offer, rather than leaving a gap where a control would be', async () => {
		const m = open();
		expect(m.one('.tree .why').textContent).toContain('cannot be renamed or deleted');
		await m.stop();
	});
});

describe('the PropertyManager', () => {
	function editing(id: string, props: Record<string, unknown> = {}) {
		const m = open(props);
		rowNamed(m, id)!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		m.flush();
		return m;
	}

	it('REPLACES the tree in the same pane rather than opening beside it', async () => {
		const m = editing('Circular Pattern');
		expect(pmOpen(m)).toBe(true);
		expect(m.all('.tree [role="tree"]')).toHaveLength(0);
		// And the pane is the same one, renamed for what it now holds.
		expect(m.one('.tree').getAttribute('aria-label')).toBe('PropertyManager');
		await m.stop();
	});

	it('previews live on every change and leaves the document alone until Accept', async () => {
		const m = editing('Circular Pattern');
		const before = mass(m);
		type(m.one<HTMLInputElement>('.pm input[type="number"]'), '8');
		m.flush();
		// The rail moved, so the preview is real...
		expect(mass(m)).not.toBe(before);
		// ...and Cancel puts it back, so nothing was written.
		button(m, '× Cancel')?.click();
		m.one<HTMLButtonElement>('.pm .cancel').click();
		m.flush();
		expect(mass(m)).toBe(before);
		await m.stop();
	});

	it('Accept writes the preview into the concept and Cancel then has nothing to revert', async () => {
		const m = editing('Circular Pattern');
		const before = mass(m);
		type(m.one<HTMLInputElement>('.pm input[type="number"]'), '8');
		m.flush();
		m.one<HTMLButtonElement>('.pm .accept').click();
		m.flush();
		const after = mass(m);
		expect(after).not.toBe(before);
		m.one<HTMLButtonElement>('.pm .cancel').click();
		m.flush();
		expect(mass(m)).toBe(after);
		await m.stop();
	});

	it('arms its confirm pair only while there is a difference to confirm', async () => {
		const m = editing('Circular Pattern');
		expect(m.one('.pm .accept').getAttribute('aria-disabled')).toBe('true');
		type(m.one<HTMLInputElement>('.pm input[type="number"]'), '7');
		m.flush();
		expect(m.one('.pm .accept').getAttribute('aria-disabled')).toBe('false');
		await m.stop();
	});

	it('accepts on Enter through the form’s own submit, which is what a browser already does', async () => {
		const m = editing('Circular Pattern');
		const before = mass(m);
		type(m.one<HTMLInputElement>('.pm input[type="number"]'), '8');
		m.flush();
		m.one('form.pm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
		m.flush();
		m.one<HTMLButtonElement>('.pm .cancel').click();
		m.flush();
		expect(mass(m)).not.toBe(before); // the accept stuck through a cancel
		await m.stop();
	});

	it('closes on Escape and reverts the preview with it', async () => {
		const m = editing('Circular Pattern');
		const before = mass(m);
		type(m.one<HTMLInputElement>('.pm input[type="number"]'), '8');
		m.flush();
		expect(mass(m)).not.toBe(before);
		press(m, 'Escape');
		expect(pmOpen(m)).toBe(false);
		expect(mass(m)).toBe(before);
		await m.stop();
	});

	it('edits the body through its station table, and the table is where add and remove live', async () => {
		const m = editing('Body Revolve');
		expect(m.all('.pm tbody tr')).toHaveLength(4);
		m.all<HTMLButtonElement>('.pm .acts button')[0].click(); // "+" on row 1
		m.flush();
		expect(m.all('.pm tbody tr')).toHaveLength(5);
		m.all<HTMLButtonElement>('.pm .acts button')[1].click(); // "−" on row 1
		m.flush();
		expect(m.all('.pm tbody tr')).toHaveLength(4);
		await m.stop();
	});

	it('draws the profile from the stations on screen, so the two cannot disagree', async () => {
		const m = editing('Body Revolve');
		const before = m.one('.pm .profile polyline').getAttribute('points');
		expect(m.all('.pm .profile circle')).toHaveLength(4);
		type(m.all<HTMLInputElement>('.pm tbody input')[0], '0.9');
		m.flush();
		expect(m.one('.pm .profile polyline').getAttribute('points')).not.toBe(before);
		expect(m.all('.pm .profile circle')).toHaveLength(4);
		await m.stop();
	});

	it('reorders the feature it is open on, and the tree shows the new order', async () => {
		const m = editing('Hex Extension');
		m.one<HTMLButtonElement>('.pm .reorder button').click(); // Move up
		m.flush();
		m.one<HTMLButtonElement>('.pm .back').click();
		m.flush();
		expect(rows(m)[0].textContent).toContain('Hex Extension');
		await m.stop();
	});

	it('refuses a move across a declared dependency IN WORDS, not by doing nothing', async () => {
		const m = editing('Blade Extrude');
		m.one<HTMLButtonElement>('.pm .reorder button').click(); // Move up, into its own sketch
		m.flush();
		expect(m.one('.pm .refusal').textContent).toContain('built on Blade Sketch');
		m.one<HTMLButtonElement>('.pm .back').click();
		m.flush();
		// Unmoved: the build order is exactly what it was.
		expect(rows(m).map((b) => b.querySelector('.name')?.textContent?.split('  ')[0])).toEqual([
			'Body Revolve',
			'Hex Extension',
			'Blade Sketch',
			'Blade Extrude',
			'Circular Pattern',
			'Blade Mount',
			'Materials',
			'Standard Parts'
		]);
		await m.stop();
	});

	it('offers no reorder pair on Materials or Standard Parts, which are not in the build order', async () => {
		const m = editing('Materials');
		expect(m.all('.pm .reorder')).toHaveLength(0);
		await m.stop();
	});

	it('carries the REASON for those two absences, where a student is when they want one', async () => {
		// The tree has room for a line; the reason lives here, because the pane at
		// 1440 is 514.6px and eight 44px rows and a heading fill it.
		const m = open();
		rowNamed(m, 'Circular Pattern')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
		m.flush();
		expect(m.one('.pm .standing').textContent).toContain('none of them can be deleted or renamed');
		await m.stop();
	});

	it('is read-only for a teacher: every field disabled, no confirm pair, no reorder', async () => {
		const m = editing('Circular Pattern', { readOnly: true });
		expect(pmOpen(m)).toBe(true); // positive control: the panel IS on screen
		expect(m.all('.pm .confirm')).toHaveLength(0);
		expect(m.all('.pm .reorder')).toHaveLength(0);
		expect(m.all<HTMLInputElement>('.pm input').every((i) => i.disabled)).toBe(true);
		await m.stop();
	});
});

describe('undo and redo, over accepted edits', () => {
	/** Accept LEAVES the panel open, which is what SolidWorks does -- a student
	 *  takes several passes at one feature. So the second call finds the panel
	 *  already there rather than a tree to double-click. */
	function acceptedEdit(m: M, count: string) {
		if (!pmOpen(m)) {
			rowNamed(m, 'Circular Pattern')!.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
			m.flush();
		}
		type(m.one<HTMLInputElement>('.pm input[type="number"]'), count);
		m.flush();
		m.one<HTMLButtonElement>('.pm .accept').click();
		m.flush();
	}

	it('starts with nothing to undo and nothing to redo', async () => {
		const m = open();
		expect(button(m, 'Undo')!.getAttribute('aria-disabled')).toBe('true');
		expect(button(m, 'Redo')!.getAttribute('aria-disabled')).toBe('true');
		await m.stop();
	});

	it('takes one accepted edit back, and forward again', async () => {
		const m = open();
		const before = mass(m);
		acceptedEdit(m, '8');
		const edited = mass(m);
		expect(edited).not.toBe(before);
		expect(button(m, 'Undo')!.getAttribute('aria-disabled')).toBe('false');
		button(m, 'Undo')!.click();
		m.flush();
		expect(mass(m)).toBe(before);
		button(m, 'Redo')!.click();
		m.flush();
		expect(mass(m)).toBe(edited);
		await m.stop();
	});

	it('answers Ctrl+Z and Ctrl+Y from the keyboard', async () => {
		const m = open();
		const before = mass(m);
		acceptedEdit(m, '8');
		const edited = mass(m);
		press(m, 'z', { ctrlKey: true });
		expect(mass(m)).toBe(before);
		press(m, 'y', { ctrlKey: true });
		expect(mass(m)).toBe(edited);
		await m.stop();
	});

	it('IGNORES a keystroke the viewport already claimed, so one press never does two jobs', async () => {
		// The viewport binds Ctrl+Z (zoom) on its OWN element and calls
		// preventDefault. A keystroke aimed at the graphics area therefore reaches
		// the console already handled, and undoing as well would zoom AND rewrite
		// the document on one press.
		const m = open();
		const before = mass(m);
		acceptedEdit(m, '8');
		const edited = mass(m);
		const claimed = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
		claimed.preventDefault();
		document.dispatchEvent(claimed);
		m.flush();
		expect(mass(m)).toBe(edited);
		// The positive control: the identical keystroke UNCLAIMED does undo.
		press(m, 'z', { ctrlKey: true });
		expect(mass(m)).toBe(before);
		await m.stop();
	});

	it('leaves Ctrl+Z to the field while somebody is typing into one', async () => {
		const m = open();
		const before = mass(m);
		acceptedEdit(m, '8');
		const edited = mass(m);
		const field = m.one<HTMLInputElement>('.pm input[type="number"]');
		field.focus();
		press(m, 'z', { ctrlKey: true });
		expect(mass(m)).toBe(edited);
		field.blur();
		press(m, 'z', { ctrlKey: true });
		expect(mass(m)).toBe(before);
		await m.stop();
	});

	it('discards the redo branch once a new edit is accepted', async () => {
		const m = open();
		acceptedEdit(m, '8');
		button(m, 'Undo')!.click();
		m.flush();
		expect(button(m, 'Redo')!.getAttribute('aria-disabled')).toBe('false');
		acceptedEdit(m, '6');
		expect(button(m, 'Redo')!.getAttribute('aria-disabled')).toBe('true');
		await m.stop();
	});

	it('does not follow a concept load, so an undo cannot rewrite a document nobody is looking at', async () => {
		const m = open();
		acceptedEdit(m, '8');
		expect(button(m, 'Undo')!.getAttribute('aria-disabled')).toBe('false');
		m.all<HTMLButtonElement>('.concepts .card')[1].click();
		m.flush();
		expect(button(m, 'Undo')!.getAttribute('aria-disabled')).toBe('true');
		await m.stop();
	});

	it('is absent for a teacher, because there is nothing read-only to undo', async () => {
		const m = open({ readOnly: true });
		expect(button(m, 'Undo')).toBeUndefined();
		expect(button(m, 'Redo')).toBeUndefined();
		await m.stop();
	});
});

describe('the concept strip', () => {
	it('carries a profile thumbnail and a rule chip per card', async () => {
		const m = open();
		expect(m.all('.concepts .card .thumb')).toHaveLength(3);
		expect(m.all('.concepts .card .chip')).toHaveLength(3);
		await m.stop();
	});

	it('says FAIL on a card whose own tree breaks a rule, and PASS on one that does not', async () => {
		const wide = structuredClone(DEFAULT_BLADE_TREE);
		const body = wide.features.find((f) => f.type === 'revolve')!;
		if (body.type === 'revolve') body.stations = body.stations.map((s) => ({ ...s, r: s.r * 1.9 }));
		const m = open({
			concepts: [
				{ id: 'c1', name: 'Legal', features: structuredClone(DEFAULT_BLADE_TREE) },
				{ id: 'c2', name: 'Too wide', features: wide }
			]
		});
		const chips = m.all('.concepts .card .chip').map((c) => c.textContent?.trim());
		expect(chips[0]).toBe('PASS');
		expect(chips[1]).toContain('FAIL');
		await m.stop();
	});

	it('reorders the strip without touching which concept is active', async () => {
		const m = open();
		m.all<HTMLButtonElement>('.concepts .card')[1].click(); // make "Wide four" active
		m.flush();
		button(m, 'Move left')!.click();
		m.flush();
		const names = m.all('.concepts .card .nm').map((n) => n.firstChild?.textContent);
		expect(names).toEqual(['Wide four', 'Concept 1', 'Concept 3']);
		expect(m.one('.concepts .card.active .nm').firstChild?.textContent).toBe('Wide four');
		expect(button(m, 'Move left')!.getAttribute('aria-disabled')).toBe('true'); // at the end now
		await m.stop();
	});

	it('offers no reorder on a document with one concept, where there is nothing to order', async () => {
		const m = open({ concepts: [{ id: 'c1', name: 'Only one', features: structuredClone(DEFAULT_BLADE_TREE) }] });
		expect(button(m, 'Move left')).toBeUndefined();
		await m.stop();
	});
});

describe('the prediction gate opens on the WRITE, never on the press', () => {
	const physics = (m: M) => m.all('.compare dl').length;

	function pick(m: M) {
		const select = m.one<HTMLSelectElement>('.compare select');
		select.value = 'c2';
		select.dispatchEvent(new Event('change', { bubbles: true }));
		type(m.one<HTMLInputElement>('.compare input'), 'because the rim carries the mass');
		m.flush();
	}

	it('stays closed when the recording transport REJECTS, and says so', async () => {
		const m = open({ openCompare: true, setPrediction: async () => Promise.reject(new Error('offline')) });
		pick(m);
		button(m, 'Reveal physics')!.click();
		await m.settle();
		expect(physics(m)).toBe(0);
		expect(m.one('.compare .refusal').textContent).toContain('did not save');
		await m.stop();
	});

	it('opens once the identical press is recorded, which is the positive control for the line above', async () => {
		const seen: string[] = [];
		const m = open({ openCompare: true, setPrediction: async (id: string, why: string) => void seen.push(`${id}:${why}`) });
		pick(m);
		button(m, 'Reveal physics')!.click();
		await m.settle();
		expect(seen).toEqual(['c2:because the rim carries the mass']);
		expect(physics(m)).toBe(3); // one physics block per concept
		await m.stop();
	});

	it('opens on a prediction ALREADY recorded, so a student is never asked twice about one document', async () => {
		const m = open({ openCompare: true, prediction: { conceptId: 'c3', rationale: 'the narrow one', at: '2026-09-12' } });
		expect(physics(m)).toBe(3);
		expect(m.one('.compare .said').textContent).toContain('Concept 3');
		expect(m.one('.compare .said').textContent).toContain('2026-09-12');
		// And it does not ask again.
		expect(m.all('.compare select')).toHaveLength(0);
		await m.stop();
	});

	it('shows every concept’s rule readouts while it is closed, and only the physics is locked', async () => {
		// Decision 26's default: lock comparative physics ONLY. A student needs the
		// rules to build a legal concept at all, so a gate over those would be a
		// gate over the work rather than over the answer.
		const m = open({ openCompare: true });
		expect(m.all('.compare .cols article')).toHaveLength(3);
		expect(m.all('.compare .cols li')).toHaveLength(12); // four rules per concept
		expect(physics(m)).toBe(0);
		expect(m.one('.compare').textContent).not.toContain('g·cm²');
		await m.stop();
	});

	it('says a concept cannot be rebuilt rather than blanking the surface beside it', async () => {
		// `evaluate` reads all six features by type and throws on the first missing
		// one, so a malformed concept in a real document would otherwise take every
		// column with it.
		const broken = structuredClone(DEFAULT_BLADE_TREE);
		broken.features = broken.features.filter((f) => f.type !== 'hexBoss');
		const m = open({
			openCompare: true,
			concepts: [
				{ id: 'c1', name: 'Fine', features: structuredClone(DEFAULT_BLADE_TREE) },
				{ id: 'c2', name: 'Broken', features: broken }
			]
		});
		expect(m.all('.compare .cols article')).toHaveLength(2);
		expect(m.one('.compare .broken').textContent).toContain('cannot be rebuilt');
		await m.stop();
	});
});
