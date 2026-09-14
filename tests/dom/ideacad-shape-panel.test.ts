// tests/dom/ideacad-shape-panel.test.ts
//
// LEDGER 0255'S MODEL LAYER, REACHED FROM THE INTERFACE.
//
// `0255` shipped `blade/parts.ts` and six operations in `blade/ops.ts` -- add,
// delete, duplicate, reorder, move, rotate -- and NOTHING IN `src/` CALLED ANY
// OF THEM. Built, tested, invisible. This file is the assertion that the panel
// now does, and that what it hands up is the model's own answer rather than a
// second implementation of it.
//
// WHY THIS IS AUTOMATED, when most feature correctness here belongs in a
// harness: every claim below is one whose regression is INVISIBLE on screen.
//
//   * A CONTROL THAT NO LONGER REACHES THE MODEL. A button whose handler drifted
//     to a local mutation renders identically, moves the row on screen, and
//     silently stops obeying `validatePartCollection` -- which is the only thing
//     standing between a student and a design the evaluator cannot open.
//
//   * A REFUSAL THAT GOT RE-TONED. `deletePart` refusing the last body is a
//     sentence written to be read; a panel that shortened it to "Could not
//     delete" looks fine and tells the reader nothing they can act on. The
//     expected value here is the MODEL's own string, taken from the model.
//
//   * A SHAPE CONTROL OFFERED WITH NOWHERE TO SAVE. `onbladetree` absent means
//     a press would compute a new tree and drop it on the floor: the row moves,
//     nothing persists, and the student finds out at the next page load.
//
// EVERY ABSENCE IS PAIRED WITH ITS POSITIVE CONTROL ON THE SAME FIXTURE and
// BOTH counts are reported.
//
// NO GEOMETRY, CONTRAST OR TAP TARGET HERE -- happy-dom has no layout engine and
// all three read zero. Those belong to `npm run verify:browser`.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import PartsPanel from '$lib/ideacad/ui/PartsPanel.svelte';
import { IDEACAD_SHAPE_VIEW_ONLY } from '$lib/ideacad/checkout';
import { deletePart, duplicatePart, movePart, reorderPart, rotatePart } from '$lib/ideacad/blade/ops';
import { upgradeBladeParts, type BladePartsTree } from '$lib/ideacad/blade/parts';
import type { BladeTree } from '$lib/ideacad/blade/tree';
import type { IdeacadAssembly } from '$lib/ideacad/assembly';
import { mountInto, type Mounted } from './mount';

const Panel = PartsPanel as unknown as Component<Record<string, unknown>>;

/**
 * A PRE-0255 DOCUMENT, deliberately: no `parts` array at all. It is the shape
 * every stored row actually has, and it proves the panel reads the collection
 * through `upgradeBladeParts` rather than assuming a field that is not there.
 */
const LEGACY_TREE: BladeTree = {
	schema: 1,
	editor: 'blade',
	units: 'in',
	rotation: 'cw',
	materials: { body: 'pla', bodySolidFraction: 0.42, bladeStock: 'steel-0125' },
	features: [
		{
			id: 'body-revolve',
			type: 'revolve',
			stations: [
				{ r: 0.12, z: 0.125 },
				{ r: 1.55, z: 0.35 },
				{ r: 1.65, z: 2.4 },
				{ r: 0.7, z: 2.95 }
			]
		},
		{ id: 'hex-extension', type: 'hexBoss', acrossFlats: 0.5, height: 0.5 },
		{
			id: 'blade-sketch',
			type: 'bladeSketch',
			rootWidth: 0.45,
			tipWidth: 0.3,
			length: 0.65,
			sweepDeg: 18,
			mountRadius: 1.45
		},
		{ id: 'blade-extrude', type: 'extrude', sketch: 'blade-sketch', thickness: 'stock' },
		{ id: 'blade-pattern', type: 'circularPattern', feature: 'blade-extrude', count: 4 },
		{ id: 'blade-mount', type: 'mount', feature: 'blade-pattern', z: 1.25 }
	]
};

/** What the model layer says this fixture's parts are. Ids come from features. */
const SHAPE = upgradeBladeParts(LEGACY_TREE).parts;
const BODY = SHAPE[0].id;
const BLADES = SHAPE[1].id;

const ME = 'ana@boscotech.net';

function assembly(over: Partial<IdeacadAssembly> = {}): IdeacadAssembly {
	return {
		documentId: 'doc-1',
		viewer: ME,
		isOwner: false,
		canWrite: true,
		holdWindowSeconds: 600,
		holdRevisionTotal: 0,
		parts: [],
		...over
	};
}

const mounted: Mounted[] = [];
afterEach(async () => {
	while (mounted.length) await mounted.pop()!.stop();
});

interface Opened extends Mounted {
	/** Every tree the panel handed up, in order. */
	saved: BladeTree[];
	/** Every selection it announced, in order. */
	picked: (string | null)[];
}

function open(props: Record<string, unknown> = {}): Opened {
	const saved: BladeTree[] = [];
	const picked: (string | null)[] = [];
	const m = mountInto(Panel, {
		assembly: assembly(),
		bladeTree: LEGACY_TREE,
		onbladetree: (tree: BladeTree) => saved.push(tree),
		...props
	}) as Opened;
	m.saved = saved;
	m.picked = picked;
	mounted.push(m);
	return m;
}

/** Open a piece's controls. Uncontrolled selection, which is the panel's own. */
function pick(m: Mounted, partId: string): void {
	const row = m.one(`[data-testid="ideacad-shape-row"][data-part="${partId}"]`);
	(row.querySelector('[data-testid="ideacad-shape-select"]') as HTMLButtonElement).click();
	m.flush();
}

function press(m: Mounted, testId: string): void {
	(m.one(`[data-testid="${testId}"]`) as HTMLButtonElement).click();
	m.flush();
}

function refusalOn(m: Mounted): { text: string; reason: string | null } | null {
	const el = m.target.querySelector('[data-testid="ideacad-shape-refusal"]');
	if (!el) return null;
	return {
		text: (el.querySelector('span:not(.mark)') as HTMLElement).textContent!.trim(),
		reason: el.getAttribute('data-reason')
	};
}

/** Every write control the shape region is offering right now, counted. */
function shapeControls(m: Mounted) {
	return {
		rows: m.all('[data-testid="ideacad-shape-row"]').length,
		select: m.all('[data-testid="ideacad-shape-select"]').length,
		ops: m.all('[data-testid="ideacad-shape-ops"]').length,
		add: m.all('[data-testid="ideacad-shape-add"] button').length,
		numbers: m.all('.shape input[type="number"]').length,
		readonly: m.all('[data-testid="ideacad-shape-readonly"]').length
	};
}

describe('the shape region reads a stored document', () => {
	it('lists the parts a PRE-0255 document has, derived through the model layer', () => {
		const m = open();
		const names = m.all('[data-testid="ideacad-shape-row"]').map((el) => el.getAttribute('data-part'));
		expect(names).toEqual([BODY, BLADES]);
		expect(names).toHaveLength(SHAPE.length);
	});

	it('says which kind each piece is IN WORDS, once, and where it sits on the core', () => {
		const m = open();
		const rows = m.all('[data-testid="ideacad-shape-select"]').map((el) =>
			el.textContent!.replace(/\s+/g, ' ').trim()
		);
		// THE WORD IS THERE. Whether it comes from the name or from the meta line
		// is the panel's business; that a reader can read it is not.
		expect(rows[0]).toContain('Body');
		expect(rows[1]).toContain('Blade row');
		// AND IT IS THERE ONCE. "Blade row · Blade row · 1.25 in up" was on screen
		// with every measured number on that row correct.
		expect(rows[1].match(/Blade row/g)).toHaveLength(1);
		// The blade row's stored mount height, read back on the row.
		expect(rows[1]).toContain(`${SHAPE[1].z} in up`);
	});

	it('KEEPS the kind word when the name does not already carry it', () => {
		const renamed = structuredClone(upgradeBladeParts(LEGACY_TREE)) as BladePartsTree;
		renamed.parts[1].name = 'Outer set';
		const m = open({ bladeTree: renamed });
		const row = m
			.all('[data-testid="ideacad-shape-select"]')[1]
			.textContent!.replace(/\s+/g, ' ')
			.trim();
		expect(row).toContain('Outer set');
		expect(row).toContain('Blade row');
	});
});

describe('a control with nowhere to save is ABSENT, not disabled', () => {
	it('offers no shape control at all without `onbladetree`, and says why', () => {
		const m = open({ onbladetree: undefined });
		pick(m, BODY);
		expect(shapeControls(m)).toEqual({
			rows: 2,
			select: 2,
			ops: 0,
			add: 0,
			numbers: 0,
			readonly: 1
		});
		expect(m.one('[data-testid="ideacad-shape-readonly"]').textContent!.trim()).toBe(
			IDEACAD_SHAPE_VIEW_ONLY
		);
	});

	it('offers none of them to a VIEWER, whose mount handed one down anyway', () => {
		const m = open({ assembly: assembly({ canWrite: false }) });
		pick(m, BODY);
		expect(shapeControls(m)).toEqual({
			rows: 2,
			select: 2,
			ops: 0,
			add: 0,
			numbers: 0,
			readonly: 1
		});
	});

	// THE POSITIVE CONTROL FOR BOTH ABSENCES, on the same fixture.
	it('offers every one of them to an editor with a save path', () => {
		const m = open();
		pick(m, BODY);
		expect(shapeControls(m)).toEqual({
			rows: 2,
			select: 2,
			ops: 1,
			add: 2,
			numbers: 2,
			readonly: 0
		});
	});
});

describe('every press reaches the operation in blade/ops.ts', () => {
	it('DUPLICATE hands up exactly what `duplicatePart` answers', () => {
		const m = open();
		pick(m, BLADES);
		press(m, 'ideacad-shape-duplicate');
		const expected = duplicatePart(LEGACY_TREE, BLADES);
		expect(expected.ok).toBe(true);
		expect(m.saved).toHaveLength(1);
		expect(m.saved[0]).toEqual(expected.ok ? expected.tree : null);
		expect((m.saved[0] as BladePartsTree).parts).toHaveLength(3);
	});

	it('REORDER hands up exactly what `reorderPart` answers', () => {
		const m = open();
		// The LAST piece, which is the one carrying Move up.
		pick(m, BLADES);
		press(m, 'ideacad-shape-up');
		const expected = reorderPart(LEGACY_TREE, BLADES, 0);
		expect(expected.ok).toBe(true);
		expect(m.saved[0]).toEqual(expected.ok ? expected.tree : null);
		expect((m.saved[0] as BladePartsTree).parts.map((p) => p.id)).toEqual([BLADES, BODY]);
	});

	it('MOVE along the core hands up exactly what `movePart` answers', () => {
		const m = open();
		pick(m, BLADES);
		const box = m.one<HTMLInputElement>('[data-testid="ideacad-shape-z"]');
		box.value = '2.25';
		box.dispatchEvent(new Event('change', { bubbles: true }));
		m.flush();
		const expected = movePart(LEGACY_TREE, BLADES, 2.25);
		expect(expected.ok).toBe(true);
		expect(m.saved[0]).toEqual(expected.ok ? expected.tree : null);
	});

	it('ROTATE about the core hands up exactly what `rotatePart` answers', () => {
		const m = open();
		pick(m, BLADES);
		const box = m.one<HTMLInputElement>('[data-testid="ideacad-shape-angle"]');
		box.value = '45';
		box.dispatchEvent(new Event('change', { bubbles: true }));
		m.flush();
		const expected = rotatePart(LEGACY_TREE, BLADES, 45);
		expect(expected.ok).toBe(true);
		expect(m.saved[0]).toEqual(expected.ok ? expected.tree : null);
	});

	it('ADD seeds a valid part from the default design and `addPart` accepts it', () => {
		const m = open();
		press(m, 'ideacad-shape-add-blade');
		expect(refusalOn(m)).toBeNull();
		expect(m.saved).toHaveLength(1);
		const parts = (m.saved[0] as BladePartsTree).parts;
		expect(parts).toHaveLength(3);
		// The seed takes THIS design's stock, never the default config's.
		const added = parts[2];
		expect(added.kind).toBe('blade');
		expect(added.kind === 'blade' ? added.parameters.stock : null).toBe(
			LEGACY_TREE.materials.bladeStock
		);
	});

	it('ADD mints an id the collection does not already hold', () => {
		const m = open();
		press(m, 'ideacad-shape-add-body');
		const parts = (m.saved[0] as BladePartsTree).parts;
		expect(new Set(parts.map((p) => p.id)).size).toBe(parts.length);
		expect(parts[2].kind).toBe('body');
		expect(parts[2].kind === 'body' ? parts[2].parameters.material : null).toBe(
			LEGACY_TREE.materials.body
		);
	});
});

describe('a refusal is the model layer’s own sentence, rendered', () => {
	it('shows `deletePart`’s refusal VERBATIM and saves nothing', () => {
		const m = open();
		pick(m, BODY);
		press(m, 'ideacad-shape-delete');
		press(m, 'ideacad-shape-delete-confirm');

		const answer = deletePart(LEGACY_TREE, BODY);
		expect(answer.ok).toBe(false);
		const shown = refusalOn(m);
		expect(shown!.text).toBe(answer.ok ? null : answer.message);
		expect(shown!.reason).toBe(answer.ok ? null : answer.code);
		// PINNED SEPARATELY, so a rewording on BOTH sides at once is still caught.
		expect(shown!.text).toContain('the last body cannot be deleted');
		expect(m.saved).toEqual([]);
	});

	it('shows `movePart`’s refusal for a box somebody emptied, rather than nothing', () => {
		const m = open();
		pick(m, BLADES);
		const box = m.one<HTMLInputElement>('[data-testid="ideacad-shape-z"]');
		box.value = '';
		box.dispatchEvent(new Event('change', { bubbles: true }));
		m.flush();
		expect(refusalOn(m)!.text).toBe('Height along the axis must be a finite number.');
		expect(m.saved).toEqual([]);
	});

	it('clears the refusal on the next press that lands', () => {
		const m = open();
		pick(m, BODY);
		press(m, 'ideacad-shape-delete');
		press(m, 'ideacad-shape-delete-confirm');
		expect(refusalOn(m)).not.toBeNull();
		press(m, 'ideacad-shape-duplicate');
		expect(refusalOn(m)).toBeNull();
		expect(m.saved).toHaveLength(1);
	});
});

describe('an arrow whose only outcome is a refusal is ABSENT, not disabled', () => {
	it('drops Move up at the top and Move down at the bottom, and keeps both in the middle', () => {
		// A THIRD PIECE, so there IS a middle row to be the positive control: with
		// two pieces every row is an end and the absence proves nothing.
		const three = duplicatePart(LEGACY_TREE, BLADES);
		expect(three.ok).toBe(true);
		const tree = three.ok ? three.tree : LEGACY_TREE;
		const ids = (tree as BladePartsTree).parts.map((p) => p.id);
		const m = open({ bladeTree: tree });

		const arrows = (id: string) => {
			pick(m, id);
			return {
				up: m.all(`[data-part="${id}"] [data-testid="ideacad-shape-up"]`).length,
				down: m.all(`[data-part="${id}"] [data-testid="ideacad-shape-down"]`).length,
				// THE POSITIVE CONTROL ON THE SAME ROW: the row is not simply empty.
				others: m.all(
					`[data-part="${id}"] [data-testid="ideacad-shape-duplicate"], [data-part="${id}"] [data-testid="ideacad-shape-delete"]`
				).length
			};
		};
		expect(arrows(ids[0])).toEqual({ up: 0, down: 1, others: 2 });
		expect(arrows(ids[1])).toEqual({ up: 1, down: 1, others: 2 });
		expect(arrows(ids[2])).toEqual({ up: 1, down: 0, others: 2 });
	});

	it('never marks a rendered arrow disabled in either spelling', () => {
		const m = open();
		pick(m, BLADES);
		const up = m.one<HTMLButtonElement>('[data-testid="ideacad-shape-up"]');
		expect(up.getAttribute('aria-disabled')).toBeNull();
		expect(up.disabled).toBe(false);
	});
});

describe('delete costs two presses and the second names what it costs', () => {
	it('arms first: one press offers no confirm and deletes nothing', () => {
		const m = open();
		pick(m, BLADES);
		expect(m.all('[data-testid="ideacad-shape-delete-confirm"]')).toHaveLength(0);
		press(m, 'ideacad-shape-delete');
		const confirm = m.one('[data-testid="ideacad-shape-delete-confirm"]');
		expect(confirm.textContent).toContain(SHAPE[1].name);
		expect(m.saved).toEqual([]);
	});

	it('deletes on the second press, and Keep it disarms without deleting', () => {
		const m = open();
		pick(m, BLADES);
		press(m, 'ideacad-shape-delete');
		press(m, 'ideacad-shape-delete-cancel');
		expect(m.all('[data-testid="ideacad-shape-delete-confirm"]')).toHaveLength(0);
		expect(m.saved).toEqual([]);

		press(m, 'ideacad-shape-delete');
		press(m, 'ideacad-shape-delete-confirm');
		const expected = deletePart(LEGACY_TREE, BLADES);
		expect(expected.ok).toBe(true);
		expect(m.saved[0]).toEqual(expected.ok ? expected.tree : null);
	});
});

describe('selection is one id, and the panel is controlled only when somebody listens', () => {
	it('keeps its own selection when no `onselect` was handed down', () => {
		const m = open();
		expect(m.all('[data-testid="ideacad-shape-ops"]')).toHaveLength(0);
		pick(m, BODY);
		expect(m.all('[data-testid="ideacad-shape-ops"]')).toHaveLength(1);
		expect(m.one(`[data-part="${BODY}"] [data-testid="ideacad-shape-select"]`).getAttribute('aria-current')).toBe('true');
		// Pressing the open row closes it. That is how a part is deselected.
		pick(m, BODY);
		expect(m.all('[data-testid="ideacad-shape-ops"]')).toHaveLength(0);
	});

	it('ANNOUNCES the selection and stops owning it once `onselect` is there', () => {
		const picked: (string | null)[] = [];
		const m = open({ onselect: (id: string | null) => picked.push(id), selectedPartId: null });
		pick(m, BODY);
		expect(picked).toEqual([BODY]);
		// The parent did not reflect it, so nothing opened -- the controlled
		// contract, and the reason `selectedPartId` is a prop rather than a hint.
		expect(m.all('[data-testid="ideacad-shape-ops"]')).toHaveLength(0);
	});

	it('marks the id the parent selected, in the list that holds it', () => {
		const m = open({ onselect: () => {}, selectedPartId: BLADES });
		const marked = m
			.all('[data-testid="ideacad-shape-row"]')
			.filter((el) => el.getAttribute('aria-current') === null && el.classList.contains('picked'))
			.map((el) => el.getAttribute('data-part'));
		expect(marked).toEqual([BLADES]);
		expect(
			m.one(`[data-part="${BLADES}"] [data-testid="ideacad-shape-select"]`).getAttribute('aria-current')
		).toBe('true');
		expect(
			m.one(`[data-part="${BODY}"] [data-testid="ideacad-shape-select"]`).getAttribute('aria-current')
		).toBeNull();
	});
});

describe('the shape region does not disturb the assembly list', () => {
	it('renders no shape region at all without a tree, and the checkout list stands', () => {
		const m = open({ bladeTree: null });
		expect(m.all('[data-testid="ideacad-shape"]')).toHaveLength(0);
		expect(m.all('[data-testid="ideacad-parts"]')).toHaveLength(1);
	});
});
