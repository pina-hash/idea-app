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
import { parseMarkdown } from '$lib/classroom/reference-spec';
import type { UploadGate } from '$lib/classroom/upload-errors';

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
	/**
	 * Can this person MANAGE the section they are enrolled in (0138)?
	 *
	 * Projected by `classroom_section_roster`, never derived here: admin-ness is
	 * keyed on `app_admins`, which is admin-only readable, so a browser has no
	 * way to ask. UNDEFINED is the degraded rung talking -- a project without
	 * 0138 applied cannot answer, and "cannot tell" must not read as "yes".
	 */
	manages?: boolean;
}

/**
 * THE ONE PLACE A MANAGER STOPS BEING A STUDENT.
 *
 * An instructor with an enrollment row in their own section is an ordinary
 * thing to find: they added themselves to see the class the way a student does,
 * or a roster import swept them in. What is NOT ordinary is what it looked
 * like -- a row on the check-in grid with a LEFT badge and cells nobody can
 * check, a row in the grading roster, a line in the FACTS CSV, and one more
 * head in the Grades denominator -- and until 0138 there was no affordance
 * anywhere to remove it.
 *
 * THE SIGNAL IS THE DATABASE'S, and this function only sorts by it. Every
 * caller reads `manages` off the row rather than asking "is this the teacher of
 * record" for itself; a second spelling of that question is what stops matching
 * the first.
 *
 * IT IS SEPARATE FROM THE OFF-ROSTER COUNT ON PURPOSE. An off-roster email is a
 * finding -- somebody's work arrived attached to no enrollment, which is either
 * a cross-section read or a real enrollment mistake. A manager exclusion is not
 * a finding at all: it is the roster working. Two labels, two sentences,
 * because only one of them is a problem.
 */
export interface RosterSplit {
	/** Roster rows that are somebody's student row. Order is preserved. */
	students: ClassroomEnrollment[];
	/** The addresses dropped because they can manage the section, sorted. */
	managers: string[];
}

export function splitRoster(rows: readonly ClassroomEnrollment[]): RosterSplit {
	const students: ClassroomEnrollment[] = [];
	const managers = new Set<string>();
	for (const row of rows) {
		if (row.manages === true) managers.add(row.student_email);
		else students.push(row);
	}
	return { students, managers: [...managers].sort() };
}

/** The counts `classroom_remove_enrollment` refuses with, one per work kind. */
export interface EnrollmentWorkCounts {
	responses: number;
	submissions: number;
	approvals: number;
	notebook_entries: number;
}

/** What `classroom_remove_enrollment` answers, verbatim. */
export type EnrollmentRemoval =
	| { ok: true; section_id: string; student_email: string }
	| {
			ok: false;
			reason: 'work_attached';
			section_id: string;
			student_email: string;
			total: number;
			counts: EnrollmentWorkCounts;
	  }
	| { ok: false; reason: 'not_enrolled'; student_email: string };

/** Human words for one work kind, singular and plural. */
const WORK_LABELS: Record<keyof EnrollmentWorkCounts, [string, string]> = {
	responses: ['saved answer', 'saved answers'],
	submissions: ['hand-in', 'hand-ins'],
	approvals: ['module approval', 'module approvals'],
	notebook_entries: ['notebook entry', 'notebook entries']
};

/**
 * The refusal, as a sentence somebody can act on. NONZERO COUNTS ONLY: "0
 * hand-ins" is noise in a list whose whole job is to say what is in the way.
 *
 * The order is the order the counts are declared in, which is roughly the order
 * a teacher would go looking. A soft-deleted notebook entry is counted among
 * the entries deliberately (0116/0117 make it restorable, so it is work that
 * can still come back) and the sentence says so, because "1 notebook entry"
 * against an empty-looking notebook is otherwise unexplainable.
 */
export function enrollmentWorkSummary(counts: EnrollmentWorkCounts): string {
	const parts: string[] = [];
	for (const key of Object.keys(WORK_LABELS) as (keyof EnrollmentWorkCounts)[]) {
		const n = counts[key] ?? 0;
		if (n > 0) parts.push(`${n} ${WORK_LABELS[key][n === 1 ? 0 : 1]}`);
	}
	if (parts.length === 0) return '';
	if (parts.length === 1) return parts[0];
	return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
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

/**
 * A teacher-defined group of a course's content ("Unit 1", "Rotation 3"),
 * from 0111.
 *
 * Scoped to the COURSE, not the section, and the reason is the same one that put
 * the assignment on the canonical item: IDEA209H runs three sections on
 * identical pacing, so "Unit 1" is a fact about the course and an item posted to
 * all three is filed once. See the migration header for the full reasoning and
 * the one accepted degradation (an item posted across two different courses).
 */
export interface ClassroomUnit {
	id: string;
	course_id: string;
	name: string;
	sort_order: number;
}

export function normalizeUnitRow(row: Record<string, unknown>): ClassroomUnit {
	return {
		id: String(row.id),
		course_id: String(row.course_id),
		name: String(row.name ?? ''),
		sort_order: Number(row.sort_order ?? 0)
	};
}

/** Manual order first; a unit never placed by hand sorts behind those that were. */
export function sortUnits(units: ClassroomUnit[]): ClassroomUnit[] {
	return [...units].sort(
		(a, b) =>
			(a.sort_order || Number.MAX_SAFE_INTEGER) - (b.sort_order || Number.MAX_SAFE_INTEGER) ||
			a.name.localeCompare(b.name, undefined, { numeric: true })
	);
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
	/**
	 * 0109's go-live time. THREE STATES, and only two columns express them:
	 * `published: false` is a draft; `published: true` with a FUTURE
	 * `publish_at` is scheduled and invisible to students; `published: true`
	 * with a null or past one is live. Optional so a pre-0109 read still types,
	 * and absent reads as live -- which is what every item authored before
	 * scheduling existed genuinely is.
	 */
	publish_at?: string | null;
	/**
	 * 0111's unit. A column on the CANONICAL record, never on a posting, so an
	 * item posted to three classes is filed once and all three read the same
	 * answer by construction. `undefined` means the read did not carry the column
	 * (a deployment between 0110 and 0111, whose select degrades rather than
	 * blanking every classroom read); null means genuinely unfiled.
	 */
	unit_id?: string | null;
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
		// Absent and null are kept apart for the same reason body_doc is: a
		// pre-0109 read cannot tell, and `isScheduled` treats "cannot tell" as
		// live rather than guessing.
		publish_at: 'publish_at' in row ? ((row.publish_at as string | null) ?? null) : undefined,
		// Absent and null kept apart for the same reason: a pre-0111 read cannot
		// tell, and every unfiled item would otherwise be indistinguishable from
		// a read that simply did not ask.
		unit_id: 'unit_id' in row ? ((row.unit_id as string | null) ?? null) : undefined,
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
 * folder.
 *
 * IT TAKES NO `viewAs` ANY MORE. It used to append `?as=<email>` so the proxy
 * would answer as an impersonated student; the classroom view-as class and
 * item previews that produced those URLs are gone, and the proxy no longer
 * reads the parameter. Every caller now gets the CALLER'S own read, which is
 * what every surviving surface wants.
 */
export function attachmentSrc(attachmentId: string): string {
	const local = localAttachmentUrls.get(attachmentId);
	if (local) return local;
	return `/api/classroom/attachment/${attachmentId}`;
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
 * student-facing one above, so an instructor-only file is never resolved
 * through the proxy every student in the class can reach.
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

/**
 * The recorded types that mean "picture", for a DRIVE-backed row. Mirrors the
 * server's INLINE_TYPES image half, which is the allowlist every such row was
 * filtered through on the way in.
 */
const PREVIEW_TYPES = new Set([
	'image/jpeg',
	'image/png',
	'image/webp',
	'image/gif',
	'image/heic',
	'image/heif'
]);

/**
 * Does this attachment get a thumbnail.
 *
 * THE FILENAME IS ASKED FIRST NOW, AND IT HAD TO BE. This was `PREVIEW_TYPES`
 * alone, which is a question about `mime_type` -- and since 0133 the record
 * route stores `application/octet-stream` for every attachment it writes, on
 * purpose, so nothing ever branches on a type the uploader chose. A mime-only
 * predicate therefore answers FALSE for every handout uploaded from now on, and
 * a diagram a teacher attaches to an assignment renders as a download row
 * instead of a picture. Same defect as `isSubmissionFileImage` had, one table
 * over; `fileKindLabel` beside it already moved to the extension for exactly
 * this reason.
 *
 * IT IS A UNION RATHER THAN A REPLACEMENT, which is the whole reason no select
 * had to change for this. Every Drive-backed row keeps thumbnailing on the
 * recorded type it has always thumbnailed on -- the extension can only ever ADD
 * a row to the set -- so there is no pre-0133 case to re-prove and no
 * `storage_key` needed in `ITEM_SELECT`, whose four-rung ladder every classroom
 * read goes through.
 *
 * A NAME THAT LIES COSTS NOTHING. A renamed zip called `.png` gets an `<img>`
 * that fails to decode, and AttachmentList's `onerror` drops it back to the
 * ordinary file row. Nothing is refused, served differently, or gated on this.
 */
export function isImageAttachment(a: ClassroomAttachment): boolean {
	return isImageFilename(a.filename) || PREVIEW_TYPES.has((a.mime_type ?? '').toLowerCase());
}

// ---------------------------------------------------------------------------
// Figures in authored prose
//
// ONE RESOLVER FOR BOTH KINDS. An assignment spec's `instructions` block and a
// reference document's `instructions` / `callout` blocks carry the identical
// `{ type: 'instructions', content: string }` shape and go through the identical
// MarkdownText renderer, so they get the identical rule from the identical
// function. A second copy for "the public one" is how the two would come to
// disagree about what `data:` means.
//
// SAFEHREF IS NOT REUSED HERE, ON PURPOSE. `safeHref` (reference-spec.ts) admits
// http, https and mailto, which is right for an ANCHOR: a link is navigation the
// reader chooses to follow, to a destination their browser will show them in a
// new tab. An `img src` is neither of those things. The browser fetches it
// automatically, with the reader's IP and Referer, before anyone has decided
// anything -- so an authored external image is a beacon that fires on open, on a
// document we serve to signed-out readers over a printed QR code. The two are
// different threat surfaces and get different predicates; `safeHref` must never
// be widened to cover this, and this must never be narrowed into it.
// ---------------------------------------------------------------------------

/**
 * THE ABSOLUTE PATHS A FIGURE MAY NAME. Explicit, exported and greppable rather
 * than a pattern, because "which directories may authored content point an
 * automatic fetch at" is a decision worth being able to find and worth being
 * able to test. Widening it is one line here, and that line is the whole review.
 *
 * `/IDEA/` is the brand-asset mirror (static/IDEA) that `rewriteLegacyLinks` and
 * the icon set already depend on. It is the only static directory in this repo
 * holding images intended to be referenced by name.
 */
export const FIGURE_STATIC_PREFIXES = ['/IDEA/'] as const;

/** Why a figure will not be shown. Every one renders identically (caption plus
 *  a visible marker); the reason exists so a test can name the shape it means
 *  and so the marker can say something true. */
export type FigureRefusal =
	| 'empty'
	| 'scheme'
	| 'protocol-relative'
	| 'not-absolute'
	| 'off-prefix'
	| 'svg'
	| 'unresolved';

export type FigureSrc =
	| { ok: true; src: string; attachmentId: string | null }
	| { ok: false; reason: FigureRefusal };

/** The reference string an author writes for one attachment. ONE spelling, used
 *  by the resolver below and by the copy affordance in AttachmentList, so the
 *  string an author is handed is by construction the string the parser reads. */
export function figureReference(filename: string): string {
	return `![${filename.replace(/\.[^./\\]+$/, '')}](attachment:${filename})`;
}

/**
 * A filename `figureReference` can turn into something that actually renders.
 *
 * `FIGURE_RE` (reference-spec.ts) matches a src of `[^)\s]+` and a caption of
 * `[^\]]+`, so a name carrying whitespace, `(`, `)`, `[` or `]` produces a
 * line that falls through to the paragraph path -- inert markup on the page,
 * silently, with no indication anything is wrong. Applied at the point a NEW
 * attachment is recorded (`classroom_add_attachment`'s `p_filename`), never to
 * the storage KEY, which was already a uuid and carries nothing a person
 * typed either way -- this is a display-name choice, not a security one.
 *
 * A name already stored keeps whatever it was called before this existed;
 * see the refusal SpecProseField still carries for that case.
 */
export function sanitizeAttachmentFilename(filename: string): string {
	const trimmed = filename.trim();
	if (!trimmed) return trimmed;
	const cleaned = trimmed
		.replace(/[\s()[\]]+/g, '-')
		.replace(/-{2,}/g, '-')
		.replace(/^-+|-+$/g, '');
	return cleaned || 'attachment';
}

const ATTACHMENT_PREFIX = 'attachment:';
/** Any scheme at all: `http:`, `data:`, `javascript:`, `vbscript:`, `file:`. */
const HAS_SCHEME_RE = /^[a-z][a-z0-9+.\-]*:/i;
/**
 * SVG IS REFUSED WHEREVER IT COMES FROM, BY EXTENSION AND BY MIME. An SVG is a
 * document, not a picture: it can carry `<script>`, external references and
 * event handlers, and a same-origin one loaded in an `img` is the one image
 * format where "it is on our own domain" makes the problem worse rather than
 * better. Both spellings are checked because either can be the only one
 * present -- a static path has an extension and no mime, an attachment has a
 * mime and may have been uploaded under any name.
 */
const SVG_NAME_RE = /\.svgz?$/i;

function isSvgName(name: string): boolean {
	return SVG_NAME_RE.test(name.trim());
}
function isSvgMime(mime: string | null | undefined): boolean {
	return (mime ?? '').toLowerCase().includes('svg');
}
/** The path with any query and fragment removed, so an extension check cannot
 *  be walked past with `/IDEA/x.svg?a=.png`. */
function pathOnly(ref: string): string {
	return ref.split('#')[0].split('?')[0];
}

/**
 * An authored figure `src` -> something an `img` may load, or a refusal.
 *
 * `attachment:<filename>` matches case-insensitively against the attachments of
 * the item BEING RENDERED, first match wins, and resolves through the existing
 * helpers -- so the signed-in item page gets the plain RLS-enforcing proxy path
 * and the public reference viewer gets the `?public=1` branch, which resolves
 * through `classroom_public_attachment` and can therefore only ever answer for
 * a file on a published public material. Never a drive.google.com URL, for the
 * reason `attachmentSrc` states: those render only for someone who personally
 * has access to the school's shared drive.
 *
 * THE ALIAS RATHER THAN A FILE ID IS THE POINT (MATERIAL_SPEC v2.2). A spec is
 * authored before the item exists, has to survive the file being re-uploaded
 * under a new id, and has to still mean something in the exported copy under
 * `materials/`. A uuid satisfies none of those.
 *
 * NO ATTACHMENTS IS NOT AN ERROR. A caller that passes none -- a preview, a
 * harness, a surface that does not load them -- resolves every `attachment:`
 * reference to `unresolved`, which renders as the caption plus a marker. That
 * is the correct degradation and it is the same one a typo produces.
 */
export function resolveFigureSrc(
	raw: string,
	attachments: ClassroomAttachment[] = [],
	opts: { public?: boolean } = {}
): FigureSrc {
	const ref = (raw ?? '').trim();
	if (!ref) return { ok: false, reason: 'empty' };

	// FIRST, because `attachment:` is itself a scheme and the scheme check below
	// would otherwise refuse the one form this feature exists to support.
	if (ref.toLowerCase().startsWith(ATTACHMENT_PREFIX)) {
		const filename = ref.slice(ATTACHMENT_PREFIX.length).trim();
		if (!filename) return { ok: false, reason: 'empty' };
		if (isSvgName(filename)) return { ok: false, reason: 'svg' };
		const wanted = filename.toLowerCase();
		const match = attachments.find((a) => (a.filename ?? '').toLowerCase() === wanted);
		if (!match) return { ok: false, reason: 'unresolved' };
		// Checked again on the ROW, not only on the authored string: the stored
		// mime is what the proxy will serve, and it is the half an author cannot
		// see when they type the reference.
		if (isSvgMime(match.mime_type) || isSvgName(match.filename ?? '')) {
			return { ok: false, reason: 'svg' };
		}
		return {
			ok: true,
			attachmentId: match.id,
			src: opts.public ? publicAttachmentSrc(match.id) : attachmentSrc(match.id)
		};
	}

	// BEFORE the scheme test: `//evil.example/x.png` carries no scheme at all and
	// would sail past it, then fail the leading-slash test for the wrong reason.
	// It is the classic protocol-relative external load and it is refused by name.
	if (ref.startsWith('//')) return { ok: false, reason: 'protocol-relative' };
	// http, https, data, javascript, and everything else with a colon in front.
	if (HAS_SCHEME_RE.test(ref)) return { ok: false, reason: 'scheme' };
	if (!ref.startsWith('/')) return { ok: false, reason: 'not-absolute' };
	// Traversal, plain and percent-encoded, and the Windows separator. A prefix
	// test alone would accept `/IDEA/../../anything`.
	if (ref.includes('..') || /%2e/i.test(ref) || ref.includes('\\')) {
		return { ok: false, reason: 'off-prefix' };
	}
	if (isSvgName(pathOnly(ref))) return { ok: false, reason: 'svg' };
	if (!FIGURE_STATIC_PREFIXES.some((prefix) => ref.startsWith(prefix))) {
		return { ok: false, reason: 'off-prefix' };
	}
	return { ok: true, src: ref, attachmentId: null };
}

/**
 * Every filename an `attachment:<filename>` figure names, anywhere in a set
 * of authored prose blocks -- lowercased, matching `resolveFigureSrc`'s own
 * case-insensitive lookup.
 *
 * THE ONE WALK. A caller holding a spec's own block shapes (an assignment
 * module's `instructions` content, a reference section's `instructions` or
 * `callout` content) gathers the strings and hands them here rather than a
 * second copy of the figure syntax reappearing wherever this question gets
 * asked. `resolveFigureSrc` decides whether ONE reference resolves; this
 * decides which filenames are named by ANY reference, which is what the
 * attachment list needs to exclude a file its own figure already renders.
 */
export function figureAttachmentFilenames(proseBlocks: string[]): Set<string> {
	const names = new Set<string>();
	for (const content of proseBlocks) {
		for (const node of parseMarkdown(content)) {
			if (node.type !== 'figure') continue;
			const src = node.src.trim();
			if (!src.toLowerCase().startsWith(ATTACHMENT_PREFIX)) continue;
			const filename = src.slice(ATTACHMENT_PREFIX.length).trim().toLowerCase();
			if (filename) names.add(filename);
		}
	}
	return names;
}

/**
 * Is this attachment ALSO a figure -- rendered inline by an `attachment:`
 * reference somewhere in the item's spec. An attachment a figure names is
 * excluded from the plain attachment list (ItemDetail's "Files" section), so
 * the image is not on the page twice; everything else lists as it always has.
 *
 * A filename with no matching attachment (a typo, or a figure naming a file
 * nobody uploaded) never reaches this predicate as true for anything real:
 * `figureFilenames` may hold a name that matches no row, which changes
 * nothing here and leaves `resolveFigureSrc` to report it unresolved exactly
 * as before.
 */
export function attachmentIsFigure(
	a: ClassroomAttachment,
	figureFilenames: Set<string>
): boolean {
	return figureFilenames.has((a.filename ?? '').toLowerCase());
}

/**
 * WHAT NAME READS AS A PICTURE. THE ONE COPY, and every surface that decides
 * whether to draw a thumbnail calls it.
 *
 * KEYED ON THE FILENAME EXTENSION ALONE, because since 0133 there is nothing
 * else honest to key on: every stored object is `application/octet-stream` by
 * the route's own hand, so `mime_type` on a storage-backed row answers the same
 * for a photograph and for a 60 MB assembly. `File.type` is worse again -- it is
 * the uploader's guess, and it is legitimately EMPTY for a HEIC off an iPhone.
 *
 * IT DECIDES NOTHING ABOUT ACCESS AND REFUSES NOTHING. A name that turns out not
 * to decode simply loses its thumbnail through the img element's own `onerror`,
 * and the file downloads exactly as it would have.
 *
 * There were THREE copies of this regex on this branch (here, FileUploadPanel's
 * `PREVIEWABLE_EXT`, and about to be a fourth for submission files). Three
 * spellings of "is this a picture" is three things that stop agreeing about
 * `.avif`.
 */
const IMAGE_FILENAME_RE = /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i;

export function isImageFilename(name: string | null | undefined): boolean {
	return IMAGE_FILENAME_RE.test(name ?? '');
}

/**
 * A staged (not yet uploaded) file a composer can preview inline. The same rule
 * as an already-uploaded one, asked of the handle instead of the row.
 */
export function isPreviewableFile(file: File): boolean {
	return isImageFilename(file.name);
}

export function formatBytes(size: number | null | undefined): string {
	if (size == null || Number.isNaN(size)) return '';
	if (size < 1024) return `${size} B`;
	if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
	return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/** Mime-type prefix -> a short badge for the non-image type indicator. */
const MIME_KIND_LABELS: [prefix: string, label: string][] = [
	['application/pdf', 'PDF'],
	['application/vnd.ms-excel', 'XLS'],
	['application/vnd.openxmlformats-officedocument.spreadsheetml', 'XLS'],
	['application/vnd.ms-powerpoint', 'PPT'],
	['application/vnd.openxmlformats-officedocument.presentationml', 'PPT'],
	['application/msword', 'DOC'],
	['application/vnd.openxmlformats-officedocument.wordprocessingml', 'DOC'],
	['application/zip', 'ZIP'],
	['application/x-zip-compressed', 'ZIP'],
	['text/csv', 'CSV'],
	['text/plain', 'TXT'],
	['video/', 'VIDEO'],
	['audio/', 'AUDIO']
];
/**
 * Filename extension -> the same badge.
 *
 * THIS IS NOW THE PRIMARY PATH, NOT THE FALLBACK. Since 0133 every uploaded
 * object is STORED as application/octet-stream -- never the browser's guess --
 * so the mime map above answers for Drive-backed rows written before it and
 * this map answers for everything since. Which means an extension missing here
 * is not a rare edge, it is a file reading "FILE" on a class page.
 *
 * The CAD and maker formats are here because they are what an engineering class
 * actually hands in, and the platform refused every one of them until 0133.
 * A badge is DISPLAY ONLY: nothing is gated on it, nothing is served from it,
 * and an extension nobody listed still uploads and still downloads.
 */
const EXT_KIND_LABELS: Record<string, string> = {
	pdf: 'PDF',
	doc: 'DOC',
	docx: 'DOC',
	xls: 'XLS',
	xlsx: 'XLS',
	csv: 'CSV',
	ppt: 'PPT',
	pptx: 'PPT',
	zip: 'ZIP',
	'7z': 'ZIP',
	rar: 'ZIP',
	txt: 'TXT',
	md: 'TXT',
	log: 'TXT',
	mp4: 'VIDEO',
	mov: 'VIDEO',
	mp3: 'AUDIO',
	wav: 'AUDIO',
	// SolidWorks, which is what GAUNTLET and the design classes run.
	sldprt: 'CAD',
	sldasm: 'CAD',
	slddrw: 'CAD',
	// Neutral interchange, and the two the school's other tools emit.
	step: 'CAD',
	stp: 'CAD',
	iges: 'CAD',
	igs: 'CAD',
	x_t: 'CAD',
	f3d: 'CAD',
	f3z: 'CAD',
	ipt: 'CAD',
	iam: 'CAD',
	// Drawings.
	dwg: 'CAD',
	dxf: 'CAD',
	// Print and mesh.
	stl: 'MESH',
	obj: 'MESH',
	'3mf': 'MESH',
	gcode: 'MESH',
	// Firmware and code a robotics class hands in.
	ino: 'CODE',
	py: 'CODE',
	cpp: 'CODE',
	h: 'CODE',
	java: 'CODE',
	js: 'CODE',
	ts: 'CODE',
	json: 'CODE'
};

/**
 * A short, clear type indicator for a non-image file (PDF / DOC / ZIP / ...),
 * falling back to the extension, then to FILE. Shared by every attachment /
 * submission-file list so a document reads as what it is at a glance instead
 * of a generic paper glyph.
 */
export function fileKindLabel(filename: string, mimeType: string | null | undefined): string {
	const mime = (mimeType ?? '').toLowerCase();
	for (const [prefix, label] of MIME_KIND_LABELS) {
		if (mime.startsWith(prefix)) return label;
	}
	const ext = (filename ?? '').split('.').pop()?.toLowerCase() ?? '';
	return EXT_KIND_LABELS[ext] ?? 'FILE';
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
	// NEVER PUBLISHED, SO THERE IS NOTHING TO HAVE MISSED. The badge is
	// student-facing change signalling -- "this changed since you last read it"
	// -- and an item that has never gone live has not been read by anyone. A
	// draft edited twice before it is first posted was showing "Updated" to the
	// teacher writing it, which is noise at best and, on the day it is finally
	// published, a signal pointing at nothing.
	//
	// `first_published_at` is exactly the right question: 0085 stamps it once,
	// the first time an item is published, and never clears it. So an item that
	// was published and later pulled back to draft KEEPS its badge, which is
	// correct -- a class has seen it, and what they saw has changed.
	//
	// This mirrors the rule `classroom_update_item` already applies on the way
	// in: `edited_at` is only stamped when `first_published_at is not null`. The
	// two agree now; before this, a row could carry `edited_at` from some other
	// path and be badged for a draft nobody had ever seen.
	if (!item.first_published_at) return false;
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

/**
 * The id the group of unfiled content carries. Not a uuid, so it can never
 * collide with a real unit id, and never sent to a write path -- `unitIdFor`
 * below is what turns a picker's value back into the null the RPC takes.
 */
export const UNFILED_GROUP_ID = 'unfiled';

export interface ClassGroup {
	id: string;
	/** Null for the unfiled group; a real unit otherwise. */
	unit: ClassroomUnit | null;
	label: string;
	items: ClassroomItem[];
}

/**
 * A class's content, grouped by the units its teacher authored.
 *
 * This REPLACES the Stream/Classwork pair. Both showed the same items in two
 * orderings: Stream duplicated the home feed, which already ranks by urgency and
 * does it better, and Classwork grouped by due-date buckets these courses are
 * not organized into. The grouping is the teacher's own now.
 *
 * ORDER: units in their manual order, then the unfiled group LAST -- the
 * authored structure is the spine of the page, and newly posted content must not
 * push Unit 1 down. What is urgent is the home feed's question, not this page's.
 *
 * WITHIN a group: pinned first, then manual order, then newest first -- the
 * same rule `streamItems` has always applied, so a class with no units yet reads
 * exactly as the Stream did.
 *
 * `includeEmptyUnits` is the manager's view: an empty unit is structure they are
 * about to file into, and it has to be visible to be a drop target. For a
 * student it is noise, so it is omitted.
 */
export function classGroups(
	items: ClassroomItem[],
	units: ClassroomUnit[],
	opts: { includeEmptyUnits?: boolean; unfiledLabel?: string } = {}
): ClassGroup[] {
	const byUnit = new Map<string, ClassroomItem[]>();
	const unfiled: ClassroomItem[] = [];
	const known = new Set(units.map((u) => u.id));
	for (const item of items) {
		const id = item.unit_id;
		// A unit id this reader cannot see (or a pre-0111 read, which carries no
		// column at all) is treated as unfiled rather than dropped: an item must
		// always appear somewhere.
		if (id && known.has(id)) {
			const list = byUnit.get(id) ?? [];
			list.push(item);
			byUnit.set(id, list);
		} else {
			unfiled.push(item);
		}
	}

	const groups: ClassGroup[] = [];
	for (const unit of sortUnits(units)) {
		const list = byUnit.get(unit.id) ?? [];
		if (!list.length && !opts.includeEmptyUnits) continue;
		groups.push({
			id: unit.id,
			unit,
			label: unit.name,
			items: orderedForGroup(list)
		});
	}
	if (unfiled.length || !groups.length) {
		groups.push({
			id: UNFILED_GROUP_ID,
			unit: null,
			label: opts.unfiledLabel ?? 'Not in a unit',
			items: orderedForGroup(unfiled)
		});
	}
	return groups;
}

/** Pinned first, then the teacher's manual order, then newest. */
function orderedForGroup(items: ClassroomItem[]): ClassroomItem[] {
	const pinned = items.filter((i) => i.pinned);
	const rest = items.filter((i) => !i.pinned);
	return [...withOrder(pinned, newestFirst), ...withOrder(rest, newestFirst)];
}

/** A picker's value back to what the RPC takes: the unfiled sentinel is null. */
export function unitIdFor(value: string): string | null {
	return !value || value === UNFILED_GROUP_ID ? null : value;
}

// ---------------------------------------------------------------------------
// Which unit groups this user keeps folded
//
// Stored per USER in `profiles.preferences.classroomUnits`, the same free-form
// JSONB the launcher keeps its homepage layout in and the home feed keeps its
// collapsed class cards in -- so a folded unit stays folded on their phone, and
// it needed no migration.
//
// KEYED BY SECTION AND GROUP TOGETHER. A unit belongs to the course, so its id
// is the same in every section of it; without the section in the key, folding
// "Unit 1" in Period 2 would fold it in Period 4 as well, which is a fold
// nobody asked for on a page they were not looking at.
// ---------------------------------------------------------------------------

export interface ClassViewPrefs {
	collapsed?: string[];
}

function groupKey(sectionId: string, groupId: string): string {
	return `${sectionId}::${groupId}`;
}

export function readClassViewPrefs(preferences: unknown): ClassViewPrefs {
	if (!preferences || typeof preferences !== 'object') return {};
	const raw = (preferences as Record<string, unknown>).classroomUnits;
	if (!raw || typeof raw !== 'object') return {};
	const collapsed = (raw as Record<string, unknown>).collapsed;
	return {
		collapsed: Array.isArray(collapsed) ? collapsed.filter((c) => typeof c === 'string') : []
	};
}

/** The group ids folded in ONE section, which is all that section's view needs. */
export function collapsedGroups(prefs: ClassViewPrefs, sectionId: string): string[] {
	const prefix = `${sectionId}::`;
	return (prefs.collapsed ?? [])
		.filter((k) => k.startsWith(prefix))
		.map((k) => k.slice(prefix.length));
}

export function toggleGroupCollapsed(
	prefs: ClassViewPrefs,
	sectionId: string,
	groupId: string
): ClassViewPrefs {
	const key = groupKey(sectionId, groupId);
	const cur = prefs.collapsed ?? [];
	return {
		...prefs,
		collapsed: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]
	};
}

// ---------------------------------------------------------------------------
// A student's own standing on one assignment
// ---------------------------------------------------------------------------

export type WorkState = 'not-started' | 'in-progress' | 'submitted' | 'returned';

export interface StudentWork {
	state: WorkState;
	/** Released score, and only ever on a returned submission. */
	score: number | null;
}

/** The submission columns this needs, and nothing more. */
export interface SubmissionSummary {
	item_id: string;
	state: string;
	score: number | null;
}

/**
 * Where each of the caller's own assignments stands, keyed by item id.
 *
 * Reads whatever the RLS-scoped submissions select returned -- for a student the
 * policy answers with exactly their own rows, so there is no filter here and
 * none is wanted (the /coin-balance doctrine). Never called for a manager: their
 * own policy would hand them the whole class, and a teacher has no personal
 * standing on their own assignment.
 *
 * NO ROW AT ALL IS "not started", which is the honest reading: 0086 creates the
 * submission row the moment a response is saved or a file uploaded, so its
 * absence means nothing has been done.
 */
export function studentWorkMap(rows: SubmissionSummary[]): Record<string, StudentWork> {
	const out: Record<string, StudentWork> = {};
	for (const row of rows) {
		const state: WorkState =
			row.state === 'returned' ? 'returned' : row.state === 'submitted' ? 'submitted' : 'in-progress';
		out[row.item_id] = { state, score: state === 'returned' ? (row.score ?? null) : null };
	}
	return out;
}

export function workStateLabel(work: StudentWork, points: number | null): string {
	switch (work.state) {
		case 'returned':
			return work.score == null
				? 'Returned'
				: points == null
					? `Returned · ${work.score}`
					: `Returned · ${work.score}/${points}`;
		case 'submitted':
			return 'Submitted';
		case 'in-progress':
			return 'In progress';
		default:
			return 'Not started';
	}
}

/**
 * Where ONE assignment's grading stands, for the Grades tab.
 *
 * Every number is a count over rows the caller could already read: a manager
 * reads their own class's submissions through classroom_can_review_submission,
 * which is the same policy the grading console itself runs under. Nothing here
 * is privileged and nothing new is exposed -- it is the list somebody used to
 * assemble by opening every assignment in turn.
 */
export interface AssignmentStanding {
	item: ClassroomItem;
	/** Handed in and not yet returned -- the number that means "do something". */
	awaiting: number;
	returned: number;
	/** Started but not handed in. */
	inProgress: number;
	/** Actively enrolled students, the denominator. */
	roster: number;
}

/** Tally submissions per assignment. Pure, so the shape is checkable on its own. */
export function assignmentStandings(
	items: ClassroomItem[],
	submissions: SubmissionSummary[],
	rosterSize: number
): AssignmentStanding[] {
	const byItem = new Map<string, SubmissionSummary[]>();
	for (const row of submissions) {
		const list = byItem.get(row.item_id) ?? [];
		list.push(row);
		byItem.set(row.item_id, list);
	}
	return items
		.filter((i) => i.kind === 'assignment')
		.map((item) => {
			const rows = byItem.get(item.id) ?? [];
			return {
				item,
				awaiting: rows.filter((r) => r.state === 'submitted').length,
				returned: rows.filter((r) => r.state === 'returned').length,
				inProgress: rows.filter((r) => r.state !== 'submitted' && r.state !== 'returned').length,
				roster: rosterSize
			};
		});
}

/** Existing tones only -- crimson stays reserved for LIVE/REC/error. */
export function workStateTone(state: WorkState): 'good' | 'attention' | 'muted' | 'info' {
	switch (state) {
		case 'returned':
			return 'good';
		case 'submitted':
			return 'info';
		case 'in-progress':
			return 'attention';
		default:
			return 'muted';
	}
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

/**
 * The id list for a DRAG to an arbitrary position, computed from the group AS
 * RENDERED. `toIndex` is the rendered index of the row the item was dropped
 * on -- the item is moved to sit there, same index-based semantics as
 * `reorderPiece` in GREENLINE's `PieceChainBuilder`. Returns null when the
 * item is not in the list or the drop is onto itself (a no-op), so a caller
 * never sends a pointless write.
 */
export function dragReorderedIds(
	groupItems: ClassroomItem[],
	fromId: string,
	toIndex: number
): string[] | null {
	const ids = groupItems.map((i) => i.id);
	const from = ids.indexOf(fromId);
	if (from < 0) return null;
	const dest = Math.max(0, Math.min(ids.length - 1, toIndex));
	if (dest === from) return null;
	const [moved] = ids.splice(from, 1);
	ids.splice(dest, 0, moved);
	return ids;
}

/**
 * Whether a drag crossed the pin boundary: the dragged item was pinned, and
 * the new order puts at least one UNPINNED item ahead of it. `orderedForGroup`
 * always re-splits pinned first, so an order written across that boundary
 * would otherwise be silently discarded on the next render -- the item stays
 * at the top of the pinned block regardless of where it was dropped. Never
 * fires the other way (an unpinned item dragged up among pinned ones does not
 * get pinned by the drag; only "Pin to top" pins).
 */
export function dragCrossesPinBoundary(
	groupItems: ClassroomItem[],
	fromId: string,
	newIds: string[]
): boolean {
	const moved = groupItems.find((i) => i.id === fromId);
	if (!moved?.pinned) return false;
	const pinnedIds = new Set(groupItems.filter((i) => i.pinned).map((i) => i.id));
	const finalIndex = newIds.indexOf(fromId);
	for (let i = 0; i < finalIndex; i++) {
		if (!pinnedIds.has(newIds[i])) return true;
	}
	return false;
}

export interface DragReorder {
	ids: string[];
	/** True when the caller must also unpin the dragged item -- see above. */
	unpin: boolean;
}

/** Composes `dragReorderedIds` + `dragCrossesPinBoundary` for one drop. */
export function dragReorder(
	groupItems: ClassroomItem[],
	fromId: string,
	toIndex: number
): DragReorder | null {
	const ids = dragReorderedIds(groupItems, fromId, toIndex);
	if (!ids) return null;
	return { ids, unpin: dragCrossesPinBoundary(groupItems, fromId, ids) };
}

/**
 * The ids to send to `setOrder` after filing one or more items into a
 * DIFFERENT unit group: the destination's existing order (the filed ids
 * excluded, in case one is somehow already listed) followed by the filed ids
 * themselves, in the order they were filed.
 *
 * `sort_order` lives on the canonical item while ordering is applied per unit
 * group, so an item carrying a number from the group that never placed it
 * would file into an arbitrary position instead of landing at the end of
 * where it was just filed. One implementation for both the single-item picker
 * and the bulk file action.
 */
export function renumberedForFiling(destGroupItems: ClassroomItem[], filedIds: string[]): string[] {
	const filed = new Set(filedIds);
	const base = destGroupItems.map((i) => i.id).filter((id) => !filed.has(id));
	return [...base, ...filedIds];
}

/**
 * The selection-scope signature: a multi-select must not survive a move to a
 * different class, or a change in the class's own unit structure -- either
 * one means the ids currently checked may no longer even exist on screen. It
 * does NOT change on an item merely moving between existing groups (a
 * successful bulk file, for instance), which is what lets a partial failure
 * leave its refused ids selected across the very reload that reports it.
 */
export function selectionScopeKey(sectionId: string, groups: ClassGroup[]): string {
	return `${sectionId}::${groups.map((g) => g.id).join(',')}`;
}

export interface BulkOutcome {
	succeededIds: string[];
	failedIds: string[];
	firstFailureMessage: string | null;
}

/**
 * Apply `fn` to every id independently, per the bulk-action convention
 * (`classroom_import_roster`'s summary, 0110's per-item export status): one
 * refusal must never obscure whether the rest landed. Every id is attempted
 * regardless of an earlier failure, and the caller decides what a partial
 * result means -- which ids to keep selected, what to say.
 */
export async function runBulk(
	ids: string[],
	fn: (id: string) => Promise<{ ok: boolean; message?: string }>
): Promise<BulkOutcome> {
	const results = await Promise.all(ids.map(async (id) => ({ id, res: await fn(id) })));
	const succeededIds = results.filter((r) => r.res.ok).map((r) => r.id);
	const failed = results.filter((r) => !r.res.ok);
	return {
		succeededIds,
		failedIds: failed.map((f) => f.id),
		firstFailureMessage: failed[0]?.res.message ?? null
	};
}

/** The one sentence for a partial bulk failure: what did not land, and why. */
export function bulkFailureMessage(failedCount: number, total: number, firstMessage: string): string {
	const rest = failedCount - 1;
	return `${failedCount} of ${total} item${total === 1 ? '' : 's'} did not update: ${firstMessage}${
		rest > 0 ? ` (and ${rest} more)` : ''
	}.`;
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

/**
 * The SECTION-scoped importer: the CSV carries only who, and the class it lands
 * in comes from the page you are standing on.
 *
 * A roster pasted into one class's People tab should not have to repeat that
 * class's course code and label on every row -- that was only ever needed by the
 * old global console, which could not know which section a row meant. Extra
 * columns are ignored rather than refused, so a file exported for the 4-column
 * importer still works here.
 *
 * It maps onto the SAME RosterRow the SAME classroom_import_roster RPC takes, so
 * this adds no write path and no authority: a row naming a section the caller
 * does not teach is refused server-side exactly as it always was.
 */
export function parseSectionRosterCsv(
	text: string,
	courseCode: string,
	sectionLabel: string
): { rows: RosterRow[]; errors: string[] } {
	const records = parseCsvRecords(text);
	const rows: RosterRow[] = [];
	const errors: string[] = [];
	if (!records.length) return { rows, errors: ['No rows found.'] };

	let start = 0;
	const first = records[0].join(',').toLowerCase();
	if (first.includes('email') || !first.includes('@')) start = 1;

	for (let i = start; i < records.length; i++) {
		const cells = records[i].map((c) => c.trim());
		const email = cells[0] ?? '';
		if (!email) continue;
		if (!email.includes('@')) {
			errors.push(`Row ${i + 1}: "${email}" is not an email address.`);
			continue;
		}
		rows.push({
			email: email.toLowerCase(),
			name: cells[1] ?? '',
			course_code: courseCode,
			section_label: sectionLabel
		});
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

/**
 * A transport's answer. The failure branch carries two OPTIONAL extras that
 * only the file-upload transports set (0133): `gate` names WHICH refusal this
 * was -- a size cap, an expired signed URL, an RLS denial -- and `retryable`
 * says whether saving again with the same file is worth doing. Optional
 * because nothing else on this interface has three ways to fail, and a
 * required field would make every other transport invent a value for it.
 */
export type TxResult<T = undefined> =
	| { ok: true; data: T }
	| { ok: false; message: string; gate?: UploadGate; retryable?: boolean };

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
	/** 0109. Null = visible the moment it is published, the pre-0109 behaviour. */
	publishAt?: string | null;
	category: string | null;
	links: { label: string; url: string }[];
}

/**
 * Is this item published but not yet visible to students?
 *
 * DISPLAY ONLY. What a student can actually read is decided in the database,
 * by the same condition, at the moment of the read -- so a page left open past
 * a go-live moment can be wrong about a chip and never about access. A read
 * that did not select the column (`undefined`) reads as live, which is exactly
 * what an item authored before scheduling existed is.
 */
export function isScheduled(
	item: { published: boolean; publish_at?: string | null },
	now: Date = new Date()
): boolean {
	if (!item.published || !item.publish_at) return false;
	const at = Date.parse(item.publish_at);
	return Number.isFinite(at) && at > now.getTime();
}

/** "Goes live Fri, Aug 21, 8:00 AM" -- the chip's own tooltip and the row line. */
export function scheduleLabel(item: { publish_at?: string | null }): string {
	if (!item.publish_at) return '';
	const at = new Date(item.publish_at);
	if (Number.isNaN(at.getTime())) return '';
	return at.toLocaleString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
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
/**
 * What a successful item save reports back.
 *
 * `formattingDropped` is true only when the save route had to fall back past
 * `p_body_doc` to get through -- a backend without 0108 -- and the weaker call
 * then succeeded. The content IS saved and no word is missing; what is gone is
 * the DOCUMENT, so lists, headings and emphasis render as flat paragraphs from
 * the plain-text column and cannot be recovered from it afterwards. The
 * composer says so rather than reporting a clean save, which is how a real
 * assignment reached a class with its bulleted list run together into one
 * paragraph and nobody found out until a student read it.
 */
export interface ItemSaved {
	itemId: string;
	formattingDropped?: boolean;
}

export interface ClassroomComposerTransports {
	createItem(
		kind: ClassroomItemKind,
		sectionIds: string[],
		input: ItemInput,
		published: boolean
	): Promise<TxResult<ItemSaved>>;
	updateItem(
		id: string,
		input: ItemInput,
		published: boolean | null
	): Promise<TxResult<ItemSaved>>;
	deleteItem(id: string): Promise<TxResult<undefined>>;
	/** New independent draft; attachments carried by reference, not re-upload. */
	duplicateItem(id: string): Promise<TxResult<{ itemId: string }>>;
	addPostings(itemId: string, sectionIds: string[]): Promise<TxResult<{ added: number }>>;
	removePosting(
		itemId: string,
		sectionId: string
	): Promise<TxResult<{ ok: boolean; reason?: string }>>;
	/**
	 * Flip `published` and NOTHING else (0109).
	 *
	 * Publishing used to go through `updateItem` with the item's whole content
	 * re-sent to change one boolean, which made the flip only as safe as the
	 * console's copy of the row. This is a narrow write: it cannot touch
	 * content, so it cannot stamp `edited_at`.
	 */
	setPublished(itemId: string, published: boolean): Promise<TxResult<undefined>>;
	setPinned(itemId: string, pinned: boolean): Promise<TxResult<undefined>>;
	setOrder(itemIds: string[]): Promise<TxResult<undefined>>;
	uploadAttachment(
		itemId: string,
		file: File,
		onProgress?: (fraction: number) => void
	): Promise<TxResult<undefined>>;
	deleteAttachment(id: string): Promise<TxResult<undefined>>;
	/**
	 * Instructor-only materials (0090). The upload/delete pair mirrors the
	 * student-facing one exactly; the link set is a full replacement, the
	 * `links` (p_resources) convention. Every one of these re-checks that the
	 * caller manages every class the item is posted to -- these transports are
	 * only ever handed to a component already gated on `canManage`, but the
	 * real boundary is the RPC, not that gate.
	 */
	uploadInstructorAttachment(
		itemId: string,
		file: File,
		onProgress?: (fraction: number) => void
	): Promise<TxResult<undefined>>;
	deleteInstructorAttachment(id: string): Promise<TxResult<undefined>>;
	setInstructorResources(
		itemId: string,
		links: { label: string; url: string }[]
	): Promise<TxResult<undefined>>;
	/** Student-owned; a no-op for a teacher looking at their own class. */
	markViewed(itemId: string): Promise<TxResult<undefined>>;
}

/**
 * Units (0111). Its OWN interface rather than four more methods on the composer
 * set: a unit is a fact about the COURSE, the class view can be handed a null
 * here and simply not offer the controls, and that null is also the fail-soft
 * state on a deployment where 0111 has not been applied yet.
 */
export interface ClassroomUnitTransports {
	/** Null id creates; a set id renames. `duplicate` is the designed refusal. */
	upsertUnit(
		courseId: string,
		name: string,
		id?: string | null
	): Promise<TxResult<{ unitId: string | null; created: boolean; duplicate: boolean }>>;
	deleteUnit(id: string): Promise<TxResult<{ unfiled: number }>>;
	setUnitOrder(courseId: string, unitIds: string[]): Promise<TxResult<undefined>>;
	/** Null unit unfiles. `wrong_course` is the designed refusal. */
	setItemUnit(
		itemId: string,
		unitId: string | null
	): Promise<TxResult<{ ok: boolean; reason?: string }>>;
	/** Re-read the course's units after a change. */
	reloadUnits(courseId: string): Promise<TxResult<ClassroomUnit[]>>;
}

/**
 * One class's own settings and roster -- what the People tab needs, and nothing
 * more.
 *
 * ITS OWN INTERFACE because these moved OUT of the global console and INTO the
 * section they belong to: managing a class is done while standing in it, not
 * from a separate page listing every class you teach. The methods are unchanged
 * callers of the same 0082/0083 RPCs; only where they are mounted moved.
 */
export interface ClassroomPeopleTransports {
	upsertSection(
		courseId: string,
		label: string,
		block: string | null,
		id?: string | null,
		teacherEmail?: string | null
	): Promise<TxResult<{ sectionId: string }>>;
	setSectionActive(id: string, active: boolean): Promise<TxResult<undefined>>;
	deleteSection(id: string, confirmLabel: string): Promise<TxResult<SectionDeleteResult>>;
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
	/**
	 * Delete an enrollment outright (0138). The FIRST removal path this schema
	 * has ever had: `setEnrollment` writes an `active` flag, which archives a
	 * student and is the right answer for one who left mid-term, and leaves the
	 * row on every roster read that does not filter on it.
	 *
	 * OPTIONAL, so its ABSENCE removes the Remove control down through the
	 * panel (the omitted-transport convention). That is what a project sitting
	 * on a pre-0138 schema gets: Deactivate, exactly as before, and no button
	 * that would answer PGRST202.
	 */
	removeEnrollment?: (sectionId: string, email: string) => Promise<TxResult<EnrollmentRemoval>>;
	importRoster(rows: RosterRow[]): Promise<TxResult<ImportSummary>>;
}

/** Courses and section creation -- the genuinely cross-cutting half. */
export interface ClassroomAdminTransports {
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
	reloadSections(): Promise<TxResult<{ sections: ClassroomSection[]; courses: ClassroomCourse[] }>>;
}

export interface ClassroomManageTransports
	extends ClassroomComposerTransports,
		ClassroomPeopleTransports,
		ClassroomAdminTransports {
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

// RE-EXPORTED, NOT REDECLARED. The queue is app_feedback -- one table for every
// surface in the portal since the shell started carrying the report affordance
// -- so its row shape belongs to $lib/feedback, and a second copy here is a
// second thing to keep matching. The re-export keeps the existing
// `from '$lib/classroom/classroom'` imports resolving.
export type { FeedbackRow, FeedbackStatus } from '$lib/feedback/feedback';

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
