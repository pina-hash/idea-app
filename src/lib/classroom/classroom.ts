/**
 * Classroom module: client-safe row types + pure helpers (the curriculum.ts
 * convention -- plain data and functions, no Svelte, no Supabase). The data
 * layer is migrations 0082/0083/0085; every write goes through their SECURITY
 * DEFINER RPCs and every read is an RLS-scoped select, so nothing here enforces
 * anything -- it shapes what the policies already returned.
 *
 * SINCE 0085 there is ONE canonical record per piece of content
 * (ClassroomItem) and a POSTING is nothing but "this item appears in this
 * class". A component therefore never asks "which copy of this am I looking
 * at" -- there is only one, and editing it changes every class at once.
 */

import { formatSectionLabel } from '$lib/section-label';
import type { ItemDoc, TiptapNode } from '$lib/classroom/classroom-doc';

// ---------------------------------------------------------------------------
// Row types (mirroring 0085's tables; embeds normalized by the helpers below)
// ---------------------------------------------------------------------------

export interface ClassroomCourse {
	id: string;
	code: string;
	title: string;
	active: boolean;
}

export interface ClassroomSection {
	id: string;
	course_id: string;
	label: string;
	block: string | null;
	teacher_email: string;
	/**
	 * 0083's archive flag. Optional so a pre-0083 read (or the view-as payload
	 * of an older deployment) still types; absent reads as active.
	 */
	active?: boolean;
	/** Embedded course row (normalized from the PostgREST embed key). */
	course: ClassroomCourse | null;
}

/**
 * One attached file (0083, re-pointed at the canonical item by 0085). The bytes
 * live in the school shared drive; this is metadata plus the id the proxy route
 * resolves. `attachmentSrc` is the only place a URL for it is built -- never a
 * drive.google.com link, which would only render for someone who personally has
 * access to that folder.
 */
export interface ClassroomAttachment {
	id: string;
	filename: string;
	mime_type: string;
	size_bytes?: number | null;
	sort_order?: number;
}

export interface ClassroomEnrollment {
	section_id: string;
	student_email: string;
	display_name: string;
	active: boolean;
	updated_at?: string;
}

/** A URL attached to an item (0085 classroom_item_resources). */
export interface ItemLink {
	id?: string;
	label: string;
	url: string;
	sort_order?: number;
}

/** "This item appears in this class." Carries no state of its own, by design. */
export interface ClassroomPosting {
	id?: string;
	section_id: string;
}

export type ClassroomItemKind = 'post' | 'assignment' | 'material';

export interface ClassroomItem {
	id: string;
	kind: ClassroomItemKind;
	title: string | null;
	/**
	 * The body's PLAIN-TEXT projection -- still the column an announcement's
	 * fallback title, the home feed and the 20,000-character cap all read, and
	 * still what renders when `body_doc` is not available.
	 */
	body: string;
	/**
	 * The body as an authored RICH DOCUMENT (0108). `undefined` means the read
	 * did not carry it (a deployment between 0107 and 0108, whose select
	 * degrades rather than blanking every classroom read); null or empty means
	 * the item genuinely has no body. Never read this directly to render --
	 * `itemBodyDoc` in classroom-doc.ts is what falls back to converting the
	 * plain text, so every surface gets the same answer.
	 */
	body_doc?: ItemDoc | null;
	points: number | null;
	due_at: string | null;
	category: string | null;
	author_email: string;
	author_name: string | null;
	published: boolean;
	pinned: boolean;
	/**
	 * 0092's public flag. A MATERIAL may be readable with no session at all --
	 * the printed syllabus goes home for a parent signature, and a parent has no
	 * school account. False on every other kind by CHECK constraint. The flag
	 * alone opens nothing: the public read is one narrow RPC
	 * (classroom_public_reference), never a loosened policy. Optional so a
	 * pre-0092 read still types.
	 */
	is_public?: boolean;
	sort_order: number;
	/** Null while it has only ever been a draft. */
	first_published_at: string | null;
	/** Set only by a content change to an already-published item. */
	edited_at: string | null;
	created_at: string;
	updated_at: string;
	links: ItemLink[];
	attachments: ClassroomAttachment[];
	/** Every class this item is posted to that the CALLER may see. */
	postings: ClassroomPosting[];
	/** The caller's own last-viewed stamp (0085 classroom_item_views). */
	viewed_at?: string | null;
	/**
	 * Instructor-only attachments and links (0090) -- answer keys,
	 * facilitation guides, setup notes, source files. `undefined` means "not
	 * loaded for this read": every server load fetches these ONLY when the
	 * caller manages the item, so a student's item never even carries the
	 * query, let alone the data. An empty array means loaded and genuinely
	 * empty. Every renderer of these two fields gates on `canManage` as well
	 * -- undefined vs [] is a loading detail, never the security boundary.
	 */
	instructorAttachments?: ClassroomAttachment[];
	instructorLinks?: ItemLink[];
}

export const ITEM_KINDS: { id: ClassroomItemKind; label: string; blurb: string }[] = [
	{ id: 'post', label: 'Announcement', blurb: 'Something to tell the class.' },
	{ id: 'assignment', label: 'Assignment', blurb: 'Work to do, with points and a due date.' },
	{ id: 'material', label: 'Material', blurb: 'A syllabus or standing reference. Nothing to hand in.' }
];

export function itemKindLabel(kind: ClassroomItemKind): string {
	return ITEM_KINDS.find((k) => k.id === kind)?.label ?? kind;
}

// ---------------------------------------------------------------------------
// Embed normalization. PostgREST returns embedded relations under their table
// name; the 0085 view_as RPCs build plain jsonb with friendlier keys. Accepting
// both is what lets ONE normalizer serve every read.
// ---------------------------------------------------------------------------

export function normalizeSectionRow(row: Record<string, unknown>): ClassroomSection {
	const embed = (row.classroom_courses ?? row.course) as
		| ClassroomCourse
		| ClassroomCourse[]
		| null
		| undefined;
	const course = Array.isArray(embed) ? (embed[0] ?? null) : (embed ?? null);
	return {
		id: String(row.id),
		course_id: String(row.course_id),
		label: String(row.label),
		block: (row.block as string | null) ?? null,
		teacher_email: String(row.teacher_email),
		active: (row.active as boolean | undefined) ?? true,
		course
	};
}

function sortedBy<T extends { sort_order?: number }>(rows: T[] | null | undefined): T[] {
	return [...(rows ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

export function normalizeItemRow(row: Record<string, unknown>): ClassroomItem {
	const links = sortedBy(
		(row.classroom_item_resources ?? row.links ?? row.resources) as ItemLink[] | undefined
	);
	const attachments = sortedBy(
		(row.classroom_attachments ?? row.attachments) as ClassroomAttachment[] | undefined
	);
	const postings = ((row.classroom_postings ?? row.postings) as ClassroomPosting[] | undefined) ?? [];
	const views = row.classroom_item_views as { viewed_at?: string }[] | undefined;
	return {
		id: String(row.id),
		kind: (row.kind as ClassroomItemKind) ?? 'post',
		title: (row.title as string | null) ?? null,
		body: (row.body as string | null) ?? '',
		// Absent (the column was not selected) and null (no document) are kept
		// apart: undefined means "this read could not tell", which is what the
		// render-time fallback keys on.
		body_doc: 'body_doc' in row ? ((row.body_doc as ItemDoc | null) ?? null) : undefined,
		points: (row.points as number | null) ?? null,
		due_at: (row.due_at as string | null) ?? null,
		category: (row.category as string | null) ?? null,
		author_email: String(row.author_email ?? ''),
		author_name: (row.author_name as string | null) ?? null,
		published: row.published !== false,
		pinned: row.pinned === true,
		is_public: row.is_public === true,
		sort_order: Number(row.sort_order ?? 0),
		first_published_at: (row.first_published_at as string | null) ?? null,
		edited_at: (row.edited_at as string | null) ?? null,
		created_at: String(row.created_at ?? ''),
		updated_at: String(row.updated_at ?? ''),
		links,
		attachments,
		postings,
		// The embed is an array (own-row RLS makes it 0 or 1 long); the view_as
		// payload is a plain stamp.
		viewed_at: (row.viewed_at as string | null) ?? views?.[0]?.viewed_at ?? null
	};
}

// ---------------------------------------------------------------------------
// Attachments
// ---------------------------------------------------------------------------

/**
 * The ONE place an attachment URL is built. Always the app's own proxy, never
 * a drive.google.com link: the files live in a restricted school shared drive,
 * so a direct link renders only for someone who personally has access to that
 * folder. `viewAs` carries the impersonated student's email so the proxy can
 * answer as THAT student would be answered (0083; admin-gated server-side).
 */
export function attachmentSrc(attachmentId: string, viewAs?: string | null): string {
	const local = localAttachmentUrls.get(attachmentId);
	if (local) return local;
	const base = `/api/classroom/attachment/${attachmentId}`;
	return viewAs ? `${base}?as=${encodeURIComponent(viewAs)}` : base;
}

/**
 * URL for an attachment on a PUBLIC material, for the signed-out reference
 * viewer. `?public=1` asks the proxy for its public branch, which resolves the
 * row through classroom_public_attachment (0092) -- a function that answers
 * ONLY for an attachment belonging to a published, public material. The flag
 * can therefore only ever NARROW what the route will serve: it never bypasses a
 * check, it swaps in a strictly stricter one.
 */
export function publicAttachmentSrc(attachmentId: string): string {
	const local = localAttachmentUrls.get(attachmentId);
	if (local) return local;
	return `/api/classroom/attachment/${attachmentId}?public=1`;
}

/**
 * URL for an INSTRUCTOR-ONLY attachment (0090) -- its OWN proxy, never the
 * student-facing one above. Deliberately takes no `viewAs`: that route has no
 * ?as= support at all, on purpose, so there is nothing here to accidentally
 * wire up for a surface (view-as-student) that must never reach it.
 */
export function instructorAttachmentSrc(attachmentId: string): string {
	const local = localAttachmentUrls.get(attachmentId);
	if (local) return local;
	return `/api/classroom/instructor-attachment/${attachmentId}`;
}

/**
 * DEV-HARNESS ONLY (the greenline registerDecalImage convention). /dev/classroom
 * has no Drive and no session, so an "upload" there registers an object URL for
 * the file it just took and the previews are real rather than broken-image
 * fallbacks. The map is empty on every real deployment -- nothing outside the
 * harness ever calls this -- so attachmentSrc's production answer is unchanged.
 */
const localAttachmentUrls = new Map<string, string>();

export function registerLocalAttachmentUrl(attachmentId: string, url: string): void {
	localAttachmentUrls.set(attachmentId, url);
}

/** Mirrors the server's INLINE_TYPES image half: what gets a thumbnail. */
const PREVIEW_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic',
	'image/heif'
]);

export function isImageAttachment(a: ClassroomAttachment): boolean {
	return PREVIEW_TYPES.has((a.mime_type ?? '').toLowerCase());
}

/** A staged (not yet uploaded) file the composer can preview inline. */
export function isPreviewableFile(file: File): boolean {
	const type = (file.type ?? '').toLowerCase();
	if (type.startsWith('image/')) return true;
	// A camera capture can legitimately carry an EMPTY type (the File API
	// requires it when the platform cannot tell) -- the notebook's HEIC lesson.
	return type === '' && /\.(jpe?g|png|gif|webp|heic|heif)$/i.test(file.name ?? '');
}

export function formatBytes(size: number | null | undefined): string {
	if (size == null || Number.isNaN(size)) return '';
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

// ---------------------------------------------------------------------------
// Link previews (0085 bundle; fetched server-side, see /api/classroom/link-preview)
// ---------------------------------------------------------------------------

export interface LinkPreview {
	url: string;
	/** False when the fetch failed or the page carried nothing worth showing. */
	ok: boolean;
	title?: string | null;
	site_name?: string | null;
	image_url?: string | null;
	description?: string | null;
}

/** "example.com" from a URL, for the fallback card when metadata is thin. */
export function linkHost(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, '');
	} catch {
		return url;
	}
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function emailLocal(email: string): string {
	return email.split('@')[0] ?? email;
}

/** Author line: the publish-time name snapshot, else the email's local part. */
export function authorLabel(name: string | null, email: string): string {
	return name?.trim() || emailLocal(email);
}

export function sectionTitle(s: ClassroomSection): string {
	const name = formatSectionLabel(s.label, s.block);
	return s.course ? `${s.course.code} · ${name}` : name;
}

/** Course code + label ordering, with numeric-aware labels (Period 2 < Period 10). */
export function sortSections(sections: ClassroomSection[]): ClassroomSection[] {
	return [...sections].sort((a, b) => {
		const codeA = a.course?.code ?? '';
		const codeB = b.course?.code ?? '';
		if (codeA !== codeB) return codeA.localeCompare(codeB);
		return a.label.localeCompare(b.label, undefined, { numeric: true });
	});
}

/** An item's headline. An announcement may legitimately have none. */
export function itemTitle(item: ClassroomItem): string {
	const t = item.title?.trim();
	if (t) return t;
	const firstLine = item.body.split('\n').find((l) => l.trim() !== '')?.trim() ?? '';
	return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine || 'Untitled';
}

export function formatDue(iso: string | null): string {
	if (!iso) return 'No due date';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const opts: Intl.DateTimeFormatOptions = {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	};
	if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
	return d.toLocaleString(undefined, opts);
}

export function shortWhen(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
	if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
	return d.toLocaleDateString(undefined, opts);
}

/** "Updated Mar 4, 9:15 AM" -- date AND time, since an edit can be same-day. */
export function editedWhen(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const opts: Intl.DateTimeFormatOptions = {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	};
	if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
	return d.toLocaleString(undefined, opts);
}

/** ISO -> the value an <input type="datetime-local"> binds (local time). */
export function isoToLocalInput(iso: string | null): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local input value -> ISO (null when blank/invalid). */
export function localInputToIso(value: string): string | null {
	if (!value.trim()) return null;
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ---------------------------------------------------------------------------
// Edit visibility
// ---------------------------------------------------------------------------

/**
 * Has this item been edited since the viewer last opened it?
 *
 * `edited_at` is stamped ONLY by a content change to an already-published item
 * (0085), so this can never fire for a draft being polished, a pin, or a
 * reorder -- an "Updated" badge always means something the student may have
 * missed. Never viewed at all still counts as unseen, which is the honest
 * answer: they have not read the new version either.
 */
export function isUpdatedForViewer(item: ClassroomItem): boolean {
	if (!item.edited_at) return false;
	if (!item.viewed_at) return true;
	return Date.parse(item.edited_at) > Date.parse(item.viewed_at);
}

// ---------------------------------------------------------------------------
// Stream + classwork shaping
// ---------------------------------------------------------------------------

/**
 * Manual order, applied within a group. `sort_order` 0 means "never placed by
 * hand" and falls to the group's natural order BEHIND anything a teacher
 * actually positioned -- so a partly-ordered group still reads sensibly instead
 * of scattering the unplaced items through the placed ones.
 */
function byManualOrder(a: ClassroomItem, b: ClassroomItem): number {
	const oa = a.sort_order || Number.MAX_SAFE_INTEGER;
	const ob = b.sort_order || Number.MAX_SAFE_INTEGER;
	return oa - ob;
}

function withOrder(
	items: ClassroomItem[],
	natural: (a: ClassroomItem, b: ClassroomItem) => number
): ClassroomItem[] {
	return [...items].sort((a, b) => byManualOrder(a, b) || natural(a, b));
}

const newestFirst = (a: ClassroomItem, b: ClassroomItem) =>
	Date.parse(b.created_at) - Date.parse(a.created_at);

/**
 * The Stream: announcements and assignments, pinned first, then newest first.
 * Materials are deliberately absent -- they are standing references, and a
 * syllabus re-surfacing at the top of a feed every time somebody looks is
 * exactly what pinning in Classwork is for.
 */
export function streamItems(items: ClassroomItem[]): ClassroomItem[] {
	const relevant = items.filter((i) => i.kind === 'post' || i.kind === 'assignment');
	const pinned = relevant.filter((i) => i.pinned);
	const rest = relevant.filter((i) => !i.pinned);
	return [...withOrder(pinned, newestFirst), ...withOrder(rest, newestFirst)];
}

export type ClassworkGroupId = 'pinned' | 'upcoming' | 'materials' | 'undated' | 'past';

export interface ClassworkGroup {
	id: ClassworkGroupId;
	label: string;
	items: ClassroomItem[];
}

/**
 * Classwork: pinned first (any kind), then assignments by due date, with
 * materials in their own shelf. Empty groups are omitted.
 *
 * Every group is independently reorderable, and the RPC is handed the group's
 * ids in the order they are rendered here -- so what gets stored is always
 * exactly the order somebody was looking at.
 */
export function classworkGroups(
	items: ClassroomItem[],
	now: Date = new Date()
): ClassworkGroup[] {
	const relevant = items.filter((i) => i.kind === 'assignment' || i.kind === 'material');
	const pinned: ClassroomItem[] = [];
	const upcoming: ClassroomItem[] = [];
	const materials: ClassroomItem[] = [];
	const undated: ClassroomItem[] = [];
	const past: ClassroomItem[] = [];

	for (const i of relevant) {
		if (i.pinned) pinned.push(i);
		else if (i.kind === 'material') materials.push(i);
		else if (!i.due_at) undated.push(i);
		else if (Date.parse(i.due_at) < now.getTime()) past.push(i);
		else upcoming.push(i);
	}

	const byDueAsc = (a: ClassroomItem, b: ClassroomItem) =>
		Date.parse(a.due_at ?? '') - Date.parse(b.due_at ?? '');
	const byDueDesc = (a: ClassroomItem, b: ClassroomItem) =>
		Date.parse(b.due_at ?? '') - Date.parse(a.due_at ?? '');

	const groups: ClassworkGroup[] = [];
	if (pinned.length) groups.push({ id: 'pinned', label: 'Pinned', items: withOrder(pinned, newestFirst) });
	if (upcoming.length)
		groups.push({ id: 'upcoming', label: 'Upcoming', items: withOrder(upcoming, byDueAsc) });
	if (materials.length)
		groups.push({ id: 'materials', label: 'Materials', items: withOrder(materials, newestFirst) });
	if (undated.length)
		groups.push({ id: 'undated', label: 'No due date', items: withOrder(undated, newestFirst) });
	if (past.length) groups.push({ id: 'past', label: 'Past due', items: withOrder(past, byDueDesc) });
	return groups;
}

/**
 * The id list for a move, computed from the list as RENDERED. Returns null when
 * the move is a no-op (already at the end it was pushed toward), so a caller
 * never sends a pointless write.
 */
export function reorderedIds(
	items: ClassroomItem[],
	itemId: string,
	direction: -1 | 1
): string[] | null {
	const index = items.findIndex((i) => i.id === itemId);
	if (index < 0) return null;
	const target = index + direction;
	if (target < 0 || target >= items.length) return null;
	const ids = items.map((i) => i.id);
	[ids[index], ids[target]] = [ids[target], ids[index]];
	return ids;
}

// ---------------------------------------------------------------------------
// Roster CSV parsing (client-side; the server refuses anything it cannot
// place regardless). Columns, in order: student email, display name, course
// code, section label. A header row is skipped when detected.
// ---------------------------------------------------------------------------

export interface RosterRow {
	email: string;
	name: string;
	course_code: string;
	section_label: string;
}

/** Minimal RFC 4180 record parser: quoted fields, "" escapes, CR/LF endings. */
function parseCsvRecords(text: string): string[][] {
	const out: string[][] = [];
	let field = '';
	let row: string[] = [];
	let inQuotes = false;
	const pushField = () => {
		row.push(field);
		field = '';
	};
	const pushRow = () => {
		pushField();
		if (row.some((c) => c.trim() !== '')) out.push(row);
		row = [];
	};
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (inQuotes) {
			if (ch === '"') {
				if (text[i + 1] === '"') {
					field += '"';
					i++;
				} else {
					inQuotes = false;
				}
			} else {
				field += ch;
			}
		} else if (ch === '"') {
			inQuotes = true;
		} else if (ch === ',') {
			pushField();
		} else if (ch === '\n') {
			pushRow();
		} else if (ch !== '\r') {
			field += ch;
		}
	}
	pushRow();
	return out;
}

export function parseRosterCsv(text: string): { rows: RosterRow[]; errors: string[] } {
	const records = parseCsvRecords(text);
	const rows: RosterRow[] = [];
	const errors: string[] = [];
	if (!records.length) return { rows, errors: ['No rows found.'] };

	// Header detection: a first row that mentions "email" (or carries no @
	// anywhere, which no real data row can) is column labels, not a student.
	let start = 0;
	const first = records[0].join(',').toLowerCase();
	if (first.includes('email') || !first.includes('@')) start = 1;

	for (let i = start; i < records.length; i++) {
		const cells = records[i].map((c) => c.trim());
		const lineNo = i + 1;
		if (cells.length < 4) {
			errors.push(`Row ${lineNo}: expected 4 columns (email, name, course code, section label).`);
			continue;
		}
		const [email, name, course_code, section_label] = cells;
		if (!email.includes('@')) {
			errors.push(`Row ${lineNo}: "${email}" is not an email address.`);
			continue;
		}
		if (!course_code) {
			errors.push(`Row ${lineNo}: missing the course code.`);
			continue;
		}
		if (!section_label) {
			errors.push(`Row ${lineNo}: missing the section label.`);
			continue;
		}
		rows.push({ email: email.toLowerCase(), name, course_code, section_label });
	}
	if (!rows.length && !errors.length) errors.push('No student rows found.');
	return { rows, errors };
}

// ---------------------------------------------------------------------------
// Transports. Components are presentation-only; the real routes wire these to
// the 0082/0083/0085 RPCs, the dev harness answers from an in-memory store (the
// ReviewConsole ReviewTransports convention). Every transport resolves --
// never throws -- so a surface renders refusals inline.
// ---------------------------------------------------------------------------

export type TxResult<T = undefined> = { ok: true; data: T } | { ok: false; message: string };

export interface ImportRowResult {
	row: number;
	email: string;
	ok: boolean;
	reason?: string;
	action?: string;
	message?: string;
}

export interface ImportSummary {
	total: number;
	succeeded: number;
	refused: number;
	results: ImportRowResult[];
}

/**
 * Everything authored on the canonical record.
 *
 * `bodyDoc` is the EDITOR'S OWN document, untrusted and unnormalized -- the
 * save route sanitizes it and derives the plain-text `body` from the result,
 * so a caller never sends both and the two can never be handed in disagreeing.
 * There is deliberately no `body: string` here any more: an input carrying its
 * own plain text beside a document is an input that can lie.
 */
export interface ItemInput {
	title: string | null;
	bodyDoc: TiptapNode | ItemDoc | null;
	points: number | null;
	dueAt: string | null;
	category: string | null;
	links: { label: string; url: string }[];
}

/**
 * What the shared composer needs, and nothing more. Split out from the console
 * set so the SAME composer can be mounted on the class page and the item detail
 * page (where there is no roster, no CSV import and no section setup) -- there
 * is exactly one content editor in this module, reused, never a second one
 * written per surface.
 *
 * The create call hands back the id it made, because attachments are uploaded
 * AFTER the row exists (the file id lives in a row keyed on it).
 */
export interface ClassroomComposerTransports {
	createItem(
		kind: ClassroomItemKind,
		sectionIds: string[],
		input: ItemInput,
		published: boolean
	): Promise<TxResult<{ itemId: string }>>;
	updateItem(
		id: string,
		input: ItemInput,
		published: boolean | null
	): Promise<TxResult<{ itemId: string }>>;
	deleteItem(id: string): Promise<TxResult<undefined>>;
	/** New independent draft; attachments carried by reference, not re-upload. */
	duplicateItem(id: string): Promise<TxResult<{ itemId: string }>>;
	addPostings(itemId: string, sectionIds: string[]): Promise<TxResult<{ added: number }>>;
	removePosting(
		itemId: string,
		sectionId: string
	): Promise<TxResult<{ ok: boolean; reason?: string }>>;
	setPinned(itemId: string, pinned: boolean): Promise<TxResult<undefined>>;
	setOrder(itemIds: string[]): Promise<TxResult<undefined>>;
	uploadAttachment(itemId: string, file: File): Promise<TxResult<undefined>>;
	deleteAttachment(id: string): Promise<TxResult<undefined>>;
	/**
	 * Instructor-only materials (0090). The upload/delete pair mirrors the
	 * student-facing one exactly; the link set is a full replacement, the
	 * `links` (p_resources) convention. Every one of these re-checks that the
	 * caller manages every class the item is posted to -- these transports are
	 * only ever handed to a component already gated on `canManage`, but the
	 * real boundary is the RPC, not that gate.
	 */
	uploadInstructorAttachment(itemId: string, file: File): Promise<TxResult<undefined>>;
	deleteInstructorAttachment(id: string): Promise<TxResult<undefined>>;
	setInstructorResources(
		itemId: string,
		links: { label: string; url: string }[]
	): Promise<TxResult<undefined>>;
	/** Student-owned; a no-op for a teacher looking at their own class. */
	markViewed(itemId: string): Promise<TxResult<undefined>>;
}

export interface ClassroomManageTransports extends ClassroomComposerTransports {
	upsertCourse(
		code: string,
		title: string,
		active?: boolean,
		id?: string | null
	): Promise<TxResult<{ courseId: string; created: boolean }>>;
	upsertSection(
		courseId: string,
		label: string,
		block: string | null,
		id?: string | null,
		teacherEmail?: string | null
	): Promise<TxResult<{ sectionId: string }>>;
	setSectionActive(id: string, active: boolean): Promise<TxResult<undefined>>;
	deleteSection(id: string, confirmLabel: string): Promise<TxResult<SectionDeleteResult>>;
	reloadSections(): Promise<TxResult<{ sections: ClassroomSection[]; courses: ClassroomCourse[] }>>;
	loadRoster(sectionId: string): Promise<TxResult<ClassroomEnrollment[]>>;
	setEnrollment(
		sectionId: string,
		email: string,
		name: string | null,
		active: boolean
	): Promise<TxResult<undefined>>;
	updateEnrollment(
		sectionId: string,
		email: string,
		newEmail: string | null,
		name: string | null
	): Promise<TxResult<{ ok: boolean; reason?: string }>>;
	importRoster(rows: RosterRow[]): Promise<TxResult<ImportSummary>>;
	loadContent(sectionId: string): Promise<TxResult<{ items: ClassroomItem[] }>>;
}

/**
 * classroom_delete_section's answer. `ok: false` with `reason: 'not_empty'` is
 * the DESIGNED path, not an error: a section holding postings or enrollments is
 * never deleted, and the counts come back so the UI can say what would have
 * been lost and offer to archive instead.
 */
export interface SectionDeleteResult {
	ok: boolean;
	reason?: string;
	items?: number;
	enrollments?: number;
}

/** Plain-language summary of a refused section delete. */
export function sectionDeleteBlockedLabel(r: SectionDeleteResult): string {
	const parts: string[] = [];
	if (r.items) parts.push(`${r.items} posted item${r.items === 1 ? '' : 's'}`);
	if (r.enrollments)
		parts.push(`${r.enrollments} enrolled student${r.enrollments === 1 ? '' : 's'}`);
	return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Feedback console (0053's app_feedback, given a moderation status by 0085)
// ---------------------------------------------------------------------------

export type FeedbackStatus = 'new' | 'seen' | 'resolved';

/** One row as app_feedback_admin_list returns it. */
export interface FeedbackRow {
	id: string;
	app: string;
	context: string | null;
	kind: string;
	message: string;
	meta: Record<string, unknown> | null;
	status: FeedbackStatus;
	created_at: string;
	reviewed_at: string | null;
	reviewed_by: string | null;
	submitter_name: string | null;
	submitter_email: string | null;
}

/** Human-readable reason for a refused import row. */
export function importReasonLabel(reason: string | undefined): string {
	switch (reason) {
		case 'bad_email':
			return 'not a valid email address';
		case 'course_not_found':
			return 'no course with that code';
		case 'section_not_found':
			return 'no section with that label';
		case 'not_your_section':
			return 'you are not the teacher of record for that section';
		case 'error':
			return 'unexpected error';
		default:
			return reason ?? 'refused';
	}
}
