/**
 * CAPTURE WHERE THE WORK IS (ledger 0297, package F4b): the pure rules behind
 * adding a page or a note to the notebook from the page the work is on.
 *
 * Everything here is arithmetic over plain values, so the rules a student
 * cannot see going wrong are assertable in node with no browser: which entry
 * a capture files into, what a photo is called on the wire so a retry can
 * tell whether it already landed, which page may still be straightened, and
 * how a page is removed or restored without its corrected version pairing
 * with the wrong original.
 *
 * Pure and client-safe: no Svelte, no Supabase, no transports.
 */

import {
	photoPages,
	type NotebookEntry,
	type NotebookPhoto,
	type PhotoPage
} from '$lib/notebook';
import { docFromPlainText } from '$lib/classroom/classroom-doc';
import { docToTiptap, type NoteDoc, type TiptapNode } from '$lib/notebook-notes';
import type { ClassCheckIn } from '$lib/classroom/class-check-ins';

// ---------------------------------------------------------------------------
// Filing: which entry a capture belongs to
// ---------------------------------------------------------------------------

/**
 * `notebook_entries.custom_label` is `char_length` 1 to 200 (0069). Counted
 * in CODE POINTS, as Postgres counts characters, so a title ending in an
 * emoji is cut before it rather than through it.
 */
export const CAPTURE_LABEL_MAX = 200;

/**
 * WHERE A CAPTURE IS FILED, decided once, from the item and its check-ins.
 *
 *   - The item carries a notebook check-in: the entry is filed against the
 *     (check-in, class) PAIR the check-in grid is keyed on, so it counts
 *     toward that check-in exactly as a page filed from the notebook does.
 *   - It carries none: the entry is filed to the CLASS with the item's title
 *     as its label, so it is readable by that class's reviewers (0169),
 *     counted by the grid's free entries (0180), and names what it was for.
 *
 * `key` is the stable name of this filing, used to key what is kept on this
 * device and to find the draft a capture continues. It names the item when
 * there is one, because two items without check-ins in one class are two
 * filings even though both go to the class.
 */
export interface CaptureFiling {
	sectionId: string;
	sessionId: string | null;
	customLabel: string | null;
	key: string;
}

/** A title capped at the label column's limit, in code points; empty is null. */
export function captureLabel(title: string | null | undefined): string | null {
	const trimmed = (title ?? '').trim();
	if (!trimmed) return null;
	return Array.from(trimmed).slice(0, CAPTURE_LABEL_MAX).join('').trim() || null;
}

/**
 * Which of an item's check-ins a capture answers, when it has several: the
 * one dated today, else the latest one already past, else the soonest one
 * coming. Ties (one day posted twice) resolve on the session id so two loads
 * never disagree.
 */
export function pickCheckIn(checkIns: readonly ClassCheckIn[], today: string): ClassCheckIn | null {
	if (!checkIns.length) return null;
	const byDate = [...checkIns].sort(
		(a, b) => a.session_date.localeCompare(b.session_date) || a.session_id.localeCompare(b.session_id)
	);
	const todays = byDate.find((c) => c.session_date === today);
	if (todays) return todays;
	const past = byDate.filter((c) => c.session_date < today);
	if (past.length) return past[past.length - 1];
	return byDate[0];
}

export function captureFiling(input: {
	sectionId: string;
	itemId: string;
	itemTitle: string | null | undefined;
	/** The item's own check-ins, already narrowed (`checkInsForItem`). */
	checkIns: readonly ClassCheckIn[];
	/** The school day (`laCalendarDay`) the load's one clock read gave. */
	today: string;
}): CaptureFiling {
	const checkIn = pickCheckIn(
		input.checkIns.filter((c) => c.section_id === input.sectionId),
		input.today
	);
	if (checkIn) {
		return {
			sectionId: input.sectionId,
			sessionId: checkIn.session_id,
			customLabel: null,
			key: `session:${input.sectionId}:${checkIn.session_id}`
		};
	}
	return {
		sectionId: input.sectionId,
		sessionId: null,
		customLabel: captureLabel(input.itemTitle),
		key: `item:${input.sectionId}:${input.itemId}`
	};
}

/**
 * Does this entry belong to this filing? A check-in filing matches on the
 * pair; a class filing matches an entry in that class with no check-in and
 * the same label, which is what the capture writes.
 */
export function entryInFiling(
	entry: Pick<NotebookEntry, 'section_id' | 'session_id' | 'custom_label'>,
	filing: CaptureFiling
): boolean {
	if (entry.section_id !== filing.sectionId) return false;
	if (filing.sessionId) return entry.session_id === filing.sessionId;
	return entry.session_id === null && (entry.custom_label ?? '').trim() === (filing.customLabel ?? '');
}

/** Newest first: what the student already filed for this item. */
export function entriesInFiling<E extends Pick<NotebookEntry, 'section_id' | 'session_id' | 'custom_label' | 'upload_timestamp'>>(
	entries: readonly E[],
	filing: CaptureFiling
): E[] {
	return entries
		.filter((e) => entryInFiling(e, filing))
		.sort((a, b) => b.upload_timestamp.localeCompare(a.upload_timestamp));
}

/**
 * THE DRAFT A CAPTURE CONTINUES: the newest entry in this filing that has not
 * been turned in. Read from the server's own list, so a reload, a second tab
 * and a return visit all add to the same draft rather than starting another.
 */
export function continuedDraft<E extends Pick<NotebookEntry, 'section_id' | 'session_id' | 'custom_label' | 'upload_timestamp' | 'submitted_at'>>(
	entries: readonly E[],
	filing: CaptureFiling
): E | null {
	return entriesInFiling(entries, filing).find((e) => e.submitted_at === null) ?? null;
}

// ---------------------------------------------------------------------------
// The name a photo travels under, and the retry that does not duplicate it
// ---------------------------------------------------------------------------

/**
 * THE ROUTES HAVE NO IDEMPOTENCY KEY AND THE PHOTO ROW STORES NO SIZE, so the
 * one thing a retry can compare against is `original_filename`, which both
 * photo routes store verbatim. Every capture therefore travels under a name
 * carrying a token minted when the photo was taken, and a retry of a photo
 * whose first attempt has an unknown outcome (a dropped connection, a 5xx, a
 * tab closed mid-request) first re-reads the entry's photos for that exact
 * name. Found means it landed: the capture is marked uploaded and nothing is
 * sent again. Not found means it did not, and it is sent.
 *
 * Eight base-36 characters from `crypto.getRandomValues`: 2.8e12 names, so
 * two captures colliding is not a case worth a branch.
 */
export const CAPTURE_TOKEN_LENGTH = 8;
const TOKEN_TAIL = new RegExp(`-c([a-z0-9]{${CAPTURE_TOKEN_LENGTH}})(\\.[a-z0-9]{1,5})?$`, 'i');

export function captureToken(random: (n: number) => Uint8Array = defaultRandom): string {
	const bytes = random(CAPTURE_TOKEN_LENGTH);
	let out = '';
	for (let i = 0; i < CAPTURE_TOKEN_LENGTH; i++) out += (bytes[i] % 36).toString(36);
	return out;
}

function defaultRandom(n: number): Uint8Array {
	const bytes = new Uint8Array(n);
	crypto.getRandomValues(bytes);
	return bytes;
}

/** `IMG_2041.jpg` + token -> `IMG_2041-c4k2m9q1a.jpg`; the extension is kept. */
export function captureUploadName(name: string | null | undefined, token: string): string {
	const trimmed = (name ?? '').trim() || 'photo.jpg';
	const m = /^(.*?)(\.[A-Za-z0-9]{1,5})?$/.exec(trimmed);
	const base = (m?.[1] || 'photo').replace(TOKEN_TAIL, '');
	const ext = m?.[2] ?? '.jpg';
	return `${base}-c${token}${ext.toLowerCase()}`;
}

/** The token a stored filename carries, or null for a photo from elsewhere. */
export function captureTokenOf(filename: string | null | undefined): string | null {
	return TOKEN_TAIL.exec(filename ?? '')?.[1]?.toLowerCase() ?? null;
}

/**
 * Did a capture already land on this entry? Removed photos COUNT: a photo the
 * student removed after it landed must not be sent again by a stale retry.
 */
export function captureLanded(photos: readonly Pick<NotebookPhoto, 'original_filename'>[], uploadName: string): boolean {
	return photos.some((p) => p.original_filename === uploadName);
}

// ---------------------------------------------------------------------------
// The visible state of each capture
// ---------------------------------------------------------------------------

/**
 * Where a captured photo is, in words and a glyph, never colour alone.
 *
 *   device     the bytes are in this browser's storage and survive a reload;
 *              the upload has not been acknowledged yet
 *   memory     storage refused (full, or blocked), so the bytes are only in
 *              this tab until the upload lands; said out loud
 *   uploading  the request is in flight
 *   uploaded   the server acknowledged it; nothing is kept on the device
 *   failed     the upload did not land; the bytes are still kept, with Retry
 */
export type CaptureState = 'device' | 'memory' | 'uploading' | 'uploaded' | 'failed';

export const CAPTURE_STATES: Readonly<Record<CaptureState, { word: string; glyph: string }>> = {
	device: { word: 'Saved on this device', glyph: '▣' },
	memory: { word: 'Only in this tab', glyph: '!' },
	uploading: { word: 'Uploading', glyph: '↑' },
	uploaded: { word: 'Uploaded', glyph: '✓' },
	failed: { word: 'Not uploaded', glyph: '✕' }
};

/** Not yet acknowledged by the server: Turn in waits for these. */
export function capturePending(state: CaptureState): boolean {
	return state !== 'uploaded';
}

// ---------------------------------------------------------------------------
// Pairing: straighten after the fact without a pairing key
// ---------------------------------------------------------------------------

/**
 * WHICH PAGE MAY STILL BE STRAIGHTENED, AND WHY ONLY ONE.
 *
 * `photoPages` pairs an 'enhanced' row with the live 'original' IMMEDIATELY
 * BEFORE it by sequence order, and `notebook_add_photo` always appends at
 * max+1. So a corrected version uploaded now attaches to whatever is the LAST
 * live page, whichever page it was made from. Straightening page 1 after page
 * 2 has landed would pair the correction with page 2.
 *
 * So the choice is offered on the LAST page only, and only while it has no
 * corrected version: that is the one page an appended row is guaranteed to
 * pair with. Uploads run one at a time in the order they were taken, so
 * nothing can land between the page and its correction. No migration and no
 * pairing key: the rule is the adjacency the table already has.
 */
export function straightenTarget(photos: readonly NotebookPhoto[]): NotebookPhoto | null {
	const pages = photoPages([...photos]);
	const last = pages[pages.length - 1];
	if (!last || !last.original || last.enhanced) return null;
	return last.original;
}

/**
 * Removing a PAGE removes both its rows, corrected version FIRST. The order is
 * the safe one if the second call fails: the original left behind is still a
 * correct page. The other order would leave a corrected row behind that the
 * adjacency rule pairs with the previous page's original.
 */
export function pageRemovalOrder(page: PhotoPage): string[] {
	const ids: string[] = [];
	if (page.enhanced) ids.push(page.enhanced.id);
	if (page.original) ids.push(page.original.id);
	return ids;
}

/**
 * Would restoring this removed photo leave every page paired exactly as it is?
 *
 * STRICT, AND THE STRICTNESS IS MEASURED RATHER THAN CAUTIOUS. Two ways a
 * restore goes wrong: an EXISTING pair changes (a restored original lands
 * between another original and its corrected version and takes the
 * correction), or a NEW pair forms. A new pair cannot be told apart from a
 * wrong one without a pairing key: a first draft of this rule accepted a new
 * pair when the timestamps said the original was live when the correction was
 * made, and the enumeration in tests/notebook-capture.test.ts found a
 * sequence (remove a page, straighten, remove, restore, restore) where an
 * earlier restore had already erased the removal the timestamps depended on.
 * So a restore is offered only when the set of pairs is unchanged, and only
 * for an ORIGINAL. A corrected version is never restored on its own: the
 * enumeration found the second hole there, where a corrected row restored as
 * a lone page was later taken by the page before it the moment the page
 * between them was removed. A live corrected row with no page of its own is
 * the state every later removal can mispair, so it is never produced. The cost
 * is that a corrected version removed with its page does not come back with
 * it; the original does, and the latest page can be straightened again.
 */
export function restoreKeepsPairing(photos: readonly NotebookPhoto[], photoId: string): boolean {
	const target = photos.find((p) => p.id === photoId);
	if (!target || !target.removed_at || target.variant !== 'original') return false;
	const before = pairing(photoPages([...photos]));
	const after = pairing(
		photoPages(photos.map((p) => (p.id === photoId ? { ...p, removed_at: null } : p)))
	);
	if (after.size !== before.size) return false;
	for (const [enhancedId, originalId] of before) {
		if (after.get(enhancedId) !== originalId) return false;
	}
	return true;
}

/** enhanced id -> original id, for every page that has both. */
function pairing(pages: PhotoPage[]): Map<string, string> {
	const map = new Map<string, string>();
	for (const page of pages) {
		if (page.enhanced && page.original) map.set(page.enhanced.id, page.original.id);
	}
	return map;
}

// ---------------------------------------------------------------------------
// The note
// ---------------------------------------------------------------------------

/**
 * Plain text to the stored note shape: paragraphs split on a blank line, the
 * same reader the classroom uses for a plain body. The editor's plain-text
 * fallback goes through this too, so there is one conversion.
 */
export function plainTextNote(text: string): TiptapNode {
	const blocks: NoteDoc = docFromPlainText(text).flatMap((b) =>
		b.type === 'p' ? [{ type: 'p' as const, runs: b.runs }] : []
	);
	return docToTiptap(blocks);
}
