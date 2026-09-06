/**
 * THE PROJECTOR'S FULLSCREEN, AND THE WAY BACK OUT.
 *
 * Pulled out of `TvStage.svelte` by prompt 0091 because two of the three
 * things in here are rules rather than rendering, and one of them is a defect
 * that was reproduced character for character off a real report:
 *
 *   Mr. Pina, 2026-09-06, typed into the report box ON the tournament screen:
 *     "ullscreen ormatting is poor. missing button to go back to last page"
 *
 *   Both dropped letters are `f`. `TvStage` bound a `svelte:window` keydown
 *   that matched `f`/`F` and called `preventDefault()` UNCONDITIONALLY, and
 *   `SiteFeedback` is mounted in the root layout, so the report box is on this
 *   page like every other. Two window listeners on the SAME node: FeedbackBox's
 *   `stopPropagation()` cannot stop a sibling listener on that node (only
 *   `stopImmediatePropagation()` would), so the stage's handler ran anyway,
 *   ate the character, and toggled fullscreen while somebody was typing a
 *   sentence about fullscreen. Measured in Chromium: typing "Fullscreen
 *   formatting is poor" into that box produced "ullscreen ormatting is poor".
 *
 * `keyTargetIsTextEntry` is the whole fix and it lives here, alone, because a
 * second copy of "is somebody typing" is the copy that stops matching. Any
 * page-level hotkey asks it first.
 */

/**
 * Is this keydown's target somewhere a person is entering text?
 *
 * Deliberately WIDER than `<input type=text>`: a date field, a search box, a
 * `contenteditable` prose editor and a `<select>` all consume keys, and a
 * hotkey that fires over any of them is the same defect wearing a different
 * element. `isContentEditable` covers ProseMirror, which is the shape this
 * repo's rich text actually arrives in.
 *
 * A NON-ELEMENT TARGET IS NOT TEXT ENTRY and must answer false rather than
 * throwing: a synthetic event can carry `null`, and a handler that throws on
 * one is a handler that stops working for every real key after it.
 */
export function keyTargetIsTextEntry(target: EventTarget | null): boolean {
	if (!target || typeof target !== 'object') return false;
	const el = target as Partial<HTMLElement> & { tagName?: string };
	const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
	if (el.isContentEditable === true) return true;
	return false;
}

/**
 * Does this keydown carry a modifier that makes it somebody else's shortcut?
 *
 * Ctrl+F is the browser's find, Cmd+F is the same on a Mac, Alt+F opens a menu
 * on Windows. A bare `f` is the projector's; anything with a modifier on it is
 * not, and swallowing it is the same theft as swallowing a typed letter.
 */
export function keyHasModifier(e: Pick<KeyboardEvent, 'ctrlKey' | 'metaKey' | 'altKey'>): boolean {
	return e.ctrlKey || e.metaKey || e.altKey;
}

/** Is the document showing a fullscreen element right now? */
export function fullscreenActive(doc: Document | null | undefined): boolean {
	if (!doc) return false;
	const d = doc as Document & { webkitFullscreenElement?: Element | null };
	return !!(d.fullscreenElement ?? d.webkitFullscreenElement ?? null);
}

/**
 * Toggle fullscreen on `el`, swallowing every rejection.
 *
 * EVERY ENGINE REFUSES `requestFullscreen` WITHOUT A USER GESTURE and iOS has
 * no element fullscreen at all, so the promise rejecting is an ordinary
 * outcome and not an error to report. What is NOT ordinary is an unhandled
 * rejection on a screen nobody is standing at: it reaches `handleError`, mints
 * a correlation id and logs a 500-shaped line for a keypress that did nothing.
 */
export function toggleFullscreen(el: Element | null | undefined, doc: Document | null | undefined) {
	if (!doc) return;
	if (fullscreenActive(doc)) {
		void Promise.resolve(doc.exitFullscreen?.()).catch(() => {});
		return;
	}
	const target = el as (Element & { requestFullscreen?: () => Promise<void> }) | null | undefined;
	if (!target?.requestFullscreen) return;
	void Promise.resolve(target.requestFullscreen()).catch(() => {});
}

/**
 * How long the exit control stays at full strength after the last sign of a
 * person, before settling back to its quiet state.
 *
 * IT DIMS, IT NEVER HIDES, and that is the load-bearing half. The ordinary
 * answer for a control over a projected image is to fade it out entirely after
 * a few seconds of stillness -- but the failure this control exists to fix is
 * "somebody is stuck in front of a room", and a control that has vanished is
 * one more thing they have to know how to summon. A pill that is present but
 * quiet is off the image for the audience and still there for the person at
 * the machine, and it is focusable by Tab at every moment rather than only
 * after a reveal gesture the keyboard cannot easily perform.
 */
export const EXIT_CONTROL_IDLE_MS = 4000;
