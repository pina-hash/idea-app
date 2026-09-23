// tests/command-registry.test.ts
//
// THE COMMAND REGISTRY, THE PALETTE'S ROWS AND ITS SEARCH (ledger 0297, F3).
//
// What is silent if it regresses, and so belongs here rather than in a harness:
//   - the ROLE filter, in both directions. A student offered a manager's door
//     is a row whose only outcome is a 404; a manager offered a student's
//     filter is a control that does nothing. Neither throws or looks wrong.
//   - the `@` roster, which is a MANAGER's search and must never reach a
//     student's palette, whatever the page happened to load.
//   - the console keys: `GRADE_KEYS` and `REVIEW_KEYS` are the arrays the two
//     consoles dispatch from, so a legend that drifted from them lists a key
//     that does nothing.
//   - the ranking and the typo tolerance, which are arithmetic.
// Every exclusion is paired with the positive control that proves the same
// fixture would have produced the row.

import { describe, expect, it } from 'vitest';
import {
	COMMANDS,
	COMMAND_IDS,
	commandById,
	commandsFor,
	contextApplies,
	isLegendKey,
	isPaletteChord,
	keysFor,
	roleAllows,
	runnableCommands,
	shortcutLegend,
	surfaceFor,
	type CommandEnv
} from '$lib/shell/commands';
import { GRADE_KEYS } from '$lib/classroom/grading-keys';
import { REVIEW_KEYS } from '$lib/notebook-review';
import { sectionTabs } from '$lib/classroom/nav';
import { matchesQuery, rankByQuery, tokenFit } from '$lib/shell/search';
import { paletteEntries, parsePaletteQuery, searchPalette, type PaletteSources } from '$lib/shell/palette';
import type { ClassroomItem, ClassroomSection, ClassroomUnit } from '$lib/classroom/classroom';

const ALL_HANDLERS = new Set(COMMANDS.filter((c) => c.run).map((c) => c.id));

function env(over: Partial<CommandEnv> = {}): CommandEnv {
	return {
		role: 'student',
		surface: 'classroom',
		sectionId: 's-1',
		itemId: null,
		itemKind: null,
		basePath: '/classroom',
		isStaff: false,
		isAdmin: false,
		handlers: new Set(),
		...over
	};
}

describe('the registry itself', () => {
	it('ids are unique and stable-shaped', () => {
		expect(new Set(COMMAND_IDS).size).toBe(COMMAND_IDS.length);
		for (const id of COMMAND_IDS) expect(id).toMatch(/^[a-z]+(\.[a-z0-9-]+)+$/);
	});

	it('every command carries a name, an icon, a description, a role and a context, and exactly one way to happen', () => {
		for (const c of COMMANDS) {
			expect(c.name.trim(), c.id).not.toBe('');
			expect(c.description.trim(), c.id).not.toBe('');
			expect(c.icon, c.id).toMatch(/^M/);
			expect(['any', 'student', 'manager'], c.id).toContain(c.role);
			expect(['global', 'class', 'item', 'student', 'selection'], c.id).toContain(c.context);
			const ways = Number(!!c.href) + Number(!!c.run) + Number(!!c.legend);
			expect(ways, c.id).toBe(1);
			// No em dash in anything a person reads.
			expect(`${c.name} ${c.description}`, c.id).not.toMatch(/\u2014/);
		}
	});

	it('every GRADE_KEYS binding is a legend command on the grading screen, in its own words', () => {
		const grade = COMMANDS.filter((c) => c.id.startsWith('grade.'));
		expect(grade).toHaveLength(GRADE_KEYS.length);
		expect(GRADE_KEYS.length).toBeGreaterThan(0);
		for (const b of GRADE_KEYS) {
			const c = grade.find((g) => g.keys === b.keys && g.name === b.label);
			expect(c, `${b.keys} ${b.label}`).toBeTruthy();
			expect(c!.legend).toBe(true);
			expect(c!.surfaces).toEqual(['grading']);
			expect(c!.role).toBe('manager');
		}
	});

	it('every REVIEW_KEYS binding is a legend command on the review console, in its own words', () => {
		const review = COMMANDS.filter((c) => c.id.startsWith('review.'));
		expect(review).toHaveLength(REVIEW_KEYS.length);
		expect(REVIEW_KEYS.length).toBeGreaterThan(0);
		for (const b of REVIEW_KEYS) {
			const c = review.find((r) => r.keys === b.keys && r.name === b.label);
			expect(c, `${b.keys} ${b.label}`).toBeTruthy();
			expect(c!.surfaces).toEqual(['notebook-review']);
		}
	});

	it("a class tab command points where the class's own tab points", () => {
		const tabs = sectionTabs('s-1', '/classroom');
		for (const [id, tab] of [
			['class.stream', 'class'],
			['class.live', 'live'],
			['class.people', 'people'],
			['class.grades', 'grades'],
			['class.duplicates', 'duplicates'],
			// ledger 0297: the Check-ins tab became the class's Notebook tab.
			['class.notebook', 'notebook']
		] as const) {
			const href = commandById(id)!.href!(env({ role: 'manager' }));
			expect(href, id).toBe(tabs.find((t) => t.id === tab)!.href);
		}
	});
});

describe('who gets what: the role filter, both directions', () => {
	it('the rule: `any` is everybody, the other two are exactly that role', () => {
		expect(roleAllows('any', 'student')).toBe(true);
		expect(roleAllows('any', 'manager')).toBe(true);
		expect(roleAllows('student', 'student')).toBe(true);
		expect(roleAllows('student', 'manager')).toBe(false);
		expect(roleAllows('manager', 'manager')).toBe(true);
		expect(roleAllows('manager', 'student')).toBe(false);
	});

	it('a student in a class sees no manager command, and does see their own', () => {
		const student = commandsFor(env({ role: 'student', handlers: ALL_HANDLERS }));
		const managerOnly = student.filter((c) => c.role === 'manager');
		const studentOnly = student.filter((c) => c.role === 'student');
		expect(managerOnly.map((c) => c.id)).toEqual([]);
		// Positive control: the same fixture yields the student's own filters.
		expect(studentOnly.map((c) => c.id).sort()).toEqual(
			['class.show-done', 'class.show-missing', 'class.show-todo', 'go.notebook', 'go.todo'].sort()
		);
	});

	it('a manager in a class sees no student command, and does see their own', () => {
		const manager = commandsFor(env({ role: 'manager', isStaff: true, handlers: ALL_HANDLERS }));
		expect(manager.filter((c) => c.role === 'student').map((c) => c.id)).toEqual([]);
		const managerOnly = manager.filter((c) => c.role === 'manager').map((c) => c.id);
		for (const id of [
			'class.people',
			'class.grades',
			'class.duplicates',
			'class.new-post',
			'class.show-drafts',
			'go.admin',
			'class.live',
			'live.projector',
			'live.timer',
			'live.pick'
		]) {
			expect(managerOnly).toContain(id);
		}
	});

	// GENERALIZED (ledger 0297): `class.check-ins` was a manager's departure to
	// the review console. The class's Notebook tab replaced it and every member
	// of the class has one -- the student's own notebook, or the manager's
	// review -- so the command is `any`, and both roles are offered it.
	it("a class's Notebook tab is offered to both roles, as the tab is", () => {
		const notebook = commandById('class.notebook')!;
		expect(notebook.role).toBe('any');
		expect(commandsFor(env({ role: 'student', handlers: ALL_HANDLERS }))).toContain(notebook);
		expect(commandsFor(env({ role: 'manager', handlers: ALL_HANDLERS }))).toContain(notebook);
		expect(commandById('class.check-ins')).toBeNull();
	});

	it('the palette rows follow the same rule: counts on one fixture, both roles', () => {
		const studentRows = runnableCommands(env({ role: 'student', handlers: ALL_HANDLERS }));
		const managerRows = runnableCommands(env({ role: 'manager', isStaff: true, handlers: ALL_HANDLERS }));
		const managerIds = new Set(COMMANDS.filter((c) => c.role === 'manager').map((c) => c.id));
		const studentIds = new Set(COMMANDS.filter((c) => c.role === 'student').map((c) => c.id));
		expect(studentRows.filter((c) => managerIds.has(c.id))).toHaveLength(0);
		expect(managerRows.filter((c) => studentIds.has(c.id))).toHaveLength(0);
		// Five: "Open to-do" joined the student set (ledger 0297, the to-do).
		expect(studentRows.filter((c) => studentIds.has(c.id)).length).toBe(5);
		// Ten: `class.check-ins` left the manager set for the `any` notebook tab,
		// and the Live tab brought four (ledger 0297).
		expect(managerRows.filter((c) => managerIds.has(c.id)).length).toBe(10);
	});

	it('Courses and setup is a staff door on top of the role', () => {
		expect(runnableCommands(env({ role: 'manager', isStaff: false })).map((c) => c.id)).not.toContain('go.admin');
		expect(runnableCommands(env({ role: 'manager', isStaff: true })).map((c) => c.id)).toContain('go.admin');
		expect(runnableCommands(env({ role: 'manager', isAdmin: true })).map((c) => c.id)).toContain('go.admin');
	});
});

describe('where: context, handlers and the legend', () => {
	it('class commands need a class; item.grade needs an open assignment', () => {
		const noClass = commandsFor(env({ role: 'manager', sectionId: null, handlers: ALL_HANDLERS }));
		expect(noClass.filter((c) => c.context === 'class')).toHaveLength(0);
		const inClass = commandsFor(env({ role: 'manager', handlers: ALL_HANDLERS }));
		expect(inClass.filter((c) => c.context === 'class').length).toBeGreaterThan(5);

		const grade = commandById('item.grade')!;
		expect(commandsFor(env({ role: 'manager', itemId: 'i-1', itemKind: 'material' }))).not.toContain(grade);
		expect(commandsFor(env({ role: 'manager', itemId: 'i-1', itemKind: 'assignment' }))).toContain(grade);
		expect(commandsFor(env({ role: 'student', itemId: 'i-1', itemKind: 'assignment' }))).not.toContain(grade);
		expect(grade.href!(env({ role: 'manager', itemId: 'i-1' }))).toBe('/classroom/s-1/item/i-1/grade');
	});

	it('a run command is offered only while something registered a handler for it', () => {
		const without = runnableCommands(env({ role: 'manager', isStaff: true }));
		expect(without.find((c) => c.id === 'class.new-post')).toBeUndefined();
		expect(without.filter((c) => c.run)).toHaveLength(0);
		const withIt = runnableCommands(env({ role: 'manager', isStaff: true, handlers: new Set(['class.new-post']) }));
		expect(withIt.find((c) => c.id === 'class.new-post')).toBeTruthy();
	});

	it('a legend key is never a palette row, and the legend lists the keys for this screen only', () => {
		const grading = env({ role: 'manager', surface: 'grading', itemId: 'i-1', itemKind: 'assignment', handlers: ALL_HANDLERS });
		expect(runnableCommands(grading).filter((c) => c.legend)).toHaveLength(0);
		const legend = shortcutLegend(grading).map((c) => c.id);
		expect(legend.filter((id) => id.startsWith('grade.'))).toHaveLength(GRADE_KEYS.length);
		expect(legend.filter((id) => id.startsWith('review.'))).toHaveLength(0);
		expect(legend).toContain('palette.open');
		expect(legend).toContain('palette.shortcuts');

		const review = env({ role: 'manager', surface: 'notebook-review', sectionId: null, handlers: ALL_HANDLERS });
		const reviewLegend = shortcutLegend(review).map((c) => c.id);
		expect(reviewLegend.filter((id) => id.startsWith('review.'))).toHaveLength(REVIEW_KEYS.length);
		expect(reviewLegend.filter((id) => id.startsWith('grade.'))).toHaveLength(0);

		// The class page has no console keys at all.
		const classPage = shortcutLegend(env({ role: 'manager' })).map((c) => c.id);
		expect(classPage.filter((id) => id.startsWith('grade.') || id.startsWith('review.'))).toHaveLength(0);
	});

	it('context rules per kind', () => {
		const cmd = (context: 'student' | 'selection') =>
			({ ...commandById('palette.open')!, context, surfaces: undefined }) as const;
		expect(contextApplies(cmd('student'), env({ surface: 'grading' }))).toBe(true);
		expect(contextApplies(cmd('student'), env({ surface: 'classroom' }))).toBe(false);
		expect(contextApplies(cmd('selection'), env({ surface: 'notebook-review' }))).toBe(true);
		expect(contextApplies(cmd('selection'), env({ surface: 'notebook' }))).toBe(false);
	});

	it('which screen a path is', () => {
		expect(surfaceFor('/classroom/s-1/item/i-1/grade')).toBe('grading');
		expect(surfaceFor('/classroom/s-1/item/i-1')).toBe('classroom');
		expect(surfaceFor('/classroom/s-1')).toBe('classroom');
		expect(surfaceFor('/notebook/review')).toBe('notebook-review');
		expect(surfaceFor('/notebook/review/')).toBe('notebook-review');
		// A student's notebook opened from the console answers none of its keys.
		expect(surfaceFor('/notebook/review/student/ana%40boscotech.net')).toBe('notebook');
		expect(surfaceFor('/notebook')).toBe('notebook');
		// Inside the classroom (ledger 0297): the review console and the whole
		// notebook by address, and a class's own Notebook tab by ROLE, because
		// the one URL is the review for a manager and the notebook for a student.
		expect(surfaceFor('/classroom/notebook/review')).toBe('notebook-review');
		expect(surfaceFor('/classroom/notebook/review/student/ana%40boscotech.net')).toBe('notebook');
		expect(surfaceFor('/classroom/notebook')).toBe('notebook');
		expect(surfaceFor('/classroom/s-1/notebook', '/classroom', 'manager')).toBe('notebook-review');
		expect(surfaceFor('/classroom/s-1/notebook', '/classroom', 'student')).toBe('notebook');
		expect(surfaceFor('/classroom/s-1/notebook')).toBe('notebook');
		expect(surfaceFor('/dev/palette/s-1/item/i-1/grade', '/dev/palette')).toBe('grading');
	});
});

describe('the keys', () => {
	it('Ctrl+K and Cmd+K open the palette; nothing else does', () => {
		expect(isPaletteChord({ key: 'k', ctrlKey: true })).toBe(true);
		expect(isPaletteChord({ key: 'K', metaKey: true })).toBe(true);
		expect(isPaletteChord({ key: 'k' })).toBe(false);
		expect(isPaletteChord({ key: 'k', ctrlKey: true, shiftKey: true })).toBe(false);
		expect(isPaletteChord({ key: 'k', ctrlKey: true, altKey: true })).toBe(false);
		expect(isPaletteChord({ key: 'j', ctrlKey: true })).toBe(false);
	});

	it('? opens the legend, and not with a modifier held', () => {
		expect(isLegendKey({ key: '?' })).toBe(true);
		expect(isLegendKey({ key: '?', ctrlKey: true })).toBe(false);
		expect(isLegendKey({ key: '/' })).toBe(false);
	});

	it('a key is printed the way this keyboard spells it', () => {
		expect(keysFor('Ctrl K', 'MacIntel')).toBe('⌘ K');
		expect(keysFor('Ctrl K', 'macOS')).toBe('⌘ K');
		expect(keysFor('Ctrl K', 'Win32')).toBe('Ctrl K');
		expect(keysFor('?', 'MacIntel')).toBe('?');
	});
});

describe('search: ranking and typo tolerance', () => {
	const entries = [
		{ key: 'e-typo', name: 'Trsus review' },
		{ key: 'e-desc', name: 'Gear ratios', also: ['A truss worksheet'] },
		{ key: 'e-sub', name: 'Mistrussed joints' },
		{ key: 'e-word', name: 'Bridge truss lab' },
		{ key: 'e-prefix', name: 'Truss bridge' },
		{ key: 'e-none', name: 'Announcements' }
	];

	it('prefix, then word prefix, then substring, then description, then one typo; no match is dropped', () => {
		expect(rankByQuery('truss', entries).map((e) => e.key)).toEqual(['e-prefix', 'e-word', 'e-sub', 'e-desc', 'e-typo']);
	});

	it('a tie goes to the most recent pick, then to the order handed in', () => {
		const tied = [
			{ key: 'a', name: 'Truss one' },
			{ key: 'b', name: 'Truss two' },
			{ key: 'c', name: 'Truss three' }
		];
		expect(rankByQuery('truss', tied).map((e) => e.key)).toEqual(['a', 'b', 'c']);
		expect(rankByQuery('truss', tied, ['c', 'b']).map((e) => e.key)).toEqual(['c', 'b', 'a']);
		// Recency never lifts a worse match over a better one.
		expect(rankByQuery('truss', entries, ['e-typo'])[0].key).toBe('e-prefix');
	});

	it('an empty query keeps everything, in order', () => {
		expect(rankByQuery('', entries).map((e) => e.key)).toEqual(entries.map((e) => e.key));
	});

	it('one typo is tolerated from four characters up, a transposition included', () => {
		expect(tokenFit('gearbx', ['gearbox'])).toBe(3);
		expect(tokenFit('cookei', ['cookie'])).toBe(3);
		expect(tokenFit('gex', ['gear'])).toBeNull();
		expect(tokenFit('gea', ['gear'])).toBe(1);
		expect(tokenFit('ear', ['gear'])).toBe(2);
		expect(tokenFit('gear', ['gear'])).toBe(0);
	});

	it('every token must find a home, which is what makes a class search narrow', () => {
		expect(matchesQuery('bridge sketch', ['Bridge sketch 2'])).toBe(true);
		expect(matchesQuery('bridge sketch', ['Sketch only'])).toBe(false);
		expect(matchesQuery('brige', ['Bridge'])).toBe(true);
		expect(matchesQuery('', ['anything'])).toBe(true);
		expect(matchesQuery('   ', [null, undefined])).toBe(true);
	});
});

/* -------------------------------------------------------------------------
 * THE PALETTE'S ROWS
 * ---------------------------------------------------------------------- */

const SECTION: ClassroomSection = {
	id: 's-1',
	course_id: 'c-1',
	label: 'Period 2',
	block: 'B',
	teacher_email: 'vargas@boscotech.edu',
	active: true,
	course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
} as ClassroomSection;
const OTHER: ClassroomSection = { ...SECTION, id: 's-2', label: 'Period 5', block: 'E' } as ClassroomSection;
const UNITS: ClassroomUnit[] = [
	{ id: 'u-1', course_id: 'c-1', name: 'Unit 1 · Sketching', sort_order: 1 },
	{ id: 'u-2', course_id: 'c-1', name: 'Unit 2 · Bridges', sort_order: 2 }
] as ClassroomUnit[];
function item(id: string, title: string, kind: ClassroomItem['kind'], unit_id: string | null): ClassroomItem {
	return {
		id,
		kind,
		title,
		body: '',
		body_doc: null,
		points: null,
		due_at: null,
		category: null,
		published: true,
		pinned: false,
		unit_id,
		sort_order: 0,
		attachments: [],
		links: [],
		postings: [{ section_id: 's-1' }]
	} as unknown as ClassroomItem;
}
const ITEMS = [
	item('i-1', 'Truss bridge build', 'assignment', 'u-2'),
	item('i-2', 'Sketching reference', 'material', 'u-1'),
	item('i-3', 'Welcome', 'post', null)
];
const STUDENTS = [
	{ email: 'ana@boscotech.net', name: 'Ana Reyes' },
	{ email: 'ben@boscotech.net', name: 'Ben Ortiz' }
];

function sources(over: Partial<PaletteSources> = {}): PaletteSources {
	return { section: SECTION, items: ITEMS, units: UNITS, sections: [SECTION, OTHER], checkIns: [], students: STUDENTS, ...over };
}

describe('the palette rows', () => {
	it('the roster is a manager search: 0 student rows for a student, 2 for a manager, on the same sources', () => {
		const student = paletteEntries(sources(), env({ role: 'student' }));
		const manager = paletteEntries(sources(), env({ role: 'manager' }));
		expect(student.filter((e) => e.kind === 'student')).toHaveLength(0);
		expect(manager.filter((e) => e.kind === 'student')).toHaveLength(2);
		// And a manager outside a class has no roster to search.
		expect(paletteEntries(sources(), env({ role: 'manager', sectionId: null })).filter((e) => e.kind === 'student')).toHaveLength(0);
		// `@` finds a person for the manager and nothing for the student.
		expect(searchPalette('@ana', manager).map((e) => e.key)).toEqual(['student:ana@boscotech.net']);
		expect(searchPalette('@ana', student)).toEqual([]);
		// A student's door is their notebook in this class, not their address.
		expect(manager.find((e) => e.kind === 'student')!.href).toBe(
			'/classroom/notebook/review/student/ana%40boscotech.net?section=s-1'
		);
	});

	it('items and units of the class on screen, other classes, and never the class on screen as a jump', () => {
		const rows = paletteEntries(sources(), env({ role: 'student' }));
		// The page's own order: Unit 1's item, Unit 2's, then the unfiled one.
		expect(rows.filter((e) => e.kind === 'item').map((e) => e.key)).toEqual(['item:i-2', 'item:i-1', 'item:i-3']);
		// With nothing typed the palette opens on the class, not on a list of doors.
		const empty = searchPalette('', paletteEntries(sources(), env({ role: 'student', handlers: ALL_HANDLERS })));
		expect(empty.slice(0, 5).map((e) => e.kind)).toEqual(['item', 'item', 'item', 'unit', 'unit']);
		expect(empty.some((e) => e.kind === 'action')).toBe(true);
		expect(rows.filter((e) => e.kind === 'unit').map((e) => e.key)).toEqual(['unit:u-1', 'unit:u-2']);
		expect(rows.filter((e) => e.kind === 'class').map((e) => e.key)).toEqual(['class:s-2']);
		expect(rows.find((e) => e.key === 'item:i-1')!.href).toBe('/classroom/s-1/item/i-1');
		// A unit links to its class unless the class page registered a way to reveal it.
		expect(rows.find((e) => e.key === 'unit:u-1')!.href).toBe('/classroom/s-1');
		const reveal = paletteEntries(sources(), env({ role: 'student', handlers: new Set(['class.reveal-unit']) }));
		expect(reveal.find((e) => e.key === 'unit:u-1')!.run).toEqual({ id: 'class.reveal-unit', arg: 'u-1' });
		// Items of a class not on screen are not listed as this class's items.
		const elsewhere = paletteEntries(sources(), env({ role: 'student', sectionId: 's-2' }));
		expect(elsewhere.filter((e) => e.kind === 'item')).toHaveLength(0);
		expect(elsewhere.filter((e) => e.kind === 'class').map((e) => e.key)).toEqual(['class:s-1']);
	});

	it('a unit name finds its items', () => {
		const rows = paletteEntries(sources(), env({ role: 'student' }));
		expect(searchPalette('bridges', rows).map((e) => e.key)).toContain('item:i-1');
		expect(searchPalette('bridges', rows).map((e) => e.key)).not.toContain('item:i-2');
	});

	it('notebook entries are listed only where something can open one', () => {
		const withEntries = sources({ notebookEntries: [{ id: 'n-1', title: 'Gear test', detail: 'Draft' }] });
		expect(paletteEntries(withEntries, env({ surface: 'notebook', sectionId: null })).filter((e) => e.kind === 'notebook')).toHaveLength(0);
		const open = paletteEntries(withEntries, env({ surface: 'notebook', sectionId: null, handlers: new Set(['notebook.open-entry']) }));
		expect(open.filter((e) => e.kind === 'notebook').map((e) => e.run)).toEqual([{ id: 'notebook.open-entry', arg: 'n-1' }]);
	});

	it('a prefix narrows the kinds and does not change the ranking', () => {
		const rows = paletteEntries(sources(), env({ role: 'manager', isStaff: true, handlers: ALL_HANDLERS }));
		expect(new Set(searchPalette('#', rows).map((e) => e.kind))).toEqual(new Set(['item', 'unit']));
		expect(new Set(searchPalette('>', rows).map((e) => e.kind))).toEqual(new Set(['action']));
		expect(new Set(searchPalette('@', rows).map((e) => e.kind))).toEqual(new Set(['student']));
		expect(searchPalette('#truss', rows)[0].key).toBe('item:i-1');
		expect(searchPalette('truss', rows)[0].key).toBe('item:i-1');
		expect(parsePaletteQuery('  >grade')).toEqual({ scope: 'actions', text: 'grade' });
		expect(parsePaletteQuery('truss #2')).toEqual({ scope: 'all', text: 'truss #2' });
	});

	it('the rows are capped', () => {
		const many = Array.from({ length: 80 }, (_, i) => item(`x-${i}`, `Truss ${i}`, 'material', null));
		const rows = paletteEntries(sources({ items: many }), env());
		expect(searchPalette('truss', rows)).toHaveLength(50);
	});
});
