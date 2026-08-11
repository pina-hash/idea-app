/**
 * Classroom module: client-safe row types + pure helpers (the curriculum.ts
 * convention -- plain data and functions, no Svelte, no Supabase). The data
 * layer is migration 0082; every write goes through its SECURITY DEFINER RPCs
 * and every read is an RLS-scoped select, so nothing here enforces anything --
 * it shapes what the policies already returned.
 */

// ---------------------------------------------------------------------------
// Row types (mirroring 0082's tables; embeds normalized by the helpers below)
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
	/** Embedded course row (normalized from the PostgREST embed key). */
	course: ClassroomCourse | null;
}

export interface ClassroomEnrollment {
	section_id: string;
	student_email: string;
	display_name: string;
	active: boolean;
	updated_at?: string;
}

export interface ClassroomPost {
	id: string;
	section_id: string;
	group_id: string | null;
	title: string | null;
	body: string;
	author_email: string;
	author_name: string | null;
	published: boolean;
	created_at: string;
	updated_at: string;
}

export interface AssignmentResource {
	id?: string;
	label: string;
	url: string;
	sort_order?: number;
}

export interface ClassroomAssignment {
	id: string;
	section_id: string;
	group_id: string | null;
	title: string;
	description: string;
	points: number | null;
	due_at: string | null;
	category: string | null;
	author_email: string;
	author_name: string | null;
	published: boolean;
	created_at: string;
	updated_at: string;
	resources: AssignmentResource[];
}

// ---------------------------------------------------------------------------
// Embed normalization. PostgREST returns embedded relations under their table
// name; the loads pass rows through these so components only ever see the
// typed shapes above.
// ---------------------------------------------------------------------------

export function normalizeSectionRow(row: Record<string, unknown>): ClassroomSection {
	const embed = row.classroom_courses as ClassroomCourse | ClassroomCourse[] | null | undefined;
	const course = Array.isArray(embed) ? (embed[0] ?? null) : (embed ?? null);
	return {
		id: String(row.id),
		course_id: String(row.course_id),
		label: String(row.label),
		block: (row.block as string | null) ?? null,
		teacher_email: String(row.teacher_email),
		course
	};
}

export function normalizeAssignmentRow(row: Record<string, unknown>): ClassroomAssignment {
	const embed = row.classroom_assignment_resources as AssignmentResource[] | null | undefined;
	const resources = [...(embed ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
	const { classroom_assignment_resources: _drop, ...rest } = row;
	return { ...(rest as unknown as Omit<ClassroomAssignment, 'resources'>), resources };
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
	return s.course ? `${s.course.code} · ${s.label}` : s.label;
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
// Stream + classwork shaping
// ---------------------------------------------------------------------------

export type StreamItem =
	| { kind: 'post'; at: string; post: ClassroomPost }
	| { kind: 'assignment'; at: string; assignment: ClassroomAssignment };

/** Announcements and assignment posts merged newest-first. */
export function streamItems(
	posts: ClassroomPost[],
	assignments: ClassroomAssignment[]
): StreamItem[] {
	const items: StreamItem[] = [
		...posts.map((p) => ({ kind: 'post' as const, at: p.created_at, post: p })),
		...assignments.map((a) => ({ kind: 'assignment' as const, at: a.created_at, assignment: a }))
	];
	return items.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
}

export interface ClassworkGroup {
	id: 'upcoming' | 'undated' | 'past';
	label: string;
	assignments: ClassroomAssignment[];
}

/**
 * Classwork grouped by due date: upcoming (soonest first), then undated
 * (newest first), then past due (most recent first). Empty groups are omitted.
 */
export function classworkGroups(
	assignments: ClassroomAssignment[],
	now: Date = new Date()
): ClassworkGroup[] {
	const upcoming: ClassroomAssignment[] = [];
	const undated: ClassroomAssignment[] = [];
	const past: ClassroomAssignment[] = [];
	for (const a of assignments) {
		if (!a.due_at) undated.push(a);
		else if (Date.parse(a.due_at) < now.getTime()) past.push(a);
		else upcoming.push(a);
	}
	upcoming.sort((x, y) => Date.parse(x.due_at!) - Date.parse(y.due_at!));
	past.sort((x, y) => Date.parse(y.due_at!) - Date.parse(x.due_at!));
	undated.sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at));

	const groups: ClassworkGroup[] = [];
	if (upcoming.length) groups.push({ id: 'upcoming', label: 'Upcoming', assignments: upcoming });
	if (undated.length) groups.push({ id: 'undated', label: 'No due date', assignments: undated });
	if (past.length) groups.push({ id: 'past', label: 'Past due', assignments: past });
	return groups;
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
// Manage-console transports. The console is presentation-only; the real route
// wires these to the 0082 RPCs + RLS selects, the dev harness answers from an
// in-memory store (the ReviewConsole ReviewTransports convention). Every
// transport resolves -- never throws -- so the console renders refusals
// inline.
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

export interface AssignmentInput {
	title: string;
	description: string;
	points: number | null;
	dueAt: string | null;
	category: string | null;
	resources: { label: string; url: string }[];
}

export interface ClassroomManageTransports {
	upsertCourse(code: string, title: string): Promise<TxResult<{ courseId: string; created: boolean }>>;
	upsertSection(
		courseId: string,
		label: string,
		block: string | null,
		id?: string | null
	): Promise<TxResult<{ sectionId: string }>>;
	reloadSections(): Promise<TxResult<{ sections: ClassroomSection[]; courses: ClassroomCourse[] }>>;
	loadRoster(sectionId: string): Promise<TxResult<ClassroomEnrollment[]>>;
	setEnrollment(
		sectionId: string,
		email: string,
		name: string | null,
		active: boolean
	): Promise<TxResult<undefined>>;
	importRoster(rows: RosterRow[]): Promise<TxResult<ImportSummary>>;
	loadContent(
		sectionId: string
	): Promise<TxResult<{ posts: ClassroomPost[]; assignments: ClassroomAssignment[] }>>;
	createPost(
		sectionIds: string[],
		body: string,
		title: string | null,
		published: boolean
	): Promise<TxResult<undefined>>;
	updatePost(
		id: string,
		body: string,
		title: string | null,
		published: boolean | null
	): Promise<TxResult<undefined>>;
	deletePost(id: string): Promise<TxResult<undefined>>;
	createAssignment(
		sectionIds: string[],
		input: AssignmentInput,
		published: boolean
	): Promise<TxResult<undefined>>;
	updateAssignment(
		id: string,
		input: AssignmentInput,
		published: boolean | null
	): Promise<TxResult<undefined>>;
	deleteAssignment(id: string): Promise<TxResult<undefined>>;
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
