// tests/dom/classroom-manager-spec-visibility-mount.test.ts
//
// THE BOUNDARY ITSELF, RATHER THAN ITS SHAPE.
//
// `tests/classroom-manager-spec-visibility.test.ts` pins the same guarantee
// from the SSR markup and from ItemDetail's source, and stays exactly as it
// is -- what a browser RECEIVES is a different question from what a browser
// then does, and a writable control appearing in the served HTML is a real
// regression before a single effect has run. What that file says it cannot
// reach, in its own words:
//
//     "THERE IS NO DOM/EVENT-DISPATCH HARNESS IN THIS REPO (no jsdom, no
//      @testing-library ...). So 'dispatched input reaches a control' is
//      proven the way it is provable without one: by asserting on the REAL
//      component's REAL SSR markup that no writable control exists in the
//      output at all ... There is no input to dispatch TO, which is the
//      strongest available claim short of an actual DOM."
//
// This is the actual DOM. The manager's render is mounted, every control in it
// is enumerated from the live tree, and real `input`/`change` events are fired
// at them with a write transport injected that a real manager page never
// passes. Nothing may reach it.
//
// ONE MEASUREMENT DECIDED THE SHAPE OF THIS FILE, and it is worth writing
// down because it is counter-intuitive: `dispatchEvent` at a control carrying
// `disabled` STILL RUNS ITS LISTENER. Measured here -- firing `change` at the
// manager render's two disabled checklist boxes called SpecRenderer's
// `toggleItem` twice. That is not a defect in the component and not a
// happy-dom quirk: `disabled` bars a control from USER interaction and from
// constraint validation, it does not unregister listeners, and an explicit
// `dispatchEvent` is not user interaction. A browser will never deliver a
// person's click there.
//
// So the claim is stated in the two halves that are actually true, and the
// second is the load-bearing one:
//
//   1. THE MANAGER'S RENDER EXPOSES NO ENABLED CONTROL. Enumerated live, both
//      directions against the student's render of the identical spec.
//   2. ABSENCE IS THE MECHANISM. The real call site passes no `onvalue`,
//      `onupload`, `ondeletefile` or `oncaption` at all (the SSR file asserts
//      that from source), so even the path a synthetic event can force has
//      nothing to call. Mounted the way ItemDetail mounts it, the whole
//      dispatch sweep -- disabled controls included -- writes nothing and
//      throws nothing.
//
// A file that only asserted (1) would be one refactor away from a manager
// render whose controls are enabled but inert, and a file that only asserted
// (2) would pass over a render full of live inputs.
//
// MUTATION-CHECKED, both directions; see this bundle's history entry.
//
// NO GEOMETRY IS ASSERTED HERE. See `tests/dom/mount.ts` for why.

import { describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import SpecRenderer from '$lib/classroom/SpecRenderer.svelte';
import { controlsIn, isEnabled, mountInto, typeAt } from './mount';
import type { AssignmentSpec } from '$lib/classroom/assignment-spec';

const Spec = SpecRenderer as unknown as Component<Record<string, unknown>>;

/** One of every interactive block type SpecRenderer knows how to draw -- the
 *  SSR file's fixture, so the two halves of this guarantee are asserted over
 *  the same content. */
const SPEC: AssignmentSpec = {
	schemaVersion: 1,
	meta: { assignmentId: 'a-1', title: 'Bridge design', totalPoints: 10 },
	modules: [
		{
			id: 'm1',
			title: 'Design notes',
			points: 10,
			intro: 'Read this before you start.',
			blocks: [
				{ type: 'instructions', content: 'Sketch your bridge before you build it.' },
				{ type: 'textField', id: 'reasoning', prompt: 'Why this design?' },
				{
					type: 'table',
					id: 'materials',
					columns: [
						{ key: 'part', label: 'Part' },
						{ key: 'qty', label: 'Qty' }
					]
				},
				{ type: 'imageZone', id: 'photos', minImages: 1, captions: true },
				{ type: 'checklist', id: 'safety', items: ['Goggles on', 'Area clear'] }
			]
		}
	]
};

/** One row on the table, so the editable-cell path is really rendered (an
 *  empty table draws a placeholder row and no cell at all). */
const VALUES = { materials: { rows: [{ part: 'Beam', qty: '2' }] } };

/** Mount with a HOSTILE write transport: something a manager's page never
 *  passes, injected precisely so that a write, if one happened, would be
 *  visible as a count rather than as nothing. */
function mountWithSpy(readonly: boolean) {
	const writes: string[] = [];
	const m = mountInto(Spec, {
		spec: SPEC,
		initialValues: VALUES,
		readonly,
		uploadEnabled: false,
		onvalue: (blockId: string) => writes.push(blockId)
	});
	return { m, writes };
}

describe("the manager's mounted render exposes nothing a person can write into", () => {
	it('has controls, and every one of them is disabled -- the student has enabled ones', async () => {
		const manager = mountWithSpy(true);
		const student = mountWithSpy(false);
		try {
			const managerControls = controlsIn(manager.m.target);
			const studentControls = controlsIn(student.m.target);

			// POSITIVE CONTROL FIRST: a render that drew no controls at all would
			// satisfy every absence below without exercising anything.
			expect(managerControls.length).toBeGreaterThan(0);
			expect(studentControls.length).toBeGreaterThan(managerControls.length);

			expect(managerControls.filter(isEnabled)).toHaveLength(0);
			expect(studentControls.filter(isEnabled).length).toBeGreaterThan(0);

			// The content is genuinely THERE. This is a visibility fix; a blank
			// pane would also have no enabled controls.
			expect(manager.m.target.textContent).toContain('Sketch your bridge before you build it.');
			expect(manager.m.target.textContent).toContain('Why this design?');
			expect(manager.m.target.textContent).toContain('Design notes');
		} finally {
			await manager.m.stop();
			await student.m.stop();
		}
	});

	it('dispatching input and change at every ENABLED control writes nothing, and writes for a student', async () => {
		const manager = mountWithSpy(true);
		const student = mountWithSpy(false);
		try {
			const managerEnabled = controlsIn(manager.m.target).filter(isEnabled);
			for (const el of managerEnabled) typeAt(el);
			manager.m.flush();
			expect(manager.writes).toEqual([]);

			// POSITIVE CONTROL, and the one that makes the line above mean
			// something: the identical sweep on the identical spec, rendered for
			// a student, reaches the transport.
			const studentEnabled = controlsIn(student.m.target).filter(isEnabled);
			expect(studentEnabled.length).toBeGreaterThan(0);
			for (const el of studentEnabled) typeAt(el);
			student.m.flush();
			expect(student.writes.length).toBeGreaterThan(0);
		} finally {
			await manager.m.stop();
			await student.m.stop();
		}
	});

	it('and forcing the DISABLED ones too still writes nothing, because there is no transport wired', async () => {
		// ABSENCE IS THE MECHANISM. Mounted the way ItemDetail mounts it -- no
		// `onvalue`, no `onupload`, no `ondeletefile`, no `oncaption` -- so the
		// one path a synthetic event can force (see this file's header: a
		// dispatched event runs a disabled control's listener) has nothing to
		// call. `readonly` alone is a user-input gate; this is the boundary.
		const m = mountInto(Spec, {
			spec: SPEC,
			initialValues: VALUES,
			readonly: true,
			uploadEnabled: false
		});
		try {
			const controls = controlsIn(m.target);
			expect(controls.length).toBeGreaterThan(0);
			for (const el of controls) typeAt(el);
			m.flush();
			// Nothing threw on the way through, and there was nothing to call.
			// The values the manager is reading are unchanged on screen.
			expect(m.target.textContent).toContain('Beam');
		} finally {
			await m.stop();
		}
	});

	it('offers no file input and no row-editing buttons to click at all', async () => {
		const manager = mountWithSpy(true);
		const student = mountWithSpy(false);
		try {
			expect(manager.m.all('input[type="file"]')).toHaveLength(0);

			const label = (b: Element) => (b.textContent ?? '').trim();
			const managerButtons = manager.m.all('button').map(label);
			const studentButtons = student.m.all('button').map(label);

			expect(managerButtons.filter((t) => /add row/i.test(t))).toHaveLength(0);
			// POSITIVE CONTROL: the student's render of the same table has one.
			expect(studentButtons.filter((t) => /add row/i.test(t)).length).toBeGreaterThan(0);

			// What the manager DOES get is the reading controls, which are the
			// point of the fix: the disclosures are still pressable.
			expect(manager.m.trigger('module-body')).not.toBeNull();
			expect(manager.m.trigger('module-instructions')).not.toBeNull();
		} finally {
			await manager.m.stop();
			await student.m.stop();
		}
	});
});
