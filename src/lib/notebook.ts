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
	custom_label: string | null;
	upload_timestamp: string;
	status: NotebookStatus;
	flag_reason: NotebookFlagReason | null;
	instructor_comment: string | null;
	session: Pick<NotebookSession, 'session_label' | 'unit_number' | 'session_date'> | null;
	photos: NotebookPhoto[];
}

/**
 * What to call an entry in the list.
 *
 * Since 0071 an entry may be FULLY unlabeled -- no session, no custom label
 * -- so the chain has to bottom out in something printable rather than an
 * empty line: session label, else the typed label, else the browser filename
 * the upload recorded, else a plain placeholder. This mirrors (but does not
 * duplicate) the Drive-naming fallback order in notebookDriveFilename.
 */
export const UNTITLED_ENTRY = 'Untitled entry';

export function entryTitle(entry: NotebookEntry): string {
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

/** Photos in upload order, so a multi-page entry reads page 1 first. */
export function orderedPhotos(entry: NotebookEntry): NotebookPhoto[] {
	return [...entry.photos].sort((a, b) => a.sequence_order - b.sequence_order);
}

/**
 * Drive display URLs. Postgres stores only the file id (0069 keeps no image
 * bytes) and `notebook-drive.ts` exposes no download path, so the browser
 * asks Drive itself -- which serves these only to a viewer whose own Google
 * session can read the file. The UI therefore treats the image as
 * best-effort and always renders the `openUrl` link beside it.
 */
export function drivePhotoUrl(driveFileId: string, width = 1600): string {
	return `https://drive.google.com/thumbnail?id=${encodeURIComponent(driveFileId)}&sz=w${width}`;
}

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

/** Photo-count line for an entry card: "3 photos", "1 photo". */
export function photoCountLabel(count: number): string {
	return count === 1 ? '1 photo' : `${count} photos`;
}

/**
 * The two upload transports NotebookView injects. The component owns the
 * sequencing (photo 1 creates the entry, the rest join it); these only carry
 * a ready-made FormData to /api/notebook/upload and /api/notebook/add-photo
 * respectively, so a harness can answer them without a network.
 */
export type CreateEntryResult = { ok: true; entryId: string } | { ok: false; error: string };
export type AddPhotoResult = { ok: true } | { ok: false; error: string };
