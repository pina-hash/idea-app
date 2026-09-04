import type { ReviewResult } from '$lib/notebook-review';

/**
 * THE FIVE STAFF CAPABILITIES THE NOTEBOOK'S DATA LAYER HAS ALWAYS CARRIED AND
 * NOTHING HAS EVER CALLED.
 *
 * Every one of them is a live SECURITY DEFINER function (or, for the log, a
 * table with a select grant and a policy) that gates itself in its own body.
 * This module is the CLIENT-SAFE half: the shapes those calls take, the words
 * their results are rendered with, and the small amount of arithmetic that
 * decides whether a control can be offered at all. No Svelte, no transports,
 * no permission rule -- the database owns every one of those.
 *
 * WHY THESE ARE NOT IN `ReviewTransports`. The console's transports describe
 * what ANY reviewer may do. These do not partition that way: two of them are
 * admin-only, two are instructor-tier, and the excusal splits DOWN THE MIDDLE
 * (an instructor may read an excusal and its note, and may not write one). A
 * single bag would have to carry that split as a comment; separate optional
 * bundles carry it as a TYPE, and the presence-gates-the-control rule then
 * does the rest -- an instructor is simply handed no `set`, so there is no
 * write to execute and nothing to hide.
 *
 * THE TIERS, MEASURED AGAINST THE MIGRATIONS RATHER THAN ASSUMED, because they
 * are not what the names suggest:
 *
 *   notebook_admin_set_excusal      is_admin()                     ADMIN
 *   notebook_admin_override_entry   is_admin()                     ADMIN
 *   notebook_admin_log (select)     policy: is_admin()             ADMIN
 *   notebook_staff_restore_note     classroom_manages_section()
 *                                     OR notebook_manages_student() INSTRUCTOR
 *   notebook_link_session_item      classroom_manages_section()     INSTRUCTOR
 *
 * The two `notebook_admin_`-prefixed ones are genuinely admin. The other two
 * are NOT, despite sitting in the same audit: `notebook_staff_restore_note`
 * says `staff` in its own name and means it, and `notebook_link_session_item`
 * asks the same question the classroom's own item surfaces ask. A UI that
 * hid those behind an admin check would take a capability away from the person
 * the function was written for.
 */

// ---------------------------------------------------------------------------
// Excusals
// ---------------------------------------------------------------------------

/**
 * `notebook_session_excusals.note`'s own CHECK, restated where the field is
 * typed into rather than left for the database to refuse after a round trip.
 * 0069: `check (note is null or char_length(note) <= 500)`.
 *
 * It is a CEILING and not a target: the field is a sentence, not an essay.
 */
export const EXCUSAL_NOTE_MAX = 500;

/**
 * One row of `notebook_session_excusals`, exactly as the table stores it.
 *
 * `note` HAS NEVER BEEN SELECTED ANYWHERE until now -- the grid answers a
 * boolean and nothing else -- which is why an excusal recorded in October has
 * been unexplainable in March. The column has been there since 0069.
 *
 * `excused_by` is a uuid and stays one. Resolving it to a name means reading
 * `profiles` for somebody who is not the caller, which is admin-only anyway and
 * would be a second read on a panel that already knows everything it needs;
 * the log listing is where "who did this" is answered, and it answers it for
 * every action rather than for this one.
 */
export interface ExcusalRow {
	session_id: string;
	student_id: string;
	excused_at: string;
	excused_by: string | null;
	note: string | null;
}

/** What `notebook_admin_set_excusal` is called with. */
export interface ExcusalInput {
	sessionId: string;
	studentId: string;
	excused: boolean;
	/** Trimmed to null by the RPC; sent as typed so the trim is the database's. */
	note: string | null;
}

/**
 * Reading an excusal and WRITING one are different tiers, so they are
 * different fields and `set` is the optional one.
 *
 * An instructor gets `load` and no `set`: they see that a student was excused
 * and why, and there is no control to press. That is the honest arrangement --
 * `notebook_admin_set_excusal` raises "Only a site admin can excuse notebook
 * sessions." for them, and offering a button whose only outcome is that
 * refusal is worse than not offering one.
 */
export interface ExcusalTransports {
	/**
	 * Every excusal on these check-ins that this caller may read. RLS decides:
	 * 0098's policy admits the SUBJECT and any manager of a section the
	 * check-in is posted to, so this is a plain scoped select and not an RPC.
	 */
	load: (sessionIds: string[]) => Promise<ReviewResult<ExcusalRow[]>>;
	/** ADMIN ONLY (`notebook_admin_set_excusal`). Absent for an instructor. */
	set?: (input: ExcusalInput) => Promise<ReviewResult<{ excused: boolean }>>;
}

/** Index excusals by the same `sessionId|studentId` pair the RPC keys on. */
export function excusalKey(sessionId: string, studentId: string): string {
	return `${sessionId}|${studentId}`;
}

export function excusalIndex(rows: ExcusalRow[]): Map<string, ExcusalRow> {
	return new Map(rows.map((r) => [excusalKey(r.session_id, r.student_id), r]));
}

/**
 * WHY THIS CELL CANNOT BE EXCUSED, or null when it can.
 *
 * The one that is not obvious is the missing account. `notebook_admin_set_excusal`
 * refuses a `p_student_id` with no row in `profiles`, and the grid's roster
 * deliberately carries students who have been enrolled but have never signed in
 * (0094: `student_key` is the email in that case and `id` is null). So the
 * control genuinely cannot be offered for them -- and a row that simply lacked
 * a button where every other row has one reads as a bug, which is why this
 * returns a SENTENCE rather than a boolean.
 */
export function excusalBlockedReason(studentId: string | null): string | null {
	if (!studentId) {
		return 'This student has been added to the roster but has never signed in, so there is no account to record an excusal against. It can be recorded once they sign in for the first time.';
	}
	return null;
}

// ---------------------------------------------------------------------------
// Moving an entry (the override)
// ---------------------------------------------------------------------------

/**
 * THE SMALLEST USEFUL SHAPE OF `notebook_admin_override_entry`, WHICH TAKES
 * NINE PARAMETERS AND SHOULD NOT BE RENDERED AS NINE FIELDS.
 *
 * Four of the nine (`p_custom_label`, `p_status`, `p_flag_reason`,
 * `p_instructor_comment`) restate verdicts the console already has proper
 * controls for -- Flag, Clear flag, Accept -- and every one of those is
 * REVIEWABLE work with its own rules. A second path to them would be a second
 * implementation of the same decision, reachable only by an admin, with no
 * flag-reason validation in front of it and no reason for anybody to prefer it.
 *
 * What has NO other path is the pair this shape carries: an entry filed against
 * the wrong check-in, and one filed in the wrong class. Both are ordinary
 * student mistakes (two classes share a check-in; the wrong row was tapped),
 * both leave the grid lying about a student, and nothing else in the codebase
 * can correct either.
 *
 * SENDING NULL FOR THE OTHER FOUR IS NOT THE SAME AS OMITTING THEM, and that is
 * the whole reason the RPC has the two `p_set_*` booleans. `p_session_id` null
 * with `p_set_session` true DETACHES the entry (a real, wanted outcome: an
 * entry that should not be against any check-in); null with the flag false
 * leaves it alone. `p_status` null additionally means the RPC does NOT stamp
 * `reviewed_by`/`reviewed_at` -- so a move is not silently also a review, which
 * is exactly right: nobody has looked at anything.
 */
export interface EntryMoveInput {
	entryId: string;
	/** True to write `session_id`; false leaves the entry's own alone. */
	setSession: boolean;
	/** Null with `setSession` true detaches the entry from every check-in. */
	sessionId: string | null;
	/** True to write `section_id`; false leaves the entry's own alone. */
	setSection: boolean;
	sectionId: string | null;
}

export interface EntryMoveResult {
	entry_id: string;
	session_id: string | null;
	section_id: string | null;
	status: string;
}

/** ADMIN ONLY (`notebook_admin_override_entry`). */
export interface EntryMoveTransports {
	move: (input: EntryMoveInput) => Promise<ReviewResult<EntryMoveResult>>;
}

/** The sentinel the "no check-in" option carries, since a `<select>` value is a string. */
export const MOVE_DETACH = '__detach__';

/**
 * Is this move worth sending? A form whose two pickers still read what the
 * entry already says has nothing to write, and pressing it would mint an audit
 * row recording that nothing changed.
 *
 * Compared against the CURRENT values rather than against a "touched" flag, for
 * the reason the presence-of-state bug is written up in CLAUDE.md: "is there
 * something in this form" and "has this actually been edited" are different
 * questions, and only the second one licenses a write.
 */
export function entryMoveChanged(
	current: { sessionId: string | null; sectionId: string | null },
	next: { sessionId: string | null; sectionId: string | null }
): boolean {
	return current.sessionId !== next.sessionId || current.sectionId !== next.sectionId;
}

/**
 * Turn the two pickers into the RPC's five arguments.
 *
 * Each `p_set_*` is true only when THAT field moved, so a section correction
 * never rewrites the session and a session correction never rewrites the
 * section. The RPC's own resolution then applies: re-pointing the session
 * re-resolves the section through `_notebook_resolve_session_section`, keeping
 * the entry's current class when the check-in still runs there.
 */
export function entryMovePayload(
	entryId: string,
	current: { sessionId: string | null; sectionId: string | null },
	next: { sessionId: string | null; sectionId: string | null }
): EntryMoveInput {
	const setSession = current.sessionId !== next.sessionId;
	const setSection = current.sectionId !== next.sectionId;
	return {
		entryId,
		setSession,
		sessionId: setSession ? next.sessionId : null,
		setSection,
		sectionId: setSection ? next.sectionId : null
	};
}

// ---------------------------------------------------------------------------
// Staff note restore
// ---------------------------------------------------------------------------

/**
 * INSTRUCTOR TIER, not admin (`notebook_staff_restore_note`: it asks
 * `classroom_manages_section` OR `notebook_manages_student`).
 *
 * Its owner-side twin has been wired at `EntryNotes.svelte` since 0119, so a
 * student can put back a note they removed themselves and staff -- who are the
 * only ones who can remove somebody ELSE'S note -- have had no way to undo it.
 * The refusal the student reads on a staff-deleted thread ("Ask them to restore
 * it for you") has been pointing at a capability that did not exist.
 */
export interface StaffNoteTransports {
	restore: (noteId: string) => Promise<ReviewResult>;
}

// ---------------------------------------------------------------------------
// Attaching a scheduled check-in to an item
// ---------------------------------------------------------------------------

/**
 * INSTRUCTOR TIER (`notebook_link_session_item`: `classroom_manages_section`).
 *
 * 0120 gave a check-in an `item_id` on its POSTING, so the day's material and
 * its notebook requirement are one row in the class stream. The only path to
 * that today is `notebook_create_item_check_in`, which MAKES a new check-in --
 * so a check-in already on the calendar could never be attached to the item it
 * belongs with, and the workaround is to delete it and recreate it, which
 * detaches every entry already filed against it.
 *
 * `item_id` is per POSTING, not per check-in: one canonical check-in can hang
 * off a material in period 2 and stand alone in period 5. So every call names a
 * section, and the console only ever writes the section being viewed.
 */
export interface SessionItemLink {
	session_id: string;
	section_id: string;
	item_id: string | null;
}

/** An assignment or material this section could attach a check-in to. */
export interface LinkTargetItem {
	id: string;
	title: string;
}

export interface SessionItemTransports {
	/** Which check-ins in this section already point at an item. */
	load: (sectionId: string) => Promise<ReviewResult<SessionItemLink[]>>;
	/** What this section could point one at: everything posted here. */
	candidates: (sectionId: string) => Promise<ReviewResult<LinkTargetItem[]>>;
	link: (
		sessionId: string,
		sectionId: string,
		itemId: string
	) => Promise<ReviewResult<{ linked: number }>>;
	/** `notebook_unlink_session_item`, the same tier. */
	unlink: (sessionId: string, sectionId: string) => Promise<ReviewResult<{ cleared: number }>>;
}

// ---------------------------------------------------------------------------
// The audit log
// ---------------------------------------------------------------------------

/**
 * Every action string `_notebook_log` is called with, read off the migrations
 * rather than guessed. Nine call sites produce ten strings, because the excusal
 * one branches on its own argument.
 *
 * WHY A MAP AND NOT A FORMATTER. The listing has to be readable by somebody who
 * has never opened a migration, and "upsert_section" is not English. Each entry
 * is the same verb the control that writes it uses, so a reader can join a log
 * line to the button they pressed.
 *
 * AN UNKNOWN ACTION RENDERS AS ITSELF rather than as "Unknown". A migration
 * written after this file will log something not on this list, and the raw
 * string is a strictly better answer than a placeholder: it is still greppable,
 * and it says plainly that this listing is behind the schema.
 */
export const ADMIN_LOG_ACTIONS: Record<string, string> = {
	set_excusal: 'Excused a student',
	clear_excusal: 'Cleared an excusal',
	override_entry: 'Moved or corrected an entry',
	delete_entry: 'Deleted an entry',
	restore_entry: 'Restored an entry',
	delete_note: 'Deleted a note',
	restore_note: 'Restored a note',
	delete_session: 'Deleted a check-in',
	unpost_session: 'Removed a check-in from a class',
	upsert_section: 'Created or edited a section'
};

export function adminLogLabel(action: string): string {
	return ADMIN_LOG_ACTIONS[action] ?? action;
}

/**
 * One row of `notebook_admin_log`. The subject columns are bare uuids with no
 * foreign keys on purpose (0069: "a log row must survive the deletion of what
 * it describes"), so several of them routinely name something that is gone.
 */
export interface AdminLogRow {
	id: string;
	actor_id: string | null;
	action: string;
	section_id: string | null;
	session_id: string | null;
	entry_id: string | null;
	student_id: string | null;
	details: Record<string, unknown>;
	created_at: string;
}

/** ADMIN ONLY, by the table's own RLS policy rather than by any check here. */
export interface AdminLogTransports {
	load: (limit: number) => Promise<ReviewResult<AdminLogRow[]>>;
}

export const ADMIN_LOG_PAGE = 50;

/**
 * The one line of `details` worth putting on a row without opening it.
 *
 * It reads the shapes the RPCs actually write and answers null for everything
 * else, which is the honest result: `details` is free-form jsonb and inventing
 * a summary for a shape this function has not been taught would be a sentence
 * nobody can check.
 */
export function adminLogDetail(row: AdminLogRow): string | null {
	const d = row.details ?? {};
	if (row.action === 'set_excusal' || row.action === 'clear_excusal') {
		const note = typeof d.note === 'string' ? d.note.trim() : '';
		return note ? `Reason: ${note}` : null;
	}
	if (row.action === 'override_entry') {
		const before = d.before as Record<string, unknown> | undefined;
		const after = d.after as Record<string, unknown> | undefined;
		if (!before || !after) return null;
		const moved: string[] = [];
		if (before.session_id !== after.session_id) {
			moved.push(after.session_id ? 'moved to another check-in' : 'detached from its check-in');
		}
		if (before.section_id !== after.section_id) moved.push('moved to another class');
		if (before.status !== after.status) moved.push(`status ${String(after.status)}`);
		return moved.length ? moved.join(', ') : null;
	}
	if (row.action === 'restore_note' || row.action === 'delete_note') {
		const revisions = typeof d.revisions === 'number' ? d.revisions : null;
		return revisions === null
			? null
			: `${revisions} ${revisions === 1 ? 'revision' : 'revisions'}`;
	}
	if (row.action === 'delete_session' || row.action === 'unpost_session') {
		const detached = typeof d.detached_entries === 'number' ? d.detached_entries : null;
		return detached === null
			? null
			: `${detached} ${detached === 1 ? 'entry' : 'entries'} detached`;
	}
	return null;
}

/**
 * WHO. The log stores an actor uuid and nothing else, so a listing can only
 * name somebody it was separately told about -- and it is told about the
 * viewer, who is by far the most common actor on a one-admin deployment.
 *
 * Anybody else reads as their uuid. That is deliberate rather than lazy: the
 * alternative is joining `profiles` for arbitrary user ids, which is a read of
 * other people's rows added to a console for a cosmetic gain, and a uuid is at
 * least unambiguous. A null actor is a row written with no session, which
 * `_notebook_log` permits and nothing currently produces.
 */
export function adminLogActor(row: AdminLogRow, viewerId: string | null): string {
	if (!row.actor_id) return 'Unknown';
	if (viewerId && row.actor_id === viewerId) return 'You';
	return row.actor_id;
}

// ---------------------------------------------------------------------------
// What a check-in already has attached to it, and what an edit would do to it
// ---------------------------------------------------------------------------

/**
 * HOW MUCH WORK IS ALREADY FILED AGAINST ONE CHECK-IN, read off the grid the
 * console has already loaded.
 *
 * NO NEW READ AND NO NEW RPC. `notebook_get_section_grid` already returns one
 * cell per (student, check-in) with `entry_id` and `excused` on it, and the
 * console holds that payload to draw the grid. Asking the database a second
 * question would be a second answer that can disagree with the one on screen --
 * a teacher reading "3 students have answered" above a grid showing four filled
 * cells has no way to tell which is lying.
 *
 * `answered` COUNTS STUDENTS, NOT ENTRIES, and that is the number the sentence
 * needs: "12 students have already filed against this" is what an instructor is
 * deciding about, where "17 entries" silently double-counts the student who
 * filed three pages. `GridCell.entry_count` is the per-student total and is
 * deliberately not summed here.
 *
 * `excused` IS COUNTED BESIDE IT BECAUSE DELETING DESTROYS IT. An entry
 * survives a delete (`_notebook_detach_session_entries` nulls its `session_id`
 * and relabels it), but `notebook_session_excusals` is `on delete cascade` --
 * so an excusal an instructor granted is the ONE thing a delete really does
 * destroy, and until now nothing said so anywhere on screen.
 */
export interface CheckInLoad {
	/** Students with at least one live, submitted entry filed against it. */
	answered: number;
	/** Excusals granted on it. Destroyed by a delete; nothing restores them. */
	excused: number;
}

/**
 * The per-check-in load, keyed by session id, for every check-in THE GRID
 * COVERS.
 *
 * ONLY THE COVERED ONES ARE KEYED, AND THAT IS THE WHOLE POINT OF THE SHAPE.
 * The console's unit filter narrows the grid to one unit, so a check-in outside
 * the current filter has no cells in the payload -- and a `Record` that
 * defaulted a missing key to `{answered: 0}` would answer "nobody has filed
 * against this" for a check-in with thirty entries on it, which is the exact
 * sentence that gets work thrown away. A missing key means CANNOT TELL, and
 * `checkInLoad` below is the one reader that says so.
 *
 * `grid.sessions` is the discriminator rather than the cells: a check-in the
 * grid covers with an empty roster genuinely has zero answers, and keying off
 * the cells alone could not tell that from not being covered at all.
 */
export function checkInLoadIndex(
	grid: { sessions: { id: string }[]; cells: CheckInLoadCell[] } | null | undefined
): Map<string, CheckInLoad> {
	const index = new Map<string, CheckInLoad>();
	if (!grid) return index;
	for (const session of grid.sessions) {
		index.set(session.id, { answered: 0, excused: 0 });
	}
	for (const cell of grid.cells) {
		const row = index.get(cell.session_id);
		// A cell for a check-in the payload did not list is not counted into a
		// key that does not exist: inventing one here would turn "cannot tell"
		// into a number, which is the failure this whole index is shaped around.
		if (!row) continue;
		if (cell.entry_id) row.answered += 1;
		if (cell.excused) row.excused += 1;
	}
	return index;
}

/** The three fields of a grid cell this counts on. Structural, so a test needs no whole grid. */
export interface CheckInLoadCell {
	session_id: string;
	entry_id: string | null;
	excused: boolean;
}

/**
 * What is filed against ONE check-in, or null for "cannot tell".
 *
 * Null is a first-class answer and every caller renders it as a sentence rather
 * than as a zero. It is what a deployment mid-load, a grid narrowed to another
 * unit, and a console with no grid at all all report -- and "cannot tell" must
 * never read as "nothing", which is the `manages`-undefined rule this repo
 * already writes down for the roster.
 */
export function checkInLoad(
	index: Map<string, CheckInLoad>,
	sessionId: string
): CheckInLoad | null {
	return index.get(sessionId) ?? null;
}

/**
 * WHAT AN OPEN EDIT WOULD ACTUALLY CHANGE.
 *
 * The classification is the design decision of this bundle, and it exists
 * because "edit a check-in" is two different acts wearing one button.
 *
 *   `none`       nothing moved off what was seeded.
 *   `schedule`   the DAY and/or the UNIT moved, and nothing else. This touches
 *                no answer and changes nothing about what was asked, so it is
 *                the cheap path: a teacher moving a date is never walked
 *                through a warning about work already filed.
 *   `identity`   the NAME moved. Every student who has already filed sees the
 *                new name over the page they filed, so this is the edit that
 *                gets the count named at it.
 *
 * A rename that ALSO moves the date is `identity`: the more serious of the two
 * wins, because the warning is about the rename and the reschedule riding along
 * does not make it safer.
 *
 * THE GUIDANCE PROMPT IS NOT CLASSIFIED HERE and is not part of this edit at
 * all -- it is written by its own narrow RPC from its own panel, and the form
 * this compares against has no field for it.
 */
export type CheckInEditKind = 'none' | 'schedule' | 'identity';

export function checkInEditKind(
	before: { unit_number: number; session_date: string; session_label: string },
	after: { unit_number: number; session_date: string; session_label: string }
): CheckInEditKind {
	// `.trim()` on BOTH sides, and never `btrim`'s spaces-only idea of empty:
	// the RPC stores `btrim(label)`, so a seeded label already has its spaces
	// off and a form that only added some has changed nothing worth warning
	// about.
	if (before.session_label.trim() !== after.session_label.trim()) return 'identity';
	if (before.unit_number !== after.unit_number || before.session_date !== after.session_date) {
		return 'schedule';
	}
	return 'none';
}
