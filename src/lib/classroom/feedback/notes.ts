/**
 * PROGRESSIVE FEEDBACK, THE PURE HALF (0238, report 6b814ca1; decision 60).
 *
 * Mr. Pina, 2026-10-08: "an engine ... to provide progressive feedback for
 * assignments. When a student is working on an assignment an instructor can pull
 * it up and provide live feedback ... embedding itself within the HTML
 * assignments themselves. Even including things like image notes ... drawing
 * tools to draw on an image with a few different colors and point things out
 * ... Not only should it be live but it's supposed to be a grading feature."
 * And on 2026-10-14: in place and in a list; back and forth, a Fixed it button
 * and seen; one place to manage everything from; ported HTML worksheets first.
 *
 * A THREAD is one note on one student's work on one item, optionally on one
 * block (the manifest's permanent id) and optionally on one handed-in picture
 * with a drawing over it. Its messages are the conversation. Everything about
 * WHO may do WHAT is the database's (0238's definer functions); this module
 * only reads what they answer, decides how a thread reads to a viewer, and
 * holds the drawing vocabulary both sides draw with.
 *
 * NO DOM AND NO SVELTE, so every rule here is assertable without a browser.
 */

/* ========================================================================== */
/* The drawing vocabulary (the closed shape 0238's _classroom_feedback_marks_ok */
/* accepts, mirrored, so the client never sends what the database refuses).     */
/* ========================================================================== */

/** The five things a person can draw. */
export const MARK_TOOLS = ['pen', 'arrow', 'box', 'ellipse', 'text'] as const;
export type MarkTool = (typeof MARK_TOOLS)[number];

/** The six colours, by id. The ids are stored; the paint is this table's. */
export const MARK_COLOR_IDS = ['red', 'yellow', 'green', 'blue', 'white', 'black'] as const;
export type MarkColor = (typeof MARK_COLOR_IDS)[number];

/**
 * WHAT EACH COLOUR PAINTS, AND THE HALO UNDER IT. A mark is drawn over an
 * arbitrary photograph, so no single ink is legible everywhere; every stroke is
 * laid over a halo of the opposite lightness, which is what keeps a red arrow
 * visible on a red part and a white label legible on a white bench. The inks
 * are content, not theme: they do not change with the site theme, exactly as
 * the photograph under them does not.
 */
export const MARK_PAINT: Readonly<Record<MarkColor, { ink: string; halo: string; label: string }>> = {
	red: { ink: '#ff3b30', halo: '#1a0606', label: 'Red' },
	yellow: { ink: '#ffd23f', halo: '#1a1400', label: 'Yellow' },
	green: { ink: '#2fd158', halo: '#03140a', label: 'Green' },
	blue: { ink: '#3a8dff', halo: '#020c1a', label: 'Blue' },
	white: { ink: '#f5f5f2', halo: '#111111', label: 'White' },
	black: { ink: '#111111', halo: '#f5f5f2', label: 'Black' }
};

/** Three widths, in screen pixels (the stroke never scales with the picture). */
export const MARK_WIDTHS = [1, 2, 3] as const;
export type MarkWidth = (typeof MARK_WIDTHS)[number];
export const MARK_WIDTH_PX: Readonly<Record<MarkWidth, number>> = { 1: 2.5, 2: 4.5, 3: 7 };

/** Coordinates are whole numbers across the picture's own width and height. */
export const MARK_SCALE = 10000;
export const MARK_MAX_SHAPES = 200;
export const MARK_MAX_PEN_NUMBERS = 4000;
export const MARK_MAX_TOTAL_NUMBERS = 20000;
export const MARK_TEXT_MAX = 80;

export interface MarkShape {
	t: MarkTool;
	c: MarkColor;
	w: MarkWidth;
	/** x0, y0, x1, y1, ... each 0 to MARK_SCALE. */
	p: number[];
	/** The words of a text label, and only of one. */
	s?: string;
}

export interface Marks {
	v: 1;
	shapes: MarkShape[];
}

/** A coordinate clamped to the scale and rounded, the only form ever stored. */
export function markCoord(n: number): number {
	if (!Number.isFinite(n)) return 0;
	return Math.max(0, Math.min(MARK_SCALE, Math.round(n)));
}

/**
 * THE CLIENT'S MIRROR OF THE DATABASE'S GATE: true exactly when 0238 would
 * accept these marks. Null (no drawing) is valid. The test suite puts the same
 * corpus to both.
 */
export function marksOk(value: unknown): value is Marks | null {
	if (value === null || value === undefined) return true;
	if (!isObject(value)) return false;
	if (Object.keys(value).some((k) => k !== 'v' && k !== 'shapes')) return false;
	if (value.v !== 1 || !Array.isArray(value.shapes)) return false;
	if (value.shapes.length > MARK_MAX_SHAPES) return false;
	let total = 0;
	for (const shape of value.shapes) {
		if (!isObject(shape)) return false;
		if (Object.keys(shape).some((k) => !['t', 'c', 'w', 'p', 's'].includes(k))) return false;
		const t = shape.t;
		if (typeof t !== 'string' || !(MARK_TOOLS as readonly string[]).includes(t)) return false;
		if (typeof shape.c !== 'string' || !(MARK_COLOR_IDS as readonly string[]).includes(shape.c)) return false;
		if (shape.w !== 1 && shape.w !== 2 && shape.w !== 3) return false;
		if (!Array.isArray(shape.p)) return false;
		const n = shape.p.length;
		if (n % 2 !== 0) return false;
		if (t === 'pen' && (n < 4 || n > MARK_MAX_PEN_NUMBERS)) return false;
		if ((t === 'arrow' || t === 'box' || t === 'ellipse') && n !== 4) return false;
		if (t === 'text') {
			if (n !== 2 || typeof shape.s !== 'string') return false;
			const words = normText(shape.s);
			if (words.length < 1 || words.length > MARK_TEXT_MAX) return false;
		} else if ('s' in shape) return false;
		for (const c of shape.p) {
			if (typeof c !== 'number' || !Number.isInteger(c) || c < 0 || c > MARK_SCALE) return false;
		}
		total += n;
	}
	return total <= MARK_MAX_TOTAL_NUMBERS;
}

/**
 * A FREEHAND STROKE THINNED TO WHAT THE EYE CAN SEE, so a long drag does not
 * reach the 4000-number cap: a point closer than `minStep` (in mark units, a
 * fifth of a percent of the picture by default) to the last kept point is
 * dropped, and the last point is always kept so the stroke ends where the
 * pointer did. Then capped, keeping the ends.
 */
export function thinStroke(points: readonly number[], minStep = 20): number[] {
	if (points.length < 4) return [...points];
	const out = [points[0], points[1]];
	for (let i = 2; i < points.length - 2; i += 2) {
		const dx = points[i] - out[out.length - 2];
		const dy = points[i + 1] - out[out.length - 1];
		if (dx * dx + dy * dy >= minStep * minStep) out.push(points[i], points[i + 1]);
	}
	out.push(points[points.length - 2], points[points.length - 1]);
	if (out.length > MARK_MAX_PEN_NUMBERS) {
		const pairs = out.length / 2;
		const keep = MARK_MAX_PEN_NUMBERS / 2;
		const step = (pairs - 1) / (keep - 1);
		const capped: number[] = [];
		for (let k = 0; k < keep; k++) {
			const j = Math.round(k * step) * 2;
			capped.push(out[j], out[j + 1]);
		}
		return capped;
	}
	return out;
}

/** Whitespace trimmed at both ends, the way a person means "empty" (0238's `_classroom_feedback_norm`). */
export function normText(s: string): string {
	return s.replace(/^\s+|\s+$/g, '');
}

/* ========================================================================== */
/* Threads as the database answers them                                         */
/* ========================================================================== */

export type FeedbackViewer = 'student' | 'teacher';

export interface FeedbackMessage {
	id: string;
	role: FeedbackViewer;
	/** A shown name, never an address. */
	name: string;
	body: string;
	createdAt: string;
	editedAt: string | null;
	mine: boolean;
}

export interface FeedbackThread {
	id: string;
	itemId: string;
	itemTitle: string;
	studentEmail: string;
	studentName: string;
	blockId: string | null;
	fileId: string | null;
	marks: Marks | null;
	authorName: string;
	createdAt: string;
	updatedAt: string;
	editedAt: string | null;
	fixedAt: string | null;
	resolvedAt: string | null;
	studentSeenAt: string | null;
	teacherSeenAt: string | null;
	viewer: FeedbackViewer;
	/** Classes the instructor could open the work in; empty on the student's side. */
	sections: string[];
	messages: FeedbackMessage[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** One thread from the RPC's JSON, or null for anything that is not one. */
export function parseThread(raw: unknown): FeedbackThread | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const itemId = str(raw.item_id);
	const studentEmail = str(raw.student_email);
	const viewer = raw.viewer === 'teacher' || raw.viewer === 'student' ? raw.viewer : null;
	if (!id || !itemId || !studentEmail || !viewer) return null;
	const messages: FeedbackMessage[] = [];
	for (const m of Array.isArray(raw.messages) ? raw.messages : []) {
		if (!isObject(m)) continue;
		const mid = str(m.id);
		const body = str(m.body);
		const role = m.role === 'teacher' || m.role === 'student' ? m.role : null;
		if (!mid || body === null || !role) continue;
		messages.push({
			id: mid,
			role,
			name: str(m.name) ?? (role === 'teacher' ? 'Your teacher' : 'Student'),
			body,
			createdAt: str(m.created_at) ?? '',
			editedAt: str(m.edited_at),
			mine: m.mine === true
		});
	}
	return {
		id,
		itemId,
		itemTitle: str(raw.item_title) ?? '',
		studentEmail,
		studentName: str(raw.student_name) ?? studentEmail.split('@')[0],
		blockId: str(raw.block_id),
		fileId: str(raw.file_id),
		marks: marksOk(raw.marks) && raw.marks ? (raw.marks as Marks) : null,
		authorName: str(raw.author_name) ?? 'Your teacher',
		createdAt: str(raw.created_at) ?? '',
		updatedAt: str(raw.updated_at) ?? '',
		editedAt: str(raw.edited_at),
		fixedAt: str(raw.fixed_at),
		resolvedAt: str(raw.resolved_at),
		studentSeenAt: str(raw.student_seen_at),
		teacherSeenAt: str(raw.teacher_seen_at),
		viewer,
		sections: (Array.isArray(raw.sections) ? raw.sections : []).filter((s): s is string => typeof s === 'string'),
		messages
	};
}

/** Every thread in an RPC answer, unknown shapes dropped. */
export function parseThreads(raw: unknown): FeedbackThread[] {
	return (Array.isArray(raw) ? raw : []).map(parseThread).filter((t): t is FeedbackThread => t !== null);
}

/* ========================================================================== */
/* How a thread reads                                                            */
/* ========================================================================== */

/** Has this thread moved since this side last looked. */
export function threadUnseen(t: FeedbackThread, side: FeedbackViewer = t.viewer): boolean {
	const seen = side === 'student' ? t.studentSeenAt : t.teacherSeenAt;
	if (!seen) return true;
	const a = Date.parse(t.updatedAt);
	const b = Date.parse(seen);
	return !Number.isNaN(a) && !Number.isNaN(b) && a > b;
}

/** The last message, or null for a drawing with no words. */
export function lastMessage(t: FeedbackThread): FeedbackMessage | null {
	return t.messages.length ? t.messages[t.messages.length - 1] : null;
}

/**
 * WHERE A THREAD STANDS, as one word, from the side reading it. The order is
 * the rule: resolved ends it; a student's Fixed it waits on the teacher; then
 * whoever spoke last is waiting on the other.
 */
export type ThreadStatus = 'resolved' | 'fixed' | 'needs-you' | 'waiting';

export function threadStatus(t: FeedbackThread, side: FeedbackViewer = t.viewer): ThreadStatus {
	if (t.resolvedAt) return 'resolved';
	if (t.fixedAt) return side === 'teacher' ? 'needs-you' : 'fixed';
	const last = lastMessage(t);
	const lastRole: FeedbackViewer = last?.role ?? 'teacher';
	return lastRole === side ? 'waiting' : 'needs-you';
}

/** The words for a status, never colour alone. */
export function threadStatusWords(t: FeedbackThread, side: FeedbackViewer = t.viewer): string {
	const s = threadStatus(t, side);
	if (s === 'resolved') return 'Resolved';
	if (s === 'fixed') return 'You said fixed';
	if (side === 'teacher') {
		if (t.fixedAt) return 'Student says fixed';
		return s === 'needs-you' ? 'Student replied' : 'Waiting on student';
	}
	return s === 'needs-you' ? 'Needs your attention' : 'Waiting on your teacher';
}

/** The receipt line an instructor reads: has the student seen the latest. */
export function seenReceipt(t: FeedbackThread): string {
	if (!t.studentSeenAt) return 'Not seen yet';
	return threadUnseen(t, 'student') ? 'Seen an earlier version' : `Seen ${shortTime(t.studentSeenAt)}`;
}

/** A clock time in the school's zone ("2:14 PM", or "Oct 9, 2:14 PM" on another day). */
export function shortTime(iso: string, now: Date = new Date()): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const zone = 'America/Los_Angeles';
	const day = (x: Date) => x.toLocaleDateString('en-US', { timeZone: zone });
	const time = d.toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' });
	if (day(d) === day(now)) return time;
	return `${d.toLocaleDateString('en-US', { timeZone: zone, month: 'short', day: 'numeric' })}, ${time}`;
}

/** When the feedback last moved, the instant the heartbeat compares against. */
export function feedbackStamp(threads: readonly FeedbackThread[]): string | null {
	let best: string | null = null;
	for (const t of threads) if (!best || Date.parse(t.updatedAt) > Date.parse(best)) best = t.updatedAt;
	return best;
}

/**
 * DOES THIS THREAD WANT THIS SIDE'S ATTENTION: open, and either unread or
 * waiting on this side. A resolved thread never does, even when its last move
 * is unread (an instructor resolving a note is news, not a request), so a
 * count of these never asks somebody to act on a conversation that ended.
 */
export function wantsAttention(t: FeedbackThread, side: FeedbackViewer = t.viewer): boolean {
	if (t.resolvedAt) return false;
	return threadUnseen(t, side) || threadStatus(t, side) === 'needs-you';
}

/** How many threads want this side's attention. */
export function attentionCount(threads: readonly FeedbackThread[], side: FeedbackViewer): number {
	return threads.filter((t) => wantsAttention(t, side)).length;
}

/* ========================================================================== */
/* Naming the place a note is about                                              */
/* ========================================================================== */

interface ManifestLike {
	header?: readonly { id: string; field: string; prompt?: unknown }[];
	modules?: readonly { id: string; title: string; blocks?: readonly { id: string; field: string; prompt?: unknown }[] }[];
}

/**
 * THE WORDS FOR THE PLACE A NOTE IS ABOUT: the module title and the block's own
 * prompt (or field) when the manifest knows it, "the whole worksheet" for a
 * note on no block, and the bare id when the block has since gone from the
 * manifest, which is still something a reader can find.
 */
export function feedbackPlace(manifest: ManifestLike | null | undefined, blockId: string | null): string {
	if (!blockId) return 'The whole worksheet';
	const prompt = (b: { field: string; prompt?: unknown }) =>
		typeof b.prompt === 'string' && b.prompt.trim() ? b.prompt.trim() : b.field;
	for (const b of manifest?.header ?? []) if (b.id === blockId) return `Identity: ${prompt(b)}`;
	for (const m of manifest?.modules ?? []) {
		for (const b of m.blocks ?? []) if (b.id === blockId) return `${m.title}: ${prompt(b)}`;
	}
	return blockId;
}

/** The field a block id is answered under, through the manifest, or null. */
export function blockField(manifest: ManifestLike | null | undefined, blockId: string | null): string | null {
	if (!blockId) return null;
	for (const b of manifest?.header ?? []) if (b.id === blockId) return b.field;
	for (const m of manifest?.modules ?? []) for (const b of m.blocks ?? []) if (b.id === blockId) return b.field;
	return null;
}

/** Every block a note can be about, in manifest order, for a picker. */
export function feedbackPlaces(manifest: ManifestLike | null | undefined): { blockId: string | null; label: string }[] {
	const out: { blockId: string | null; label: string }[] = [{ blockId: null, label: 'The whole worksheet' }];
	for (const b of manifest?.header ?? []) out.push({ blockId: b.id, label: feedbackPlace(manifest, b.id) });
	for (const m of manifest?.modules ?? []) for (const b of m.blocks ?? []) out.push({ blockId: b.id, label: feedbackPlace(manifest, b.id) });
	return out;
}

/** Threads grouped by the field they are about, for pins over the document. */
export function threadsByField(
	manifest: ManifestLike | null | undefined,
	threads: readonly FeedbackThread[]
): Record<string, FeedbackThread[]> {
	const out: Record<string, FeedbackThread[]> = {};
	for (const t of threads) {
		const field = blockField(manifest, t.blockId);
		if (!field) continue;
		(out[field] ??= []).push(t);
	}
	return out;
}

/* ========================================================================== */
/* What the worksheet frame draws: a pin per field, a drawing per picture       */
/* ========================================================================== */

/** One field's pin over the worksheet. */
export interface FieldNote {
	/** The thread the pin opens: the one that most wants this side's attention. */
	threadId: string;
	/** The pin's own words, never colour alone ("New note", "2 notes", "Resolved"). */
	label: string;
	/** The whole sentence, for a screen reader and the tooltip. */
	aria: string;
	unseen: boolean;
	status: ThreadStatus;
}

const STATUS_RANK: Record<ThreadStatus, number> = { 'needs-you': 0, fixed: 1, waiting: 2, resolved: 3 };

/**
 * THE PINS, KEYED BY FIELD. A field with several notes gets one pin that opens
 * the most urgent (unread first, then the one waiting on this side), and the
 * count says how many are still open. A field whose notes are all resolved has
 * no pin; those notes are in the list's Resolved section.
 */
export function fieldNotes(
	manifest: ManifestLike | null | undefined,
	threads: readonly FeedbackThread[],
	side: FeedbackViewer
): Record<string, FieldNote> {
	const out: Record<string, FieldNote> = {};
	for (const [field, list] of Object.entries(threadsByField(manifest, threads))) {
		const ranked = [...list].sort((a, b) => {
			const ua = threadUnseen(a, side) ? 0 : 1;
			const ub = threadUnseen(b, side) ? 0 : 1;
			if (ua !== ub) return ua - ub;
			const ra = STATUS_RANK[threadStatus(a, side)];
			const rb = STATUS_RANK[threadStatus(b, side)];
			if (ra !== rb) return ra - rb;
			return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
		});
		const lead = ranked[0];
		const open = list.filter((t) => !t.resolvedAt).length;
		// A field whose every note is resolved keeps no pin: the conversation
		// ended and is in the list's Resolved section.
		if (open === 0) continue;
		const unseen = list.some((t) => threadUnseen(t, side));
		const label = unseen ? 'New note' : open > 1 ? `${open} notes` : 'Note';
		const whose = side === 'student' ? 'from your teacher' : 'to the student';
		out[field] = {
			threadId: lead.id,
			label,
			aria: `${label} ${whose} on this question: ${threadStatusWords(lead, side)}. Opens it in the feedback list.`,
			unseen,
			status: threadStatus(lead, side)
		};
	}
	return out;
}

/**
 * THE DRAWINGS ON EACH PICTURE, KEYED BY THE FIELD THE PICTURE ANSWERS: every
 * open note's marks on the file that field is SHOWING, laid together. Matched
 * on the picture's own URL (`srcOf`, the submission-file proxy), never on a
 * field-to-file map read at page load, because a student who replaces a
 * picture mid-lesson would otherwise get the old drawing laid over the new
 * photograph. A resolved note's drawing comes off the picture (it is still in
 * its thread), and a note on a replaced picture stays in its thread.
 */
export function marksByField(
	images: Readonly<Record<string, { url: string }>>,
	threads: readonly FeedbackThread[],
	srcOf: (fileId: string) => string
): Record<string, Marks> {
	const byUrl = new Map<string, MarkShape[]>();
	for (const t of threads) {
		if (!t.fileId || !t.marks || t.resolvedAt) continue;
		const url = srcOf(t.fileId);
		byUrl.set(url, [...(byUrl.get(url) ?? []), ...t.marks.shapes]);
	}
	const out: Record<string, Marks> = {};
	for (const [field, image] of Object.entries(images)) {
		const shapes = byUrl.get(image.url);
		if (shapes?.length) out[field] = { v: 1, shapes };
	}
	return out;
}

/** The field names that have a note, for the advisory `idea:feedback` message. */
export function noteFields(notes: Readonly<Record<string, FieldNote>>): string[] {
	return Object.keys(notes).sort((a, b) => a.localeCompare(b));
}

/* ========================================================================== */
/* Refusals, in words                                                            */
/* ========================================================================== */

export type FeedbackRefusal = 'not_found' | 'block' | 'too_long' | 'marks' | 'file' | 'empty' | 'rate' | 'state' | 'unavailable' | 'failed';

export const FEEDBACK_REFUSAL_WORDS: Readonly<Record<FeedbackRefusal, string>> = {
	not_found: 'That note is not there any more, or it is not yours to change.',
	block: 'That question is not on this worksheet any more. Pick another place for the note.',
	too_long: 'A note holds up to 2000 characters. Shorten it and send again.',
	marks: 'The drawing could not be saved. Undo the last mark and try again.',
	file: 'That picture is not this student\'s hand-in any more. Close the drawing and open the picture again.',
	empty: 'Write something, or draw on the picture, before sending.',
	rate: 'That is a lot of messages in one hour. Wait a few minutes and send again.',
	state: 'That button does not apply to this note.',
	unavailable: 'Feedback is not switched on for this site yet.',
	failed: 'The note did not send. Check your connection and try again; what you wrote is still here.'
};

/**
 * A structured refusal from the RPC, to its reason. `Object.hasOwn`, never
 * `in`: a reason is a string from the wire, and `'constructor' in {}` is true.
 */
export function refusalOf(raw: unknown): FeedbackRefusal {
	const r = isObject(raw) ? raw.reason : null;
	return typeof r === 'string' && Object.hasOwn(FEEDBACK_REFUSAL_WORDS, r) ? (r as FeedbackRefusal) : 'failed';
}

/* ========================================================================== */
/* The single place to manage everything from (the instructor's inbox)          */
/* ========================================================================== */

export type InboxView = 'attention' | 'waiting' | 'fixed' | 'resolved' | 'all';

export const INBOX_VIEWS: readonly { id: InboxView; label: string }[] = [
	{ id: 'attention', label: 'Needs you' },
	{ id: 'fixed', label: 'Student says fixed' },
	{ id: 'waiting', label: 'Waiting on student' },
	{ id: 'resolved', label: 'Resolved' },
	{ id: 'all', label: 'All' }
];

export interface InboxFilter {
	view: InboxView;
	itemId: string | null;
	sectionId: string | null;
	query: string;
}

/** The threads one view of the inbox shows, newest activity first. */
export function inboxThreads(threads: readonly FeedbackThread[], f: InboxFilter): FeedbackThread[] {
	const q = f.query.trim().toLowerCase();
	return threads
		.filter((t) => {
			if (f.itemId && t.itemId !== f.itemId) return false;
			if (f.sectionId && !t.sections.includes(f.sectionId)) return false;
			if (q && !`${t.studentName} ${t.itemTitle} ${t.messages.map((m) => m.body).join(' ')}`.toLowerCase().includes(q)) return false;
			const s = threadStatus(t, 'teacher');
			switch (f.view) {
				case 'attention':
					return wantsAttention(t, 'teacher');
				case 'fixed':
					return !!t.fixedAt && !t.resolvedAt;
				case 'waiting':
					return s === 'waiting';
				case 'resolved':
					return s === 'resolved';
				default:
					return true;
			}
		})
		.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
}

/** How many threads each view holds, for the counts beside the view keys. */
export function inboxCounts(threads: readonly FeedbackThread[], f: Omit<InboxFilter, 'view'>): Record<InboxView, number> {
	const out = {} as Record<InboxView, number>;
	for (const v of INBOX_VIEWS) out[v.id] = inboxThreads(threads, { ...f, view: v.id }).length;
	return out;
}

/**
 * THE NOTES ON ONE ASSIGNMENT, BY STUDENT, AS AN EXPORT CARRIES THEM (ledger
 * 0438): every thread oldest first, every message in order, a removed message
 * already absent from the read. Keyed by the lowercased address the roster uses.
 */
export function notesForExport(
	threads: readonly FeedbackThread[]
): Map<string, { blockId: string | null; state: 'open' | 'fixed' | 'resolved'; createdAt: string; messages: { from: 'instructor' | 'student'; at: string; text: string }[] }[]> {
	const out = new Map<string, ReturnType<typeof notesForExport> extends Map<string, infer V> ? V : never>();
	const sorted = [...threads].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
	for (const t of sorted) {
		const key = t.studentEmail.trim().toLowerCase();
		const list = out.get(key) ?? [];
		list.push({
			blockId: t.blockId,
			state: t.resolvedAt ? 'resolved' : t.fixedAt ? 'fixed' : 'open',
			createdAt: t.createdAt,
			messages: t.messages.map((m) => ({ from: m.role === 'student' ? 'student' : 'instructor', at: m.createdAt, text: m.body }))
		});
		out.set(key, list);
	}
	return out;
}
