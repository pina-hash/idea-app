/**
 * A STUDENT'S TO-DO, ACROSS EVERY CLASS (ledger 0297): what is assigned, what
 * is missing and what is done, grouped by week.
 *
 * Pure logic, no Svelte and no Supabase (the classroom.ts / feed.ts
 * convention). It shapes rows the shared owed-work read already returned
 * (`$lib/classroom/student-work`), which RLS scoped to the caller, so a bug here
 * can list the wrong item in the wrong group but never another student's work.
 *
 * NOTHING HERE DECIDES A STANDING OF ITS OWN. Where an assignment stands is
 * `assignmentStanding` and where a check-in stands is `checkInStanding`, both
 * in classroom.ts and both already what the class page's To do / Missing /
 * Done filter asks; the chip on a row is `studentWorkChip`; which classes are
 * taught is the feed's `sectionManagedBy`; an unread return is the feed's
 * `isUnseenReturn`. So "Missing" means one thing on this page, on the class
 * page's filter, on a row's chip, and in every count on My Classes and the
 * home page, because it is one function.
 *
 * ONE CLOCK. Every function takes the loader's `{ now, today }` and reads no
 * clock: `now` is the instant a deadline is compared against (a deadline at
 * 8am is past at 3pm), `today` is the America/Los_Angeles day a week or a
 * check-in is adjudicated in.
 *
 * AN ASSIGNMENT WITH NO DUE DATE IS LISTED BUT NEVER COUNTED. Nothing on a
 * `classroom_items` row says whether an assignment collects a hand-in at all
 * (the feed's `studentReason` explains why that made its count false), so an
 * undated one sits in its own "No due date" group, last, where a student can
 * find it, and no summary number ("2 missing, 3 due this week") includes it.
 * The durable fix is a "collects a hand-in" flag on the item, which is schema.
 */
import {
	assignmentStanding,
	checkInStanding,
	itemTitle,
	studentWorkChip,
	studentWorkMap,
	workIsComplete,
	formatDue,
	type ClassroomItem,
	type ClassroomSection,
	type WorkChipTone,
	type WorkStanding
} from '$lib/classroom/classroom';
import { checkInHref, checkInStatusLabel, checkInTone, type ClassCheckIn } from '$lib/classroom/class-check-ins';
import { isUnseenReturn, sectionManagedBy, type FeedSubmission } from '$lib/classroom/feed';
import {
	SCHOOL_LOCALE,
	SCHOOL_TIME_ZONE,
	daysBetween,
	schoolDayOf,
	weekOffset
} from '$lib/classroom/school-calendar';

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export const TODO_VIEWS = ['assigned', 'missing', 'done'] as const;
export type TodoView = (typeof TODO_VIEWS)[number];

export const TODO_VIEW_LABELS: Record<TodoView, string> = {
	assigned: 'Assigned',
	missing: 'Missing',
	done: 'Done'
};

/** A stored or typed view that is not one of the three reads as the default, never as an empty page. */
export function isTodoView(value: unknown): value is TodoView {
	return typeof value === 'string' && (TODO_VIEWS as readonly string[]).includes(value);
}

/** A standing, as the view it is listed under. */
function viewOf(standing: WorkStanding): TodoView {
	return standing === 'todo' ? 'assigned' : standing;
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

export interface TodoRow {
	/** Stable across renders: the item or the (check-in, class) pair. */
	key: string;
	kind: 'assignment' | 'check-in';
	/** The class it is listed under. */
	section: ClassroomSection;
	title: string;
	href: string;
	view: TodoView;
	/** The school day it is due, or null for an undated assignment. */
	dueDay: string | null;
	/** The due instant (an assignment); a check-in is due on its day and carries none. */
	dueAt: string | null;
	/** When it was turned in or handed back, for a done assignment. */
	doneAt: string | null;
	createdAt: string | null;
	/** The row's chip: the same words and tone the class page prints for it. */
	state: string;
	tone: WorkChipTone;
	/** Finished: the row carries a checkmark. */
	done: boolean;
	/** Handed back with a grade or a comment the student has not opened since. */
	feedbackUnread: boolean;
	points: number | null;
	unitNumber: number | null;
}

export interface TodoInput {
	sections: readonly ClassroomSection[];
	items: readonly ClassroomItem[];
	submissions: readonly FeedSubmission[];
	checkIns: readonly ClassCheckIn[];
	/** The caller's own address, for own-versus-others submission rows. */
	myEmail: string;
	isAdmin: boolean;
	/** The loader's one clock read. */
	clock: { now: string; today: string };
	/** Where item links are built from; a dev harness passes its own. */
	basePath?: string;
}

/**
 * THE CLASSES A TO-DO LISTS: every class the caller can see and does not
 * teach, in the shared class order. Exported so the class filter offers
 * exactly the classes the rows can come from, including one with nothing in it.
 */
export function todoSections(
	sections: readonly ClassroomSection[],
	myEmail: string,
	isAdmin: boolean
): ClassroomSection[] {
	return sections.filter((s) => !sectionManagedBy(s, myEmail, isAdmin));
}

/**
 * Every assignment and check-in a student owes, has missed or has finished, in
 * the classes they do not teach. A material or an announcement is not work and
 * is never a row; a check-in that has not been asked for yet (`scheduled`) is
 * not either, by the whitelist `checkInStanding` shares with `isOutstanding`.
 *
 * ONE ROW PER ITEM, listed under the first of the student's classes it is
 * posted to (in the shared class order), because the work is one piece of work
 * however many of their classes carry it.
 */
export function buildTodo(input: TodoInput): TodoRow[] {
	const { clock, basePath = '/classroom' } = input;
	const me = input.myEmail.trim().toLowerCase();
	const mine = todoSections(input.sections, me, input.isAdmin);
	const sectionById = new Map(mine.map((s) => [s.id, s]));

	const own = new Map<string, FeedSubmission>();
	for (const sub of input.submissions) {
		if ((sub.student_email ?? '').toLowerCase() === me) own.set(sub.item_id, sub);
	}
	const work = studentWorkMap(
		[...own.values()].map((s) => ({
			item_id: s.item_id,
			state: s.state,
			score: s.score ?? null,
			// A finished ported worksheet (decision 37), carried through so this
			// list asks the one predicate the class page and the feed ask.
			completed_at: s.completed_at
		}))
	);

	const rows: TodoRow[] = [];
	for (const item of input.items) {
		if (item.kind !== 'assignment') continue;
		const posted = new Set(item.postings.map((p) => p.section_id));
		const section = mine.find((s) => posted.has(s.id));
		if (!section) continue;
		const standing = assignmentStanding(item, work[item.id], clock.now);
		if (!standing) continue;
		const sub = own.get(item.id);
		const chip = studentWorkChip(item, work[item.id], clock.now);
		rows.push({
			key: `item:${item.id}`,
			kind: 'assignment',
			section,
			title: itemTitle(item),
			href: `${basePath}/${section.id}/item/${item.id}`,
			view: viewOf(standing),
			dueDay: schoolDayOf(item.due_at),
			dueAt: item.due_at ?? null,
			doneAt: chip.done
				? (sub?.returned_at ?? sub?.submitted_at ?? (workIsComplete(work[item.id]) ? work[item.id].completedAt || null : null))
				: null,
			createdAt: item.created_at ?? null,
			state: chip.label,
			tone: chip.tone,
			done: chip.done,
			feedbackUnread: isUnseenReturn(sub, item),
			points: item.points,
			unitNumber: null
		});
	}

	for (const checkIn of input.checkIns) {
		const section = sectionById.get(checkIn.section_id);
		if (!section || !checkIn.status) continue;
		const standing = checkInStanding(checkIn, clock.today);
		if (!standing) continue;
		rows.push({
			key: `check-in:${checkIn.session_id}:${checkIn.section_id}`,
			kind: 'check-in',
			section,
			title: checkIn.session_label,
			href: checkInHref(checkIn),
			view: viewOf(standing),
			dueDay: checkIn.session_date,
			dueAt: null,
			doneAt: null,
			createdAt: null,
			state: checkInStatusLabel(checkIn.status),
			// A check-in past its day and not filed wears the SAME missing tone an
			// assignment does in the same list, so the Missing view reads as one
			// kind of thing; everywhere else it keeps the class page's own tone.
			tone: standing === 'missing' ? 'missing' : checkInTone(checkIn.status),
			done: standing === 'done',
			feedbackUnread: false,
			points: null,
			unitNumber: checkIn.unit_number
		});
	}
	return rows;
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------

export type TodoGroupId =
	| 'feedback'
	| 'this-week'
	| 'next-week'
	| 'later'
	| 'no-date'
	| 'last-week'
	| 'earlier';

export const TODO_GROUP_LABELS: Record<TodoGroupId, string> = {
	feedback: 'Feedback to read',
	'this-week': 'This week',
	'next-week': 'Next week',
	later: 'Later',
	'no-date': 'No due date',
	'last-week': 'Last week',
	earlier: 'Earlier'
};

export interface TodoGroup {
	id: TodoGroupId;
	label: string;
	rows: TodoRow[];
}

/** Soonest first: by day, then by the due instant, a check-in (no time) first on its day. */
function bySoonest(a: TodoRow, b: TodoRow): number {
	const ka = `${a.dueDay ?? ''}|${a.dueAt ?? ''}`;
	const kb = `${b.dueDay ?? ''}|${b.dueAt ?? ''}`;
	return ka < kb ? -1 : ka > kb ? 1 : a.title.localeCompare(b.title);
}

/** The day a finished row finished on: handed back or turned in, else the check-in's own day. */
function doneDay(row: TodoRow): string | null {
	return schoolDayOf(row.doneAt) ?? row.dueDay;
}

/** Most recent first: by the day it finished, then the instant. */
function byRecent(a: TodoRow, b: TodoRow): number {
	const key = (r: TodoRow) => `${doneDay(r) ?? ''}|${r.doneAt ?? ''}`;
	const ka = key(a);
	const kb = key(b);
	return ka < kb ? 1 : ka > kb ? -1 : a.title.localeCompare(b.title);
}

/**
 * THE ASSIGNED VIEW'S "THIS WEEK", ONE PREDICATE for the group and for every
 * door's "due this week" count. An assigned row dated before this week is a
 * check-in the teacher asked to see again (flagged), which is owed now, so it
 * is this week's too.
 */
function isThisWeek(row: TodoRow, today: string): boolean {
	if (!row.dueDay) return false;
	const w = weekOffset(row.dueDay, today);
	return w !== null && w <= 0;
}

function pastGroup(day: string | null, today: string): TodoGroupId {
	const w = day ? weekOffset(day, today) : null;
	if (w === 0) return 'this-week';
	if (w === -1) return 'last-week';
	return 'earlier';
}

/**
 * THE GROUPS ONE VIEW IS READ IN, emptied groups dropped.
 *
 * ASSIGNED reads forward from today: This week, Next week, Later, then No due
 * date LAST. Google Classroom lists the undated group first; here it is last
 * because it is the one group that never empties (see the header), and a list
 * whose first rows never change is a list a student stops reading.
 *
 * A HANDED-BACK GRADE NOBODY HAS OPENED leads the Assigned view as "Feedback to
 * read", which is what the default view has to show for it to be seen at all:
 * the work itself is done and stays listed under Done, and the row leaves this
 * group the moment the item is opened (the same `viewed_at` the home feed
 * reads). It is the one row that can appear in two views, on purpose.
 *
 * MISSING reads backward from today, newest first: This week, Last week,
 * Earlier. DONE is by recency the same way, dated by when the work was turned
 * in or handed back.
 */
export function todoGroups(rows: readonly TodoRow[], view: TodoView, today: string): TodoGroup[] {
	const buckets = new Map<TodoGroupId, TodoRow[]>();
	const put = (id: TodoGroupId, row: TodoRow) => {
		const list = buckets.get(id);
		if (list) list.push(row);
		else buckets.set(id, [row]);
	};
	let order: TodoGroupId[];
	if (view === 'assigned') {
		order = ['feedback', 'this-week', 'next-week', 'later', 'no-date'];
		for (const row of rows) {
			if (row.feedbackUnread) put('feedback', row);
			if (row.view !== 'assigned') continue;
			const w = row.dueDay ? weekOffset(row.dueDay, today) : null;
			put(w === null ? 'no-date' : isThisWeek(row, today) ? 'this-week' : w === 1 ? 'next-week' : 'later', row);
		}
	} else if (view === 'missing') {
		order = ['this-week', 'last-week', 'earlier'];
		for (const row of rows) if (row.view === 'missing') put(pastGroup(row.dueDay, today), row);
	} else {
		order = ['this-week', 'last-week', 'earlier'];
		for (const row of rows) if (row.view === 'done') put(pastGroup(doneDay(row), today), row);
	}
	return order
		.filter((id) => buckets.has(id))
		.map((id) => {
			const list = buckets.get(id)!;
			if (view === 'done' || id === 'feedback') list.sort(byRecent);
			else if (view === 'missing') list.sort((a, b) => bySoonest(b, a));
			else if (id === 'no-date') list.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
			else list.sort(bySoonest);
			return { id, label: TODO_GROUP_LABELS[id], rows: list };
		});
}

/**
 * HOW MANY COLUMNS THE GROUPS CAN ACTUALLY FILL, at most three. Multicol cuts
 * every column its count allows and balances the groups into as few as hold
 * them, so a view whose tallest group is taller than all the others together
 * (a long "This week" beside two short groups) leaves a whole column empty at
 * a count of three. The groups can fill no more columns than their total
 * height over the tallest one's, counting a heading as a row; the stylesheet
 * still drops to fewer where the width will not hold them.
 */
export function todoColumns(groups: readonly TodoGroup[]): number {
	if (!groups.length) return 1;
	const heights = groups.map((g) => g.rows.length + 1);
	const tallest = Math.max(...heights);
	const total = heights.reduce((a, b) => a + b, 0);
	return Math.max(1, Math.min(3, groups.length, Math.ceil(total / tallest)));
}

/** How many rows each view lists, for the view controls. */
export function todoViewCounts(rows: readonly TodoRow[]): Record<TodoView, number> {
	const out: Record<TodoView, number> = { assigned: 0, missing: 0, done: 0 };
	for (const row of rows) out[row.view] += 1;
	return out;
}

/** The rows of one class, or every row when no class is chosen. */
export function rowsForClass(rows: readonly TodoRow[], sectionId: string | null | undefined): TodoRow[] {
	return sectionId ? rows.filter((r) => r.section.id === sectionId) : [...rows];
}

// ---------------------------------------------------------------------------
// The counts other surfaces print
// ---------------------------------------------------------------------------

export interface TodoSummary {
	/** Past due and not turned in (assignments and check-ins). */
	missing: number;
	/**
	 * Not turned in and due between now and the end of this week (Saturday),
	 * which is exactly the Assigned view's "This week" group. Undated work is
	 * never counted.
	 */
	dueThisWeek: number;
	/** Handed back with feedback not yet opened. */
	feedback: number;
}

/**
 * THE NUMBERS A DOOR TO THIS PAGE PRINTS: My Classes per class, the home page
 * and the classroom header across all of them. Read off the same rows the page
 * lists, so a count and the list it opens cannot disagree.
 */
export function todoSummary(rows: readonly TodoRow[], today: string, sectionId?: string | null): TodoSummary {
	const out: TodoSummary = { missing: 0, dueThisWeek: 0, feedback: 0 };
	for (const row of rowsForClass(rows, sectionId)) {
		if (row.view === 'missing') out.missing += 1;
		else if (row.view === 'assigned' && isThisWeek(row, today)) out.dueThisWeek += 1;
		if (row.feedbackUnread) out.feedback += 1;
	}
	return out;
}

/** The counts per class and across all of them, keyed by class id: what My Classes prints. */
export interface TodoSummaries {
	bySection: Record<string, TodoSummary>;
	total: TodoSummary;
}

/** Every class's counts and the total, from the one row list. */
export function todoSummaries(
	rows: readonly TodoRow[],
	sections: readonly ClassroomSection[],
	today: string
): TodoSummaries {
	const bySection: Record<string, TodoSummary> = {};
	for (const s of sections) bySection[s.id] = todoSummary(rows, today, s.id);
	return { bySection, total: todoSummary(rows, today) };
}

/** "2 missing", "3 due this week": the words for a count, or null for zero (a zero is no news). */
export function summaryWords(summary: TodoSummary): { missing: string | null; dueThisWeek: string | null; feedback: string | null } {
	return {
		missing: summary.missing ? `${summary.missing} missing` : null,
		dueThisWeek: summary.dueThisWeek ? `${summary.dueThisWeek} due this week` : null,
		feedback: summary.feedback ? `${summary.feedback} returned` : null
	};
}

// ---------------------------------------------------------------------------
// The words on a row
// ---------------------------------------------------------------------------

/** "today" / "tomorrow" / "yesterday" relative to the school day, or null beyond them. */
function nearDay(day: string, today: string): string | null {
	const d = daysBetween(today, day);
	if (d === 0) return 'today';
	if (d === 1) return 'tomorrow';
	if (d === -1) return 'yesterday';
	return null;
}

function schoolTime(iso: string): string {
	return new Date(iso).toLocaleTimeString(SCHOOL_LOCALE, {
		hour: 'numeric',
		minute: '2-digit',
		timeZone: SCHOOL_TIME_ZONE
	});
}

function schoolDate(day: string): string {
	// A bare day, printed as a day: noon UTC keeps it on its own date in any zone.
	return new Date(`${day}T12:00:00Z`).toLocaleDateString(SCHOOL_LOCALE, {
		month: 'short',
		day: 'numeric',
		timeZone: 'UTC'
	});
}

/**
 * WHEN A ROW IS DUE OR WAS FINISHED, in the school's zone and locale and with
 * no weekday: "Due today, 11:59 PM", "Due Aug 28, 11:59 PM", "Turned in
 * Aug 26", "Returned yesterday".
 */
export function todoWhen(row: TodoRow, today: string): string {
	if (row.view === 'done' && row.kind === 'assignment' && row.doneAt) {
		// "Completed" for a ported worksheet finished by filling it in (decision
		// 37): nothing was turned in, and the chip beside this already says
		// "Complete", so the verb agrees with it.
		const verb = row.state.startsWith('Returned')
			? 'Returned'
			: row.state.startsWith('Complete')
				? 'Completed'
				: 'Turned in';
		const day = schoolDayOf(row.doneAt);
		return day ? `${verb} ${nearDay(day, today) ?? schoolDate(day)}` : verb;
	}
	if (!row.dueDay) return 'No due date';
	const near = nearDay(row.dueDay, today);
	if (row.dueAt) {
		return near ? `Due ${near}, ${schoolTime(row.dueAt)}` : `Due ${formatDue(row.dueAt, today)}`;
	}
	return `Due ${near ?? schoolDate(row.dueDay)}`;
}
