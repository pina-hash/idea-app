// tests/dom/composer-drop-routing-mount.test.ts
//
// A FILE DROPPED ON THE COMPOSER'S TITLE REACHES THE BOX BUILT FOR IT (ledger
// 0297, package ITEM; report 21), measured on the REAL composer with a REAL drop
// event: a spec `.json` lands in the spec importer's box, a ported `.html` in
// the ported-document box, a `.zip` in the zip choice, and only an ordinary
// file on the class's Files list.
//
// BOTH DIRECTIONS, WITH COUNTS, per CLAUDE.md: for every typed file the target
// RECEIVED it AND the Files list did NOT. The photograph is the positive
// control that the Files list is being read at all -- a selector that matched
// nothing would read zero staged files for every case and pass the absences
// vacuously.
//
// THE MUTATION THIS EXISTS FOR (run by hand, restored from a byte copy): the
// root sending every file to the Files list again. It reddens the spec, html
// and zip cases on their "Files list is empty" half.

import { afterEach, describe, expect, it } from 'vitest';
import ContentComposer from '$lib/classroom/ContentComposer.svelte';
import type { ClassroomComposerTransports, ClassroomSection } from '$lib/classroom/classroom';
import { buildZip } from '$lib/foundry/zip-write';
import { mountInto, type Mounted } from './mount';
import { dropEvent } from './drag-events';

const SECTION: ClassroomSection = {
	id: 'sec-1',
	course_id: 'course-1',
	label: 'Block 3',
	block: '3',
	teacher_email: 'teacher@boscotech.edu',
	active: true,
	course: { id: 'course-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
};

const transports = {
	async createItem() {
		return { ok: true as const, data: { itemId: 'item-1', sectionIds: ['sec-1'] } };
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

const noop = async () => ({ ok: true as const, data: undefined });
const teacherTransports = new Proxy({}, { get: () => noop });
const deckTransports = { uploadDeck: noop, deleteDeck: noop };
const htmlAssignmentTransports = { setHtmlAssignment: noop };

let mounted: Mounted | null = null;
afterEach(async () => {
	await mounted?.stop();
	mounted = null;
});

function mountComposer() {
	mounted = mountInto(ContentComposer as never, {
		mode: 'create',
		kind: 'assignment',
		sections: [SECTION],
		initialTargets: ['sec-1'],
		transports,
		teacherTransports,
		deckTransports,
		htmlAssignmentTransports,
		htmlAssignmentAdmin: true,
		attachmentsEnabled: true,
		instructorAttachmentsEnabled: true,
		onsaved: () => {}
	});
	return mounted;
}

/** Filenames staged on the STUDENT-FACING Files list. */
function studentFiles(m: Mounted): string[] {
	const panel = m.all<HTMLElement>('.fup[data-role="attachment"]')[0];
	if (!panel) throw new Error('the Files panel is not mounted');
	return Array.from(panel.querySelectorAll('.fup-name')).map((n) => (n.textContent ?? '').trim());
}

function title(m: Mounted): HTMLInputElement {
	return m.one<HTMLInputElement>('.composer input[type="text"]');
}

async function waitFor(m: Mounted, predicate: () => boolean, tries = 40): Promise<boolean> {
	for (let i = 0; i < tries; i++) {
		await m.settle();
		if (predicate()) return true;
	}
	return predicate();
}

const SPEC_TEXT = JSON.stringify({ schemaVersion: 1, meta: { title: 'DROP-SENTINEL' }, modules: [] });

describe('a drop on the title goes to the box whose rule it matches', () => {
	it('POSITIVE CONTROL: a photograph lands on the Files list', async () => {
		const m = mountComposer();
		expect(studentFiles(m)).toEqual([]);
		title(m).dispatchEvent(dropEvent([new File([new Uint8Array(9)], 'bench.png', { type: 'image/png' })]));
		await m.settle();
		expect(studentFiles(m)).toEqual(['bench.png']);
	});

	it('a spec .json reaches the spec importer, and the Files list stays empty', async () => {
		const m = mountComposer();
		title(m).dispatchEvent(dropEvent([new File([SPEC_TEXT], 'lab-03.json', { type: 'application/json' })]));
		const landed = await waitFor(
			m,
			() => (m.all<HTMLTextAreaElement>('[data-testid="spec-paste"]')[0]?.value ?? '') === SPEC_TEXT
		);
		expect({ inImporter: landed, onFilesList: studentFiles(m).length }).toEqual({
			inImporter: true,
			onFilesList: 0
		});
	});

	it('a ported .html reaches the ported-document box, and the Files list stays empty', async () => {
		const m = mountComposer();
		title(m).dispatchEvent(
			dropEvent([new File(['<!doctype html><p>not a manifest</p>'], 'worksheet.html', { type: 'text/html' })])
		);
		// The box judged it (this fixture carries no manifest, so it is refused
		// with the box's OWN problem list -- which is exactly where a refusal
		// belongs).
		const judged = await waitFor(m, () => m.all('[data-testid="staged-html-issues"]').length === 1);
		expect({ judgedByTheBox: judged, onFilesList: studentFiles(m).length }).toEqual({
			judgedByTheBox: true,
			onFilesList: 0
		});
	});

	it('a .zip asks what it is, and a gallery adds its pictures to the Files list', async () => {
		const m = mountComposer();
		const png = (n: number) => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, n]);
		const zip = await buildZip([
			{ path: 'bench/photo2.png', bytes: png(2) },
			{ path: 'bench/photo10.png', bytes: png(10) }
		]);
		title(m).dispatchEvent(dropEvent([new File([zip as BlobPart], 'bench.zip', { type: 'application/zip' })]));
		const asked = await waitFor(m, () => m.all('[data-testid="zip-choice-gallery"]').length === 1);
		expect(asked).toBe(true);
		// Nothing was attached by the drop itself.
		expect(studentFiles(m)).toEqual([]);
		// No web page inside, so Presentation is absent WITH its reason.
		expect(m.all('[data-testid="zip-choice-presentation"]')).toHaveLength(0);
		expect(m.all('[data-testid="zip-choice-why"]').map((e) => e.textContent?.trim())).toEqual([
			'No web page inside, so it cannot be a presentation.'
		]);
		// A form-level drop may also keep the zip as a plain file.
		expect(m.all('[data-testid="zip-choice-attach"]')).toHaveLength(1);
		expect(m.one('[data-testid="zip-choice-gallery"]').textContent?.trim()).toBe('Image gallery (2 pictures)');

		(m.one('[data-testid="zip-choice-gallery"]') as HTMLButtonElement).click();
		const added = await waitFor(m, () => studentFiles(m).length === 2);
		expect(added).toBe(true);
		expect(studentFiles(m)).toEqual(['photo2.png', 'photo10.png']);
		expect(m.all('[data-testid="zip-choice"]')).toHaveLength(0);
	});
});
