/**
 * Digital notebook, INSTRUCTOR review layer: row shapes and PURE
 * display/derivation helpers for `/notebook/review`.
 *
 * Plain data + pure functions only (the notebook.ts / curriculum.ts
 * convention): no Supabase client, no `$lib/server` import, nothing that
 * cannot run in a dev harness with no backend.
 *
 * NOTHING HERE RE-DERIVES A RULE THE DATA LAYER ALREADY OWNS. In particular
 * the ROSTER is not computed here: 0069's `notebook_get_section_grid`
 * already resolved enrollment (profiles.section_id matching the section's
 * course_id, UNION anyone holding entries or excusals in it, so transfers
 * stay visible) and this file only reads the `students` array it returns.
 * The same goes for on-time (the RPC compares the upload's date in
 * America/Los_Angeles against session_date) and for which entry a cell
 * shows (the latest upload). Who may see any of it is RLS's job, and
 * flagging is `notebook_flag_entry`'s.
 *
 * What IS here: turning the RPC's payload into something a table can render
 * at a glance, the per-student completion arithmetic, and the CSV.
 */

import type { NotebookFlagReason, NotebookPhoto, NotebookStatus } from '$lib/notebook';

// ---------------------------------------------------------------------------
// 1. The shapes `notebook_get_section_grid` actually returns (0069). These
//    mirror the RPC's jsonb_build_object calls key for key; read the
//    migration, not this file, if the two ever disagree.
// ---------------------------------------------------------------------------

/** A notebook_sections row, as the picker and the grid header need it. */
export interface ReviewSection {
	id: string;
	course_id: string;
	section_label: string;
	instructor_id: string;
}

export interface GridSession {
	id: string;
	unit_number: number;
	session_date: string;
	session_label: string;
}

export interface GridStudent {
	id: string;
	name: string;
	email: string;
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
	student_id: string;
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
	photos: NotebookPhoto[];
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

/** `${student_id}|${session_id}` -> cell, for O(1) table lookup. */
export function cellIndex(grid: SectionGrid): Map<string, GridCell> {
	return new Map(grid.cells.map((c) => [`${c.student_id}|${c.session_id}`, c]));
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
	/** Sessions excused. Reported separately; see `suggestedScore`. */
	excused: number;
	/** Cells currently flagged. */
	flagged: number;
	flags: Record<NotebookFlagReason, number>;
	/**
	 * covered / total x 7, rounded. A STARTING POINT, never the grade -- the
	 * CSV carries a blank column for the real one.
	 *
	 * "Covered" counts an entry and nothing else, which is the formula as
	 * specified. It deliberately does NOT credit an excusal: rather than
	 * silently fold a judgement call into the arithmetic, the excused count
	 * is reported in its own column so the instructor can see exactly why a
	 * suggestion looks low and raise it by hand. With no sessions at all the
	 * suggestion is 0 (there is nothing to be present for).
	 */
	suggestedScore: number;
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
			const cell = index.get(`${student.id}|${session.id}`);
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
			suggestedScore: total === 0 ? 0 : Math.round((covered / total) * PRESENCE_POINTS)
		};
	});
}

/** "5 of 7" -- the completion count shown beside each row. */
export function completionLabel(summary: StudentSummary): string {
	return `${summary.covered} of ${summary.total}`;
}

// ---------------------------------------------------------------------------
// 4. CSV export
// ---------------------------------------------------------------------------

/**
 * This repo has no prior CSV export to match -- searched before inventing
 * one; the only "csv" hits anywhere are inside SVG data URLs. So this is the
 * first, and the shape below is the convention any later one should follow:
 * a single header row, RFC 4180 quoting, CRLF line endings and a UTF-8 BOM
 * (both so Excel opens it correctly, the BOM specifically so accented
 * student names survive).
 */

const CSV_HEADERS = [
	'Student',
	'Email',
	'Sessions covered',
	'Total sessions',
	`Suggested presence score (of ${PRESENCE_POINTS})`,
	'Final score',
	'Flagged entries',
	'Flags: not dated',
	'Flags: illegible',
	'Flags: insufficient detail',
	'Flags: appears reconstructed',
	'Flags: other',
	'Excused sessions',
	'Free entries'
];

/**
 * RFC 4180 quoting, plus a leading apostrophe on anything a spreadsheet
 * would evaluate as a formula. That guard is not theoretical: a student's
 * `display_name` is user-editable and lands in this file, which a teacher
 * then opens in Excel.
 */
export function csvCell(value: string | number): string {
	const raw = String(value ?? '');
	const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
	return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function buildCsv(grid: SectionGrid): string {
	const rows = [CSV_HEADERS];

	for (const s of summarize(grid)) {
		rows.push([
			s.student.name,
			s.student.email ?? '',
			String(s.covered),
			String(s.total),
			String(s.suggestedScore),
			// Deliberately blank: the instructor fills the real score in by hand.
			'',
			String(s.flagged),
			String(s.flags.not_dated),
			String(s.flags.illegible),
			String(s.flags.insufficient_detail),
			String(s.flags.appears_reconstructed),
			String(s.flags.other),
			String(s.excused),
			String(s.student.free_entries)
		]);
	}

	return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** `notebook-eng1h-sophomore-unit-3-2026-08-09.csv` */
export function csvFilename(grid: SectionGrid, today: string): string {
	const slug = (grid.section.course_id || 'section')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-|-$/g, '');
	const unit = grid.unit_number === null ? 'all-units' : `unit-${grid.unit_number}`;
	return `notebook-${slug || 'section'}-${unit}-${today}.csv`;
}

// ---------------------------------------------------------------------------
// 5. Session management + review transports
// ---------------------------------------------------------------------------

/** What `notebook_admin_upsert_session` takes; `id` null creates. */
export interface SessionInput {
	id: string | null;
	section_id: string;
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
	loadGrid: (sectionId: string, unitNumber: number | null) => Promise<ReviewResult<SectionGrid>>;
	loadEntry: (entryId: string) => Promise<ReviewResult<ReviewEntry>>;
	flagEntry: (
		entryId: string,
		reason: NotebookFlagReason,
		comment: string | null
	) => Promise<ReviewResult>;
	resolveEntry: (entryId: string, comment: string | null) => Promise<ReviewResult>;
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
