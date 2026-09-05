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
 * THE STATEFUL LOGIC IS PLAIN FUNCTIONS, NOT A DOM LISTENER, on purpose.
 * `createDropController` is what `tests/classroom-file-drop.test.ts` drives in
 * the plain node project: synthetic event-shaped objects, no DOM needed, and it
 * calls back exactly what a real drag sequence would have. `tests/dom/` is a
 * second vitest project with a real DOM (happy-dom) and svelte's client build,
 * where `dropTarget`, the Svelte action, is driven directly through real
 * `dispatchEvent` calls against a mounted node -- see
 * `tests/dom/classroom-upload-picker-parity-mount.test.ts` and
 * `tests/dom/drag-events.ts`. The plain-function split still earns its keep: it
 * is what makes the drag/leave/drop/paste STATE MACHINE (the `dragDepth`
 * counting below) assertable without mounting a component for every case.
 *
 * A drop MATCHES THE PICKER IT SITS BESIDE, which is the rule, and "unfiltered"
 * is what that rule produces on the classroom's upload surfaces because "no
 * accept on a plain picker, on either side" governs them. A surface whose
 * picker DOES name a format -- the roster CSV import, the spec JSON import --
 * hands its own rule in as `accept`, so a drop can never take what its picker
 * refuses. A paste is filtered to `image/*` clipboard items on top of that,
 * matching the screenshot-paste convention this module replaces (it used to be
 * typed out separately in ContentComposer) -- a clipboard paste is far more
 * often text being pasted into a nearby field than a file, and only an image is
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

/**
 * WHICH HANDLER OWNS A PASTE, when more than one is listening on the way up.
 *
 * A `paste` event BUBBLES, and `preventDefault()` does not stop it, so every
 * ancestor handler sees the same event after the one closest to the caret has
 * already dealt with it. That is not hypothetical: the classroom composer
 * carries its own `onpaste` on the whole form -- so a screenshot pasted into
 * the title field or the body editor still reaches a file list -- and it mounts
 * FileUploadPanel twice INSIDE that form, each panel carrying `dropTarget`.
 * One screenshot pasted into the instructor-only panel was therefore staged
 * TWICE: once where it was aimed, and once on the student-facing list, which
 * the whole class may read.
 *
 * `claimPaste` is the one statement of "has something closer already taken
 * this". The first handler to ask gets `true` and owns the event; every
 * handler above it gets `false` and must do nothing at all -- not stage, and
 * not `preventDefault` either, since the owner has already made that call.
 *
 * A WeakSet rather than a flag written onto the event: nothing is added to a
 * real `ClipboardEvent`'s shape, the entry cannot outlive the event, and a
 * caller cannot mark an event as claimed without also finding out whether it
 * already was -- which a separate mark/check pair would let it do.
 */
const claimed = new WeakSet<object>();

export function claimPaste(e: object): boolean {
	if (claimed.has(e)) return false;
	claimed.add(e);
	return true;
}

export interface FileDropCallbacks {
	/** Files a drop or an image paste produced. Never called with an empty list. */
	onfiles: (files: File[]) => void;
	/** Dragover feedback, on or off. Only a drag CARRYING FILES turns it on. */
	onactive?: (active: boolean) => void;
	disabled?: boolean;
	/**
	 * THE SURFACE'S OWN PICKER RULE, asked of a dropped or pasted file BEFORE
	 * anything is handed over or claimed. Omitted means the surface takes
	 * anything, which is what every surface mounted before this parameter
	 * existed does and what "no `accept` on a plain picker, on either side"
	 * already says about the classroom's upload panels.
	 *
	 * IT EXISTS FOR THE SURFACES WHOSE PICKER IS NOT A PLAIN ONE. A roster
	 * import is `accept=".csv"` and a spec import is `accept=".json"`, because
	 * what those two consume is a FORMAT the feature parses rather than a file
	 * a person is handing in -- and a drop that accepted what the picker
	 * refuses is a bug with a friendly face.
	 *
	 * IT IS ALSO WHAT KEEPS THE PASTE CLAIM HONEST, which is the half that is
	 * not obvious. `claimPaste` makes the first handler to ask the OWNER of
	 * the event and every handler above it stand down; a surface that claimed
	 * a screenshot and then refused it would be a surface that silently ate
	 * one on its way to the composer's upload panel. So the filter runs FIRST
	 * and nothing is claimed unless something survived it.
	 */
	accept?: (file: File) => boolean;
	/**
	 * Files a drop or a paste produced that `accept` refused, so the surface
	 * can say WHY rather than appearing to do nothing. Never called with an
	 * empty list, and never called at all when there is no `accept`.
	 */
	onrejected?: (files: File[]) => void;
	/**
	 * HOW A DROP'S FILES ARE READ OFF THE `DataTransfer`, for the one surface
	 * whose answer is not `dataTransfer.files`.
	 *
	 * Foundry accepts a dropped FOLDER, which `files` does not enumerate: it
	 * takes `webkitGetAsEntry()` and walks the directory tree
	 * (`filesFromDataTransfer` in $lib/foundry/normalize). That is a reading
	 * of the transfer, not a second drop state machine, so it is a parameter
	 * here rather than a reason for that surface to keep hand-rolling
	 * `ondragover`/`ondrop` -- which is what it did until this existed, and
	 * which cost it the depth counting, the Files-only filter and `claimPaste`
	 * all at once.
	 */
	resolve?: (dt: DragLikeEvent['dataTransfer']) => File[] | Promise<File[]>;
}

/**
 * THE `accept` ATTRIBUTE'S OWN RULE, so a surface states its format ONCE.
 *
 * `spec` is exactly the string the `<input accept="...">` carries -- a
 * comma-separated list of extensions (`.csv`) and media types (`text/csv`,
 * `image/*`). The component writes that one constant into the attribute AND
 * hands it to `dropTarget`, so the picker and the drop are not two spellings
 * of one rule that can come apart; they are one value read twice. That is the
 * whole reason this lives here rather than as a predicate typed out beside
 * each picker.
 *
 * THE EXTENSION IS CHECKED AS WELL AS THE TYPE, AND EITHER ALONE IS ENOUGH.
 * `File.type` is legitimately EMPTY when the platform cannot determine a media
 * type, and it is a GUESS the source chose when it is not -- a `.csv` exported
 * by Excel routinely arrives as `application/vnd.ms-excel`, and a `.json`
 * dragged off a desktop often arrives with no type at all. Keying on the type
 * alone would refuse ordinary files; keying on the name alone would refuse a
 * pasted blob, which has an invented name. So either match admits the file,
 * which is also what the browser's own file picker does with the same string.
 *
 * AN EMPTY OR ABSENT SPEC ADMITS EVERYTHING, matching "no `accept` on a plain
 * picker, on either side": a surface that names no format takes any file, on
 * the picker and on the drop alike.
 */
export function matchesAccept(file: File, spec: string | undefined): boolean {
	const clauses = (spec ?? '')
		.split(',')
		.map((c) => c.trim().toLowerCase())
		.filter(Boolean);
	if (clauses.length === 0) return true;
	const name = (file.name ?? '').toLowerCase();
	const type = (file.type ?? '').toLowerCase();
	return clauses.some((clause) => {
		if (clause.startsWith('.')) return name.endsWith(clause);
		if (clause.endsWith('/*')) return type.startsWith(clause.slice(0, -1));
		return type === clause;
	});
}

/**
 * The `accept` split, in ONE place so a drop and a paste cannot come to
 * disagree about it. No filter means everything is taken, which is byte-identical
 * to the behaviour of every caller written before the parameter existed.
 */
function splitAccepted(
	files: File[],
	accept: ((file: File) => boolean) | undefined
): { taken: File[]; refused: File[] } {
	if (!accept) return { taken: files, refused: [] };
	const taken: File[] = [];
	const refused: File[] = [];
	for (const f of files) (accept(f) ? taken : refused).push(f);
	return { taken, refused };
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
 * can drive with synthetic events -- see the module note for the DOM-project
 * counterpart that drives the Svelte action itself with real events.
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
		// ASYNC ONLY BECAUSE OF `resolve`, and the caller never awaits it: the
		// `preventDefault` and the feedback reset are both SYNCHRONOUS, ahead of
		// any await, because a drop's default is cancelled during dispatch or not
		// at all. Everything after the await is the surface's own work.
		async drop(e: DragLikeEvent) {
			if (opts.disabled) return;
			if (isFileDrag(e)) e.preventDefault();
			depth = 0;
			setActive(false);
			const dt = e.dataTransfer;
			const all = opts.resolve ? await opts.resolve(dt) : Array.from(dt?.files ?? []);
			const { taken, refused } = splitAccepted(all, opts.accept);
			if (refused.length) opts.onrejected?.(refused);
			if (taken.length) opts.onfiles(taken);
		},
		paste(e: PasteLikeEvent) {
			if (opts.disabled) return;
			const files = filesFromClipboard(e);
			// Nothing to intercept: a plain-text paste falls straight through
			// with no `preventDefault`, so ordinary typing is untouched. This
			// stays AHEAD of the claim, or a text paste would be claimed by the
			// first surface it crossed and every surface above it would then
			// stand down over an event none of them was going to act on.
			if (!files.length) return;
			// AND THE SURFACE'S OWN RULE STAYS AHEAD OF THE CLAIM FOR THE SAME
			// REASON. A surface that cannot use this file must not become the
			// event's owner: `claimPaste` makes every handler above it stand
			// down, so claiming and then refusing is how a screenshot pasted
			// into a roster import would stop reaching the composer's upload
			// panel. Nothing is claimed, and nothing is reported as refused,
			// unless something survived.
			const { taken } = splitAccepted(files, opts.accept);
			if (!taken.length) return;
			if (!claimPaste(e)) return;
			e.preventDefault();
			opts.onfiles(taken);
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
	const onDrop = (e: Event) => void controller.drop(e as unknown as DragLikeEvent);
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
