/**
 * EVERY COMMAND THE MODELER HAS, REGISTERED ONCE. A tool (it arms the
 * viewport) and an action (it runs now) are both a `Command` here, with the
 * name a student reads, the icon the palette draws, a one-line description,
 * the group search shows, the selection it can act on, and its optional
 * default keys. The palette (`tools.ts` derives `TOOLS` from this list),
 * command search, the one shortcut layer in `SolidWorkspace.svelte`, the
 * preferences panel, and later the right-click menu, the context toolbar and
 * the tutorial all read this list. Nothing hard-codes a tool list twice.
 *
 * THE 23 TOOL IDS ARE STABLE. They are pinned by tests and stored in
 * preferences (the quick toolbar), so a tool is renamed by its `name`, never
 * by its `id`. A non-tool command's id is stored too (a remapped shortcut, a
 * recently used command), so the same rule holds for every id here.
 *
 * SHORTCUTS ARE ALWAYS OPTIONAL. Every default key can be remapped or turned
 * off in preferences (WCAG 2.1.4), and a key a student needs for something
 * else is refused by sentence, never silently taken: digits, the point and
 * the minus sign type values, Escape clears, Enter finishes, Tab moves focus.
 */
import type { Tool } from './viewport';
import type { EntityKind, Selection } from './types';

export type CommandGroup = 'Select' | 'Sketch' | 'Features' | 'Move' | 'Assembly' | 'Reference' | 'Inspect' | 'Edit' | 'View' | 'Panels' | 'File' | 'Help';
/** The groups in the order search and the preferences panel list them. */
export const COMMAND_GROUPS: readonly CommandGroup[] = ['Select', 'Sketch', 'Features', 'Move', 'Assembly', 'Reference', 'Inspect', 'Edit', 'View', 'Panels', 'File', 'Help'];
export type ViewName = 'front' | 'top' | 'right' | 'iso';
export type PanelId = 'objects' | 'reference' | 'mates' | 'section' | 'addons';

/** What a command can act on: the kinds it takes and how many. `min` 0 means it also runs with nothing selected. */
export interface SelectionRule { kinds: readonly EntityKind[]; min: number; max?: number }

/** What the workspace hands a command to run it, and what a command asks to decide whether it can run now. */
export interface CommandContext {
	readonly selections: Selection[];
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	readonly canWrite: boolean;
	/** True when Normal To has something to face: a flat face, a plane, a sketch, or an open sketch. */
	readonly canNormalTo: boolean;
	setTool(tool: Tool): void;
	undo(): void;
	redo(): void;
	deleteSelection(): void;
	fit(): void;
	view(name: ViewName): void;
	normalTo(): void;
	togglePlanes(): void;
	togglePanel(panel: PanelId): void;
	openExport(): void;
	openSearch(group?: CommandGroup): void;
	openPreferences(): void;
	openHelp(): void;
}

export interface Command {
	id: string;
	name: string;
	/** One line, shown on hover and in search. Never a paragraph. */
	description: string;
	/** An SVG path in a 24 x 24 box, stroked. */
	icon: string;
	group: CommandGroup;
	accepts?: SelectionRule;
	/** Default keys, in the canonical spelling `normalizeKey` produces. The first is the one shown. */
	keys?: readonly string[];
	/** Extra words search matches, so a SolidWorks name or a plain word finds the command. */
	keywords?: readonly string[];
	/** The tool this command arms, for a tool. */
	tool?: Tool;
	run(ctx: CommandContext): void;
	/** Why the command cannot run right now, in a few words, or null when it can. */
	unavailable?(ctx: CommandContext): string | null;
}

const ANY: readonly EntityKind[] = ['body', 'face', 'edge', 'vertex', 'sketch', 'feature', 'reference'];
const tool = (id: Tool, name: string, description: string, icon: string, group: CommandGroup, extra: Partial<Command> = {}): Command => ({ id, name, description, icon, group, tool: id, run: (ctx) => ctx.setTool(id), ...extra });
const PLANE_TARGET: SelectionRule = { kinds: ['face', 'reference'], min: 0, max: 1 };

/**
 * THE LIST. The 23 tools come first, in the palette's own order, then the
 * commands that run at once. The order is the palette's and search's tie-break.
 */
export const COMMANDS: readonly Command[] = [
	tool('select', 'Select', 'Grab a face to push it, or an edge to move it.', 'M5 3l14 10-7 1-3 7z', 'Select'),
	tool('rectangle', 'Rectangle', 'Drag out a rectangle on a plane or flat face.', 'M4 6h16v12H4z', 'Sketch', { keys: ['r'], accepts: PLANE_TARGET, keywords: ['square', 'box', 'sketch'] }),
	tool('circle', 'Circle', 'Drag from the center to draw a circle.', 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 9v6m-3-3h6', 'Sketch', { keys: ['c'], accepts: PLANE_TARGET, keywords: ['round', 'sketch'] }),
	tool('line', 'Line', 'Join points and return to the first point to close a shape.', 'M4 18L9 5l11 12M2 16h4v4H2zM7 3h4v4H7zM18 15h4v4h-4z', 'Sketch', { keys: ['l'], accepts: PLANE_TARGET, keywords: ['polyline', 'sketch'] }),
	tool('polygon', 'Polygon', 'Drag from the center to draw a shape with equal sides.', 'M6 3h12l5 9-5 9H6l-5-9z', 'Sketch', { accepts: PLANE_TARGET, keywords: ['hexagon', 'sides', 'sketch'] }),
	tool('arc', 'Arc', 'Pick the center, start, and end of a curved profile.', 'M3 18a9 9 0 0 1 18 0M3 18h18M12 15v6m-3-3h6', 'Sketch', { accepts: PLANE_TARGET, keywords: ['curve', 'sketch'] }),
	tool('extrude', 'Extrude', 'Pull a sketch into a solid, or push it inward to cut.', 'M4 10l8-4 8 4-8 4zM4 10v8l8 4 8-4v-8M12 14v8M12 8V1m-3 3 3-3 3 3', 'Features', { keys: ['e'], accepts: { kinds: ['sketch', 'face'], min: 1, max: 1 }, keywords: ['boss', 'pull', 'cut', 'extrude cut'] }),
	tool('revolve', 'Revolve', 'Drag a sketch around an axis to make a round solid.', 'M12 2v20M8 6H4v12h4M16 5c7 3 7 11 0 14m0-14v5h5', 'Features', { accepts: { kinds: ['sketch', 'reference'], min: 1, max: 2 }, keywords: ['spin', 'lathe', 'turn'] }),
	tool('fillet', 'Fillet', 'Drag an edge to round it. Shift-click to round several at once.', 'M4 21V12a8 8 0 0 1 8-8h9M10 21V12a2 2 0 0 1 2-2h9', 'Features', { accepts: { kinds: ['edge', 'face'], min: 1 }, keywords: ['round', 'radius', 'blend'] }),
	tool('chamfer', 'Chamfer', 'Drag an edge to cut a flat bevel. Shift-click to bevel several at once.', 'M4 21V11l7-7h10M10 21V14l4-4h7', 'Features', { accepts: { kinds: ['edge', 'face'], min: 1 }, keywords: ['bevel'] }),
	tool('shell', 'Shell', 'Drag a face to hollow the body and open that face.', 'M4 5l8-3 8 3v14l-8 3-8-3zM7 7l5-2 5 2-5 2zM12 9v10M7 7v10l5 2 5-2V7', 'Features', { accepts: { kinds: ['face', 'body'], min: 1 }, keywords: ['hollow', 'wall'] }),
	tool('hole', 'Hole', 'Click a face to drill a standard clearance or tapped hole.', 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'Features', { accepts: { kinds: ['face'], min: 1, max: 1 }, keywords: ['drill', 'tap', 'bolt', 'hole wizard'] }),
	tool('move', 'Move', 'Drag a colored handle to move a body or selection.', 'M12 2v20M2 12h20M9 5l3-3 3 3M9 19l3 3 3-3M5 9l-3 3 3 3M19 9l3 3-3 3', 'Move', { accepts: { kinds: ['body', 'face', 'edge', 'vertex'], min: 1 }, keywords: ['translate', 'drag', 'position'] }),
	tool('rotate', 'Rotate', 'Drag a colored handle to turn the selected body.', 'M20 8a9 9 0 1 0 1 8M20 3v5h-5M12 9v6m-3-3h6', 'Move', { accepts: { kinds: ['body', 'face', 'edge', 'vertex'], min: 1 }, keywords: ['turn', 'spin'] }),
	tool('scale', 'Scale', 'Drag a colored handle to resize the selected body.', 'M4 11v9h9v-9zM13 11l8-8M15 3h6v6', 'Move', { accepts: { kinds: ['body', 'face', 'edge', 'vertex'], min: 1 }, keywords: ['resize', 'size'] }),
	tool('mate', 'Mate', 'Pick a face on each of two bodies to fit them together.', 'M3 8h8v8H3zM13 8h8v8h-8zM11 12h2', 'Assembly', { accepts: { kinds: ['face', 'edge', 'vertex'], min: 2, max: 2 }, keywords: ['join', 'assembly', 'concentric', 'coincident'] }),
	tool('linear-pattern', 'Linear pattern', 'Drag across for spacing and upward for more copies.', 'M2 10h5v8H2zM10 10h5v8h-5zM18 10h5v8h-5zM3 5h18m-3-3 3 3-3 3', 'Features', { accepts: { kinds: ['body', 'face', 'reference'], min: 1 }, keywords: ['array', 'copies', 'repeat'] }),
	tool('circular-pattern', 'Circular pattern', 'Drag upward to arrange more copies around an axis.', 'M9 1h6v6H9zM2 15h6v6H2zM16 15h6v6h-6zM4 11a8 8 0 0 1 2-4m12 0a8 8 0 0 1 2 4M9 21h6', 'Features', { accepts: { kinds: ['body', 'face', 'reference'], min: 1 }, keywords: ['array', 'copies', 'around', 'polar'] }),
	tool('reference', 'Reference', 'Add a plane, an axis or a point to build against.', 'M3 17l6-12 12 0-6 12zM12 5v14M6 11h12', 'Reference', { accepts: { kinds: ANY, min: 0 }, keywords: ['plane', 'axis', 'point', 'datum', 'reference geometry'] }),
	tool('measure', 'Measure', 'Click two things to read the distance or angle between them.', 'M3 17L17 3l4 4L7 21zM8 12l2 2M11 9l2 2M14 6l2 2', 'Inspect', { accepts: { kinds: ANY, min: 0, max: 2 }, keywords: ['distance', 'angle', 'size', 'clearance'] }),
	tool('draft', 'Draft', 'Tilt selected flat faces by an angle so a part releases from a mold.', 'M4 20h16M6 20L9 4h6l3 16', 'Features', { accepts: { kinds: ['face'], min: 1 }, keywords: ['taper', 'mold'] }),
	tool('sweep', 'Sweep', 'Run a closed sketch along an open path sketch or model edges.', 'M3 18c6 0 6-12 12-12h6M3 14c6 0 6-12 12-12', 'Features', { accepts: { kinds: ['sketch', 'edge'], min: 1 }, keywords: ['path', 'pipe', 'tube'] }),
	tool('loft', 'Loft', 'Blend two or more sketches into one solid, in order.', 'M4 20h16M8 4h8M4 20L8 4M20 20L16 4', 'Features', { accepts: { kinds: ['sketch'], min: 2 }, keywords: ['blend', 'transition'] }),

	{ id: 'undo', name: 'Undo', description: 'Take back the last change.', icon: 'M9 14L4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3', group: 'Edit', keys: ['Ctrl+z'], run: (ctx) => ctx.undo(), unavailable: (ctx) => (ctx.canUndo ? null : 'Nothing to undo') },
	{ id: 'redo', name: 'Redo', description: 'Bring back a change you took back.', icon: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3', group: 'Edit', keys: ['Ctrl+y', 'Ctrl+Shift+z'], run: (ctx) => ctx.redo(), unavailable: (ctx) => (ctx.canRedo ? null : 'Nothing to redo') },
	{ id: 'delete', name: 'Delete', description: 'Remove what is selected.', icon: 'M4 7h16M10 11v6M14 11v6M9 7V4h6v3M6 7l1 13h10l1-13', group: 'Edit', keys: ['Delete', 'Backspace'], accepts: { kinds: ANY, min: 1 }, keywords: ['remove', 'erase'], run: (ctx) => ctx.deleteSelection(), unavailable: (ctx) => (!ctx.canWrite ? 'View only' : ctx.selections.length ? null : 'Select something first') },

	{ id: 'fit', name: 'Fit', description: 'Zoom so the whole model fits.', icon: 'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5M8 9h8v6H8z', group: 'View', keys: ['f'], keywords: ['zoom', 'zoom to fit', 'frame'], run: (ctx) => ctx.fit() },
	{ id: 'view-front', name: 'Front', description: 'Look at the model from the front.', icon: 'M6 6h12v12H6z', group: 'View', keywords: ['front view', 'standard view'], run: (ctx) => ctx.view('front') },
	{ id: 'view-top', name: 'Top', description: 'Look straight down at the model.', icon: 'M3 17l5-9h13l-5 9z', group: 'View', keywords: ['top view', 'plan', 'standard view'], run: (ctx) => ctx.view('top') },
	{ id: 'view-right', name: 'Right', description: 'Look at the model from the right side.', icon: 'M8 3l8 5v13l-8-5z', group: 'View', keywords: ['right view', 'side', 'standard view'], run: (ctx) => ctx.view('right') },
	{ id: 'view-iso', name: 'Isometric', description: 'Look at the model from a corner.', icon: 'M12 2l9 5v10l-9 5-9-5V7zM3 7l9 5 9-5M12 12v10', group: 'View', keywords: ['iso', '3d', 'standard view'], run: (ctx) => ctx.view('iso') },
	{ id: 'normal-to', name: 'Normal To', description: 'Face the selected flat face, plane or sketch. Press again to flip.', icon: 'M4 15h16M12 15V3m-4 4 4-4 4 4M7 19h10', group: 'View', accepts: { kinds: ['face', 'reference', 'sketch'], min: 1, max: 1 }, keywords: ['perpendicular', 'face on', 'look at'], run: (ctx) => ctx.normalTo(), unavailable: (ctx) => (ctx.canNormalTo ? null : 'Select a flat face or plane') },
	{ id: 'planes', name: 'Show planes', description: 'Show or hide the Front, Top and Right planes.', icon: 'M3 17l6-12h12l-6 12zM9 5l6 12', group: 'View', keywords: ['datum', 'reference planes', 'front plane', 'top plane', 'right plane', 'origin'], run: (ctx) => ctx.togglePlanes() },
	{ id: 'view-menu', name: 'View menu', description: 'Pick a view by name.', icon: 'M12 2l9 5v10l-9 5-9-5V7zM12 12l9-5M12 12v10M12 12L3 7', group: 'View', keys: ['Space'], keywords: ['orientation', 'views'], run: (ctx) => ctx.openSearch('View') },

	{ id: 'panel-objects', name: 'Objects', description: 'Bodies and open sketches, with their material and color.', icon: 'M4 7l8-4 8 4-8 4zM4 12l8 4 8-4M4 17l8 4 8-4', group: 'Panels', keywords: ['bodies', 'material', 'color', 'mass'], run: (ctx) => ctx.togglePanel('objects') },
	{ id: 'panel-reference', name: 'Reference panel', description: 'Planes, axes and points.', icon: 'M3 17l6-12 12 0-6 12zM12 5v14M6 11h12', group: 'Panels', run: (ctx) => ctx.togglePanel('reference') },
	{ id: 'panel-mates', name: 'Mates panel', description: 'How bodies fit together.', icon: 'M3 8h8v8H3zM13 8h8v8h-8zM11 12h2', group: 'Panels', keywords: ['assembly'], run: (ctx) => ctx.togglePanel('mates') },
	{ id: 'panel-section', name: 'Section', description: 'Cut the view open along a plane.', icon: 'M4 4h16v16H4zM4 13h16', group: 'Panels', keywords: ['section view', 'cut away'], run: (ctx) => ctx.togglePanel('section') },
	{ id: 'panel-addons', name: 'Add-ons', description: 'Optional helpers such as IdeaBlade.', icon: 'M4 4h16v16H4zM12 8v8M8 12h8', group: 'Panels', keywords: ['ideablade', 'plugins', 'advisory'], run: (ctx) => ctx.togglePanel('addons') },

	{ id: 'export', name: 'Export', description: '3MF, STL, DXF or an IdeaCAD backup.', icon: 'M12 3v12M7 8l5-5 5 5M4 15v5h16v-5', group: 'File', keywords: ['save as', 'download', 'stl', '3mf', 'dxf', 'print'], run: (ctx) => ctx.openExport() },

	{ id: 'search', name: 'Search commands', description: 'Find any command by name.', icon: 'M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM15 15l6 6', group: 'Help', keys: ['w'], keywords: ['find', 'commands'], run: (ctx) => ctx.openSearch() },
	{ id: 'preferences', name: 'Preferences', description: 'Toolbar, shortcuts, planes, snaps and units.', icon: 'M12 9a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1', group: 'Help', keywords: ['settings', 'options', 'customize', 'shortcuts', 'keys', 'toolbar'], run: (ctx) => ctx.openPreferences() },
	{ id: 'help', name: 'Help', description: 'Short tasks to learn the modeler.', icon: 'M12 21a9 9 0 1 1 0-18 9 9 0 0 1 0 18zM9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17v.5', group: 'Help', keywords: ['tutorial', 'learn', 'how'], run: (ctx) => ctx.openHelp() }
];

const BY_ID = new Map(COMMANDS.map((c) => [c.id, c]));
export const commandById = (id: string): Command | undefined => BY_ID.get(id);
export const COMMAND_IDS: readonly string[] = COMMANDS.map((c) => c.id);
/** The tool commands, in the palette's order. */
export const TOOL_COMMANDS: readonly (Command & { tool: Tool })[] = COMMANDS.filter((c): c is Command & { tool: Tool } => !!c.tool);
export const TOOL_IDS: readonly Tool[] = TOOL_COMMANDS.map((c) => c.tool);
export const isToolId = (id: unknown): id is Tool => typeof id === 'string' && (TOOL_IDS as readonly string[]).includes(id);
/** The short palette a new student sees; the quick-tool preference starts here. */
export const DEFAULT_QUICK_TOOLS: readonly Tool[] = ['select', 'rectangle', 'circle', 'line', 'extrude', 'fillet', 'move'];

/* -------------------------------------------------------------------------
 * KEYS
 * ---------------------------------------------------------------------- */

const NAMED_KEYS = ['Space', 'Delete', 'Backspace', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Enter', 'Tab', ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`)];
const NAMED_LOWER = new Map(NAMED_KEYS.map((k) => [k.toLowerCase(), k]));
const MODIFIERS = ['Ctrl', 'Alt', 'Shift'] as const;
/**
 * The one spelling of a key: modifiers in the order Ctrl, Alt, Shift, then a
 * lowercase character or a named key, joined by `+`. `Cmd` and `Meta` read as
 * Ctrl, so a shortcut works the same on a Mac. Null for anything that is not a
 * key. `normalizeKey('shift+L')` is `'Shift+l'`.
 */
export function normalizeKey(spec: unknown): string | null {
	if (typeof spec !== 'string') return null;
	const raw = spec.trim();
	if (!raw) return null;
	/* A lone '+' is a key; split on '+' only where it separates parts. */
	const parts = raw === '+' ? ['+'] : raw.endsWith('++') ? [...raw.slice(0, -2).split('+'), '+'] : raw.split('+');
	const keyPart = parts.pop()!;
	const mods = new Set<string>();
	for (const p of parts) {
		const m = p.trim().toLowerCase();
		if (m === 'ctrl' || m === 'control' || m === 'cmd' || m === 'meta' || m === 'mod') mods.add('Ctrl');
		else if (m === 'alt' || m === 'option') mods.add('Alt');
		else if (m === 'shift') mods.add('Shift');
		else return null;
	}
	let key: string;
	if (keyPart === ' ') key = 'Space';
	else if (keyPart.length === 1) key = keyPart.toLowerCase();
	else { const named = NAMED_LOWER.get(keyPart.toLowerCase()) ?? (keyPart.toLowerCase() === 'del' ? 'Delete' : keyPart.toLowerCase() === 'esc' ? 'Escape' : null); if (!named) return null; key = named; }
	if (key.length === 1 && !/^[\x21-\x7e]$/.test(key)) return null;
	return [...MODIFIERS.filter((m) => mods.has(m)), key].join('+');
}
/** The canonical key for a keyboard event, or null for a lone modifier. A shifted symbol is its own character, so Shift is kept only for letters and named keys. */
export function keyFromEvent(e: { key: string; code?: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }): string | null {
	if (['Control', 'Shift', 'Alt', 'Meta', 'OS', 'AltGraph', 'CapsLock', 'Dead', 'Unidentified'].includes(e.key)) return null;
	let key = e.key === ' ' ? 'Space' : e.key;
	/* Alt on a Mac turns a letter into a symbol; the physical key is what the student pressed. */
	if (e.altKey && e.code && /^Key[A-Z]$/.test(e.code)) key = e.code.slice(3).toLowerCase();
	const single = key.length === 1;
	const letter = single && /^[a-z]$/i.test(key);
	const mods = [e.ctrlKey || e.metaKey ? 'Ctrl' : '', e.altKey ? 'Alt' : '', e.shiftKey && (letter || !single) ? 'Shift' : ''].filter(Boolean);
	return normalizeKey([...mods, key === '+' ? '+' : key].join('+').replace(/\+\+$/, '++'));
}
/** How a key reads on screen: `Ctrl+Shift+Z`, `Space`, `W`. */
export function keyLabel(spec: string): string {
	return spec.split(/\+(?!$)/).map((p) => (p.length === 1 ? p.toUpperCase() : p)).join('+');
}
/**
 * Why a key cannot be a shortcut, or null when it can. These keys already mean
 * something to a student at work, and a shortcut on one would take it away.
 */
export function keyRefusal(spec: string): string | null {
	const key = normalizeKey(spec);
	if (!key) return 'That is not a key a shortcut can use.';
	const bare = !key.includes('+') || key === '+';
	const last = key === '+' ? '+' : key.slice(key.lastIndexOf('+') + 1);
	if (last === 'Escape') return 'Escape always cancels and clears, so it cannot be a shortcut.';
	if (last === 'Enter') return 'Enter finishes a value or a shape, so it cannot be a shortcut.';
	if (last === 'Tab') return 'Tab moves between controls, so it cannot be a shortcut.';
	if (bare && /^[0-9.\-]$/.test(last)) return 'Digits, the point and the minus sign type values, so they cannot be shortcuts.';
	return null;
}

/** Stored shortcut choices: a command id to a key, or null for turned off. A command that is absent keeps its default keys. */
export type ShortcutOverrides = Readonly<Record<string, string | null>>;
/**
 * The keys each command answers to right now, and the reverse map the shortcut
 * layer reads. A choice the student made wins; a default whose key a choice
 * already took is dropped rather than shared, so no key ever runs two commands.
 */
export function effectiveShortcuts(overrides: ShortcutOverrides = {}, commands: readonly Command[] = COMMANDS): { byKey: Map<string, string>; byCommand: Map<string, string[]> } {
	const byKey = new Map<string, string>(), byCommand = new Map<string, string[]>();
	for (const c of commands) byCommand.set(c.id, []);
	const add = (id: string, key: string) => { if (byKey.has(key)) return; byKey.set(key, id); byCommand.get(id)?.push(key); };
	/* A stored choice counts only when it is null (turned off) or a usable key; anything else leaves the defaults standing. */
	const chosen = new Set<string>();
	for (const c of commands) {
		if (!(c.id in overrides)) continue;
		if (overrides[c.id] === null) { chosen.add(c.id); continue; }
		const key = normalizeKey(overrides[c.id]);
		if (key && !keyRefusal(key)) { chosen.add(c.id); add(c.id, key); }
	}
	for (const c of commands) {
		if (chosen.has(c.id)) continue;
		for (const k of c.keys ?? []) { const key = normalizeKey(k); if (key && !keyRefusal(key)) add(c.id, key); }
	}
	return { byKey, byCommand };
}
/**
 * Whether a student may give `id` the key `key`, as a sentence, or null. A key
 * another command already answers to is refused by naming that command, so the
 * student decides which one keeps it.
 */
export function shortcutConflict(id: string, key: string, overrides: ShortcutOverrides = {}, commands: readonly Command[] = COMMANDS): string | null {
	const refusal = keyRefusal(key);
	if (refusal) return refusal;
	const k = normalizeKey(key)!;
	const owner = effectiveShortcuts(overrides, commands).byKey.get(k);
	if (owner && owner !== id) return `${keyLabel(k)} already runs ${commands.find((c) => c.id === owner)?.name ?? owner}. Clear it there first.`;
	return null;
}

/* -------------------------------------------------------------------------
 * SEARCH
 * ---------------------------------------------------------------------- */

/**
 * Commands matching `query`, best first. A name that starts with the query
 * ranks first, then a name whose words start with every typed word, then a
 * name containing the query, then a match in the group, description or
 * keywords. Within a rank, the command used most recently comes first, then
 * the palette's order. An empty query lists every command, recent first.
 */
export function searchCommands(query: string, recent: readonly string[] = [], commands: readonly Command[] = COMMANDS, group?: CommandGroup): Command[] {
	const q = query.trim().toLowerCase().replace(/\s+/g, ' ');
	const tokens = q ? q.split(' ') : [];
	const recency = (id: string) => { const i = recent.indexOf(id); return i < 0 ? Infinity : i; };
	const order = new Map(commands.map((c, i) => [c.id, i]));
	const scored: { c: Command; score: number }[] = [];
	for (const c of commands) {
		if (group && c.group !== group) continue;
		const name = c.name.toLowerCase(), words = name.split(/[\s-]+/);
		const hay = [name, c.group.toLowerCase(), c.description.toLowerCase(), ...(c.keywords ?? []).map((k) => k.toLowerCase())].join(' | ');
		let score: number;
		if (!tokens.length) score = 0;
		else if (name.startsWith(q)) score = 0;
		else if (tokens.every((t) => words.some((w) => w.startsWith(t)))) score = 1;
		else if (name.includes(q)) score = 2;
		else if (tokens.every((t) => hay.includes(t))) score = 3;
		else continue;
		scored.push({ c, score });
	}
	return scored.sort((a, b) => a.score - b.score || recency(a.c.id) - recency(b.c.id) || order.get(a.c.id)! - order.get(b.c.id)!).map((s) => s.c);
}
/** The recently used list after running `id`: it moves to the front, the list keeps at most `max` known ids. */
export function recordRecent(recent: readonly string[], id: string, max = 20): string[] {
	return [id, ...recent.filter((r) => r !== id)].slice(0, max);
}
/** Whether a selection fits what a command accepts: the kinds and the count. A command with no rule accepts anything. */
export function acceptsSelection(command: Command, selections: readonly Selection[]): boolean {
	const rule = command.accepts;
	if (!rule) return true;
	if (selections.length < rule.min) return false;
	if (rule.max !== undefined && selections.length > rule.max) return false;
	return selections.every((s) => rule.kinds.includes(s.kind));
}
