// tests/dom/composer-attach-paste-mount.test.ts
//
// WHICH LIST A PASTED SCREENSHOT LANDS IN.
//
// The composer mounts FileUploadPanel TWICE -- the student-facing list and the
// instructor-only one -- and both panels carry `use:dropTarget`, whose paste
// listener sits on each panel's own root. The composer ALSO carries an
// `onpaste` on its outermost element, so that a screenshot pasted anywhere in
// the form (the title field, the body editor, the empty space beside them)
// still reaches a list.
//
// Those two are the same event. `preventDefault()` does not stop propagation,
// so a paste whose target is inside the instructor panel is handled by that
// panel AND THEN AGAIN by the composer root -- which stages it into the
// STUDENT-FACING list. Measured before the fix: one pasted screenshot, two
// staged copies, the second one on the list the whole class may read.
//
// The other direction matters just as much and is asserted here too: a paste
// aimed at nothing in particular must still reach the student list (that is
// what the composer-level handler is FOR), and a plain-TEXT paste must be left
// alone on every one of those targets.

import { describe, expect, it } from 'vitest';
import ContentComposer from '$lib/classroom/ContentComposer.svelte';
import type { ClassroomComposerTransports, ClassroomSection } from '$lib/classroom/classroom';
import { mountInto } from './mount';
import { imagePasteEvent, textPasteEvent } from './drag-events';

const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

/** The smallest transport object the composer will mount against. Nothing here
 *  is called by a paste -- staging is entirely local until a save. */
const transports = {
	async createItem() {
		return { ok: true as const, itemId: 'item-1' };
	},
	async updateItem() {
		return { ok: true as const };
	},
	async uploadAttachment() {
		return { ok: true as const };
	},
	async uploadInstructorAttachment() {
		return { ok: true as const };
	},
	async deleteAttachment() {
		return { ok: true as const };
	},
	async loadCategorySuggestions() {
		return [];
	}
} as unknown as ClassroomComposerTransports;

function mountComposer() {
	return mountInto(ContentComposer as never, {
		mode: 'create',
		kind: 'assignment',
		sections: [SECTION],
		initialTargets: ['sec-1'],
		transports,
		attachmentsEnabled: true,
		instructorAttachmentsEnabled: true,
		onsaved: () => {}
	});
}

/** The two panels, told apart by the `data-role` each already carries -- the
 *  attribute the panel renders to say which transport it was handed. A read by
 *  document order would silently follow the panels if the form were ever
 *  rearranged, and a read by label text would follow a copy change. */
function panels(m: ReturnType<typeof mountInto>) {
	return {
		student: m.all<HTMLElement>('.fup[data-role="attachment"]')[0] ?? null,
		instructor: m.all<HTMLElement>('.fup[data-role="instructor"]')[0] ?? null,
		count: m.all('.fup').length
	};
}

/** Staged filenames inside one panel. */
const staged = (root: HTMLElement | null) =>
	root ? Array.from(root.querySelectorAll('.fup-name')).map((n) => (n.textContent ?? '').trim()) : [];

describe('ContentComposer: where a pasted screenshot lands', () => {
	it('mounts both panels, both empty', async () => {
		const m = mountComposer();
		try {
			const p = panels(m);
			expect(p.count).toBe(2);
			expect(p.student).not.toBeNull();
			expect(p.instructor).not.toBeNull();
			expect(staged(p.student)).toEqual([]);
			expect(staged(p.instructor)).toEqual([]);
		} finally {
			await m.stop();
		}
	});

	it('a paste inside the INSTRUCTOR panel stages there and NOWHERE ELSE', async () => {
		const m = mountComposer();
		try {
			const p = panels(m);
			p.instructor!.dispatchEvent(imagePasteEvent('shot.png'));
			m.flush();

			const inst = staged(p.instructor);
			const stu = staged(p.student);
			// Both counts reported: "landed in the right list" and "did not also
			// land in the wrong one" are two different facts.
			expect({ instructor: inst.length, student: stu.length }).toEqual({
				instructor: 1,
				student: 0
			});
		} finally {
			await m.stop();
		}
	});

	it('a paste inside the STUDENT panel stages there once, not twice', async () => {
		const m = mountComposer();
		try {
			const p = panels(m);
			p.student!.dispatchEvent(imagePasteEvent('shot.png'));
			m.flush();

			expect({
				student: staged(p.student).length,
				instructor: staged(p.instructor).length
			}).toEqual({ student: 1, instructor: 0 });
		} finally {
			await m.stop();
		}
	});

	it('a paste aimed at nothing in particular still reaches the student list', async () => {
		const m = mountComposer();
		try {
			const p = panels(m);
			const title = m.one<HTMLElement>('input[type="text"]') ?? m.target;
			title.dispatchEvent(imagePasteEvent('shot.png'));
			m.flush();

			expect({
				student: staged(p.student).length,
				instructor: staged(p.instructor).length
			}).toEqual({ student: 1, instructor: 0 });
		} finally {
			await m.stop();
		}
	});

	it('a plain-TEXT paste is left alone on every target', async () => {
		const m = mountComposer();
		try {
			const p = panels(m);
			for (const node of [p.student!, p.instructor!, m.target]) {
				const ev = textPasteEvent();
				node.dispatchEvent(ev);
				m.flush();
				// Not swallowed: the surface must not have called preventDefault,
				// or ordinary typing into the fields inside it stops working.
				expect(ev.defaultPrevented).toBe(false);
			}
			expect({
				student: staged(p.student).length,
				instructor: staged(p.instructor).length
			}).toEqual({ student: 0, instructor: 0 });
		} finally {
			await m.stop();
		}
	});
});
