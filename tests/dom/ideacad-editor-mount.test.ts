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
//      `Prediction: . h`.
//
//      THERE IS NO GATE ANY MORE, ON MR. PINA'S DECISION OF 2026-09-12, and the
//      first block below is now the inverse of what this paragraph describes.
//      The history is kept rather than deleted because it is the reason the
//      inverse assertions are written out at all: a leak nobody could see once
//      cost two bundles, and an absent test would leave the removal looking like
//      the same leak coming back.
//   2. New, Duplicate, Rename, Delete and Commit as concept card carried NO
//      handler at all. Five controls that look like controls and do nothing is
//      worse than five absent ones, and this repo's own rule is that an omitted
//      transport REMOVES the control it drives.
//
// So the assertions below are written as the RULE rather than as the two bugs:
// the physics is visible on every path and the prediction is still collected,
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

describe('IdeaCAD: the physics is never gated, and the prediction is still collected', () => {
	// MR. PINA DECIDED ON 2026-09-12 THAT PHYSICS IS ALWAYS VISIBLE
	// (`docs/decisions/entries/26-*`). IDEA100 is a rotation class, there is no
	// time to teach the mathematics behind rotational inertia, and visible
	// numbers help students build maximally competitive designs.
	//
	// THIS BLOCK IS THE INVERSE OF THE ONE IT REPLACES, deliberately and on the
	// record. What it used to assert -- closed on open, closed while typing,
	// closed on a press with half an answer, open only on the deliberate press
	// -- was correct against ledgers 0160 and 0171, whose prompts predated his
	// answer. Every one of those assertions is now a statement that the feature
	// is broken, so each is asserted the other way round rather than deleted:
	// an absent test would leave nothing saying the gate was removed on purpose.

	it('shows the comparative physics the moment the compare sheet opens, with no prediction anywhere', async () => {
		const m = open({ openCompare: true });
		expect(m.all('.compare').length).toBe(1); // positive control: the sheet IS rendered
		expect(physicsShown(m)).toBe(true);
		// One block per concept, so the sheet is comparative rather than showing
		// the active concept's numbers alone.
		expect(m.all('.compare dl').length).toBe(3);
		expect(m.one('.compare').textContent).toContain('g·cm²');
		await m.stop();
	});

	it('renders inertia and radius of gyration in the Rules rail from the first frame, with no compare sheet open', async () => {
		const m = open();
		// THE RAIL, NOT THE SHEET. The compare surface is a thing a student opens;
		// the rail is what is on screen when the editor mounts, which is where
		// "from the first frame" has to be true.
		expect(m.all('.compare').length).toBe(0);
		const rail = m.one('.readouts').textContent ?? '';
		expect(rail).toContain('Rotational inertia');
		expect(rail).toContain('Radius of gyration');
		expect(rail).toMatch(/g·cm²/);
		await m.stop();
	});

	it('still asks for a prediction, and records it through the transport', async () => {
		const seen: string[] = [];
		const m = open({
			openCompare: true,
			setPrediction: async (conceptId: string, rationale: string) => void seen.push(`${conceptId}:${rationale}`)
		});
		expect(m.one('.compare').textContent).toContain('Which of your concepts spins longest?');
		const pick = m.one<HTMLSelectElement>('.compare select');
		pick.value = 'c2';
		pick.dispatchEvent(new Event('change', { bubbles: true }));
		const field = m.one<HTMLInputElement>('.compare input');
		field.value = 'because the rim carries the mass';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		const record = button(m, 'Record prediction')!;
		expect(record.getAttribute('aria-disabled')).toBe('false');
		record.click();
		await m.settle();
		expect(seen).toEqual(['c2:because the rim carries the mass']);
		// The form is replaced by what was said, so nobody is asked twice about
		// one document -- and the physics was, and stays, on screen throughout.
		expect(button(m, 'Record prediction')).toBeUndefined();
		expect(m.one('.compare').textContent).toContain('Wide four');
		expect(physicsShown(m)).toBe(true);
		await m.stop();
	});

	it('refuses an incomplete prediction without ever touching the physics', async () => {
		const seen: string[] = [];
		const m = open({
			openCompare: true,
			setPrediction: async (conceptId: string, rationale: string) => void seen.push(`${conceptId}:${rationale}`)
		});
		const field = m.one<HTMLInputElement>('.compare input');
		field.value = 'because the rim carries the mass';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		const record = button(m, 'Record prediction')!;
		// `aria-disabled`, never `disabled`, so the control can still explain
		// itself -- which means the HANDLER has to refuse too, and a real click
		// is what asks it.
		expect(record.getAttribute('aria-disabled')).toBe('true');
		record.click();
		await m.settle();
		expect(seen).toEqual([]);
		expect(physicsShown(m)).toBe(true);
		await m.stop();
	});

	it('keeps the form standing when the write is refused, so what was typed is not lost', async () => {
		const m = open({
			openCompare: true,
			setPrediction: async () => {
				throw new Error('no');
			}
		});
		const pick = m.one<HTMLSelectElement>('.compare select');
		pick.value = 'c2';
		pick.dispatchEvent(new Event('change', { bubbles: true }));
		const field = m.one<HTMLInputElement>('.compare input');
		field.value = 'because the rim carries the mass';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		m.flush();
		button(m, 'Record prediction')!.click();
		await m.settle();
		expect(button(m, 'Record prediction')).toBeDefined();
		expect(m.one('.compare .refusal').textContent).toContain('did not save');
		expect(physicsShown(m)).toBe(true);
		await m.stop();
	});

	it('shows a prediction already recorded instead of asking again', async () => {
		const m = open({
			openCompare: true,
			prediction: { conceptId: 'c3', rationale: 'the narrow one', at: '2026-09-12' }
		});
		expect(button(m, 'Record prediction')).toBeUndefined();
		expect(m.one('.compare').textContent).toContain('Concept 3');
		expect(physicsShown(m)).toBe(true);
		await m.stop();
	});

	it('lists every live concept in the picker, so a prediction cannot name one that is gone', async () => {
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
