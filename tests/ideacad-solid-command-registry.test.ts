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
import { COMMANDS, COMMAND_GROUPS, DEFAULT_QUICK_TOOLS, TOOL_IDS, acceptsSelection, commandById, effectiveShortcuts, keyFromEvent, keyLabel, keyRefusal, normalizeKey, recordRecent, searchCommands, shortcutConflict } from '../src/lib/ideacad/solid/command-registry';
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
		const actions = ['undo', 'redo', 'delete', 'fit', 'view-front', 'view-top', 'view-right', 'view-iso', 'normal-to', 'planes', 'view-menu', 'panel-objects', 'panel-reference', 'panel-mates', 'panel-section', 'panel-addons', 'export', 'search', 'preferences', 'help'];
		for (const id of actions) { expect(commandById(id), id).toBeDefined(); expect(commandById(id)!.tool, id).toBeUndefined(); }
		expect(COMMANDS).toHaveLength(TOOL_IDS_BEFORE.length + actions.length);
	});
	it('every command has a name, a one-line description, an icon and a known group; no description is a paragraph or carries a long dash', () => {
		for (const c of COMMANDS) {
			expect(c.name.length, c.id).toBeGreaterThan(1);
			expect(c.description.length, c.id).toBeGreaterThan(8);
			expect(c.description.length, c.id).toBeLessThan(90);
			expect(c.description, c.id).not.toMatch(/\n|—/);
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
