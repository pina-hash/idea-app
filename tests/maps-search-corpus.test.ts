// tests/maps-search-corpus.test.ts
//
// IDEA MAPS SEARCH: the fixture corpus and adversarial query set that spec 5.5
// makes a P1 ACCEPTANCE CRITERION rather than a polish item -- "A fixture
// corpus with an adversarial query set: typos, synonyms, partial names,
// brand-only, function queries ... Asserted ranks, running in CI, shipping with
// P1. A search change that demotes a fixture query fails."
//
// RANKS, NOT MEMBERSHIP. "The expected result appears somewhere in the list" is
// the assertion that lets a regression through: a change that pushes the right
// answer from first to eleventh passes it, and eleventh is not found. Every
// entry below states the POSITION the expected result must hold and the reason
// that is the right position, taken from the spec rather than from the
// function -- addenda rule 20, an assertion written by running the code and
// pinning the result is a change detector that certifies nothing.
//
// WHERE A TIE IS GENUINE IT IS DECLARED AS A TIE. Two placements of one item
// type in two rooms at the same depth carry identical vocabulary, so they score
// identically and `order by score desc, depth asc, label asc` cannot separate
// them: their relative order is UNSPECIFIED, and an assertion naming one of
// them first would be pinned to heap order and would pass today for no reason
// (addenda rule 22 -- unspecified is not random, and Postgres agrees with
// itself on the broken function as readily as on the fixed one; measured here,
// twelve runs of one such query gave one ordering). Those entries assert the
// SET occupying a rank RANGE, which is a rank claim and not a membership one.
//
// THE CORPUS CAN FAIL, AND THE PROOF IS AT THE BOTTOM OF THIS FILE. Five
// mutations are applied to the real search objects IN-DATABASE -- the
// shallower-wins tie break inverted, the alias band removed, the tag band
// removed, the trigram similarity threshold raised, and the final-token prefix
// term OR'd back into the whole query instead of conjoined -- and each is
// required to demote at least one named query. A corpus that cannot go red is a
// corpus that will never catch anything.
//
// THE PINNED GAP IS GONE BECAUSE 0165 CLOSED IT, and the two place queries are
// ordinary acceptance cases now. 0162's header line 35 claimed "mill room
// caliper" narrowed by place; its body OR'd the final-token prefix term into
// the whole query, so any caliper anywhere matched, and this file pinned that
// as a known gap rather than leaving it to be rediscovered. 0165 conjoins the
// prefix term instead. Both word orders are asserted below, deliberately: the
// defect was ORDER-DEPENDENT -- "caliper mill room" put 'room' in the prefix
// slot and appeared to narrow while doing nothing of the kind -- so a corpus
// carrying only one of the two orders is a corpus that would have missed it.
// The fifth mutation restores exactly that defect and both must demote.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestDb } from './db/harness';
import { search, seedMapsWorld, startMapsDb, type MapsWorld, type SearchRow } from './db/maps-fixture';

let db: TestDb;
let world: MapsWorld;
const proof: string[] = [];

beforeAll(async () => {
	db = await startMapsDb();
	world = await seedMapsWorld(db);
}, 180_000);

afterAll(async () => {
	if (proof.length) writeFileSync(join(tmpdir(), 'maps-corpus-proof.txt'), proof.join('\n'));
	await db?.stop();
});

/** A readable name for every seeded id, so a failure names the row (addenda rule 17). */
function nameOf(id: string): string {
	for (const [k, v] of Object.entries(world.node)) if (v === id) return `node:${k}`;
	for (const [k, v] of Object.entries(world.type)) if (v === id) return `type:${k}`;
	for (const [k, v] of Object.entries(world.item)) if (v === id) return `item:${k}`;
	for (const [k, v] of Object.entries(world.stock)) if (v === id) return `stock:${k}`;
	return id;
}
const namesOf = (rows: SearchRow[]) => rows.map((r) => nameOf(r.result_id));

/**
 * One acceptance case. `at` is a rank claim: a single id must hold exactly that
 * position (1-based), and a SET must occupy exactly that range in some order.
 */
interface Case {
	/** What a student typed. */
	query: string;
	/** The spec clause this case exists for. */
	spec: string;
	/** Why the required position is the right one. */
	why: string;
	/** Exact expected result count, so a widened match reddens too. */
	count: number;
	/** Rank claims: 1-based position (or inclusive range) -> the id(s) that must hold it. */
	at: Array<{ rank: number | [number, number]; ids: () => string[] }>;
	/** Ids that must not appear at all, with the reason each is a trap. */
	absent?: () => Array<{ id: string; why: string }>;
}

function corpus(): Case[] {
	const calMill = () => world.stock['Dial Caliper@Mill Room'];
	const calShop = () => world.stock['Dial Caliper@Machine Shop'];
	const calItem = () => world.item['Shop Caliper'];
	const hexShop = () => world.stock['Hex Key Set@Machine Shop'];
	const hexDrawer = () => world.stock['Hex Key Set@Drawer 1'];
	const micStock = () => world.stock['Digital Micrometer@Bench Cabinet'];
	const sawStock = () => world.stock['Horizontal Band Saw@Machine Shop'];

	return [
		{
			query: 'Dial Caliper',
			spec: '5.2 weighted full-text, band A = name',
			why:
				'An exact canonical name must return every placement of that type and nothing else. ' +
				'The two room-level placements (depth 2) tie exactly -- same type, same vocabulary, ' +
				'same depth -- so they hold ranks 1-2 in an unspecified order; the drawer-level unique ' +
				'item is deeper and must come last, which is the shallower-wins tie break of 5.2.',
			count: 3,
			at: [
				{ rank: [1, 2], ids: () => [calMill(), calShop()] },
				{ rank: 3, ids: () => [calItem()] }
			],
			absent: () => [
				{ id: micStock(), why: 'same brand and same category, but a different tool' },
				{ id: hexShop(), why: 'shares no vocabulary; would mean the match is not discriminating' }
			]
		},
		{
			query: 'allen wrenches',
			spec: '5.1 aliases are indexed vocabulary; 5.2 band A = aliases',
			why:
				'THE ALIAS CASE, and the fixture is built so it can only be satisfied one way: ' +
				'"allen wrenches" shares NO token with the canonical name "Hex Key Set", so a hit can ' +
				'have come through the alias band and nowhere else. Both published placements must ' +
				'return, shallower first -- the room-level one at rank 1, the drawer at rank 2 -- ' +
				'because the depths differ and 5.2 breaks toward the shallower.',
			count: 2,
			at: [
				{ rank: 1, ids: () => [hexShop()] },
				{ rank: 2, ids: () => [hexDrawer()] }
			],
			absent: () => [
				{ id: calMill(), why: 'a wrench query must not return a measuring tool' },
				{ id: sawStock(), why: 'nor a saw' }
			]
		},
		{
			query: 'calipre',
			spec: '5.2 trigram similarity for typos',
			why:
				'A single transposition of "caliper". The student gets the same three placements they ' +
				'would have got had they spelled it correctly, in the same order: the two room-level ' +
				'ties, then the deeper item. A typo must cost nothing.',
			count: 3,
			at: [
				{ rank: [1, 2], ids: () => [calMill(), calShop()] },
				{ rank: 3, ids: () => [calItem()] }
			],
			absent: () => [
				{ id: micStock(), why: 'the trigram leg must not be so loose it pulls in the whole category' }
			]
		},
		{
			query: 'calip',
			spec: '5.2 prefix matching for live results while typing',
			why:
				'Five characters into the word, which is what the search bar sends on the fifth ' +
				'keystroke. The result set must already be the right one and in the right order, ' +
				'because a live surface that reshuffles as the last two letters arrive is one nobody ' +
				'can click.',
			count: 3,
			at: [
				{ rank: [1, 2], ids: () => [calMill(), calShop()] },
				{ rank: 3, ids: () => [calItem()] }
			],
			absent: () => [{ id: hexDrawer(), why: 'a five-letter prefix must not match everything' }]
		},
		{
			query: 'Mitutoyo',
			spec: '5.1/5.2 band B = brand',
			why:
				'A brand-only query, and the fixture gives the brand TWO different tools so the case ' +
				'cannot be satisfied by there being only one Mitutoyo thing in the building. All four ' +
				'Mitutoyo placements return and nothing else: the two room-level calipers tie at 1-2, ' +
				'the unit-level micrometer is next at 3, and the drawer-level caliper is deepest at 4. ' +
				'Ranks 3 and 4 are decided by depth alone, which is exactly the tie break under test.',
			count: 4,
			at: [
				{ rank: [1, 2], ids: () => [calMill(), calShop()] },
				{ rank: 3, ids: () => [micStock()] },
				{ rank: 4, ids: () => [calItem()] }
			],
			absent: () => [
				{ id: sawStock(), why: 'a DoAll saw is not a Mitutoyo tool' },
				{ id: hexShop(), why: 'nor is a Bondhus hex set' }
			]
		},
		{
			query: '505-742',
			spec: '5.1/5.2 band B = part number',
			why:
				'A part number off a label or an order form, and the discriminating half is the ' +
				'ABSENCE: the micrometer shares the brand and the category and carries part number ' +
				'293-340, so a part-number query that returned it would mean the band is matching the ' +
				'brand beside it rather than the number.',
			count: 3,
			at: [
				{ rank: [1, 2], ids: () => [calMill(), calShop()] },
				{ rank: 3, ids: () => [calItem()] }
			],
			absent: () => [
				{ id: micStock(), why: 'same brand, same category, DIFFERENT part number -- the whole point' }
			]
		},
		{
			query: 'thing that cuts aluminum',
			spec: "5.5 function queries (\"thing that cuts aluminum\" resolving via tags)",
			why:
				'THE FUNCTION QUERY, verbatim from the spec. Nothing in the band saw\'s NAME, brand, ' +
				'model, part number or description contains "cuts" or "aluminum" -- only its tags do ' +
				'("cuts aluminum", "cutting"). So a hit can only have arrived through the tag band, and ' +
				'it must be rank 1, because a student who can describe only what the thing DOES has ' +
				'nothing else to try.',
			count: 1,
			at: [{ rank: 1, ids: () => [sawStock()] }],
			absent: () => [
				{ id: calMill(), why: 'a caliper does not cut' },
				{ id: hexShop(), why: 'nor does a hex key' }
			]
		},
		{
			query: 'mill room caliper',
			spec: '5.1 "so \'mill room caliper\' narrows by place"; 5.2 band D',
			why:
				'THE PLACE-NARROWED QUERY, in the spec\'s own words. The same item type sits in two ' +
				'rooms at the SAME depth, so depth cannot separate them and only the ancestor band ' +
				'can. Every term the student typed is required, so the only published caliper left ' +
				'is the one whose chain carries BOTH "mill" and "room": it is the single result and ' +
				'therefore rank 1. The Mill Room node is not a result and must not be -- the student ' +
				'also typed "caliper", and a room carries no caliper vocabulary in any band, so a ' +
				'query that returned it would be one where the words are alternatives rather than ' +
				'requirements. That is precisely the defect 0165 fixed.',
			count: 1,
			at: [{ rank: 1, ids: () => [calMill()] }],
			absent: () => [
				{
					id: calShop(),
					why:
						'the identical tool in the OTHER room. If this appears, the query did not narrow ' +
						'by place and the D band is doing nothing -- this is the exact row 0162 returned.'
				},
				{
					id: calItem(),
					why:
						'the drawer-level caliper, which is under Machine Shop too. A narrowing that ' +
						'dropped only the room-level twin would be depth doing the work, not place.'
				}
			]
		},
		{
			query: 'caliper mill room',
			spec: '5.1 ancestor chain names; 5.2 band D',
			why:
				'THE SAME QUESTION IN THE OTHER ORDER, and it must give the SAME answer. This is not ' +
				'a duplicate: under 0162 these two phrasings disagreed, because whichever word landed ' +
				'last became a free-standing prefix alternative -- "room" here, which happens to ' +
				'exclude everything under Machine Shop, so this order looked correct while narrowing ' +
				'nothing. Word order is not a search operator, so the count, the rank and the traps ' +
				'are identical to the entry above.\n' +
				'THIS ENTRY CHANGED WITH 0165, and both halves of the old expectation were artifacts ' +
				'of the defect: it asserted 5 results with the Mill Room NODE at rank 1 and the ' +
				'caliper at rank 2. The node, the Bridgeport Mill, the Bench Cabinet and the ' +
				'micrometer were all admitted by that free "room":* term alone, none of them carries ' +
				'"caliper" anywhere, and none is an answer to what was asked.',
			count: 1,
			at: [{ rank: 1, ids: () => [calMill()] }],
			absent: () => [
				{
					id: calShop(),
					why: 'the identical tool in the OTHER room; its absence IS the narrowing'
				},
				{
					id: world.node['Mill Room'],
					why:
						'the room itself. Admitted by 0162 through the OR\'d prefix term; a room is not ' +
						'a caliper and the student typed both words.'
				}
			]
		},
		{
			query: 'hex key set',
			spec: '5.2 "ties broken toward shallower items"',
			why:
				'THE TIE BREAK, isolated. Two placements of one type with byte-identical vocabulary, ' +
				'so score cannot separate them and depth is the only signal left: the room-level ' +
				'placement (depth 2) must outrank the drawer-level one (depth 4). A student standing ' +
				'in the doorway wants the room before the drawer.',
			count: 2,
			at: [
				{ rank: 1, ids: () => [hexShop()] },
				{ rank: 2, ids: () => [hexDrawer()] }
			]
		},
		{
			query: 'zzqqxx',
			spec: '5.4 the vocabulary grows from misses',
			why:
				'A query that must return nothing, so the empty state and the miss-logging path are ' +
				'both exercised. A search that answered SOMETHING here would mean the trigram leg ' +
				'matches anything, which would make every other rank claim in this file meaningless.',
			count: 0,
			at: []
		}
	];
}

/** Runs one case anonymously and returns the failures, as sentences. */
async function runCase(c: Case): Promise<string[]> {
	const rows = await search(db, null, c.query);
	const got = namesOf(rows);
	const fails: string[] = [];

	if (rows.length !== c.count) {
		fails.push(`"${c.query}": expected ${c.count} result(s), got ${rows.length} -> [${got.join(', ')}]`);
	}
	for (const claim of c.at) {
		const [lo, hi] = typeof claim.rank === 'number' ? [claim.rank, claim.rank] : claim.rank;
		const expected = claim.ids().map(nameOf).sort();
		const actual = rows
			.slice(lo - 1, hi)
			.map((r) => nameOf(r.result_id))
			.sort();
		if (JSON.stringify(actual) !== JSON.stringify(expected)) {
			fails.push(
				`"${c.query}": rank ${lo === hi ? lo : `${lo}-${hi}`} must be [${expected.join(', ')}], ` +
					`was [${actual.join(', ')}]  (full order: ${got.join(' > ')})`
			);
		}
	}
	for (const a of c.absent?.() ?? []) {
		if (rows.some((r) => r.result_id === a.id)) {
			fails.push(`"${c.query}": ${nameOf(a.id)} must not appear (${a.why}); full order: ${got.join(' > ')}`);
		}
	}
	return fails;
}

describe('IDEA Maps search: the acceptance corpus (spec 5.5)', () => {
	it('the corpus covers every category spec 5.5 names', () => {
		// THE DENOMINATOR (addenda rule 11). A category dropped from the corpus is
		// a category nobody is testing, and the corpus would still be green.
		const specs = corpus().map((c) => c.query);
		expect(specs).toEqual([
			'Dial Caliper',
			'allen wrenches',
			'calipre',
			'calip',
			'Mitutoyo',
			'505-742',
			'thing that cuts aluminum',
			'mill room caliper',
			'caliper mill room',
			'hex key set',
			'zzqqxx'
		]);
		expect(specs.length).toBe(11);
	});

	for (const c of corpus()) {
		it(`"${c.query}" (${c.spec})`, async () => {
			const fails = await runCase(c);
			expect(fails, c.why).toEqual([]);
		});
	}

	it('every case is driven ANONYMOUSLY and an admin sees at least as much', async () => {
		// The corpus is the PUBLIC acceptance set: it runs as `anon`, which is the
		// caller spec section 2 is about. The admin comparison is a control that
		// the corpus is not accidentally measuring an empty database.
		const report: string[] = [];
		for (const c of corpus()) {
			const anon = await search(db, null, c.query);
			const admin = await search(db, world.admin.id, c.query);
			expect(admin.length).toBeGreaterThanOrEqual(anon.length);
			report.push(`"${c.query}": anon ${anon.length}, admin ${admin.length}`);
		}
		proof.push('ANON/ADMIN COUNTS\n  ' + report.join('\n  '));
		expect(report.length).toBe(11);
	});

	it('a missed query is loggable by the anonymous reader who missed it', async () => {
		const rows = await search(db, null, 'zzqqxx');
		expect(rows).toEqual([]);
		await db.asAnon((q) =>
			q(`insert into public.maps_search_log (query, result_count) values ($1, $2)`, [
				'zzqqxx',
				rows.length
			])
		);
		const { rows: logged } = await db.sql<{ query: string; result_count: number }>(
			`select query, result_count from public.maps_search_log where query = 'zzqqxx'`
		);
		expect(logged).toEqual([{ query: 'zzqqxx', result_count: 0 }]);
	});

	// -----------------------------------------------------------------------
	// THE GAP THIS FILE USED TO PIN IS CLOSED. See the file header.
	//
	// What stood here was `PINNED GAP: the spec's own phrasing "mill room
	// caliper" does NOT narrow by place`, which asserted the DEFECT: that every
	// hit saturated to exactly 1.0, that the caliper in the other room came back
	// anyway, and that ranks 1 and 2 were indistinguishable on all three sort
	// keys. Its own comment said "THIS TEST IS EXPECTED TO GO RED WHEN THE GAP IS
	// FIXED", and 0165 is that fix, so it is replaced by the two acceptance cases
	// above rather than deleted quietly. The reasoning is in
	// docs/history/maps-search-tsquery-fix-1hkd03.md.
	//
	// One thing the old test measured is worth keeping as a claim in its own
	// right, because it is what made the defect survive a reading: WORD ORDER IS
	// NOT A SEARCH OPERATOR. The two corpus entries above assert the same count,
	// the same rank and the same traps, which already forces agreement; this
	// asserts it directly, over the case-and-whitespace variants a person
	// actually types, so a future change that reintroduces an order dependence
	// names itself rather than showing up as two unrelated corpus failures.
	// -----------------------------------------------------------------------
	it('the same three words in any order, case or spacing give the same answer', async () => {
		const forms = [
			'mill room caliper',
			'caliper mill room',
			'MILL ROOM CALIPER',
			'mill  room   caliper',
			'Mill Room Caliper '
		];
		const seen: string[] = [];
		for (const f of forms) {
			const rows = await search(db, null, f);
			seen.push(`${JSON.stringify(f)} -> [${namesOf(rows).join(', ')}]`);
		}
		const expected = `[stock:Dial Caliper@Mill Room]`;
		expect(
			seen.map((line) => line.slice(line.indexOf('-> ') + 3)),
			'every phrasing must resolve to the one caliper in the named room; under 0162 the ' +
				'"...caliper" orders returned all three calipers and the "...room" order returned five ' +
				'rows led by the room itself'
		).toEqual(forms.map(() => expected));
		proof.push('\nWORD ORDER IS NOT AN OPERATOR\n  ' + seen.join('\n  '));
	});

	it('PINNED GAP: a British spelling finds nothing', async () => {
		// The tag is "cuts aluminum"; `websearch_to_tsquery('english', ...)` does
		// not stem "aluminium" onto "aluminum", and the trigram leg scores the
		// whole phrase below threshold. So the same question asked in the other
		// spelling returns zero. Recorded because spec 5.5's stated intent is "a
		// student who knows the wrong name ... still finds it", and a spelling is
		// a wrong name. The fix is an alias or a tag, which is CONTENT (spec 5.4's
		// miss-driven growth is exactly this mechanism), not a schema change.
		expect(await search(db, null, 'thing that cuts aluminium')).toEqual([]);
		expect(
			(await search(db, null, 'thing that cuts aluminum')).length,
			'the control: the US spelling does find it'
		).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// THE CORPUS FAILURE PROOF.
//
// A corpus that cannot go red is a corpus that will never catch anything, so
// five mutations are applied to the REAL search objects in this file's own
// disposable database and each is required to demote at least one named query.
// The mutations are applied to the definition text read back out of the catalog
// with `pg_get_functiondef`, and the RESTORE re-executes that captured text and
// then compares the catalog to it -- from a copy, never from the migration
// file, for the reason CLAUDE.md's mutation rule gives.
//
// EACH MUTATION IS PROVEN TO HAVE APPLIED BEFORE ITS RESULT IS READ (addenda
// rule 6): the pattern it replaces is asserted to occur, with its occurrence
// COUNT, and the catalog text is asserted to have changed. A mutation that
// never landed is indistinguishable from a mutation nothing catches.
//
// ONE OF THE FIVE IS THE REJECTED ALTERNATIVE RATHER THAN A BREAKAGE (addenda
// rule 9): inverting the tie break to deeper-wins is a design somebody could
// reasonably refactor toward, and the corpus has to notice that too, not only
// obvious damage.
//
// AND ONE IS THE HISTORICAL DEFECT ITSELF. The fifth mutation puts 0162's OR'd
// prefix term back. A regression proof written after a fix, that cannot
// reproduce the fault the fix was for, has proven only that the new code agrees
// with itself.
// ---------------------------------------------------------------------------

interface Mutation {
	name: string;
	/** What the search would become. */
	intent: string;
	/** [function signature, pattern, replacement, expected occurrences] */
	edits: Array<{ fn: string; find: string; replace: string; occurrences: number }>;
	/** Queries that MUST demote. Each names what breaks and how. */
	mustDemote: string[];
}

const SEARCH_FN = 'public.maps_search(text, integer)';
const TYPE_VOCAB_FN =
	'public._maps_item_type_vocab(text, text[], text[], text, text, text, text, text)';

const MUTATIONS: Mutation[] = [
	{
		name: 'tie break inverted to deeper-wins',
		intent:
			'THE REJECTED ALTERNATIVE. Spec 5.2 says "ties broken toward shallower items"; the ' +
			'opposite -- most specific location first -- is a design a future session could ' +
			'plausibly refactor toward, and it looks tidier. The corpus must notice.',
		edits: [
			{
				fn: SEARCH_FN,
				find: 'order by s.hit_score desc, s.chain_depth asc',
				replace: 'order by s.hit_score desc, s.chain_depth desc',
				occurrences: 1
			}
		],
		mustDemote: ['hex key set', 'Mitutoyo', 'Dial Caliper', 'calipre', 'calip', '505-742']
	},
	{
		name: 'alias band removed from the search vector',
		intent:
			'Aliases stop being weight-A vocabulary (spec 5.1/5.2), in the tsvector AND in the ' +
			'trigram blob, which is what it takes to remove them from every leg at once.',
		edits: [
			{
				fn: SEARCH_FN,
				find: "array_to_string(t.aliases, ' ')",
				replace: "''::text",
				occurrences: 4
			},
			{
				fn: TYPE_VOCAB_FN,
				find: "array_to_string(p_aliases, ' '),",
				replace: '',
				occurrences: 1
			}
		],
		mustDemote: ['allen wrenches']
	},
	{
		name: 'tag band removed from the search vector',
		intent:
			'Tags stop being weight-B vocabulary, which is the only route a function query has ' +
			'(spec 5.5, "thing that cuts aluminum" resolving via tags).',
		edits: [
			{
				fn: SEARCH_FN,
				find: "array_to_string(t.tags, ' ')",
				replace: "''::text",
				occurrences: 4
			},
			{
				fn: TYPE_VOCAB_FN,
				find: "array_to_string(p_tags, ' '),",
				replace: '',
				occurrences: 1
			}
		],
		mustDemote: ['thing that cuts aluminum']
	},
	{
		name: "the final-token prefix term OR'd into the whole query (the 0162 defect)",
		intent:
			'THE DEFECT 0165 FIXED, restored exactly. 0162 built the query as ' +
			'`websearch(english) || websearch(simple) || to_tsquery(last || \':*\')`, and `||` on ' +
			'tsquery is OR, so the final token stood alone as an alternative and any row carrying ' +
			'it matched whatever else was typed. Flipping the two `&&` operators back to `||` ' +
			'reproduces that -- the prefix term becomes a free alternative again -- and both place ' +
			'queries must go red. A corpus that could not catch the bug it was just corrected for ' +
			'is a corpus that certified the correction and nothing else.',
		edits: [
			{
				fn: SEARCH_FN,
				find: '&& v_pref',
				replace: '|| v_pref',
				occurrences: 2
			}
		],
		mustDemote: ['mill room caliper', 'caliper mill room']
	},
	{
		name: 'trigram similarity threshold raised to 0.9',
		intent:
			'ONE THRESHOLD. `<%` uses pg_trgm.word_similarity_threshold, 0.6 by default; the typo ' +
			'"calipre" scores 0.625 against the caliper vocabulary, so 0.9 is the smallest change ' +
			'that closes the typo leg without touching anything else.',
		edits: [
			{
				fn: SEARCH_FN,
				find: 'v_q <% h.vocab',
				replace: 'word_similarity(v_q, h.vocab) >= 0.9',
				occurrences: 1
			}
		],
		mustDemote: ['calipre']
	}
];

async function functionDef(signature: string): Promise<string> {
	const { rows } = await db.sql<{ def: string }>(
		`select pg_get_functiondef($1::regprocedure) as def`,
		[signature]
	);
	return rows[0].def;
}

describe('IDEA Maps search: the corpus can fail', () => {
	it('the whole corpus is green before any mutation', async () => {
		const fails: string[] = [];
		for (const c of corpus()) fails.push(...(await runCase(c)));
		expect(fails).toEqual([]);
		proof.push('\nBASELINE: all 11 corpus queries pass.');
	});

	for (const m of MUTATIONS) {
		it(`mutation: ${m.name}`, async () => {
			const captured = new Map<string, string>();
			for (const e of m.edits) captured.set(e.fn, await functionDef(e.fn));

			try {
				// APPLY, proving each pattern matched and the catalog moved.
				for (const e of m.edits) {
					const original = captured.get(e.fn)!;
					const hits = original.split(e.find).length - 1;
					expect(
						hits,
						`${m.name}: the pattern ${JSON.stringify(e.find)} occurs ${hits} time(s) in ` +
							`${e.fn}, expected ${e.occurrences}. The mutation would not have landed, and a ` +
							`mutation that never landed looks exactly like one nothing catches.`
					).toBe(e.occurrences);
					await db.sql(original.split(e.find).join(e.replace));
					const now = await functionDef(e.fn);
					expect(now, `${m.name}: ${e.fn} is unchanged in the catalog`).not.toBe(original);
					expect(now.includes(e.find), `${m.name}: ${e.fn} still contains the pattern`).toBe(false);
				}

				// MEASURE. Every named query must now fail, and the failure is
				// reported with the order that produced it.
				const stillPassing: string[] = [];
				const demoted: string[] = [];
				for (const name of m.mustDemote) {
					const c = corpus().find((x) => x.query === name);
					expect(c, `${m.name}: names a query "${name}" the corpus does not contain`).toBeTruthy();
					const fails = await runCase(c!);
					if (fails.length === 0) stillPassing.push(name);
					else demoted.push(`      "${name}" -> ${fails[0]}`);
				}
				expect(
					stillPassing,
					`${m.name}: these corpus queries did NOT demote under a mutation that should have ` +
						`broken them, so the corpus is not protecting what it claims to protect`
				).toEqual([]);

				proof.push(
					`\nMUTATION: ${m.name}\n` +
						`  intent : ${m.intent}\n` +
						`  edits  : ${m.edits.map((e) => `${e.occurrences}x ${JSON.stringify(e.find)} in ${e.fn}`).join('; ')}\n` +
						`  BEFORE : all 11 corpus queries pass\n` +
						`  AFTER  : ${m.mustDemote.length} demoted\n${demoted.join('\n')}`
				);
			} finally {
				// RESTORE from the captured copy, and verify byte-identically.
				for (const [fn, def] of captured) await db.sql(def);
				for (const [fn, def] of captured) {
					expect(await functionDef(fn), `${m.name}: ${fn} did not restore identically`).toBe(def);
				}
			}

			// GREEN AGAIN, over the WHOLE corpus rather than the demoted subset:
			// a restore that repaired the named queries and left something else
			// broken would otherwise pass.
			const after: string[] = [];
			for (const c of corpus()) after.push(...(await runCase(c)));
			expect(after, `${m.name}: the corpus is not green again after the restore`).toEqual([]);
			proof.push(`  RESTORED: definitions byte-identical, all 11 corpus queries pass again.`);
		}, 180_000);
	}
});
