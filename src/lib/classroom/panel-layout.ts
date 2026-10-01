/**
 * EACH PERSON ARRANGES THE CLASS PAGE AND THE ITEM PAGE (ledger 0360, report
 * R23, phase 1 as Mr. Pina decided it on 2026-09-30): hide, show and reorder
 * the panels on those two pages, saved to their account, with a Reset.
 *
 * Pure: no Svelte, no DOM, no store and no clock. The preference store keeps a
 * `panels` group (`$lib/preferences/classroom`, read through
 * `readPanelLayout` below), `PanelLayoutEditor` edits it, `PanelStack` renders
 * a page through `resolvePanels`, and `PanelsHiddenNote` says what is hidden.
 *
 * THE PANEL IDS ARE A STORED VOCABULARY AND ARE APPEND-ONLY. They sit in
 * `profiles.preferences.classroom.panels` on real rows, so renaming one turns
 * somebody's arrangement back into the default with nothing saying why --
 * `curriculum.ts`'s `SECTIONS` reason. A panel a later build removes is
 * dropped on read (`readPanelLayout`), never coerced into another.
 *
 * WHAT IS NOT A PANEL, AND STAYS PUT. The item inspector, the item's hero (its
 * h1, due date and points) and the page footer; the class page's notices
 * (quick posts, R22: "at the top, unmistakably") and the drop overlay. Those
 * are the page's frame, not its sections. The notices sit directly under the
 * class header while it leads the page, which is the page with nothing stored,
 * and FIRST on the page whenever somebody has moved anything above the header,
 * so no arrangement can put a teacher's notice below a student's search, their
 * videos or the posts (`classNoticesFirst`).
 *
 * THE ANCHOR IS NEVER MOVED AND NEVER HIDDEN, AND IT IS WHY A REORDER CANNOT
 * RELOAD A STUDENT'S WORK. Moving an `<iframe>` in the DOM reloads it, and a
 * ported HTML worksheet is an iframe: one keyed list over every panel would
 * reload an open worksheet on every reorder. So each page has one ANCHOR --
 * the posts on the class page, the work on the item page -- rendered between
 * two keyed lists and outside both (`PanelStack`). Panels move around it; it
 * never moves itself.
 *
 * RENDERING IS DOM ORDER, NEVER CSS `order`, which would break the reading
 * order and the tab order apart from what is on screen.
 *
 * A HIDDEN PANEL IS NOT RENDERED AT ALL, so whatever it polls stops: hiding the
 * class tools or the teams is a measured load reduction, not a `display:none`.
 */

import type { ItemLayout } from './attachments';

export type PanelPage = 'class' | 'item';
/** The same two roles the settings panel offers by (`SettingRole`). */
export type PanelRole = 'student' | 'manager';

export interface PanelDef {
	id: string;
	/** The word the editor and the hidden-panels note use. */
	label: string;
	/** May this person hide it. False keeps its move controls and says why. */
	hideable: boolean;
	/** The page's one fixed panel: never moved, never hidden. */
	anchor?: true;
	/** Who the editor lists it for. */
	roles: readonly PanelRole[];
	/** Why it cannot be hidden, in a sentence, where `hideable` is false. */
	keep?: string;
	/**
	 * A PIECE OF ANOTHER PANEL, by that panel's id: it renders INSIDE its host,
	 * in the host's own order, so it shows and hides but never moves on its
	 * own. The class header's tools, theme vote and posting keys (ledger 0360,
	 * R19 put them in one row under the class name). A stored order naming a
	 * piece is read and ignored for placement, never an error.
	 */
	within?: string;
}

/** What is stored, per page. An EMPTY order means "the page's own default order". */
export interface PanelLayout {
	order: string[];
	hidden: string[];
}

export const PANEL_ID = /^[a-z][a-z-]{0,31}$/;

const BOTH: readonly PanelRole[] = ['student', 'manager'];

/**
 * THE CLASS PAGE, in the order it renders today. `tools` and `teams` are the
 * section layout's (handed to ClassView as snippets); the rest is ClassView's.
 *
 * THE CLASS HEADER IS ONE PANEL WITH THREE PIECES (ledger 0360, R19 on R23).
 * The compact header put the tools, the theme vote and a teacher's posting
 * keys in ONE key row under the class name, which is what freed the top of
 * the page, so they are not panels that move any more: `banner` (the header,
 * the page's h1 in it) moves and is never hidden, and `tools`, `theme` and
 * `actions` are pieces `within` it that show and hide in the header's own
 * order. Their ids are kept, because they are stored. `teams` (the posted
 * teams, under the header and its notices) and `find` and `videos` move
 * freely; `stream` is the anchor. Hiding `teams` also takes a teacher's teams
 * key out of the header, since both say what is posted.
 *
 * The array is in render order (the pieces beside their host), which is the
 * order the editor lists them and the hidden-panels line names them in.
 */
export const CLASS_PANELS: readonly PanelDef[] = [
	{
		id: 'banner',
		label: 'Class header',
		hideable: false,
		roles: BOTH,
		keep: 'It holds the name of the class.'
	},
	{ id: 'tools', label: 'Class tools', hideable: true, roles: BOTH, within: 'banner' },
	{ id: 'theme', label: 'Class theme vote', hideable: true, roles: BOTH, within: 'banner' },
	{ id: 'actions', label: 'Quick post, new post and units', hideable: true, roles: ['manager'], within: 'banner' },
	{ id: 'teams', label: 'Teams', hideable: true, roles: BOTH },
	{ id: 'find', label: 'Search and filters', hideable: true, roles: BOTH },
	{ id: 'videos', label: 'Videos', hideable: true, roles: BOTH },
	{ id: 'stream', label: 'Posts', hideable: false, anchor: true, roles: BOTH, keep: 'The class itself.' }
];

/**
 * THE ITEM PAGE. `notebook` is an obligation (what a student has to do about
 * this item) and `reference` is a material's own content, so both move and
 * neither hides. `work` is the anchor and exists on an assignment only.
 */
export const ITEM_PANELS: readonly PanelDef[] = [
	{ id: 'deck', label: 'Slides', hideable: true, roles: BOTH },
	{
		id: 'notebook',
		label: 'Notebook check-in',
		hideable: false,
		roles: BOTH,
		keep: 'It is something this item asks of you.'
	},
	{ id: 'links', label: 'Links', hideable: true, roles: BOTH },
	{ id: 'files', label: 'Files', hideable: true, roles: BOTH },
	{ id: 'body', label: 'Instructions', hideable: true, roles: BOTH },
	{
		id: 'reference',
		label: 'Reference document',
		hideable: false,
		roles: BOTH,
		keep: 'It is the material itself.'
	},
	{ id: 'rubric', label: 'How this is graded', hideable: true, roles: BOTH },
	{ id: 'work', label: 'Work area', hideable: false, anchor: true, roles: BOTH, keep: 'The assignment itself.' }
];

export function panelsFor(page: PanelPage): readonly PanelDef[] {
	return page === 'class' ? CLASS_PANELS : ITEM_PANELS;
}

export function panelDef(page: PanelPage, id: string): PanelDef | null {
	return panelsFor(page).find((p) => p.id === id) ?? null;
}

/** The page's anchor id: `stream` on the class page, `work` on the item page. */
export function anchorOf(page: PanelPage): string {
	return panelsFor(page).find((p) => p.anchor)!.id;
}

/** The pieces rendered inside a panel (`within`), in its own order. None on the item page. */
export function piecesOf(page: PanelPage, host: string): PanelDef[] {
	return panelsFor(page).filter((p) => p.within === host);
}

/** Is this id a piece of another panel, which never takes a place in an order. */
function isPiece(page: PanelPage, id: string): boolean {
	return !!panelDef(page, id)?.within;
}

/**
 * The class page's default order: exactly the order it renders today. Only
 * the panels that MOVE are in it -- the header's pieces ride inside the header.
 */
export function classPanelDefaults(): string[] {
	return CLASS_PANELS.filter((p) => !p.within).map((p) => p.id);
}

/**
 * THE ITEM PAGE'S DEFAULT ORDER FOR ONE ITEM, which depends on where its
 * author placed the links and the files (0193). The rubric is LAST, after the
 * work, and that is report R20 (a2fe2f8f): "the rubric should be at the
 * bottom". A person's own order still moves it anywhere.
 */
export function itemPanelDefaults(layout: Pick<ItemLayout, 'links' | 'files'> = { links: 'bottom', files: 'bottom' }): string[] {
	const out = ['deck', 'notebook'];
	if (layout.links === 'top') out.push('links');
	if (layout.files === 'top') out.push('files');
	out.push('body', 'reference');
	if (layout.links !== 'top') out.push('links');
	if (layout.files !== 'top') out.push('files');
	out.push('work', 'rubric');
	return out;
}

/** The page's generic default, the one the settings editor shows (the item page with links and files below). */
export function panelDefaults(page: PanelPage): string[] {
	return page === 'class' ? classPanelDefaults() : itemPanelDefaults();
}

/** The panels a role is offered on a page, in registry order. */
export function panelsForRole(page: PanelPage, role: PanelRole): PanelDef[] {
	return panelsFor(page).filter((p) => p.roles.includes(role));
}

function dedupeKnown(raw: unknown, keep: (id: string) => boolean, max: number): string[] {
	if (!Array.isArray(raw)) return [];
	const out: string[] = [];
	for (const v of raw) {
		if (typeof v !== 'string' || !PANEL_ID.test(v) || !keep(v) || out.includes(v)) continue;
		if (out.length >= max) break;
		out.push(v);
	}
	return out;
}

/**
 * A STORED LAYOUT TO ONE THE PAGE CAN RENDER, or null for "the default".
 *
 * A VISIBILITY FILTER, so it fails toward SHOWING: an unknown id is dropped
 * (never mapped to a known one), a duplicate is dropped, a non-string is
 * dropped, and `hidden` keeps only panels that may be hidden -- the anchor and
 * the unhideable panels can never be hidden by a stored value, whatever wrote
 * it. Both lists empty is null, so a layout that says nothing is the default.
 */
export function readPanelLayout(raw: unknown, page: PanelPage): PanelLayout | null {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
	const r = raw as Record<string, unknown>;
	const defs = panelsFor(page);
	// A piece (`within`) is still a known id and is kept: it is in the stored
	// vocabulary. It takes no place of its own, so an order naming one (an
	// arrangement saved before the header held them) is placed without it by
	// `mergePanelOrder`, which drops every id that is not a page default.
	const known = (id: string) => defs.some((p) => p.id === id);
	const hideable = (id: string) => defs.some((p) => p.id === id && p.hideable && !p.anchor);
	const order = dedupeKnown(r.order, known, defs.length);
	const hidden = dedupeKnown(r.hidden, hideable, defs.length);
	return order.length || hidden.length ? { order, hidden } : null;
}

/**
 * A STORED ORDER OVER A PAGE'S DEFAULTS: the stored ids first, in the stored
 * order, then every default the stored order does not mention, each placed
 * right after the nearest default that precedes it and IS placed (or first,
 * when none does). So a panel a later build adds lands where its default puts
 * it rather than at the end, and an empty stored order is the defaults
 * exactly. Ids not among the defaults are dropped: a `work` stored by an
 * assignment means nothing on a material.
 */
export function mergePanelOrder(stored: readonly string[], defaults: readonly string[]): string[] {
	const out = stored.filter((id, i) => defaults.includes(id) && stored.indexOf(id) === i);
	if (out.length === 0) return [...defaults];
	defaults.forEach((id, i) => {
		if (out.includes(id)) return;
		let at = 0;
		for (let j = i - 1; j >= 0; j--) {
			const k = out.indexOf(defaults[j]);
			if (k >= 0) {
				at = k + 1;
				break;
			}
		}
		out.splice(at, 0, id);
	});
	return out;
}

export interface ResolvedPanels {
	/** Rendered before the anchor, in this order. */
	above: string[];
	/** The anchor, when this page renders one (an item that is not an assignment has none). */
	anchor: string | null;
	/** Rendered after the anchor, in this order. */
	below: string[];
	/**
	 * Panels that would have rendered and are hidden by this person: what the
	 * note names. A hidden PIECE is listed right after its host, so the line
	 * reads in the page's order; a piece that is not hidden is in no list (its
	 * host renders it).
	 */
	hidden: string[];
}

/**
 * WHAT A PAGE RENDERS, AND WHERE. `present` is the set of panels that have
 * something to show on this page right now -- the page's own `{#if}`
 * conditions, unchanged -- so a hidden panel that would not have rendered
 * anyway is not reported as hidden. The anchor is never in `above`, `below`
 * or `hidden`; a panel is in exactly one of the three lists or none.
 */
export function resolvePanels(
	page: PanelPage,
	defaults: readonly string[],
	layout: PanelLayout | null,
	present: Iterable<string>
): ResolvedPanels {
	const anchorId = anchorOf(page);
	const here = new Set(present);
	const order = mergePanelOrder(layout?.order ?? [], defaults);
	const hiddenIds = new Set(
		(layout?.hidden ?? []).filter((id) => {
			const def = panelDef(page, id);
			return !!def && def.hideable && !def.anchor;
		})
	);
	const out: ResolvedPanels = { above: [], anchor: null, below: [], hidden: [] };
	let passed = false;
	for (const id of order) {
		if (id === anchorId) {
			passed = true;
			if (here.has(id)) out.anchor = id;
			continue;
		}
		if (!here.has(id) || isPiece(page, id)) continue;
		if (hiddenIds.has(id)) {
			out.hidden.push(id);
			continue;
		}
		(passed ? out.below : out.above).push(id);
		for (const piece of piecesOf(page, id)) {
			if (here.has(piece.id) && hiddenIds.has(piece.id)) out.hidden.push(piece.id);
		}
	}
	return out;
}

/**
 * The order the editor shows a role: the stored order over the page's generic
 * default, the role's panels only. The panels that move, only: the editor
 * lists each one's pieces (`piecesOf`) under it.
 */
export function editorOrder(page: PanelPage, role: PanelRole, layout: PanelLayout | null): string[] {
	const mine = new Set(panelsForRole(page, role).map((p) => p.id));
	return mergePanelOrder(layout?.order ?? [], panelDefaults(page)).filter((id) => mine.has(id));
}

/**
 * MOVE ONE PANEL TO AN INDEX OF THE LIST IT IS IN. The anchor itself is never
 * the panel moved (the editor offers it no grip), though another panel may be
 * moved past it, which is how a panel changes sides.
 */
export function movePanel(page: PanelPage, order: readonly string[], id: string, toIndex: number): string[] {
	const from = order.indexOf(id);
	if (from < 0 || id === anchorOf(page) || isPiece(page, id)) return [...order];
	const to = Math.max(0, Math.min(order.length - 1, Math.floor(toIndex)));
	if (to === from) return [...order];
	const next = [...order];
	next.splice(from, 1);
	next.splice(to, 0, id);
	return next;
}

/**
 * THE STORED FORM OF AN EDIT, as small as it can be: an order equal to the
 * role's default is stored EMPTY, so a person who only hides keeps the item
 * page's per-item placement of links and files (0193); `hidden` is kept in
 * registry order; both empty is null, which is the default.
 */
export function normalizePanelLayout(
	page: PanelPage,
	role: PanelRole,
	layout: PanelLayout | null
): PanelLayout | null {
	const read = readPanelLayout(layout, page);
	if (!read) return null;
	const order = read.order.length && same(editorOrder(page, role, read), editorOrder(page, role, null))
		? []
		: read.order;
	const hidden = panelsFor(page)
		.map((p) => p.id)
		.filter((id) => read.hidden.includes(id));
	return order.length || hidden.length ? { order, hidden } : null;
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Hide or show one panel. Refuses the anchor and every panel that may not be hidden (the layout comes back unchanged). */
export function togglePanelHidden(
	page: PanelPage,
	role: PanelRole,
	layout: PanelLayout | null,
	id: string
): PanelLayout | null {
	const def = panelDef(page, id);
	if (!def || !def.hideable || def.anchor) return layout;
	const hidden = layout?.hidden ?? [];
	const next = hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id];
	return normalizePanelLayout(page, role, { order: layout?.order ?? [], hidden: next });
}

/** One moved order, stored. */
export function withPanelOrder(
	page: PanelPage,
	role: PanelRole,
	layout: PanelLayout | null,
	order: readonly string[]
): PanelLayout | null {
	return normalizePanelLayout(page, role, { order: [...order], hidden: layout?.hidden ?? [] });
}

/**
 * DO THE CLASS PAGE'S NOTICES LEAD IT, rather than sitting under the header:
 * true exactly when something the person put above the header renders there.
 * With nothing stored the header is first, so the notices are where they have
 * always been, directly under it.
 */
export function classNoticesFirst(resolved: Pick<ResolvedPanels, 'above'>): boolean {
	return resolved.above[0] !== 'banner';
}

/** The labels of some panel ids, in the order given, for the hidden-panels note. */
export function panelLabels(page: PanelPage, ids: readonly string[]): string[] {
	return ids.map((id) => panelDef(page, id)?.label ?? id);
}

/** The settings summary for one page: what this person's arrangement amounts to, in words. */
export function panelSummary(page: PanelPage, role: PanelRole, layout: PanelLayout | null): string {
	const norm = normalizePanelLayout(page, role, layout);
	const mine = new Set(panelsForRole(page, role).map((p) => p.id));
	const hidden = (norm?.hidden ?? []).filter((id) => mine.has(id)).length;
	const ordered = (norm?.order.length ?? 0) > 0;
	const order = ordered ? 'Your order' : 'Standard order';
	return hidden ? `${order}, ${hidden} hidden` : `${order}, nothing hidden`;
}
