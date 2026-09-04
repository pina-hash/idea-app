// tests/dom/composer-attach-parity-mount.test.ts
//
// THE PASTE PATH AND THE PICKER AGREE ABOUT WHAT THEY WILL CARRY.
//
// "A paste that accepts what the picker refuses is a bug with a friendly
// face": the file arrives, stages, looks staged, and is then refused at the
// far end -- or worse, is not refused and gets uploaded on a path the picker
// would never have let it onto.
//
// The two entry points are `stage(input.files)` from the picker's `onchange`
// and `stage(files)` from `dropTarget`'s paste. They are the same function
// TODAY, which is the whole design; this asserts it as an OUTCOME rather than
// by reading the source, so a future change that gives the paste path a filter
// of its own reddens here instead of shipping.
//
// THE CORPUS IS ALL IMAGES ON PURPOSE. Paste is deliberately image-only (a
// clipboard is far more often text being typed than a file to attach), so a
// mixed corpus would differ between the two paths for a reason that is correct
// and would make this test assert the wrong thing. Restricted to what paste is
// willing to carry at all, the two must agree EXACTLY -- and the interesting
// member is the ZERO-BYTE image, which the picker refuses in `stage` and which
// a paste path with its own filter would happily let through.
//
// NO GEOMETRY IS ASSERTED HERE -- happy-dom has no layout engine. See
// tests/dom/mount.ts.

import { describe, expect, it } from 'vitest';
import FileUploadPanel from '$lib/classroom/FileUploadPanel.svelte';
import { mountInto } from './mount';
import { pasteEvent } from './drag-events';

/** A real image file of the given size. Zero bytes is a real thing a clipboard
 *  and a file picker can both produce (a truncated download, a failed save). */
function img(name: string, bytes: number): File {
	return new File([new Uint8Array(bytes)], name, { type: 'image/png' });
}

/** The corpus, built once so both paths are put to the IDENTICAL files rather
 *  than to two lists that happen to look alike. */
const CORPUS = () => [img('empty.png', 0), img('real.png', 12)];

function openPanel() {
	return mountInto(FileUploadPanel as never, {
		role: 'attachment',
		itemId: 'item-1',
		label: 'Files',
		upload: async () => ({ ok: true as const, storageKey: '' })
	});
}

const stagedNames = (m: ReturnType<typeof mountInto>) =>
	m.all('.fup-name').map((n) => (n.textContent ?? '').trim());

/** Drive the picker exactly as a browser does: put the files on the input and
 *  fire its own `change`. Nothing about `stage` is called directly. */
function throughPicker(files: File[]): string[] {
	const m = openPanel();
	try {
		const input = m.all<HTMLInputElement>('input[type="file"]')[0];
		const dt = new DataTransfer();
		for (const f of files) dt.items.add(f);
		Object.defineProperty(input, 'files', { value: dt.files, configurable: true });
		input.dispatchEvent(new Event('change', { bubbles: true }));
		m.flush();
		return stagedNames(m);
	} finally {
		void m.stop();
	}
}

/** Drive the paste path exactly as a browser does: a real `paste` event at the
 *  panel root, carrying the same files as clipboard items. */
function throughPaste(files: File[]): string[] {
	const m = openPanel();
	try {
		const root = m.one<HTMLElement>('.fup');
		root.dispatchEvent(
			pasteEvent(files.map((f) => ({ kind: 'file', type: f.type, file: f })))
		);
		m.flush();
		return stagedNames(m);
	} finally {
		void m.stop();
	}
}

describe('paste and picker agree about what they will carry', () => {
	it('the picker refuses the zero-byte file and keeps the real one', () => {
		// The positive control for the comparison below: if the picker staged
		// everything, "the two agree" would be satisfied by a paste path that
		// also filtered nothing, and the test would pass over the defect.
		expect(throughPicker(CORPUS())).toEqual(['real.png']);
	});

	it('the paste path stages exactly what the picker stages', () => {
		const picked = throughPicker(CORPUS());
		const pasted = throughPaste(CORPUS());
		expect(pasted).toEqual(picked);
	});

	it('neither path stages a zero-byte image', () => {
		expect(throughPaste(CORPUS())).not.toContain('empty.png');
		expect(throughPicker(CORPUS())).not.toContain('empty.png');
	});
});
