/**
 * ONE RULE FOR "DOES THIS TEXT MATCH WHAT WAS TYPED", for the command palette
 * and the search box inside a class.
 *
 * Pure and synchronous, over data already loaded. It never reads the DOM: a
 * folded unit's rows are not rendered (measured 50 visible item links to 14
 * with one unit folded), so a search that looked at the page would miss
 * exactly the items somebody folded away.
 *
 * THE TOKENIZER AND THE TYPO TOLERANCE ARE FOUNDRY'S, IMPORTED AND NOT COPIED.
 * `foundrySearchTokens` splits on Unicode letters and digits (so "Café" is one
 * word) and `withinOneTypo` is Damerau at k = 1 (so "gearbx" finds "gearbox"
 * and the adjacent swap "cookei" finds "cookie"). Both are generic; their
 * prefix says where they were born. A second tokenizer here is the thing that
 * would quietly start splitting a title differently.
 *
 * EVERY TOKEN, NOT ANY TOKEN, AND THAT IS THE DIFFERENCE FROM THE GALLERY.
 * Foundry matches ANY token because its report was a person typing a name that
 * shared one word with the real one. A class search NARROWS a list somebody is
 * looking at: "bridge sketch" must not keep every "sketch" in the class, so
 * each token has to find a home, and the tolerance is what keeps one typo from
 * emptying the list. Four characters is the floor for a typo guess, the same
 * floor Foundry uses and for the same reason: below it one edit is most of the
 * word.
 */
import { foundrySearchTokens, withinOneTypo } from '$lib/foundry/search';

/** The shortest token that earns a one-typo guess. */
const TYPO_MIN_LENGTH = 4;

/** Lowercased words, the gallery's tokenizer. */
export function searchTokens(text: string | null | undefined): string[] {
	return foundrySearchTokens(text);
}

/** How ONE token lands in a set of words: 0 exact word, 1 word prefix, 2 inside a word, 3 one typo away, null nowhere. */
export function tokenFit(token: string, words: readonly string[]): 0 | 1 | 2 | 3 | null {
	let best: 0 | 1 | 2 | 3 | null = null;
	for (const w of words) {
		if (w === token) return 0;
		let fit: 1 | 2 | 3 | null = null;
		if (w.startsWith(token)) fit = 1;
		else if (w.includes(token)) fit = 2;
		else if (token.length >= TYPO_MIN_LENGTH && withinOneTypo(token, w)) fit = 3;
		if (fit !== null && (best === null || fit < best)) best = fit;
	}
	return best;
}

/**
 * Whether EVERY token of `query` lands somewhere in `fields`. An empty query
 * matches everything, which is what an empty search box means.
 */
export function matchesQuery(query: string, fields: readonly (string | null | undefined)[]): boolean {
	const tokens = searchTokens(query);
	if (!tokens.length) return true;
	const words = fields.flatMap((f) => searchTokens(f));
	return tokens.every((t) => tokenFit(t, words) !== null);
}

/** Something a ranked search can order: a name that is read first, and anything else it may match on. */
export interface Searchable {
	key: string;
	name: string;
	/** Read after the name: a description, a kind word, a unit. */
	also?: readonly (string | null | undefined)[];
}

/**
 * THE PALETTE'S RANKING, lowest first:
 *   0  the name starts with the whole query
 *   1  every token starts a word of the name
 *   2  the name contains the whole query
 *   3  every token is in the name or the rest (description, keywords, kind)
 *   4  every token is at most one typo from a word of either
 * Ties go to the most recently picked (`recent`, newest first), then to the
 * order the entries were handed in, which is the order a caller chose to mean
 * something (actions before items, the teacher's unit order, and so on).
 * Anything with no score is dropped.
 */
export function rankByQuery<T extends Searchable>(
	query: string,
	entries: readonly T[],
	recent: readonly string[] = []
): T[] {
	const q = searchTokens(query).join(' ');
	const tokens = q ? q.split(' ') : [];
	const recency = (key: string) => {
		const i = recent.indexOf(key);
		return i < 0 ? Number.MAX_SAFE_INTEGER : i;
	};
	const scored: { entry: T; score: number; at: number }[] = [];
	entries.forEach((entry, at) => {
		const nameWords = searchTokens(entry.name);
		const name = nameWords.join(' ');
		let score: number | null;
		if (!tokens.length) score = 0;
		else if (name.startsWith(q)) score = 0;
		else if (tokens.every((t) => nameWords.some((w) => w.startsWith(t)))) score = 1;
		else if (name.includes(q)) score = 2;
		else {
			const words = [...nameWords, ...(entry.also ?? []).flatMap((f) => searchTokens(f))];
			const fits = tokens.map((t) => tokenFit(t, words));
			if (fits.every((f) => f !== null && f < 3)) score = 3;
			else if (fits.every((f) => f !== null)) score = 4;
			else score = null;
		}
		if (score !== null) scored.push({ entry, score, at });
	});
	return scored
		.sort((a, b) => a.score - b.score || recency(a.entry.key) - recency(b.entry.key) || a.at - b.at)
		.map((s) => s.entry);
}
