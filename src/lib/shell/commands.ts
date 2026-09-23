/**
 * EVERY CLASSROOM AND NOTEBOOK ACTION, REGISTERED ONCE.
 *
 * Each command has a stable id, the name a person reads, a 24x24 icon path, a
 * one-line description, the ROLE that may use it, the CONTEXT it applies to,
 * an optional default shortcut, keywords for search, and exactly one way to
 * happen: an `href` it navigates to, or a runtime handler the surface that can
 * do it registers under the same id (`./command-handlers.ts`). The palette,
 * the shortcut legend, the settings panel's own door and (later) row menus and
 * tooltips read THIS list; nothing hard-codes a tool list twice.
 *
 * IDS ARE STABLE. A recent pick is stored as `cmd:<id>` on the device
 * (`$lib/preferences/classroom`), so a command is renamed by its `name`, never
 * by its `id` -- the IdeaCAD registry's rule, for the same reason.
 *
 * THE TWO CONSOLES' KEYS ARE HERE BY IMPORT, NOT BY COPY. `GRADE_KEYS`
 * (`$lib/classroom/grading-keys`) and `REVIEW_KEYS` (`$lib/notebook-review`)
 * are the arrays those consoles DISPATCH from; each binding becomes one
 * `legend` command whose name and keys are read off the binding itself. A key
 * that stops working in a console therefore stops being listed here in the
 * same edit, and nothing about what a key does moved.
 *
 * SHORTCUTS ARE ALWAYS OPTIONAL. Every command is reachable by name from the
 * palette and from a visible control; a key is a faster path for somebody who
 * already knows it, never the only one.
 *
 * ROLE IS PRESENTATION, NEVER THE GATE. A manager-only command is not offered
 * to a student because offering it would be a control whose only outcome is a
 * 404; the routes and the RPCs behind every one of them re-check who is
 * asking, exactly as the section tabs do.
 *
 * Pure and client-safe: no Svelte, no Supabase, no DOM.
 */
import { GRADE_KEYS } from '$lib/classroom/grading-keys';
import { REVIEW_KEYS } from '$lib/notebook-review';
import { sectionTabs, type SectionTabId } from '$lib/classroom/nav';
import type { KeyBinding } from './keys';

export type CommandRole = 'any' | 'student' | 'manager';
export type CommandContext = 'global' | 'class' | 'item' | 'student' | 'selection';
/** Which screen the palette was opened on. */
export type CommandSurface = 'classroom' | 'grading' | 'notebook' | 'notebook-review';

export interface CommandEnv {
	/** The viewer's role HERE: `manager` when they manage the class on screen (or are staff outside one). */
	role: 'student' | 'manager';
	surface: CommandSurface;
	sectionId: string | null;
	itemId: string | null;
	/** The open item's kind, when one is open. */
	itemKind?: string | null;
	/** Where classroom links are built from; a dev harness passes its own. */
	basePath: string;
	isStaff?: boolean;
	isAdmin?: boolean;
	/** Command ids some mounted surface can run right now (`./command-handlers.ts`). */
	handlers: ReadonlySet<string>;
}

export interface ShellCommand {
	id: string;
	name: string;
	/** A 24x24 SVG path, stroked in currentColor. */
	icon: string;
	/** One line, read in the palette row and in a tooltip. */
	description: string;
	role: CommandRole;
	context: CommandContext;
	/** Screens it applies on; absent means every classroom and notebook screen. */
	surfaces?: readonly CommandSurface[];
	/** The default shortcut, as printed. */
	keys?: string;
	keywords?: readonly string[];
	/** Staff-only doors (courses and setup), on top of the role. */
	requires?: 'staff' | 'admin';
	/** A further condition on the environment, such as "the open item is an assignment". */
	when?: (env: CommandEnv) => boolean;
	/** Where it goes. Null means it has nowhere to go here, and it is not offered. */
	href?: (env: CommandEnv) => string | null;
	/** It runs in place, through the handler a surface registered under this id. */
	run?: true;
	/** A key a console answers to: listed in the shortcut legend, never run from the palette. */
	legend?: true;
}

/* -------------------------------------------------------------------------
 * ICONS: 24x24 stroke paths, the repo's mark convention.
 * ---------------------------------------------------------------------- */

export const ICONS = {
	search: 'M10.5 4a6.5 6.5 0 1 0 0 13a6.5 6.5 0 0 0 0-13zM20 20l-4.8-4.8',
	home: 'M3 11.5L12 4l9 7.5M5.5 10v10h13V10',
	classes: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
	notebook: 'M6 3h11a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6zM6 3v18M10 8h5M10 12h5',
	updates: 'M12 4a5.5 5.5 0 0 0-5.5 5.5V13l-2 3h15l-2-3V9.5A5.5 5.5 0 0 0 12 4zM10 19a2 2 0 0 0 4 0',
	settings: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4',
	keyboard: 'M3 7h18v10H3zM7 10.5h.01M11 10.5h.01M15 10.5h.01M8 14h8',
	people: 'M9 11a3 3 0 1 0 0-6a3 3 0 0 0 0 6zM3.5 20a5.5 5.5 0 0 1 11 0M16 5.2a3 3 0 0 1 0 5.6M20.5 20a5.5 5.5 0 0 0-3.5-5.1',
	grades: 'M5 20V11M11 20V5M17 20v-6M3 20h18',
	duplicates: 'M9 9h11v11H9zM5 15V4h11',
	checkIns: 'M9 3.5h6v3H9zM7 5H5v16h14V5h-2M9 13.5l2 2 4-4',
	plus: 'M12 5v14M5 12h14',
	filter: 'M4 5h16l-6.5 8v6l-3-1.5V13z',
	clear: 'M6 6l12 12M18 6L6 18',
	missing: 'M12 8.5v4.5M12 16.5h.01M10.3 4.2L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z',
	todo: 'M12 3.5a8.5 8.5 0 1 0 0 17a8.5 8.5 0 0 0 0-17zM12 8v4l2.5 2.5',
	done: 'M5 12.5l4.5 4.5L19 7.5',
	draft: 'M4 20h4L19 9l-4-4L4 16zM13 7l4 4',
	assignment: 'M7 3.5h8l3 3V20.5H7zM15 3.5v3h3M10 12h5M10 15.5h5',
	material: 'M5 4.5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H5zM19 4.5h-6M19 4.5v13h-6',
	post: 'M4 6h16v10H9l-5 4z',
	unit: 'M4 6h16M4 12h16M4 18h10',
	student: 'M12 11a3.5 3.5 0 1 0 0-7a3.5 3.5 0 0 0 0 7zM5 20.5a7 7 0 0 1 14 0',
	grade: 'M5 19l4-1 10-10-3-3L6 15zM14 7l3 3',
	admin: 'M12 9a3 3 0 1 0 0 6a3 3 0 0 0 0-6zM12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1'
} as const;

/* -------------------------------------------------------------------------
 * THE REGISTRY
 * ---------------------------------------------------------------------- */

/** A section tab's href, read off `sectionTabs` so a command and a tab cannot point two ways. */
function tabHref(id: SectionTabId) {
	return (env: CommandEnv): string | null =>
		env.sectionId ? (sectionTabs(env.sectionId, env.basePath).find((t) => t.id === id)?.href ?? null) : null;
}

const CORE: readonly ShellCommand[] = [
	{
		id: 'palette.open',
		name: 'Search and commands',
		icon: ICONS.search,
		description: 'Find an item, a unit, a class or an action by name.',
		role: 'any',
		context: 'global',
		keys: 'Ctrl K',
		keywords: ['find', 'jump', 'go to', 'command'],
		legend: true
	},
	{
		id: 'palette.shortcuts',
		name: 'Keyboard shortcuts',
		icon: ICONS.keyboard,
		description: 'Every key this screen answers to.',
		role: 'any',
		context: 'global',
		keys: '?',
		keywords: ['keys', 'help', 'hotkeys'],
		run: true
	},
	{
		id: 'settings.open',
		name: 'Classroom settings',
		icon: ICONS.settings,
		description: 'Density, the view a class opens on, and a reset for each.',
		role: 'any',
		context: 'global',
		keywords: ['preferences', 'customize', 'density', 'compact', 'options'],
		run: true
	},
	{
		id: 'go.home',
		name: 'Home',
		icon: ICONS.home,
		description: 'The portal home page.',
		role: 'any',
		context: 'global',
		keywords: ['portal', 'dashboard', 'start'],
		href: () => '/'
	},
	{
		id: 'go.classes',
		name: 'All my classes',
		icon: ICONS.classes,
		description: 'Every class you are in or teach.',
		role: 'any',
		context: 'global',
		keywords: ['classroom', 'courses', 'sections'],
		href: (env) => env.basePath
	},
	{
		id: 'go.notebook',
		name: 'My notebook',
		icon: ICONS.notebook,
		description: 'Your notebook entries and check-ins.',
		role: 'student',
		context: 'global',
		keywords: ['entries', 'photos', 'check-in', 'journal'],
		href: () => '/notebook'
	},
	{
		id: 'go.updates',
		name: 'Classroom updates',
		icon: ICONS.updates,
		description: 'What changed in IDEA Classroom lately.',
		role: 'any',
		context: 'global',
		keywords: ['changelog', 'news', 'new'],
		href: (env) => `${env.basePath}/updates`
	},
	{
		id: 'go.admin',
		name: 'Courses and setup',
		icon: ICONS.admin,
		description: 'Courses, sections and rosters.',
		role: 'manager',
		context: 'global',
		requires: 'staff',
		keywords: ['admin', 'roster', 'import', 'sections'],
		href: (env) => `${env.basePath}/admin`
	},
	{
		id: 'class.stream',
		name: 'Class page',
		icon: ICONS.classes,
		description: 'This class, unit by unit.',
		role: 'any',
		context: 'class',
		keywords: ['stream', 'units', 'items', 'classwork'],
		href: tabHref('class')
	},
	{
		id: 'class.people',
		name: 'People',
		icon: ICONS.people,
		description: 'The roster, hall pass and teams for this class.',
		role: 'manager',
		context: 'class',
		keywords: ['roster', 'students', 'enrollment', 'teams'],
		href: tabHref('people')
	},
	{
		id: 'class.grades',
		name: 'Grades',
		icon: ICONS.grades,
		description: 'Every assignment in this class and what is left to grade.',
		role: 'manager',
		context: 'class',
		keywords: ['marks', 'scores', 'to grade', 'gradebook'],
		href: tabHref('grades')
	},
	{
		id: 'class.duplicates',
		name: 'Duplicates',
		icon: ICONS.duplicates,
		description: 'Drafts that repeat something already posted.',
		role: 'manager',
		context: 'class',
		keywords: ['copies', 'repeated'],
		href: tabHref('duplicates')
	},
	{
		id: 'class.check-ins',
		name: 'Check-ins',
		icon: ICONS.checkIns,
		description: 'The notebook review for this class.',
		role: 'manager',
		context: 'class',
		keywords: ['notebook', 'review', 'entries'],
		href: tabHref('check-ins')
	},
	{
		id: 'class.new-post',
		name: 'New post',
		icon: ICONS.plus,
		description: 'An announcement, an assignment or a material.',
		role: 'manager',
		context: 'class',
		keywords: ['create', 'announcement', 'assignment', 'material', 'compose'],
		run: true
	},
	{
		id: 'class.search',
		name: 'Search this class',
		icon: ICONS.filter,
		description: 'Narrow the class page by name, unit, kind or file.',
		role: 'any',
		context: 'class',
		keys: '/',
		keywords: ['filter', 'find'],
		run: true
	},
	{
		id: 'class.show-todo',
		name: 'Show what is left to do',
		icon: ICONS.todo,
		description: 'Assignments you have not turned in that are not past due.',
		role: 'student',
		context: 'class',
		keywords: ['to do', 'todo', 'assigned', 'filter'],
		run: true
	},
	{
		id: 'class.show-missing',
		name: 'Show missing work',
		icon: ICONS.missing,
		description: 'Assignments past their due date that were not turned in.',
		role: 'student',
		context: 'class',
		keywords: ['late', 'overdue', 'missing', 'filter'],
		run: true
	},
	{
		id: 'class.show-done',
		name: 'Show finished work',
		icon: ICONS.done,
		description: 'Assignments you turned in or got back.',
		role: 'student',
		context: 'class',
		keywords: ['done', 'submitted', 'returned', 'filter'],
		run: true
	},
	{
		id: 'class.show-assignments',
		name: 'Show assignments only',
		icon: ICONS.assignment,
		description: 'Hide announcements, materials and check-ins.',
		role: 'any',
		context: 'class',
		keywords: ['homework', 'filter'],
		run: true
	},
	{
		id: 'class.show-drafts',
		name: 'Show drafts',
		icon: ICONS.draft,
		description: 'Items students cannot see yet.',
		role: 'manager',
		context: 'class',
		keywords: ['unpublished', 'hidden', 'filter'],
		run: true
	},
	{
		id: 'class.clear-filters',
		name: 'Clear filters',
		icon: ICONS.clear,
		description: 'Show everything in this class again.',
		role: 'any',
		context: 'class',
		keywords: ['reset', 'show all', 'everything'],
		run: true
	},
	{
		id: 'item.grade',
		name: 'Grade this assignment',
		icon: ICONS.grade,
		description: 'Open the grading console for the item you are reading.',
		role: 'manager',
		context: 'item',
		keywords: ['score', 'return', 'rubric', 'grading'],
		when: (env) => env.itemKind === 'assignment',
		href: (env) =>
			env.sectionId && env.itemId ? `${env.basePath}/${env.sectionId}/item/${env.itemId}/grade` : null
	}
];

/** A console key binding as a legend command: the binding's own words, never retyped. */
function keyCommands<A extends string>(
	prefix: string,
	bindings: readonly KeyBinding<A>[],
	context: CommandContext,
	surface: CommandSurface
): ShellCommand[] {
	return bindings.map((b) => ({
		id: `${prefix}.${b.action ?? b.keys.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
		name: b.label,
		icon: ICONS.keyboard,
		description: b.native ? `${b.label}, the browser's own key.` : `${b.label}.`,
		role: 'manager',
		context,
		surfaces: [surface],
		keys: b.keys,
		legend: true
	}));
}

export const COMMANDS: readonly ShellCommand[] = [
	...CORE,
	...keyCommands('grade', GRADE_KEYS, 'student', 'grading'),
	...keyCommands('review', REVIEW_KEYS, 'selection', 'notebook-review')
];

export const COMMAND_IDS: readonly string[] = COMMANDS.map((c) => c.id);

export function commandById(id: string): ShellCommand | null {
	return COMMANDS.find((c) => c.id === id) ?? null;
}

/* -------------------------------------------------------------------------
 * WHO GETS WHAT, WHERE
 * ---------------------------------------------------------------------- */

/** The role rule, and the only one: `any` is everybody, the other two are exactly that role. */
export function roleAllows(role: CommandRole, viewer: CommandEnv['role']): boolean {
	return role === 'any' || role === viewer;
}

/** Whether the command's context exists on the screen the palette is open on. */
export function contextApplies(cmd: ShellCommand, env: CommandEnv): boolean {
	if (cmd.surfaces && !cmd.surfaces.includes(env.surface)) return false;
	switch (cmd.context) {
		case 'global':
			return true;
		case 'class':
			return !!env.sectionId;
		case 'item':
			return !!env.sectionId && !!env.itemId;
		case 'student':
			return env.surface === 'grading';
		case 'selection':
			return env.surface === 'notebook-review';
	}
}

/** Every command this viewer may see on this screen: role, context, staff door and condition. Legend rows included. */
export function commandsFor(env: CommandEnv, commands: readonly ShellCommand[] = COMMANDS): ShellCommand[] {
	return commands.filter(
		(c) =>
			roleAllows(c.role, env.role) &&
			contextApplies(c, env) &&
			(c.requires !== 'staff' || !!env.isStaff || !!env.isAdmin) &&
			(c.requires !== 'admin' || !!env.isAdmin) &&
			(!c.when || c.when(env))
	);
}

/**
 * THE PALETTE'S ACTIONS: the commands above that can HAPPEN here. A link with
 * nowhere to go and a run command no mounted surface can run are not offered,
 * because a row whose only outcome is nothing is the defect, and a legend row
 * is a key to press on its own screen rather than a thing to run.
 */
export function runnableCommands(env: CommandEnv, commands: readonly ShellCommand[] = COMMANDS): ShellCommand[] {
	return commandsFor(env, commands).filter((c) => {
		if (c.legend) return false;
		if (c.href) return c.href(env) !== null;
		if (c.run) return env.handlers.has(c.id);
		return false;
	});
}

/** THE SHORTCUT LEGEND for this screen: every command with a key, in registry order. */
export function shortcutLegend(env: CommandEnv, commands: readonly ShellCommand[] = COMMANDS): ShellCommand[] {
	return commandsFor(env, commands).filter((c) => !!c.keys);
}

/** The modifier word for a platform: the Command key on a Mac, Ctrl everywhere else. */
export function modKeyLabel(platform: string | null | undefined): string {
	return /mac|iphone|ipad/i.test(platform ?? '') ? '⌘' : 'Ctrl';
}

/** A registry key string as this viewer's keyboard spells it. */
export function keysFor(keys: string, platform: string | null | undefined): string {
	return keys.replace(/\bCtrl\b/, modKeyLabel(platform));
}

/**
 * IS THIS KEY PRESS THE PALETTE'S? Ctrl+K or Cmd+K, nothing else held. The
 * typing guard is the caller's (`isTypingTarget`), so a rich-text editor's own
 * Ctrl+K and a search box keep theirs.
 */
export function isPaletteChord(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }): boolean {
	return (!!event.ctrlKey || !!event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k';
}

/** IS THIS THE LEGEND KEY? `?` with no Ctrl, Cmd or Alt (Shift is how the key is typed). */
export function isLegendKey(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean }): boolean {
	return event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Which screen a pathname is, for the legend and the context filter. Only the
 * review console itself is `notebook-review`: a student's notebook opened from
 * it (`/notebook/review/student/...`) is a notebook, and answers none of the
 * console's keys.
 */
export function surfaceFor(pathname: string, basePath = '/classroom'): CommandSurface {
	const path = pathname.replace(/\/+$/, '');
	if (path === '/notebook/review') return 'notebook-review';
	if (/^\/notebook(\/|$)/.test(path)) return 'notebook';
	if (path.startsWith(basePath) && /\/item\/[^/]+\/grade$/.test(path)) return 'grading';
	return 'classroom';
}
