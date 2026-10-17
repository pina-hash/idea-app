/**
 * OPEN THE ONE FEEDBACK WINDOW FROM SOMEWHERE OTHER THAN ITS BUTTON (ledger
 * 0396).
 *
 * The root layout's `SiteFeedback` is the only window on a Svelte page, and its
 * button sits in the bottom-right corner of every page. A surface that wants a
 * second way IN -- the error card's "Tell us what happened" is the one today --
 * calls `openSiteFeedback()` rather than mounting a second `SiteFeedback`: a
 * second mount is a second window with its own captured context, and the error
 * card's used to be exactly that, drawn in the card instead of in the corner.
 *
 * Client-only by construction: the window registers itself from an effect,
 * which never runs during a server render, so a request can never see another
 * request's window.
 */

type Opener = () => void;

let current: { open: Opener } | null = null;

/**
 * The window says it is here. Returns the release, which clears the slot only
 * if it still holds THIS registration, so a window that unmounts after another
 * one took over cannot clear the newer one.
 */
export function provideSiteFeedbackOpener(open: Opener): () => void {
	const entry = { open };
	current = entry;
	return () => {
		if (current === entry) current = null;
	};
}

/**
 * Open the window exactly as a press on its button does. False when there is
 * no window to open on this page (a surface with nothing to write through),
 * so the caller can say so rather than offer a control that does nothing.
 */
export function openSiteFeedback(): boolean {
	if (!current) return false;
	current.open();
	return true;
}
