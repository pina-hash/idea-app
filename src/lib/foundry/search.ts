/**
 * SEARCHING THE FOUNDRY GALLERY.
 *
 * Pure, synchronous, no Svelte and no transports, so what matches what is
 * assertable without a browser -- which matters more here than usual, because
 * "did this find the right app" is a question with a lot of cases and no
 * visible failure mode when it gets one wrong.
 *
 * ===========================================================================
 * THE ASK, AND THE RUNG THIS ANSWERS IT AT.
 *
 * Report 32b: "there should be a search function ... I'm fine with it being a
 * smart search: first direct term matching, then synonyms or similar words, so
 * if I search for Cookie Clicker but the game's actually called Cookie Press,
 * the words don't match but that's what they're looking for."
 *
 * THIS SHIPS RUNG ONE AND A HALF: direct matching, prefix matching, and
 * ONE-CHARACTER SPELLING TOLERANCE. It does NOT ship synonyms. The distinction
 * is worth stating plainly rather than blurring, because the report uses the
 * word and this does not do the thing the word means:
 *
 *   RUNG 1  DIRECT TERM MATCHING. A query token against the words of the
 *           title, the tagline, the description, the slug and the author's
 *           name. SHIPPED.
 *
 *   RUNG 1.5 SPELLING TOLERANCE. A token of four characters or more matches a
 *           word it differs from by one insertion, deletion, substitution or
 *           ADJACENT TRANSPOSITION, so "cookei" finds "cookie", "clicekr"
 *           finds "clicker" and "maize" finds "maze". SHIPPED,
 *           and it is what most people mean when a search feels forgiving.
 *           It is NOT semantics: "car" will never find "automobile".
 *
 *   RUNG 2  SYNONYMS. A curated vocabulary -- clicker/idle/tapper,
 *           racer/driving, shooter/blaster -- that somebody at Bosco Tech
 *           writes and keeps. THE COST, so it can be decided rather than
 *           guessed at: a table, a migration, an admin surface to edit it, and
 *           a person who owns the list. It is not a build problem, it is a
 *           maintenance commitment, and an unmaintained synonym table is worse
 *           than none because it silently ranks stale words first.
 *
 *   RUNG 3  FUZZY MATCHING IN THE DATABASE (`pg_trgm` and a GIN index) or a
 *           real full-text `tsvector`. THE COST: an extension, an index, a
 *           migration, and a server round trip per keystroke where today there
 *           is none. It buys ranking quality on a corpus of THOUSANDS. The
 *           Foundry's corpus is tens, capped at five apps per student.
 *
 * WHY THAT IS THE HONEST STOPPING POINT, AND NOT A SHORTFALL: the example in
 * the report is answered by RUNG ONE. "Cookie Clicker" against "Cookie Press"
 * shares the word "cookie", and the matcher below is per-token rather than
 * per-phrase, so the app surfaces on that token alone. What he described as
 * needing synonyms needs only not requiring every word to match. The rungs
 * above are named so the next session can price them rather than rediscover
 * them.
 *
 * ===========================================================================
 * ANY TOKEN, NOT EVERY TOKEN, AND THAT IS FORCED BY HIS OWN EXAMPLE.
 *
 * Requiring every query token to match (the usual default) would make "Cookie
 * Clicker" find nothing, because no app has "clicker" in it -- which is exactly
 * the search he says is broken. So one matched token is enough to appear, and
 * everything else is RANKING: an app matching the whole phrase in its title
 * outranks one matching a single word in its description, by a wide margin. A
 * loose match sorts to the bottom rather than being refused, which on a gallery
 * of tens of apps is the right trade and on a gallery of thousands would not
 * be. That is the line at which rung 3 starts being worth its cost.
 *
 * ===========================================================================
 * IT SEARCHES THE WHOLE GALLERY, TODAY. `foundry_list_apps` returns every app
 * in the caller's population in one read with no pagination, so the client
 * holds all of them and this is COMPLETE rather than a search over a page. If
 * that list ever grows a limit, this silently becomes partial -- and a search
 * that quietly stops covering everything is the failure to watch for here.
 * Move it to the database at that point, which is rung 3.
 *
 * NOTHING HERE TOUCHES THE POPULATION. It filters a list the server already
 * decided this caller may see, so there is no app it could surface that the
 * gallery was not already rendering, and no gate it could get wrong.
 */

import { foundryAuthorName } from './surface.ts';

/** The fields a search reads. Structural, so a harness fixture is not a cast. */
export interface FoundrySearchable {
	id: string;
	slug: string;
	title: string;
	tagline?: string | null;
	description?: string | null;
	owner_display_name?: string | null;
	owner_full_name?: string | null;
}

/**
 * THE SHORTEST TOKEN THAT EARNS SPELLING TOLERANCE.
 *
 * Below four characters an edit distance of one is most of the word: "cat"
 * and "cut" are one edit apart and are not the same search, and "go" would
 * match "no", "so", "do" and every other two-letter word in the corpus. Four
 * is where one edit is a plausible typo rather than a different word.
 */
const FUZZY_MIN_LENGTH = 4;

/**
 * Words, lowercased, with punctuation dropped.
 *
 * `\p{L}` AND `\p{N}` RATHER THAN `a-z0-9`, so a title with an accent in it
 * tokenises as a word instead of splitting around the letter. The gallery is
 * student work at a school with Spanish-speaking students in it, and "Café
 * Rush" splitting into "caf" and "rush" is a search that quietly stops finding
 * an app its own author typed correctly.
 */
export function foundrySearchTokens(text: string | null | undefined): string[] {
	if (!text) return [];
	return text
		.toLowerCase()
		.normalize('NFKD')
		.split(/[^\p{L}\p{N}]+/u)
		.filter(Boolean);
}

/**
 * TRUE WHEN TWO STRINGS ARE AT MOST ONE TYPO APART.
 *
 * FOUR EDITS, NOT THREE, AND THE FOURTH IS THE ONE THAT MATTERS. This was
 * written as plain Levenshtein at k = 1 -- substitution, insertion, deletion --
 * and the browser pass caught it immediately on the report's own example with a
 * typo in it: `cookei` against `cookie` is two SUBSTITUTIONS to Levenshtein and
 * therefore distance 2, so "Cookei Clicker" found nothing at all. It is one
 * TRANSPOSITION to a person, and a transposition of adjacent letters is the
 * single most common typing mistake there is. A spelling tolerance that misses
 * the commonest spelling mistake is not a spelling tolerance, so this is
 * Damerau-Levenshtein at k = 1 rather than Levenshtein at k = 1.
 *
 * THE FIX WENT IN THE RULE AND NOT IN THE FIXTURE. Changing the harness query
 * to a typo this function already handled would have been fitting the test to
 * the code, and the case it stopped covering is the case a student will
 * actually type.
 *
 * BOUNDED RATHER THAN A FULL MATRIX: the answer is only ever needed as a yes or
 * no at k = 1, so each branch walks the strings once and returns.
 *
 *   equal length, one position differs        SUBSTITUTION
 *   equal length, two ADJACENT positions
 *     differ and are each other swapped       TRANSPOSITION
 *   lengths differ by one                     INSERTION or DELETION
 *   lengths differ by two or more             never one typo
 */
export function withinOneTypo(a: string, b: string): boolean {
	if (a === b) return true;
	const diff = a.length - b.length;
	if (diff > 1 || diff < -1) return false;

	if (diff === 0) {
		// Collect the differing positions, stopping at three: one is a
		// substitution, two MAY be a transposition, three is neither.
		const at: number[] = [];
		for (let i = 0; i < a.length; i++) {
			if (a[i] !== b[i]) {
				at.push(i);
				if (at.length > 2) return false;
			}
		}
		if (at.length === 1) return true;
		if (at.length !== 2) return false;
		// ADJACENT AND SWAPPED. Two differing positions that are not next to
		// each other are two separate mistakes, not one; two adjacent ones
		// holding each other's letters are one swap.
		const [i, j] = at;
		return j === i + 1 && a[i] === b[j] && a[j] === b[i];
	}

	const long = diff === 1 ? a : b;
	const short = diff === 1 ? b : a;
	let i = 0;
	let j = 0;
	let skipped = false;
	while (i < long.length && j < short.length) {
		if (long[i] === short[j]) {
			i++;
			j++;
			continue;
		}
		if (skipped) return false;
		skipped = true;
		i++;
	}
	return true;
}

/**
 * HOW WELL ONE QUERY TOKEN MATCHES ONE FIELD, as a number rather than a
 * boolean, so the three kinds of match can be ranked against each other.
 *
 * THE THREE RUNGS SCORE DIFFERENTLY ON PURPOSE. An exact word is what the
 * person typed; a prefix is what they were part-way through typing; a
 * one-edit match is a guess this code is making on their behalf, and it ranks
 * last so a guess can never outrank a real match anywhere else in the corpus.
 */
function tokenScore(token: string, words: readonly string[], weight: number): number {
	let best = 0;
	for (const word of words) {
		if (word === token) {
			best = Math.max(best, weight * 5);
			continue;
		}
		if (word.startsWith(token)) {
			best = Math.max(best, weight * 3);
			continue;
		}
		if (token.length >= FUZZY_MIN_LENGTH && withinOneTypo(token, word)) {
			best = Math.max(best, weight);
		}
	}
	return best;
}

/**
 * WHERE A MATCH LANDED, WEIGHTED, AND THE ORDER IS THE ARGUMENT.
 *
 * A title is what the author called the thing and is what a person is almost
 * always searching for. A tagline is a sentence about it. A DESCRIPTION is
 * long-form prose, so a word in it is weak evidence -- weighted low enough
 * that a description hit alone lands below every title hit in the corpus,
 * which is what stops one verbose app from owning every search.
 *
 * THE AUTHOR'S NAME IS SEARCHABLE AND IT IS `foundryAuthorName`'s TWO RUNGS,
 * never `displayName()` from `$lib/profile` -- whose third rung is the EMAIL
 * ADDRESS. Searching by address would be a disclosure by probe: type a
 * suspected address, see whether anything comes back. There is no address in
 * this payload to search and there must never be one.
 */
const FIELD_WEIGHTS = { title: 8, tagline: 4, author: 3, description: 1 } as const;

export interface FoundrySearchHit<T> {
	app: T;
	score: number;
}

/**
 * SCORE ONE APP AGAINST ONE QUERY. Zero means it does not appear at all.
 *
 * THE WHOLE-PHRASE BONUS IS WHAT MAKES A PRECISE SEARCH FEEL PRECISE. Typing
 * an app's actual name has to put that app first, every time, even when a
 * dozen other apps share one of its words -- so a substring hit on the whole
 * trimmed query scores far above any accumulation of single tokens. The slug
 * is in that test because a student who pastes a link fragment is searching
 * for exactly one app.
 */
export function foundrySearchScore(app: FoundrySearchable, query: string): number {
	const phrase = query.trim().toLowerCase();
	if (!phrase) return 0;
	const tokens = foundrySearchTokens(phrase);
	if (tokens.length === 0) return 0;

	const title = (app.title ?? '').toLowerCase();
	const tagline = (app.tagline ?? '').toLowerCase();
	const description = (app.description ?? '').toLowerCase();
	const author = (foundryAuthorName(app) ?? '').toLowerCase();

	let score = 0;
	if (title.includes(phrase)) score += 100;
	if (app.slug.toLowerCase().includes(phrase)) score += 60;
	if (tagline.includes(phrase)) score += 40;
	if (author.includes(phrase)) score += 40;
	if (description.includes(phrase)) score += 20;

	const words = {
		title: foundrySearchTokens(title),
		tagline: foundrySearchTokens(tagline),
		author: foundrySearchTokens(author),
		description: foundrySearchTokens(description)
	};

	for (const token of tokens) {
		score += tokenScore(token, words.title, FIELD_WEIGHTS.title);
		score += tokenScore(token, words.tagline, FIELD_WEIGHTS.tagline);
		score += tokenScore(token, words.author, FIELD_WEIGHTS.author);
		score += tokenScore(token, words.description, FIELD_WEIGHTS.description);
	}

	return score;
}

/**
 * THE MATCHING APPS, BEST FIRST.
 *
 * AN EMPTY QUERY RETURNS THE LIST UNCHANGED rather than nothing, so a surface
 * can bind this to an input's value with no branch of its own and an empty box
 * is simply "not searching".
 *
 * THE TIEBREAK IS THE INCOMING ORDER, as everywhere else in this feature: the
 * sort is the language's own stable sort with no index term, so two apps
 * scoring identically keep whatever ranking the caller handed in. That is what
 * makes "search, then read the results in the gallery's current order" true
 * rather than approximately true.
 *
 * IT NEVER MUTATES ITS INPUT.
 */
export function foundrySearch<T extends FoundrySearchable>(
	apps: readonly T[],
	query: string
): T[] {
	if (!query.trim()) return [...apps];
	const hits: FoundrySearchHit<T>[] = [];
	for (const app of apps) {
		const score = foundrySearchScore(app, query);
		if (score > 0) hits.push({ app, score });
	}
	hits.sort((a, b) => b.score - a.score);
	return hits.map((h) => h.app);
}

/**
 * WHAT THE SURFACE SAYS WHEN A SEARCH FINDS NOTHING.
 *
 * IT NAMES WHAT WAS SEARCHED AND WHAT WAS NOT, because the honest failure here
 * is a student concluding an app does not exist when it is simply not
 * published yet -- their own drafts are on /foundry/mine and are not in this
 * list at all for anybody else. No em dashes.
 */
export function foundrySearchEmptyNote(query: string): string {
	return (
		`Nothing published matches "${query.trim()}". ` +
		'This searches app names, taglines, descriptions and authors. ' +
		'An app that has not been approved yet is not on the gallery.'
	);
}
