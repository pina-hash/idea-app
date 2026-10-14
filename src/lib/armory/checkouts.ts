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

// ---------------------------------------------------------------------------
// Force check in, many at once (ledger 0380, report f62ce574)
// ---------------------------------------------------------------------------

/** `armory_break_locks` takes at most this many distinct files in one call (0234). */
export const BULK_FORCE_LIMIT = 500;

/**
 * The rows a force check in may be pressed for: somebody else's files. The
 * single-file key is hidden on one's own, and the plural call must not reach
 * what the single one cannot.
 */
export function selectableCheckouts(rows: readonly ArmoryCheckout[], me: string): ArmoryCheckout[] {
	return rows.filter((c) => c.holder_email !== me);
}

export function chunkIds<T>(ids: readonly T[], size: number = BULK_FORCE_LIMIT): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
	return out;
}

/** What a bulk force check in did, summed over every call it took. */
export interface BulkTally {
	checkedIn: number;
	alreadyFree: number;
	refused: number;
	refusedIds: string[];
	firstRefusal: string | null;
}

export function emptyTally(): BulkTally {
	return { checkedIn: 0, alreadyFree: 0, refused: 0, refusedIds: [], firstRefusal: null };
}

/**
 * Fold one `armory_break_locks` answer's `results` into the tally. A row it
 * cannot read counts as refused, never as checked in: a figure that says more
 * landed than did is the one nobody checks.
 */
export function addBulkResults(tally: BulkTally, results: unknown, askedFor: readonly string[]): BulkTally {
	const seen = new Set<string>();
	const rows = Array.isArray(results) ? results : [];
	for (const r of rows) {
		if (!r || typeof r !== 'object') continue;
		const row = r as { file_id?: unknown; ok?: unknown; broken?: unknown; message?: unknown };
		const id = typeof row.file_id === 'string' ? row.file_id : null;
		if (!id || seen.has(id)) continue;
		seen.add(id);
		if (row.ok === true) {
			if (row.broken === false) tally.alreadyFree += 1;
			else tally.checkedIn += 1;
		} else {
			tally.refused += 1;
			tally.refusedIds.push(id);
			tally.firstRefusal ??= typeof row.message === 'string' ? row.message : '';
		}
	}
	for (const id of askedFor) {
		if (!seen.has(id)) {
			tally.refused += 1;
			tally.refusedIds.push(id);
			tally.firstRefusal ??= '';
		}
	}
	return tally;
}

/** The sentence a bulk force check in ends on. `refusalWords` turns the first refusal's text into words. */
export function bulkForceWords(t: BulkTally, refusalWords: (message: string) => string): string {
	const files = (n: number) => `${n} ${n === 1 ? 'file' : 'files'}`;
	const parts: string[] = [];
	if (t.checkedIn > 0) parts.push(`Checked in ${files(t.checkedIn)}.`);
	if (t.alreadyFree > 0) parts.push(`${files(t.alreadyFree)} ${t.alreadyFree === 1 ? 'was' : 'were'} already checked in.`);
	if (t.refused > 0) {
		parts.push(`${files(t.refused)} ${t.refused === 1 ? 'was' : 'were'} refused: ${refusalWords(t.firstRefusal ?? '')} They stay ticked so you can try them again.`);
	}
	return parts.length > 0 ? parts.join(' ') : 'Nothing was checked in.';
}
