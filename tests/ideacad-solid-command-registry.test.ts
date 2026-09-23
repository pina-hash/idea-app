// tests/ideacad-solid-command-registry.test.ts
//
// THE ONE COMMAND REGISTRY. Every tool and command is written down once in
// `command-registry.ts`, and the palette, command search, the shortcut layer
// and the preferences panel all read it. What is pinned here is what fails
// SILENTLY when it drifts: two commands with one id (search and the shortcut
// layer would each find a different one), two defaults on one key (a key that
// runs whichever came first), a tool dropped from the registry (it vanishes
// from the palette with nothing on screen to say so), a quick tool that is not
// a tool, a digit taken as a shortcut (the value box stops receiving it), and
// a search that ranks a stale command above the one just used.
import { describe, expect, it } from 'vitest';
import { COMMANDS, COMMAND_GROUPS, CONTEXT_BAR, CONTEXT_MENUS, DEFAULT_QUICK_TOOLS, PICK_FILTER_KINDS, TOOL_IDS, acceptReason, acceptsSelection, boxKinds, commandById, effectiveShortcuts, keyFromEvent, keyLabel, keyRefusal, menuKindOf, normalizeKey, pickFilterLabel, pickKinds, recordRecent, searchCommands, shortcutConflict } from '../src/lib/ideacad/solid/command-registry';
import { QUICK_TOOLS, TOOLS } from '../src/lib/ideacad/solid/tools';

/** The 23 tool ids as they stood before the registry, in the palette's order. Typed out, not derived, so a dropped or renamed tool reddens. */
const TOOL_IDS_BEFORE = ['select', 'rectangle', 'circle', 'line', 'polygon', 'arc', 'extrude', 'revolve', 'fillet', 'chamfer', 'shell', 'hole', 'move', 'rotate', 'scale', 'mate', 'linear-pattern', 'circular-pattern', 'reference', 'measure', 'draft', 'sweep', 'loft'];

describe('every command is registered once', () => {
	it('no two commands share an id, and every id is found by its own lookup', () => {
		const ids = COMMANDS.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const c of COMMANDS) expect(commandById(c.id)).toBe(c);
		expect(commandById('no-such-command')).toBeUndefined();
	});
	it('every one of the 23 tools is registered, unchanged in id and order, and arms itself', () => {
		expect(TOOL_IDS).toEqual(TOOL_IDS_BEFORE);
		const armed: string[] = [];
		const ctx = { setTool: (t: string) => armed.push(t) } as never;
		for (const id of TOOL_IDS_BEFORE) { const c = commandById(id)!; expect(c.tool).toBe(id); c.run(ctx); }
		expect(armed).toEqual(TOOL_IDS_BEFORE);
	});
	it('the non-tool commands the workspace promises are all there, and none of them arms a tool', () => {
		const actions = ['undo', 'redo', 'delete', 'fit', 'view-front', 'view-top', 'view-right', 'view-iso', 'normal-to', 'planes', 'view-menu', 'panel-objects', 'panel-reference', 'panel-mates', 'panel-section', 'panel-addons', 'export', 'search', 'preferences', 'help',
			/* The selection commands the right-click menu and the context toolbar run (ledger 0296, stage W2). */
			'sketch-on', 'edit-sketch', 'fillet-face-edges', 'select-other', 'select-tangent', 'select-loop', 'pick-filter', 'hide-body', 'show-bodies', 'mirror-body', 'body-appearance',
			/* The display modes (ledger 0296, stage W3). */
			'display-menu', 'display-shaded-edges', 'display-shaded', 'display-hidden-lines', 'display-wireframe',
			/* The Analysis panel (ledger 0296, stage W4). */
			'panel-analysis'];
		for (const id of actions) { expect(commandById(id), id).toBeDefined(); expect(commandById(id)!.tool, id).toBeUndefined(); }
		expect(COMMANDS).toHaveLength(TOOL_IDS_BEFORE.length + actions.length);
	});
	it('every command has a name, a one-line description, an icon and a known group; no description is a paragraph or carries a long dash', () => {
		for (const c of COMMANDS) {
			expect(c.name.length, c.id).toBeGreaterThan(1);
			expect(c.description.length, c.id).toBeGreaterThan(8);
			expect(c.description.length, c.id).toBeLessThan(90);
			expect(c.description, c.id).not.toMatch(/\n|\u2014/);
			expect(c.icon, c.id).toMatch(/^M/);
			expect(COMMAND_GROUPS, c.id).toContain(c.group);
		}
	});
});

describe('the palette is derived from the registry', () => {
	it('TOOLS is the tool commands, field for field, and QUICK_TOOLS is the default quick set', () => {
		expect(TOOLS.map((t) => t.id)).toEqual(TOOL_IDS_BEFORE);
		for (const t of TOOLS) { const c = commandById(t.id)!; expect(t).toEqual({ id: c.id, name: c.name, description: c.description, icon: c.icon }); }
		expect(QUICK_TOOLS).toEqual([...DEFAULT_QUICK_TOOLS]);
		expect(DEFAULT_QUICK_TOOLS.every((id) => TOOL_IDS.includes(id))).toBe(true);
	});
});

describe('keys', () => {
	it('one spelling for every way of writing a key, and null for what is not a key', () => {
		expect(normalizeKey('L')).toBe('l');
		expect(normalizeKey('shift+L')).toBe('Shift+l');
		expect(normalizeKey('Cmd+Shift+Z')).toBe('Ctrl+Shift+z');
		expect(normalizeKey('shift+ctrl+z')).toBe('Ctrl+Shift+z');
		expect(normalizeKey(' ')).toBeNull();
		expect(normalizeKey('space')).toBe('Space');
		expect(normalizeKey('del')).toBe('Delete');
		expect(normalizeKey('f5')).toBe('F5');
		expect(normalizeKey('Hyper+x')).toBeNull();
		expect(normalizeKey('')).toBeNull();
		expect(normalizeKey(7)).toBeNull();
	});
	it('a keyboard event reads as the key a student pressed, with Shift only where it is not already in the character', () => {
		expect(keyFromEvent({ key: 'l' })).toBe('l');
		expect(keyFromEvent({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('Ctrl+Shift+z');
		expect(keyFromEvent({ key: 'z', metaKey: true })).toBe('Ctrl+z');
		expect(keyFromEvent({ key: ' ' })).toBe('Space');
		expect(keyFromEvent({ key: '?', shiftKey: true })).toBe('?');
		expect(keyFromEvent({ key: '¬', code: 'KeyL', altKey: true })).toBe('Alt+l');
		expect(keyFromEvent({ key: 'Shift', shiftKey: true })).toBeNull();
		expect(keyLabel('Ctrl+Shift+z')).toBe('Ctrl+Shift+Z');
		expect(keyLabel('w')).toBe('W');
	});
	it('the keys that already mean something are refused by sentence, and a modified digit is allowed', () => {
		for (const k of ['5', '.', '-', 'Escape', 'Enter', 'Tab', 'Shift+Tab']) expect(keyRefusal(k), k).toMatch(/\.$/);
		for (const k of ['l', 'Ctrl+5', 'Space', 'Delete', 'F2']) expect(keyRefusal(k), k).toBeNull();
		expect(keyRefusal('Hyper+q')).toMatch(/not a key/);
	});
	it('no two commands share a default key, and every default key is one a shortcut can use', () => {
		const seen = new Map<string, string>();
		for (const c of COMMANDS) for (const k of c.keys ?? []) {
			const key = normalizeKey(k);
			expect(key, `${c.id} ${k}`).toBe(k);
			expect(keyRefusal(k), `${c.id} ${k}`).toBeNull();
			expect(seen.get(key!), `${k} on ${c.id} and ${seen.get(key!)}`).toBeUndefined();
			seen.set(key!, c.id);
		}
		/* Positive control: the defaults the brief names are really there. */
		expect([...seen.entries()].filter(([k]) => ['l', 'r', 'c', 'e', 'f', 'w', 'Space', 'Ctrl+z', 'Ctrl+y', 'Delete'].includes(k)).map(([k, id]) => `${k}:${id}`).sort()).toEqual(['Ctrl+y:redo', 'Ctrl+z:undo', 'Delete:delete', 'Space:view-menu', 'c:circle', 'e:extrude', 'f:fit', 'l:line', 'r:rectangle', 'w:search']);
	});
	it('a choice wins over a default, a default whose key a choice took is dropped, and a command turned off answers to nothing', () => {
		const plain = effectiveShortcuts({});
		expect(plain.byKey.get('l')).toBe('line');
		expect(plain.byCommand.get('redo')).toEqual(['Ctrl+y', 'Ctrl+Shift+z']);
		const chosen = effectiveShortcuts({ polygon: 'l', line: null });
		expect(chosen.byKey.get('l')).toBe('polygon');
		expect(chosen.byCommand.get('line')).toEqual([]);
		/* A default whose key was taken: arc given 'r' leaves rectangle with none rather than two commands on 'r'. */
		const taken = effectiveShortcuts({ arc: 'r' });
		expect(taken.byKey.get('r')).toBe('arc');
		expect(taken.byCommand.get('rectangle')).toEqual([]);
		/* Every key maps to exactly one command. */
		for (const [key, id] of taken.byKey) expect(taken.byCommand.get(id)).toContain(key);
		/* A choice that is not a usable key is ignored and the default stays. */
		expect(effectiveShortcuts({ line: '5' }).byKey.get('l')).toBe('line');
	});
	it('a key another command answers to is refused by naming that command, and a free key is allowed', () => {
		expect(shortcutConflict('polygon', 'l')).toBe('L already runs Line. Clear it there first.');
		expect(shortcutConflict('polygon', 'p')).toBeNull();
		expect(shortcutConflict('line', 'l')).toBeNull();
		expect(shortcutConflict('polygon', 'l', { line: null })).toBeNull();
		expect(shortcutConflict('polygon', '3')).toMatch(/Digits/);
	});
});

describe('command search', () => {
	const ids = (list: { id: string }[]) => list.map((c) => c.id);
	it('a name that starts with the query ranks first, then word starts, then a name containing it, then a keyword', () => {
		expect(ids(searchCommands('fil')).slice(0, 1)).toEqual(['fillet']);
		expect(ids(searchCommands('pat'))).toEqual(expect.arrayContaining(['linear-pattern', 'circular-pattern']));
		expect(ids(searchCommands('pat')).slice(0, 2).sort()).toEqual(['circular-pattern', 'linear-pattern']);
		/* A SolidWorks word finds the IdeaCAD command. */
		expect(ids(searchCommands('drill'))[0]).toBe('hole');
		expect(ids(searchCommands('boss'))[0]).toBe('extrude');
		expect(ids(searchCommands('settings'))[0]).toBe('preferences');
		expect(searchCommands('zzzz')).toEqual([]);
	});
	it('within a rank, the command used most recently comes first; an empty query lists everything, recent first', () => {
		const plain = ids(searchCommands('re'));
		const recent = ids(searchCommands('re', ['redo']));
		expect(plain.indexOf('redo')).toBeGreaterThan(plain.indexOf('rectangle'));
		expect(recent[0]).toBe('redo');
		const all = ids(searchCommands('', ['loft', 'fit']));
		expect(all.slice(0, 2)).toEqual(['loft', 'fit']);
		expect(all).toHaveLength(COMMANDS.length);
	});
	it('a group narrows the list, which is how the view menu is the same search', () => {
		const views = searchCommands('', [], COMMANDS, 'View');
		expect(views.length).toBeGreaterThan(4);
		expect(views.every((c) => c.group === 'View')).toBe(true);
		expect(ids(views)).toEqual(expect.arrayContaining(['view-front', 'view-top', 'view-right', 'view-iso', 'normal-to', 'fit']));
	});
	it('running a command moves it to the front of the recent list, once, and the list keeps its length', () => {
		expect(recordRecent(['a', 'b', 'c'], 'b')).toEqual(['b', 'a', 'c']);
		expect(recordRecent(['a', 'b'], 'z', 2)).toEqual(['z', 'a']);
	});
});

describe('what a command accepts', () => {
	it('kinds and counts decide, and a command with no rule takes anything', () => {
		const face = { bodyId: 'b', kind: 'face' as const, id: 'f' }, edge = { bodyId: 'b', kind: 'edge' as const, id: 'e' };
		expect(acceptsSelection(commandById('fillet')!, [edge, face])).toBe(true);
		expect(acceptsSelection(commandById('fillet')!, [])).toBe(false);
		expect(acceptsSelection(commandById('hole')!, [face, face])).toBe(false);
		expect(acceptsSelection(commandById('mate')!, [face, face])).toBe(true);
		expect(acceptsSelection(commandById('extrude')!, [edge])).toBe(false);
		expect(acceptsSelection(commandById('fit')!, [edge])).toBe(true);
	});
});

describe('what a click and a box can pick', () => {
	const set = (x: Set<string> | null) => (x ? [...x].sort() : null);
	it('a press picks the kinds its tool takes: the Hole tool never a sketch (F036), a drawing tool never an edge (F031), Select anything', () => {
		expect(set(pickKinds('hole'))).toEqual(['face']);
		expect(set(pickKinds('rectangle'))).toEqual(['face', 'reference']);
		expect(set(pickKinds('select'))).toBeNull();
		/* A tool that takes a body picks it by any face, edge or corner of it. */
		expect(set(pickKinds('move'))).toEqual(['body', 'edge', 'face', 'vertex']);
		expect(set(pickKinds('fillet'))).toEqual(['edge', 'face']);
	});
	it('the pick filter narrows every tool but a drawing one, whose press says where to draw', () => {
		expect(set(pickKinds('select', ['edges']))).toEqual(['edge']);
		expect(set(pickKinds('select', ['faces', 'planes']))).toEqual(['body', 'face', 'reference']);
		expect(set(pickKinds('fillet', ['faces']))).toEqual(['face']);
		expect(set(pickKinds('hole', ['edges']))).toEqual([]);
		expect(set(pickKinds('rectangle', ['edges']))).toEqual(['face', 'reference']);
	});
	it('a box picks edges under Fillet and Chamfer, faces under Shell, bodies under Move, faces and edges otherwise; a filter decides for Select', () => {
		expect(boxKinds('fillet')).toEqual(['edge']);
		expect(boxKinds('chamfer')).toEqual(['edge']);
		expect(boxKinds('shell')).toEqual(['face']);
		for (const t of ['move', 'rotate', 'scale', 'linear-pattern', 'circular-pattern'] as const) expect(boxKinds(t), t).toEqual(['body']);
		expect(boxKinds('select')).toEqual(['face', 'edge']);
		expect(boxKinds('select', ['vertices'])).toEqual(['vertex']);
		expect(boxKinds('fillet', ['faces'])).toEqual([]);
		expect(boxKinds('move', ['edges'])).toEqual(['body']);
	});
	it('the filter reads as words, in its own order, and not at all when it is off', () => {
		expect(pickFilterLabel([])).toBe('');
		expect(pickFilterLabel(['edges'])).toBe('Edges');
		expect(pickFilterLabel(['edges', 'faces'])).toBe('Faces and edges');
		expect(pickFilterLabel([...PICK_FILTER_KINDS])).toBe('Faces, edges, vertices, sketches and planes');
	});
});

describe('the right-click menu and the context toolbar', () => {
	it('every row of every menu, and every icon of every toolbar, is a registered command', () => {
		let count = 0;
		for (const [kind, ids] of [...Object.entries(CONTEXT_MENUS), ...Object.entries(CONTEXT_BAR)]) for (const id of ids) { count++; expect(commandById(id), `${kind}: ${id}`).toBeDefined(); }
		expect(count).toBeGreaterThan(40);
	});
	it('every toolbar icon is also a row, with its name, in the same kind of menu: an icon always has its word one right-click away', () => {
		for (const [kind, ids] of Object.entries(CONTEXT_BAR)) for (const id of ids) expect(CONTEXT_MENUS[kind as keyof typeof CONTEXT_MENUS], `${kind}: ${id}`).toContain(id);
	});
	it('the menus the brief names carry what it names', () => {
		expect(CONTEXT_MENUS.face).toEqual(expect.arrayContaining(['sketch-on', 'extrude', 'fillet-face-edges', 'shell', 'hole', 'measure', 'normal-to', 'select-other', 'hide-body']));
		expect(CONTEXT_MENUS.edge).toEqual(expect.arrayContaining(['fillet', 'chamfer', 'select-tangent', 'select-loop', 'measure']));
		expect(CONTEXT_MENUS.body).toEqual(expect.arrayContaining(['move', 'rotate', 'mirror-body', 'body-appearance', 'delete']));
		expect(CONTEXT_MENUS.sketch).toEqual(expect.arrayContaining(['edit-sketch', 'extrude', 'revolve', 'delete']));
		expect(CONTEXT_MENUS.plane).toEqual(expect.arrayContaining(['sketch-on', 'normal-to', 'planes']));
		expect(CONTEXT_MENUS.empty).toEqual(expect.arrayContaining(['fit', 'planes', 'search']));
	});
	it('a menu kind comes from what was right-clicked: a Front plane and a reference plane are both a plane, an axis is an axis', () => {
		expect(menuKindOf(null)).toBe('empty');
		expect(menuKindOf({ bodyId: '', kind: 'reference', id: 'datum:XZ' })).toBe('plane');
		expect(menuKindOf({ bodyId: '', kind: 'reference', id: 'ax1' }, 'axis')).toBe('axis');
		expect(menuKindOf({ bodyId: 'b', kind: 'edge', id: 'e' })).toBe('edge');
	});
	it('a row that does not fit the selection says why in a few words, and one that fits says nothing', () => {
		const face = { bodyId: 'b', kind: 'face' as const, id: 'f' }, edge = { bodyId: 'b', kind: 'edge' as const, id: 'e' };
		expect(acceptReason(commandById('fillet')!, [edge])).toBeNull();
		expect(acceptReason(commandById('hole')!, [face, face])).toBe('Takes one at a time');
		expect(acceptReason(commandById('select-tangent')!, [face])).toBe('Takes an edge');
		expect(acceptReason(commandById('extrude')!, [edge])).toBe('Takes a sketch or a face');
		expect(acceptReason(commandById('fit')!, [edge])).toBeNull();
	});
});
