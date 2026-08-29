// tests/dom/drag-events.ts
//
// REAL EVENTS, DISPATCHED AT A REAL NODE, carrying the one payload happy-dom
// will not build for us.
//
// `src/lib/file-drop.ts` says in its own header that "this repo has no
// DOM/event-dispatch harness ... so a test cannot construct a real `<div>` and
// fire a real `DragEvent` at it", which is why its stateful half was split out
// as plain functions. That sentence is now out of date: this directory can
// construct the div, attach the action, fire the event and read what the
// component did. The split is still right -- `createDropController` remains
// the cheaper place to assert the drag-depth arithmetic -- but the ACTION
// itself, the listeners it registers and the class it flips are reachable
// here for the first time.
//
// THE ONE SYNTHESIZED PART, AND WHY. happy-dom ships a real `DataTransfer`
// (its `items.add` works and its `files` is a real FileList), but its `types`
// reports the file's MIME TYPE where a browser reports the literal string
// `'Files'` -- measured: `["text/plain"]` against a browser's `["Files"]`.
// `isFileDrag` reads exactly that string, by specification, because `types` is
// the only thing readable during `dragenter`/`dragover`. So `types` is
// overridden to the spec value and NOTHING ELSE IS: the FileList, the event,
// the dispatch, the listeners and `preventDefault` are all the real ones.
// Overriding more would start to test the fixture.
//
// `new DragEvent(...)` is likewise not usable as-is: happy-dom constructs it
// but leaves `dataTransfer` UNDEFINED whatever the init dictionary says, so a
// plain `Event` with the transfer defined onto it is the closer article, not
// the further one.

/** A `DataTransfer` carrying these files, reporting `types` the way a browser
 *  reporting a file drag does. */
function fileTransfer(files: File[]): DataTransfer {
	const dt = new DataTransfer();
	for (const file of files) dt.items.add(file);
	Object.defineProperty(dt, 'types', { value: ['Files'], configurable: true });
	return dt;
}

function withTransfer(type: string, dt: DataTransfer): Event {
	const event = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'dataTransfer', { value: dt, configurable: true });
	return event;
}

/** `dragenter` / `dragover` / `dragleave`: during a drag `files` is empty by
 *  specification, and only `types` says whether files are coming. */
export function dragEvent(type: 'dragenter' | 'dragover' | 'dragleave'): Event {
	return withTransfer(type, fileTransfer([]));
}

/** A drag carrying no files at all -- a text or link drag, which must not light
 *  the surface up. */
export function textDragEvent(type: 'dragenter' | 'dragover'): Event {
	const dt = new DataTransfer();
	Object.defineProperty(dt, 'types', { value: ['text/plain'], configurable: true });
	return withTransfer(type, dt);
}

export function dropEvent(files: File[]): Event {
	return withTransfer('drop', fileTransfer(files));
}

/**
 * A paste carrying clipboard ITEMS.
 *
 * happy-dom's `ClipboardEvent` leaves `clipboardData` null, and a pasted image
 * arrives as an `items` entry with no name in every browser anyway -- which is
 * the case `filesFromClipboard` exists to name -- so the items list is defined
 * onto a real `paste` event.
 */
export function pasteEvent(
	items: { kind: string; type: string; file: File | null }[]
): Event {
	const event = new Event('paste', { bubbles: true, cancelable: true });
	Object.defineProperty(event, 'clipboardData', {
		value: {
			items: items.map((i) => ({ kind: i.kind, type: i.type, getAsFile: () => i.file }))
		},
		configurable: true
	});
	return event;
}

export function imagePasteEvent(name = 'image.png'): Event {
	return pasteEvent([
		{ kind: 'file', type: 'image/png', file: new File(['png'], name, { type: 'image/png' }) }
	]);
}

/** A plain-text paste: nothing to intercept, and the surface must leave it
 *  alone rather than swallowing it. */
export function textPasteEvent(): Event {
	return pasteEvent([{ kind: 'string', type: 'text/plain', file: null }]);
}
