/**
 * WHAT THE COMMAND PALETTE LISTS, built from data the page already loaded.
 *
 * Rows come from five places and nothing here fetches: the class layout's
 * items and units, the shell's own class list (`navSections`), the student's
 * own check-ins for this class, the registry's actions (`./commands.ts`)
 * filtered by role and context, and -- on a screen that can open one -- the
 * notebook's entries. A manager's `@` rows are the roster, which the shell
 * loads on demand through a transport it was handed; a student has no `@`.
 *
 * A PREFIX NARROWS, NO PREFIX SEARCHES EVERYTHING:
 *   `#`  items and units      `@`  students (managers)      `>`  actions
 * The prefix is a filter on the kinds, never a different search, so typing
 * `#truss` and typing `truss` rank the same item the same way.
 *
 * Pure: no Svelte, no Supabase, no DOM, no clock.
 */
import {
	classGroups,
	itemKindLabel,
	itemTitle,
	formatDue,
	sortUnits,
	type ClassroomItem,
	type ClassroomSection,
	type ClassroomUnit
} from '$lib/classroom/classroom';
import {
	checkInHref,
	checkInStatusLabel,
	streamCheckIns,
	type ClassCheckIn
} from '$lib/classroom/class-check-ins';
import { formatSectionLabel } from '$lib/section-label';
import { studentNotebookHref } from '$lib/classroom/nav';
import { ICONS, runnableCommands, type CommandEnv } from './commands';
import { rankByQuery, type Searchable } from './search';

export type PaletteKind = 'action' | 'item' | 'unit' | 'class' | 'student' | 'notebook';

/** The word each kind wears on its row, so a row never relies on its icon alone. */
export const PALETTE_KIND_LABELS: Record<PaletteKind, string> = {
	action: 'Action',
	item: 'Item',
	unit: 'Unit',
	class: 'Class',
	student: 'Student',
	notebook: 'Notebook'
};

export interface PaletteEntry extends Searchable {
	kind: PaletteKind;
	icon: string;
	/** One line after the name. */
	detail: string;
	/** A shortcut, printed on an action's row. */
	keys?: string;
	href?: string;
	/** Runs in place through a registered handler (`./command-handlers.ts`). */
	run?: { id: string; arg?: string };
}

export interface PaletteStudent {
	email: string;
	name: string;
}

/** A notebook entry as a screen that can open one hands it over. */
export interface PaletteNotebookEntry {
	id: string;
	title: string;
	detail: string;
}

export interface PaletteSources {
	/** The class on screen, when there is one. */
	section: ClassroomSection | null;
	items: readonly ClassroomItem[];
	units: readonly ClassroomUnit[];
	/** Every class the viewer has (the switcher's list). */
	sections: readonly ClassroomSection[];
	/** The viewer's own check-ins in this class; a manager's carry no status and are not listed. */
	checkIns: readonly ClassCheckIn[];
	/** The roster, once loaded, for a manager's `@` search. */
	students?: readonly PaletteStudent[] | null;
	/** Entries on a notebook screen that registered a way to open one. */
	notebookEntries?: readonly PaletteNotebookEntry[] | null;
}

export type PaletteScope = 'all' | 'items' | 'students' | 'actions';

export const PALETTE_PREFIXES: Readonly<Record<string, PaletteScope>> = { '#': 'items', '@': 'students', '>': 'actions' };

/** Split a typed query into its scope and the text to search for. */
export function parsePaletteQuery(raw: string): { scope: PaletteScope; text: string } {
	const trimmed = raw.replace(/^\s+/, '');
	const scope = PALETTE_PREFIXES[trimmed.charAt(0)];
	return scope ? { scope, text: trimmed.slice(1).trim() } : { scope: 'all', text: trimmed.trim() };
}

const SCOPE_KINDS: Record<PaletteScope, readonly PaletteKind[]> = {
	all: ['action', 'item', 'unit', 'class', 'notebook', 'student'],
	items: ['item', 'unit'],
	students: ['student'],
	actions: ['action']
};

const KIND_ICON: Record<ClassroomItem['kind'], string> = {
	assignment: ICONS.assignment,
	material: ICONS.material,
	post: ICONS.post
};

/**
 * Every row the palette could show here, in the order ties break: THE CLASS
 * ON SCREEN FIRST (its items in the teacher's order, its units, the student's
 * check-ins), then actions, other classes, notebook entries and people. With
 * nothing typed every row ties, so this order IS the empty palette, and a
 * palette scoped to a class opens on that class rather than on a list of
 * doors (measured at 375: the first seven rows were actions).
 */
export function paletteEntries(sources: PaletteSources, env: CommandEnv): PaletteEntry[] {
	const out: PaletteEntry[] = [];

	const section = sources.section;
	if (section && env.sectionId === section.id) {
		const units = sortUnits([...sources.units]);
		const unitName = new Map(units.map((u) => [u.id, u.name]));
		// The page's own order: unit by unit, each unit as the class page lays it out.
		const ordered = classGroups([...sources.items], units).flatMap((g) => g.items);
		for (const item of ordered) {
			const kind = itemKindLabel(item.kind);
			const unit = item.unit_id ? unitName.get(item.unit_id) : undefined;
			const bits = [kind, unit, item.kind === 'assignment' && item.due_at ? `Due ${formatDue(item.due_at)}` : null];
			out.push({
				key: `item:${item.id}`,
				kind: 'item',
				name: itemTitle(item),
				icon: KIND_ICON[item.kind] ?? ICONS.material,
				detail: bits.filter(Boolean).join(' · '),
				also: [kind, unit, item.category, ...item.attachments.map((a) => a.filename)],
				href: `${env.basePath}/${section.id}/item/${item.id}`
			});
		}
		for (const u of units) {
			const count = sources.items.filter((i) => i.unit_id === u.id).length;
			out.push({
				key: `unit:${u.id}`,
				kind: 'unit',
				name: u.name,
				icon: ICONS.unit,
				detail: `Unit · ${count} ${count === 1 ? 'item' : 'items'}`,
				also: ['unit'],
				...(env.handlers.has('class.reveal-unit')
					? { run: { id: 'class.reveal-unit', arg: u.id } }
					: { href: `${env.basePath}/${section.id}` })
			});
		}
		// The student's own check-ins, each a door into their notebook with the
		// check-in already chosen. A manager's carry no personal status, and
		// their door to check-ins is the Notebook action.
		if (env.role === 'student') {
			for (const c of streamCheckIns([...sources.checkIns])) {
				out.push({
					key: `checkin:${c.session_id}`,
					kind: 'notebook',
					name: c.session_label,
					icon: ICONS.notebook,
					detail: ['Check-in', c.status ? checkInStatusLabel(c.status) : null].filter(Boolean).join(' · '),
					also: ['check-in', 'notebook'],
					href: checkInHref(c)
				});
			}
		}
	}

	for (const c of runnableCommands(env)) {
		out.push({
			key: `cmd:${c.id}`,
			kind: 'action',
			name: c.name,
			icon: c.icon,
			detail: c.description,
			keys: c.keys,
			also: [c.description, ...(c.keywords ?? [])],
			...(c.href ? { href: c.href(env) ?? undefined } : { run: { id: c.id } })
		});
	}

	for (const s of sources.sections) {
		if (s.id === env.sectionId) continue;
		const label = formatSectionLabel(s.label, s.block);
		const code = s.course?.code ?? null;
		out.push({
			key: `class:${s.id}`,
			kind: 'class',
			name: code ? `${code} ${label}` : label,
			icon: ICONS.classes,
			detail: [s.course?.title ?? null, s.active === false ? 'Archived' : null].filter(Boolean).join(' · ') || 'Class',
			also: [s.course?.title, code, s.label, s.block],
			href: `${env.basePath}/${s.id}`
		});
	}

	if (env.handlers.has('notebook.open-entry')) {
		for (const e of sources.notebookEntries ?? []) {
			out.push({
				key: `entry:${e.id}`,
				kind: 'notebook',
				name: e.title,
				icon: ICONS.notebook,
				detail: e.detail,
				also: ['notebook', 'entry'],
				run: { id: 'notebook.open-entry', arg: e.id }
			});
		}
	}

	// People are a MANAGER'S search. Their notebook in this class is the door,
	// the one per-student page every manager of the section can open.
	if (env.role === 'manager' && env.sectionId) {
		for (const p of sources.students ?? []) {
			out.push({
				key: `student:${p.email}`,
				kind: 'student',
				name: p.name,
				icon: ICONS.student,
				detail: 'Notebook in this class',
				also: [p.email],
				href: studentNotebookHref(p.email, env.sectionId)
			});
		}
	}

	return out;
}

/** How many rows the palette renders at most; the rest are a narrower query away. */
export const PALETTE_MAX_ROWS = 50;

/** The rows for a typed query: scope from the prefix, ranked, capped. */
export function searchPalette(
	raw: string,
	entries: readonly PaletteEntry[],
	recent: readonly string[] = [],
	max = PALETTE_MAX_ROWS
): PaletteEntry[] {
	const { scope, text } = parsePaletteQuery(raw);
	const kinds = SCOPE_KINDS[scope];
	return rankByQuery(
		text,
		entries.filter((e) => kinds.includes(e.kind)),
		recent
	).slice(0, max);
}
