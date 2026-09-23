// tests/foundry-search.test.ts
//
// THE GALLERY SEARCH (report 32b), AND THE ONE CASE THE STUDENT NAMED.
//
// WHY THIS IS A TEST AND NOT ONLY A HARNESS DRIVE. Most of search fails
// visibly: type a word, see the wrong list. Two properties do not, and both are
// about a search being QUIETLY narrower than it looks:
//
//   1. THE ANY-TOKEN RULE. Requiring every query token to match is the usual
//      default and is what "Cookie Clicker" finding nothing looks like -- a
//      search box that works perfectly on every query somebody tries in review
//      and fails on the query the report was filed about. It is one word in one
//      loop and nothing on screen distinguishes it.
//
//   2. THE SPELLING TOLERANCE'S SHAPE. This shipped as plain Levenshtein at
//      k = 1 and the browser pass caught it on the report's own example with a
//      typo in it: `cookei` against `cookie` is a TRANSPOSITION, which is
//      distance 2, so the commonest typing mistake there is was not covered.
//      The rule reads as correct either way; only a case tells them apart.
//
// AND ONE PROPERTY THAT IS A DISCLOSURE RATHER THAN A FEATURE: an author's name
// is searchable through `foundryAuthorName`'s two rungs and never through
// `displayName()`, whose third rung is the email address. A search that matched
// an address would be a disclosure by probe -- type a suspected address, see
// whether anything comes back -- and there is nothing on screen to show it.

import { describe, expect, it } from 'vitest';
import {
	foundrySearch,
	foundrySearchEmptyNote,
	foundrySearchScore,
	foundrySearchTokens,
	withinOneTypo,
	type FoundrySearchable
} from '$lib/foundry/search';

const APPS: FoundrySearchable[] = [
	{
		id: 'press',
		slug: 'cookie-press',
		title: 'Cookie Press',
		tagline: 'Press the cookie. Keep pressing it.',
		description: 'An idle game where you press a cookie and numbers go up forever.',
		owner_display_name: 'anaTheBuilder',
		owner_full_name: 'Ana Reyes'
	},
	{
		id: 'maze',
		slug: 'maze-maker',
		title: 'Maze Maker',
		tagline: 'Draw a maze, then try to finish it.',
		description: 'Build a maze with the mouse and race your own best time.',
		owner_display_name: null,
		owner_full_name: 'Kit Alvarez'
	},
	{
		id: 'frog',
		slug: 'frog-frenzy',
		title: 'Frog Frenzy',
		tagline: 'Hop across the road without getting flattened.',
		description: 'A road crossing game. The lanes are a maze that moves.',
		owner_display_name: null,
		owner_full_name: 'Ana Reyes'
	},
	{
		id: 'orbit',
		slug: 'orbit-lab',
		title: 'Orbit Lab',
		tagline: 'Throw a satellite and see where it goes.',
		description: 'A two body gravity sandbox.',
		owner_display_name: null,
		owner_full_name: 'Bo Tran'
	}
];

const ids = (q: string) => foundrySearch(APPS, q).map((a) => a.id);

describe('report 32b’s own example', () => {
	it('finds Cookie Press when somebody searches for Cookie Clicker', () => {
		// HIS WORDS: "if I search for Cookie Clicker but the game's actually
		// called Cookie Press, the words don't match but that's what they're
		// looking for." One shared token is enough, and it is enough BECAUSE
		// the rule is any-token rather than every-token.
		expect(ids('Cookie Clicker')).toContain('press');
		expect(ids('Cookie Clicker')[0]).toBe('press');
	});

	it('finds it with the misspelling too, which is where the first draft failed', () => {
		// `cookei` is `cookie` with two adjacent letters swapped. Under plain
		// Levenshtein that is distance 2 and this returned nothing; the browser
		// pass is what caught it.
		expect(ids('Cookei Clicker')).toContain('press');
		expect(ids('cookei')).toContain('press');
	});

	it('POSITIVE CONTROL: a query matching nothing really does match nothing', () => {
		// Without this, every assertion above would pass on a search that
		// returned the whole gallery for any input at all.
		expect(ids('xylophone')).toEqual([]);
		expect(foundrySearchScore(APPS[0], 'xylophone')).toBe(0);
	});
});

describe('ranking', () => {
	it('puts an exact name first even when other apps share one of its words', () => {
		// "maze" is in Maze Maker's TITLE and in Frog Frenzy's DESCRIPTION.
		const out = ids('Maze Maker');
		expect(out[0]).toBe('maze');
		expect(out).toContain('frog');
	});

	it('scores a title hit above a description hit, in that order', () => {
		const out = ids('maze');
		expect(out).toEqual(['maze', 'frog']);
		expect(foundrySearchScore(APPS[1], 'maze')).toBeGreaterThan(
			foundrySearchScore(APPS[2], 'maze')
		);
	});

	it('searches the slug, so a pasted link fragment finds its app', () => {
		expect(ids('frog-frenzy')).toEqual(['frog']);
	});

	it('searches the description, which the client used to drop entirely', () => {
		// `foundry_list_apps` always projected `description`; `FoundryAppSummary`
		// was the only thing not declaring it. A search over titles alone
		// answers "a game about the road" with nothing.
		expect(ids('road crossing')).toContain('frog');
	});

	it('breaks a tie on the incoming order rather than shuffling', () => {
		const tied: FoundrySearchable[] = [
			{ id: 'a', slug: 'a', title: 'Widget', tagline: null, description: null },
			{ id: 'b', slug: 'b', title: 'Widget', tagline: null, description: null },
			{ id: 'c', slug: 'c', title: 'Widget', tagline: null, description: null }
		];
		expect(foundrySearch(tied, 'widget').map((a) => a.id)).toEqual(['a', 'b', 'c']);
	});

	it('never mutates the list it was handed', () => {
		const before = APPS.map((a) => a.id);
		foundrySearch(APPS, 'cookie');
		expect(APPS.map((a) => a.id)).toEqual(before);
	});

	it('an empty or whitespace query is "not searching" and returns everything', () => {
		expect(ids('')).toEqual(APPS.map((a) => a.id));
		expect(ids('   ')).toEqual(APPS.map((a) => a.id));
	});
});

describe('the author is searchable by NAME and never by address', () => {
	it('finds an author’s apps by the name their cards actually show', () => {
		// Frog Frenzy shows "Ana Reyes" (no display name chosen), so searching
		// the surname finds it.
		const out = ids('Reyes');
		expect(out).toContain('frog');
		expect(out).not.toContain('orbit');
	});

	it('finds them by a chosen display name, which is the ladder’s first rung', () => {
		expect(ids('anaTheBuilder')).toContain('press');
	});

	/**
	 * A CHOSEN NAME REPLACES THE ACCOUNT NAME IN SEARCH TOO, AND THAT IS A
	 * PRIVACY PROPERTY RATHER THAN AN OVERSIGHT.
	 *
	 * `CLAUDE.md`: "A chosen public identity replaces the account identity
	 * completely. Where a feature lets someone pick a display name and picture,
	 * NO surface shows the Google account name." Search is a surface. Cookie
	 * Press is Ana Reyes's app and her card reads `anaTheBuilder`, so searching
	 * her real surname must NOT surface it -- otherwise the box is a way to find
	 * a student by a name the gallery deliberately never prints, which is worse
	 * than printing it because nobody can see it happening.
	 *
	 * IT FALLS OUT OF `foundryAuthorName`'s LADDER rather than being checked
	 * here: the scorer reads the one name the surfaces render and has no access
	 * to the other. That is the whole reason it calls that function instead of
	 * reading the two columns itself.
	 */
	it('does NOT find an app by the account name a chosen display name replaced', () => {
		expect(ids('Reyes')).not.toContain('press');
		// POSITIVE CONTROL on the same app: it is findable, by the name it shows.
		expect(ids('anaTheBuilder')).toContain('press');
	});

	/**
	 * THE DISCLOSURE ASSERTION. `FoundryAuthor` carries no email and must never
	 * carry one, so there is nothing here to match -- but a surface that started
	 * passing a wider object in, or a search that reached for `displayName()`
	 * instead, would turn this box into a way to test whether an address belongs
	 * to somebody who has published. The extra key is ignored, which is the
	 * property being pinned.
	 */
	it('ignores an address even when one is present on the object', () => {
		/*
			THE ADDRESS IS DELIBERATELY UNLIKE EVERY OTHER FIELD ON THE OBJECT.
			A first draft used `ana@boscotech.net` and scored 9, which read as a
			leak and was not one: the token `ana` PREFIX-matches the display name
			`anaTheBuilder`, which is correct and is what somebody typing "ana"
			wants. A field test has to isolate the field, so this address shares
			no token with anything else here.
		*/
		const withEmail = {
			...APPS[0],
			email: 'zq7v@boscotech.net'
		} as FoundrySearchable & { email: string };
		expect(foundrySearchScore(withEmail, 'zq7v@boscotech.net')).toBe(0);
		expect(foundrySearchScore(withEmail, 'zq7v')).toBe(0);
		// POSITIVE CONTROL on the same object: the NAME still matches, so the
		// zeroes above are the address being unread rather than the scorer being
		// broken.
		expect(foundrySearchScore(withEmail, 'anaTheBuilder')).toBeGreaterThan(0);
	});
});

describe('withinOneTypo: the four edits, and what is two mistakes', () => {
	const YES: [string, string, string][] = [
		['identical', 'cookie', 'cookie'],
		['substitution', 'cookie', 'coohie'],
		['transposition', 'cookie', 'cookei'],
		['insertion', 'cookie', 'coookie'],
		['deletion', 'cookie', 'cokie'],
		['insertion at the end', 'maze', 'mazes'],
		['deletion at the start', 'amaze', 'maze']
	];
	for (const [label, a, b] of YES) {
		it(`accepts a ${label}`, () => {
			expect(withinOneTypo(a, b)).toBe(true);
			// SYMMETRIC, which an insertion/deletion branch written one way round
			// would not be.
			expect(withinOneTypo(b, a)).toBe(true);
		});
	}

	const NO: [string, string, string][] = [
		['two substitutions', 'cookie', 'coohir'],
		['two transpositions', 'abcdef', 'badcef'],
		['a non-adjacent swap', 'abcde', 'ebcda'],
		['two insertions', 'maze', 'maazes'],
		/* NOT "a different word of the same length": `haze` against `maze` is one
		   substitution and is accepted on purpose, which is the whole point of
		   the rung. Two substitutions is where it stops. */
		['two substitutions in a short word', 'maze', 'hazy'],
		['nothing alike', 'cookie', 'orbital']
	];
	for (const [label, a, b] of NO) {
		it(`refuses ${label}`, () => {
			expect(withinOneTypo(a, b)).toBe(false);
			expect(withinOneTypo(b, a)).toBe(false);
		});
	}

	it('is only reached by a token of four characters or more', () => {
		// Below four an edit is most of the word: "cat" and "cut" are one edit
		// apart and are not the same search.
		const cat: FoundrySearchable = {
			id: 'cat',
			slug: 'cat',
			title: 'Cat',
			tagline: null,
			description: null
		};
		expect(foundrySearchScore(cat, 'cut')).toBe(0);
		// POSITIVE CONTROL: the tolerance really is on, one character longer.
		const cart: FoundrySearchable = {
			id: 'cart',
			slug: 'cart',
			title: 'Cart',
			tagline: null,
			description: null
		};
		expect(foundrySearchScore(cart, 'cort')).toBeGreaterThan(0);
	});
});

describe('tokenising', () => {
	it('keeps an accented word whole rather than splitting round the letter', () => {
		// The gallery is student work at a school with Spanish-speaking students
		// in it, and "Café Rush" splitting into "caf" and "rush" is a search that
		// stops finding an app its own author typed correctly.
		expect(foundrySearchTokens('Café Rush')).toContain('rush');
		expect(foundrySearchTokens('Café Rush').length).toBe(2);
	});

	it('drops punctuation and lowercases', () => {
		expect(foundrySearchTokens("Bolt-Run: it's fast!")).toEqual(['bolt', 'run', 'it', 's', 'fast']);
	});

	it('answers nothing for nothing', () => {
		expect(foundrySearchTokens(null)).toEqual([]);
		expect(foundrySearchTokens('')).toEqual([]);
		expect(foundrySearchTokens('   ---   ')).toEqual([]);
	});
});

describe('the empty-state sentence', () => {
	it('names what was searched and what is deliberately not in the list', () => {
		const note = foundrySearchEmptyNote('  xylophone  ');
		expect(note).toContain('xylophone');
		// The honest failure here is a student concluding their own app has
		// vanished, so the sentence says an unapproved app is not on the gallery.
		expect(note).toContain('approved');
		// House rule: no em dashes in anything a student reads.
		expect(note).not.toContain('—');
	});
});
