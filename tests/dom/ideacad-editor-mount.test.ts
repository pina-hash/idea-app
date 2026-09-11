// tests/dom/ideacad-editor-mount.test.ts
//
// THE PREDICTION GATE, AND THE CONTROLS THE CONCEPT STRIP ADVERTISES.
//
// Ledger 0145 built this surface in a container with no browser and said so, so
// nothing here had ever been driven. Two of the things it shipped were wrong in
// ways no type check and no `svelte-check` can see, and both are structural
// rather than visual, which is what puts them in THIS directory rather than in
// the browser harness:
//
//   1. THE GATE WAS KEYED ON THE RATIONALE FIELD ITSELF (`{#if !prediction}`
//      over `bind:value={prediction}`), so the comparative physics unlocked on
//      the FIRST KEYSTROKE, with no concept picked and the Reveal control never
//      pressed. Measured in Chromium before the fix: one character typed into
//      "Say why" rendered `I 1626.6 g-cm2 / k 2.97 cm` under the heading
//      `Prediction: . h`. The gate is the whole pedagogical point of the
//      compare surface -- the student commits to an answer before the answer is
//      shown -- and it was open.
//   2. New, Duplicate, Rename, Delete and Commit as concept card carried NO
//      handler at all. Five controls that look like controls and do nothing is
//      worse than five absent ones, and this repo's own rule is that an omitted
//      transport REMOVES the control it drives.
//
// So the assertions below are written as the RULE rather than as the two bugs:
// the physics stays hidden through every path that is not the deliberate press,
// and each strip control is asserted by what it does to the concept list.
//
// WHAT THIS FILE DELIBERATELY DOES NOT ASSERT: any width, any ratio, any tap
// target. happy-dom has no layout engine, so every one of those reads zero and
// passes vacuously (`tests/dom/README.md`). They are measured in
// `tools/browser-verify/routes/ideacad-editor.mjs` against a real Chromium.

import { describe, expect, it } from 'vitest';
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

function open(props: Record<string, unknown> = {}) {
	return mountInto(Editor, {
		tree: DEFAULT_BLADE_TREE,
		config: DEFAULT_BLADE_CONFIG,
		concepts: structuredClone(THREE),
		...props
	});
}

/** The physics rows are a `<dl>` inside the compare sheet and nothing else in
 *  the surface renders one, so its presence IS "the gate is open". */
const physicsShown = (m: ReturnType<typeof open>) => m.all('.compare dl').length > 0;

const button = (m: ReturnType<typeof open>, label: string) =>
	m.all<HTMLButtonElement>('button').find((b) => b.textContent?.trim() === label);

const cardNames = (m: ReturnType<typeof open>) =>
	m.all('.concepts .card').map((b) => (b.querySelector('small')?.previousSibling?.textContent ?? b.textContent ?? '').trim());

describe('IdeaCAD: the prediction gate', () => {
	it('is closed when the compare surface opens', async () => {
		const m = open({ openCompare: true });
		expect(m.all('.compare').length).toBe(1); // positive control: the sheet IS rendered
		expect(physicsShown(m)).toBe(false);
		await m.stop();
	});

	it('stays closed while the rationale is typed, which is the defect that shipped', async () => {
		const m = open({ openCompare: true });
		const field = m.one<HTMLInputElement>('.compare input');
		field.value = 'because the rim carries the mass';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		expect(physicsShown(m)).toBe(false);
		await m.stop();
	});

	it('stays closed on a press with no concept picked, and the control says it is not ready', async () => {
		const m = open({ openCompare: true });
		const field = m.one<HTMLInputElement>('.compare input');
		field.value = 'because the rim carries the mass';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		const reveal = button(m, 'Reveal physics')!;
		// `aria-disabled`, never `disabled`, so the control can still explain itself --
		// which means the HANDLER has to refuse too. A real click reaches it.
		expect(reveal.getAttribute('aria-disabled')).toBe('true');
		reveal.click();
		m.flush();
		expect(physicsShown(m)).toBe(false);
		await m.stop();
	});

	it('stays closed on a picked concept with no press', async () => {
		const m = open({ openCompare: true });
		const pick = m.one<HTMLSelectElement>('.compare select');
		pick.value = 'c2';
		pick.dispatchEvent(new Event('change', { bubbles: true }));
		m.flush();
		expect(physicsShown(m)).toBe(false);
		await m.stop();
	});

	it('opens only on the deliberate press with both halves, and records the prediction', async () => {
		const seen: string[] = [];
		const m = open({
			openCompare: true,
			setPrediction: async (conceptId: string, rationale: string) => void seen.push(`${conceptId}:${rationale}`)
		});
		const pick = m.one<HTMLSelectElement>('.compare select');
		pick.value = 'c2';
		pick.dispatchEvent(new Event('change', { bubbles: true }));
		const field = m.one<HTMLInputElement>('.compare input');
		field.value = 'because the rim carries the mass';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		const reveal = button(m, 'Reveal physics')!;
		expect(reveal.getAttribute('aria-disabled')).toBe('false');
		reveal.click();
		await m.settle();
		expect(physicsShown(m)).toBe(true);
		expect(m.one('.compare').textContent).toContain('Wide four');
		expect(seen).toEqual(['c2:because the rim carries the mass']);
		await m.stop();
	});

	it('lists every live concept in the picker, so the gate cannot name one that is gone', async () => {
		const m = open({ openCompare: true });
		const options = m.all<HTMLOptionElement>('.compare option').map((o) => o.value);
		expect(options).toEqual(['', 'c1', 'c2', 'c3']);
		await m.stop();
	});
});

describe('IdeaCAD: the concept strip does what it advertises', () => {
	it('seeds the list it was handed and marks exactly one active', async () => {
		const m = open();
		expect(cardNames(m)).toEqual(['Concept 1', 'Wide four', 'Concept 3']);
		expect(m.all('.concepts .card.active').length).toBe(1);
		await m.stop();
	});

	it('New appends a concept and makes it active', async () => {
		const m = open();
		button(m, 'New')!.click();
		m.flush();
		expect(cardNames(m).length).toBe(4);
		expect(m.one('.concepts .card.active').textContent).toContain('Concept 4');
		await m.stop();
	});

	it('Duplicate copies the active concept under its own name', async () => {
		const m = open();
		button(m, 'Duplicate')!.click();
		m.flush();
		expect(cardNames(m)).toEqual(['Concept 1', 'Wide four', 'Concept 3', 'Concept 1 copy']);
		await m.stop();
	});

	it('Rename edits in place and keeps the concept count', async () => {
		const m = open();
		button(m, 'Rename')!.click();
		m.flush();
		const field = m.one<HTMLInputElement>('.concepts input.rename');
		field.value = 'Heavy rim';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		button(m, 'Save name')!.click();
		m.flush();
		expect(cardNames(m)).toEqual(['Heavy rim', 'Wide four', 'Concept 3']);
		await m.stop();
	});

	it('Delete arms first, names what it costs, and only then removes', async () => {
		const m = open();
		expect(button(m, 'Delete')).toBeTruthy();
		button(m, 'Delete')!.click();
		m.flush();
		// Armed: the confirm names the concept rather than saying "Delete" twice.
		const confirm = button(m, 'Delete Concept 1')!;
		expect(confirm).toBeTruthy();
		expect(cardNames(m).length).toBe(3); // nothing gone yet
		confirm.click();
		m.flush();
		expect(cardNames(m)).toEqual(['Wide four', 'Concept 3']);
		await m.stop();
	});

	it('offers no Delete for the last concept, and says why rather than leaving a gap', async () => {
		const m = open({ concepts: [{ id: 'c1', name: 'Only one', features: structuredClone(DEFAULT_BLADE_TREE) }] });
		expect(button(m, 'Delete')).toBeUndefined();
		expect(m.one('.concepts .note').textContent).toContain('cannot be deleted');
		await m.stop();
	});

	it('offers Commit only when the transport that performs it was handed in', async () => {
		const without = open();
		expect(button(without, 'Commit as concept card')).toBeUndefined();
		await without.stop();

		const committed: string[] = [];
		const with_ = open({ commitConceptCard: async (id: string) => void committed.push(id) });
		const control = button(with_, 'Commit as concept card')!;
		expect(control).toBeTruthy();
		control.click();
		await with_.settle();
		expect(committed).toEqual(['c1']);
		await with_.stop();
	});
});

describe('IdeaCAD: read-only is the absence of the writes, not a second render path', () => {
	it('renders the same feature tree and no write control at all', async () => {
		const student = open({ commitConceptCard: async () => {} });
		const teacher = open({ readOnly: true, commitConceptCard: async () => {} });

		// Positive control: the student surface HAS the controls being asserted absent.
		expect(student.all('.tree button').length).toBeGreaterThan(0);
		expect(student.all('.concepts button:not(.card)').length).toBeGreaterThan(0);
		expect(student.all('footer button').length).toBe(2);

		expect(teacher.all('.tree button').length).toBe(student.all('.tree button').length);
		expect(teacher.all('.concepts button:not(.card)').length).toBe(0);
		expect(teacher.all('footer').length).toBe(0);
		await student.stop();
		await teacher.stop();
	});
});
