/**
 * WHAT A CALLER MAY DO TO THE MAP, as plain data and pure functions.
 *
 * Client-safe: no Supabase, no Svelte, no `?raw`. The route resolves a SCOPE
 * (am I an admin, and which containers do I hold a grant on) and everything on
 * screen is derived from that plus the nodes already loaded, which is what
 * makes the whole gating drivable in a harness with no network and assertable
 * with no browser.
 *
 * THIS IS CONVENIENCE, AND 0172 IS THE BOUNDARY. Every predicate here has a
 * twin in an RLS policy, and the policy is the one that decides: the editor's
 * reads and writes run on the CALLER'S OWN client, so a caller who got past
 * every check in this file would still be refused by the database. What this
 * buys is that a grantee is never offered a control whose only possible
 * outcome is a refusal -- CLAUDE.md's `aria-disabled` argument taken one step
 * further, to the case where the honest thing is to render nothing at all.
 *
 * THE DRAFT CEILING IS RESTATED HERE ON PURPOSE and is the one duplication in
 * this module. 0172's policies pin `status = 'draft'` in every clause of every
 * grantee write; a surface that offered a grantee a Save on a PUBLISHED
 * container would be offering a button whose only answer is no. Where the two
 * could drift, the database wins and the person sees a refusal, which is the
 * safe direction for a copy to fail in.
 */

import { mapsSubtreeIds, type MapsItemType, type MapsNode, type MapsStatus } from './maps';

/** One row of `maps_my_editor_grants()` -- the caller's own licences. */
export interface MapsEditorGrant {
	node_id: string;
	granted_at?: string | null;
	note?: string | null;
}

/** One row of `maps_editor_roster()` -- the admin surface's list. */
export interface MapsRosterRow {
	email: string;
	node_id: string;
	granted_by: string | null;
	granted_at: string;
	note: string | null;
}

/**
 * WHO IS LOOKING. `admin` and `grants` are independent: an admin's reach comes
 * from `is_admin()` and never from a row, which is why `maps_my_editor_grants()`
 * correctly returns an empty set for an admin who holds no literal grant.
 */
export interface MapsEditorScope {
	admin: boolean;
	grants: readonly MapsEditorGrant[];
}

/** The default every existing mount takes, so nothing changes without a scope. */
export const MAPS_ADMIN_SCOPE: MapsEditorScope = { admin: true, grants: [] };

/** A caller with no admin and no grants: the "nothing at all" scope. */
export const MAPS_NO_SCOPE: MapsEditorScope = { admin: false, grants: [] };

/**
 * The sentence a grantee reads where a control used to be. ONE spelling, so
 * the tree, the detail pane and the item forms cannot describe the same rule
 * three ways.
 */
export const MAPS_GRANT_REFUSAL =
	'You can edit drafts inside the containers you have been given. Publishing, and any change to something already on the public map, is a site admin.';

/**
 * Every node id at or below a granted node. `null` means NO LIMIT, which is
 * an admin -- distinct from an empty set, which is a signed-in person holding
 * no grant at all. A caller conflating the two hands an admin an empty editor.
 */
export function mapsEditableNodeIds(
	nodes: readonly MapsNode[],
	scope: MapsEditorScope
): ReadonlySet<string> | null {
	if (scope.admin) return null;
	const ids = new Set<string>();
	const all = nodes as MapsNode[];
	for (const grant of scope.grants) {
		for (const id of mapsSubtreeIds(all, grant.node_id)) ids.add(id);
	}
	return ids;
}

/**
 * What a grantee may SEE in the tree: their subtree, plus the ANCESTOR SPINE
 * above each granted node, plus every published node (0161's public read,
 * which is not this tier's doing). The spine is what lets the containment path
 * -- "IDEA Building / Machine Shop / Tool Chest A" -- resolve at all; without
 * it a grantee holding one drawer is shown a drawer floating in nothing.
 *
 * It mirrors `maps_can_view_node`, and like every predicate here it is the
 * convenience copy: what actually arrives in `nodes` was already filtered by
 * that policy.
 */
export function mapsVisibleNodeIds(
	nodes: readonly MapsNode[],
	scope: MapsEditorScope
): ReadonlySet<string> | null {
	if (scope.admin) return null;
	const editable = mapsEditableNodeIds(nodes, scope) ?? new Set<string>();
	const ids = new Set(editable);
	const byId = new Map(nodes.map((n) => [n.id, n]));
	for (const grant of scope.grants) {
		let cursor = byId.get(grant.node_id) ?? null;
		let hops = 0;
		// The kind ladder bounds the chain at five edges; the cap is belt and
		// braces, exactly as `_maps_node_ancestors` states it in SQL.
		while (cursor && hops < 12) {
			ids.add(cursor.id);
			cursor = cursor.parent_id ? (byId.get(cursor.parent_id) ?? null) : null;
			hops += 1;
		}
	}
	for (const n of nodes) if (n.status === 'published') ids.add(n.id);
	return ids;
}

/**
 * WHAT THE VIEWER MAY DO, resolved once against the current nodes. Every
 * surface reads this rather than re-deriving a rule of its own; three
 * spellings of "may I edit this" is three things that stop agreeing.
 */
export interface MapsCaps {
	/** A site admin: every object, and publishing. */
	readonly admin: boolean;
	/** Holds at least one licence of any kind. False = a read-only viewer. */
	readonly isEditor: boolean;
	/** Only an admin publishes. This is the whole of the publish rule. */
	readonly canPublish: boolean;
	/** Ids at or below a granted node; null means no limit (an admin). */
	readonly editableNodeIds: ReadonlySet<string> | null;
	/** Ids the tree may show; null means no limit. */
	readonly visibleNodeIds: ReadonlySet<string> | null;
	/** May draft content be created or changed AT this node? */
	canEditAt(nodeId: string | null): boolean;
	/** May this node itself be renamed, moved or deleted? */
	canEditNode(node: MapsNode): boolean;
	/** May a child be added under this parent? `null` is the root. */
	canAddChild(parentId: string | null): boolean;
	/** May an item or stock row living at this node be created or changed? */
	canEditContent(nodeId: string, status: MapsStatus): boolean;
	/** May this item type be renamed or deleted? Vocabulary is site-wide. */
	canEditItemType(itemType: MapsItemType): boolean;
	/** May a NEW item type be created? */
	canCreateItemType(): boolean;
	/** May this node be shown at all? */
	canViewNode(nodeId: string): boolean;
}

/**
 * A SITE ADMIN'S CAPS, INDEPENDENT OF ANY NODES, and the default every
 * component takes.
 *
 * An admin's answers do not depend on the tree -- `editableNodeIds` is null
 * (NO LIMIT, which is not an empty set) and every predicate is true -- so this
 * is a constant rather than a call. It exists so a `caps` prop can DEFAULT
 * rather than be required: making it required broke fifteen mounts in
 * `tests/dom/` that hand `NodeDetail` its props directly, and a required prop
 * whose only correct value at every existing call site is "the admin one" is a
 * prop that should have had that default from the start. Every mount that
 * predates granted editors is then byte-identical without passing anything.
 */
export const MAPS_ADMIN_CAPS: MapsCaps = mapsCapsFor(true, null, null, () => true);

function mapsCapsFor(
	admin: boolean,
	editableNodeIds: ReadonlySet<string> | null,
	visibleNodeIds: ReadonlySet<string> | null,
	canEditAt: (nodeId: string | null) => boolean
): MapsCaps {
	const isEditor = admin || (editableNodeIds?.size ?? 0) > 0;
	return {
		admin,
		isEditor,
		canPublish: admin,
		editableNodeIds,
		visibleNodeIds,
		canEditAt,
		canEditNode: (node) => (admin ? true : node.status === 'draft' && canEditAt(node.id)),
		canAddChild: (parentId) => canEditAt(parentId),
		canEditContent: (nodeId, status) => (admin ? true : status === 'draft' && canEditAt(nodeId)),
		canEditItemType: (itemType) => (admin ? true : isEditor && itemType.status === 'draft'),
		canCreateItemType: () => isEditor,
		canViewNode: (nodeId) => visibleNodeIds === null || visibleNodeIds.has(nodeId)
	};
}

export function mapsCaps(nodes: readonly MapsNode[], scope: MapsEditorScope): MapsCaps {
	const admin = scope.admin;
	const editableNodeIds = mapsEditableNodeIds(nodes, scope);
	const visibleNodeIds = mapsVisibleNodeIds(nodes, scope);
	const canEditAt = (nodeId: string | null): boolean => {
		if (admin) return true;
		if (nodeId === null) return false; // a subtree grant never reaches the root
		return editableNodeIds?.has(nodeId) ?? false;
	};
	// `isEditor` is "holds a licence of any kind", so it reads the GRANTS and
	// not the resolved id set: a grant on a node that has since been deleted
	// resolves to no ids, and a caller with one is still an editor as far as
	// the item-type vocabulary is concerned -- which is what the database says
	// too (`maps_is_editor` reads the roster, not the tree).
	const caps = mapsCapsFor(admin, editableNodeIds, visibleNodeIds, canEditAt);
	const isEditor = admin || scope.grants.length > 0;
	return {
		...caps,
		isEditor,
		canEditItemType: (itemType) => (admin ? true : isEditor && itemType.status === 'draft'),
		canCreateItemType: () => isEditor
	};
}

/**
 * The two Bosco Tech domains, refused in the SAME WORDS `maps_editor_grant`
 * raises. `.net` is admitted here and refused by 0169's notebook twin for a
 * stated reason: spec 7's population for THIS tier is student editors, so a
 * student address is the ordinary case rather than the dangerous one.
 */
export const MAPS_GRANT_DOMAINS = ['@boscotech.edu', '@boscotech.net'] as const;

export function mapsGrantEmailProblem(raw: string): string | null {
	const email = raw.trim().toLowerCase();
	if (email === '') return 'Enter an email address.';
	if (!email.includes('@')) return 'Enter a valid email address.';
	if (!MAPS_GRANT_DOMAINS.some((d) => email.endsWith(d))) {
		return `Map editing can only be granted to a Bosco Tech account (got "${email}").`;
	}
	return null;
}

/** The address as the roster stores it: lowercased and trimmed. */
export function mapsNormalizeGrantEmail(raw: string): string {
	return raw.trim().toLowerCase();
}
