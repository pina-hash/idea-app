// tests/classroom-file-drop.test.ts
//
// The shared drop target ($lib/file-drop), driven exactly the way this repo
// drives DOM-adjacent logic with no jsdom and no @testing-library (see
// classroom-manager-spec-visibility.test.ts): the stateful event handling is
// split into PLAIN FUNCTIONS (`createDropController`) that take synthetic
// event-shaped objects, so a test can drive a real drag/drop/paste sequence
// without a real `<div>` or a real `DragEvent`. The Svelte action
// (`dropTarget`) is the thin, untested-directly wiring layer that connects
// those functions to real `addEventListener` calls -- the same split every
// other DOM-wiring action in this codebase leaves unwired to a test.
//
// Every classroom upload surface (an attachment panel, an instructor-only
// panel, a hand-in's photo zone, the deck upload) shares this ONE primitive,
// so a bug here is a bug on all four at once. That is exactly why it is
// tested in isolation rather than through any one of them.

import { describe, expect, it, vi } from 'vitest';
import {
	createDropController,
	filesFromClipboard,
	isFileDrag,
	pasteRouteMessage,
	type DragLikeEvent,
	type PasteLikeEvent
} from '../src/lib/file-drop';

function file(name: string, type = 'application/octet-stream'): File {
	return new File([new Uint8Array(4)], name, { type });
}

/** A synthetic drag carrying real files, or nothing at all. */
function dragEvent(files: File[] | null): DragLikeEvent & { prevented: boolean } {
	const ev = {
		dataTransfer: files
			? { types: ['Files'], files }
			: { types: ['text/plain'], files: [] },
		prevented: false,
		preventDefault() {
			this.prevented = true;
		}
	};
	return ev;
}

/** A synthetic clipboard paste: an image item, a plain-text item, or both. */
function clipboardItem(kind: string, type: string, asFile: File | null) {
	return { kind, type, getAsFile: () => asFile };
}
function pasteEvent(
	items: ReturnType<typeof clipboardItem>[]
): PasteLikeEvent & { prevented: boolean } {
	return {
		clipboardData: { items },
		prevented: false,
		preventDefault() {
			this.prevented = true;
		}
	};
}

describe('isFileDrag', () => {
	it('is true when the drag carries a Files type', () => {
		expect(isFileDrag(dragEvent([file('a.png')]))).toBe(true);
	});
	it('is false for a plain text/link drag', () => {
		expect(isFileDrag(dragEvent(null))).toBe(false);
	});
	it('is false with no dataTransfer at all', () => {
		expect(isFileDrag({ dataTransfer: null, preventDefault() {} })).toBe(false);
	});
});

describe('filesFromClipboard', () => {
	it('extracts an image item and names it', () => {
		const png = file('image.png', 'image/png');
		const out = filesFromClipboard(pasteEvent([clipboardItem('file', 'image/png', png)]));
		expect(out).toHaveLength(1);
		expect(out[0].type).toBe('image/png');
		// A synthesized clipboard blob's own name is the generic one browsers
		// use ("image.png"); that is exactly the case a fresh name is invented
		// for, so this must NOT be "image.png" verbatim.
		expect(out[0].name).not.toBe('image.png');
		expect(out[0].name).toMatch(/^pasted-\d+\.png$/);
	});

	it('keeps a real filename when the clipboard actually carried one', () => {
		const shot = file('screenshot-2026.png', 'image/png');
		const out = filesFromClipboard(pasteEvent([clipboardItem('file', 'image/png', shot)]));
		expect(out[0].name).toBe('screenshot-2026.png');
	});

	it('a plain-text paste yields no files -- untouched, not discarded', () => {
		const out = filesFromClipboard(pasteEvent([{ kind: 'string', type: 'text/plain', getAsFile: () => null }]));
		expect(out).toEqual([]);
	});

	it('ignores a non-image file item (e.g. a copied document)', () => {
		const doc = file('report.pdf', 'application/pdf');
		const out = filesFromClipboard(pasteEvent([clipboardItem('file', 'application/pdf', doc)]));
		expect(out).toEqual([]);
	});

	it('no clipboardData at all is empty, not a throw', () => {
		expect(filesFromClipboard({ clipboardData: null, preventDefault() {} })).toEqual([]);
	});
});

describe('createDropController: drop', () => {
	it('a drop carrying files calls onfiles with them', () => {
		const onfiles = vi.fn();
		const controller = createDropController({ onfiles });
		const files = [file('a.step'), file('b.zip')];
		controller.drop(dragEvent(files));
		expect(onfiles).toHaveBeenCalledTimes(1);
		expect(onfiles).toHaveBeenCalledWith(files);
	});

	it('a drop with no files does not call onfiles', () => {
		const onfiles = vi.fn();
		const controller = createDropController({ onfiles });
		controller.drop(dragEvent(null));
		expect(onfiles).not.toHaveBeenCalled();
	});

	it('a disabled target ignores a drop entirely', () => {
		const onfiles = vi.fn();
		const onactive = vi.fn();
		const controller = createDropController({ onfiles, onactive, disabled: true });
		controller.dragEnter(dragEvent([file('a.png')]));
		controller.drop(dragEvent([file('a.png')]));
		expect(onfiles).not.toHaveBeenCalled();
		expect(onactive).not.toHaveBeenCalled();
	});

	it('a drop clears the feedback whether or not it carried files', () => {
		const onactive = vi.fn();
		const controller = createDropController({ onfiles: vi.fn(), onactive });
		controller.dragEnter(dragEvent([file('a.png')]));
		onactive.mockClear();
		controller.drop(dragEvent(null));
		expect(onactive).toHaveBeenCalledWith(false);
	});
});

describe('createDropController: dragover feedback', () => {
	it('entering turns the feedback on', () => {
		const onactive = vi.fn();
		const controller = createDropController({ onfiles: vi.fn(), onactive });
		controller.dragEnter(dragEvent([file('a.png')]));
		expect(onactive).toHaveBeenCalledWith(true);
	});

	it('leaving the target clears the feedback', () => {
		const onactive = vi.fn();
		const controller = createDropController({ onfiles: vi.fn(), onactive });
		controller.dragEnter(dragEvent([file('a.png')]));
		onactive.mockClear();
		controller.dragLeave();
		expect(onactive).toHaveBeenCalledWith(false);
	});

	it('a drag over a CHILD element does not flicker the feedback off', () => {
		// The real-world shape this depth counter exists for: entering a child
		// fires dragenter on the child before dragleave fires on the parent, so
		// naively clearing on the first dragleave would flicker the outline off
		// and back on for every pixel crossed inside the surface.
		const onactive = vi.fn();
		const controller = createDropController({ onfiles: vi.fn(), onactive });
		controller.dragEnter(dragEvent([file('a.png')])); // enters the panel
		controller.dragEnter(dragEvent([file('a.png')])); // enters a child inside it
		onactive.mockClear();
		controller.dragLeave(); // leaves the child, back onto the panel
		expect(onactive).not.toHaveBeenCalled();
		controller.dragLeave(); // leaves the panel for real
		expect(onactive).toHaveBeenCalledWith(false);
	});

	it('a text/link dragover never turns the feedback on', () => {
		const onactive = vi.fn();
		const controller = createDropController({ onfiles: vi.fn(), onactive });
		controller.dragEnter(dragEvent(null));
		expect(onactive).not.toHaveBeenCalled();
	});
});

describe('createDropController: paste', () => {
	it('a paste carrying an image calls onfiles and prevents the default', () => {
		const onfiles = vi.fn();
		const controller = createDropController({ onfiles });
		const png = file('x.png', 'image/png');
		const ev = pasteEvent([clipboardItem('file', 'image/png', png)]);
		controller.paste(ev);
		expect(onfiles).toHaveBeenCalledTimes(1);
		expect(ev.prevented).toBe(true);
	});

	it('a paste of plain text is untouched: no call, no preventDefault', () => {
		const onfiles = vi.fn();
		const controller = createDropController({ onfiles });
		const ev = pasteEvent([{ kind: 'string', type: 'text/plain', getAsFile: () => null }]);
		controller.paste(ev);
		expect(onfiles).not.toHaveBeenCalled();
		expect(ev.prevented).toBe(false);
	});

	it('a disabled target ignores a paste', () => {
		const onfiles = vi.fn();
		const controller = createDropController({ onfiles, disabled: true });
		const ev = pasteEvent([clipboardItem('file', 'image/png', file('x.png', 'image/png'))]);
		controller.paste(ev);
		expect(onfiles).not.toHaveBeenCalled();
		expect(ev.prevented).toBe(false);
	});
});

describe('pasteRouteMessage -- the answer-field routing decision', () => {
	it('no image pasted: nothing to intercept', () => {
		expect(pasteRouteMessage(0, true)).toBeNull();
		expect(pasteRouteMessage(0, false)).toBeNull();
	});

	it('an image pasted with a zone available: routed, worded for the count', () => {
		expect(pasteRouteMessage(1, true)).toEqual({
			sent: true,
			text: '1 pasted image sent to the photo zone below.'
		});
		expect(pasteRouteMessage(3, true)).toEqual({
			sent: true,
			text: '3 pasted images sent to the photo zone below.'
		});
	});

	it('an image pasted with nowhere to send it: said out loud, not discarded', () => {
		const route = pasteRouteMessage(1, false);
		expect(route?.sent).toBe(false);
		expect(route?.text).toMatch(/no photo zone/i);
	});
});
