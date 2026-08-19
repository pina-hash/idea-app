/**
 * Notebook check-ins, as they appear inside IDEA Classroom.
 *
 * Pure logic, no Svelte and no Supabase (the classroom.ts / feed.ts
 * convention). Everything here shapes rows the RLS policies already returned.
 *
 * WHAT A CHECK-IN IS ON THIS SURFACE, AND WHAT IT IS NOT. A check-in is a
 * NOTICE that links into the student's own notebook. It is deliberately NOT a
 * `classroom_items` row, and nothing here can make it one: there is no kind, no
 * points field, no due-date column, no posting, no submission and no rubric
 * anywhere in this module. That matters because a notebook unit is ALREADY
 * graded once, as an ordinary Classroom assignment, through
 * `notebook_unit_items` -> `classroom_submissions` (0097). A second scoring
 * path for the same work would break the single-number-per-student guarantee
 * that integration exists for, so this surface carries no scoring at all --
 * only "here is the check-in, here is where you stand on it, here is the door".
 *
 * WHY IT IS A SECOND SOURCE MERGED AT THE PAGE, NOT AN EXTENDED ITEM QUERY.
 * Check-ins live in `notebook_sessions` + `notebook_session_postings`, which
 * have no foreign key to `classroom_items` at all -- PostgREST has nothing to
 * resolve an embed through, so extending the stream query is not something the
 * schema permits even in principle. That constraint agrees with the one above:
 * the only way to put a check-in in the stream is as its own kind of thing.
 */
import type { NotebookFlagReason } from '$lib/notebook';
import { streamItems, type ClassroomItem } from '$lib/classroom/classroom';

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * Where the viewer stands on one check-in.
 *
 * The five values are the notebook's own, narrowed to what a STUDENT can act
 * on. `late` is deliberately absent: whether an entry arrived on time is
 * adjudicated by `notebook_get_section_grid`, which owns the
 * America/Los_Angeles calendar rule, and re-deriving that here would be a
 * second copy of a rule that has exactly one right answer. A late entry reads
 * as `filed`, and lateness stays a review question on the grid where it is
 * decided.
 */
export type CheckInStatus =
	| 'filed'
	| 'draft'
	| 'awaiting_review'
	| 'flagged'
	| 'excused'
	| 'missing';

/**
 * One check-in as one class sees it.
 *
 * `section_id` is the POSTING's section (0098), not a property of the check-in:
 * one canonical check-in can run in several classes, and this is the class this
 * row is about. It is what the deep link carries, so an entry filed from here
 * lands under the right class even for a student enrolled in two of them.
 */
export interface ClassCheckIn {
	session_id: string;
	section_id: string;
	unit_number: number;
	/** YYYY-MM-DD, the day the check-in is for. */
	session_date: string;
	session_label: string;
	/**
	 * The VIEWER'S OWN status, or null when there is no personal status to
	 * report -- which is every manager, since a teacher does not file check-ins
	 * for their own class. Null is what keeps a manager's card from claiming a
	 * status computed from somebody else's rows.
	 */
	status: CheckInStatus | null;
	/** The viewer's own flag reason, when their own entry is flagged. */
	flag_reason: NotebookFlagReason | null;
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * One of the viewer's own entries against a check-in, as far as this module
 * cares.
 *
 * `submitted` is separate from `status` because they answer different
 * questions: `status` is the INSTRUCTOR's verdict on work they have seen, and
 * `submitted` is whether they have been shown it at all (0118). A draft can
 * carry any status the row happens to hold and none of them mean anything yet.
 */
export interface CheckInEntry {
	status: 'compliant' | 'flagged' | 'pending_review';
	/**
	 * False for a draft. On a project without 0118 the caller passes TRUE,
	 * because every entry there was turned in when it was made.
	 */
	submitted: boolean;
}

/**
 * The viewer's status for one check-in, from THEIR OWN entry and THEIR OWN
 * excusal.
 *
 * A DRAFT IS ITS OWN STATUS, AND THAT IS THE LOAD-BEARING PART OF THIS
 * FUNCTION. Reporting an unturned-in entry as `filed` is the worst failure this
 * feature can produce: the student reads their class page, sees the check-in
 * done, and stops -- while their instructor's grid correctly reads `missing`,
 * because a draft is not presence. Nobody finds out until it is graded. So a
 * draft is named, and it is named on the surface the student is most likely to
 * check.
 *
 * An entry beats an excusal on purpose: a student excused from a check-in who
 * filed one anyway has filed it, and reporting "excused" over their own work
 * would be telling them their page did not count. A DRAFT does not beat an
 * excusal -- there is nothing to count yet, and "excused" is the more useful
 * thing to know.
 */
export function checkInStatus(
	entry: CheckInEntry | null | undefined,
	excused: boolean
): CheckInStatus {
	if (entry && !entry.submitted) return excused ? 'excused' : 'draft';
	if (entry) {
		if (entry.status === 'flagged') return 'flagged';
		if (entry.status === 'pending_review') return 'awaiting_review';
		return 'filed';
	}
	return excused ? 'excused' : 'missing';
}

const STATUS_LABELS: Record<CheckInStatus, string> = {
	filed: 'Filed',
	// Names BOTH halves: that it exists, and that it has not gone anywhere yet.
	// "Draft" alone reads as a state somebody else can see.
	draft: 'Draft, not turned in',
	awaiting_review: 'Awaiting review',
	flagged: 'Needs another look',
	excused: 'Excused',
	missing: 'Not filed yet'
};

export function checkInStatusLabel(status: CheckInStatus): string {
	return STATUS_LABELS[status] ?? status;
}

/**
 * Reuses the feed's tone vocabulary so a status reads the same way across the
 * module. No crimson anywhere: that token is reserved for LIVE/REC/error.
 */
export type CheckInTone = 'attention' | 'good' | 'info' | 'muted';

const STATUS_TONES: Record<CheckInStatus, CheckInTone> = {
	filed: 'good',
	// The same tone as `missing`, because from the student's side it is the same
	// obligation: this check-in still needs something from you.
	draft: 'attention',
	awaiting_review: 'info',
	flagged: 'attention',
	excused: 'muted',
	missing: 'attention'
};

export function checkInTone(status: CheckInStatus): CheckInTone {
	return STATUS_TONES[status];
}

/**
 * OUTSTANDING MEANS "THIS STILL NEEDS SOMETHING FROM YOU", which is two states,
 * not one:
 *
 *   - `missing`  -- nothing filed, so file a page.
 *   - `draft`    -- a page exists and has not been turned in (0118), so turn it
 *                   in. It counts for exactly the reason `missing` does: the
 *                   instructor's grid reads it as nothing filed, so the student
 *                   still owes this check-in something.
 *   - `flagged`  -- an entry exists but the instructor asked for another look,
 *                   so add to it. `notebook_add_photo` flipping a flagged entry
 *                   back to `pending_review` is that loop, in the database.
 *
 * `awaiting_review` is deliberately NOT outstanding: the student has done their
 * part and the ball is with the instructor, so counting it would ask them for
 * something that does not exist. `excused` is a sanctioned absence and `filed`
 * is done.
 *
 * A manager's check-in carries a null status and therefore never counts here;
 * their own total comes from the grid (see the class page load).
 */
export function isOutstanding(status: CheckInStatus | null): boolean {
	return status === 'missing' || status === 'draft' || status === 'flagged';
}

export function outstandingCheckIns(checkIns: ClassCheckIn[]): number {
	return checkIns.filter((c) => isOutstanding(c.status)).length;
}

// ---------------------------------------------------------------------------
// The deep link
// ---------------------------------------------------------------------------

/**
 * Where a check-in card goes: the student's own notebook, with this check-in
 * preselected for the upload flow.
 *
 * BOTH ids ride the link, and the section is not decoration. The upload flow
 * files an entry against a (check-in, class) PAIR -- that is the composite key
 * `notebook_entries` carries to `notebook_session_postings` -- and a student
 * enrolled in two classes that share a check-in has two of them to choose
 * between. The class page knows which one it is; the notebook cannot guess.
 */
export function checkInHref(checkIn: ClassCheckIn, basePath = '/notebook'): string {
	const params = new URLSearchParams({
		checkin: checkIn.session_id,
		section: checkIn.section_id
	});
	return `${basePath}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// The stream
// ---------------------------------------------------------------------------

/**
 * One row of the class stream: either a posted item or a check-in notice. A
 * discriminated union rather than a synthesized ClassroomItem, so nothing
 * downstream can mistake a check-in for something that has points, a due date,
 * or a submission.
 */
export type StreamEntry =
	| { kind: 'item'; key: string; item: ClassroomItem }
	| { kind: 'check-in'; key: string; checkIn: ClassCheckIn };

/** A check-in's place in time: its own date, at local midnight. */
function checkInStamp(checkIn: ClassCheckIn): number {
	const t = Date.parse(`${checkIn.session_date}T00:00:00`);
	return Number.isNaN(t) ? 0 : t;
}

function itemStamp(item: ClassroomItem): number {
	const t = Date.parse(item.created_at);
	return Number.isNaN(t) ? 0 : t;
}

/**
 * The stream, with check-ins merged in.
 *
 * ITEM ORDER IS `streamItems`' AND IS NOT RECOMPUTED. That function owns real
 * rules -- pinned block first, then manual `sort_order`, then newest -- and a
 * merge that re-sorted everything by timestamp would silently discard the
 * manual ordering a teacher set. So the item sequence is taken verbatim and
 * check-ins are INSERTED into it: each one goes before the first non-pinned
 * item older than it, or at the end when every item is older... which is to say
 * it lands where its own date puts it, by the same reverse-chronological
 * reading the rest of the stream already has.
 *
 * PINNED ITEMS ARE SKIPPED when looking for that insertion point, because they
 * are held at the top by choice rather than by date -- inserting a check-in
 * among them would push a pinned notice down for a reason that has nothing to
 * do with why it is pinned.
 *
 * A check-in has no pin of its own and cannot be given one here: pinning is a
 * `classroom_items` column, and a check-in is not one.
 */
export function streamEntries(items: ClassroomItem[], checkIns: ClassCheckIn[]): StreamEntry[] {
	return mergeCheckIns(streamItems(items), checkIns);
}

/**
 * The insertion half on its own: check-ins merged into a list of items that is
 * ALREADY in the order its caller wants.
 *
 * Split out from `streamEntries` because that function's first half is
 * `streamItems`, which DROPS MATERIALS -- right for the Stream it was written
 * for (a syllabus resurfacing at the top of a feed is what pinning was for) and
 * wrong for the unit-grouped class view, where a material is ordinary content
 * that has to appear in its group. Reusing the whole thing there made every
 * material silently vanish from the page, which is exactly the kind of bug a
 * browser pass exists to catch.
 *
 * `streamEntries` keeps its exact behaviour by calling this with the list
 * `streamItems` produces.
 */
export function mergeCheckIns(
	ordered: ClassroomItem[],
	checkIns: ClassCheckIn[]
): StreamEntry[] {
	const entries: StreamEntry[] = ordered.map((item) => ({
		kind: 'item' as const,
		key: `item:${item.id}`,
		item
	}));

	if (!checkIns.length) return entries;

	// Newest first, so equally-dated check-ins keep a stable, readable order and
	// the insertion walk below never has to reconsider one it already placed.
	const sorted = [...checkIns].sort(
		(a, b) =>
			checkInStamp(b) - checkInStamp(a) ||
			a.session_label.localeCompare(b.session_label) ||
			a.section_id.localeCompare(b.section_id)
	);

	for (const checkIn of sorted) {
		const stamp = checkInStamp(checkIn);
		let at = entries.length;
		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			// Never break into the pinned block, and never displace another
			// check-in already placed: `sorted` is descending, so anything already
			// there is at least as new as this one.
			if (entry.kind === 'check-in') continue;
			if (entry.item.pinned) continue;
			if (itemStamp(entry.item) < stamp) {
				at = i;
				break;
			}
		}
		entries.splice(at, 0, {
			kind: 'check-in',
			key: `check-in:${checkIn.session_id}:${checkIn.section_id}`,
			checkIn
		});
	}

	return entries;
}

/** "Unit 3 · Oct 14" -- the check-in card's own meta line. */
export function checkInMeta(checkIn: ClassCheckIn): string {
	const d = new Date(`${checkIn.session_date}T00:00:00`);
	const date = Number.isNaN(d.getTime())
		? checkIn.session_date
		: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	return `Unit ${checkIn.unit_number} · ${date}`;
}

/**
 * The count beside the class page's notebook link, or null when there is
 * nothing to say.
 *
 * ZERO IS NULL, deliberately: absence is the correct signal for nothing due. A
 * student who is up to date should see a plain link, not a badge reading 0 --
 * a zero badge is a notification that there is no notification.
 */
export function outstandingBadge(count: number | null | undefined): number | null {
	return typeof count === 'number' && count > 0 ? count : null;
}
