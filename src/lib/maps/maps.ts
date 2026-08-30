/**
 * IDEA MAPS -- the pure, client-safe registry (CLAUDE.md "a pure, client-safe
 * registry per subsystem"). Plain data and pure helpers only: no Svelte, no
 * Supabase, no `$app`. Everything the editor and its tests both need to agree
 * on lives here once.
 *
 * TWO OF THESE HELPERS ARE MIRRORS OF SQL PREDICATES, AND THE SQL IS THE
 * BOUNDARY. `mapsKindPairOk` mirrors `_maps_kind_pair_ok` (0161) and
 * `mapsOutlineOk` mirrors `_maps_outline_ok` (0161). The mirrors exist so the
 * editor can surface a constraint BEFORE a person acts on it -- a kind picker
 * that only offers legal kinds, an outline form that refuses a two-point
 * polygon before the request leaves the machine -- never so a write can skip
 * the database's own check. `tests/maps-kind-rules.test.ts` pins each mirror
 * against the deployed function itself (IDEA_VERIFICATION_ADDENDA rule 8: a
 * mirror is compared against the function, never against its description), so
 * a drift between the two reddens rather than shipping.
 */

export type MapsKind = 'site' | 'building' | 'outdoor_zone' | 'room' | 'unit' | 'compartment';

/** Ladder order, roots first. The order is presentation; the RULE is the pair function. */
export const MAPS_KINDS: readonly MapsKind[] = [
	'site',
	'building',
	'outdoor_zone',
	'room',
	'unit',
	'compartment'
];

export const MAPS_KIND_LABELS: Record<MapsKind, string> = {
	site: 'Site',
	building: 'Building',
	outdoor_zone: 'Outdoor zone',
	room: 'Room',
	unit: 'Unit',
	compartment: 'Compartment'
};

/** What 0161's tree trigger admits at the root (parent_id null). */
export const MAPS_ROOT_KINDS: readonly MapsKind[] = ['site', 'building', 'outdoor_zone'];

/**
 * Mirror of `_maps_kind_pair_ok`, clause for clause. Total over the six kinds,
 * false for anything else -- exactly the SQL's `else false`.
 */
export function mapsKindPairOk(parentKind: string, childKind: string): boolean {
	switch (childKind) {
		case 'site':
			return false; // a site is always a root
		case 'building':
			return parentKind === 'site';
		case 'outdoor_zone':
			return parentKind === 'site' || parentKind === 'building';
		case 'room':
			return parentKind === 'building';
		case 'unit':
			return parentKind === 'room' || parentKind === 'outdoor_zone';
		case 'compartment':
			return parentKind === 'unit';
		default:
			return false;
	}
}

/**
 * Which kinds may be CREATED under a parent (null = the root). This is the
 * before-the-action face of the constraint: an add control renders one button
 * per member of this list and no button for anything else, so the illegal
 * nesting is never offerable.
 */
export function mapsAllowedChildKinds(parentKind: MapsKind | null): MapsKind[] {
	if (parentKind === null) return [...MAPS_ROOT_KINDS];
	return MAPS_KINDS.filter((k) => mapsKindPairOk(parentKind, k));
}

/**
 * Which kinds a node may be CHANGED to, given where it sits and what already
 * hangs inside it -- legal under its parent AND a legal parent of every
 * existing child. Mirrors the two checks `_maps_node_tree_ok` runs on a kind
 * update, so the picker cannot offer a change the trigger would refuse.
 */
export function mapsAllowedKinds(parentKind: MapsKind | null, childKinds: MapsKind[]): MapsKind[] {
	const underParent =
		parentKind === null
			? [...MAPS_ROOT_KINDS]
			: MAPS_KINDS.filter((k) => mapsKindPairOk(parentKind, k));
	return underParent.filter((k) => childKinds.every((c) => mapsKindPairOk(k, c)));
}

/**
 * The constraint in words, shown beside the add control BEFORE anyone acts.
 * One sentence per parent kind, ending with the empty case stated rather than
 * a control that silently offers nothing.
 */
export function mapsNestingSentence(parentKind: MapsKind | null): string {
	const allowed = mapsAllowedChildKinds(parentKind);
	if (allowed.length === 0) {
		return 'Nothing can sit inside a compartment. Items are placed in it instead.';
	}
	const names = allowed.map((k) => MAPS_KIND_LABELS[k].toLowerCase());
	const list =
		names.length === 1
			? `a ${names[0]}`
			: `a ${names.slice(0, -1).join(', a ')} or a ${names[names.length - 1]}`;
	if (parentKind === null) return `At the top level: ${list}.`;
	return `Inside a ${MAPS_KIND_LABELS[parentKind].toLowerCase()}: ${list}.`;
}

// ---------------------------------------------------------------------------
// Geometry -- typed inches (spec 7: accuracy comes from the typed numbers).
// ---------------------------------------------------------------------------

export type MapsOutline =
	| { kind: 'rect'; w: number; h: number }
	| { kind: 'polygon'; points: [number, number][] };

/**
 * Mirror of `_maps_outline_ok`. Same shape questions in the same order:
 * an object, kind rect with positive numeric w/h, or kind polygon with >= 3
 * two-number points. Pinned against the SQL in tests/maps-kind-rules.test.ts.
 */
export function mapsOutlineOk(outline: unknown): outline is MapsOutline {
	if (outline === null || typeof outline !== 'object' || Array.isArray(outline)) return false;
	const o = outline as Record<string, unknown>;
	if (o.kind === 'rect') {
		return (
			typeof o.w === 'number' &&
			Number.isFinite(o.w) &&
			typeof o.h === 'number' &&
			Number.isFinite(o.h) &&
			o.w > 0 &&
			o.h > 0
		);
	}
	if (o.kind === 'polygon') {
		const points = o.points;
		if (!Array.isArray(points) || points.length < 3) return false;
		return points.every(
			(p) =>
				Array.isArray(p) &&
				p.length === 2 &&
				typeof p[0] === 'number' &&
				Number.isFinite(p[0]) &&
				typeof p[1] === 'number' &&
				Number.isFinite(p[1])
		);
	}
	return false;
}

/**
 * A typed inch value. Plain decimal inches ("28", "3.75", ".5"); whitespace
 * trimmed the person's way. Returns null for anything that is not one number,
 * so the caller can refuse before the request rather than after. An empty
 * field is a deliberate "no value" and is answered as `empty`.
 */
export function parseInches(text: string): { kind: 'empty' } | { kind: 'value'; value: number } | { kind: 'bad' } {
	const trimmed = text.trim();
	if (trimmed === '') return { kind: 'empty' };
	if (!/^-?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return { kind: 'bad' };
	const value = Number(trimmed);
	if (!Number.isFinite(value)) return { kind: 'bad' };
	return { kind: 'value', value };
}

/**
 * PostgREST serializes `numeric` as a JSON number, but the test shim's pg
 * driver hands the same column back as a string -- and a component that calls
 * `.toFixed` on a string dies. One coercion, at the edge, for both shapes.
 */
export function num(value: number | string | null | undefined): number | null {
	if (value === null || value === undefined) return null;
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : null;
}

export function formatInches(value: number | string | null | undefined): string {
	const n = num(value);
	return n === null ? '' : String(n);
}

/**
 * Polygon entry: one "x, y" pair per line, inches in the parent's frame.
 * Reports the first bad line by number so the refusal names its location.
 */
export function parsePolygonText(
	text: string
): { ok: true; points: [number, number][] } | { ok: false; problem: string } {
	const lines = text
		.split('\n')
		.map((line, i) => ({ line: line.trim(), n: i + 1 }))
		.filter(({ line }) => line !== '');
	const points: [number, number][] = [];
	for (const { line, n } of lines) {
		const parts = line.split(',').map((p) => p.trim());
		if (parts.length !== 2) {
			return { ok: false, problem: `Line ${n} needs exactly one "x, y" pair of inches.` };
		}
		const x = parseInches(parts[0]);
		const y = parseInches(parts[1]);
		if (x.kind !== 'value' || y.kind !== 'value') {
			return { ok: false, problem: `Line ${n} is not two numbers. Write inches like "12, 4.5".` };
		}
		points.push([x.value, y.value]);
	}
	if (points.length < 3) {
		return { ok: false, problem: 'A polygon outline needs at least 3 corner points.' };
	}
	return { ok: true, points };
}

export function polygonText(points: [number, number][]): string {
	return points.map(([x, y]) => `${x}, ${y}`).join('\n');
}

// ---------------------------------------------------------------------------
// Rows, as the 0161 tables project them.
// ---------------------------------------------------------------------------

export type MapsStatus = 'draft' | 'published';

export interface MapsNode {
	id: string;
	parent_id: string | null;
	kind: MapsKind;
	name: string;
	subtype: string | null;
	description: string | null;
	outline: MapsOutline | null;
	position_x_in: number | string | null;
	position_y_in: number | string | null;
	rotation_deg: number | string | null;
	elevation_order: number | null;
	elevation_h_in: number | string | null;
	elevation_w_in: number | string | null;
	status: MapsStatus;
	published_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface MapsItemType {
	id: string;
	name: string;
	aliases: string[];
	tags: string[];
	category: string | null;
	brand: string | null;
	model: string | null;
	part_number: string | null;
	description: string | null;
	status: MapsStatus;
	published_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface MapsItem {
	id: string;
	item_type_id: string | null;
	node_id: string;
	name: string | null;
	serial: string | null;
	notes: string | null;
	status: MapsStatus;
	published_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface MapsStock {
	id: string;
	item_type_id: string;
	node_id: string;
	qty: number;
	status: MapsStatus;
	published_at: string | null;
	created_at: string;
	updated_at: string;
}

/** A staged edit of a published object -- `maps_revisions` where state='pending'. */
export interface MapsPending {
	id: string;
	node_id: string | null;
	item_type_id: string | null;
	item_id: string | null;
	stock_id: string | null;
	snapshot: Record<string, unknown>;
	created_at: string;
}

export type MapsTable = 'maps_nodes' | 'maps_item_types' | 'maps_items' | 'maps_stock';

/** The revision table's FK column for each content table -- 0161's own mapping. */
export const MAPS_PENDING_COLUMN: Record<MapsTable, keyof MapsPending> = {
	maps_nodes: 'node_id',
	maps_item_types: 'item_type_id',
	maps_items: 'item_id',
	maps_stock: 'stock_id'
};

export interface MapsEditorData {
	nodes: MapsNode[];
	itemTypes: MapsItemType[];
	items: MapsItem[];
	stock: MapsStock[];
	pending: MapsPending[];
}

export function pendingFor(pending: MapsPending[], table: MapsTable, id: string): MapsPending | null {
	const col = MAPS_PENDING_COLUMN[table];
	return pending.find((p) => p[col] === id) ?? null;
}

/**
 * The three states a card can be in, and the third is the one the whole model
 * exists for: `pending` means the object is published AND a staged edit sits
 * on it that the public cannot see yet.
 */
export type MapsPublishState = 'draft' | 'published' | 'pending';

export function mapsPublishState(
	row: { status: MapsStatus },
	pending: MapsPending | null
): MapsPublishState {
	if (row.status === 'draft') return 'draft';
	return pending ? 'pending' : 'published';
}

// ---------------------------------------------------------------------------
// Tree arithmetic.
// ---------------------------------------------------------------------------

const byName = (a: { name: string | null }, b: { name: string | null }) =>
	(a.name ?? '').localeCompare(b.name ?? '');

export function childrenOf(nodes: MapsNode[], parentId: string | null): MapsNode[] {
	return nodes.filter((n) => n.parent_id === parentId).sort(byName);
}

export interface MapsTreeRow {
	node: MapsNode;
	depth: number;
}

/** Depth-first flattening, siblings by name -- the shape the tree renders. */
export function mapsTreeRows(nodes: MapsNode[]): MapsTreeRow[] {
	const rows: MapsTreeRow[] = [];
	const walk = (parentId: string | null, depth: number) => {
		for (const node of childrenOf(nodes, parentId)) {
			rows.push({ node, depth });
			walk(node.id, depth + 1);
		}
	};
	walk(null, 0);
	return rows;
}

/** The node and everything under it, parents before children. */
export function mapsSubtreeIds(nodes: MapsNode[], rootId: string): string[] {
	const ids: string[] = [];
	const walk = (id: string) => {
		ids.push(id);
		for (const child of childrenOf(nodes, id)) walk(child.id);
	};
	walk(rootId);
	return ids;
}

/** "IDEA Building / Machine Shop / Tool Chest A" -- the containment chain in words. */
export function mapsNodePath(nodes: MapsNode[], id: string): string {
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const parts: string[] = [];
	let cursor = byId.get(id) ?? null;
	let hops = 0;
	while (cursor && hops < 50) {
		parts.unshift(cursor.name);
		cursor = cursor.parent_id ? (byId.get(cursor.parent_id) ?? null) : null;
		hops += 1;
	}
	return parts.join(' / ');
}

/**
 * Legal new parents for a node: every node whose kind may contain this one.
 * The ladder makes a descendant unrepresentable as a parent (a legal parent's
 * kind is always strictly higher), so no cycle check is needed beyond the pair
 * rule -- the same argument 0161's header makes for the trigger.
 */
export function mapsLegalParents(node: MapsNode, nodes: MapsNode[]): MapsNode[] {
	return nodes.filter((n) => n.id !== node.id && mapsKindPairOk(n.kind, node.kind)).sort(byName);
}

// ---------------------------------------------------------------------------
// Publish planning.
// ---------------------------------------------------------------------------

export interface MapsPublishStep {
	table: MapsTable;
	id: string;
	label: string;
}

/**
 * Everything in a node's subtree that a publish would change, parents before
 * children so the tree goes public top-down: every node, item and stock row
 * that is a draft or carries a pending edit -- PLUS any DRAFT item type an
 * included item or stock row points at, because publishing a placement whose
 * type stays invisible would put a row on the public map that names nothing.
 * The confirm renders these counts before anything runs.
 */
export function mapsSubtreePublishPlan(data: MapsEditorData, rootId: string): MapsPublishStep[] {
	const ids = mapsSubtreeIds(data.nodes, rootId);
	const inSubtree = new Set(ids);
	const steps: MapsPublishStep[] = [];
	const needs = (row: { status: MapsStatus; id: string }, table: MapsTable) =>
		row.status === 'draft' || pendingFor(data.pending, table, row.id) !== null;

	const typeIds = new Set<string>();
	for (const item of data.items) {
		if (inSubtree.has(item.node_id) && item.item_type_id && needs(item, 'maps_items')) {
			typeIds.add(item.item_type_id);
		}
	}
	for (const s of data.stock) {
		if (inSubtree.has(s.node_id) && needs(s, 'maps_stock')) typeIds.add(s.item_type_id);
	}
	for (const t of data.itemTypes) {
		if (typeIds.has(t.id) && needs(t, 'maps_item_types')) {
			steps.push({ table: 'maps_item_types', id: t.id, label: t.name });
		}
	}
	for (const id of ids) {
		const node = data.nodes.find((n) => n.id === id);
		if (node && needs(node, 'maps_nodes')) {
			steps.push({ table: 'maps_nodes', id, label: node.name });
		}
	}
	for (const item of data.items) {
		if (inSubtree.has(item.node_id) && needs(item, 'maps_items')) {
			steps.push({ table: 'maps_items', id: item.id, label: mapsItemLabel(item, data.itemTypes) });
		}
	}
	for (const s of data.stock) {
		if (inSubtree.has(s.node_id) && needs(s, 'maps_stock')) {
			const type = data.itemTypes.find((t) => t.id === s.item_type_id);
			steps.push({ table: 'maps_stock', id: s.id, label: type?.name ?? 'Stock placement' });
		}
	}
	return steps;
}

/** An item renders its own name when it has one, its type's otherwise (0161's named-or-typed rule). */
export function mapsItemLabel(item: MapsItem, itemTypes: MapsItemType[]): string {
	if (item.name) return item.name;
	const type = itemTypes.find((t) => t.id === item.item_type_id);
	return type?.name ?? 'Unnamed item';
}

// ---------------------------------------------------------------------------
// Content snapshots -- one builder per table, used BOTH as the update patch
// for a draft row and as the pending-revision snapshot for a published one,
// so the two write shapes cannot drift. Every content column is always
// present; maps_publish itself strips id/status/stamps.
// ---------------------------------------------------------------------------

export interface MapsNodeContent {
	parent_id: string | null;
	kind: MapsKind;
	name: string;
	subtype: string | null;
	description: string | null;
	outline: MapsOutline | null;
	position_x_in: number | null;
	position_y_in: number | null;
	rotation_deg: number | null;
	elevation_order: number | null;
	elevation_h_in: number | null;
	elevation_w_in: number | null;
}

export interface MapsItemTypeContent {
	name: string;
	aliases: string[];
	tags: string[];
	category: string | null;
	brand: string | null;
	model: string | null;
	part_number: string | null;
	description: string | null;
}

export interface MapsItemContent {
	item_type_id: string | null;
	node_id: string;
	name: string | null;
	serial: string | null;
	notes: string | null;
}

export interface MapsStockContent {
	item_type_id: string;
	node_id: string;
	qty: number;
}

/** Blank-to-null the way the forms mean it: an emptied field stores nothing. */
export function blankToNull(text: string): string | null {
	const trimmed = text.trim();
	return trimmed === '' ? null : trimmed;
}

/** What the editor shell can have open in its detail pane. */
export type MapsSelection =
	| { kind: 'node'; id: string }
	| { kind: 'type'; id: string }
	| { kind: 'new-node'; parentId: string | null; presetKind: MapsKind | null }
	| { kind: 'new-type' };

/**
 * What a mounted form hands the editor shell, so switching selection can
 * FLUSH unsaved work first and ask only about what a flush could not land --
 * the one-guard rule's in-page counterpart. Registered on mount, withdrawn on
 * teardown (a destroyed instance must not leave the shell holding a flag with
 * nothing behind it).
 */
export interface MapsFormHandle {
	/** What is at stake, in the person's terms ("the node 'Drawer 1'"). */
	label: string;
	dirty(): boolean;
	/** Attempt the save this form owes. Leaves `dirty()` true only on failure. */
	flush(): Promise<void>;
}

// ---------------------------------------------------------------------------
// The node's content columns, extracted once.
//
// Every write of a node -- the detail form, the elevation editor, a reorder --
// sends EVERY content column, because `maps_publish` promotes a pending
// snapshot wholesale (0161) and a snapshot missing a key is a column the
// publish would not carry. So "what the content columns of a node are" is
// stated HERE, once, and a caller patches the result rather than assembling a
// second opinion of the same list.
// ---------------------------------------------------------------------------

/**
 * The content of a node row, or of a staged pending SNAPSHOT of one -- the two
 * shapes are the same keys, which is why one reader serves both. Numerics go
 * through `num`, because PostgREST hands `numeric` back as a JSON number and
 * the test shim's pg driver hands the same column back as a string.
 */
export function mapsNodeContent(row: Partial<MapsNode>): MapsNodeContent {
	return {
		parent_id: (row.parent_id ?? null) as string | null,
		kind: (row.kind ?? 'building') as MapsKind,
		name: row.name ?? '',
		subtype: row.subtype ?? null,
		description: row.description ?? null,
		outline: (row.outline ?? null) as MapsOutline | null,
		position_x_in: num(row.position_x_in),
		position_y_in: num(row.position_y_in),
		rotation_deg: num(row.rotation_deg),
		elevation_order: row.elevation_order ?? null,
		elevation_h_in: num(row.elevation_h_in),
		elevation_w_in: num(row.elevation_w_in)
	};
}

/**
 * What a node currently READS AS to an editor: the staged pending edit when
 * one exists, the live row otherwise. The whole draft-and-publish model turns
 * on this distinction, and a surface that showed the live row while a pending
 * edit sat on it would overwrite that edit the moment it saved.
 */
export function mapsEffectiveNodeContent(
	node: MapsNode,
	pending: MapsPending | null
): MapsNodeContent {
	return mapsNodeContent(
		pending ? ({ ...node, ...(pending.snapshot as Partial<MapsNode>) }) : node
	);
}

// ---------------------------------------------------------------------------
// The front elevation -- spec 4.1 and 7. A unit's compartments, stacked.
// ---------------------------------------------------------------------------

export interface MapsElevationSlot {
	node: MapsNode;
	pending: MapsPending | null;
	/** The pending-aware content: what this slot reads as right now. */
	content: MapsNodeContent;
	/** 1 is the top. Null means it has never been placed in the stack. */
	order: number | null;
	heightIn: number | null;
	widthIn: number | null;
	name: string;
	subtype: string | null;
}

/**
 * A unit's compartments as a STACK, top first.
 *
 * Ordering is `elevation_order` ascending, ties and NULLS broken by name, so
 * the order is total and a slot cannot swap places with a sibling between two
 * renders. An unplaced compartment (null order) sorts to the BOTTOM rather
 * than being dropped: it is a real compartment somebody created, and hiding it
 * from the one surface that could give it a slot is how it stays unplaced
 * forever.
 */
export function mapsElevationStack(data: MapsEditorData, unitId: string): MapsElevationSlot[] {
	return data.nodes
		.filter((n) => n.parent_id === unitId && n.kind === 'compartment')
		.map((node) => {
			const pending = pendingFor(data.pending, 'maps_nodes', node.id);
			const content = mapsEffectiveNodeContent(node, pending);
			return {
				node,
				pending,
				content,
				order: content.elevation_order,
				heightIn: content.elevation_h_in,
				widthIn: content.elevation_w_in,
				name: content.name,
				subtype: content.subtype
			};
		})
		.sort((a, b) => {
			if (a.order === null && b.order === null) return a.name.localeCompare(b.name);
			if (a.order === null) return 1;
			if (b.order === null) return -1;
			if (a.order !== b.order) return a.order - b.order;
			return a.name.localeCompare(b.name);
		});
}

/**
 * The stack's typed total, and what is missing from it. `unsized` is reported
 * rather than defaulted: a compartment with no typed height is not a
 * zero-height compartment, and a stack that silently summed it as zero would
 * claim a total the unit does not have.
 */
export function mapsStackTotals(slots: MapsElevationSlot[]): {
	totalIn: number;
	unsized: number;
	widestIn: number | null;
} {
	let totalIn = 0;
	let unsized = 0;
	let widestIn: number | null = null;
	for (const slot of slots) {
		if (slot.heightIn === null) unsized += 1;
		else totalIn += slot.heightIn;
		if (slot.widthIn !== null) widestIn = widestIn === null ? slot.widthIn : Math.max(widestIn, slot.widthIn);
	}
	return { totalIn: Math.round(totalIn * 1000) / 1000, unsized, widestIn };
}

/**
 * Move a slot within the stack, clamped at both ends. The ARRAY POSITION is
 * the order -- `elevation_order` is derived from it at save time -- so a move
 * is a pure list operation and there is no second idea of where a slot sits.
 * A move off either end is a no-op returning the same order, never an
 * off-by-one that renumbers the stack backwards.
 */
export function mapsMoveSlot<T>(rows: readonly T[], from: number, to: number): T[] {
	const next = rows.slice();
	if (from < 0 || from >= next.length) return next;
	const target = Math.max(0, Math.min(next.length - 1, to));
	if (target === from) return next;
	const [moved] = next.splice(from, 1);
	next.splice(target, 0, moved);
	return next;
}

/** One slot as the elevation editor holds it while somebody is typing into it. */
export interface MapsElevationDraft {
	id: string;
	name: string;
	heightIn: number | null;
	widthIn: number | null;
}

/**
 * THE WHOLE SAVE DECISION OF THE ELEVATION EDITOR, as one pure function: given
 * what is stored and what the stack now says, which rows have to be written
 * and with what content.
 *
 * `elevation_order` comes from the draft's POSITION (1 is the top), which is
 * what makes reordering possible WITHOUT RETYPING A HEIGHT -- the heights ride
 * along with their rows and only the numbers move. Every other content column
 * is carried through from the row's own effective content untouched, because
 * `maps_publish` promotes a snapshot wholesale and a write here must not drop
 * a description or a subtype somebody set on the compartment's own form.
 *
 * A row whose content is unchanged is NOT returned, so pressing Save after a
 * single rename writes one row rather than the whole stack.
 */
export function mapsElevationWrites(
	slots: MapsElevationSlot[],
	draft: MapsElevationDraft[]
): { id: string; name: string; row: MapsNode; content: MapsNodeContent }[] {
	const bySlot = new Map(slots.map((s) => [s.node.id, s]));
	const writes: { id: string; name: string; row: MapsNode; content: MapsNodeContent }[] = [];
	draft.forEach((entry, index) => {
		const slot = bySlot.get(entry.id);
		if (!slot) return;
		const content: MapsNodeContent = {
			...slot.content,
			name: entry.name,
			elevation_order: index + 1,
			elevation_h_in: entry.heightIn,
			elevation_w_in: entry.widthIn
		};
		const before = slot.content;
		const same =
			before.name === content.name &&
			before.elevation_order === content.elevation_order &&
			before.elevation_h_in === content.elevation_h_in &&
			before.elevation_w_in === content.elevation_w_in;
		if (!same) writes.push({ id: entry.id, name: entry.name, row: slot.node, content });
	});
	return writes;
}

// ---------------------------------------------------------------------------
// Plan placement -- spec 7. A DRAG POSITIONS; A TYPED DIMENSION DEFINES.
//
// Everything here answers ONE question: given where a pointer (or an arrow
// key) wants the shape, what POSITION should the typed X/Y fields hold. There
// is deliberately no width, height or outline anywhere in a return type on
// this side of the module -- a drag cannot change a dimension because there is
// nothing in the answer it could change it with.
// ---------------------------------------------------------------------------

export interface MapsBox {
	minX: number;
	minY: number;
	maxX: number;
	maxY: number;
}

const DEG = Math.PI / 180;

/**
 * The shape's corner points in its own frame, rotated about its position
 * origin. ONE implementation, because the canvas DRAWS these points and the
 * footprint below MEASURES them -- a drawing and a snap computed from two
 * different ideas of where the corners are is a shape that snaps somewhere
 * other than where it looks.
 */
export function mapsShapeCorners(
	outline: MapsOutline,
	rotationDeg: number | null
): [number, number][] {
	const corners: [number, number][] =
		outline.kind === 'rect'
			? [
					[0, 0],
					[outline.w, 0],
					[outline.w, outline.h],
					[0, outline.h]
				]
			: outline.points;
	const theta = (rotationDeg ?? 0) * DEG;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	return corners.map(([x, y]) => [x * cos - y * sin, x * sin + y * cos]);
}

/**
 * The shape's own extent RELATIVE TO ITS POSITION ORIGIN, with rotation
 * applied about that origin: the axis-aligned box a placed shape occupies.
 *
 * Rotation is applied to the corner points rather than special-cased at
 * multiples of 90, so the footprint is exact at any angle and no branch exists
 * to be wrong at 37 degrees.
 */
export function mapsFootprint(outline: MapsOutline, rotationDeg: number | null): MapsBox {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const [rx, ry] of mapsShapeCorners(outline, rotationDeg)) {
		minX = Math.min(minX, rx);
		minY = Math.min(minY, ry);
		maxX = Math.max(maxX, rx);
		maxY = Math.max(maxY, ry);
	}
	return { minX, minY, maxX, maxY };
}

/** The box a node occupies in its PARENT's frame, or null when it is not placed. */
export function mapsPlacedBox(content: {
	outline: MapsOutline | null;
	position_x_in: number | null;
	position_y_in: number | null;
	rotation_deg: number | null;
}): MapsBox | null {
	if (!content.outline) return null;
	if (content.position_x_in === null || content.position_y_in === null) return null;
	const f = mapsFootprint(content.outline, content.rotation_deg);
	return {
		minX: content.position_x_in + f.minX,
		minY: content.position_y_in + f.minY,
		maxX: content.position_x_in + f.maxX,
		maxY: content.position_y_in + f.maxY
	};
}

/** A neighbour a shape can snap against: a sibling's box, or the parent's own walls. */
export interface MapsSnapTarget {
	label: string;
	box: MapsBox;
}

export interface MapsPlacement {
	x: number;
	y: number;
	/** What the X value landed on, in words, or null when nothing was near enough. */
	snapX: string | null;
	snapY: string | null;
}

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Where a drag (or an arrow key, or anything else that WANTS a position) puts
 * the shape: the desired value, moved onto a neighbouring edge when one is
 * within tolerance, and SAID OUT LOUD when it was.
 *
 * The candidates per axis are every edge of every target, against both of the
 * moving shape's own edges -- so a shape snaps flush against a neighbour
 * (its left onto the neighbour's right) and aligned with one (its left onto
 * the neighbour's left) by the same arithmetic. The nearest candidate inside
 * `toleranceIn` wins; a tie takes the first, which is the parent's own wall,
 * because a wall is the edge somebody means when two candidates coincide.
 *
 * An unsnapped value is rounded to 2 decimal places. That is a DISPLAY
 * decision about a number a pointer produced, never a grid: a typed 3.756 is
 * left exactly as typed, because nothing here is on the typing path.
 */
export function mapsPlaceShape(args: {
	desiredX: number;
	desiredY: number;
	footprint: MapsBox;
	targets: MapsSnapTarget[];
	toleranceIn: number;
}): MapsPlacement {
	const { desiredX, desiredY, footprint, targets, toleranceIn } = args;

	const solve = (
		desired: number,
		lo: number,
		hi: number,
		edgesOf: (box: MapsBox) => [number, number]
	): { value: number; snap: string | null } => {
		let best: { value: number; snap: string; delta: number } | null = null;
		for (const target of targets) {
			const [tLo, tHi] = edgesOf(target.box);
			for (const [edgeName, edge] of [
				['near', tLo],
				['far', tHi]
			] as const) {
				for (const [ownName, own] of [
					['near', lo],
					['far', hi]
				] as const) {
					const value = edge - own;
					const delta = Math.abs(value - desired);
					if (delta > toleranceIn) continue;
					if (best !== null && delta >= best.delta) continue;
					best = {
						value,
						delta,
						snap: `${ownName === 'near' ? 'leading' : 'trailing'} edge onto the ${
							edgeName === 'near' ? 'leading' : 'trailing'
						} edge of ${target.label}`
					};
				}
			}
		}
		if (best) return { value: round2(best.value), snap: best.snap };
		return { value: round2(desired), snap: null };
	};

	const x = solve(desiredX, footprint.minX, footprint.maxX, (b) => [b.minX, b.maxX]);
	const y = solve(desiredY, footprint.minY, footprint.maxY, (b) => [b.minY, b.maxY]);
	return { x: x.value, y: y.value, snapX: x.snap, snapY: y.snap };
}

/**
 * The snap targets for a node being placed inside `parent`: the parent's own
 * walls first (so a wall wins a tie), then every SIBLING that is itself placed.
 * A sibling with no outline or no position is not a target, because there is
 * no edge to snap to -- it is not silently treated as sitting at the origin.
 */
export function mapsSnapTargets(
	data: MapsEditorData,
	parent: MapsNode | null,
	selfId: string | null
): MapsSnapTarget[] {
	const targets: MapsSnapTarget[] = [];
	if (parent?.outline) {
		const f = mapsFootprint(parent.outline, null);
		targets.push({ label: `the ${MAPS_KIND_LABELS[parent.kind].toLowerCase()} walls`, box: f });
	}
	if (!parent) return targets;
	for (const sibling of data.nodes) {
		if (sibling.parent_id !== parent.id || sibling.id === selfId) continue;
		const pending = pendingFor(data.pending, 'maps_nodes', sibling.id);
		const box = mapsPlacedBox(mapsEffectiveNodeContent(sibling, pending));
		if (box) targets.push({ label: sibling.name, box });
	}
	return targets;
}
