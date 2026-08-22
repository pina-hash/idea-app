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

import type { ItemDoc } from '$lib/classroom/classroom-doc';
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
	/**
	 * When the student removed this photo, or null (0116). Soft: the row and the
	 * Drive file both survive, so this is the only thing that says it is gone.
	 *
	 * OPTIONAL, and it means two different things when it is absent. `null` is a
	 * live photo; `undefined` is a read that predates 0116 or ran against a
	 * project without it -- there is nothing removed to exclude in that case,
	 * because the column does not exist. `livePhotos` below treats both as live,
	 * which is why every narrower rung of the select ladder keeps working.
	 */
	removed_at?: string | null;
	/**
	 * When this photo was uploaded (0069's own column, first SELECTED by 0119's
	 * history rung). OPTIONAL for the same two-state reason `removed_at` is: a
	 * read from a narrower rung never asked for it.
	 *
	 * READ ONLY BY THE TIMELINE ($lib/notebook-history), and nothing else may
	 * start ordering pages by it -- `sequence_order` is what page order means
	 * (0069), and the two disagree the moment a student re-uploads a page.
	 */
	created_at?: string;
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
	/**
	 * THE INSTRUCTOR'S GUIDANCE PROMPT (0123): what to photograph and what to
	 * write about it, in the closed classroom rich-text shape, or null for a
	 * check-in with no prompt -- which is every check-in scheduled before 0123.
	 *
	 * OPTIONAL because a read may not have asked for it: it rides its own ladder
	 * rung, so a deployment between 0122 and 0123 answers `undefined` here and
	 * every surface renders exactly the check-in it rendered last week.
	 *
	 * IT IS THE CHECK-IN'S, NOT THE ENTRY'S, and that is the whole design. It is
	 * read through the check-in by id at every read, never copied onto an entry
	 * when one is filed, so an instructor correcting an unclear instruction
	 * corrects it for the students who already answered the unclear one.
	 */
	guidance_doc?: ItemDoc | null;
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
	/**
	 * When the student turned this entry in, or null for a DRAFT (0118).
	 *
	 * A draft is private: staff cannot read it, it is not presence on any grid,
	 * and it counts as outstanding on the class page. It is the student's own
	 * unfinished work, so it is in this feed and nowhere else.
	 *
	 * On a project without 0118 there is no such column and nothing can be a
	 * draft, so the load reports it as turned in -- which is what every entry
	 * made before drafts existed genuinely was.
	 */
	submitted_at: string | null;
	status: NotebookStatus;
	/**
	 * When an instructor last acted on this entry, or null (0069's own column,
	 * first SELECTED by 0119's history rung).
	 *
	 * OPTIONAL, and the distinction is load-bearing: `undefined` is a read from
	 * a narrower rung that never asked, and `null` is an entry genuinely nobody
	 * has reviewed. The timeline emits a review event only from a real stamp, so
	 * a narrower read produces a shorter history rather than one that claims an
	 * entry was never looked at. `status` remains the thing every other surface
	 * asks -- this is a WHEN, not a WHETHER.
	 */
	reviewed_at?: string | null;
	flag_reason: NotebookFlagReason | null;
	instructor_comment: string | null;
	session: Pick<
		NotebookSession,
		'session_label' | 'unit_number' | 'session_date' | 'guidance_doc'
	> | null;
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
 * empty line: session label, else the typed title, else a LIVE photo's
 * filename, else the first note's opening words, else a REMOVED photo's
 * filename, else a plain placeholder. This mirrors (but does not duplicate)
 * the Drive-naming fallback order in notebookDriveFilename.
 *
 * The note step is why `custom_label` staying a TITLE costs a student
 * nothing: since 0078 a note carries its own text, so an untitled note entry
 * can name itself from what it says instead of reading as "Untitled entry".
 *
 * LIVE CONTENT OUTRANKS REMOVED CONTENT, and that is the whole reason the
 * filename step is split in two rather than simply filtered through
 * `livePhotos`. One list, one filter, would have been the smaller change and
 * it is the wrong one: an entry whose pages were all deleted but whose note
 * still says something would fall through the note step it has already passed
 * and land on "Untitled entry", so deleting a page would silently rename a
 * live entry in every list that shows it and flip what `isUntitled` reports.
 * A REMOVED photo's filename is still the only name some entries ever had, so
 * it stays in the chain -- below the note, above the placeholder. An entry
 * never loses its identity in a list because a page was deleted.
 */
export const UNTITLED_ENTRY = 'Untitled entry';

/**
 * The first photo by sequence order that recorded a browser filename, without
 * its extension -- or null when this list holds none. Taken over a list the
 * caller has already narrowed to live or removed photos, so the ORDER of the
 * two questions lives in `entryTitle` and the answer to each is asked once.
 */
function photoFilenameTitle(photos: NotebookPhoto[]): string | null {
	const named = [...photos]
		.sort((a, b) => a.sequence_order - b.sequence_order)
		.find((p) => p.original_filename?.trim());
	const filename = named?.original_filename?.trim();
	return filename ? stripExtension(filename) : null;
}

export function entryTitle(
	entry: Pick<NotebookEntry, 'session' | 'custom_label' | 'photos' | 'notes'>
): string {
	const session = entry.session?.session_label?.trim();
	if (session) return session;
	const custom = entry.custom_label?.trim();
	if (custom) return custom;
	const live = photoFilenameTitle(livePhotos(entry.photos));
	if (live) return live;
	const firstNote = noteThreads(entry.notes ?? [])[0];
	if (firstNote) {
		const summary = docSummary(firstNote.current.content);
		if (summary) return summary;
	}
	const removed = photoFilenameTitle(removedPhotos(entry.photos));
	if (removed) return removed;
	return UNTITLED_ENTRY;
}

/** True when entryTitle fell all the way through to the placeholder. */
export function isUntitled(entry: NotebookEntry): boolean {
	return entryTitle(entry) === UNTITLED_ENTRY;
}

/**
 * One of the caller's own DELETED entries (0117): a deliberately smaller shape
 * than `NotebookEntry`, since the two surfaces that render it -- the student's
 * "Recently deleted" list and the per-student review page's staff Deleted
 * section -- show a title, when it was deleted, and a Restore control, never
 * the photos or notes it once carried.
 */
export interface NotebookDeletedEntry {
	id: string;
	custom_label: string | null;
	session: Pick<
		NotebookSession,
		'session_label' | 'unit_number' | 'session_date' | 'guidance_doc'
	> | null;
	upload_timestamp: string;
	deleted_at: string;
	/**
	 * OPTIONAL, and it means two different things when it is absent. The
	 * student's own view sets it (true = deleted_by is themselves, so
	 * notebook_restore_entry will work); the staff review page never sets it,
	 * because a manager may always attempt notebook_staff_restore_entry
	 * regardless of who removed the row -- the RPC's own gate is the real
	 * boundary there, not this flag.
	 */
	restorable?: boolean;
}

/** Session label, else the entry's own title, else the placeholder -- entryTitle's first two steps, without photos or notes to fall through to. */
export function deletedEntryTitle(
	entry: Pick<NotebookDeletedEntry, 'session' | 'custom_label'>
): string {
	const session = entry.session?.session_label?.trim();
	if (session) return session;
	const custom = entry.custom_label?.trim();
	if (custom) return custom;
	return UNTITLED_ENTRY;
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

/**
 * The photos that are still part of an entry (0116).
 *
 * THE ONE PLACE A REMOVED PHOTO IS DROPPED CLIENT-SIDE, and it is deliberately
 * the narrowest function both other helpers below are built on rather than a
 * filter each caller remembers: `photoPages` and `orderedPhotos` are what every
 * surface goes through to render, count or copy an entry's photos, so filtering
 * here covers all of them and a new consumer inherits it.
 *
 * A photo with NO `removed_at` field at all is live. That is the pre-0116 read
 * (a narrower rung of the select ladder, which cannot ask for a column that is
 * not there), and it is correct: nothing can have been removed on a project
 * where nothing can be marked removed.
 */
export function livePhotos(photos: NotebookPhoto[]): NotebookPhoto[] {
	return photos.filter((p) => !p.removed_at);
}

/**
 * The mirror of `livePhotos` (0117): the photos a student has removed from a
 * still-live entry, for the "removed photos" disclosure on their own card.
 * Kept BESIDE `photoPages`, never merged into it -- `photoPages` is what every
 * surface renders an entry's pages from, and a removed photo must never
 * reappear there just because a caller forgot to filter twice.
 */
export function removedPhotos(photos: NotebookPhoto[]): NotebookPhoto[] {
	return photos.filter((p) => !!p.removed_at).sort((a, b) => a.sequence_order - b.sequence_order);
}

/** Photos in upload order, so a multi-page entry reads page 1 first. */
export function orderedPhotos(entry: NotebookEntry): NotebookPhoto[] {
	return livePhotos(entry.photos).sort((a, b) => a.sequence_order - b.sequence_order);
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
	// Removed photos are dropped HERE as well as in orderedPhotos, and not only
	// as belt-and-braces: several surfaces hand this function a photo list they
	// read straight off an entry, so the pagination has to be able to stand on
	// its own. A removed ORIGINAL whose 'enhanced' survives falls through to the
	// orphan branch below, which is the honest rendering of that state.
	const ordered = livePhotos(photos).sort((a, b) => a.sequence_order - b.sequence_order);
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

/**
 * A session the student has no TURNED-IN entry against yet.
 *
 * A DRAFT DOES NOT COVER A CHECK-IN (0118). Before drafts existed, any entry
 * at all meant the check-in was answered; a draft is not presence, so
 * excluding it here is what keeps a check-in with only a draft against it
 * showing as outstanding rather than silently reading as filed the moment a
 * page is staged. `class-check-ins.ts`'s `isOutstanding` makes the identical
 * call for the class page's own check-in cards -- both surfaces exist to
 * answer "does this still need something from you", and a draft answers yes.
 */
export function outstandingSessions(
	sessions: NotebookSession[],
	entries: Pick<NotebookEntry, 'session_id' | 'submitted_at'>[]
): NotebookSession[] {
	const covered = new Set(
		entries
			.filter((e) => e.submitted_at !== null)
			.map((e) => e.session_id)
			.filter(Boolean) as string[]
	);
	return sessions
		.filter((s) => !covered.has(s.id))
		.sort((a, b) => b.session_date.localeCompare(a.session_date));
}

/** Whether this exact posting (session, section pair) has a DRAFT against it. */
export function sessionHasDraft(
	session: Pick<NotebookSession, 'id' | 'section_id'>,
	entries: Pick<NotebookEntry, 'session_id' | 'section_id' | 'submitted_at'>[]
): boolean {
	return entries.some(
		(e) =>
			e.session_id === session.id && e.section_id === session.section_id && e.submitted_at === null
	);
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
	entries: Pick<NotebookEntry, 'session_id' | 'submitted_at'>[],
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
/**
 * `noteId` NAMES THE CHAIN THE TEXT LANDED IN, and it is what stops the
 * composer's autosave from filling a draft with note threads.
 *
 * `notebook_entry_notes` is append-only: adding a note starts a NEW chain at
 * revision 1, while editing one appends a revision to the chain it names. An
 * autosave that could not tell which chain it had just written would have to
 * add every time, so a student writing for ten minutes would end up with a
 * draft carrying a dozen separate notes saying successively more of the same
 * paragraph. Both creating RPCs already return the id; these two results
 * simply stop dropping it on the floor.
 *
 * OPTIONAL, because a transport that cannot report it is a real state (an
 * older route, a harness). A caller that has written once and still has no
 * chain id must REFUSE to write again rather than add a second one.
 */
export type CreateEntryResult =
	| { ok: true; entryId: string; noteId?: string }
	| { ok: false; error: string };
export type AddPhotoResult = { ok: true } | { ok: false; error: string };
export type NoteSaveResult = { ok: true; noteId?: string } | { ok: false; error: string };

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
	/**
	 * The check-in this note ANSWERS (0114), or null for a free-form entry.
	 * Carried as the PAIR the entry is keyed on: one canonical check-in runs in
	 * several classes since 0098, so the section is the one whose button was
	 * pressed rather than whichever posting a lookup would have found first.
	 */
	session_id?: string | null;
	section_id?: string | null;
	/**
	 * Turn the entry in at creation (0118), default true. `false` makes a
	 * DRAFT: `submitted_at` stays null, so it is private until the student
	 * turns it in themselves. Omitted entirely by a caller that never asks for
	 * a draft, which is what keeps this path working unchanged on a project
	 * where 0118 has not been applied yet.
	 */
	submitted?: boolean;
	/**
	 * This write came from the AUTOSAVE rather than from a button (0129), so
	 * the revision it creates may be replaced in place by the next one.
	 *
	 * Named on the RPC only when the coalescing capability came back -- see
	 * `NOTEBOOK_COALESCE_SELECT` in $lib/notebook-selects. A project without
	 * 0129 has no such parameter, and naming it would leave PostgREST unable to
	 * resolve the function at all: every note save broken, not just the
	 * coalescing. Omitted, the call matches either version and the autosave
	 * behaves exactly as it did before, appending a revision per burst.
	 */
	autosave?: boolean;
}
