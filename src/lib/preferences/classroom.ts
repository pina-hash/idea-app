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
 *   grading   ACCOUNT. How somebody grades (advance after Return) is the same at
 *                      any desk. Carried for the grading package to read; no
 *                      surface reads it yet, so the settings panel does not offer
 *                      it (a control whose only outcome is nothing is not offered).
 *   guidance  ACCOUNT. A hint retired or a tour finished on one computer must not
 *                      come back on the next one. Carried for the learnability
 *                      package; not offered in the panel yet, for the same reason.
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

export const TOUR_STATES = ['unseen', 'finished', 'dismissed'] as const;
export type TourState = (typeof TOUR_STATES)[number];

export const RECENT_MAX = 20;
export const RETIRED_HINTS_MAX = 200;
/**
 * A recent pick's key: `cmd:`, `class:`, `unit:` or `item:` and an id. NEVER a
 * student: an email in a device slot on a shared school computer is a roster
 * left behind, so `@` picks are not remembered.
 */
const RECENT_KEY = /^(cmd|class|unit|item):[A-Za-z0-9._-]{1,120}$/;
const HINT_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export interface ClassroomPreferences {
	display: { density: Density };
	classView: { opensOn: ClassOpensOn };
	grading: { advanceAfterReturn: boolean };
	guidance: { retiredHints: string[]; tour: TourState };
	search: { recent: string[] };
}
export type ClassroomPreferenceGroup = keyof ClassroomPreferences;

export const CLASSROOM_PREFERENCE_HOMES: Readonly<Record<ClassroomPreferenceGroup, PreferenceHome>> = {
	display: 'device',
	classView: 'account',
	grading: 'account',
	guidance: 'account',
	search: 'device'
};

export function defaultClassroomPreferences(): ClassroomPreferences {
	return {
		display: { density: 'comfortable' },
		classView: { opensOn: 'all' },
		grading: { advanceAfterReturn: false },
		guidance: { retiredHints: [], tour: 'unseen' },
		search: { recent: [] }
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
	return {
		display: { density: oneOf(display.density, DENSITIES, d.display.density) },
		classView: { opensOn: oneOf(classView.opensOn, CLASS_OPENS_ON, d.classView.opensOn) },
		grading: { advanceAfterReturn: bool(grading.advanceAfterReturn, d.grading.advanceAfterReturn) },
		guidance: {
			retiredHints:
				stringList(guidance.retiredHints, (s) => HINT_ID.test(s), RETIRED_HINTS_MAX) ??
				d.guidance.retiredHints,
			tour: oneOf(guidance.tour, TOUR_STATES, d.guidance.tour)
		},
		search: { recent: stringList(search.recent, (s) => RECENT_KEY.test(s), RECENT_MAX) ?? d.search.recent }
	};
}

export const CLASSROOM_PREFERENCE_SCHEMA: PreferenceSchema<ClassroomPreferences> = {
	groups: ['display', 'classView', 'grading', 'guidance', 'search'],
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
 * listed; `grading` and `guidance` join this list in the bundle that wires a
 * reader for them.
 * ---------------------------------------------------------------------- */

export type SettingRole = 'student' | 'manager';

export interface SettingOption<V extends string> {
	value: V;
	label: string;
}

export interface ChoiceSetting {
	group: ClassroomPreferenceGroup;
	/** The group's heading on the panel. */
	title: string;
	/** Who is offered it. A student has no instructor surfaces to make compact. */
	roles: readonly SettingRole[];
	/** The field and the choices, per role (the class-view choices differ by role). */
	field: string;
	options: (role: SettingRole) => readonly SettingOption<string>[];
}

export const CLASSROOM_SETTINGS: readonly ChoiceSetting[] = [
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
	}
];

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
