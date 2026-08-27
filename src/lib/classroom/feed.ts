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
	type ClassroomItem,
	type ClassroomSection
} from '$lib/classroom/classroom';

/** How far ahead "due soon" reaches. */
export const DUE_SOON_DAYS = 7;

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
			if (when === 'none') return 'unsubmitted';
			// Due later than the window: not urgent yet, but it may still be
			// worth surfacing for another reason below.
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

/** "in 3 days" / "tomorrow" / "2 days ago", from calendar days apart. */
function relativeDays(iso: string, now: Date): string {
	const then = new Date(iso);
	if (Number.isNaN(then.getTime())) return '';
	const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const days = Math.round((startOf(then) - startOf(now)) / DAY_MS);
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
