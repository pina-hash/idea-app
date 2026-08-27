/**
 * THE SHARED DROP TARGET, for every classroom upload surface.
 *
 * There was no drop handling anywhere in the app -- a teacher could only
 * attach a file through the "Choose files" picker, one click at a time, on
 * every surface that has one. This is the primitive that adds dragover
 * feedback, a drop, and a paste to an EXISTING upload surface with no new
 * element in the DOM and no new transport: `onfiles` is handed exactly the
 * `File[]` the surface's own picker already produces, and the surface itself
 * decides what to do with them (stage it, upload it, refuse it) exactly as it
 * already does for a picked file.
 *
 * THE STATEFUL LOGIC IS PLAIN FUNCTIONS, NOT A DOM LISTENER, on purpose. This
 * repo has no DOM/event-dispatch harness (see
 * tests/classroom-manager-spec-visibility.test.ts) -- `vitest.config.ts` runs
 * `environment: 'node'`, so a test cannot construct a real `<div>` and fire a
 * real `DragEvent` at it. `createDropController` is what a test CAN drive: it
 * takes synthetic event-shaped objects and calls back exactly what a real
 * drag sequence would have. `dropTarget`, the Svelte action, is the thin (and
 * therefore untested-directly, like every other DOM-wiring action in this
 * codebase) layer that connects that controller to real `addEventListener`
 * calls on the node it is placed on.
 *
 * A drop is UNFILTERED, matching the picker it sits beside: any file type,
 * because "no accept on the picker, anywhere" already governs what these
 * surfaces accept. A paste is filtered to `image/*` clipboard items, matching
 * the screenshot-paste convention this module replaces (it used to be typed
 * out separately in ContentComposer) -- a clipboard paste is far more often
 * text being pasted into a nearby field than a file, and only an image is
 * unambiguously something to attach rather than something to type.
 */

/** The minimal shape read from a real `DragEvent`. */
export interface DragLikeEvent {
	dataTransfer: {
		readonly types: ArrayLike<string>;
		readonly files?: ArrayLike<File>;
	} | null;
	preventDefault(): void;
}

/** The minimal shape read from a real `ClipboardEvent`. */
export interface PasteLikeEvent {
	clipboardData: {
		readonly items?: ArrayLike<{ kind: string; type: string; getAsFile(): File | null }>;
	} | null;
	preventDefault(): void;
}

export interface FileDropCallbacks {
	/** Files a drop or an image paste produced. Never called with an empty list. */
	onfiles: (files: File[]) => void;
	/** Dragover feedback, on or off. Only a drag CARRYING FILES turns it on. */
	onactive?: (active: boolean) => void;
	disabled?: boolean;
}

/**
 * Is this drag carrying files at all -- checked against `dataTransfer.types`,
 * which is the only thing readable during `dragenter`/`dragover`
 * (`dataTransfer.files` is empty until `drop`, by spec). Refusing a text or
 * link drag here is what stops the whole surface lighting up for a drag that
 * was never going to produce a file.
 */
export function isFileDrag(e: DragLikeEvent): boolean {
	const types = e.dataTransfer?.types;
	return !!types && Array.from(types).includes('Files');
}

/**
 * Every `image/*` item a paste is carrying, turned into named `File`s.
 *
 * A pasted image arrives as a clipboard ITEM with no name -- `items`, never
 * `files`, which several browsers leave empty for a synthesized clipboard
 * blob -- so a filename is invented here. Anything that is not a file, or is
 * a file but not a picture, is left alone: pasting TEXT into a nearby field
 * must keep working exactly as it always did, with no `preventDefault` and
 * no interception.
 */
export function filesFromClipboard(e: PasteLikeEvent): File[] {
	const items = e.clipboardData?.items;
	if (!items) return [];
	const out: File[] = [];
	for (const item of Array.from(items)) {
		if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
		const file = item.getAsFile();
		if (!file) continue;
		const ext = item.type.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'png';
		const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.${ext}`;
		out.push(new File([file], name, { type: item.type }));
	}
	return out;
}

/**
 * The event handling behind the shared drop target, as PLAIN FUNCTIONS a test
 * can drive with synthetic events -- see the module note for why this is
 * split out of the Svelte action rather than tested through one.
 *
 * `dragDepth` is what makes leaving the target reliable: a drag over a child
 * element fires `dragleave` on the parent before `dragenter` on the child, so
 * clearing the feedback on the FIRST `dragleave` flickers it off and on for
 * every pixel crossed between a surface's own child elements. Counting enter
 * against leave and clearing only at zero is the standard fix.
 */
export function createDropController(opts: FileDropCallbacks) {
	let depth = 0;
	const setActive = (active: boolean) => opts.onactive?.(active);
	return {
		dragEnter(e: DragLikeEvent) {
			if (opts.disabled || !isFileDrag(e)) return;
			e.preventDefault();
			depth += 1;
			setActive(true);
		},
		dragOver(e: DragLikeEvent) {
			// Not just feedback: a dragover with no `preventDefault` is what tells
			// the browser this target does not accept a drop at all, and the
			// `drop` event never fires.
			if (opts.disabled || !isFileDrag(e)) return;
			e.preventDefault();
		},
		dragLeave() {
			if (opts.disabled) return;
			depth = Math.max(0, depth - 1);
			if (depth === 0) setActive(false);
		},
		drop(e: DragLikeEvent) {
			if (opts.disabled) return;
			if (isFileDrag(e)) e.preventDefault();
			depth = 0;
			setActive(false);
			const files = Array.from(e.dataTransfer?.files ?? []);
			if (files.length) opts.onfiles(files);
		},
		paste(e: PasteLikeEvent) {
			if (opts.disabled) return;
			const files = filesFromClipboard(e);
			if (!files.length) return;
			e.preventDefault();
			opts.onfiles(files);
		}
	};
}

/**
 * THE SVELTE ACTION. `use:dropTarget={{ onfiles, onactive, disabled }}` on an
 * EXISTING upload surface's own root element -- never a wrapper, so nothing
 * about the surface's layout moves. `onactive` flips whatever class the
 * surface's own stylesheet reads for its dragover feedback; the feedback
 * itself must be drawn with `outline` (never `border`) and, if a label is
 * wanted, an absolutely positioned overlay, since neither occupies layout
 * space.
 */
export function dropTarget(node: HTMLElement, initial: FileDropCallbacks) {
	let controller = createDropController(initial);

	const onDragEnter = (e: Event) => controller.dragEnter(e as unknown as DragLikeEvent);
	const onDragOver = (e: Event) => controller.dragOver(e as unknown as DragLikeEvent);
	const onDragLeave = () => controller.dragLeave();
	const onDrop = (e: Event) => controller.drop(e as unknown as DragLikeEvent);
	const onPaste = (e: Event) => controller.paste(e as unknown as PasteLikeEvent);

	node.addEventListener('dragenter', onDragEnter);
	node.addEventListener('dragover', onDragOver);
	node.addEventListener('dragleave', onDragLeave);
	node.addEventListener('drop', onDrop);
	node.addEventListener('paste', onPaste);

	return {
		update(next: FileDropCallbacks) {
			controller = createDropController(next);
		},
		destroy() {
			node.removeEventListener('dragenter', onDragEnter);
			node.removeEventListener('dragover', onDragOver);
			node.removeEventListener('dragleave', onDragLeave);
			node.removeEventListener('drop', onDrop);
			node.removeEventListener('paste', onPaste);
		}
	};
}

/**
 * THE PASTE-ROUTING DECISION for a surface that has no place of its own to
 * hold a pasted image -- an assignment answer field is a textarea, so an
 * image cannot sit inline in it. `imageCount` is `filesFromClipboard(e).length`;
 * `hasTarget` is whether a place to send the image both EXISTS (a module has
 * an image zone) and is REACHABLE right now (its upload panel is actually
 * mounted -- uploads may be disabled, or the zone may not have rendered a
 * panel for some other reason). Returns:
 *
 *   - `null` when there is nothing to intercept (no image was pasted), so the
 *     caller must not call `preventDefault` and a plain-text paste keeps
 *     working exactly as it always did;
 *   - the sentence to show otherwise -- one for "sent", one for "nowhere to
 *     send it" -- so a paste never looks like it silently did nothing AND
 *     never claims to have moved an image nobody can find.
 */
export function pasteRouteMessage(
	imageCount: number,
	hasTarget: boolean
): { sent: boolean; text: string } | null {
	if (imageCount === 0) return null;
	if (hasTarget) {
		return {
			sent: true,
			text: `${imageCount} pasted image${imageCount === 1 ? '' : 's'} sent to the photo zone below.`
		};
	}
	return { sent: false, text: 'This module has no photo zone to send a pasted image to.' };
}
