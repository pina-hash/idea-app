/**
 * The home-page classroom feed: which items from a caller's classes deserve
 * their attention RIGHT NOW, and in what order.
 *
 * Pure logic, no Svelte and no Supabase (the classroom.ts / curriculum.ts
 * convention). Everything here shapes rows the RLS policies already returned:
 * `classroom_items` is scoped to what the caller may read (a student never
 * receives a draft), `classroom_submissions` is own-row-or-reviewer, and
 * `classroom_item_views` is own-row. So this module never filters for privacy
 * -- it only decides RANK -- and a bug here can surface the wrong item, never
 * another student's state.
 *
 * RANKED BY URGENCY, NOT RECENCY. That is the whole point of the surface: the
 * class page is already a reverse-chronological stream, and repeating it on the
 * home page would tell a student nothing they could act on. An assignment due
 * tomorrow outranks an announcement posted an hour ago.
 *
 * STANDING REFERENCES ARE A SEPARATE SHELF. A syllabus is a material somebody
 * needs all year and acts on approximately never, so materials are split out of
 * the ranked list entirely rather than competing in it -- reachable, never
 * crowding out time-sensitive work.
 */
import {
	isUpdatedForViewer,
	resolveFigureSrc,
	type ClassroomItem,
	type ClassroomSection
} from '$lib/classroom/classroom';
import { itemBodyDoc, itemCoverImage } from '$lib/classroom/classroom-doc';

/** How far ahead "due soon" reaches. */
export const DUE_SOON_DAYS = 7;

/**
 * How near a deadline has to be to read as more than "due soon": inside this
 * many CALENDAR days it is imminent, and 0 days is today.
 *
 * A SECOND NUMBER, NOT A SECOND DEFINITION. `DUE_SOON_DAYS` still decides
 * whether a row appears at all (`dueWindow`); this only grades the rows that
 * already did, and it is measured with the same calendar-day arithmetic that
 * writes the words beside it -- so a row reading "Due tomorrow" and a row
 * treated as imminent are the same row by construction, and a surface cannot
 * emphasise one deadline while its own text names another.
 */
export const DUE_IMMINENT_DAYS = 2;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Default caps. A card is a summary; the class page is the full list. */
export const URGENT_LIMIT = 6;
export const STANDING_LIMIT = 3;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * One `classroom_submissions` row, trimmed to what ranking reads. `state` is
 * 0086's machine: draft -> submitted -> returned, where the ABSENCE of a row
 * and a row in 'draft' both mean "not handed in".
 */
export interface FeedSubmission {
	item_id: string;
	student_email: string;
	state: 'draft' | 'submitted' | 'returned';
	submitted_at?: string | null;
	returned_at?: string | null;
	graded_at?: string | null;
}

export interface BuildFeedInput {
	sections: ClassroomSection[];
	/** Every item the caller may read, each carrying its own postings. */
	items: ClassroomItem[];
	submissions: FeedSubmission[];
	/** The caller's own lowercased email, for own-vs-others submission rows. */
	myEmail: string;
	/** Mirrors classroom_manages_section: teacher of record, or admin. */
	isAdmin?: boolean;
	/**
	 * Per section, the roster addresses that can MANAGE that section (0138),
	 * from `classroom_section_roster`. Their submissions are not somebody's
	 * work to grade, so they are kept out of the to-grade tally.
	 *
	 * DEFAULTS TO EMPTY, and empty is the honest pre-0138 answer rather than a
	 * guess: the flag cannot be derived in a browser (admin-ness is keyed on
	 * `app_admins`, which is admin-only readable), so a project without the
	 * migration tallies exactly what it has always tallied.
	 */
	managerEmails?: Record<string, readonly string[]>;
	now?: Date;
	urgentLimit?: number;
	standingLimit?: number;
}

// ---------------------------------------------------------------------------
// Reasons
// ---------------------------------------------------------------------------

export type FeedReasonId =
	| 'overdue'
	| 'returned'
	| 'due-soon'
	/**
	 * NOTHING PRODUCES THIS RIGHT NOW, and the slot is kept on purpose rather
	 * than deleted. It was the reason an UNDATED assignment with no submission
	 * row ranked under, which is the false count `studentReason` no longer
	 * emits (see the long comment there). It comes back the moment an item can
	 * say it collects a hand-in, and its rank, tone and indicator are the
	 * answers that were already agreed for it -- deleting the four of them
	 * would only mean re-deciding them under a different name later.
	 */
	| 'unsubmitted'
	| 'updated'
	| 'pinned'
	| 'ungraded'
	| 'draft'
	| 'reference';

export type FeedTone = 'attention' | 'good' | 'info' | 'note' | 'muted';

export interface FeedEntry {
	item: ClassroomItem;
	reason: FeedReasonId;
	/** Submissions waiting on a grade. Teacher view only. */
	count?: number;
}

/**
 * Rank tables, lowest first. Two of them because the same item is a different
 * problem to each audience: an ungraded pile is the teacher's only real queue
 * and means nothing to the student who already handed the work in.
 */
const STUDENT_RANK: Partial<Record<FeedReasonId, number>> = {
	overdue: 0,
	returned: 1,
	'due-soon': 2,
	unsubmitted: 3,
	updated: 4,
	pinned: 5
};

const TEACHER_RANK: Partial<Record<FeedReasonId, number>> = {
	ungraded: 0,
	draft: 1,
	'due-soon': 2,
	pinned: 3
};

/**
 * Which reasons are a call to action (they drive the header's count chip).
 * "Updated" and "Pinned" are context, not a task.
 */
const ACTIONABLE = new Set<FeedReasonId>([
	'overdue',
	'returned',
	'due-soon',
	'unsubmitted',
	'ungraded',
	'draft'
]);

export function isActionable(reason: FeedReasonId): boolean {
	return ACTIONABLE.has(reason);
}

/**
 * Deliberately no crimson anywhere: that token is reserved for LIVE/REC/error,
 * and this surface has no live state by design.
 */
const TONES: Record<FeedReasonId, FeedTone> = {
	overdue: 'attention',
	returned: 'good',
	'due-soon': 'info',
	unsubmitted: 'info',
	updated: 'note',
	pinned: 'muted',
	ungraded: 'attention',
	draft: 'muted',
	reference: 'muted'
};

export function reasonTone(reason: FeedReasonId): FeedTone {
	return TONES[reason];
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

/** Not handed in: no row at all, or a row still being worked on. */
function isUnsubmitted(sub: FeedSubmission | undefined): boolean {
	return !sub || sub.state === 'draft';
}

/**
 * Waiting on the teacher. A resubmission after a return is submitted AGAIN
 * with the old `graded_at` still on the row, so a bare "graded_at is null"
 * check would quietly drop every resubmission out of the grading queue.
 */
export function isAwaitingGrade(sub: FeedSubmission): boolean {
	if (sub.state !== 'submitted') return false;
	if (!sub.graded_at) return true;
	if (!sub.submitted_at) return false;
	return Date.parse(sub.submitted_at) > Date.parse(sub.graded_at);
}

/** A released grade the student has not opened since it was released. */
function isUnseenReturn(sub: FeedSubmission | undefined, item: ClassroomItem): boolean {
	if (!sub || sub.state !== 'returned' || !sub.returned_at) return false;
	if (!item.viewed_at) return true;
	return Date.parse(sub.returned_at) > Date.parse(item.viewed_at);
}

function dueWindow(item: ClassroomItem, now: Date): 'past' | 'soon' | 'later' | 'none' {
	if (!item.due_at) return 'none';
	const due = Date.parse(item.due_at);
	if (Number.isNaN(due)) return 'none';
	if (due < now.getTime()) return 'past';
	return due <= now.getTime() + DUE_SOON_DAYS * DAY_MS ? 'soon' : 'later';
}

function studentReason(
	item: ClassroomItem,
	sub: FeedSubmission | undefined,
	now: Date
): FeedReasonId | null {
	if (item.kind === 'assignment') {
		if (isUnseenReturn(sub, item)) return 'returned';
		if (isUnsubmitted(sub)) {
			const when = dueWindow(item, now);
			if (when === 'past') return 'overdue';
			if (when === 'soon') return 'due-soon';
			/**
			 * AN ASSIGNMENT WITH NO DUE DATE IS NOT ACTIONABLE, and `when ===
			 * 'none'` used to return 'unsubmitted' here.
			 *
			 * `isUnsubmitted` treats a MISSING submission row as "not handed
			 * in", which is right for an assignment that collects one and wrong
			 * for every assignment that does not -- and nothing on a
			 * `classroom_items` row says which kind it is. So an assignment
			 * graded on paper, at the bench, or in conversation had no row, no
			 * deadline to expire, and no way to stop counting: it reported
			 * "Not handed in" into the "N to do" chip forever. A student
			 * reported exactly that, and the count was the reason he could not
			 * tell it apart from real work.
			 *
			 * THIS IS THE NARROW VERSION, DELIBERATELY. The durable fix is a
			 * flag on the item saying whether it COLLECTS a hand-in -- a
			 * migration plus a field on ContentComposer -- after which an
			 * undated assignment that does collect one can rank again on its own
			 * evidence rather than on the absence of a date. That is not in this
			 * bundle. What is here trades a false count for a missed one in
			 * exactly one case (an undated assignment that really does want a
			 * hand-in), which is the safer half of the trade on a surface whose
			 * whole job is to be believed.
			 *
			 * EVERYTHING WITH A DUE DATE IS UNTOUCHED: past is still 'overdue',
			 * inside the window is still 'due-soon', and later than the window
			 * still falls through to the reasons below -- not urgent yet, but
			 * still able to surface as updated or pinned.
			 */
		}
	}

	// A changed syllabus is worth knowing about, so an updated material DOES
	// rank -- but a merely PINNED one is a standing reference and belongs on
	// the shelf rather than in the ranked list.
	if (isUpdatedForViewer(item)) return 'updated';
	if (item.pinned && item.kind !== 'material') return 'pinned';
	return null;
}

function teacherReason(
	item: ClassroomItem,
	ungraded: number,
	now: Date
): FeedReasonId | null {
	if (ungraded > 0) return 'ungraded';
	if (!item.published) return 'draft';
	if (item.kind === 'material') return null;
	if (dueWindow(item, now) === 'soon') return 'due-soon';
	if (item.pinned) return 'pinned';
	return null;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

function compare(
	rank: Partial<Record<FeedReasonId, number>>
): (a: FeedEntry, b: FeedEntry) => number {
	return (a, b) => {
		const ra = rank[a.reason] ?? Number.MAX_SAFE_INTEGER;
		const rb = rank[b.reason] ?? Number.MAX_SAFE_INTEGER;
		if (ra !== rb) return ra - rb;
		// Within a rank: the soonest deadline first, undated behind dated, then
		// newest. A bigger grading pile outranks a smaller one.
		if (a.reason === 'ungraded' && b.reason === 'ungraded') {
			const diff = (b.count ?? 0) - (a.count ?? 0);
			if (diff !== 0) return diff;
		}
		const da = a.item.due_at ? Date.parse(a.item.due_at) : null;
		const db = b.item.due_at ? Date.parse(b.item.due_at) : null;
		if (da !== null && db !== null && da !== db) return da - db;
		if (da !== null && db === null) return -1;
		if (da === null && db !== null) return 1;
		return Date.parse(b.item.created_at) - Date.parse(a.item.created_at);
	};
}

const standingOrder = (a: FeedEntry, b: FeedEntry) => {
	if (a.item.pinned !== b.item.pinned) return a.item.pinned ? -1 : 1;
	return Date.parse(b.item.created_at) - Date.parse(a.item.created_at);
};

export interface SectionFeed {
	section: ClassroomSection;
	/** Teacher of record (or admin): the feed answers a different question. */
	manages: boolean;
	urgent: FeedEntry[];
	/** Materials: syllabus and standing references, never ranked against work. */
	standing: FeedEntry[];
	/** Ranked entries the cap left out. */
	hiddenCount: number;
	/** Entries that are a call to action, for the header chip. */
	actionCount: number;
	/** Everything posted here that the caller may read, capped or not. */
	totalItems: number;
}

/**
 * One feed per section the caller can see, in the order the sections were
 * given (the caller sorts; `sortSections` is the shared convention).
 *
 * `manages` mirrors classroom_manages_section (teacher of record, or admin)
 * rather than calling it once per section, because it only decides which
 * QUESTION the card answers -- RLS already decided what data exists to answer
 * it with, so getting it wrong shows a teacher the student framing, never
 * another section's rows.
 */
export function buildFeed(input: BuildFeedInput): SectionFeed[] {
	const {
		sections,
		items,
		submissions,
		myEmail,
		isAdmin = false,
		managerEmails = {},
		now = new Date(),
		urgentLimit = URGENT_LIMIT,
		standingLimit = STANDING_LIMIT
	} = input;

	const me = myEmail.trim().toLowerCase();

	// An item posted to three classes belongs to all three cards.
	const bySection = new Map<string, ClassroomItem[]>();
	for (const item of items) {
		for (const posting of item.postings) {
			const list = bySection.get(posting.section_id);
			if (list) list.push(item);
			else bySection.set(posting.section_id, [item]);
		}
	}

	/**
	 * Whose submissions on THIS item are not work to grade: the managers of
	 * every class it is posted to, unioned. Per ITEM and not per section,
	 * because the tally is per item -- an assignment posted to two classes has
	 * one count, and it must exclude both teachers of record.
	 */
	const managersFor = (item: ClassroomItem): Set<string> => {
		const set = new Set<string>();
		for (const posting of item.postings) {
			for (const email of managerEmails[posting.section_id] ?? []) set.add(email);
		}
		return set;
	};

	// Own submissions by item (a student has at most one row per item), and the
	// waiting-to-grade tally per item across every student.
	const mine = new Map<string, FeedSubmission>();
	const subsByItem = new Map<string, FeedSubmission[]>();
	for (const sub of submissions) {
		if ((sub.student_email ?? '').toLowerCase() === me) mine.set(sub.item_id, sub);
		const list = subsByItem.get(sub.item_id);
		if (list) list.push(sub);
		else subsByItem.set(sub.item_id, [sub]);
	}

	const ungraded = new Map<string, number>();
	for (const item of items) {
		const skip = managersFor(item);
		let n = 0;
		for (const sub of subsByItem.get(item.id) ?? []) {
			if (skip.has((sub.student_email ?? '').toLowerCase())) continue;
			if (isAwaitingGrade(sub)) n += 1;
		}
		if (n > 0) ungraded.set(item.id, n);
	}

	return sections.map((section) => {
		const manages = isAdmin || section.teacher_email.toLowerCase() === me;
		const sectionItems = bySection.get(section.id) ?? [];

		const urgent: FeedEntry[] = [];
		const standing: FeedEntry[] = [];

		for (const item of sectionItems) {
			const count = ungraded.get(item.id) ?? 0;
			const reason = manages
				? teacherReason(item, count, now)
				: studentReason(item, mine.get(item.id), now);
			if (reason) {
				urgent.push(count > 0 && manages ? { item, reason, count } : { item, reason });
				continue;
			}
			// Nothing to act on: a material is still worth keeping reachable.
			if (item.kind === 'material') standing.push({ item, reason: 'reference' });
		}

		urgent.sort(compare(manages ? TEACHER_RANK : STUDENT_RANK));
		standing.sort(standingOrder);

		const actionCount = urgent.filter((e) => isActionable(e.reason)).length;
		const shown = urgent.slice(0, urgentLimit);

		return {
			section,
			manages,
			urgent: shown,
			standing: standing.slice(0, standingLimit),
			hiddenCount: urgent.length - shown.length,
			actionCount,
			totalItems: sectionItems.length
		};
	});
}

// ---------------------------------------------------------------------------
// Preferences
// ---------------------------------------------------------------------------

/**
 * Which class cards this user keeps collapsed. Stored per USER (not per
 * browser) in `profiles.preferences.classroomFeed`, the same free-form JSONB
 * the launcher already keeps its homepage layout in -- so the choice follows
 * them across devices and needs no migration.
 */
export interface ClassroomFeedPrefs {
	collapsed?: string[];
}

export function readFeedPrefs(preferences: unknown): ClassroomFeedPrefs {
	if (!preferences || typeof preferences !== 'object') return {};
	const raw = (preferences as Record<string, unknown>).classroomFeed;
	if (!raw || typeof raw !== 'object') return {};
	const collapsed = (raw as Record<string, unknown>).collapsed;
	return { collapsed: Array.isArray(collapsed) ? collapsed.filter((c) => typeof c === 'string') : [] };
}

/** Toggle one section id, returning the next preference object. */
export function toggleCollapsed(prefs: ClassroomFeedPrefs, sectionId: string): ClassroomFeedPrefs {
	const cur = prefs.collapsed ?? [];
	return {
		...prefs,
		collapsed: cur.includes(sectionId)
			? cur.filter((id) => id !== sectionId)
			: [...cur, sectionId]
	};
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * Whole CALENDAR days from `now` to `iso`, negative for the past, null for a
 * date that does not parse.
 *
 * ONE COPY, because two things read it: the words on the row (`relativeDays`)
 * and the urgency the row is treated with (`dueUrgency`). Written twice, "due
 * tomorrow" and "treated as imminent" would be two answers to one question and
 * would eventually give a row that says tomorrow and is drawn as though it were
 * a fortnight out. CALENDAR days and not elapsed hours: a deadline at 8am
 * tomorrow is "tomorrow" to the person reading it even though it is 14 hours
 * away, and 23 hours away at 11pm tonight is still "today".
 */
function calendarDaysUntil(iso: string, now: Date): number | null {
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return null;
	const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	return Math.round((startOf(then) - startOf(now)) / DAY_MS);
}

/**
 * How hard a row's deadline is pressing, or null when the row is not about a
 * deadline at all.
 *
 * IT READS THE REASON THE RANKING ALREADY ASSIGNED rather than re-deciding from
 * the date, which is what keeps it from disagreeing with the list it decorates:
 * `buildFeed` has already said whether this item's deadline is the reason the
 * row is here, using the same `now` the caller threads through to the
 * component. A returned grade on a long-past assignment is not overdue work,
 * and an item ranked for being updated is not a deadline -- neither gets a
 * treatment, because neither is asking the student to beat a clock.
 *
 * FOUR STEPS AND NO FIFTH. Overdue and today are the two a student must not
 * miss; imminent is the next `DUE_IMMINENT_DAYS`; soon is the rest of the
 * `DUE_SOON_DAYS` window, which is the ordinary state and is deliberately the
 * one that gets no emphasis at all. Nothing here says a deadline may slip: the
 * steps only differ in how loudly they state the same date.
 */
export type DueUrgency = 'overdue' | 'today' | 'imminent' | 'soon';

const DEADLINE_REASONS = new Set<FeedReasonId>(['overdue', 'due-soon', 'unsubmitted']);

export function dueUrgency(entry: FeedEntry, now: Date = new Date()): DueUrgency | null {
	if (!DEADLINE_REASONS.has(entry.reason)) return null;
	if (entry.reason === 'overdue') return 'overdue';
	if (!entry.item.due_at) return null;
	const days = calendarDaysUntil(entry.item.due_at, now);
	if (days === null) return null;
	if (days < 0) return 'overdue';
	if (days === 0) return 'today';
	return days <= DUE_IMMINENT_DAYS ? 'imminent' : 'soon';
}

/** "in 3 days" / "tomorrow" / "2 days ago", from calendar days apart. */
function relativeDays(iso: string, now: Date): string {
	const days = calendarDaysUntil(iso, now);
	if (days === null) return '';
	if (days === 0) return 'today';
	if (days === 1) return 'tomorrow';
	if (days === -1) return 'yesterday';
	if (days > 1) return `in ${days} days`;
	return `${Math.abs(days)} days ago`;
}

/**
 * The row's right-side indicator: what to do about this item, in as few words
 * as fit beside a title.
 */
export function feedIndicator(entry: FeedEntry, now: Date = new Date()): string {
	const { item, reason, count } = entry;
	switch (reason) {
		case 'overdue':
			return item.due_at ? `Overdue ${relativeDays(item.due_at, now)}` : 'Overdue';
		case 'returned':
			return 'Returned';
		case 'due-soon':
			return item.due_at ? `Due ${relativeDays(item.due_at, now)}` : 'Due soon';
		case 'unsubmitted':
			return 'Not handed in';
		case 'updated':
			return 'Updated';
		case 'pinned':
			return 'Pinned';
		case 'ungraded':
			return count === 1 ? '1 to grade' : `${count ?? 0} to grade`;
		case 'draft':
			return 'Draft';
		case 'reference':
			return 'Reference';
	}
}

/** The header chip: how much this class is asking of you. */
export function actionSummary(feed: SectionFeed): string | null {
	if (!feed.actionCount) return null;
	const n = feed.actionCount;
	return feed.manages
		? `${n} need${n === 1 ? 's' : ''} attention`
		: `${n} to do`;
}

/**
 * The empty state, distinguishing "your teacher has not posted anything" from
 * "you are genuinely caught up" -- two very different messages to a student
 * looking at a card with no rows in it.
 */
export function emptyMessage(feed: SectionFeed): string {
	if (!feed.totalItems) {
		return feed.manages
			? 'Nothing posted to this class yet.'
			: 'Nothing posted to this class yet. Anything your teacher posts shows up here.';
	}
	return feed.manages ? 'Nothing waiting on you right now.' : "You are all caught up. Nothing due.";
}


// ---------------------------------------------------------------------------
// The card thumbnail (0176)
// ---------------------------------------------------------------------------

/** A card's picture: what to load, and what to say about it. */
export interface FeedCover {
	src: string;
	alt: string;
}

/**
 * The thumbnail for one feed card, or null.
 *
 * NO SECOND ROUND TRIP, AND NO NEW COLUMN, because the read this surface
 * already makes carries both halves. `ITEM_SELECT` has embedded
 * `classroom_attachments(id, filename, mime_type, size_bytes, sort_order)`
 * since attachments existed, and `selectItemsWithDoc`'s widest three rungs
 * carry `body_doc`; the home feed calls that ladder. So a cover is a pure
 * function of rows that are already in memory -- thirty cards cost thirty
 * array lookups, not thirty signed URLs.
 *
 * THIS IS WHY 0176 CARRIES NO PROJECTION. A `cover_attachment_id` column, an
 * RPC widening, a definer-side resolution: all of it was on the table and none
 * of it is needed, and a stored cover would additionally be a second copy of
 * "which picture leads" that could disagree with the body the moment somebody
 * reordered it.
 *
 * IT DEGRADES TO NULL THREE WAYS, all of them meaning the same thing to the
 * card: a read whose rung did not carry `body_doc` (`itemBodyDoc` then converts
 * the PLAIN TEXT, which has no images in it by construction), a body with no
 * image, and an image whose reference `resolveFigureSrc` refuses or cannot
 * resolve. In every one of them the card keeps exactly the per-kind glyph it
 * renders today.
 *
 * REFUSAL IS THE ONE PREDICATE, NOT A LOOSER ONE FOR A SMALL PICTURE. A
 * thumbnail is an `img` the browser fetches automatically, same as a body
 * figure, so it is the same same-origin rule with SVG refused from every
 * source -- a 44px box is not a reason to relax what may be loaded into it.
 */
export function feedCover(item: ClassroomItem): FeedCover | null {
	const image = itemCoverImage(itemBodyDoc(item));
	if (!image) return null;
	const res = resolveFigureSrc(image.src, item.attachments ?? []);
	if (!res.ok) return null;
	return { src: res.src, alt: image.alt };
}
