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
// tested in isolation rather than through any one of them. Since 0032 the
// roster CSV import, the spec JSON import and the Foundry submit zone share it
// too, which is what `accept` and `resolve` are for.

import { describe, expect, it, vi } from 'vitest';
import {
	createDropController,
	filesFromClipboard,
	isFileDrag,
	matchesAccept,
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


// ---------------------------------------------------------------------------
// `accept`: the surface's own picker rule, on the drop AND on the paste.
//
// A DROP THAT TOOK WHAT ITS PICKER REFUSES IS A BUG WITH A FRIENDLY FACE, and
// the paste half is worse than that: `claimPaste` makes the first handler to
// ask the OWNER of the event, so a surface that claimed a file and then refused
// it would silently swallow one on its way to a handler that wanted it. The
// filter therefore runs BEFORE the claim, which is what these assert.
// ---------------------------------------------------------------------------

describe('matchesAccept -- one string for the picker attribute and the drop', () => {
	it('an extension clause matches on the filename, case-insensitively', () => {
		expect(matchesAccept(file('roster.csv'), '.csv,text/csv')).toBe(true);
		expect(matchesAccept(file('ROSTER.CSV'), '.csv,text/csv')).toBe(true);
		expect(matchesAccept(file('roster.txt'), '.csv,text/csv')).toBe(false);
	});

	it('a media-type clause matches on the type', () => {
		expect(matchesAccept(file('x', 'text/csv'), '.csv,text/csv')).toBe(true);
		expect(matchesAccept(file('x', 'application/pdf'), '.csv,text/csv')).toBe(false);
	});

	it('EITHER half is enough, which is what makes a real file work', () => {
		// A .csv off a desktop routinely arrives with an empty type (the
		// platform could not determine one) or with Excel's own guess. Keying
		// on the type alone would refuse both.
		expect(matchesAccept(file('roster.csv', ''), '.csv,text/csv')).toBe(true);
		expect(matchesAccept(file('roster.csv', 'application/vnd.ms-excel'), '.csv,text/csv')).toBe(
			true
		);
		// And a pasted blob has an invented name but a real type.
		expect(matchesAccept(file('pasted-1.png', 'image/png'), 'image/*')).toBe(true);
	});

	it('a wildcard clause matches the whole family', () => {
		expect(matchesAccept(file('a.png', 'image/png'), 'image/*')).toBe(true);
		expect(matchesAccept(file('a.pdf', 'application/pdf'), 'image/*')).toBe(false);
	});

	it('no spec admits everything -- "no accept on a plain picker, on either side"', () => {
		expect(matchesAccept(file('anything.step'), undefined)).toBe(true);
		expect(matchesAccept(file('anything.step'), '')).toBe(true);
		expect(matchesAccept(file('anything.step'), '   ')).toBe(true);
	});
});

describe('createDropController: accept', () => {
	const isCsv = (f: File) => matchesAccept(f, '.csv,text/csv');

	it('a drop hands over what the picker would take and reports the rest', () => {
		const onfiles = vi.fn();
		const onrejected = vi.fn();
		const good = file('roster.csv');
		const bad = file('photo.png', 'image/png');
		createDropController({ onfiles, onrejected, accept: isCsv }).drop(dragEvent([good, bad]));
		expect(onfiles).toHaveBeenCalledWith([good]);
		expect(onrejected).toHaveBeenCalledWith([bad]);
	});

	it('a drop of nothing acceptable calls onfiles NOT AT ALL, but still says why', () => {
		const onfiles = vi.fn();
		const onrejected = vi.fn();
		createDropController({ onfiles, onrejected, accept: isCsv }).drop(
			dragEvent([file('photo.png', 'image/png')])
		);
		expect(onfiles).not.toHaveBeenCalled();
		expect(onrejected).toHaveBeenCalledTimes(1);
	});

	it('WITH NO accept, a drop is unchanged -- every surface written before this', () => {
		const onfiles = vi.fn();
		const onrejected = vi.fn();
		const files = [file('a.step'), file('b.zip')];
		createDropController({ onfiles, onrejected }).drop(dragEvent(files));
		expect(onfiles).toHaveBeenCalledWith(files);
		expect(onrejected).not.toHaveBeenCalled();
	});

	it('A PASTE THE SURFACE CANNOT USE IS NOT CLAIMED, so a handler above still gets it', () => {
		// THE ASSERTION THIS WHOLE PARAMETER EXISTS FOR. The roster import and
		// the spec import both render inside surfaces that DO want a pasted
		// screenshot; if either claimed one and then refused it, the screenshot
		// would vanish between the caret and the upload panel.
		const rosterFiles = vi.fn();
		const rosterRejected = vi.fn();
		const composerFiles = vi.fn();

		const roster = createDropController({
			onfiles: rosterFiles,
			onrejected: rosterRejected,
			accept: isCsv
		});
		const composer = createDropController({ onfiles: composerFiles });

		const e = pasteEvent([clipboardItem('file', 'image/png', file('shot.png', 'image/png'))]);
		roster.paste(e); // the handler closest to the caret
		composer.paste(e); // the form above it

		expect(rosterFiles, 'the roster takes nothing').not.toHaveBeenCalled();
		expect(rosterRejected, 'and does not report a refusal it never claimed').not.toHaveBeenCalled();
		// The composer's own claim is what cancelled it -- exactly once, and not
		// by the handler that refused the file.
		expect(e.prevented, 'cancelled by the handler that took it').toBe(true);
		expect(composerFiles, 'the screenshot reaches the composer').toHaveBeenCalledTimes(1);
	});

	it('POSITIVE CONTROL: without accept, the inner handler DOES claim it and the outer stands down', () => {
		// The same two handlers, the same event, the filter removed. If this
		// did not change behaviour, the assertion above would prove nothing.
		const innerFiles = vi.fn();
		const outerFiles = vi.fn();
		const inner = createDropController({ onfiles: innerFiles });
		const outer = createDropController({ onfiles: outerFiles });
		const e = pasteEvent([clipboardItem('file', 'image/png', file('shot.png', 'image/png'))]);
		inner.paste(e);
		outer.paste(e);
		expect(innerFiles).toHaveBeenCalledTimes(1);
		expect(outerFiles).not.toHaveBeenCalled();
	});

	it('a paste that IS acceptable is claimed and filtered to what survived', () => {
		const onfiles = vi.fn();
		const controller = createDropController({
			onfiles,
			accept: (f) => matchesAccept(f, 'image/png')
		});
		const e = pasteEvent([clipboardItem('file', 'image/png', file('a.png', 'image/png')), clipboardItem('file', 'image/jpeg', file('b.jpg', 'image/jpeg'))]);
		controller.paste(e);
		expect(onfiles).toHaveBeenCalledTimes(1);
		expect(onfiles.mock.calls[0][0].map((f: File) => f.type)).toEqual(['image/png']);
		expect(e.prevented).toBe(true);
	});

	it('ORDINARY TYPING IS UNTOUCHED with a filter as without one', () => {
		// A plain-text paste yields no files at all, so it returns ahead of both
		// the filter and the claim: no call, no refusal report, and critically
		// no preventDefault, whatever the surface's accept says.
		const onfiles = vi.fn();
		const onrejected = vi.fn();
		const e = pasteEvent([clipboardItem('string', 'text/plain', null)]);
		createDropController({ onfiles, onrejected, accept: isCsv }).paste(e);
		expect(onfiles).not.toHaveBeenCalled();
		expect(onrejected).not.toHaveBeenCalled();
		expect(e.prevented).toBe(false);
	});
});

// ---------------------------------------------------------------------------
// `resolve`: the one surface whose files are not `dataTransfer.files`.
// ---------------------------------------------------------------------------

describe('createDropController: resolve', () => {
	it('a resolver is asked for the files instead of dataTransfer.files', async () => {
		// Foundry accepts a dropped FOLDER, which `files` does not enumerate:
		// it walks `webkitGetAsEntry()`. That is a reading of the transfer, not
		// a second drop state machine, so it is handed in.
		const onfiles = vi.fn();
		const walked = [file('index.html'), file('style.css')];
		const controller = createDropController({
			onfiles,
			resolve: async () => walked
		});
		await controller.drop(dragEvent([]));
		expect(onfiles).toHaveBeenCalledWith(walked);
	});

	it('the resolver still goes through accept', async () => {
		const onfiles = vi.fn();
		const onrejected = vi.fn();
		const controller = createDropController({
			onfiles,
			onrejected,
			accept: (f) => f.name.endsWith('.html'),
			resolve: async () => [file('index.html'), file('notes.md')]
		});
		await controller.drop(dragEvent([]));
		expect(onfiles.mock.calls[0][0].map((f: File) => f.name)).toEqual(['index.html']);
		expect(onrejected.mock.calls[0][0].map((f: File) => f.name)).toEqual(['notes.md']);
	});

	it('THE DEFAULT IS CANCELLED SYNCHRONOUSLY, ahead of the await', async () => {
		// A drop's default is cancelled during dispatch or not at all, so
		// `preventDefault` and the feedback reset must not sit behind an
		// awaited resolver. Asserted by reading them BEFORE awaiting.
		const onactive = vi.fn();
		let release: (files: File[]) => void = () => {};
		const controller = createDropController({
			onfiles: vi.fn(),
			onactive,
			resolve: () => new Promise<File[]>((r) => (release = r))
		});
		controller.dragEnter(dragEvent([file('a.zip')]));
		onactive.mockClear();
		const e = dragEvent([file('a.zip')]);
		const pending = controller.drop(e);
		expect(e.prevented, 'cancelled before the resolver settles').toBe(true);
		expect(onactive, 'feedback cleared before the resolver settles').toHaveBeenCalledWith(false);
		release([]);
		await pending;
	});
});
