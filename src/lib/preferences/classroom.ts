/**
 * THE CLASSROOM'S PREFERENCES: the groups, where each one lives, and why.
 *
 * Stored under `profiles.preferences.classroom` (the account groups) and one
 * `localStorage` slot per viewer (the device groups). NO MIGRATION: 0020 made
 * `preferences` a `jsonb not null default '{}'` with no CHECK, and 0001's
 * own-row update policy is the whole write gate, exactly as `homepage`,
 * `classroomFeed` and `classroomUnits` already rely on. `classroom` was an
 * unused key when this was written (the namespaces in use were homepage,
 * classroomFeed, classroomUnits, coinDesk, dashboard and ideacad).
 *
 * WHERE EACH GROUP LIVES, AND THE REASON, BESIDE IT (`CLASSROOM_PREFERENCE_HOMES`):
 *
 *   display   DEVICE.  The right density depends on the screen in front of the
 *                      teacher, not on the teacher: the projector at the wall and
 *                      the laptop at the desk want different answers from the same
 *                      person, the same reason the theme is per device.
 *   classView ACCOUNT. Which filter a class opens on is a working habit, not a
 *                      property of a screen; it should greet a student the same
 *                      way on a phone and on a lab computer.
 *   grading   ACCOUNT. How somebody grades is the same at any desk. The order
 *                      the Grades tab lists by is read (ledger 0297, LEARN);
 *                      `advanceAfterReturn` is STILL READ BY NOTHING, so the
 *                      panel does not offer it (a control whose only outcome is
 *                      nothing is not offered) and it stays in the schema only so
 *                      the grading package can wire it without a second schema.
 *   guidance  ACCOUNT. A hint retired or a tour finished on one computer must not
 *                      come back on the next one. The classroom walkthroughs read
 *                      and write it (`$lib/tour/classroom-tours`), so the panel
 *                      offers it: whether each tour was offered, and a Reset that
 *                      makes it offer itself again.
 *   search    DEVICE.  The palette's recent picks are written on every use. In the
 *                      profile row that is a write per palette run -- the shape the
 *                      launcher's per-open usage write had, which is what fed the
 *                      measured clobber -- and what was picked on the projector is
 *                      not what should rank first on a phone. It holds command,
 *                      class, unit and item keys only, never a student.
 *
 * A COMMENT BANK HAS ROOM HERE WITHOUT A MIGRATION: it would be one more
 * ACCOUNT group. Every store writes only the groups that changed, merged into
 * the namespace as it stands, so a group added by a later build survives an
 * older build's write (`./store.ts`, group-level merge). Its costs are the
 * ones the Phase 0 audit named: it ships in every page payload, it is per
 * account (not shared between two teachers), and it needs a size cap on read.
 */
import { GRADING_ORDER_DEFAULT, GRADING_ORDER_OPTIONS, type GradingOrderKey } from '$lib/classroom/grading-order';
import { TODO_VIEW_LABELS, type TodoView } from '$lib/classroom/todo';
import {
	LocalPreferenceStore,
	MemoryPreferenceStore,
	ProfilePreferenceStore,
	RoutedPreferenceStore,
	type PreferenceHome,
	type PreferenceSchema,
	type PreferenceStorage,
	type PreferenceStore,
	type ProfileNamespaceWriter
} from './store';

export const CLASSROOM_PREFERENCES_NAMESPACE = 'classroom';
/** One slot per viewer, namespaced beside the classroom's other device keys (`idea:classnav-collapsed:1:`). */
export const CLASSROOM_LOCAL_PREFERENCES_PREFIX = 'idea:classroom-prefs:1:';

export const DENSITIES = ['comfortable', 'compact'] as const;
export type Density = (typeof DENSITIES)[number];

/**
 * WHICH STATUS FILTER A CLASS OPENS ON. The union is every value either role
 * can choose; `classOpensOnFor` maps one that does not apply to the viewer's
 * role (a stored `todo` read by somebody who now manages the class) back to
 * `all`, so it always resolves to something the viewer can change.
 */
export const CLASS_OPENS_ON = ['all', 'todo', 'missing', 'drafts'] as const;
export type ClassOpensOn = (typeof CLASS_OPENS_ON)[number];

/**
 * WHERE A WALKTHROUGH STANDS FOR ONE PERSON (ledger 0297, LEARN). `offered` is
 * written the moment the first-visit offer is shown, which is what makes it
 * offered ONCE: it is never shown again for any state but `unseen`, whether the
 * person answered it or walked away (`shouldOfferTour` in
 * `$lib/tour/classroom-tours`). `finished` and `dismissed` record how a run
 * ended; neither re-offers. Reset puts it back to `unseen`.
 */
export const TOUR_STATES = ['unseen', 'offered', 'finished', 'dismissed'] as const;
export type TourState = (typeof TOUR_STATES)[number];

/**
 * THE TWO CLASSROOM WALKTHROUGHS, each with its own state, because one person
 * can be both: a teacher who is also enrolled in somebody else's class is
 * offered the student tour there and the teacher tour in their own. The step
 * lists live in `$lib/tour/classroom-tours`; the ids live here because the
 * schema validates them.
 */
export const CLASSROOM_TOUR_IDS = ['teacher', 'student'] as const;
export type ClassroomTourId = (typeof CLASSROOM_TOUR_IDS)[number];

/**
 * THE LIST PANE'S WIDTH beside something open, in rem (ledger 0297, LEARN).
 * Null is the layout's own width (`--measure-nav`, 26rem), which is what every
 * surface still gets until somebody drags the separator. The clamp is what
 * the layout supports: below 18rem a class row's title wraps to three lines,
 * above 40rem the item beside it is under half of a 1366px screen, and
 * split.css keeps the item at least 32rem wide at any window width on top of
 * this. Whole rem only, so the keyboard step and the stored value agree.
 */
export const NAV_WIDTH_MIN_REM = 18;
export const NAV_WIDTH_MAX_REM = 40;
export const NAV_WIDTH_DEFAULT_REM = 26;
export const NAV_WIDTH_STEP_REM = 1;

/** A stored or typed width to a value the split can render: a whole rem in range, or null (the default). */
export function clampNavWidth(value: unknown): number | null {
	if (typeof value !== 'number' || !Number.isFinite(value)) return null;
	const whole = Math.round(value);
	if (whole < NAV_WIDTH_MIN_REM) return NAV_WIDTH_MIN_REM;
	if (whole > NAV_WIDTH_MAX_REM) return NAV_WIDTH_MAX_REM;
	return whole === NAV_WIDTH_DEFAULT_REM ? null : whole;
}

/** The width a surface draws: the stored value, or the default. */
export function navWidthRem(stored: number | null): number {
	return stored ?? NAV_WIDTH_DEFAULT_REM;
}

/**
 * THE ORDER THE GRADES TAB LISTS BY, remembered as a DEFAULT (ledger 0297,
 * LEARN). Read off `GRADING_ORDER_OPTIONS` so a new order is one entry there.
 * A sort is remembered from the control itself because it reorders and hides
 * nothing; a FILTER (the to-do's view, the class page's chips) is remembered
 * only when chosen in Settings, because a remembered filter hides work.
 */
export const GRADES_ORDERS: readonly GradingOrderKey[] = GRADING_ORDER_OPTIONS.map((o) => o.key);

/**
 * WHICH VIEW THE TO-DO OPENS ON, as a default chosen in Settings. `done` is not
 * offered: a to-do that opens on finished work is one that hides what is owed.
 * The class filter beside it is never remembered at all -- a to-do reopening on
 * one class is how the rest of a student's missing work drops out of view,
 * which is the "remembered entry" CLAUDE.md forbids.
 */
export const TODO_OPENS_ON = ['assigned', 'missing'] as const satisfies readonly TodoView[];
export type TodoOpensOn = (typeof TODO_OPENS_ON)[number];

export const RECENT_MAX = 20;
export const RETIRED_HINTS_MAX = 200;
/**
 * A recent pick's key: `cmd:`, `class:`, `unit:` or `item:` and an id. NEVER a
 * student: an email in a device slot on a shared school computer is a roster
 * left behind, so `@` picks are not remembered.
 */
const RECENT_KEY = /^(cmd|class|unit|item):[A-Za-z0-9._-]{1,120}$/;

/**
 * THE NEXT-STEP COMMENTS A REVIEWER STARTS WITH (ledger 0297, research B1 and
 * B5): checkmark-only notebook feedback produced no growth, and one specific
 * next step did. Plain sentences a student can act on at the next entry; the
 * reviewer edits the list and it is theirs from then on.
 */
export const NOTEBOOK_COMMENT_SEEDS: readonly string[] = [
	'Date every entry.',
	'Show why this iteration failed.',
	'State the next test you will run.',
	'Label the parts of your sketch.'
];
export const NOTEBOOK_COMMENT_MAX = 12;
export const NOTEBOOK_COMMENT_LENGTH = 200;
export const LAST_LOOKED_MAX = 60;
const CLASS_KEY = /^[A-Za-z0-9._-]{1,64}$/;
const HINT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface ClassroomPreferences {
	display: { density: Density; navWidth: number | null };
	classView: { opensOn: ClassOpensOn; todoOpensOn: TodoOpensOn };
	grading: { advanceAfterReturn: boolean; gradesOrder: GradingOrderKey };
	guidance: { retiredHints: string[]; tours: Record<ClassroomTourId, TourState> };
	search: { recent: string[] };
	/**
	 * THE REVIEWER'S NOTEBOOK REVIEW DEFAULTS (ledger 0297, package F4b), both
	 * per reviewer and so on the account. `lastLooked` is when this reviewer
	 * last opened a class's approve queue, keyed by class id, and is what "new
	 * since you last looked" measures from: a DEFAULT about where to start, never
	 * a record about any entry. `comments` is the reviewer's own list of
	 * next-step comments offered as chips, seeded with notebook practice and
	 * edited in place.
	 */
	notebookReview: { lastLooked: Record<string, string>; comments: string[] };
}
export type ClassroomPreferenceGroup = keyof ClassroomPreferences;

export const CLASSROOM_PREFERENCE_HOMES: Readonly<Record<ClassroomPreferenceGroup, PreferenceHome>> = {
	display: 'device',
	classView: 'account',
	grading: 'account',
	guidance: 'account',
	search: 'device',
	notebookReview: 'account'
};

export function defaultClassroomPreferences(): ClassroomPreferences {
	return {
		display: { density: 'comfortable', navWidth: null },
		classView: { opensOn: 'all', todoOpensOn: 'assigned' },
		grading: { advanceAfterReturn: false, gradesOrder: GRADING_ORDER_DEFAULT },
		guidance: { retiredHints: [], tours: { teacher: 'unseen', student: 'unseen' } },
		search: { recent: [] },
		notebookReview: { lastLooked: {}, comments: [...NOTEBOOK_COMMENT_SEEDS] }
	};
}

const isObject = (v: unknown): v is Record<string, unknown> =>
	!!v && typeof v === 'object' && !Array.isArray(v);
const oneOf = <T extends string>(v: unknown, list: readonly T[], d: T): T =>
	typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : d;
const bool = (v: unknown, d: boolean) => (typeof v === 'boolean' ? v : d);
function stringList(v: unknown, keep: (s: string) => boolean, max: number): string[] | null {
	if (!Array.isArray(v)) return null;
	const out: string[] = [];
	for (const s of v) if (typeof s === 'string' && keep(s) && !out.includes(s) && out.length < max) out.push(s);
	return out;
}

/** A stored `preferences.classroom` (or device slot) to values the classroom can render. */
export function readClassroomPreferences(raw: unknown): ClassroomPreferences {
	const d = defaultClassroomPreferences();
	const r = isObject(raw) ? raw : {};
	const display = isObject(r.display) ? r.display : {};
	const classView = isObject(r.classView) ? r.classView : {};
	const grading = isObject(r.grading) ? r.grading : {};
	const guidance = isObject(r.guidance) ? r.guidance : {};
	const search = isObject(r.search) ? r.search : {};
	const review = isObject(r.notebookReview) ? r.notebookReview : {};
	return {
		display: {
			density: oneOf(display.density, DENSITIES, d.display.density),
			// Out of range is clamped rather than dropped: somebody who dragged the
			// list as wide as it went meant "wide", and a later, tighter clamp
			// should keep them at its own widest rather than snapping them back.
			navWidth: clampNavWidth(display.navWidth)
		},
		classView: {
			opensOn: oneOf(classView.opensOn, CLASS_OPENS_ON, d.classView.opensOn),
			todoOpensOn: oneOf(classView.todoOpensOn, TODO_OPENS_ON, d.classView.todoOpensOn)
		},
		grading: {
			advanceAfterReturn: bool(grading.advanceAfterReturn, d.grading.advanceAfterReturn),
			gradesOrder: oneOf(grading.gradesOrder, GRADES_ORDERS, d.grading.gradesOrder)
		},
		guidance: {
			retiredHints:
				stringList(guidance.retiredHints, (s) => HINT_ID.test(s), RETIRED_HINTS_MAX) ??
				d.guidance.retiredHints,
			tours: readTours(guidance.tours)
		},
		search: { recent: stringList(search.recent, (s) => RECENT_KEY.test(s), RECENT_MAX) ?? d.search.recent },
		notebookReview: {
			lastLooked: readLastLooked(review.lastLooked),
			comments:
				stringList(
					review.comments,
					(s) => s.trim().length > 0 && s.length <= NOTEBOOK_COMMENT_LENGTH,
					NOTEBOOK_COMMENT_MAX
				) ?? d.notebookReview.comments
		}
	};
}

/**
 * Each known tour's state; an unknown tour id or an unknown state is dropped to
 * `unseen`. A pre-LEARN `guidance.tour` (a single state F3F5 reserved and no
 * build ever wrote) is ignored rather than guessed at: nothing can tell which
 * tour it would have meant.
 */
function readTours(v: unknown): Record<ClassroomTourId, TourState> {
	const r = isObject(v) ? v : {};
	const out = {} as Record<ClassroomTourId, TourState>;
	for (const id of CLASSROOM_TOUR_IDS) out[id] = oneOf(r[id], TOUR_STATES, 'unseen');
	return out;
}

/** Class id -> ISO instant; anything else is dropped, newest kept first. */
function readLastLooked(v: unknown): Record<string, string> {
	if (!isObject(v)) return {};
	const pairs = Object.entries(v).filter(
		([k, at]) => CLASS_KEY.test(k) && typeof at === 'string' && !Number.isNaN(Date.parse(at))
	) as [string, string][];
	pairs.sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]));
	return Object.fromEntries(pairs.slice(0, LAST_LOOKED_MAX));
}

export const CLASSROOM_PREFERENCE_SCHEMA: PreferenceSchema<ClassroomPreferences> = {
	groups: ['display', 'classView', 'grading', 'guidance', 'search', 'notebookReview'],
	defaults: defaultClassroomPreferences,
	read: readClassroomPreferences
};

/** The recent list after picking `key`: it moves to the front, capped, and a key that is not rememberable is not remembered. */
export function recordRecentPick(recent: readonly string[], key: string): string[] {
	if (!RECENT_KEY.test(key)) return [...recent];
	return [key, ...recent.filter((r) => r !== key)].slice(0, RECENT_MAX);
}

/** The filter a class opens on FOR THIS VIEWER: a choice that does not apply to their role reads as `all`. */
export function classOpensOnFor(opensOn: ClassOpensOn, canManage: boolean): ClassOpensOn {
	if (canManage) return opensOn === 'drafts' ? 'drafts' : 'all';
	return opensOn === 'todo' || opensOn === 'missing' ? opensOn : 'all';
}

/**
 * THE ATTRIBUTE THE CLASSROOM ROOT CARRIES, and the named class an
 * INSTRUCTOR-ONLY surface carries on its own root. Together they are the whole
 * contract a compact-density stylesheet keys on:
 *
 *   .cr-root[data-density='compact'] .cr-instructor-surface ...
 *
 * `IDEA_INTERFACE_STANDARDS` 10: the 24px floor is a property a surface
 * DECLARES in a named class on its own root, never one a bundle asserts about
 * it. A surface without `cr-instructor-surface` is student-facing for that rule
 * and stays at 44px whatever the density says. This package provides the
 * preference, the attribute and the class; styling compact density is the
 * layout package's.
 */
export const DENSITY_ATTRIBUTE = 'data-density';
export const INSTRUCTOR_SURFACE_CLASS = 'cr-instructor-surface';

/* -------------------------------------------------------------------------
 * WHAT THE SETTINGS PANEL OFFERS. Only settings a surface actually reads are
 * listed (ledger 0297, LEARN, moved several in): the list width the split
 * reads, the view the to-do opens on, the order the Grades tab lists by, the
 * tours' state and the notebook review's defaults. `grading.advanceAfterReturn`
 * is still read by nothing and is still not offered.
 *
 * THE PANEL IS ONE SECTION PER GROUP, because Reset is per group: a group that
 * holds two settings (density and the list width) gets one Reset that puts
 * both back, and says so by sitting under one heading.
 * ---------------------------------------------------------------------- */

export type SettingRole = 'student' | 'manager';

export interface SettingOption<V extends string> {
	value: V;
	label: string;
}

interface SettingBase {
	group: ClassroomPreferenceGroup;
	/** The setting's own label, under its group's heading. */
	title: string;
	/** Who is offered it. A student has no instructor surfaces to make compact. */
	roles: readonly SettingRole[];
}

/** A radio group over one field. */
export interface ChoiceSetting extends SettingBase {
	kind?: 'choice';
	/** The field and the choices, per role (the class-view choices differ by role). */
	field: string;
	options: (role: SettingRole) => readonly SettingOption<string>[];
}

/** The list pane's width: Narrower and Wider, the single-pointer twin of the split's separator. */
export interface WidthSetting extends SettingBase {
	kind: 'width';
	field: 'navWidth';
}

/** A group whose value is not chosen here, only read out and reset (recent picks, a tour's state). */
export interface SummarySetting extends SettingBase {
	kind: 'summary';
	summary: (p: ClassroomPreferences, role: SettingRole) => string;
}

export type ClassroomSetting = ChoiceSetting | WidthSetting | SummarySetting;

/** Each group's heading on the panel. */
export const CLASSROOM_GROUP_TITLES: Readonly<Record<ClassroomPreferenceGroup, string>> = {
	display: 'Display',
	classView: 'Where things open',
	grading: 'Grading',
	guidance: 'Tours',
	search: 'Recent searches',
	notebookReview: 'Notebook review'
};

/** A tour's state, in words, for the panel. */
export const TOUR_STATE_WORDS: Readonly<Record<TourState, string>> = {
	unseen: 'Not offered yet',
	offered: 'Offered',
	finished: 'Taken',
	dismissed: 'Skipped'
};

/** The width a list is drawn at, in words: how far from the standard width, in steps. */
export function navWidthWords(stored: number | null): string {
	const delta = navWidthRem(stored) - NAV_WIDTH_DEFAULT_REM;
	if (delta === 0) return 'Standard';
	const n = Math.abs(delta);
	return `${n} ${n === 1 ? 'step' : 'steps'} ${delta > 0 ? 'wider' : 'narrower'}`;
}

export const CLASSROOM_SETTINGS: readonly ClassroomSetting[] = [
	{
		group: 'display',
		title: 'Density',
		roles: ['manager'],
		field: 'density',
		options: () => [
			{ value: 'comfortable', label: 'Comfortable' },
			{ value: 'compact', label: 'Compact' }
		]
	},
	{
		kind: 'width',
		group: 'display',
		title: 'List width',
		roles: ['student', 'manager'],
		field: 'navWidth'
	},
	{
		group: 'classView',
		title: 'A class opens on',
		roles: ['student', 'manager'],
		field: 'opensOn',
		options: (role) =>
			role === 'manager'
				? [
						{ value: 'all', label: 'Everything' },
						{ value: 'drafts', label: 'Drafts' }
					]
				: [
						{ value: 'all', label: 'Everything' },
						{ value: 'todo', label: 'To do' },
						{ value: 'missing', label: 'Missing' }
					]
	},
	{
		group: 'classView',
		title: 'To-do opens on',
		// A teacher has no to-do page (the door is handed to a viewer who is not staff).
		roles: ['student'],
		field: 'todoOpensOn',
		options: () => TODO_OPENS_ON.map((v) => ({ value: v, label: TODO_VIEW_LABELS[v] }))
	},
	{
		group: 'grading',
		title: 'Grades lists by',
		roles: ['manager'],
		field: 'gradesOrder',
		options: () => GRADING_ORDER_OPTIONS.map((o) => ({ value: o.key, label: o.label }))
	},
	{
		kind: 'summary',
		group: 'guidance',
		title: 'Classroom tour',
		roles: ['student', 'manager'],
		summary: (p, role) => TOUR_STATE_WORDS[p.guidance.tours[role === 'manager' ? 'teacher' : 'student']]
	},
	{
		kind: 'summary',
		group: 'notebookReview',
		title: 'Next steps and last looked',
		roles: ['manager'],
		summary: (p) => {
			const c = p.notebookReview.comments.length;
			const l = Object.keys(p.notebookReview.lastLooked).length;
			return `${c} ${c === 1 ? 'next step' : 'next steps'} · last looked in ${l} ${l === 1 ? 'class' : 'classes'}`;
		}
	},
	{
		kind: 'summary',
		group: 'search',
		title: 'Remembered picks',
		roles: ['student', 'manager'],
		summary: (p) => {
			const n = p.search.recent.length;
			return `${n} ${n === 1 ? 'pick remembered' : 'picks remembered'}`;
		}
	}
];

/** The settings a role is offered, one entry per group in schema order, each with its settings. */
export function settingsForRole(
	role: SettingRole
): { group: ClassroomPreferenceGroup; title: string; settings: ClassroomSetting[] }[] {
	const out: { group: ClassroomPreferenceGroup; title: string; settings: ClassroomSetting[] }[] = [];
	for (const group of CLASSROOM_PREFERENCE_SCHEMA.groups) {
		const settings = CLASSROOM_SETTINGS.filter((s) => s.group === group && s.roles.includes(role));
		if (settings.length) out.push({ group, title: CLASSROOM_GROUP_TITLES[group], settings });
	}
	return out;
}

/** The panel's word for where a group lives, so nobody has to guess which choices follow them. */
export function homeLabel(group: ClassroomPreferenceGroup): string {
	return CLASSROOM_PREFERENCE_HOMES[group] === 'device' ? 'This device' : 'Your account';
}

/** Whether a group differs from its defaults, which is when its Reset does something. */
export function groupIsDefault(p: ClassroomPreferences, group: ClassroomPreferenceGroup): boolean {
	return JSON.stringify(p[group]) === JSON.stringify(defaultClassroomPreferences()[group]);
}

/* -------------------------------------------------------------------------
 * CONSTRUCTION
 * ---------------------------------------------------------------------- */

export interface ClassroomPreferenceBackends {
	/** The viewer's id, for the device slot's key. Null (signed out, a harness) uses the anonymous slot. */
	viewer: string | null;
	/** The account namespace as the page loaded it, and the writer that reads-then-merges into the row. Null keeps account groups in memory for the session. */
	account: { initial: unknown; writer: ProfileNamespaceWriter } | null;
	/** Storage override for tests; undefined uses this browser's localStorage. */
	storage?: PreferenceStorage | null;
}

export function classroomLocalKey(viewer: string | null): string {
	return `${CLASSROOM_LOCAL_PREFERENCES_PREFIX}${viewer ?? 'anon'}`;
}

/**
 * The classroom's store: device groups in this browser, account groups in the
 * profile row. With no account backend (signed out, a dev harness) the account
 * groups live in memory for the session rather than being refused, so the panel
 * still works and simply forgets on reload.
 */
export function createClassroomPreferences(
	backends: ClassroomPreferenceBackends
): PreferenceStore<ClassroomPreferences> {
	const device = new LocalPreferenceStore(
		CLASSROOM_PREFERENCE_SCHEMA,
		classroomLocalKey(backends.viewer),
		backends.storage
	);
	const account = backends.account
		? new ProfilePreferenceStore(
				CLASSROOM_PREFERENCE_SCHEMA,
				backends.account.initial,
				backends.account.writer
			)
		: new MemoryPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA);
	return new RoutedPreferenceStore(CLASSROOM_PREFERENCE_SCHEMA, CLASSROOM_PREFERENCE_HOMES, {
		device,
		account
	});
}
