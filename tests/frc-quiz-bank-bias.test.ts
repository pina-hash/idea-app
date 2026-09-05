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
// EVERY ASSERTION HERE IS ONE-DIRECTIONAL, AND THREE OF THEM WERE NOT. Measured
// 2026-09-05 by putting an IMPROVEMENT to this file -- lengthening one MDM-10
// distractor past its answer, the exact repair the document asks for -- three
// assertions reddened: two exact counts (`toBe(95)`, `toBe(45)`) and an
// arithmetic test that had used the live MDM-10 bank as its fixture. A guard
// that goes red on the fix is worse than one that stays silent, because the
// cheapest way out of it is to edit the number, and a number edited in either
// direction is the ratchet this header rejects. The counts are now a ceiling
// and a floor, and the arithmetic is asserted against a synthetic bank.
//
// AND A FAILURE NAMES THE ITEM. `longestIds` records WHICH questions handed
// their answer over on the recording date, asserted as a subset, so "this bank
// got worse" became "m2-01 got worse" -- and a swap that leaves the count
// unchanged is caught too.
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
	expectedAttempts,
	expectedCooldownSeconds,
	fixesNeeded,
	giveaway,
	independenceFrom,
	longestOption,
	measureAll,
	measureBank,
	nearDuplicatePair,
	ofTheAboveOption,
	runTell,
	shortestOption,
	stemEchoOption,
	techiestOption,
	wordiestOption
} from './frc-quiz-bank-bias';
import { FRC_QUIZ_COOLDOWNS_SEC, cooldownSecondsForFailStreak } from '../src/lib/frc/track';

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
 *
 * `longestIds` is WHICH items those were, on that date, and it exists because a
 * count cannot name anything. A failure quoting "9/14, over its budget of 8/14"
 * sends a person to open fourteen questions and diff them by eye; the recorded
 * SET turns the same failure into "m2-01 became the longest-option answer".
 * It is asserted as a SUBSET -- today's offenders must all be on the recorded
 * list -- which is one-directional by construction: fixing an item shrinks the
 * measured set and passes silently, and it also catches the SWAP a count cannot
 * see, where one item is fixed and another broken in the same edit. Adding an
 * id here is the same act as raising a budget and carries the same obligation:
 * say why, in a comment, beside it.
 */
const BUDGET: Record<
	string,
	{ longestOfItems: [number, number]; passLongest: number; longestIds: string[] }
> = {
	// The two that a student could realistically walk through. MDM-10 hands a
	// longest-option-only student better than even odds over two attempts.
	'MDM-10': {
		longestOfItems: [13, 14],
		passLongest: 0.5714285714285714,
		longestIds: [
			'm10-01', 'm10-02', 'm10-03', 'm10-05', 'm10-06', 'm10-07', 'm10-08', 'm10-09',
			'm10-10', 'm10-11', 'm10-12', 'm10-13', 'm10-14'
		]
	},
	F5: {
		longestOfItems: [9, 10],
		passLongest: 0.4,
		longestIds: [
			'qf5-01', 'qf5-02', 'qf5-03', 'qf5-04', 'qf5-05', 'qf5-06', 'qf5-07', 'qf5-08',
			'qf5-09'
		]
	},
	F2: {
		longestOfItems: [8, 10],
		passLongest: 0.13333333333333333,
		longestIds: [
			'qf2-01', 'qf2-02', 'qf2-04', 'qf2-05', 'qf2-06', 'qf2-07', 'qf2-08', 'qf2-10'
		]
	},
	F4: {
		longestOfItems: [8, 10],
		passLongest: 0.13333333333333333,
		longestIds: [
			'qf4-03', 'qf4-04', 'qf4-05', 'qf4-06', 'qf4-07', 'qf4-08', 'qf4-09', 'qf4-10'
		]
	},
	'MDM-1': {
		longestOfItems: [21, 32],
		passLongest: 0.05583091969719767,
		longestIds: [
			'm1-001', 'm1-005', 'm1-007', 'm1-010', 'm1-013', 'm1-014', 'm1-015', 'm1-017',
			'm1-018', 'm1-019', 'm1-020', 'm1-021', 'm1-022', 'm1-025', 'm1-026', 'm1-027',
			'm1-028', 'm1-029', 'm1-030', 'm1-031', 'm1-032'
		]
	},
	'MDM-2': {
		longestOfItems: [8, 14],
		passLongest: 0.009324009324009324,
		longestIds: [
			'm2-02', 'm2-03', 'm2-05', 'm2-08', 'm2-09', 'm2-12', 'm2-13', 'm2-14'
		]
	},
	'MDM-3': {
		longestOfItems: [8, 14],
		passLongest: 0.009324009324009324,
		longestIds: [
			'm3-01', 'm3-02', 'm3-03', 'm3-06', 'm3-08', 'm3-10', 'm3-13', 'm3-14'
		]
	},
	'MDM-9': {
		longestOfItems: [8, 14],
		passLongest: 0.009324009324009324,
		longestIds: [
			'm9-03', 'm9-05', 'm9-07', 'm9-09', 'm9-10', 'm9-11', 'm9-12', 'm9-14'
		]
	},
	F1: {
		longestOfItems: [7, 12],
		passLongest: 0,
		longestIds: [
			'qf1-01', 'qf1-02', 'qf1-03', 'qf1-04', 'qf1-05', 'qf1-07', 'qf1-11'
		]
	},
	F3: {
		longestOfItems: [5, 10],
		passLongest: 0,
		longestIds: [
			'qf3-02', 'qf3-03', 'qf3-04', 'qf3-05', 'qf3-08'
		]
	}
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

			// WHICH ITEM, FIRST. vitest stops a test at its first failed expectation,
			// so an assertion that names the offending question has to come BEFORE the
			// two rate assertions below or it never runs -- measured 2026-09-05, the
			// worsening control reddened on the rate and the id list was never
			// reached, which is the whole failure this assertion exists to prevent.
			// Recorded ids that no longer offend are NOT asserted: that direction is
			// the fix.
			const recorded = new Set(budget.longestIds);
			const nowOffending = BANKS[b.unitId].items
				.filter((it) => longestOption(it) === it.answer)
				.map((it) => it.id);
			expect(
				nowOffending.filter((id) => !recorded.has(id)),
				`${b.unitId}: these items did not hand over their answer by length on ` +
					`2026-08-29 and now do. Lengthen a distractor past the answer, or, if ` +
					`this is deliberate, add the id to longestIds with a reason.`
			).toEqual([]);

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
describe('the OTHER cheap strategies a student could run instead', () => {
	// ADDED 2026-09-05. "The longest option is the answer 68% of the time" is
	// only half a finding: if a second strategy that needs no knowledge also
	// clears the gate, the rewrite is a larger and differently-shaped job, and
	// lengthening distractors would not finish it. Both of these come back
	// negative, and a negative that nobody measured is a negative nobody can
	// rely on -- so they are asserted here rather than left as a sentence.

	it('picking the SHORTEST option is worse than guessing, and stays worse', () => {
		const t = runTell(allItems(), shortestOption);
		expect(t.applies, 'the detector fires, so the result below means something').toBeGreaterThan(
			100
		);
		// Measured: 11 of 140, 7.9%, against 25% at chance. It is not merely
		// useless, it is anti-correlated -- which is the length tell seen from the
		// other end and not an independent fact about the banks.
		expect(
			t.hits / allItems().length,
			`shortest-is-answer ${t.hits}/${allItems().length} = ${pct(t.hits / allItems().length)}`
		).toBeLessThan(TARGET_RATE);
		// It cannot pass any bank: an attacker running it gets fewer than the
		// needed correct answers on every draw of every bank.
		for (const b of measureAll()) {
			const bank = BANKS[b.unitId];
			const gettable = bank.items.filter((it) => shortestOption(it) === it.answer).length;
			expect(
				gettable,
				`${b.unitId}: a shortest-option student can reach at most ${gettable} correct, ` +
					`needing ${b.correctNeeded} of ${b.testLength}`
			).toBeLessThan(b.correctNeeded);
		}
	});

	it('picking the most TECHNICAL-SOUNDING option is chance, and is length in disguise', () => {
		const t = runTell(allItems(), techiestOption);
		expect(t.applies, 'the detector fires somewhere').toBeGreaterThan(40);
		// Measured: it fires on 58 items and is right on 35 -- 60.3% of the items
		// it fires on, which reads alarming, and exactly 25.0% of the 140-item
		// corpus, which is chance. The difference between those two readings is
		// the denominator, and it is the trap this file already documents for the
		// stem echo.
		expect(
			t.hits / allItems().length,
			`techiest-is-answer ${t.hits}/${allItems().length} = ${pct(t.hits / allItems().length)} ` +
				`(against ${pct(t.rate!)} of the ${t.applies} it fires on)`
		).toBeLessThanOrEqual(TARGET_RATE + EPS);

		// And where it fires it is not carrying its own signal: on the items where
		// it and the length tell point at DIFFERENT options, length is right 16
		// times and this is right once. A longer option holds more long words.
		const indep = independenceFrom(allItems(), techiestOption);
		expect(indep.disagreements, 'they disagree somewhere, so this is decidable').toBeGreaterThan(
			10
		);
		expect(
			indep.tellRight / indep.disagreements,
			`where they disagree (${indep.disagreements} items): technical right ${indep.tellRight}, ` +
				`length right ${indep.baselineRight}`
		).toBeLessThan(indep.baselineRight / indep.disagreements);

		// So it gets no budget of its own either. If it ever beats length on the
		// disagreements it has become a real second tell and needs one -- which is
		// what this assertion is here to notice.
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
		// a view of the same measurement rather than a second one. This one is an
		// EQUALITY because it relates two live measurements to each other and holds
		// at any bank state, which is exactly what the two below are not.
		expect(scored.length).toBe(runTell(allItems(), longestOption).hits);

		// A CEILING, NOT THE 95 THIS USED TO PIN. Measured 2026-09-05: an exact
		// `toBe(95)` here, and `toBe(45)` below, REDDENED ON AN IMPROVEMENT --
		// lengthening one MDM-10 distractor past its answer, which is precisely the
		// fix the whole file exists to ask for, failed three assertions. A guard
		// that punishes the repair trains its reader to edit the number, and a
		// number edited in either direction is the ratchet the header rejects. The
		// scored list may only ever get shorter.
		expect(
			scored.length,
			`${scored.length} items hand over their answer by length; 95 on 2026-09-05, ` +
				`target ${pct(TARGET_RATE)} of ${allItems().length} = ${Math.round(TARGET_RATE * allItems().length)}`
		).toBeLessThanOrEqual(95);
		// Every scored item really is longer than its best distractor.
		expect(scored.every((x) => x.g > 1)).toBe(true);
		// And the worst is not marginal: the top item's answer is more than
		// twice the length of anything offered against it.
		expect(scored[0].g).toBeGreaterThan(2);
	});

	it('an item whose answer is not the longest scores zero', () => {
		const notLongest = allItems().filter((it) => longestOption(it) !== it.answer);
		// A FLOOR, for the reason above: the clean set may only ever grow. Paired
		// with the ceiling above and the corpus total, which pins the partition
		// exactly without either half being pinned in the direction of the fix.
		expect(notLongest.length).toBeGreaterThanOrEqual(45);
		expect(
			notLongest.length + allItems().filter((it) => longestOption(it) === it.answer).length
		).toBe(allItems().length);
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
		// change the story. 13 of 14 items gettable, 6 drawn, all 6 needed:
		// hypergeometric = C(13,6)/C(14,6) = 8/14 = 4/7 = 57.1%, where binomial
		// would say (13/14)^6 = 63.6%.
		//
		// SYNTHETIC, AND IT USED TO READ MDM-10. That shape asserted a claim about
		// ARITHMETIC against live CONTENT, so fixing the bank broke a test about
		// maths -- measured 2026-09-05, the same one-distractor improvement that
		// reddened the two counts above reddened this as well. The bank supplied
		// the 13-of-14 shape and nothing else, so the shape is built here instead
		// and the expectation stays hand-computed.
		const gettable = (n: number, of: number): BankItem[] =>
			Array.from({ length: of }, (_, i) =>
				// The answer is the uniquely longest option in the first `n` items and
				// tied (so the tell does not fire) in the rest.
				item({ id: `s${i}`, options: i < n ? ['aaaa', 'b', 'c', 'd'] : ['a', 'b', 'c', 'd'] })
			);
		const bank13of14 = { testLength: 6, passPercent: 90, items: gettable(13, 14) };
		expect(measureBank('synthetic', bank13of14).passLongest).toBeCloseTo(4 / 7, 12);
		expect(measureBank('synthetic', bank13of14).passLongest).not.toBeCloseTo((13 / 14) ** 6, 4);
		// 9 of 10 gettable, 6 drawn, all 6 needed. C(9,6)/C(10,6) = 4/10.
		expect(
			measureBank('synthetic', { testLength: 6, passPercent: 90, items: gettable(9, 10) })
				.passLongest
		).toBeCloseTo(0.4, 12);
	});

	it('random passing is a rounding error, which is what the gate assumes', () => {
		for (const b of measureAll())
			expect(b.passRandom, `${b.unitId} random pass`).toBeLessThan(0.001);
	});

	it('the retake arithmetic is geometric, because attempts carry nothing forward', () => {
		// THE NUMBER A PER-ATTEMPT PROBABILITY HIDES. There is no attempt limit
		// anywhere in the quiz path -- only `FRC_QUIZ_COOLDOWNS_SEC`, which tops
		// out at an hour -- so a 13% bank is not a defended bank, it is one that
		// falls on the eighth try. Attempts are independent (a fresh shuffle of
		// every item index, and a failed attempt returns a score and the missed
		// OBJECTIVE tags, never which questions were wrong), so this is geometric.
		expect(expectedAttempts(0.5)).toBe(2);
		expect(expectedAttempts(0.25)).toBe(4);
		expect(expectedAttempts(0)).toBe(Infinity);

		// Hand-computed against a flat 10s cooldown at p = 0.5: the expected number
		// of waits is E[attempts] - 1 = 1, so the expected wait is 10s.
		expect(expectedCooldownSeconds(0.5, () => 10)).toBeCloseTo(10, 6);
		expect(expectedCooldownSeconds(1, () => 10)).toBeCloseTo(0, 12);

		// And against the REAL schedule, which is imported rather than restated --
		// a second copy of 60/300/900/3600 in this file is how the lint and the
		// gate come to disagree about what a retake costs. What is asserted is
		// that the schedule is what the arithmetic above was computed against,
		// and NOT what it currently costs any particular bank: "MDM-10 falls in
		// under two attempts" is a fact about today's CONTENT, and pinning it
		// here would redden the moment somebody fixed MDM-10. That was measured
		// on this very assertion (2026-09-05, the improvement control), which is
		// the third time the same mistake appeared in this file. The live figure
		// belongs in the generated report, which is regenerated rather than
		// asserted.
		expect(FRC_QUIZ_COOLDOWNS_SEC).toEqual([60, 300, 900, 3600]);
		expect(cooldownSecondsForFailStreak(1)).toBe(60);
		expect(cooldownSecondsForFailStreak(9), 'it plateaus rather than growing').toBe(3600);
	});

	it('fixesNeeded answers the two questions a person deciding actually has', () => {
		// The full job and the urgent job are different numbers, and reporting
		// only the larger one is how a fixable thing gets deferred as too big.
		// A synthetic bank, so the expectation is hand-computed: 8 of 10 items
		// hand over their answer, chance would be 2, so 6 have to be neutralised.
		const items = Array.from({ length: 10 }, (_, i) =>
			item({ id: `s${i}`, options: i < 8 ? ['aaaa', 'b', 'c', 'd'] : ['a', 'b', 'c', 'd'] })
		);
		const f = fixesNeeded({ testLength: 6, passPercent: 90, items });
		expect(f.toChance).toBe(6);
		// And the gate is held long before that: it only takes enough fixes to put
		// a longest-option student under the 1% ceiling.
		expect(f.toGateHeld).toBeLessThan(f.toChance);
		expect(f.passAfterGateHeld).toBeLessThan(0.01);
	});
});
