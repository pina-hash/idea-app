/**
 * Digital notebook, INSTRUCTOR review layer: row shapes and PURE
 * display/derivation helpers for `/notebook/review`.
 *
 * Plain data + pure functions only (the notebook.ts / curriculum.ts
 * convention): no Supabase client, no `$lib/server` import, nothing that
 * cannot run in a dev harness with no backend.
 *
 * NOTHING HERE RE-DERIVES A RULE THE DATA LAYER ALREADY OWNS. In particular
 * the ROSTER is not computed here: `notebook_get_section_grid` already
 * resolved it (since 0094, the section's ACTIVE classroom_enrollments UNION
 * anyone holding entries or excusals in it, so a student who left mid-term
 * keeps the work they filed) and this file only reads the `students` array it
 * returns.
 * The same goes for on-time (the RPC compares the upload's date in
 * America/Los_Angeles against session_date) and for which entry a cell
 * shows (the latest upload). Who may see any of it is RLS's job, and
 * flagging is `notebook_flag_entry`'s.
 *
 * What IS here: turning the RPC's payload into something a table can render
 * at a glance, the per-student completion arithmetic, and the CSV.
 */

import type { NotebookFlagReason, NotebookPhoto, NotebookStatus } from '$lib/notebook';
import type { NotebookNoteRow } from '$lib/notebook-notes';
import { formatSectionLabel } from '$lib/section-label';

// ---------------------------------------------------------------------------
// 1. The shapes `notebook_get_section_grid` actually returns (0069, reshaped
//    by 0094). These mirror the RPC's jsonb_build_object calls key for key;
//    read the migration, not this file, if the two ever disagree.
// ---------------------------------------------------------------------------

/**
 * A CLASSROOM section (0082), as the picker and the grid header need it. The
 * notebook has no section table of its own since 0094, so this is the same row
 * `/classroom` shows -- which is the point: one answer to "what class is this".
 */
export interface ReviewSection {
	id: string;
	course_code: string;
	course_title: string;
	label: string;
	block: string | null;
	teacher_email: string;
}

/** "IDEA209H · Section 1 · Block 2" -- how a section reads wherever it is named. */
export function sectionName(section: ReviewSection): string {
	const name = formatSectionLabel(section.label, section.block);
	return [section.course_code, name].filter(Boolean).join(' · ') || 'Section';
}

export interface GridSession {
	id: string;
	unit_number: number;
	session_date: string;
	session_label: string;
	/**
	 * Every section this check-in runs in (0098). ONE canonical check-in can be
	 * posted to several sections, so the grid's own column list is a filtered
	 * view of it -- this is the full set, for the "posted to" line.
	 *
	 * Optional because the caller may not have asked for it: the grid RPC
	 * reports it, and so does the manager's own load, but a surface that only
	 * needs column headers has no use for it.
	 */
	section_ids?: string[];
}

export interface GridStudent {
	/**
	 * THE ROW KEY, and the reason it is not `id`. The roster is email-keyed
	 * (classroom_enrollments) since 0094, and a student who has been enrolled
	 * but has never signed in has no account and therefore no `id` at all --
	 * two of them would collide on a null key. `student_key` is the email where
	 * there is one and the uuid otherwise, so it is always present and stable.
	 */
	student_key: string;
	/** null = on the roster, no account yet. Every cell of theirs is missing. */
	id: string | null;
	name: string;
	email: string | null;
	/**
	 * false = they hold work in this section but are no longer on its active
	 * roster. Their row stays so the work they filed does not vanish.
	 */
	enrolled: boolean;
	/**
	 * Session-less entries this student filed in this section. They have no
	 * column in the grid (nothing to line them up against) but the RPC
	 * reports them so they are not invisible.
	 */
	free_entries: number;
}

/**
 * The RPC's cell status. Note it is WIDER than `NotebookStatus`: the two
 * extra values are states of the CELL rather than of an entry -- there is no
 * entry to carry them.
 */
export type GridCellStatus = NotebookStatus | 'excused' | 'missing';

export interface GridCell {
	/** Matches GridStudent.student_key; the uuid may be absent, this never is. */
	student_key: string;
	student_id: string | null;
	session_id: string;
	status: GridCellStatus;
	entry_id: string | null;
	entry_count: number;
	upload_timestamp: string | null;
	/** null when there is no entry to be early or late. */
	on_time: boolean | null;
	excused: boolean;
	flag_reason: NotebookFlagReason | null;
}

export interface SectionGrid {
	section: ReviewSection;
	unit_number: number | null;
	generated_at: string;
	sessions: GridSession[];
	students: GridStudent[];
	cells: GridCell[];
}

/** An entry opened from a cell: enough to review it and act on it. */
export interface ReviewEntry {
	id: string;
	student_id: string;
	session_id: string | null;
	custom_label: string | null;
	upload_timestamp: string;
	status: NotebookStatus;
	flag_reason: NotebookFlagReason | null;
	instructor_comment: string | null;
	/**
	 * The name of the folder the STUDENT filed this in (0088), or null when it
	 * is unfiled or 0088 is not applied. Context only -- filing is the
	 * student's own organizing scheme and no review rule reads it.
	 */
	folder_name: string | null;
	photos: NotebookPhoto[];
	/**
	 * Every revision of every written note on the entry (0078). Read-only
	 * here: an instructor reads a student's notes and never rewrites one, and
	 * notebook_edit_note refuses them regardless of what this panel renders.
	 */
	notes: NotebookNoteRow[];
}

// ---------------------------------------------------------------------------
// 2. Cell display state
// ---------------------------------------------------------------------------

/**
 * What a cell READS AS, which is a finer question than the RPC's `status`:
 * an entry that arrived is `compliant`, but the instructor needs to see at a
 * glance whether it arrived on time.
 *
 * FLAG BEATS LATE, deliberately. A flagged cell is the one that needs the
 * instructor to do something, and a cell can only say one thing; lateness is
 * still reported inside the cell detail, so nothing is lost.
 */
export type CellDisplay =
	| 'on_time'
	| 'late'
	| 'flagged'
	| 'pending_review'
	| 'excused'
	| 'missing';

export function cellDisplay(cell: GridCell): CellDisplay {
	switch (cell.status) {
		case 'missing':
			return 'missing';
		case 'excused':
			return 'excused';
		case 'flagged':
			return 'flagged';
		case 'pending_review':
			return 'pending_review';
		default:
			// `on_time` is null only when there is no entry, which the cases
			// above already caught; treat an unexpected null as on time rather
			// than accusing a student of lateness the RPC did not report.
			return cell.on_time === false ? 'late' : 'on_time';
	}
}

/**
 * Cell legend. Every state carries a GLYPH as well as a colour, so the grid
 * is readable without relying on colour alone.
 */
export const CELL_STATES: { key: CellDisplay; glyph: string; label: string; hint: string }[] = [
	{ key: 'on_time', glyph: '✓', label: 'On time', hint: 'Uploaded on or before the session date.' },
	{ key: 'late', glyph: '⤴', label: 'Late', hint: 'Uploaded after the session date.' },
	{ key: 'pending_review', glyph: '○', label: 'Awaiting review', hint: 'Resubmitted after a flag.' },
	{ key: 'flagged', glyph: '!', label: 'Flagged', hint: 'You flagged this entry.' },
	{ key: 'excused', glyph: 'E', label: 'Excused', hint: 'A sanctioned absence, not a missing entry.' },
	{ key: 'missing', glyph: '–', label: 'Missing', hint: 'Nothing uploaded for this check-in.' }
];

const CELL_META = new Map(CELL_STATES.map((s) => [s.key, s]));

export function cellGlyph(display: CellDisplay): string {
	return CELL_META.get(display)?.glyph ?? '?';
}

export function cellLabel(display: CellDisplay): string {
	return CELL_META.get(display)?.label ?? display;
}

/** A cell is only clickable when there is an entry behind it to open. */
export function hasEntry(cell: GridCell): boolean {
	return cell.entry_id !== null;
}

/**
 * `${student_key}|${session_id}` -> cell, for O(1) table lookup. Keyed on
 * student_key rather than the uuid because the uuid is nullable since 0094 --
 * every never-signed-in student would otherwise index as "null|<session>".
 */
export function cellIndex(grid: SectionGrid): Map<string, GridCell> {
	return new Map(grid.cells.map((c) => [`${c.student_key}|${c.session_id}`, c]));
}

// ---------------------------------------------------------------------------
// 3. Per-student completion + scoring
// ---------------------------------------------------------------------------

/** The presence criterion is worth 7 points on the notebook rubric. */
export const PRESENCE_POINTS = 7;

export const FLAG_REASONS: NotebookFlagReason[] = [
	'not_dated',
	'illegible',
	'insufficient_detail',
	'appears_reconstructed',
	'other'
];

export interface StudentSummary {
	student: GridStudent;
	/** Sessions this student filed an entry against, any status. */
	covered: number;
	/** Sessions in the selected unit -- the denominator. */
	total: number;
	/** Sessions excused. Reported separately; see `presenceScore`. */
	excused: number;
	/** Cells currently flagged. */
	flagged: number;
	flags: Record<NotebookFlagReason, number>;
	/**
	 * covered / total x 7, rounded: the PRESENCE criterion of the
	 * Documentation Check rubric, pre-filled from real data.
	 *
	 * "Covered" counts an entry and nothing else. It deliberately does NOT
	 * credit an excusal: rather than silently fold a judgement call into the
	 * arithmetic, the excused count is reported separately and rides along as
	 * the score's own evidence comment (see notebook-documentation-check.ts),
	 * so a low number is always explainable and the instructor can raise it by
	 * hand. With no sessions at all it is 0 -- there is nothing to be present
	 * for.
	 *
	 * It is a PRE-FILL, never a grade. Nothing auto-submits; the instructor
	 * saves it, alongside the three criteria only a person can judge, through
	 * classroom_grade_submission like any other assignment.
	 */
	presenceScore: number;
}

export function summarize(grid: SectionGrid): StudentSummary[] {
	const index = cellIndex(grid);
	const total = grid.sessions.length;

	return grid.students.map((student) => {
		const flags = Object.fromEntries(FLAG_REASONS.map((r) => [r, 0])) as Record<
			NotebookFlagReason,
			number
		>;
		let covered = 0;
		let excused = 0;
		let flagged = 0;

		for (const session of grid.sessions) {
			const cell = index.get(`${student.student_key}|${session.id}`);
			if (!cell) continue;
			if (cell.entry_id) covered++;
			if (cell.excused) excused++;
			if (cell.status === 'flagged') {
				flagged++;
				if (cell.flag_reason) flags[cell.flag_reason]++;
			}
		}

		return {
			student,
			covered,
			total,
			excused,
			flagged,
			flags,
			presenceScore: total === 0 ? 0 : Math.round((covered / total) * PRESENCE_POINTS)
		};
	});
}

/** "5 of 7" -- the completion count shown beside each row. */
export function completionLabel(summary: StudentSummary): string {
	return `${summary.covered} of ${summary.total}`;
}

/**
 * The whole section at a glance: one tally per cell state, plus the students
 * who are behind or flagged.
 *
 * WHY A SUMMARY AND NOT THE GRID. This is what the Classroom manage console
 * shows inside an expanded section panel, and the grid proper does not belong
 * there: it is a wide table that scrolls horizontally in its own container,
 * sized for a dedicated console, and it only earns that width because every
 * cell is a button into an entry-review panel -- which is review work, not
 * "how is this class doing". The panel it would sit in is a 52rem column
 * already holding section settings, a roster and a content list. So the
 * console answers the question a manager has WHILE managing the class, and
 * links through for the answer they have to act on.
 *
 * IT RE-DERIVES NOTHING. The tallies come from `cellDisplay` and the
 * per-student figures from `summarize`, which are the same two functions the
 * grid itself renders through, over the same `notebook_get_section_grid`
 * payload -- so the console and the console-you-click-into cannot disagree
 * about what a cell means.
 */
export interface GridSummary {
	sessions: number;
	students: number;
	/** Cells per display state, keyed exactly as CELL_STATES is. */
	counts: Record<CellDisplay, number>;
	/** Cells that are neither on time nor excused -- what "behind" totals to. */
	outstanding: number;
	/** Students with a flagged cell or an incomplete count, worst first. */
	attention: StudentSummary[];
}

export function gridSummary(grid: SectionGrid): GridSummary {
	const counts = Object.fromEntries(CELL_STATES.map((s) => [s.key, 0])) as Record<
		CellDisplay,
		number
	>;
	for (const cell of grid.cells) counts[cellDisplay(cell)]++;

	const attention = summarize(grid)
		.filter((s) => s.flagged > 0 || s.covered < s.total)
		.sort(
			(a, b) =>
				b.flagged - a.flagged ||
				b.total - b.covered - (a.total - a.covered) ||
				a.student.name.localeCompare(b.student.name)
		);

	return {
		sessions: grid.sessions.length,
		students: grid.students.length,
		counts,
		outstanding: counts.late + counts.pending_review + counts.flagged + counts.missing,
		attention
	};
}

// ---------------------------------------------------------------------------
// 4. Session management + review transports
// ---------------------------------------------------------------------------
//
// THE NOTEBOOK HAS NO CSV EXPORT OF ITS OWN ANY MORE. It used to write one --
// per-student counts, a suggested presence score and a blank column for the
// real grade -- because a Documentation Check had nowhere else to land. Since
// 0097 a notebook unit is linked to a Classroom assignment, the grade is
// written by classroom_grade_submission into classroom_submissions like every
// other assignment's, and it exports through the ONE FACTS-ready CSV in
// assignment-spec.ts (`gradesCsv`) alongside the rest of that student's work.
// A second export of the same grade in a different shape is exactly the kind
// of duplicate that quietly stops matching.

/**
 * What `notebook_admin_upsert_session` takes; `id` null creates.
 *
 * `section_ids` is the FULL set the check-in should run in, not a delta: the
 * RPC reconciles its postings against it (0098), exactly as
 * `classroom_set_reward_rules` and friends take a full replacement. The UI
 * only ever sends the current set on an edit, so the destructive half of that
 * reconcile is never reached by accident -- adding and removing a section are
 * their own explicit actions below.
 */
export interface SessionInput {
	id: string | null;
	section_ids: string[];
	unit_number: number;
	session_date: string;
	session_label: string;
}

/**
 * Every write answers in this shape rather than throwing, so the UI has one
 * error path. The RPCs themselves raise exceptions (they are preconditions,
 * not user-facing refusals); the caller catches and reports here.
 */
export type ReviewResult<T = undefined> = { ok: true; value: T } | { ok: false; error: string };

/**
 * The transports the review console needs. Injected exactly the way
 * NotebookView injects its three upload transports, so the dev harness can
 * answer them in memory and every one of them is a single named place where
 * the real RPC call lives.
 */
export interface ReviewTransports {
	loadSessions: (sectionId: string) => Promise<ReviewResult<GridSession[]>>;
	saveSession: (input: SessionInput) => Promise<ReviewResult<{ session_id: string }>>;
	deleteSession: (sessionId: string) => Promise<ReviewResult<{ detached_entries: number }>>;
	/** Run an existing check-in in more sections too (0098). */
	addSessionSections: (
		sessionId: string,
		sectionIds: string[]
	) => Promise<ReviewResult<{ added: number }>>;
	/**
	 * Stop running it in ONE section. `ok: false` with `reason: 'last_posting'`
	 * is the designed answer for the only-class case, not an error -- and the
	 * entries filed against it in that section are DETACHED, never destroyed,
	 * which is what `detached_entries` reports.
	 */
	removeSessionSection: (
		sessionId: string,
		sectionId: string
	) => Promise<
		ReviewResult<{ ok: boolean; reason?: string; detached_entries?: number; remaining?: number }>
	>;
	loadGrid: (sectionId: string, unitNumber: number | null) => Promise<ReviewResult<SectionGrid>>;
	loadEntry: (entryId: string) => Promise<ReviewResult<ReviewEntry>>;
	flagEntry: (
		entryId: string,
		reason: NotebookFlagReason,
		comment: string | null
	) => Promise<ReviewResult>;
	resolveEntry: (entryId: string, comment: string | null) => Promise<ReviewResult>;
	/**
	 * An instructor removing a student's entry (0116, notebook_staff_delete_entry).
	 * OPTIONAL, the same presence-gates-the-control rule every notebook write
	 * follows: the RPC itself re-checks classroom_manages_section, so omitting
	 * this is the belt to that braces rather than the only thing standing in
	 * the way.
	 */
	deleteEntry?: (entryId: string) => Promise<ReviewResult>;
	/**
	 * An instructor removing one note thread (0119, notebook_staff_delete_note).
	 * OPTIONAL, the same presence-gates-the-control rule `deleteEntry` follows:
	 * the RPC re-checks classroom_manages_section itself.
	 */
	deleteNote?: (noteId: string) => Promise<ReviewResult>;
}

/** Distinct unit numbers across a section's sessions, ascending. */
export function unitsOf(sessions: GridSession[]): number[] {
	return [...new Set(sessions.map((s) => s.unit_number))].sort((a, b) => a - b);
}

/** Sessions ordered the way the grid's columns and the manager's list read. */
export function sessionsInOrder(sessions: GridSession[]): GridSession[] {
	return [...sessions].sort(
		(a, b) =>
			a.session_date.localeCompare(b.session_date) ||
			a.unit_number - b.unit_number ||
			a.session_label.localeCompare(b.session_label)
	);
}

/** "Oct 14" -- the column header under a session's label. */
export function shortDate(isoDate: string): string {
	const d = new Date(`${isoDate}T00:00:00`);
	return Number.isNaN(d.getTime())
		? isoDate
		: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/** "Aug 9, 2026, 2:14 PM" -- an upload stamp in the cell detail. */
export function stampLabel(iso: string): string {
	const d = new Date(iso);
	return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}
