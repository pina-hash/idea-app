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

import type { ItemDoc } from '$lib/classroom/classroom-doc';
import type { TiptapNode } from '$lib/rich-text';
import type { NotebookFlagReason, NotebookPhoto, NotebookStatus } from '$lib/notebook';
import type { NotebookNoteRow } from '$lib/notebook-notes';
import { formatSectionLabel } from '$lib/section-label';
import { isTypingTarget, keyAction, type KeyBinding } from '$lib/shell/keys';

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
	/**
	 * May the VIEWER manage this section -- teacher of record, or chair? Since
	 * 0169 a section can also be held on the REVIEWER tier, which reads the
	 * grid and reviews entries but does not author check-ins, link items,
	 * grade or delete; the console withholds those panels per section on this
	 * flag. Computed server-side by the review load (the client cannot derive
	 * chair-ness), and REQUIRED so a constructor cannot forget the decision --
	 * the database refuses a manage write either way.
	 */
	manages: boolean;
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
	 * The instructor-authored GUIDANCE PROMPT (0123), in the closed classroom
	 * rich-text shape, or null for a check-in with no prompt.
	 *
	 * Optional because the caller may not have asked for it, and because a
	 * deployment between 0122 and 0123 cannot answer it at all: the manager's
	 * own load rides a ladder whose narrow rung omits the column entirely, so
	 * `undefined` here means "not asked" and null means "no prompt". The grid
	 * RPC has no use for either and reports neither.
	 */
	guidance_doc?: ItemDoc | null;
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
	/**
	 * How many of those nobody has looked at yet (0121). OPTIONAL for the same
	 * reason every field below marked so is: migrations here are applied BY
	 * HAND, so a deployment sitting between 0120 and 0121 is a real state and
	 * the key is simply absent from the payload on one. `undefined` means "this
	 * database cannot answer that", which is a different thing from zero and is
	 * rendered as nothing rather than as "all reviewed".
	 */
	free_entries_unreviewed?: number;
}

/**
 * The RPC's cell status. Note it is WIDER than `NotebookStatus`: the three
 * extra values are states of the CELL rather than of an entry -- there is no
 * entry to carry them.
 *
 * `scheduled` (0140) is the newest of them and the only one that is a fact
 * about the CALENDAR rather than about a person: the check-in is dated ahead of
 * today, so nobody could have filed against it yet. The RPC decides it, in
 * America/Los_Angeles, which is the calendar `session_date` is adjudicated in
 * everywhere else -- nothing in this file re-derives it, and nothing here reads
 * a clock at all.
 */
export type GridCellStatus = NotebookStatus | 'excused' | 'missing' | 'scheduled';

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
	/**
	 * Has anybody LOOKED at the entry this cell shows (0121)? null where there
	 * is no entry; `undefined` on a database without 0121 applied, which is why
	 * nothing reads this field directly -- `cellReviewed` is the one reader and
	 * it collapses both to null, so "not applied" can never render as "not
	 * reviewed" and put a to-do mark on every cell in the class.
	 */
	reviewed?: boolean | null;
	reviewed_at?: string | null;
	/**
	 * Of `entry_count`, how many nobody has looked at (0121). It comes from the
	 * RPC's own COUNTS read rather than from the shown entry, so a student with
	 * four entries and one acknowledged reads 3, not 0.
	 */
	unreviewed_count?: number;
}

export interface SectionGrid {
	/**
	 * The RPC's own projection of the section -- metadata only, no `manages`:
	 * whether the VIEWER manages a section is the load's per-viewer computation
	 * on the `sections` list, not a fact the grid payload carries.
	 */
	section: Omit<ReviewSection, 'manages'>;
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
	| 'missing'
	| 'scheduled';

export function cellDisplay(cell: GridCell): CellDisplay {
	switch (cell.status) {
		case 'missing':
			return 'missing';
		// NOT DUE YET (0140). It arrives here already decided -- the RPC ranked it
		// below an entry and below an excusal, so a cell that reaches this arm has
		// neither, and there is nothing left to weigh.
		case 'scheduled':
			return 'scheduled';
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
	{ key: 'missing', glyph: '–', label: 'Missing', hint: 'Nothing uploaded for this check-in.' },
	// LAST, because it is the far end of the same axis the row already walks:
	// filed, filed late, waiting, flagged, excused, nothing filed -- and then
	// nothing filed BECAUSE THE DAY HAS NOT COME. The hint says both halves,
	// since a teacher reading the legend needs to know it is not counted as well
	// as what it is.
	{
		key: 'scheduled',
		glyph: '»',
		label: 'Scheduled',
		hint: 'Dated after today. Not due yet, so it is not counted as missing or outstanding.'
	}
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
 * HAS ANYBODY LOOKED AT THIS CELL'S ENTRY (0121), as a three-state answer.
 *
 * `true` acknowledged, `false` filed and waiting, `null` "no answer" -- which
 * covers BOTH a cell with no entry and a database where 0121 is not applied
 * yet. Collapsing those two into null is the point: migrations here are pasted
 * in by hand, and a missing key read as `false` would put a to-do mark on every
 * cell of every class on a deployment that simply cannot record acknowledgement
 * at all.
 *
 * THIS IS THE ONE READER of `cell.reviewed`. Nothing else in the client touches
 * the raw field, so the not-applied case is answered in one place.
 */
export function cellReviewed(cell: GridCell): boolean | null {
	if (cell.entry_id === null) return null;
	return cell.reviewed ?? null;
}

/**
 * Can this database record an acknowledgement at all (0121)?
 *
 * THE PAYLOAD REPORTS ITS OWN CAPABILITY, which is the select-ladder rule
 * applied to an RPC: rather than probing for the function or shipping a flag
 * from the server load, the grid says so by carrying the key. A cell with no
 * entry still carries `reviewed: null`, so the only payload this answers false
 * for is one from a pre-0121 function -- or one with no cells at all, where
 * there is nothing to acknowledge either way.
 */
export function gridReviewReady(grid: SectionGrid | null): boolean {
	return !!grid && grid.cells.some((c) => c.reviewed !== undefined);
}

/** Cells filed against this check-in that nobody has looked at yet. */
export function cellUnreviewedCount(cell: GridCell): number {
	return cell.unreviewed_count ?? 0;
}

// ---------------------------------------------------------------------------
// 2b. THE REVIEW CURSOR, and the keyboard that drives it.
//
// The console is a grid you walk. Everything below is PURE -- it takes a
// payload and a position and answers with a position -- so the whole loop,
// including the boundaries where the arrows stop, is testable with no DOM and
// no backend. The component owns focus and scrolling; it owns no arithmetic.
// ---------------------------------------------------------------------------

/**
 * WHERE THE REVIEWER IS, keyed the way every other lookup in this file is:
 * `student_key` rather than the uuid (a student enrolled but never signed in
 * has no uuid at all since 0094) and the session id.
 */
export interface GridCursor {
	studentKey: string;
	sessionId: string;
}

export type CursorMove = 'up' | 'down' | 'left' | 'right';

/**
 * The two axes IN THE ORDER THE TABLE RENDERS THEM -- rows from
 * `grid.students`, which the RPC already sorted by name, and columns from
 * `sessionsInOrder`, which is the same function the header row uses. Deriving
 * both from the renderers rather than re-sorting here is what stops the cursor
 * from walking in an order the eye does not see.
 */
export function cursorAxes(grid: SectionGrid): { students: string[]; sessions: string[] } {
	return {
		students: grid.students.map((s) => s.student_key),
		sessions: sessionsInOrder(grid.sessions).map((s) => s.id)
	};
}

/** The top-left cell, or null for a grid with no rows or no columns. */
export function firstCursor(grid: SectionGrid): GridCursor | null {
	const { students, sessions } = cursorAxes(grid);
	if (students.length === 0 || sessions.length === 0) return null;
	return { studentKey: students[0], sessionId: sessions[0] };
}

/**
 * The cursor after a REFRESH, which is the case realtime makes ordinary: a
 * student who left the roster, or a check-in that was deleted, must not leave
 * the cursor pointing at a cell that is not on screen.
 *
 * IT KEEPS THE AXIS THAT SURVIVED. Losing a column keeps the student and moves
 * to the nearest column rather than jumping to the top-left, because the row an
 * instructor is working down is the thing they would have to find again.
 */
export function clampCursor(grid: SectionGrid, cursor: GridCursor | null): GridCursor | null {
	const { students, sessions } = cursorAxes(grid);
	if (students.length === 0 || sessions.length === 0) return null;
	if (!cursor) return firstCursor(grid);
	return {
		studentKey: students.includes(cursor.studentKey) ? cursor.studentKey : students[0],
		sessionId: sessions.includes(cursor.sessionId) ? cursor.sessionId : sessions[0]
	};
}

/**
 * One step. `null` means THE EDGE -- the caller leaves the cursor where it is.
 *
 * DELIBERATELY NOT WRAPPING. Rolling off the last student onto the first would
 * make "hold the down arrow to the end of the class" a loop with no end, and
 * the instructor's own sense of having finished is the only completion signal
 * this screen has.
 */
export function moveCursor(
	grid: SectionGrid,
	cursor: GridCursor,
	move: CursorMove
): GridCursor | null {
	const { students, sessions } = cursorAxes(grid);
	const row = students.indexOf(cursor.studentKey);
	const col = sessions.indexOf(cursor.sessionId);
	if (row < 0 || col < 0) return clampCursor(grid, cursor);

	const nextRow = move === 'up' ? row - 1 : move === 'down' ? row + 1 : row;
	const nextCol = move === 'left' ? col - 1 : move === 'right' ? col + 1 : col;
	if (nextRow < 0 || nextRow >= students.length) return null;
	if (nextCol < 0 || nextCol >= sessions.length) return null;
	return { studentKey: students[nextRow], sessionId: sessions[nextCol] };
}

/** The cell under the cursor, or undefined if the pair names no cell. */
export function cursorCell(grid: SectionGrid, cursor: GridCursor | null): GridCell | undefined {
	if (!cursor) return undefined;
	return cellIndex(grid).get(`${cursor.studentKey}|${cursor.sessionId}`);
}

/**
 * WHERE ACKNOWLEDGING SENDS YOU NEXT: down the SAME column to the next student
 * whose entry nobody has looked at.
 *
 * Down the column rather than across the row because that is how the work
 * arrives -- one check-in, thirty students -- and skipping the ones already
 * done is what makes "review the rest of the class" a held-down arrow key
 * rather than a hunt. It stops at the bottom rather than wrapping (the same
 * rule `moveCursor` follows) and returns null when there is nothing left
 * below, which the caller shows as "nothing further down this column".
 */
export function nextUnreviewed(grid: SectionGrid, cursor: GridCursor): GridCursor | null {
	const { students, sessions } = cursorAxes(grid);
	const row = students.indexOf(cursor.studentKey);
	if (row < 0 || !sessions.includes(cursor.sessionId)) return null;
	const index = cellIndex(grid);
	for (let r = row + 1; r < students.length; r++) {
		const cell = index.get(`${students[r]}|${cursor.sessionId}`);
		if (cell && hasEntry(cell) && cellReviewed(cell) === false) {
			return { studentKey: students[r], sessionId: cursor.sessionId };
		}
	}
	return null;
}

/** Everything a key press can ask the console to do. */
export type ReviewAction = CursorMove | 'accept' | 'flag' | 'pages' | 'close';

/**
 * THE HINT SHAPE IS SHARED (`$lib/shell/keys`), the ACTIONS are the notebook's
 * own. The grading console needs the same legend-is-the-dispatch-table
 * arrangement over a completely different set of actions, so the generic half
 * moved out and this is the notebook's instance of it.
 */
export type ReviewKeyHint = KeyBinding<ReviewAction>;

/**
 * THE KEY LEGEND, and it is the SAME LIST the handler dispatches from.
 *
 * "Every key is discoverable in the interface" is a property of there being one
 * array rather than of a printed list happening to match a switch statement.
 * The console renders this; `reviewAction` resolves against it.
 */
export const REVIEW_KEYS: ReviewKeyHint[] = [
	{
		keys: '↑ ↓',
		label: 'Student',
		action: 'down',
		dispatch: { ArrowUp: 'up', ArrowDown: 'down' }
	},
	{
		keys: '← →',
		label: 'Check-in',
		action: 'right',
		dispatch: { ArrowLeft: 'left', ArrowRight: 'right' }
	},
	{ keys: 'A', label: 'Accept, next', action: 'accept', dispatch: { a: 'accept' } },
	{ keys: 'F', label: 'Flag', action: 'flag', dispatch: { f: 'flag' } },
	{ keys: 'Enter', label: 'Open pages', action: 'pages', dispatch: { Enter: 'pages' } },
	{ keys: 'Esc', label: 'Close', action: 'close', dispatch: { Escape: 'close' } }
];

/**
 * A key press, resolved. `null` = not ours, and the event is left alone.
 *
 * MODIFIED PRESSES ARE NEVER OURS. Ctrl/Cmd/Alt combinations belong to the
 * browser and the operating system, and swallowing Cmd+A ("select all") to mean
 * "accept" is the kind of theft that makes a keyboard surface unusable rather
 * than fast. Shift is allowed: a capital A is the same request.
 */
export function reviewAction(event: {
	key: string;
	ctrlKey?: boolean;
	metaKey?: boolean;
	altKey?: boolean;
}): ReviewAction | null {
	return keyAction(event, REVIEW_KEYS);
}

/**
 * IS THE PERSON TYPING? RE-EXPORTED, not reimplemented: the rule is the same
 * one the grading console needs and it lives in `$lib/shell/keys` now. The name
 * stays reachable from here because every existing call site and its test
 * import it from this module.
 */
export { isTypingTarget };

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
	/**
	 * Sessions in the selected unit THAT HAVE COME DUE -- the denominator.
	 *
	 * IT IS NOT `grid.sessions.length` ANY MORE (0140), and that is the second
	 * half of the scheduled-check-in fix. A check-in dated ahead of today sits
	 * in the session list, because a teacher who scheduled it needs to see it,
	 * and counting it here would put every student under their own total the
	 * moment a unit was laid out: "3 of 8" on the grid, an `attention` row
	 * apiece, and a presence score pre-filled at 3 of a possible 7 for a class
	 * that is perfectly up to date.
	 *
	 * IT IS DERIVED FROM THE CELLS, never from a date this file read. The RPC
	 * already decided which cells are `scheduled`, in the calendar it owns; a
	 * clock here would be a second answer to the same question and this module
	 * deliberately holds none.
	 *
	 * PER STUDENT RATHER THAN PER SECTION, and that falls out of the same
	 * derivation: a student who filed EARLY against a future check-in has a cell
	 * carrying their entry rather than `scheduled`, so that day counts for them
	 * and not for the classmate who has not. Their work is credited on the day
	 * they did it, which is the only reading that does not punish filing ahead.
	 */
	total: number;
	/** Sessions excused. Reported separately; see `presenceScore`. */
	excused: number;
	/**
	 * Sessions dated after today with nothing filed against them (0140) -- the
	 * ones held OUT of `total`.
	 *
	 * Reported rather than merely subtracted, for the reason `excused` is: a
	 * denominator that quietly shrank is a number nobody can check, and the
	 * evidence line the Documentation Check stores beside a presence score has
	 * to be able to say where it went.
	 */
	scheduled: number;
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

	return grid.students.map((student) => {
		const flags = Object.fromEntries(FLAG_REASONS.map((r) => [r, 0])) as Record<
			NotebookFlagReason,
			number
		>;
		let covered = 0;
		let excused = 0;
		let flagged = 0;
		let scheduled = 0;
		let total = 0;

		for (const session of grid.sessions) {
			const cell = index.get(`${student.student_key}|${session.id}`);
			// NOT DUE YET, SO NOT IN THE DENOMINATOR (0140). It is counted on its
			// own line instead, and the `continue` is what keeps it out of every
			// figure below rather than out of one of them.
			if (cell?.status === 'scheduled') {
				scheduled++;
				continue;
			}
			// A session with NO CELL AT ALL still counts toward the total, exactly
			// as it did when this was `grid.sessions.length`: the cross join means
			// that cannot happen, and if it ever did, silently shrinking a
			// student's denominator is the wrong way to find out.
			total++;
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
			scheduled,
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
	/**
	 * Cells that are neither on time, excused, NOR SCHEDULED -- what "behind"
	 * totals to.
	 *
	 * It is a WHITELIST SUM rather than a subtraction from the cell count, which
	 * is what made 0140 additive here: a seventh state joins `counts` and stays
	 * out of this number by not being named, rather than by anybody remembering
	 * to exclude it. A state that SHOULD count has to be added on purpose.
	 */
	outstanding: number;
	/**
	 * Students with a flagged cell or an incomplete count, worst first.
	 *
	 * `covered < total` is the incomplete half, and `total` excludes a student's
	 * scheduled cells (0140) -- so laying out a unit's check-ins in advance no
	 * longer puts the whole roster on this list for work that is not due.
	 */
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
 * WHETHER THE LIVE CHANNEL IS ACTUALLY UP -- three states, because two would
 * have to lie about one of them.
 *
 *   connecting  the ordinary sub-second state after a subscribe, and also a
 *               transport that reports nothing at all. NOTHING IS SHOWN for
 *               it: a pill that flickers on every section change is noise,
 *               and a console that is about to be live is not a fault.
 *   live        the join succeeded. This is the ONLY state that may show the
 *               green pill, and it now means the channel and not the mere
 *               existence of a transport.
 *   stalled     the join failed, timed out, or the socket closed under us.
 *               Usually transient -- supabase-js rejoins on its own and this
 *               goes back to `live` -- so the words for it must not read as an
 *               alarm. What the reader needs is the one fact they cannot see:
 *               new work will not appear by itself.
 *
 * `CLOSED` maps to `stalled` like the other two failures, and the console
 * ignores every status after its own teardown, so an ordinary unsubscribe
 * never paints one.
 */
export type NotebookLiveStatus = 'connecting' | 'live' | 'stalled';

/**
 * What the bar says for each. Said ONCE, here, so the pill and any future
 * reader of the same state cannot end up describing the channel differently.
 * `connecting` has no words on purpose -- see above.
 */
export const NOTEBOOK_LIVE_LABEL = 'Live';
export const NOTEBOOK_LIVE_HINT = 'Updating as students file work';
export const NOTEBOOK_STALLED_LABEL = 'Not live. Reload to see new work.';
export const NOTEBOOK_STALLED_HINT =
	'Updates are not arriving on their own right now. Everything already on screen is real.';

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
	 * "I have looked at this and it is fine" (0121, notebook_accept_entry).
	 * OPTIONAL, the presence-gates-the-control rule: a mount that omits it has
	 * no accept key and no accept button, which is the honest state on a
	 * deployment where 0121 is not applied. `gridReviewReady` is what the
	 * console reads to decide, so the two cannot disagree.
	 *
	 * It writes reviewed_by/reviewed_at and NOTHING else -- not the status, not
	 * the flag, not the comment -- so it is not a second grade on work the unit
	 * is already graded for once.
	 */
	acceptEntry?: (entryId: string) => Promise<ReviewResult>;
	/**
	 * Taking that back (0121, notebook_unaccept_entry). It matters more than an
	 * undo usually does: while an entry is acknowledged the STUDENT cannot
	 * delete it or pull it back to a draft, so a misclick down a column of
	 * thirty takes something away from somebody who is not in the room.
	 */
	unacceptEntry?: (entryId: string) => Promise<ReviewResult>;
	/**
	 * LIVE UPDATES: subscribe to this section's notebook rows and call
	 * `onChange` when any of them move (0121 publishes notebook_entries, its
	 * photos and its notes). Returns the teardown.
	 *
	 * OPTIONAL, AND THAT IS THE DEGRADE PATH RATHER THAN A FLAG. A mount that
	 * omits it -- a socket that never connects, a dev harness, a deployment
	 * without the publication -- gets exactly the console that shipped before:
	 * the load-time fetch, and a refetch after every write. Realtime is an
	 * UPDATE path here, never the read.
	 *
	 * It carries no payload on purpose. The console answers a change by
	 * re-reading the grid through the same RPC it loaded with, so two
	 * instructors working the same section converge on what the database says
	 * instead of each patching a local copy from a row that arrived out of
	 * order.
	 *
	 * `onStatus` IS WHAT THE Live PILL ACTUALLY MEANS, AND IT IS REQUIRED.
	 * The console used to set `live = true` the moment this function RETURNED,
	 * which is a claim about the transport EXISTING and not about the channel:
	 * a `.subscribe()` with no status callback answers a failed join, a
	 * publication that does not carry the notebook tables, and a dead socket
	 * exactly as it answers success, so the console showed a green Live pill
	 * and silently never updated again. A transport that cannot report its
	 * channel therefore cannot claim Live -- absence is the mechanism here as
	 * everywhere else, and `'connecting'` is what it gets.
	 */
	subscribe?: (
		sectionId: string,
		onChange: () => void,
		onStatus: (status: NotebookLiveStatus) => void
	) => () => void;
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
	/**
	 * WRITE A CHECK-IN'S GUIDANCE PROMPT (0123). Null clears it.
	 *
	 * OPTIONAL, the presence-gates-the-control rule every notebook write here
	 * follows: a deployment without 0123 hands in nothing and the field is not
	 * rendered, which is honest, rather than offering an instructor a box whose
	 * save would fail. The RPC re-checks `_notebook_manages_session` itself, so
	 * this is the belt to that braces.
	 *
	 * IT IS NOT A PARAMETER ON `saveSession`, and that is the whole reason it
	 * exists separately: `notebook_admin_upsert_session` is a whole-row replace
	 * that RECONCILES THE SECTION LIST, so a call made to change a sentence
	 * could unpost a class and detach the work filed against it.
	 */
	setSessionGuidance?: (
		sessionId: string,
		doc: TiptapNode | null
	) => Promise<ReviewResult<{ cleared: boolean }>>;
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
