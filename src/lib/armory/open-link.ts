/**
 * Open in SolidWorks on a file's page (ledger 0430, website feedback
 * ba81c57d; IDEA Armory 0.4.2). The page cannot open a file itself, so it
 * hands the file's id to the IDEA Armory app on this computer through the link
 * the app registers with Windows: exactly `idea-armory:open?f=<file id>`. The
 * app opens that file of its own Armory folder the way its own Open does
 * (SolidWorks for a part, read-only unless it is checked out to this
 * computer) and never checks anything out because of it. Anything else in the
 * link is refused by the app, so the page sends nothing but the id.
 *
 * A browser says nothing to the page about whether the link went anywhere. The
 * one sign is the window losing focus (the browser asks "Open IDEA Armory?",
 * or Armory comes to the front); a page still in front a moment after the
 * click says plainly that Armory is not on this computer, with the download.
 */

export const ARMORY_OPEN_SCHEME = 'idea-armory:';

/** How long the page waits after the click before it says Armory did not answer. */
export const OPEN_FALLBACK_MS = 2500;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The app's Open link for a file id, or null for anything that is not a file id. */
export function armoryOpenHref(fileId: string | null | undefined): string | null {
	const id = (fileId ?? '').trim();
	if (!UUID.test(id) || /^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(id)) return null;
	return `${ARMORY_OPEN_SCHEME}open?f=${id.toLowerCase()}`;
}

/** Whether a file can be opened at all: a file with a version that was not removed. */
export function openable(file: { deleted: boolean; current: unknown | null }): boolean {
	return !file.deleted && file.current != null;
}

/**
 * After the wait: the app answered when the page lost focus or was hidden at
 * any moment since the click; a page that kept focus and stayed visible
 * throughout heard nothing from it.
 */
export function armoryAnswered(seen: { blurred: boolean; hidden: boolean }): boolean {
	return seen.blurred || seen.hidden;
}
