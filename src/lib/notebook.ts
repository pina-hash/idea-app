/**
 * Digital notebook, client-safe layer: row shapes and PURE display/selection
 * helpers for the student-facing UI (`/notebook`).
 *
 * Plain data + pure functions only (the curriculum.ts / coin-balance.ts
 * convention): no Supabase client, no `$lib/server` import, nothing that
 * cannot run in a dev harness with no backend. Every rule that matters --
 * who may read an entry, what a valid entry is, what a photo upload does --
 * lives in 0069/0071's RLS and RPCs; nothing here re-implements any of it.
 */

import {
	docSummary,
	docText,
	noteThreads,
	type NotebookNoteRow,
	type TiptapNode
} from '$lib/notebook-notes';

export type NotebookStatus = 'compliant' | 'flagged' | 'pending_review';

export type NotebookFlagReason =
	| 'not_dated'
	| 'illegible'
	| 'insufficient_detail'
	| 'appears_reconstructed'
	| 'other';

/** A notebook_entry_photos row (0069, plus 0071's original_filename). */
export interface NotebookPhoto {
	id: string;
	drive_file_id: string;
	variant: 'original' | 'enhanced';
	sequence_order: number;
	original_filename: string | null;
}

/** A notebook_sessions row: an instructor-scheduled required check-in. */
export interface NotebookSession {
	id: string;
	/**
	 * WHICH OF THE STUDENT'S OWN CLASSES this check-in arrived through -- the
	 * posting's section, not a property of the check-in. Since 0098 one
	 * canonical check-in can run in several sections, so a student sees it once
	 * per class of theirs it runs in, and this is what the entry gets filed
	 * under.
	 */
	section_id: string;
	unit_number: number;
	session_date: string;
	session_label: string;
}

/**
 * A notebook_entries row with its photos and (when session-linked) its
 * session, shaped exactly as the `/notebook` load selects it.
 */
export interface NotebookEntry {
	id: string;
	session_id: string | null;
	section_id: string | null;
	/**
	 * The student's own filing (0088), or null for unfiled. Organization only:
	 * nothing about who may read an entry, what it counts for, or how it is
	 * reviewed depends on it -- see $lib/notebook-folders.
	 */
	folder_id: string | null;
	/**
	 * When the student pinned this entry, or null (0091). A TIMESTAMP rather
	 * than a flag so several pinned entries have a stable order among
	 * themselves. Global to the entry, never per-folder: a pinned entry rides
	 * to the top of All, of Unfiled, and of its own folder alike.
	 */
	pinned_at: string | null;
	custom_label: string | null;
	upload_timestamp: string;
	status: NotebookStatus;
	flag_reason: NotebookFlagReason | null;
	instructor_comment: string | null;
	session: Pick<NotebookSession, 'session_label' | 'unit_number' | 'session_date'> | null;
	photos: NotebookPhoto[];
	/** Every revision of every written note on this entry (0078). */
	notes: NotebookNoteRow[];
}

/**
 * A photo picked but not yet saved: the file itself plus, when the correction
 * step produced one, the corrected JPEG that uploads right after it as the
 * 'enhanced' variant. `enhanced: null` means the student skipped correction
 * (or the image could not be decoded) and only the original uploads.
 *
 * Shared rather than private to PhotoStager because the SEQUENCING -- which
 * file becomes which row, in what order -- belongs to whoever is saving, and
 * that is now two different callers.
 */
export interface StagedPhoto {
	file: File;
	enhanced: File | null;
}

/**
 * What to call an entry in the list.
 *
 * Since 0071 an entry may be FULLY unlabeled -- no session, no custom label
 * -- so the chain has to bottom out in something printable rather than an
 * empty line: session label, else the typed title, else the browser filename
 * the upload recorded, else the first note's opening words, else a plain
 * placeholder. This mirrors (but does not duplicate) the Drive-naming
 * fallback order in notebookDriveFilename.
 *
 * The note step is why `custom_label` staying a TITLE costs a student
 * nothing: since 0078 a note carries its own text, so an untitled note entry
 * can name itself from what it says instead of reading as "Untitled entry".
 */
export const UNTITLED_ENTRY = 'Untitled entry';

export function entryTitle(
	entry: Pick<NotebookEntry, 'session' | 'custom_label' | 'photos' | 'notes'>
): string {
	const session = entry.session?.session_label?.trim();
	if (session) return session;
	const custom = entry.custom_label?.trim();
	if (custom) return custom;
	// First photo by sequence order: the entry's own "original" upload.
	const named = [...entry.photos]
		.sort((a, b) => a.sequence_order - b.sequence_order)
		.find((p) => p.original_filename?.trim());
	const filename = named?.original_filename?.trim();
	if (filename) return stripExtension(filename);
	const firstNote = noteThreads(entry.notes ?? [])[0];
	if (firstNote) {
		const summary = docSummary(firstNote.current.content);
		if (summary) return summary;
	}
	return UNTITLED_ENTRY;
}

/** True when entryTitle fell all the way through to the placeholder. */
export function isUntitled(entry: NotebookEntry): boolean {
	return entryTitle(entry) === UNTITLED_ENTRY;
}

/** "bearing-teardown.jpg" -> "bearing-teardown"; extensionless names pass through. */
export function stripExtension(name: string): string {
	const dot = name.lastIndexOf('.');
	return dot > 0 ? name.slice(0, dot) : name;
}

const STATUS_LABELS: Record<NotebookStatus, string> = {
	compliant: 'Recorded',
	flagged: 'Needs another look',
	pending_review: 'Awaiting review'
};

export function statusLabel(status: NotebookStatus): string {
	return STATUS_LABELS[status] ?? status;
}

/**
 * `compliant` is the default and says nothing useful to a student, so the UI
 * shows a status chip only when the entry is NOT in it.
 */
export function showsStatus(status: NotebookStatus): boolean {
	return status !== 'compliant';
}

const FLAG_REASONS: Record<NotebookFlagReason, string> = {
	not_dated: 'Not dated',
	illegible: 'Hard to read',
	insufficient_detail: 'Needs more detail',
	appears_reconstructed: 'Appears written after the fact',
	other: 'Flagged for review'
};

export function flagReasonLabel(reason: NotebookFlagReason | null): string | null {
	return reason ? (FLAG_REASONS[reason] ?? FLAG_REASONS.other) : null;
}

/**
 * Newest first. The `/notebook` load already asks Postgres for this order,
 * so this is a display guarantee rather than the only thing providing it:
 * it makes the feed's order a property of the component, true for any
 * caller (the dev harness included) instead of an assumption about how the
 * rows arrived.
 */
export function newestFirst(entries: NotebookEntry[]): NotebookEntry[] {
	return [...entries].sort((a, b) => b.upload_timestamp.localeCompare(a.upload_timestamp));
}

// ---------------------------------------------------------------------------
// Pinning + sort order (0091)
// ---------------------------------------------------------------------------

export function isPinned(entry: NotebookEntry): boolean {
	return !!entry.pinned_at;
}

/**
 * How the feed is ordered UNDER the pins.
 *
 * `newest` is the notebook's original and still default order: the entry's
 * own upload_timestamp. `activity` is the most recent of that, its newest
 * note revision, and its newest photo -- so an older entry someone added to
 * yesterday surfaces above an untouched newer one, which is how a notebook
 * that gets revisited actually reads.
 */
export type EntrySort = 'newest' | 'activity';

export const ENTRY_SORTS: { id: EntrySort; label: string }[] = [
	{ id: 'newest', label: 'Newest first' },
	{ id: 'activity', label: 'Recent activity' }
];

/**
 * entry id -> last_activity_at, as the notebook_entry_activity view (0091)
 * returned it.
 *
 * THE TIMESTAMP IS COMPUTED IN THE DATABASE, over every note revision and
 * every photo of every entry the caller can read -- not here, and not over
 * the handful of entries the feed happens to be painting. The feed renders a
 * capped number of entries while search and sort cover the whole notebook
 * (the same reasoning that made a render limit right and server-side
 * pagination wrong), so a sort key derived from what is on screen would be a
 * sort over the wrong set.
 */
export type ActivityMap = ReadonlyMap<string, string>;

/** Falls back to the entry's own stamp: pre-0091, every entry sorts as it always did. */
export function entryActivityAt(entry: NotebookEntry, activity?: ActivityMap): string {
	return activity?.get(entry.id) ?? entry.upload_timestamp;
}

/** Parsed, not string-compared: the two stamps come from different queries. */
function stampMs(iso: string): number {
	const t = Date.parse(iso);
	return Number.isNaN(t) ? 0 : t;
}

/**
 * PINNED FIRST, then whichever order was asked for.
 *
 * Pins sit above the sort rather than inside it, in every view -- that is
 * what makes a pin mean "keep this where I can reach it" instead of "pretend
 * this is recent". Among themselves pinned entries run most-recently-pinned
 * first.
 */
export function sortEntries(
	entries: NotebookEntry[],
	sort: EntrySort = 'newest',
	activity?: ActivityMap
): NotebookEntry[] {
	const key = (e: NotebookEntry) =>
		sort === 'activity' ? entryActivityAt(e, activity) : e.upload_timestamp;
	return [...entries].sort((a, b) => {
		if (a.pinned_at && !b.pinned_at) return -1;
		if (b.pinned_at && !a.pinned_at) return 1;
		if (a.pinned_at && b.pinned_at && a.pinned_at !== b.pinned_at) {
			return stampMs(b.pinned_at) - stampMs(a.pinned_at);
		}
		return stampMs(key(b)) - stampMs(key(a));
	});
}

// ---------------------------------------------------------------------------
// Copy an entry as plain text
// ---------------------------------------------------------------------------

/** What a copy-to-clipboard action hands back, and what a pin RPC returns. */
export type EntryActionResult = { ok: true } | { ok: false; error: string };

function copyDate(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/**
 * One entry as plain text, for the clipboard: its title (when it has a real
 * one), its date, and every note in written order.
 *
 * NOTES ARE THE CURRENT REVISION ONLY. An entry's history is a record of how
 * the writing changed, which is exactly what somebody pasting it into a lab
 * report or an email does not want; noteThreads already resolves "what this
 * note says now", so this reuses it rather than re-deciding.
 *
 * PHOTOS CANNOT COME ALONG -- the clipboard gets text -- but silently
 * dropping them would make a page of photographed work paste as an empty
 * entry, so their COUNT is stated instead.
 */
export function entryPlainText(entry: NotebookEntry): string {
	const parts: string[] = [];
	const head: string[] = [];

	const title = entryTitle(entry);
	if (title !== UNTITLED_ENTRY) head.push(title);
	const when = copyDate(entry.upload_timestamp);
	if (when) head.push(when);
	if (head.length) parts.push(head.join('\n'));

	for (const thread of noteThreads(entry.notes ?? [])) {
		const text = docText(thread.current.content);
		if (text) parts.push(text);
	}

	const pages = photoPages(orderedPhotos(entry)).length;
	if (pages) parts.push(`[${photoCountLabel(pages)}, not included]`);

	return parts.join('\n\n');
}

/** Photos in upload order, so a multi-page entry reads page 1 first. */
export function orderedPhotos(entry: NotebookEntry): NotebookPhoto[] {
	return [...entry.photos].sort((a, b) => a.sequence_order - b.sequence_order);
}

/**
 * One LOGICAL page: the original photo plus, when the pre-upload correction
 * step produced one, its 'enhanced' variant.
 *
 * PAIRING IS BY ADJACENCY, deliberately. notebook_entry_photos carries
 * `unique (entry_id, sequence_order)` and notebook_add_photo always assigns
 * max+1, so two rows can never literally share a sequence_order -- and 0069's
 * own design ("'enhanced' variants stored NEXT TO the 'original'") is
 * adjacent rows told apart by `variant`. The upload flow writes the pair
 * back-to-back (original, then its enhanced), so walking the ordered rows
 * and attaching each 'enhanced' to the immediately preceding original is
 * exact for everything this app has ever written. `page` is the logical page
 * number; for an all-original entry (the entire pre-correction history) it
 * equals sequence_order, since those are contiguous from 1 by construction.
 */
export interface PhotoPage {
	page: number;
	original: NotebookPhoto | null;
	enhanced: NotebookPhoto | null;
}

export function photoPages(photos: NotebookPhoto[]): PhotoPage[] {
	const ordered = [...photos].sort((a, b) => a.sequence_order - b.sequence_order);
	const pages: PhotoPage[] = [];
	for (const p of ordered) {
		const current = pages[pages.length - 1];
		if (p.variant === 'enhanced' && current?.original && !current.enhanced) {
			current.enhanced = p;
		} else if (p.variant === 'enhanced') {
			// Defensive: an enhanced row with no original to attach to (nothing
			// writes this shape) still renders rather than vanishing.
			pages.push({ page: pages.length + 1, original: null, enhanced: p });
		} else {
			pages.push({ page: pages.length + 1, original: p, enhanced: null });
		}
	}
	return pages;
}

/**
 * What a page shows: the corrected version by default, the original on
 * request (or when it is all the page has). One of the two always exists.
 */
export function pagePhoto(page: PhotoPage, showOriginal = false): NotebookPhoto {
	if (showOriginal && page.original) return page.original;
	return (page.enhanced ?? page.original) as NotebookPhoto;
}

/** Stable key for per-page UI state, whichever variant is displayed. */
export function pageKey(page: PhotoPage): string {
	return ((page.original ?? page.enhanced) as NotebookPhoto).id;
}

/** The browser-facing filename for a corrected photo's upload. */
export function correctedFileName(originalName: string | null | undefined): string {
	const trimmed = originalName?.trim();
	const base = trimmed ? stripExtension(trimmed) : 'photo';
	return `${base}-corrected.jpg`;
}

/**
 * Where the <img> points: this app's OWN proxy route, keyed by the photo
 * row's id (never the Drive file id -- the proxy resolves that itself, from
 * a row the caller has proved they may read).
 *
 * This replaces an earlier direct drive.google.com thumbnail URL, which
 * only rendered for a viewer who personally had access to the school's
 * shared drive -- i.e. staff, not the students whose photos they are. The
 * proxy reads the file on the school account's behalf after 0069's RLS has
 * authorized the caller.
 */
export function photoSrc(photoId: string): string {
	return `/api/notebook/photo/${encodeURIComponent(photoId)}`;
}

/**
 * The escape hatch on the per-photo fallback card. Still a real Drive link,
 * so it only opens for someone with folder access -- which is exactly who
 * it is for: staff diagnosing a photo the proxy could not fetch.
 */
export function driveOpenUrl(driveFileId: string): string {
	return `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`;
}

/** A session the student has no entry against yet. */
export function outstandingSessions(
	sessions: NotebookSession[],
	entries: Pick<NotebookEntry, 'session_id'>[]
): NotebookSession[] {
	const covered = new Set(entries.map((e) => e.session_id).filter(Boolean) as string[]);
	return sessions
		.filter((s) => !covered.has(s.id))
		.sort((a, b) => b.session_date.localeCompare(a.session_date));
}

/** Whole days between two YYYY-MM-DD dates, ignoring time and zone entirely. */
function dayGap(isoDate: string, today: string): number {
	const a = Date.parse(`${isoDate}T00:00:00Z`);
	const b = Date.parse(`${today}T00:00:00Z`);
	if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
	return Math.abs(a - b) / 86_400_000;
}

/**
 * The quick-pick a student most likely wants: the outstanding session nearest
 * to today in either direction (today's own session first, then yesterday's
 * or tomorrow's). Ties break toward the more recent date.
 */
export function nearestOutstanding(
	sessions: NotebookSession[],
	entries: Pick<NotebookEntry, 'session_id'>[],
	today: string
): NotebookSession | null {
	const open = outstandingSessions(sessions, entries);
	if (open.length === 0) return null;
	return open.reduce((best, s) => (dayGap(s.session_date, today) < dayGap(best.session_date, today) ? s : best));
}

/** Local calendar date as YYYY-MM-DD (the string session_date is stored as). */
export function todayIso(now: Date = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** "Unit 3 · Oct 14" -- the sub-line under a session quick-pick. */
export function sessionMeta(session: Pick<NotebookSession, 'unit_number' | 'session_date'>): string {
	const d = new Date(`${session.session_date}T00:00:00`);
	const date = Number.isNaN(d.getTime())
		? session.session_date
		: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	return `Unit ${session.unit_number} · ${date}`;
}

/**
 * Photo-count line for an entry card: "3 photos", "1 photo". Zero is a real
 * state since 0075 (a note-only entry), and "0 photos" reads as a fault
 * rather than as the thing the student deliberately did.
 */
export function photoCountLabel(count: number): string {
	if (count === 0) return 'No photos yet';
	return count === 1 ? '1 photo' : `${count} photos`;
}

/**
 * The transports NotebookView injects. The component owns the sequencing
 * (photo 1 creates the entry, the rest join it); these only carry a ready-made
 * payload to /api/notebook/upload, /api/notebook/add-photo and
 * /api/notebook/note respectively, so a harness can answer them without a
 * network.
 */
export type CreateEntryResult = { ok: true; entryId: string } | { ok: false; error: string };
export type AddPhotoResult = { ok: true } | { ok: false; error: string };
export type NoteSaveResult = { ok: true } | { ok: false; error: string };

/**
 * A photo-less free-form entry whose content is a written note (0075 opened
 * the tier; 0078 gave it real content).
 *
 * Deliberately carries no session: a scheduled check-in exists because an
 * instructor asked for a page, so the note path never offers one -- and
 * notebook_create_note_entry takes no session at all, which is where that
 * rule lives. A note ABOUT a check-in is added to that entry afterwards.
 *
 * `custom_label` is a short TITLE and nothing else. Before 0078 it carried
 * the note's whole text, capped at 200 characters; the text is now its own
 * row and the title is optional.
 */
export interface NotePayload {
	content: TiptapNode;
	custom_label: string | null;
	/** Which folder to file it into (0088); null is Unfiled. */
	folder_id: string | null;
}
