// tests/frc-quiz-bank-bias.test.ts
//
// THE BANK LINT. `tests/frc-quiz-disclosure.ts` asks whether the SERVED
// PAYLOAD leaks the key, and it holds. This asks the question one layer in:
// whether the answer is recoverable from the OPTION TEXT, which is a defect no
// code change can fix and which the shuffle cannot touch, because every
// heuristic here is invariant under permutation.
//
// ============================ THE THRESHOLD ================================
//
// Measured over the ten committed banks, 140 items: the single longest option
// is the correct one 95 times, 68%, against 25% at chance. Three shapes of
// assertion were available and two of them are traps.
//
//   PIN TODAY'S 68%. A ratchet: it records what last happened and checks
//   nothing. Worse, it BLESSES the defect -- a number in a test file reads as a
//   standard, and the next person to see 68% asserted reads it as the level the
//   banks are supposed to sit at. Rejected outright.
//
//   ASSERT THE TARGET, 25%. Red on arrival, on all ten banks, greenable only by
//   rewriting 140 questions. `CLAUDE.md` is explicit that a test nobody can
//   keep green is worse than no test, and it has the `spec-instructions-budget`
//   history to prove it: a standing red failure hid every real regression in
//   the suite behind it for days. Rejected.
//
//   FAIL ON WORSENING. What is shipped, in two tiers, because the banks are in
//   two states and one assertion cannot serve both.
//
// TIER A -- ABSOLUTE, ZERO TOLERANCE, on the four dimensions that are CLEAN
// today. Uniform option count, no "all of the above", no near-duplicate-pair
// leak, no article agreement. Each measures zero right now, so a zero-tolerance
// assertion is green on arrival and bites the first time anybody writes one.
// These are free teeth and there is no argument for softening them.
//
// TIER B -- A PER-BANK BUDGET on the dimension that is already bad, recorded at
// today's EXACT measured value with no headroom. Any edit that makes a bank
// give away more reddens; any edit that gives away less passes silently.
//
// WHY TIER B IS NOT THE RATCHET IT LOOKS LIKE. A ratchet is a number that gets
// rewritten to whatever the content now produces, so it only ever records
// history. This one has no slack to drift into -- it is not "today plus a
// margin", it is today -- and it is a MAXIMUM that may only ever be lowered,
// which is stated here and is the whole contract. Somebody who raises a budget
// to get CI green has to type a larger number under a comment that says raising
// it means the quiz got easier to cheat. That is the strongest thing a lint can
// actually deliver against hand-edited prose: it cannot make the regression
// impossible, so it makes it loud and attributable.
//
// AND THE TARGET IS RECORDED RATHER THAN ASSERTED. `TARGET_RATE` below is 25%,
// the chance rate, which is what a bank with no length tell would measure. It
// is reported by the report generator and named in every failure message, so
// the standard is visible without being a failing test. The banks are ~2.7x it.
//
// WHAT THIS FILE WILL NOT DO IS FIX THE CONTENT. A machine that lengthens
// distractors produces plausible-looking nonsense inside a quiz that gates a
// student's progress. `docs/frc/quiz-bank-bias-report.md` is the per-item list,
// worst first, for the person who wrote the questions.

import { describe, expect, it } from 'vitest';
import {
	BANKS,
	type BankItem,
	allItems,
	absoluteFreeOption,
	articleAgreementOption,
	giveaway,
	independenceFrom,
	longestOption,
	measureAll,
	measureBank,
	nearDuplicatePair,
	ofTheAboveOption,
	runTell,
	stemEchoOption,
	wordiestOption
} from './frc-quiz-bank-bias';

/**
 * The rate a bank with no length tell would measure: one option in four.
 * RECORDED, NOT ASSERTED -- see the header. It is what every failure message
 * quotes so the budget below is read as a holding position rather than a
 * standard.
 */
const TARGET_RATE = 0.25;

/**
 * PER-BANK BUDGET, measured 2026-08-29 against the committed banks. Each entry
 * is a CEILING and may only ever be LOWERED. Raising one means the bank started
 * giving its answers away more freely than it did on that date; if that is a
 * deliberate trade, it needs a sentence here saying why, because nothing else
 * in the repo will record it.
 *
 * `longestOfItems` is [items whose answer is the uniquely longest option, items
 * in the bank]. It is stored as the PAIR rather than as a rate so that shrinking
 * a bank cannot satisfy it: the ceiling stays the old fraction while the
 * measured rate rises.
 *
 * `passLongest` is the exact probability that one attempt passes for a student
 * who knows nothing and always picks the longest option -- hypergeometric over
 * the bank's own draw, against its own testLength and pass threshold. It is the
 * number that actually matters, because it is the gate being defeated rather
 * than a statistic about prose.
 */
const BUDGET: Record<string, { longestOfItems: [number, number]; passLongest: number }> = {
	// The two that a student could realistically walk through. MDM-10 hands a
	// longest-option-only student better than even odds over two attempts.
	'MDM-10': { longestOfItems: [13, 14], passLongest: 0.5714285714285714 },
	F5: { longestOfItems: [9, 10], passLongest: 0.4 },
	F2: { longestOfItems: [8, 10], passLongest: 0.13333333333333333 },
	F4: { longestOfItems: [8, 10], passLongest: 0.13333333333333333 },
	'MDM-1': { longestOfItems: [21, 32], passLongest: 0.05583091969719767 },
	'MDM-2': { longestOfItems: [8, 14], passLongest: 0.009324009324009324 },
	'MDM-3': { longestOfItems: [8, 14], passLongest: 0.009324009324009324 },
	'MDM-9': { longestOfItems: [8, 14], passLongest: 0.009324009324009324 },
	F1: { longestOfItems: [7, 12], passLongest: 0 },
	F3: { longestOfItems: [5, 10], passLongest: 0 }
};

/** Float slack. The measurements are exact rationals; this is for the last bit. */
const EPS = 1e-12;

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

// ---------------------------------------------------------------------------
describe('every bank is measured, and the sweep cannot come back empty', () => {
	it('covers every committed bank and every item in it', () => {
		// THE POSITIVE CONTROL for everything below. A lint whose corpus is empty
		// passes every absence assertion in this file, and "no findings" is what
		// nobody investigates.
		const measured = measureAll();
		expect(measured.length).toBe(Object.keys(BANKS).length);
		expect(measured.length).toBe(10);
		expect(allItems().length).toBe(140);
		// Every bank has a budget and every budget names a bank, so a bank added
		// later cannot slip past the lint by not being listed.
		expect(Object.keys(BUDGET).sort()).toEqual(Object.keys(BANKS).sort());
	});

	it('the tell fires on the real banks, so an absence below means something', () => {
		// A second positive control, on the DETECTOR rather than the corpus: the
		// longest-option heuristic is measurably better than chance right now.
		// If this ever fails because the banks were fixed, that is the good news
		// and the budgets come down with it.
		const t = runTell(allItems(), longestOption);
		expect(t.applies).toBeGreaterThan(120);
		expect(t.rate).not.toBeNull();
		expect(t.rate!).toBeGreaterThan(t.chance);
	});
});

/**
 * A synthetic item carrying a known defect. THE POSITIVE CONTROLS for Tier A
 * are built from these: every assertion down there is an ABSENCE, and an
 * absence proves nothing until the detector has been shown to find the thing
 * when it is there. A broken detector reports a clean corpus, and clean is
 * what nobody investigates.
 */
function item(over: Partial<BankItem> = {}): BankItem {
	return {
		id: 'synthetic',
		objective: 'x',
		stem: 'Which one is it?',
		options: ['alpha', 'beta', 'gamma', 'delta'],
		answer: 0,
		...over
	};
}

// ---------------------------------------------------------------------------
describe('the detectors find their defect when it IS there', () => {
	it('finds an "all of the above" option', () => {
		expect(ofTheAboveOption(item({ options: ['a', 'b', 'c', 'All of the above'] }))).toBe(3);
		expect(ofTheAboveOption(item({ options: ['a', 'b', 'c', 'None of these'] }))).toBe(3);
		expect(ofTheAboveOption(item())).toBeNull();
	});

	it('finds a stem whose article agrees with exactly one option', () => {
		expect(
			articleAgreementOption(item({ stem: 'A bearing is held by an', options: ['axle', 'bolt', 'clip', 'pin'] }))
		).toBe(0);
		// Two vowel-initial options: it does not fire, because it no longer picks one.
		expect(
			articleAgreementOption(item({ stem: 'It needs an', options: ['axle', 'insert', 'clip', 'pin'] }))
		).toBeNull();
		expect(articleAgreementOption(item())).toBeNull();
	});

	it('finds the only option with no absolute qualifier', () => {
		expect(
			absoluteFreeOption(item({ options: ['Only drivers', 'Never', 'Anyone who helps', 'Always the coach'] }))
		).toBe(2);
		expect(absoluteFreeOption(item())).toBeNull();
	});

	it('finds a near-duplicate pair, and does not invent one', () => {
		expect(
			nearDuplicatePair(
				item({ options: ['the bearing carries the shaft load', 'the bearing carries the shaft weight', 'paint it', 'weigh it'] })
			)
		).toEqual([0, 1]);
		expect(nearDuplicatePair(item())).toBeNull();
	});

	it('finds the longest and wordiest option, and reports a tie as neither', () => {
		expect(longestOption(item({ options: ['a', 'bb', 'cccc', 'd'] }))).toBe(2);
		expect(longestOption(item({ options: ['aa', 'bb', 'cc', 'dd'] }))).toBeNull();
		expect(wordiestOption(item({ options: ['one', 'two words', 'x', 'y'] }))).toBe(1);
		expect(wordiestOption(item({ options: ['a b', 'c d', 'e f', 'g h'] }))).toBeNull();
	});

	it('scores a give-away and is silent where the answer is not the longest', () => {
		expect(giveaway(item({ options: ['aaaaaaaaaa', 'bb', 'cc', 'dd'], answer: 0 }))).toBe(5);
		expect(giveaway(item({ options: ['aaaaaaaaaa', 'bb', 'cc', 'dd'], answer: 1 }))).toBe(0);
	});

	it('runTell counts an inapplicable item as neither hit nor miss', () => {
		// The distinction the whole file rests on: a heuristic that fires twice
		// and is right twice is a different fact from one that fires 140 times
		// and is right twice, and averaging over the wrong denominator is how
		// this analysis goes wrong. (It did, once, on the stem-echo tell below.)
		const items = [item({ options: ['aaaa', 'b', 'c', 'd'], answer: 0 }), item({ options: ['aa', 'aa', 'aa', 'aa'] })];
		const t = runTell(items, longestOption);
		expect(t).toMatchObject({ applies: 1, hits: 1, rate: 1 });
	});
});

// ---------------------------------------------------------------------------
describe('TIER A: the dimensions that are clean stay clean', () => {
	it('every item in every bank offers the same number of options', () => {
		// A question with three options where its neighbours have four is a tell
		// on its own (something was removed, and what is left is the short list),
		// and it also breaks the exact random-pass arithmetic this file reports.
		for (const b of measureAll())
			expect(b.optionCounts, `${b.unitId} option counts`).toEqual([4]);

		// POSITIVE CONTROL, and it is not decoration: an assertion that a
		// measured [4] equals [4] is satisfied just as well by a `measureBank`
		// that RETURNS a constant, and a mutant which hardcoded exactly that
		// survived this test until this control was added. A synthetic bank with
		// a three-option item has to come back saying so.
		const mixed = measureBank('synthetic', {
			testLength: 2,
			passPercent: 90,
			items: [item(), item({ options: ['a', 'b', 'c'] })]
		});
		expect(mixed.optionCounts).toEqual([3, 4]);
	});

	it('no option is "all of the above" or "none of the above"', () => {
		const found = allItems().filter((it) => ofTheAboveOption(it) !== null);
		expect(
			found.map((f) => `${f.unitId} ${f.id}`),
			'an "of the above" option is a giveaway by construction'
		).toEqual([]);
	});

	it('no stem leaks through a/an agreement with exactly one option', () => {
		const found = allItems().filter((it) => articleAgreementOption(it) !== null);
		expect(found.map((f) => `${f.unitId} ${f.id}`)).toEqual([]);
	});

	it('a near-duplicate pair of options does not point at the answer', () => {
		// Two options that are near-restatements of each other narrow a
		// four-way guess to two, IF the answer is reliably one of them. Measured
		// today: the pair fires on 22 items and contains the answer 12 times,
		// against 11 expected -- noise, not a tell. Asserted as a band around
		// chance so it stays that way; a bank written so the near-duplicate pair
		// always brackets the answer would double a guesser's odds on a fifth of
		// the corpus.
		const items = allItems();
		const t = runTell(
			items,
			(it) => {
				const pair = nearDuplicatePair(it);
				// Point at the answer only if it is IN the pair, so "hits" counts
				// exactly the items where knowing the pair would have helped.
				return pair === null ? null : pair.includes(it.answer) ? it.answer : -1;
			},
			(it) => 2 / it.options.length
		);
		expect(t.applies, 'the pair detector fired somewhere').toBeGreaterThan(10);
		expect(t.rate!, `answer-in-pair ${pct(t.rate!)} against ${pct(t.chance)} chance`).toBeLessThan(
			t.chance + 0.2
		);
	});
});

// ---------------------------------------------------------------------------
describe('TIER B: the length tell may not get worse than it is', () => {
	for (const b of measureAll()) {
		it(`${b.unitId} gives away no more than its recorded budget`, () => {
			const budget = BUDGET[b.unitId];
			expect(budget, `${b.unitId} has no recorded budget -- measure it and add one`).toBeDefined();
			const ceilingRate = budget.longestOfItems[0] / budget.longestOfItems[1];

			expect(
				b.longestRate,
				`${b.unitId}: the longest option is the answer ${b.longest}/${b.items} = ` +
					`${pct(b.longestRate)}, over its budget of ${pct(ceilingRate)}. ` +
					`The target is ${pct(TARGET_RATE)}. Lengthen the distractors; do not raise the budget.`
			).toBeLessThanOrEqual(ceilingRate + EPS);

			expect(
				b.passLongest,
				`${b.unitId}: a student who knows nothing and always picks the longest ` +
					`option now passes ${pct(b.passLongest)} of first attempts, over its budget of ` +
					`${pct(budget.passLongest)} (random: ${pct(b.passRandom)}).`
			).toBeLessThanOrEqual(budget.passLongest + EPS);
		});
	}

	it('the corpus as a whole does not get worse', () => {
		// The per-bank budgets can all hold while the corpus grows a new bank
		// that is terrible, so the whole is asserted as well as the parts.
		const t = runTell(allItems(), longestOption);
		expect(
			t.hits / allItems().length,
			`longest-is-answer ${t.hits}/${allItems().length}; target ${pct(TARGET_RATE)}`
		).toBeLessThanOrEqual(95 / 140 + EPS);
	});

	it('word count is a second reading of the same tell, and is budgeted too', () => {
		// Lengthening a distractor by padding one option with long words would
		// move the character measure without moving the word measure, and a fix
		// that games one reading is worth catching.
		const t = runTell(allItems(), wordiestOption);
		expect(t.hits / allItems().length).toBeLessThanOrEqual(88 / 140 + EPS);
	});
});

// ---------------------------------------------------------------------------
describe('the second tell: distractors written as absolutes', () => {
	it('the option with no absolute qualifier is a certainty where it fires', () => {
		// MEASURED AND REPORTED, NOT BUDGETED DOWN. It fires on 9 of 140 items --
		// the "Only the captain / Only mentors / Only drivers" shape, against one
		// general statement -- and on all 9 it is the answer. 9 for 9 at a 25%
		// chance rate is p < 4e-6, so it is real; it is also narrow enough that a
		// rate budget over 140 items would not notice it moving. What is asserted
		// is the COUNT of items carrying the shape, which is the thing a rewrite
		// changes.
		const t = runTell(allItems(), absoluteFreeOption);
		expect(t.applies, 'items where three of four options are absolutes').toBeLessThanOrEqual(9);
		// And the hit rate is recorded so a future reader knows it was total.
		expect(t.hits).toBe(t.applies);
	});
});

// ---------------------------------------------------------------------------
describe('the tell that looks real and is not', () => {
	it('stem echo is the length tell in a second costume, and is not budgeted', () => {
		// WORTH THE WORDS, because the naive reading of this one is wrong and
		// the wrong reading sends somebody rewriting questions to fix a shadow.
		// Pick the option sharing the most content words with the question: it
		// fires on 40 items and is correct on 27, 67.5% against 25% chance, which
		// reads as a second serious leak.
		const echo = runTell(allItems(), stemEchoOption);
		expect(echo.applies).toBeGreaterThan(30);
		expect(echo.rate!).toBeGreaterThan(2 * echo.chance);

		// It carries no signal of its own. On the items where the two heuristics
		// point at DIFFERENT options -- the only place they can be told apart --
		// length is right far more often than the echo is. A longer option
		// overlaps a stem more because it has more words in it.
		const indep = independenceFrom(allItems(), stemEchoOption);
		expect(indep.disagreements, 'they disagree somewhere, so this is decidable').toBeGreaterThan(5);
		// The claim is not merely "length wins" -- that is true of a comparison
		// restricted to nothing in particular, and stays true if the AGREEMENTS
		// are wrongly folded in, because those inflate both sides equally
		// (measured: with agreements included, 27 against 34, and this assertion
		// would not have noticed). The claim is that on the items where the echo
		// says something DIFFERENT, it is not even worth a guess.
		expect(
			indep.tellRight / indep.disagreements,
			`where they disagree (${indep.disagreements} items): echo right ${indep.tellRight}, ` +
				`length right ${indep.baselineRight}`
		).toBeLessThanOrEqual(0.25);
		expect(indep.baselineRight / indep.disagreements).toBeGreaterThan(0.5);

		// So it gets no budget of its own. If that ever inverts -- the echo
		// beating length on the disagreements -- it has become a real second
		// tell and needs one, which is what this assertion is here to notice.
	});
});

// ---------------------------------------------------------------------------
describe('the report is ordered by how much each item gives away', () => {
	it('scores an item by the answer length over the longest distractor', () => {
		// The ordering key for docs/frc/quiz-bank-bias-report.md. An item whose
		// answer is not the longest scores 0 and is not on the list; the worst
		// items are the ones where the answer dwarfs every distractor.
		const scored = allItems()
			.map((it) => ({ id: `${it.unitId} ${it.id}`, g: giveaway(it) }))
			.filter((x) => x.g > 0)
			.sort((a, b) => b.g - a.g);
		// The count matches the corpus-wide tell, which is what makes the report
		// a view of the same measurement rather than a second one.
		expect(scored.length).toBe(runTell(allItems(), longestOption).hits);
		expect(scored.length).toBe(95);
		// Every scored item really is longer than its best distractor.
		expect(scored.every((x) => x.g > 1)).toBe(true);
		// And the worst is not marginal: the top item's answer is more than
		// twice the length of anything offered against it.
		expect(scored[0].g).toBeGreaterThan(2);
	});

	it('an item whose answer is not the longest scores zero', () => {
		const notLongest = allItems().filter((it) => longestOption(it) !== it.answer);
		expect(notLongest.length).toBe(45);
		expect(notLongest.every((it) => giveaway(it) === 0)).toBe(true);
	});
});

// ---------------------------------------------------------------------------
describe('the arithmetic the budgets rest on', () => {
	it('correctNeeded mirrors the graders, including the rounding', () => {
		// The graders are `round(100 * correct / total) >= passPercent`, so at 90%
		// a six-question draw needs all six (5/6 rounds to 83) and a ten-question
		// draw needs nine. Derived from a hand-computed expectation rather than
		// from the function, which is the point.
		expect(measureBank('x', { testLength: 6, passPercent: 90, items: BANKS['F2'].items })
			.correctNeeded).toBe(6);
		expect(measureBank('x', { testLength: 10, passPercent: 90, items: BANKS['MDM-1'].items })
			.correctNeeded).toBe(9);
	});

	it('the pass probability is hypergeometric, not binomial', () => {
		// The draw is WITHOUT replacement -- pickAttempt slices a shuffle of the
		// item indices -- and on a small bank the difference is large enough to
		// change the story. MDM-10: 13 of 14 items gettable, 6 drawn, all 6
		// needed. Hypergeometric = C(13,6)/C(14,6) = 8/14 = 4/7 = 57.1%.
		// Binomial would say (13/14)^6 = 63.6%, which is the wrong number.
		const mdm10 = measureAll().find((b) => b.unitId === 'MDM-10')!;
		expect(mdm10.passLongest).toBeCloseTo(4 / 7, 12);
		expect(mdm10.passLongest).not.toBeCloseTo((13 / 14) ** 6, 4);
		// F5: 9 of 10 gettable, 6 drawn, all 6 needed. C(9,6)/C(10,6) = 4/10.
		expect(measureAll().find((b) => b.unitId === 'F5')!.passLongest).toBeCloseTo(0.4, 12);
	});

	it('random passing is a rounding error, which is what the gate assumes', () => {
		for (const b of measureAll())
			expect(b.passRandom, `${b.unitId} random pass`).toBeLessThan(0.001);
	});
});
