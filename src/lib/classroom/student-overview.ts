/**
 * ONE STUDENT'S PAGE IN ONE CLASS, AS PLAIN DATA (the 2026-10-07 round,
 * reports 792eb6b1 and 63fb1c49: "a per student page with all their work and
 * stats", "for parent teacher conferences to show the student's activity in
 * the class").
 *
 * No Svelte, no Supabase and no clock: the route hands in the reads it made
 * and the section load's one clock read, and gets back the page. The same
 * function builds the dev harness's page from fixture rows, so the harness
 * measures the real projection and not a hand-shaped copy of it.
 *
 * EVERY PROJECTION RUNS ON THE SERVER AND ONLY THIS STUDENT'S SLICE LEAVES IT.
 * Whatever a load returns is serialized into the browser, and three of the
 * reads behind this page legitimately carry the whole class: the notebook grid
 * (every student's name, address and uuid), the team board (every member of
 * every team) and the roster. `buildStudentPage` reduces each to one student
 * before anything is returned, and nothing it returns names a classmate. A
 * teammate is a count, never a name (decision of the round: the page is a
 * printout handed to a parent, and a classmate's name is their data).
 *
 * IT ASKS THE ONE PREDICATE EVERY OTHER SURFACE ASKS. Each assignment's words
 * are `studentWorkChip`'s, which asks `assignmentStanding` for Missing, over
 * the same worksheet-completion input (decision 37) the student's own pages
 * read, so this page cannot call something Missing that the student's to-do
 * calls Complete. Presence goes through `presenceLineKind`, the one decision
 * of what a missing heartbeat row may say.
 *
 * IT GRADES NOTHING. Points are summed over RETURNED work only and are shown
 * as "earned of possible"; there is no percent and no letter, because a grade
 * computed here would be a second grade that can disagree with FACTS' weighted
 * categories in front of a parent. The notebook's presence pre-fill is not
 * shown for the same reason.
 */

import {
	completionIsLate,
	itemTitle,
	isScheduled,
	studentWorkChip,
	studentWorkMap,
	type ClassroomItem,
	type SubmissionSummary,
	type WorkChip
} from './classroom';
import { withWorksheetCompletions } from './student-work';
import { isAwaitingGrade } from './feed';
import { hallPassMinutes, type HallPassEntry, type HallPassLimits } from './hall-pass';
import {
	parsePresenceLimits,
	presenceLineKind,
	PRESENCE_LIMITS_FALLBACK,
	type PresenceLimits,
	type PresenceLineKind
} from './presence/state';
import { teamLabel, teamSetEditedWords, type TeamBoardResult } from './teams';
import {
	cellDisplay,
	cellGlyph,
	cellLabel,
	cellIndex,
	sessionsInOrder,
	summarize,
	type CellDisplay,
	type SectionGrid
} from '$lib/notebook-review';
import type { CoinDisplayRow } from '$lib/coin-format';

// ---------------------------------------------------------------------------
// 1. The new read's payload, validated
// ---------------------------------------------------------------------------

/** A coin row as the overview projects it: the public Ledger's columns plus the ids the one renderer needs. */
export type OverviewCoinRow = CoinDisplayRow & { category_kind: string | null };

export interface StudentOverviewPayload {
	sectionId: string;
	studentEmail: string;
	displayName: string;
	active: boolean;
	enrolledAt: string | null;
	hasAccount: boolean;
	userId: string | null;
	at: string | null;
	hallPasses: { total: number; entries: HallPassEntry[]; limits: HallPassLimits | null };
	itemViews: { item_id: string; viewed_at: string }[];
	songs: { requested: number; approved: number; rejected: number; pending: number };
	coins: {
		balance: number;
		physical: number;
		digital: number;
		total: number;
		transactions: OverviewCoinRow[];
	};
	presenceLimits: PresenceLimits;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Record<string, unknown> =>
	v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function hallPassEntry(raw: unknown): HallPassEntry | null {
	const r = obj(raw);
	const pass_id = str(r.pass_id);
	const opened_at = str(r.opened_at);
	const student_email = str(r.student_email);
	if (!pass_id || !opened_at || !student_email || Number.isNaN(Date.parse(opened_at))) return null;
	const closed_at = str(r.closed_at);
	if (closed_at && Number.isNaN(Date.parse(closed_at))) return null;
	return {
		pass_id,
		student_email,
		student_name: str(r.student_name) ?? student_email,
		opened_at,
		closed_at,
		closed_by: str(r.closed_by),
		opened_by: str(r.opened_by)
	};
}

function coinRow(raw: unknown): OverviewCoinRow | null {
	const r = obj(raw);
	const id = str(r.id);
	const category_id = str(r.category_id);
	const created_at = str(r.created_at);
	if (!id || !category_id || !created_at || typeof r.amount !== 'number' || !Number.isFinite(r.amount)) return null;
	return {
		id,
		category_id,
		category_name: str(r.category_name) ?? category_id,
		category_kind: str(r.category_kind),
		amount: r.amount,
		medium: str(r.medium),
		transfer_id: str(r.transfer_id),
		created_at
	};
}

/**
 * `classroom_student_overview`'s answer, or NULL. Every key is checked against
 * its own shape and a malformed ROW is dropped rather than coerced (the
 * preference-read rule, applied to a wire payload): a pass with no time or a
 * coin row with no amount cannot reach a renderer that would print NaN.
 * The function's own NULL (every refusal) is null here too.
 */
export function parseStudentOverview(value: unknown): StudentOverviewPayload | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	const v = value as Record<string, unknown>;
	const sectionId = str(v.section_id);
	const studentEmail = str(v.student_email);
	if (!sectionId || !studentEmail) return null;
	const passes = obj(v.hall_passes);
	const limitsRaw = obj(passes.limits);
	const limits =
		typeof limitsRaw.cooldown_minutes === 'number' && typeof limitsRaw.daily_limit === 'number'
			? { cooldown_minutes: limitsRaw.cooldown_minutes, daily_limit: limitsRaw.daily_limit }
			: null;
	const entries = arr(passes.entries).map(hallPassEntry).filter((e): e is HallPassEntry => e !== null);
	const songs = obj(v.songs);
	const coins = obj(v.coins);
	return {
		sectionId,
		studentEmail,
		displayName: str(v.display_name) ?? studentEmail,
		active: v.active !== false,
		enrolledAt: str(v.enrolled_at),
		hasAccount: v.has_account === true,
		userId: str(v.user_id),
		at: str(v.at),
		hallPasses: { total: Math.max(num(passes.total), entries.length), entries, limits },
		itemViews: arr(v.item_views)
			.map((raw) => {
				const r = obj(raw);
				const item_id = str(r.item_id);
				const viewed_at = str(r.viewed_at);
				return item_id && viewed_at && !Number.isNaN(Date.parse(viewed_at)) ? { item_id, viewed_at } : null;
			})
			.filter((x): x is { item_id: string; viewed_at: string } => x !== null),
		songs: {
			requested: num(songs.requested),
			approved: num(songs.approved),
			rejected: num(songs.rejected),
			pending: num(songs.pending)
		},
		coins: {
			balance: num(coins.balance),
			physical: num(coins.physical_balance),
			digital: num(coins.digital_balance),
			total: num(coins.total),
			transactions: arr(coins.transactions).map(coinRow).filter((c): c is OverviewCoinRow => c !== null)
		},
		presenceLimits: parsePresenceLimits(v.presence_limits)
	};
}

// ---------------------------------------------------------------------------
// 2. The assignments
// ---------------------------------------------------------------------------

/** A submission row as the page selects it, attributed to the one student. */
export interface StudentSubmissionRow extends SubmissionSummary {
	student_email: string;
	submitted_at?: string | null;
	returned_at?: string | null;
	graded_at?: string | null;
}

/** A presence row as the page selects it. */
export interface StudentPresenceRow {
	item_id: string;
	first_seen_at?: string | null;
	last_seen_at?: string | null;
	last_input_at: string | null;
	active_seconds: number;
}

export interface StudentAssignmentRow {
	itemId: string;
	title: string;
	dueAt: string | null;
	points: number | null;
	/** The chip the student reads on their own page: its words, tone and whether it is finished. */
	chip: WorkChip;
	/** False when the item is no longer live for students (a draft, or scheduled ahead) but holds their work. */
	posted: boolean;
	/** When it was turned in (or, for a ported worksheet, finished), or null. */
	turnedInAt: string | null;
	late: boolean;
	/** Handed back with a grade (the row's own `returned` state). */
	returned: boolean;
	/** Released score, only once returned. */
	score: number | null;
	awaitingGrade: boolean;
	/** Presence: whole seconds actively worked, or null with no heartbeat row. */
	activeSeconds: number | null;
	lastWorkedAt: string | null;
	presence: PresenceLineKind;
	/** The last time they opened the item (0085's one row per item), or null with no record. */
	lastOpenedAt: string | null;
}

/**
 * THE ASSIGNMENTS THIS STUDENT IS ASKED FOR, AND ANY THAT HOLD THEIR WORK.
 *
 * Asked for: a published assignment that is live (not scheduled ahead), the
 * filter `nextDueFor` uses. Plus EVERY assignment carrying one of this
 * student's submission rows, whatever its state now: work does not vanish
 * from the page because an item was taken back to a draft, it reads as not
 * posted. Ordered due-first, undated last, then by title.
 */
export function studentAssignmentRows(input: {
	items: readonly ClassroomItem[];
	submissions: readonly StudentSubmissionRow[];
	completions: ReadonlyMap<string, string> | null;
	presence: readonly StudentPresenceRow[];
	/** Did the presence read answer at all? False is "Not known", never "Not opened". */
	presenceLoaded: boolean;
	views: readonly { item_id: string; viewed_at: string }[];
	email: string;
	now: string;
}): StudentAssignmentRow[] {
	const email = input.email.trim().toLowerCase();
	const nowDate = new Date(input.now);
	const mine = input.submissions.filter((s) => (s.student_email ?? '').toLowerCase() === email);
	const withRow = new Set(mine.map((s) => s.item_id));
	const subByItem = new Map(mine.map((s) => [s.item_id, s]));
	const work = studentWorkMap(
		withWorksheetCompletions(mine, input.completions, (item_id, student_email) => ({
			item_id,
			student_email,
			state: 'draft',
			score: null
		}))
	);
	const presence = new Map(input.presence.map((p) => [p.item_id, p]));
	const views = new Map(input.views.map((v) => [v.item_id, v.viewed_at]));

	const rows: StudentAssignmentRow[] = [];
	for (const item of input.items) {
		if (item.kind !== 'assignment') continue;
		const live = item.published && !isScheduled(item, nowDate);
		if (!live && !withRow.has(item.id)) continue;
		const w = work[item.id];
		const sub = subByItem.get(item.id);
		const chip = studentWorkChip(item, w, input.now);
		const p = presence.get(item.id);
		const lastOpenedAt = views.get(item.id) ?? null;
		const turnedInAt =
			sub && (sub.state === 'submitted' || sub.state === 'returned')
				? (sub.submitted_at ?? null)
				: (w?.completedAt ?? null);
		rows.push({
			itemId: item.id,
			title: itemTitle(item),
			dueAt: item.due_at,
			points: item.points,
			chip,
			posted: live,
			turnedInAt,
			late: completionIsLate(item, turnedInAt),
			returned: w?.state === 'returned',
			score: w?.state === 'returned' ? (w.score ?? null) : null,
			awaitingGrade: sub
				? isAwaitingGrade({
						item_id: sub.item_id,
						student_email: sub.student_email,
						state: sub.state === 'returned' || sub.state === 'submitted' ? sub.state : 'draft',
						submitted_at: sub.submitted_at ?? null,
						graded_at: sub.graded_at ?? null,
						completed_at: w?.completedAt ?? null
					})
				: typeof w?.completedAt === 'string',
			activeSeconds: p ? Math.max(0, Math.floor(p.active_seconds ?? 0)) : null,
			lastWorkedAt: p?.last_input_at ?? null,
			/*
			 * AN OPEN RECORD OUTRANKS THE VERDICT EXACTLY AS WORK DOES. 0085's view
			 * row says they opened the item, so "Not opened" beside "Last opened
			 * Sep 3" would be a derived instrument contradicting the record it is
			 * rendered beside; the presence line then says nothing at all.
			 */
			presence: presenceLineKind({
				hasRow: !!p,
				loaded: input.presenceLoaded,
				workArrived: !!w || lastOpenedAt !== null
			}),
			lastOpenedAt
		});
	}
	rows.sort((a, b) => {
		const da = a.dueAt ? Date.parse(a.dueAt) : Number.POSITIVE_INFINITY;
		const db = b.dueAt ? Date.parse(b.dueAt) : Number.POSITIVE_INFINITY;
		if (da !== db) return da - db;
		return a.title.localeCompare(b.title);
	});
	return rows;
}

export interface StudentAssignmentTotals {
	assigned: number;
	done: number;
	missing: number;
	todo: number;
	awaitingGrade: number;
	returned: number;
	/** Over RETURNED work with a score and a points value only. */
	pointsEarned: number;
	pointsPossible: number;
}

/** Counts, and points over returned work. No percent and no letter: the grade of record is FACTS'. */
export function studentAssignmentTotals(rows: readonly StudentAssignmentRow[]): StudentAssignmentTotals {
	let done = 0;
	let missing = 0;
	let awaitingGrade = 0;
	let returned = 0;
	let pointsEarned = 0;
	let pointsPossible = 0;
	for (const r of rows) {
		if (r.chip.done) done++;
		if (r.chip.missing) missing++;
		if (r.awaitingGrade) awaitingGrade++;
		if (r.returned) returned++;
		if (r.score !== null && r.points !== null) {
			pointsEarned += r.score;
			pointsPossible += r.points;
		}
	}
	return {
		assigned: rows.length,
		done,
		missing,
		todo: rows.length - done - missing,
		awaitingGrade,
		returned,
		pointsEarned,
		pointsPossible
	};
}

/** Total active seconds across this class's assignments, or null when presence never answered with a row. */
export function studentWorkingSeconds(rows: readonly StudentAssignmentRow[]): number | null {
	const known = rows.filter((r) => r.activeSeconds !== null);
	return known.length ? known.reduce((sum, r) => sum + (r.activeSeconds ?? 0), 0) : null;
}

// ---------------------------------------------------------------------------
// 3. Hall passes
// ---------------------------------------------------------------------------

export interface StudentHallPassSummary {
	/** Every pass in this class, from the database's own count. */
	total: number;
	/** How many rows the page holds (the newest 500 at most). */
	shown: number;
	/** Whole minutes over the CLOSED passes the page holds, floored per pass. */
	minutesTotal: number;
	longestMinutes: number;
	openNow: boolean;
	/** Passes a teacher sent them on (0174's override marker). */
	overrides: number;
}

/**
 * Counts and minutes, and NOTHING ELSE. There is no threshold, no tone and no
 * "long" flag at any duration (hall-pass.ts: a long absence is a conversation
 * an instructor has, never a number a surface decides is too big).
 */
export function studentHallPassSummary(total: number, entries: readonly HallPassEntry[]): StudentHallPassSummary {
	let minutesTotal = 0;
	let longestMinutes = 0;
	let openNow = false;
	let overrides = 0;
	for (const e of entries) {
		if (e.opened_by) overrides++;
		if (!e.closed_at) {
			openNow = true;
			continue;
		}
		const mins = hallPassMinutes(e.opened_at, Date.parse(e.closed_at));
		minutesTotal += mins;
		if (mins > longestMinutes) longestMinutes = mins;
	}
	return { total: Math.max(total, entries.length), shown: entries.length, minutesTotal, longestMinutes, openNow, overrides };
}

// ---------------------------------------------------------------------------
// 4. The notebook
// ---------------------------------------------------------------------------

export interface StudentCheckInRow {
	sessionId: string;
	date: string;
	label: string;
	unit: number;
	display: CellDisplay;
	glyph: string;
	word: string;
}

export interface StudentNotebookSummary {
	covered: number;
	total: number;
	excused: number;
	scheduled: number;
	flagged: number;
	freeEntries: number;
	checkIns: StudentCheckInRow[];
}

/**
 * THE ONE STUDENT'S ROW OF THE CLASS GRID, and none of anybody else's. The
 * figures are `summarize`'s, read for this student alone, WITHOUT
 * `presenceScore`: that is the Documentation Check's points pre-fill, a
 * grade-like figure this page does not show. Each check-in carries the grid's
 * own glyph AND word (`CELL_STATES`), never colour alone.
 */
export function studentNotebook(grid: SectionGrid | null, email: string, userId: string | null): StudentNotebookSummary | null {
	if (!grid) return null;
	const key = email.trim().toLowerCase();
	const student = grid.students.find(
		(s) =>
			(s.email ?? '').toLowerCase() === key ||
			s.student_key.toLowerCase() === key ||
			(userId !== null && s.id === userId)
	);
	if (!student) return null;
	const summary = summarize({ ...grid, students: [student] })[0];
	const index = cellIndex(grid);
	const checkIns: StudentCheckInRow[] = [];
	for (const session of sessionsInOrder(grid.sessions)) {
		const cell = index.get(`${student.student_key}|${session.id}`);
		if (!cell) continue;
		const display = cellDisplay(cell);
		checkIns.push({
			sessionId: session.id,
			date: session.session_date,
			label: session.session_label,
			unit: session.unit_number,
			display,
			glyph: cellGlyph(display),
			word: cellLabel(display)
		});
	}
	return {
		covered: summary.covered,
		total: summary.total,
		excused: summary.excused,
		scheduled: summary.scheduled,
		flagged: summary.flagged,
		freeEntries: student.free_entries ?? 0,
		checkIns
	};
}

// ---------------------------------------------------------------------------
// 5. Teams
// ---------------------------------------------------------------------------

export interface StudentTeamRow {
	setId: string;
	label: string;
	createdAt: string;
	posted: boolean;
	teamName: string;
	/** How many on the team. A count, never a name. */
	size: number;
	edited: string | null;
}

/**
 * Every saved draw this student is on, as the draw's label, the team's own
 * name and its size. NO MEMBER NAME AND NO MEMBER ADDRESS LEAVES THIS
 * FUNCTION, the student's own included: the page is handed to a parent, and a
 * teammate's name is the teammate's data.
 */
export function studentTeams(board: TeamBoardResult | null, email: string): StudentTeamRow[] {
	if (!board || !board.ok) return [];
	const key = email.trim().toLowerCase();
	const out: StudentTeamRow[] = [];
	for (const set of board.sets) {
		const team = set.teams.find((t) => t.members.some((m) => m.student_email.toLowerCase() === key));
		if (!team) continue;
		out.push({
			setId: set.id,
			label: set.label,
			createdAt: set.created_at,
			posted: set.showing,
			teamName: teamLabel(team),
			size: team.members.length,
			edited: teamSetEditedWords(set)
		});
	}
	return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// ---------------------------------------------------------------------------
// 6. The whole page
// ---------------------------------------------------------------------------

/** Whether one source answered. `unavailable` is a database without the read yet; `error` is any other failure. */
export type SourceState = 'ready' | 'unavailable' | 'error';

export interface StudentMaterialRow {
	itemId: string;
	title: string;
	kind: 'post' | 'material';
	lastOpenedAt: string | null;
}

export interface StudentIdeaCadDoc {
	id: string;
	itemId: string | null;
	itemTitle: string | null;
	title: string;
	updatedAt: string | null;
	archived: boolean;
}

export interface StudentFoundryApp {
	id: string;
	slug: string;
	title: string;
}

export interface StudentPageData {
	student: {
		email: string;
		display_name: string;
		active: boolean;
		avatar: string | null;
		avatar_url: string | null;
		/** Null when the overview read could not say. */
		has_account: boolean | null;
		enrolled_at: string | null;
	};
	/** The overview read's own instant, or the load's clock. */
	at: string;
	sources: {
		overview: SourceState;
		submissions: boolean;
		presence: boolean;
		completions: boolean;
		notebook: SourceState;
		notebookEntries: boolean;
		teams: SourceState;
		ideacad: boolean;
		foundry: boolean;
	};
	assignments: StudentAssignmentRow[];
	totals: StudentAssignmentTotals;
	workingSeconds: number | null;
	presenceLimits: PresenceLimits;
	materials: StudentMaterialRow[];
	notebook: StudentNotebookSummary | null;
	/** Class days in a row with a turned-in entry, or null when the entries read could not answer. */
	streak: number | null;
	/** Turned-in entries filed to this class. */
	entriesFiled: number | null;
	hallPasses: {
		summary: StudentHallPassSummary;
		entries: HallPassEntry[];
		limits: HallPassLimits | null;
	} | null;
	teams: StudentTeamRow[];
	coins: {
		balance: number;
		physical: number;
		digital: number;
		total: number;
		rows: CoinDisplayRow[];
		kinds: Record<string, string>;
	} | null;
	songs: StudentOverviewPayload['songs'] | null;
	ideacad: StudentIdeaCadDoc[];
	foundry: StudentFoundryApp[];
	/** `/foundry/author/<uuid>`, or null with no account. */
	foundryAuthorHref: string | null;
}

/** The raw reads, as the route made them. Every field is the read's own answer, already attributed to the one student. */
export interface StudentPageInputs {
	email: string;
	roster: { display_name: string; active: boolean; avatar?: string | null; avatar_url?: string | null };
	items: readonly ClassroomItem[];
	now: string;
	overview: { state: SourceState; value: StudentOverviewPayload | null };
	submissions: StudentSubmissionRow[] | null;
	presence: StudentPresenceRow[] | null;
	completions: ReadonlyMap<string, string> | null;
	grid: { state: SourceState; value: SectionGrid | null };
	/** The streak and the entry count, computed by the caller from turned-in entries, or null when the read failed. */
	streak: number | null;
	entriesFiled: number | null;
	board: TeamBoardResult | null;
	ideacad: { id: string; item_id: string | null; title: string | null; updated_at: string | null; archived_at: string | null }[] | null;
	foundry: { id: string; slug: string; title: string }[] | null;
}

export function buildStudentPage(input: StudentPageInputs): StudentPageData {
	const email = input.email.trim().toLowerCase();
	const ov = input.overview.state === 'ready' ? input.overview.value : null;
	const views = ov?.itemViews ?? [];
	const titles = new Map(input.items.map((i) => [i.id, itemTitle(i)]));
	const assignments = studentAssignmentRows({
		items: input.items,
		submissions: input.submissions ?? [],
		completions: input.completions,
		presence: input.presence ?? [],
		presenceLoaded: input.presence !== null,
		views,
		email,
		now: input.now
	});
	const nowDate = new Date(input.now);
	const viewMap = new Map(views.map((v) => [v.item_id, v.viewed_at]));
	const materials: StudentMaterialRow[] = input.items
		.filter((i) => (i.kind === 'material' || i.kind === 'post') && i.published && !isScheduled(i, nowDate))
		.map((i) => ({
			itemId: i.id,
			title: itemTitle(i),
			kind: i.kind as 'post' | 'material',
			lastOpenedAt: viewMap.get(i.id) ?? null
		}));
	const kinds: Record<string, string> = {};
	for (const row of ov?.coins.transactions ?? []) if (row.category_kind) kinds[row.category_id] = row.category_kind;
	const userId = ov?.userId ?? null;
	return {
		student: {
			email,
			display_name: ov?.displayName ?? input.roster.display_name,
			active: ov ? ov.active : input.roster.active,
			avatar: input.roster.avatar ?? null,
			avatar_url: input.roster.avatar_url ?? null,
			has_account: ov ? ov.hasAccount : null,
			enrolled_at: ov?.enrolledAt ?? null
		},
		at: ov?.at ?? input.now,
		sources: {
			overview: input.overview.state,
			submissions: input.submissions !== null,
			presence: input.presence !== null,
			completions: input.completions !== null,
			notebook: input.grid.state,
			notebookEntries: input.streak !== null,
			teams: input.board === null ? 'error' : input.board.ok ? 'ready' : input.board.reason === 'unavailable' ? 'unavailable' : 'error',
			ideacad: input.ideacad !== null,
			foundry: input.foundry !== null
		},
		assignments,
		totals: studentAssignmentTotals(assignments),
		workingSeconds: studentWorkingSeconds(assignments),
		presenceLimits: ov?.presenceLimits ?? PRESENCE_LIMITS_FALLBACK,
		materials,
		notebook: input.grid.state === 'ready' ? studentNotebook(input.grid.value, email, userId) : null,
		streak: input.streak,
		entriesFiled: input.entriesFiled,
		hallPasses: ov
			? {
					summary: studentHallPassSummary(ov.hallPasses.total, ov.hallPasses.entries),
					entries: ov.hallPasses.entries,
					limits: ov.hallPasses.limits
				}
			: null,
		teams: studentTeams(input.board, email),
		coins: ov
			? {
					balance: ov.coins.balance,
					physical: ov.coins.physical,
					digital: ov.coins.digital,
					total: ov.coins.total,
					rows: ov.coins.transactions.map(({ category_kind: _k, ...row }) => row),
					kinds
				}
			: null,
		songs: ov?.songs ?? null,
		ideacad: (input.ideacad ?? []).map((d) => ({
			id: d.id,
			itemId: d.item_id,
			itemTitle: d.item_id ? (titles.get(d.item_id) ?? null) : null,
			title: (d.title ?? '').trim() || (d.item_id ? (titles.get(d.item_id) ?? 'Untitled model') : 'Untitled model'),
			updatedAt: d.updated_at,
			archived: !!d.archived_at
		})),
		foundry: (input.foundry ?? []).map((a) => ({ id: a.id, slug: a.slug, title: a.title })),
		foundryAuthorHref: userId ? `/foundry/author/${encodeURIComponent(userId)}` : null
	};
}

/** A gallery entry's address, the gallery's own `?app=` shape. */
export function foundryAppHref(slug: string): string {
	return `/foundry?app=${encodeURIComponent(slug)}`;
}

/** The sentence a source that could not answer says, in words, where its section would be. */
export const STUDENT_OVERVIEW_PENDING_NOTE =
	'Hall passes, coins, music requests and opened items appear here after the next database update.';
export const STUDENT_OVERVIEW_ERROR_NOTE = 'Could not load hall passes, coins, music requests and opened items just now.';
