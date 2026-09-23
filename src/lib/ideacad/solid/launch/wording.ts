// src/lib/ideacad/solid/launch/wording.ts
//
// EVERY SENTENCE THE LAUNCH PAGE SAYS ABOUT KEEPING, SHELVING AND REMOVING A
// MODEL, IN ONE PLACE. The mount test asserts that the archive sentence and
// the trash sentence DIFFER and that a confirm NAMES the document; the harness
// and the real page both read these, so the two cannot drift.
//
// ARCHIVE AND DELETE ARE TWO DECISIONS AND NEITHER MAY ABSORB THE OTHER
// (CLAUDE.md's Foundry rule, and decision 29 for IdeaCAD): Archive keeps the
// model readable and listed; the trash removes it after a window. A linked
// assignment document has no trash path at all -- `0217` refuses it -- so the
// control's place is taken by a sentence saying why.
//
// THE WINDOW IS `_ideacad_trash_window()` IN 0217, THIRTY DAYS. The number is
// mirrored here ONLY for the sentence a student reads BEFORE the row is in
// the trash, when there is no purgeAt yet. Afterwards every date on screen is
// derived from the row's own `purgeAt`, so a migration that moved the window
// would move every after-sentence on its own and this constant would be the
// one thing left to correct.
export const TRASH_WINDOW_DAYS = 30;

/** A missing RPC (`PGRST202`) is a deployment sitting before 0217, not a fault. */
export const STORAGE_UNAVAILABLE =
	'Folders, tags, renaming, copies and the trash are not available until the storage update is applied. Your models still open and save.';

export const ARCHIVE_SENTENCE = 'Keeps the model readable and listed under Archived; restore any time.';
export const UNARCHIVE_SENTENCE = 'Puts the model back with your live models so it can be edited again.';
export const TRASH_SENTENCE = `Goes to the trash for ${TRASH_WINDOW_DAYS} days, then it is removed for good. Restore it from the trash before then.`;
export const LINKED_KEPT_SENTENCE = 'Assignment work is kept, never deleted; archive it instead.';
export const PURGE_SENTENCE = 'Removes the model for good right now. There is no undo and no trash to restore it from.';
export const FOLDER_DELETE_SENTENCE = 'Deleting a folder unfiles the models in it. They stay in your library; nothing is deleted.';

export const EMPTY_LIBRARY = 'No models yet';
export const EMPTY_ARCHIVED = 'Nothing is archived';
export const EMPTY_TRASH = 'The trash is empty';
export const EMPTY_FOLDER = 'This folder is empty';
export const EMPTY_SEARCH = 'No models match';
export const NEW_MODEL_TITLE = 'Untitled model';

/** The two-step confirms. Each one NAMES the document, because a confirm that
 *  says "this model" over a grid of thirty cards is a confirm about nothing. */
export const trashConfirm = (title: string) => `Move "${title}" to the trash?`;
export const purgeConfirm = (title: string) => `Remove "${title}" for good?`;
export const archiveConfirm = (title: string) => `Archive "${title}"?`;
export const unarchiveConfirm = (title: string) => `Restore "${title}" from the archive?`;
export const folderDeleteConfirm = (name: string, count: number) =>
	`Delete the folder "${name}"? ${count === 1 ? '1 model is' : `${count} models are`} unfiled, not deleted.`;

/** Mirrors 0217's `left('Copy of ' || title, 120)`. */
export const copyTitle = (title: string) => `Copy of ${title}`.slice(0, 120);

const DAY_MS = 86_400_000;
/** The calendar day is America/Los_Angeles, the calendar the classroom adjudicates in (CLAUDE.md). */
export const LAUNCH_TIME_ZONE = 'America/Los_Angeles';
const dayFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: LAUNCH_TIME_ZONE });
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: LAUNCH_TIME_ZONE });

export function formatDay(iso: string): string {
	const t = Date.parse(iso);
	return Number.isFinite(t) ? dayFormat.format(t) : 'an unknown day';
}

/** "Removed for good on Oct 21, 2026" -- from the row's own purgeAt, never from the mirror above. */
export const purgeSentence = (purgeAt: string) => `Removed for good on ${formatDay(purgeAt)}`;

/** Whole days left before the purge, never negative: an expired row the sweep has not yet taken reads 0. */
export function daysUntil(purgeAt: string, now: Date): number {
	const t = Date.parse(purgeAt);
	if (!Number.isFinite(t)) return 0;
	return Math.max(0, Math.ceil((t - now.getTime()) / DAY_MS));
}

/** The window as the receipt states it, in whole days; the sentence after a trash reads this, not the mirror. */
export function trashWindowDays(deletedAt: string, purgeAt: string): number {
	const a = Date.parse(deletedAt), b = Date.parse(purgeAt);
	if (!Number.isFinite(a) || !Number.isFinite(b)) return TRASH_WINDOW_DAYS;
	return Math.round((b - a) / DAY_MS);
}

/** The acknowledgement after a trash lands, on the surface that is still on screen (the list). */
export const trashedSentence = (title: string, purgeAt: string) => `"${title}" is in the trash. ${purgeSentence(purgeAt)}.`;
export const restoredSentence = (title: string) => `"${title}" is back in your library.`;
export const purgedSentence = (title: string) => `"${title}" was removed for good.`;
export const archivedSentence = (title: string) => `"${title}" is archived. It stays readable under Archived.`;
export const unarchivedSentence = (title: string) => `"${title}" is back with your live models.`;
export const duplicatedSentence = (title: string) => `"${title}" was added to your library.`;
export const folderDeletedSentence = (name: string, movedOut: number) =>
	`The folder "${name}" was deleted. ${movedOut === 1 ? '1 model was' : `${movedOut} models were`} unfiled; nothing was deleted.`;

/** "Edited just now" / "Edited 5 minutes ago" / "Edited yesterday" / "Edited Sep 3, 2026". */
export function editedSentence(updatedAt: string, now: Date): string {
	const t = Date.parse(updatedAt);
	if (!Number.isFinite(t)) return 'Edited on an unknown day';
	const ago = now.getTime() - t;
	if (ago < 60_000) return 'Edited just now';
	const minutes = Math.floor(ago / 60_000);
	if (minutes < 60) return `Edited ${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
	const hours = Math.floor(ago / 3_600_000);
	if (hours < 24) return `Edited ${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
	const days = Math.floor(ago / DAY_MS);
	if (days === 1) return `Edited yesterday at ${timeFormat.format(t)}`;
	if (days < 7) return `Edited ${days} days ago`;
	return `Edited ${formatDay(updatedAt)}`;
}

/** "3 features, 1 body" -- the two counts a card leads with. */
export function countsSentence(featureCount: number, bodyCount: number): string {
	const f = `${featureCount} ${featureCount === 1 ? 'feature' : 'features'}`;
	const b = `${bodyCount} ${bodyCount === 1 ? 'body' : 'bodies'}`;
	return `${f}, ${b}`;
}
