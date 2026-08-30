/**
 * ITEM ENTRY AT THE SHELF -- the arithmetic, spec section 7's "highest-frequency
 * action", kept out of the component so it is assertable without a browser.
 *
 * THE SHAPE OF THE PROBLEM. A person standing at a drawer with a phone is
 * recording ONE THING, but the schema has three tables under that word and the
 * flow cannot make them pick one from a diagram (spec 4.2): the searchable
 * VOCABULARY -- name, aliases, tags -- lives on `maps_item_types`; a
 * one-of-a-kind object is a `maps_items` row; several of the same thing in one
 * place is a `maps_stock` row with a quantity. So the surface asks the one
 * question a person at a drawer can actually answer -- "just this one" or
 * "several of these" -- and this module turns the answer into the right rows.
 *
 * WHEN A TYPE IS MINTED AND WHEN IT IS NOT, which is the decision worth
 * writing down. A type row exists to hold vocabulary that other placements
 * will share. So:
 *
 *   - "several" ALWAYS needs one: `maps_stock.item_type_id` is not null, so a
 *     stocked placement without a type is not representable.
 *   - "just this one" with aliases or tags typed needs one too: that is
 *     vocabulary, and vocabulary has nowhere else to live.
 *   - "just this one" with NEITHER mints nothing: 0161's named-or-typed rule
 *     allows a typeless item carrying its own name, and 0162 indexes
 *     `i.name` at weight A beside its type's, so the thing is findable by the
 *     name that was typed. Minting an empty type per one-off would fill the
 *     vocabulary with rows nothing else will ever reuse.
 *
 * PICKING AN EXISTING TYPE REUSES ITS VOCABULARY AND DOES NOT EDIT IT. A
 * published type's edit is a staged pending revision (4.3), which is a
 * publish-model decision that has no business happening as a side effect of
 * cataloguing a drawer -- somebody adding "allen" at a shelf would be staging
 * an edit on a public row they cannot see the consequences of from here. The
 * surface shows the picked type's aliases and tags as read-only and says where
 * they are edited.
 *
 * Pure and client-safe: no Svelte, no Supabase, no `$app`.
 */

import type { MapsItemType, MapsNode } from './maps';

export type MapsShelfKind = 'one' | 'several';

/** What the entry card holds. A `File` is deliberately NOT in here -- see `shelf-mirror.ts`. */
export interface MapsShelfDraft {
	name: string;
	aliases: string[];
	tags: string[];
	/** Set when an EXISTING type was picked; null means "the name is a new one". */
	typeId: string | null;
	kind: MapsShelfKind;
	qty: number;
	serial: string;
	notes: string;
}

export function mapsShelfBlank(): MapsShelfDraft {
	return { name: '', aliases: [], tags: [], typeId: null, kind: 'one', qty: 1, serial: '', notes: '' };
}

/** Has anything been typed into this card? What Save asks, and what the mirror asks. */
export function mapsShelfHasWork(draft: MapsShelfDraft, hasPhoto: boolean): boolean {
	return (
		draft.name.trim() !== '' ||
		draft.aliases.length > 0 ||
		draft.tags.length > 0 ||
		draft.typeId !== null ||
		draft.serial.trim() !== '' ||
		draft.notes.trim() !== '' ||
		hasPhoto
	);
}

/**
 * Existing types whose vocabulary matches what is being typed -- name, alias
 * or tag, so "allen" finds the Hex Key Set. Ranked: a name that STARTS with
 * the query first (that is the thing being typed), then any other name match,
 * then an alias or tag match, ties by name. The point is that the second hex
 * key set in a drawer reuses one type rather than minting a near-duplicate,
 * which is what makes search work later.
 */
export function mapsTypeSuggestions(
	itemTypes: MapsItemType[],
	query: string,
	limit = 6
): MapsItemType[] {
	const q = query.trim().toLowerCase();
	if (q === '') return [];
	const rank = (t: MapsItemType): number => {
		const name = t.name.toLowerCase();
		if (name.startsWith(q)) return 0;
		if (name.includes(q)) return 1;
		if (t.aliases.some((a) => a.toLowerCase().includes(q))) return 2;
		if (t.tags.some((g) => g.toLowerCase().includes(q))) return 3;
		return 99;
	};
	return itemTypes
		.map((t) => ({ t, r: rank(t) }))
		.filter((e) => e.r < 99)
		.sort((a, b) => a.r - b.r || a.t.name.localeCompare(b.t.name))
		.slice(0, limit)
		.map((e) => e.t);
}

/** Whether a name would mint a SECOND type with a name one already has. */
export function mapsExactTypeMatch(itemTypes: MapsItemType[], name: string): MapsItemType | null {
	const n = name.trim().toLowerCase();
	if (n === '') return null;
	return itemTypes.find((t) => t.name.trim().toLowerCase() === n) ?? null;
}

export function mapsShelfProblems(
	draft: MapsShelfDraft,
	container: MapsNode | null,
	itemTypes: MapsItemType[]
): string[] {
	const out: string[] = [];
	if (!container) out.push('Choose the container this is going into.');
	const picked = draft.typeId ? itemTypes.find((t) => t.id === draft.typeId) : null;
	if (draft.typeId !== null && !picked) {
		out.push('That item type is no longer there. Pick another, or type a new name.');
	}
	if (!picked && draft.name.trim() === '') out.push('Give it a name.');
	if (draft.name.trim().length > 200) out.push('The name is longer than 200 characters.');
	if (draft.notes.trim().length > 4000) out.push('Notes are longer than 4000 characters.');
	if (draft.kind === 'several') {
		if (!Number.isInteger(draft.qty) || draft.qty < 1) {
			out.push('How many are here? It has to be a whole number, at least 1.');
		}
	}
	return out;
}

/**
 * One step of a save: a row to create, in order. The type comes first because
 * the placement points at it; `usesNewType` is how the runner knows to
 * substitute the id it just got rather than the one in the content.
 */
export interface MapsShelfStep {
	table: 'maps_item_types' | 'maps_items' | 'maps_stock';
	content: Record<string, unknown>;
	/** Fill `item_type_id` from the type created by the step before this one. */
	usesNewType?: boolean;
	/** What this step makes, in the person's words, for the receipt. */
	label: string;
}

export interface MapsShelfPlan {
	steps: MapsShelfStep[];
	/** Where the photo hangs: the ITEM for a one-off, the TYPE for stock (0163 has no stock photos). */
	photoOwner: 'item' | 'item_type';
	/** A sentence naming what pressing save will make, shown BEFORE it is pressed. */
	summary: string;
}

/**
 * THE WHOLE SAVE DECISION, as one pure function over the draft and the
 * container. Every row a shelf entry can create is here, in order, with the
 * sentence that describes it -- so what the button SAYS and what the runner
 * DOES come from one place and cannot drift into two claims.
 */
export function mapsShelfPlan(
	draft: MapsShelfDraft,
	container: MapsNode,
	itemTypes: MapsItemType[]
): MapsShelfPlan {
	const name = draft.name.trim();
	const picked = draft.typeId ? (itemTypes.find((t) => t.id === draft.typeId) ?? null) : null;
	const hasVocabulary = draft.aliases.length > 0 || draft.tags.length > 0;
	const needsNewType = picked === null && (draft.kind === 'several' || hasVocabulary);
	const steps: MapsShelfStep[] = [];

	if (needsNewType) {
		steps.push({
			table: 'maps_item_types',
			label: `the item type "${name}"`,
			content: {
				name,
				aliases: draft.aliases,
				tags: draft.tags,
				category: null,
				brand: null,
				model: null,
				part_number: null,
				description: null
			}
		});
	}

	if (draft.kind === 'several') {
		steps.push({
			table: 'maps_stock',
			usesNewType: needsNewType,
			label: `${draft.qty} of them in ${container.name}`,
			content: {
				item_type_id: picked?.id ?? null,
				node_id: container.id,
				qty: draft.qty
			}
		});
	} else {
		const typeId = picked?.id ?? null;
		steps.push({
			table: 'maps_items',
			usesNewType: needsNewType,
			label: `${name || picked?.name || 'the item'} in ${container.name}`,
			content: {
				item_type_id: typeId,
				node_id: container.id,
				// A TYPED item takes its name FROM the type: writing the same
				// string into both is how a rename of the type later leaves a
				// stale copy on every item under it. A typeless one must carry
				// its own (0161's named-or-typed rule).
				name: needsNewType || picked ? null : name,
				serial: draft.serial.trim() === '' ? null : draft.serial.trim(),
				notes: draft.notes.trim() === '' ? null : draft.notes.trim()
			}
		});
	}

	const what =
		draft.kind === 'several'
			? `${draft.qty} × ${name || picked?.name || 'item'}`
			: name || picked?.name || 'one item';
	const vocab = needsNewType ? ' and a new item type for it' : picked ? ` under "${picked.name}"` : '';
	return {
		steps,
		photoOwner: draft.kind === 'several' ? 'item_type' : 'item',
		summary: `${what} in ${container.name}${vocab}.`
	};
}

/**
 * What a completed entry leaves on screen. The receipt is not decoration: on a
 * surface whose whole point is that the card EMPTIES and waits for the next
 * one, the only evidence a save happened is what it puts in the list beside it
 * -- an acknowledgement has to survive the act it reports, and here the act
 * clears the thing that would otherwise have carried it (CLAUDE.md).
 */
export interface MapsShelfReceipt {
	id: string;
	label: string;
	containerName: string;
	/** Every entry starts as a draft (4.3) unless it was published on the spot. */
	published: boolean;
	photo: 'none' | 'attached' | 'failed';
	problem: string | null;
}
