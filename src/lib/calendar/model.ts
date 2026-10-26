/**
 * THE IDEA CALENDAR'S MODEL (ledger 0439): the layers, the one event shape every
 * source is turned into, a viewer's choices, and the day arithmetic the month,
 * the list and the "this week" strip share.
 *
 * Pure and client-safe. It reads no clock: every function takes the day it
 * answers about, and the loader reads the clock once (the school-calendar rule).
 * Days are `YYYY-MM-DD` in America/Los_Angeles, through
 * `$lib/classroom/school-calendar`, the one place the school's days are made.
 *
 * WHERE EACH LAYER COMES FROM:
 *   school     the Bosco Tech calendar, read by the server from its iCalendar
 *              feed (`$lib/server/calendar/feeds`), never stored
 *   classes    the database (0308): a post on the day it opens, its due date
 *   pacing     the database: an assignment's day-by-day plan (spec section 17)
 *   team       the database: the viewer's own team's tasks and the sign-offs
 *   no_school  the database: the site's no-school days (0303)
 *   idea       the database: IDEA program events an admin adds
 *   robotics   the database (events an admin adds) and the Techmen app's feed
 */
import { dayIndex, schoolDayPlus, schoolWeekday } from '$lib/classroom/school-calendar';
import { TEAM_CHECKPOINT_WORDS } from '$lib/classroom/team-plan';

export type CalendarLayer = 'school' | 'classes' | 'pacing' | 'team' | 'no_school' | 'idea' | 'robotics';

export interface CalendarLayerInfo {
	id: CalendarLayer;
	label: string;
	/** One line on what the layer holds, for the toggle's title and the legend. */
	describe: string;
	/**
	 * ITS IDENTITY COLOUR, each anchored to a meaning the site already gives it
	 * (idea-design skill, "Color by content"): the school's own calendar is the
	 * neutral base (`--ice`); a deadline is a warning (`--amber`); pacing is work
	 * in progress (`--teal`); a team is the special group (`--violet`); a day
	 * with no school is quiet (`--dim`); an IDEA event is a special callout
	 * (`--gold`); robotics is FIRST's own blue, the `--frc-blue` the FRC room
	 * already carries (`src/lib/frc/frc-theme.css`). It marks identity only, on
	 * a stripe or a swatch; status keeps the site's meanings.
	 */
	color: string;
}

export const CALENDAR_LAYERS: readonly CalendarLayerInfo[] = [
	{ id: 'classes', label: 'Classes', describe: 'Posts and due dates in your classes', color: 'var(--amber)' },
	{ id: 'pacing', label: 'Pacing', describe: 'What to have done by each class day', color: 'var(--teal)' },
	{ id: 'team', label: 'Team', describe: "Your team's tasks and sign-offs", color: 'var(--violet)' },
	{ id: 'school', label: 'Bosco Tech', describe: 'The school calendar', color: 'var(--ice)' },
	{ id: 'no_school', label: 'No school', describe: 'Days with no classes', color: 'var(--dim)' },
	{ id: 'idea', label: 'IDEA', describe: 'IDEA program events', color: 'var(--gold)' },
	{ id: 'robotics', label: 'Robotics', describe: 'FRC Team 5669 events', color: 'var(--frc-blue, #0066b3)' }
];

export const CALENDAR_LAYER_IDS: readonly CalendarLayer[] = CALENDAR_LAYERS.map((l) => l.id);

export function isCalendarLayer(v: unknown): v is CalendarLayer {
	return typeof v === 'string' && (CALENDAR_LAYER_IDS as readonly string[]).includes(v);
}

export function layerInfo(id: CalendarLayer): CalendarLayerInfo {
	return CALENDAR_LAYERS.find((l) => l.id === id) ?? CALENDAR_LAYERS[0];
}

/** What kind of thing an event is, inside its layer. */
export type CalendarEventKind = 'open' | 'due' | 'pacing' | 'signoff' | 'task' | 'no_school' | 'event' | 'external';

export interface CalendarEvent {
	id: string;
	layer: CalendarLayer;
	kind: CalendarEventKind;
	title: string;
	/** The first day, YYYY-MM-DD. */
	day: string;
	/** The last day, inclusive, for an event over several days; null for one day. */
	endDay: string | null;
	/** Wall-clock times in Los Angeles, HH:MM; null for an all-day event. */
	startTime: string | null;
	endTime: string | null;
	/** An exact instant (a due date), when the event has one. */
	at: string | null;
	location: string | null;
	notes: string | null;
	sectionIds: string[];
	itemId: string | null;
	itemTitle: string | null;
	/** A post a teacher scheduled that students cannot see yet. */
	scheduled: boolean;
	/** A sign-off's state for the viewer's team (`approved`, `open`, ...), or a task's. */
	state: string | null;
	owner: string | null;
	mine: boolean;
	blocked: boolean;
	gate: string | null;
	/** A program event's own id, for an admin's edit. */
	eventId: string | null;
	stepId: string | null;
}

export interface CalendarSection {
	id: string;
	label: string;
	block: string | null;
	course: string;
	courseTitle: string;
	teaches: boolean;
}

/** A viewer's choices: the layers and the classes they switched off. Everything is on by default. */
export interface CalendarPrefs {
	hidden: CalendarLayer[];
	hiddenSections: string[];
}

export const DEFAULT_CALENDAR_PREFS: CalendarPrefs = { hidden: [], hiddenSections: [] };

export interface CalendarFeed {
	today: string;
	from: string;
	to: string;
	sections: CalendarSection[];
	events: CalendarEvent[];
	prefs: CalendarPrefs;
	/** The viewer has a subscription link. */
	link: boolean;
	admin: boolean;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (v: unknown): v is string => typeof v === 'string' && DAY_RE.test(v) && dayIndex(v) !== null;

/**
 * A VIEWER'S STORED CHOICES, read against the union: an unknown layer or a
 * value that is not a uuid-shaped string is dropped, so a stored value can
 * never put the page in a state no branch renders (the preferences rule).
 */
export function readCalendarPrefs(raw: unknown): CalendarPrefs {
	if (!isObject(raw)) return { hidden: [], hiddenSections: [] };
	const hidden = Array.isArray(raw.hidden) ? [...new Set(raw.hidden.filter(isCalendarLayer))] : [];
	const hiddenSections = Array.isArray(raw.hiddenSections)
		? [...new Set(raw.hiddenSections.filter((s): s is string => typeof s === 'string' && /^[0-9a-f-]{36}$/i.test(s)))]
		: [];
	return { hidden, hiddenSections };
}

/** The namespace value to store: undefined when everything is back on (sparse storage). */
export function storedCalendarPrefs(prefs: CalendarPrefs): CalendarPrefs | undefined {
	return prefs.hidden.length || prefs.hiddenSections.length ? prefs : undefined;
}

/** One event as the database or the server sent it, or null when it cannot be drawn. */
export function readCalendarEvent(raw: unknown): CalendarEvent | null {
	if (!isObject(raw)) return null;
	const id = str(raw.id);
	const title = str(raw.title);
	if (!id || !title || !isCalendarLayer(raw.layer) || !isDay(raw.day)) return null;
	const endDay = isDay(raw.end_day) && raw.end_day > raw.day ? raw.end_day : null;
	const time = (v: unknown) => (typeof v === 'string' && /^\d{2}:\d{2}$/.test(v) ? v : null);
	return {
		id,
		layer: raw.layer,
		kind: (typeof raw.kind === 'string' ? raw.kind : 'event') as CalendarEventKind,
		title,
		day: raw.day,
		endDay,
		startTime: time(raw.start_time),
		endTime: time(raw.end_time),
		at: str(raw.at),
		location: str(raw.location),
		notes: str(raw.notes),
		sectionIds: Array.isArray(raw.section_ids) ? raw.section_ids.filter((s): s is string => typeof s === 'string') : [],
		itemId: str(raw.item_id),
		itemTitle: str(raw.item_title),
		scheduled: raw.scheduled === true,
		state: str(raw.state),
		owner: str(raw.owner),
		mine: raw.mine === true,
		blocked: raw.blocked === true,
		gate: str(raw.gate),
		eventId: str(raw.event_id),
		stepId: str(raw.step_id)
	};
}

/** The database's answer (`calendar_feed`, `calendar_feed_by_token`), or null when it is not one. */
export function parseCalendarFeed(raw: unknown): CalendarFeed | null {
	if (!isObject(raw) || raw.ok !== true || !isDay(raw.today)) return null;
	const sections: CalendarSection[] = Array.isArray(raw.sections)
		? raw.sections.filter(isObject).map((s) => ({
				id: String(s.id),
				label: String(s.label ?? ''),
				block: str(s.block),
				course: String(s.course ?? ''),
				courseTitle: String(s.course_title ?? ''),
				teaches: s.teaches === true
			}))
		: [];
	const events = Array.isArray(raw.events)
		? raw.events.map(readCalendarEvent).filter((e): e is CalendarEvent => e !== null)
		: [];
	return {
		today: raw.today,
		from: isDay(raw.from) ? raw.from : raw.today,
		to: isDay(raw.to) ? raw.to : raw.today,
		sections,
		events,
		prefs: readCalendarPrefs(raw.prefs),
		link: raw.link === true,
		admin: raw.admin === true
	};
}

/** The section a class event belongs to on this page, for its label and its link. */
export function sectionLabel(section: CalendarSection): string {
	return [section.course, section.label].filter(Boolean).join(' ');
}

/**
 * THE EVENTS A VIEWER SEES: every layer they left on, and from the classes
 * they left on. `scope` narrows to one class (a class's own calendar): an event
 * tied to classes shows only when it is tied to that one; the school, the
 * no-school days and the program layers still show, since they are everyone's.
 */
export function visibleEvents(events: readonly CalendarEvent[], prefs: CalendarPrefs, scope: string | null = null): CalendarEvent[] {
	const hidden = new Set(prefs.hidden);
	const off = new Set(prefs.hiddenSections);
	return events.filter((e) => {
		if (hidden.has(e.layer)) return false;
		if (!e.sectionIds.length) return true;
		if (scope) return e.sectionIds.includes(scope);
		return e.sectionIds.some((s) => !off.has(s));
	});
}

/** Sort: by day, all-day events before timed ones, then by time, layer order and title. */
export function sortEvents(events: readonly CalendarEvent[]): CalendarEvent[] {
	const order = (l: CalendarLayer) => CALENDAR_LAYER_IDS.indexOf(l);
	return [...events].sort(
		(a, b) =>
			a.day.localeCompare(b.day) ||
			(a.startTime ?? '').localeCompare(b.startTime ?? '') ||
			order(a.layer) - order(b.layer) ||
			a.title.localeCompare(b.title)
	);
}

/** Merge two lists, the first's event winning on a repeated id. */
export function mergeEvents(...lists: (readonly CalendarEvent[])[]): CalendarEvent[] {
	const seen = new Set<string>();
	const out: CalendarEvent[] = [];
	for (const list of lists) {
		for (const e of list) {
			if (seen.has(e.id)) continue;
			seen.add(e.id);
			out.push(e);
		}
	}
	return sortEvents(out);
}

/** True when an event is on a day (a multi-day event is on every day it spans). */
export function eventOnDay(e: CalendarEvent, day: string): boolean {
	return e.day <= day && (e.endDay ?? e.day) >= day;
}

/**
 * ONE DAY'S EVENTS, WHAT A STUDENT OWES FIRST: class work, pacing and the team,
 * then the program's events, then the school's own. A day cell shows three, so
 * the order is what decides whether a due date is on screen or behind "+5".
 */
const DAY_PRIORITY: readonly CalendarLayer[] = ['classes', 'pacing', 'team', 'idea', 'robotics', 'no_school', 'school'];

export function eventsOnDay(events: readonly CalendarEvent[], day: string): CalendarEvent[] {
	const rank = (e: CalendarEvent) => (e.kind === 'due' ? -1 : DAY_PRIORITY.indexOf(e.layer));
	return events
		.filter((e) => eventOnDay(e, day))
		.sort((a, b) => rank(a) - rank(b) || (a.startTime ?? '').localeCompare(b.startTime ?? '') || a.title.localeCompare(b.title));
}

/** A day is a no-school day on this list. */
export function isNoSchoolDay(events: readonly CalendarEvent[], day: string): boolean {
	return events.some((e) => e.kind === 'no_school' && eventOnDay(e, day));
}

// ---------------------------------------------------------------------------
// Days, months and weeks.
// ---------------------------------------------------------------------------

const MONTH_RE = /^(\d{4})-(\d{2})$/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** The grid's column heads, Sunday first (the week `weekOffset` counts in). */
export const WEEK_HEADS: readonly string[] = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

/** `YYYY-MM` for a day. */
export function monthOf(day: string): string {
	return day.slice(0, 7);
}

/** A month key read from a query, or null. */
export function readMonth(v: string | null | undefined): string | null {
	if (!v) return null;
	const m = MONTH_RE.exec(v);
	if (!m) return null;
	const month = Number(m[2]);
	return month >= 1 && month <= 12 && Number(m[1]) >= 2000 && Number(m[1]) <= 2100 ? v : null;
}

/** The month `n` months after `month`. */
export function monthPlus(month: string, n: number): string {
	const m = MONTH_RE.exec(month);
	if (!m) return month;
	const total = Number(m[1]) * 12 + (Number(m[2]) - 1) + Math.trunc(n);
	return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** "November 2026". */
export function monthWords(month: string): string {
	const m = MONTH_RE.exec(month);
	return m ? `${MONTHS_LONG[Number(m[2]) - 1]} ${m[1]}` : month;
}

/** "Nov 2", and "Nov 2, 2027" when the year is not `thisYear`. Never a weekday. */
export function dayWords(day: string, thisYear: string | null = null): string {
	const [y, m, d] = day.split('-');
	const base = `${MONTHS[Number(m) - 1]} ${Number(d)}`;
	return thisYear && y !== thisYear ? `${base}, ${y}` : base;
}

/** "Oct 30 to Nov 1", or one day's words. */
export function spanWords(e: Pick<CalendarEvent, 'day' | 'endDay'>, thisYear: string | null = null): string {
	return e.endDay ? `${dayWords(e.day, thisYear)} to ${dayWords(e.endDay, thisYear)}` : dayWords(e.day, thisYear);
}

/** "8:00 AM" from "08:00". */
export function timeWords(hhmm: string): string {
	const [h, m] = hhmm.split(':').map(Number);
	const suffix = h >= 12 ? 'PM' : 'AM';
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** What to print beside an event's title for its time. */
export function eventTimeWords(e: CalendarEvent): string | null {
	if (e.kind === 'due') return 'Due';
	if (e.startTime) return e.endTime ? `${timeWords(e.startTime)} to ${timeWords(e.endTime)}` : timeWords(e.startTime);
	return null;
}

/** The first and last day of the six-row grid a month is drawn on (Sunday to Saturday). */
export function monthGridBounds(month: string): { from: string; to: string } {
	const first = `${month}-01`;
	const lead = schoolWeekday(first) ?? 0;
	const from = schoolDayPlus(first, -lead) ?? first;
	return { from, to: schoolDayPlus(from, 41) ?? first };
}

/** The month's grid: weeks of days, only as many rows as the month needs. */
export function monthGrid(month: string): string[][] {
	const { from } = monthGridBounds(month);
	const weeks: string[][] = [];
	for (let w = 0; w < 6; w++) {
		const week: string[] = [];
		for (let d = 0; d < 7; d++) week.push(schoolDayPlus(from, w * 7 + d) ?? from);
		if (w > 0 && monthOf(week[0]) !== month) break;
		weeks.push(week);
	}
	return weeks;
}

/**
 * THE SCHOOL WEEK THE STRIP SHOWS: Monday to Friday of this week, or of the
 * next one on a Saturday or a Sunday, the evening a student asks what is coming.
 */
export function schoolWeek(today: string): string[] {
	const wd = schoolWeekday(today) ?? 1;
	const monday = wd === 0 ? schoolDayPlus(today, 1) : wd === 6 ? schoolDayPlus(today, 2) : schoolDayPlus(today, 1 - wd);
	const start = monday ?? today;
	return [0, 1, 2, 3, 4].map((n) => schoolDayPlus(start, n) ?? start);
}

/**
 * WHERE AN EVENT OPENS, or null when it is not a page: a post's item page in
 * a class the viewer has it in, and a team event's plan page.
 */
export function eventHref(e: CalendarEvent, basePath = '/classroom'): string | null {
	const section = e.sectionIds[0];
	if (!section) return null;
	if (e.kind === 'task' || e.kind === 'signoff') return `${basePath}/${section}/plan`;
	if (e.itemId) return `${basePath}/${section}/item/${e.itemId}`;
	return null;
}

/** The words a sign-off's or a task's state reads as, or null. */
export function eventStateWords(e: CalendarEvent): string | null {
	// A sign-off's words are the team plan's own (`TEAM_CHECKPOINT_WORDS`).
	if (e.kind === 'signoff') return e.state ? (TEAM_CHECKPOINT_WORDS[e.state] ?? null) : null;
	if (e.kind === 'task') return e.blocked ? 'Blocked' : e.mine ? 'Yours' : e.owner ? e.owner : 'No owner yet';
	if (e.scheduled) return 'Scheduled';
	return null;
}
