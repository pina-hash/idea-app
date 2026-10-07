/**
 * THE CHECKED OUT VIEW'S ARITHMETIC (Armory v0.3 item 2): who has what, as a
 * compact table that is searched, filtered by holder and paged, so sixty
 * checkouts are a page and a half rather than tens of screens. Pure.
 *
 * THE HOLDER FILTER IS COMPONENT STATE, NEVER THE ADDRESS. `who=me` may arrive
 * in the URL (it names nobody); a holder's school address never goes there.
 */
import { holderName, type ArmoryCheckout } from './view';

/** Rows shown at first, and added by each "Show more". */
export const CHECKOUT_PAGE = 25;

/** 'all', 'me', or one holder's address. */
export type HolderFilter = string;

export interface HolderChip {
	id: HolderFilter;
	label: string;
	count: number;
}

/** Oldest first: the file somebody forgot is the one at the top. */
export function oldestFirst(rows: readonly ArmoryCheckout[]): ArmoryCheckout[] {
	return [...rows].sort((a, b) => Date.parse(a.since) - Date.parse(b.since) || a.name.localeCompare(b.name));
}

/**
 * The rows a holder filter and a search leave, oldest first. The search
 * matches the file's name and folder, the holder's shown name and the
 * computer, any case, every word.
 */
export function filterCheckouts(
	rows: readonly ArmoryCheckout[],
	holder: HolderFilter,
	query: string,
	me: string,
	names: ReadonlyMap<string, string | null>
): ArmoryCheckout[] {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	return oldestFirst(
		rows.filter((c) => {
			if (holder === 'me' && c.holder_email !== me) return false;
			if (holder !== 'all' && holder !== 'me' && c.holder_email !== holder) return false;
			if (words.length === 0) return true;
			const hay = `${c.folder}/${c.name} ${holderName(c.holder_email, names)} ${c.device_name ?? ''}`.toLowerCase();
			return words.every((w) => hay.includes(w));
		})
	);
}

/**
 * Everyone, Mine, then one key per holder, most files first. A filter key for
 * the viewer appears only once (as Mine), and every key carries its count, so
 * the keys add up to the whole list.
 */
export function holderChips(rows: readonly ArmoryCheckout[], me: string, names: ReadonlyMap<string, string | null>): HolderChip[] {
	const by = new Map<string, number>();
	for (const c of rows) by.set(c.holder_email, (by.get(c.holder_email) ?? 0) + 1);
	const others = [...by.entries()]
		.filter(([email]) => email !== me)
		.map(([email, n]) => ({ id: email, label: holderName(email, names), count: n }))
		.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
	return [
		{ id: 'all', label: 'Everyone', count: rows.length },
		{ id: 'me', label: 'Mine', count: by.get(me) ?? 0 },
		...others
	];
}

/** A stored or linked filter that names nobody in the list reads as Everyone. */
export function holderFilterOf(value: string | null | undefined, rows: readonly ArmoryCheckout[]): HolderFilter {
	if (value === 'me' || value === 'all') return value;
	return value && rows.some((c) => c.holder_email === value) ? value : 'all';
}
