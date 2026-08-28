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
 * Check-ins live in `notebook_sessions` + `notebook_session_postings` and are
 * read separately from the items, then merged here. That is a LOADING shape,
 * not a claim about the schema: 0120 gave the POSTING an `item_id` pointing at
 * `classroom_postings (item_id, section_id)`, so a foreign key now exists in
 * one direction. What has not changed is the paragraph above -- a check-in
 * still has no points, no due date, no submission and no rubric, and linking
 * one to an item gives it none of them.
 *
 * (This header used to argue the reverse, on the grounds that no key existed
 * to embed through. That was true of the schema it described and is not true
 * of this one. The reason a check-in must not become a `classroom_items` kind
 * is the SECOND SCORING PATH, above, which no amount of schema changes
 * affects.)
 *
 * TWO SHAPES, BOTH LIVE, AND THE POSTING DECIDES WHICH.
 *
 *   - `item_id` null  -- the check-in is its own row in the class stream,
 *                        exactly as every check-in was before 0120. Nothing
 *                        was backfilled, so this is still most of them.
 *   - `item_id` set   -- it stops emitting a row and renders as a block on
 *                        that item, so the day's material and the notebook
 *                        requirement that goes with it are one thing.
 *
 * `mergeCheckIns` is where that fork lives, once: a linked check-in cannot
 * reach the stream through any caller, because the filter is inside the merge
 * rather than at the four places that call it.
 */
import type { NotebookFlagReason } from '$lib/notebook';
import type { ItemDoc } from '$lib/classroom/classroom-doc';
import type { TiptapNode } from '$lib/rich-text';
import { streamItems, type ClassroomItem } from '$lib/classroom/classroom';

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * Where the viewer stands on one check-in.
 *
 * The values are the notebook's own, narrowed to what a STUDENT can act on.
 * `late` is deliberately absent: whether an entry arrived on time is
 * adjudicated by `notebook_get_section_grid`, which owns the
 * America/Los_Angeles calendar rule, and re-deriving that here would be a
 * second copy of a rule that has exactly one right answer. A late entry reads
 * as `filed`, and lateness stays a review question on the grid where it is
 * decided.
 *
 * `scheduled` IS THE ONE VALUE THAT IS NOT ABOUT THE VIEWER, and it is the
 * same idea `0140` gave the teacher's grid: a check-in dated after today has
 * not been asked for yet. It is a property of the DAY, identical for everybody
 * looking at it, which is why it is the one status a MANAGER carries (see the
 * class load) where every other one is null for them. It sits in this union
 * rather than beside it because both sides of this feature now read off one
 * vocabulary -- the grid says `scheduled` in its cell, this says `scheduled`
 * on its card, and neither has to know how the other spells it.
 */
export type CheckInStatus =
	| 'filed'
	| 'draft'
	| 'awaiting_review'
	| 'flagged'
	| 'excused'
	| 'scheduled'
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
	/**
	 * THE CLASSROOM ITEM THIS CHECK-IN HANGS OFF IN THIS CLASS (0120), or null
	 * for the shape every check-in had before it: its own row in the stream.
	 *
	 * It is the POSTING's column, so it is per-class exactly as `section_id` is
	 * -- one canonical check-in can hang off a material in period 2 and stand on
	 * its own in period 5, because the item is posted to one and not the other.
	 *
	 * REQUIRED, NOT OPTIONAL, and deliberately: every place that builds one of
	 * these has to decide, and a project whose schema predates 0120 says so by
	 * writing `null` rather than by leaving the field off and reading undefined
	 * as "not linked" in some branches and "unknown" in others.
	 */
	item_id: string | null;
	/**
	 * THE INSTRUCTOR'S GUIDANCE PROMPT (0123), in the closed classroom rich-text
	 * shape, or null for a check-in with no prompt.
	 *
	 * It is the CANONICAL check-in's, not the posting's, so every class this row
	 * could be about carries the same one -- which is why editing it is one edit
	 * rather than three.
	 *
	 * OPTIONAL, unlike `item_id` beside it, and the difference is deliberate:
	 * `item_id` null is a real answer a caller has to give ("not linked"), while
	 * `undefined` here means the read never asked -- a project between 0122 and
	 * 0123 answering through a narrower ladder rung. Null and undefined render
	 * identically; they are only distinguished where a surface decides whether to
	 * offer the field for EDITING.
	 */
	guidance_doc?: ItemDoc | null;
}

// ---------------------------------------------------------------------------
// The calendar
// ---------------------------------------------------------------------------

/**
 * TODAY, ON THE CALENDAR `session_date` IS WRITTEN IN.
 *
 * `notebook_sessions.session_date` is a bare DATE, and every rule that
 * adjudicates one compares it in America/Los_Angeles:
 * `notebook_get_section_grid`'s `on_time` is
 * `(upload_timestamp at time zone 'America/Los_Angeles')::date <= se.session_date`
 * (0094/0098), and `0140`'s `scheduled` arm is `se.session_date > v_today`
 * where `v_today` is that same conversion. A server reading UTC instead would
 * run seven or eight hours ahead, so every evening between 5pm Pacific and
 * midnight UTC the next day's check-in would already read as due -- a smaller
 * copy of the exact defect the `scheduled` state exists to remove, arriving in
 * the hours a teacher actually lays the next day out.
 *
 * IT TAKES `now` RATHER THAN READING A CLOCK, and that is the whole point of
 * it being here. A pure function that reaches for `new Date()` is the defect no
 * probe catches; a pure function handed an instant is assertable at a pinned
 * one, including the instants where the two calendars disagree. THE LOADER
 * READS THE CLOCK, ONCE, and hands the day down -- there is exactly one idea of
 * "today" on this surface and it is the loader's.
 *
 * `en-CA` is the YYYY-MM-DD spelling, which is the string the column holds, so
 * every comparison against it is a plain lexical one with no parsing in it.
 */
export function laCalendarDay(now: Date): string {
	return now.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

/**
 * IS THIS CHECK-IN DATED AFTER TODAY -- that is, has it been asked for yet?
 *
 * STRICTLY AFTER, so a check-in dated TODAY is due: that is the day it is for,
 * not the day after it. It is the same `>` `0140` writes into the grid's
 * `case`, and flipping it to `>=` is the direction that matters -- a class
 * genuinely behind would read as caught up, which is as silent as the defect
 * this replaces.
 *
 * BOTH ARGUMENTS ARE YYYY-MM-DD, so this is a lexical compare and not a date
 * parse. Nothing here reads a clock; `today` comes from `laCalendarDay` at the
 * one place that does.
 */
export function checkInIsScheduled(sessionDate: string, today: string): boolean {
	return sessionDate > today;
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
 *
 * THE ARMS ARE `0140`'s GRID ARMS, IN `0140`'s ORDER, and that is deliberate
 * rather than coincidental -- the two sides of this feature now answer one
 * question the same way:
 *
 *   turned-in entry > excusal > scheduled > draft > missing
 *
 *   - AN ENTRY WINS because a student who filed EARLY has filed it, and
 *     reporting "not due yet" over their own work would be telling them the
 *     page did not count. The same argument already put an entry above an
 *     excusal.
 *   - AN EXCUSAL WINS because it is a decision an instructor made about this
 *     student on that day (a field trip excused three weeks ahead is a record
 *     worth keeping on screen), and neither state counts against anybody, so
 *     nothing is lost by showing the one somebody chose.
 *   - `scheduled` BEATS A DRAFT for the reason a draft already loses to an
 *     excusal -- there is nothing to count yet -- and for one more that is
 *     decisive on its own: `isOutstanding` counts a draft, so a draft ranked
 *     first would tell a student they owe a check-in that has not been asked
 *     for. That is the whole defect, in a narrower case.
 *
 * `scheduled` IS HANDED IN, NEVER DERIVED. This function takes no clock, and
 * the caller passing a boolean rather than a date is what keeps it that way:
 * the loader reads `new Date()` once, converts it with `laCalendarDay`, and
 * asks `checkInIsScheduled`. A second idea of "is this due yet" -- one in the
 * loader and one in here -- is the pair that stops agreeing.
 */
export function checkInStatus(
	entry: CheckInEntry | null | undefined,
	excused: boolean,
	/**
	 * Whether this check-in is dated after today, from `checkInIsScheduled`.
	 *
	 * REQUIRED, NOT DEFAULTED, and deliberately: a default of `false` is the
	 * pre-`0140` answer, so a caller that forgot would silently reproduce the
	 * defect with nothing on screen or in the types to say so. Every caller has
	 * to decide, the way `ClassCheckIn.item_id` makes every builder decide.
	 */
	scheduled: boolean
): CheckInStatus {
	if (entry && entry.submitted) {
		if (entry.status === 'flagged') return 'flagged';
		if (entry.status === 'pending_review') return 'awaiting_review';
		return 'filed';
	}
	if (excused) return 'excused';
	if (scheduled) return 'scheduled';
	if (entry) return 'draft';
	return 'missing';
}

const STATUS_LABELS: Record<CheckInStatus, string> = {
	filed: 'Filed',
	// Names BOTH halves: that it exists, and that it has not gone anywhere yet.
	// "Draft" alone reads as a state somebody else can see.
	draft: 'Draft, not turned in',
	awaiting_review: 'Awaiting review',
	flagged: 'Needs another look',
	excused: 'Excused',
	// NOT "Scheduled", and the collision is the reason. This stream already
	// renders a `.sched-chip` reading "Scheduled" on a classroom ITEM, in amber,
	// meaning "students cannot see this yet" -- a manager-only chip about
	// PUBLICATION. A check-in dated ahead is the opposite: everybody can see it,
	// and what has not happened is the DUE DAY. So the label says the thing the
	// reader needs, the way `draft` names both its halves rather than saying
	// "Draft". The grid's own label for this state is "Scheduled" and stays that
	// way; the KEY is what the two surfaces share, never the wording.
	scheduled: 'Not due yet',
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
	// The `excused` tone, for the `excused` reason: a state that stops something
	// counting must not wear the tone of a state that asks for something. This
	// card sits at the BOTTOM of the stream as well (see mergeCheckIns) -- the
	// tone and the position are one decision made twice, because either alone
	// still lets a future check-in read as work.
	scheduled: 'muted',
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
 * is done. `scheduled` HAS NOT BEEN ASKED FOR YET, and it stays out of this
 * total by not being named -- which is the argument for the whitelist shape
 * rather than a blacklist, and is the same reason `gridSummary.outstanding`
 * needed no change when `0140` added the state on the other side. A state
 * added here has to be added DELIBERATELY.
 *
 * A manager's check-in carries a null status -- or `scheduled`, the one status
 * that is a fact about the day rather than about a person -- and neither counts
 * here; their own total comes from the grid (see the class page load).
 */
export function isOutstanding(status: CheckInStatus | null): boolean {
	return status === 'missing' || status === 'draft' || status === 'flagged';
}

export function outstandingCheckIns(checkIns: ClassCheckIn[]): number {
	return checkIns.filter((c) => isOutstanding(c.status)).length;
}

// ---------------------------------------------------------------------------
// Authoring one against an item (0120)
// ---------------------------------------------------------------------------

/**
 * The three things a check-in IS: which unit it belongs to, the day it is for,
 * and what it is called. Exactly `notebook_admin_upsert_session`'s authored
 * fields minus the sections, which are not a decision here -- a check-in
 * attached to an item runs where that item is posted, and asking twice is how
 * the two come to disagree.
 */
export interface CheckInDraft {
	unit_number: number | string;
	/** YYYY-MM-DD, straight off a date input. */
	session_date: string;
	session_label: string;
	/**
	 * THE INSTRUCTOR'S GUIDANCE PROMPT (0123), as the EDITOR's own document, or
	 * null for none.
	 *
	 * IT IS ON THE DRAFT AND NOT IN `checkInDraftPayload`, deliberately, and the
	 * split is the whole design. The payload is what
	 * `notebook_admin_upsert_session` takes -- a WHOLE-ROW REPLACE that also
	 * reconciles the section list -- and guidance must never travel through it:
	 * a caller who wanted to change only the prompt would have to restate the
	 * unit, the date, the label AND every class the check-in runs in, and
	 * getting the last of those wrong unposts those classes and detaches the
	 * work filed against them. So the prompt rides the DRAFT (it is authored on
	 * the same form, in the same breath) and is WRITTEN by
	 * `notebook_set_session_guidance` alone, which sets exactly one column.
	 *
	 * Untrusted and unnormalized, exactly like `ItemInput.bodyDoc`: the
	 * translation into the stored shape is a `$lib/server` whitelist and the SQL
	 * gate refuses whatever survives it.
	 */
	guidance?: TiptapNode | null;
}

/**
 * WHY THE UNIT IS `number | string`: `bind:value` on `<input type="number">`
 * coerces to a number, and an emptied field binds to the empty string. Typing
 * it honestly here is what keeps a `.trim()` off a number (this repo's
 * three-times trap) and lets the check below say "required" rather than
 * throwing.
 */
export const CHECK_IN_UNIT_MIN = 0;
export const CHECK_IN_UNIT_MAX = 1000;

/**
 * WHAT IS WRONG WITH THIS DRAFT, or null.
 *
 * It mirrors `notebook_admin_upsert_session`'s own three refusals rather than
 * inventing a fourth: the RPC is the boundary and raises these exact
 * conditions, and this exists so somebody staging one finds out while they are
 * typing instead of after they press Post. Where the two could drift, the RPC
 * wins -- which is why the numbers are named constants and the wording says the
 * same thing the database does.
 */
export function checkInDraftIssue(draft: CheckInDraft): string | null {
	const unit = typeof draft.unit_number === 'string' ? draft.unit_number.trim() : draft.unit_number;
	if (unit === '' || unit === null || unit === undefined) return 'Give the check-in a unit number.';
	const n = Number(unit);
	if (!Number.isInteger(n) || n < CHECK_IN_UNIT_MIN || n > CHECK_IN_UNIT_MAX) {
		return `Unit number must be a whole number between ${CHECK_IN_UNIT_MIN} and ${CHECK_IN_UNIT_MAX}.`;
	}
	if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.session_date ?? '')) return 'Pick the day it is for.';
	if (!(draft.session_label ?? '').trim()) return 'Give the check-in a name.';
	return null;
}

/** The draft as the RPC wants it, once `checkInDraftIssue` has passed. */
export function checkInDraftPayload(draft: CheckInDraft): {
	unit_number: number;
	session_date: string;
	session_label: string;
} {
	return {
		unit_number: Number(draft.unit_number),
		session_date: draft.session_date,
		session_label: draft.session_label.trim()
	};
}

/**
 * The writes that move a check-in between its two shapes, plus the guidance
 * write (0123).
 *
 * INJECTED, like every other transport in this module, so the dev harnesses
 * answer them in memory and the real route points them at the RPCs. Each is
 * re-authorized inside the function it calls (`classroom_manages_section`, or
 * `_notebook_manages_session` for guidance); handing them in is plumbing, never
 * the boundary.
 *
 * ABSENCE REMOVES THE CONTROL, down through the components -- an item page
 * given no transports has no attach and no detach to execute, which is what
 * makes a student's read-only view structural rather than a discipline.
 */
export interface ClassCheckInTransports {
	/**
	 * Create a check-in that belongs to this item, in every class it is posted
	 * to.
	 *
	 * IT REPORTS THE SESSION IT MADE, and that is not decoration: guidance is
	 * authored on the same form but written by a SECOND, narrow RPC against the
	 * check-in's id, which does not exist until this call returns. Without the
	 * id a retry after a half-landed save has nothing to aim at and would create
	 * a second check-in -- the same duplicate-on-retry defect `createdItemId`
	 * exists to prevent one level up.
	 */
	createForItem: (
		itemId: string,
		draft: CheckInDraft
	) => Promise<{ ok: boolean; message?: string; sessionId?: string | null }>;
	/** Put one back in the class stream. The check-in and its entries are untouched. */
	unlink: (
		sessionId: string,
		sectionId: string
	) => Promise<{ ok: boolean; message?: string }>;
	/**
	 * WRITE THE GUIDANCE PROMPT on a check-in that exists (0123). Null clears
	 * it, which is the only way to clear it.
	 *
	 * OPTIONAL, the presence-gates-the-control rule: a deployment whose schema
	 * predates 0123 hands in nothing, and every guidance field disappears
	 * rather than offering a save that would fail. It is a SEPARATE transport
	 * from `createForItem` for the same reason it is a separate RPC -- the
	 * upsert behind that one is a whole-row replace that reconciles the section
	 * list, and a prompt must never be able to unpost a class.
	 */
	setGuidance?: (
		sessionId: string,
		doc: TiptapNode | null
	) => Promise<{ ok: boolean; message?: string }>;
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
 *
 * A `scheduled` CHECK-IN IS NOT INSERTED BY DATE AT ALL. It is appended AFTER
 * everything else, and that exception is the whole reason a future check-in can
 * be shown to a student in the first place. The insertion walk below is
 * newest-first, and a future date is the newest thing on the page -- so a
 * check-in nobody has been asked for yet would land at the TOP, in the first
 * row a student reads, which is precisely where the defect that bounded this
 * read away used to put it. Showing it there would be worse than hiding it.
 * The tone and the label say it is not work (see STATUS_TONES); the position
 * says it too, and either one alone is one accident away from a future check-in
 * reading as today's.
 *
 * WITHIN THAT BLOCK THE ORDER FLIPS TO SOONEST-FIRST, which is one rule and not
 * two: the page reads NEAREST TO NOW first, and time runs both ways from today,
 * so descending above and ascending below is the same sentence on either side
 * of it. The alternative -- keeping the block newest-first -- puts the check-in
 * FURTHEST away directly under today's work and the next one due at the very
 * bottom, which inverts the only thing an upcoming list is read for.
 *
 * IT READS `status`, NEVER A CLOCK. The loader decided what is scheduled, in
 * the calendar it owns; a date comparison in here would be a second answer to
 * the same question, and `summarize()` on the grid side refuses one for exactly
 * the same reason.
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

	// A CHECK-IN ATTACHED TO AN ITEM (0120) HAS ALREADY BEEN RENDERED, on that
	// item, and a row of its own beside it would be the two-rows-for-one-thing
	// this exists to end. The filter is HERE rather than at the call sites so
	// there is no caller that can forget it -- ClassView merges per unit group,
	// the dev harness merges its fixture, and neither knows the rule.
	const loose = streamCheckIns(checkIns);
	if (!loose.length) return entries;

	const entryFor = (checkIn: ClassCheckIn): StreamEntry => ({
		kind: 'check-in',
		key: `check-in:${checkIn.session_id}:${checkIn.section_id}`,
		checkIn
	});
	// The tie-breakers are the same pair on both sides, so two check-ins sharing
	// a date keep one stable, readable order wherever they end up.
	const settle = (a: ClassCheckIn, b: ClassCheckIn) =>
		a.session_label.localeCompare(b.session_label) || a.section_id.localeCompare(b.section_id);

	// Newest first, so equally-dated check-ins keep a stable, readable order and
	// the insertion walk below never has to reconsider one it already placed.
	const sorted = loose
		.filter((c) => c.status !== 'scheduled')
		.sort((a, b) => checkInStamp(b) - checkInStamp(a) || settle(a, b));

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
		entries.splice(at, 0, entryFor(checkIn));
	}

	// AFTER EVERYTHING, SOONEST FIRST. `push` and not `splice`: whatever the walk
	// above decided about the actionable rows is final, and nothing upcoming may
	// reach between two of them.
	for (const checkIn of loose
		.filter((c) => c.status === 'scheduled')
		.sort((a, b) => checkInStamp(a) - checkInStamp(b) || settle(a, b))) {
		entries.push(entryFor(checkIn));
	}

	return entries;
}

// ---------------------------------------------------------------------------
// The two shapes (0120)
// ---------------------------------------------------------------------------

/**
 * THE CHECK-INS THAT STILL EMIT A STREAM ROW: the ones no item has claimed.
 *
 * Exported beside `mergeCheckIns` (which applies it) for the one caller that
 * needs the same question without the merge -- "is this class empty", where a
 * check-in rendered on an item is not an answer, because the item it renders
 * on is already content on the page.
 */
export function streamCheckIns(checkIns: ClassCheckIn[]): ClassCheckIn[] {
	return checkIns.filter((c) => !c.item_id);
}

/**
 * THE CHECK-INS THAT HANG OFF ONE ITEM, for the block the item page renders.
 *
 * Plural because the payload is per-class and an item can carry more than one
 * day's check-in in principle; the composer creates one at a time, and the
 * block renders whatever it is handed rather than assuming a count.
 *
 * An empty item id answers empty rather than matching every unlinked check-in,
 * which is the failure this shape makes easy to write by accident.
 */
export function checkInsForItem(checkIns: ClassCheckIn[], itemId: string): ClassCheckIn[] {
	if (!itemId) return [];
	return checkIns.filter((c) => c.item_id === itemId);
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
