// tests/frc-quiz-engine.test.ts
//
// The FRC knowledge-gate engine, `src/lib/server/frc/quiz-engine.ts`, which had
// no test of any kind. It is the whole of selection, option shuffling, grading
// and the escalating cooldown for every unit with a bank (MDM-1, 2, 3, 9, 10
// and F1 through F5). A defect here fails a student who passed or passes one
// who failed, and neither announces itself: the score comes back, the gate
// opens or does not, and nothing anywhere is inconsistent.
//
// It is imported BY ITS REAL PATH rather than reimplemented, and the banks it
// serves are the real committed JSON, so every sweep below runs over the
// content students actually sit.
//
// FOUR CLAIMS, deliberately independent:
//   1. THE KEY NEVER REACHES THE CALLER. Asserted on SHAPE through the shared
//      detector (tests/frc-quiz-disclosure.ts), not on field names -- see that
//      file's header for why a field-name assertion is the one that passes for
//      years while the answer sits in the payload under a different spelling.
//   2. SHUFFLING DOES NOT CHANGE THE VERDICT. The sealed index is checked
//      against the correct option's TEXT, read from the bank -- never from the
//      sealed key itself, or an engine that sealed the wrong index would agree
//      with its own detector.
//   3. GRADING IS CORRECT AT ITS EDGES, all of them enumerated below.
//   4. THE COOLDOWN IS MONOTONIC AND BOUNDED, and nothing a caller supplies
//      reaches it.
//
// WHAT THE MEASUREMENT BELOW DOES NOT ASSERT, and why that is deliberate: the
// banks' option TEXT correlates with the answer (the longest option is correct
// far more often than chance), which no shuffle can fix because length is
// invariant under permutation. That is a defect in the CONTENT, not in this
// module, and pinning today's figure would be a ratchet that records what last
// happened and checks nothing. The numbers are in this bundle's history entry.
// What IS asserted here is the part the shuffle owns: a FIXED index must be
// worth exactly chance, and the two degenerate-shuffle worlds below prove that
// assertion bites.

import { describe, expect, it } from 'vitest';
import {
	cooldownState,
	getQuizBank,
	gradeAttempt,
	missedTopics,
	pickAttempt,
	type SealedItem
} from '../src/lib/server/frc/quiz-engine';
import { FRC_QUIZ_COOLDOWNS_SEC, cooldownSecondsForFailStreak } from '../src/lib/frc/track';
import {
	longestOptionIndex,
	mulberry32,
	numbersIn,
	recoveries,
	strategyHitRate,
	type AnswerTruth,
	type ServedQuestion
} from './frc-quiz-disclosure';
import mdm1Bank from '../src/lib/server/frc/mdm-1-quiz-bank.json';
import sharedBanks from '../src/lib/server/frc/mdm-quiz-banks.json';

interface BankItem {
	id: string;
	objective: string;
	stem: string;
	options: string[];
	answer: number;
}
interface Bank {
	title: string;
	testLength: number;
	passPercent: number;
	objectives: Record<string, string>;
	items: BankItem[];
}

/**
 * Every unit with a gate, read the way the engine reads them, so a bank added
 * to either file joins every sweep below with no edit here. The COUNT is
 * asserted so a sweep that generated nothing cannot pass.
 */
const BANKS: Record<string, Bank> = {
	'MDM-1': mdm1Bank as unknown as Bank,
	...((sharedBanks as unknown as { banks: Record<string, Bank> }).banks)
};
const UNIT_IDS = Object.keys(BANKS);

/** How many independent draws every sweep takes. Seeded, so never flaky. */
const DRAWS = 60;

/**
 * One draw, with the ground truth resolved from the BANK TEXT. `pickAttempt`'s
 * sealed key is returned alongside but is never what the truth is derived from.
 */
function draw(unitId: string, rng: () => number) {
	const bank = BANKS[unitId];
	const { questions, sealed } = pickAttempt(bank as never, rng);
	const truth: AnswerTruth[] = questions.map((q) => {
		const item = bank.items.find((it) => it.stem === q.stem);
		if (!item) throw new Error(`served a stem no bank item has: ${q.stem}`);
		const text = item.options[item.answer];
		const index = q.options.indexOf(text);
		if (index < 0) throw new Error(`the correct option is missing from the served options`);
		return { text, index };
	});
	return { bank, questions: questions as ServedQuestion[], sealed, truth };
}

// ---------------------------------------------------------------------------
// 0. The bank preconditions every later sweep rests on. Without these, several
//    assertions below could pass for the wrong reason: a duplicated option text
//    makes `indexOf` ambiguous, and a duplicated stem makes the bank lookup in
//    `draw()` pick the wrong item.
// ---------------------------------------------------------------------------
describe('the banks the engine serves', () => {
	it('is a non-empty set of units, and every one is reachable through getQuizBank', () => {
		expect(UNIT_IDS.length).toBeGreaterThanOrEqual(10);
		for (const id of UNIT_IDS) expect(getQuizBank(id), id).toBeDefined();
		expect(getQuizBank('MDM-4')).toBeUndefined();
		expect(getQuizBank('')).toBeUndefined();
		expect(getQuizBank('__nope__')).toBeUndefined();
	});

	it.each(UNIT_IDS)('%s: answers are in range, and stems and options are unambiguous', (id) => {
		const b = BANKS[id];
		expect(b.items.length).toBeGreaterThanOrEqual(b.testLength);
		expect(b.testLength).toBeGreaterThan(0);
		expect(b.passPercent).toBeGreaterThan(0);
		expect(b.passPercent).toBeLessThanOrEqual(100);
		for (const item of b.items) {
			expect(Number.isInteger(item.answer), `${id}/${item.id} answer is an integer`).toBe(true);
			expect(item.answer, `${id}/${item.id} answer in range`).toBeGreaterThanOrEqual(0);
			expect(item.answer, `${id}/${item.id} answer in range`).toBeLessThan(item.options.length);
			expect(new Set(item.options).size, `${id}/${item.id} options are distinct`).toBe(
				item.options.length
			);
			expect(item.objective, `${id}/${item.id} has an objective`).toBeTruthy();
		}
		const stems = b.items.map((i) => i.stem);
		expect(new Set(stems).size, `${id} stems are distinct`).toBe(stems.length);
	});
});

// ---------------------------------------------------------------------------
// 1. THE KEY NEVER REACHES THE CALLER.
// ---------------------------------------------------------------------------
describe('pickAttempt does not disclose the answer', () => {
	it('serves exactly testLength distinct items, each a genuine permutation of its options', () => {
		let checked = 0;
		for (const id of UNIT_IDS) {
			const b = BANKS[id];
			for (let seed = 1; seed <= DRAWS; seed++) {
				const { questions, sealed } = draw(id, mulberry32(seed * 7919 + id.length));
				expect(questions.length, id).toBe(b.testLength);
				expect(sealed.length, id).toBe(b.testLength);
				expect(new Set(questions.map((q) => q.stem)).size, `${id} no item served twice`).toBe(
					b.testLength
				);
				for (const q of questions) {
					const item = b.items.find((it) => it.stem === q.stem)!;
					// A permutation: same multiset of texts, nothing added, nothing dropped.
					expect([...q.options].sort()).toEqual([...item.options].sort());
					// The client-safe shape is exactly stem + options and nothing else.
					expect(Object.keys(q).sort()).toEqual(['options', 'stem']);
				}
				checked++;
			}
		}
		expect(checked).toBe(UNIT_IDS.length * DRAWS);
	});

	it('leaves the correct option unrecoverable from the served payload', () => {
		let checked = 0;
		const found: string[] = [];
		for (const id of UNIT_IDS) {
			for (let seed = 1; seed <= DRAWS; seed++) {
				const { questions, truth } = draw(id, mulberry32(seed * 104729 + id.length));
				// The payload the endpoint hands back, built the way the service
				// builds it, so the detector sees what a browser sees.
				const payload = { ok: true, attemptId: 'a-uuid', total: questions.length, questions };
				found.push(...recoveries(payload, questions, truth).map((r) => `${id}: ${r}`));
				checked++;
			}
		}
		expect(checked).toBe(UNIT_IDS.length * DRAWS);
		expect(found).toEqual([]);
	});

	it('puts no number in the payload beyond the question count', () => {
		// A positive control for the sweep above: the detector's number routes can
		// only bite if there ARE numbers to bite on, so pin what is legitimately
		// there. `total` is the only one, and it is the question count.
		const { questions } = draw('MDM-1', mulberry32(4242));
		const payload = { ok: true, attemptId: 'a-uuid', total: questions.length, questions };
		expect(numbersIn(payload)).toEqual([questions.length]);
	});
});

// ---------------------------------------------------------------------------
// 2. SHUFFLING DOES NOT CHANGE THE VERDICT. The off-by-one lives here and is
//    invisible in every individual case: a wrong sealed index simply marks a
//    right answer wrong, which reads as the student getting it wrong.
// ---------------------------------------------------------------------------
describe('the shuffle and the key agree', () => {
	it('seals the position of the correct option TEXT, on every draw of every bank', () => {
		let checked = 0;
		for (const id of UNIT_IDS) {
			for (let seed = 1; seed <= DRAWS; seed++) {
				const { questions, sealed, truth } = draw(id, mulberry32(seed * 15485863 + id.length));
				sealed.forEach((s, i) => {
					// The expected value comes from the bank's own text, never from `s`.
					expect(s.c, `${id} seed ${seed} q${i}`).toBe(truth[i].index);
					expect(questions[i].options[s.c], `${id} seed ${seed} q${i}`).toBe(truth[i].text);
					checked++;
				});
			}
		}
		expect(checked).toBe(UNIT_IDS.reduce((n, id) => n + BANKS[id].testLength * DRAWS, 0));
	});

	it('carries each served item OWN objective through to the sealed key', () => {
		for (const id of UNIT_IDS) {
			const { bank, questions, sealed } = draw(id, mulberry32(2718 + id.length));
			sealed.forEach((s, i) => {
				const item = bank.items.find((it) => it.stem === questions[i].stem)!;
				expect(s.o, `${id} q${i}`).toBe(item.objective);
			});
		}
	});

	it('a correct-by-text answer sheet always passes, and a wrong one always fails', () => {
		for (const id of UNIT_IDS) {
			for (let seed = 1; seed <= 12; seed++) {
				const { bank, questions, sealed, truth } = draw(id, mulberry32(seed * 31 + id.length));
				// Answer by TEXT: what a student who knows the material does.
				const byText = questions.map((q, i) => q.options.indexOf(truth[i].text));
				const win = gradeAttempt(sealed, byText, bank.passPercent);
				expect(win, `${id} seed ${seed}`).toEqual({ score: 100, passed: true, missed: [] });

				// Answer anything BUT the correct text, on every question.
				const wrong = questions.map((q, i) =>
					q.options.findIndex((_, k) => k !== truth[i].index)
				);
				const lose = gradeAttempt(sealed, wrong, bank.passPercent);
				expect(lose.score, `${id} seed ${seed}`).toBe(0);
				expect(lose.passed, `${id} seed ${seed}`).toBe(false);
			}
		}
	});
});

describe('the shuffle is what defeats a fixed guess', () => {
	/** Draws under one RNG, flattened, for a strategy sweep. */
	const sweep = (rngFor: (seed: number) => () => number) => {
		const draws = [];
		for (const id of UNIT_IDS)
			for (let seed = 1; seed <= DRAWS; seed++) {
				const d = draw(id, rngFor(seed + id.length * 1009));
				draws.push({ served: d.questions, truth: d.truth });
			}
		return draws;
	};

	/**
	 * The bank's own answer indices are heavily skewed toward 0 and 1 (the items
	 * were authored answer-first), so with the shuffle collapsed a fixed guess is
	 * worth far more than chance. Pinned as a PRECONDITION, because it is what
	 * makes the two permissive worlds below genuinely permissive rather than a
	 * control that could not fire whatever the engine did.
	 */
	it('the banks are skewed answer-first, which is what the shuffle has to destroy', () => {
		const counts = [0, 0, 0, 0];
		let items = 0;
		for (const id of UNIT_IDS)
			for (const item of BANKS[id].items) {
				counts[item.answer] = (counts[item.answer] ?? 0) + 1;
				items++;
			}
		const worst = Math.max(...counts) / items;
		expect(items).toBeGreaterThan(100);
		expect(worst, 'the most common bank answer index, pre-shuffle').toBeGreaterThan(0.4);
	});

	it('no fixed index is worth more than chance under the real shuffle', () => {
		const draws = sweep((s) => mulberry32(s * 433494437));
		const options = 4;
		for (let k = 0; k < options; k++) {
			const r = strategyHitRate(draws, () => k);
			expect(r.total).toBeGreaterThan(3000);
			// Chance is 1/4. A generous band, because this is a finite sample and
			// the point is to catch a COLLAPSED shuffle (which lands at 0.4+ or 0),
			// never to police sampling noise.
			expect(r.rate, `always picking index ${k}`).toBeGreaterThan(0.18);
			expect(r.rate, `always picking index ${k}`).toBeLessThan(0.32);
		}
	});

	// THE PERMISSIVE CONTROLS ARE TWO OTHER WORLDS, NOT A MUTATED FILE. Both are
	// real regressions of the same shape -- an RNG that stopped varying -- and
	// the assertion above must FIRE on each. Neither writes to src/.
	it('FIRES when the shuffle is the identity (rng pinned high)', () => {
		// Math.floor(0.999 * (i + 1)) === i for every i here, so Fisher-Yates
		// swaps each element with itself: the served order IS the bank order.
		const draws = sweep(() => () => 0.999);
		const best = Math.max(...[0, 1, 2, 3].map((k) => strategyHitRate(draws, () => k).rate));
		expect(best, 'a fixed index against an identity shuffle').toBeGreaterThan(0.32);
	});

	it('FIRES when the shuffle is a fixed rotation (rng pinned low)', () => {
		// rng() === 0 makes j always 0, which is a constant rotation rather than
		// the identity -- a different degenerate permutation, still deterministic.
		const draws = sweep(() => () => 0);
		const best = Math.max(...[0, 1, 2, 3].map((k) => strategyHitRate(draws, () => k).rate));
		expect(best, 'a fixed index against a constant rotation').toBeGreaterThan(0.32);
	});

	it('the detector reports a collapsed shuffle from the payload alone', () => {
		// R5: with the rotation above every item's correct index is a deterministic
		// function of its bank answer, so a bank whose items all share an answer
		// index serves a payload in which the answer never moves. Built here as a
		// synthetic bank rather than found in a real one, because the real banks
		// are only mostly skewed -- and a control that depends on the content
		// staying skewed is a control that silently stops firing.
		const bank = {
			title: 'synthetic',
			testLength: 3,
			passPercent: 90,
			objectives: { t: 'Topic' },
			items: [0, 1, 2].map((n) => ({
				id: `s${n}`,
				objective: 't',
				stem: `stem ${n}`,
				options: [`a${n}`, `b${n}`, `c${n}`, `d${n}`],
				answer: 0
			}))
		};
		const { questions, sealed } = pickAttempt(bank as never, () => 0.999);
		const truth: AnswerTruth[] = questions.map((q) => {
			const item = bank.items.find((it) => it.stem === q.stem)!;
			const text = item.options[item.answer];
			return { text, index: q.options.indexOf(text) };
		});
		expect(sealed.map((s) => s.c)).toEqual([0, 0, 0]);
		const hits = recoveries({ ok: true, total: 3, questions }, questions, truth, {
			flagConstantIndex: true
		});
		expect(hits.join(' ')).toContain('constant 0');
	});

	it('the length heuristic survives the shuffle, which is a CONTENT finding', () => {
		// Recorded, not policed. Option LENGTH is invariant under permutation, so
		// no change to this engine can move it; the fix is in the banks. The
		// assertion is only that the heuristic is not a CERTAINTY -- a bank whose
		// longest option is always correct would need no knowledge at all.
		const draws = sweep((s) => mulberry32(s * 2654435761));
		const r = strategyHitRate(draws, (q) => longestOptionIndex(q));
		expect(r.total).toBeGreaterThan(3000);
		expect(r.rate, 'picking the single longest option').toBeLessThan(1);
	});
});

// ---------------------------------------------------------------------------
// 3. GRADING AT ITS EDGES.
// ---------------------------------------------------------------------------
describe('gradeAttempt', () => {
	const sealed: SealedItem[] = [
		{ c: 0, o: 'alpha' },
		{ c: 1, o: 'beta' },
		{ c: 2, o: 'gamma' },
		{ c: 3, o: 'delta' }
	];

	it('every option correct', () => {
		expect(gradeAttempt(sealed, [0, 1, 2, 3], 90)).toEqual({
			score: 100,
			passed: true,
			missed: []
		});
	});

	it('every option wrong', () => {
		const r = gradeAttempt(sealed, [1, 0, 0, 0], 90);
		expect(r.score).toBe(0);
		expect(r.passed).toBe(false);
		expect(r.missed.sort()).toEqual(['alpha', 'beta', 'delta', 'gamma']);
	});

	it('an unanswered item is wrong, never skipped', () => {
		// A short answers array, and a hole in the middle: both are "no answer",
		// and both must count against the total rather than shrink it.
		expect(gradeAttempt(sealed, [0, 1], 90).score).toBe(50);
		const holed = [0, undefined as unknown as number, 2, 3];
		expect(gradeAttempt(sealed, holed, 90).score).toBe(75);
		expect(gradeAttempt(sealed, [], 90)).toEqual({
			score: 0,
			passed: false,
			missed: ['alpha', 'beta', 'gamma', 'delta']
		});
	});

	it('an out-of-range index is wrong, at either end', () => {
		expect(gradeAttempt(sealed, [-1, -1, -1, -1], 90).score).toBe(0);
		expect(gradeAttempt(sealed, [999, 999, 999, 999], 90).score).toBe(0);
		// NaN and Infinity are what `Number(x)` yields for a non-numeric body
		// value; neither may ever equal an index.
		expect(gradeAttempt(sealed, [NaN, NaN, NaN, NaN], 90).score).toBe(0);
		expect(gradeAttempt(sealed, [Infinity, -Infinity, NaN, NaN], 90).score).toBe(0);
	});

	it('a fractional index is wrong, because the comparison is strict', () => {
		// The endpoint coerces every submitted value with Number() and does not
		// round it. In THIS grader 2.7 is simply not 3. (The SQL mirror is a
		// different question and is measured in tests/frc-quiz-route.test.ts.)
		expect(gradeAttempt([{ c: 3, o: 'x' }], [2.7], 90).score).toBe(0);
		expect(gradeAttempt([{ c: 3, o: 'x' }], [3.0], 90).score).toBe(100);
	});

	it('an extra answer past the last question is ignored', () => {
		// Answering "twice" is what a client resubmitting a longer array looks
		// like: the walk is over the SEALED length, so the surplus cannot score.
		expect(gradeAttempt(sealed, [0, 1, 2, 3, 3, 3, 3], 90).score).toBe(100);
		expect(gradeAttempt(sealed, [1, 1, 2, 3, 0], 90).score).toBe(75);
	});

	it('a string index never counts, because === is not ==', () => {
		const asStrings = ['0', '1', '2', '3'] as unknown as number[];
		expect(gradeAttempt(sealed, asStrings, 90).score).toBe(0);
	});

	it('there is no partial credit beyond the rounded percentage', () => {
		// 90% over six questions means all six: five is 83, which rounds nowhere
		// near. Over ten it means nine. Both are pinned because the pass boundary
		// is the whole of what the gate is.
		const six: SealedItem[] = Array.from({ length: 6 }, (_, i) => ({ c: 0, o: `o${i}` }));
		expect(gradeAttempt(six, [0, 0, 0, 0, 0, 1], 90)).toMatchObject({ score: 83, passed: false });
		expect(gradeAttempt(six, [0, 0, 0, 0, 0, 0], 90)).toMatchObject({ score: 100, passed: true });
		const ten: SealedItem[] = Array.from({ length: 10 }, (_, i) => ({ c: 0, o: `o${i}` }));
		expect(gradeAttempt(ten, [0, 0, 0, 0, 0, 0, 0, 0, 0, 1], 90)).toMatchObject({
			score: 90,
			passed: true
		});
		expect(gradeAttempt(ten, [0, 0, 0, 0, 0, 0, 0, 0, 1, 1], 90)).toMatchObject({
			score: 80,
			passed: false
		});
	});

	it('rounds half-up, the way Postgres round() does', () => {
		// The SQL mirror uses round(100.0 * correct / total); JS Math.round and
		// Postgres round agree at a tie for a positive input, and this is the
		// case where they are asked. 1 of 8 is 12.5.
		const eight: SealedItem[] = Array.from({ length: 8 }, (_, i) => ({ c: 0, o: `o${i}` }));
		expect(gradeAttempt(eight, [0, 1, 1, 1, 1, 1, 1, 1], 90).score).toBe(13);
	});

	it('an empty sealed key scores 0 and cannot pass a real gate', () => {
		expect(gradeAttempt([], [], 90)).toEqual({ score: 0, passed: false, missed: [] });
		// Only a zero threshold lets it through, and no bank carries one (asserted
		// in the bank preconditions above).
		expect(gradeAttempt([], [], 0).passed).toBe(true);
	});

	it('missed objectives are DISTINCT and never carry an option', () => {
		const repeated: SealedItem[] = [
			{ c: 0, o: 'shared' },
			{ c: 0, o: 'shared' },
			{ c: 0, o: 'other' }
		];
		expect(gradeAttempt(repeated, [1, 1, 1], 90).missed).toEqual(['shared', 'other']);
	});

	it('the returned shape is exactly score, passed and missed', () => {
		expect(Object.keys(gradeAttempt(sealed, [0, 1, 2, 3], 90)).sort()).toEqual([
			'missed',
			'passed',
			'score'
		]);
	});
});

describe('missedTopics', () => {
	it('prefers the curated name, then the bank objective, then the bare tag', () => {
		expect(missedTopics(['sequence'])).toEqual(['Design-process order']);
		expect(missedTopics(['not-curated'], { 'not-curated': 'A bank description' })).toEqual([
			'A bank description'
		]);
		expect(missedTopics(['no-name-anywhere'])).toEqual(['no name anywhere']);
		// The curated table wins over a bank description for the same tag.
		expect(missedTopics(['sequence'], { sequence: 'a bank description' })).toEqual([
			'Design-process order'
		]);
	});

	it('preserves order and does not dedupe what the grader already deduped', () => {
		expect(missedTopics(['iteration', 'sequence'])).toEqual([
			'Iterating past the first version',
			'Design-process order'
		]);
	});

	it('never returns an option text, for any tag any bank can produce', () => {
		// The whole reason a fail returns TOPICS: a topic that quoted the answer
		// would be the disclosure the shuffle exists to prevent, arriving on the
		// one path where the student already knows they were wrong.
		const everyOption = new Set<string>();
		for (const id of UNIT_IDS)
			for (const item of BANKS[id].items) for (const o of item.options) everyOption.add(o);
		let checked = 0;
		for (const id of UNIT_IDS) {
			const b = BANKS[id];
			const tags = [...new Set(b.items.map((i) => i.objective))];
			for (const name of missedTopics(tags, b.objectives)) {
				expect(everyOption.has(name), `${id}: "${name}" is an option text`).toBe(false);
				for (const o of everyOption)
					expect(name.includes(o), `${id}: "${name}" quotes option "${o}"`).toBe(false);
				checked++;
			}
		}
		expect(checked).toBeGreaterThan(30);
	});
});

// ---------------------------------------------------------------------------
// 4. THE COOLDOWN. Monotonic, bounded, and reachable by nothing a student sends.
// ---------------------------------------------------------------------------
describe('cooldownSecondsForFailStreak', () => {
	it('is monotonic non-decreasing and bounded by the last step of the schedule', () => {
		const cap = FRC_QUIZ_COOLDOWNS_SEC[FRC_QUIZ_COOLDOWNS_SEC.length - 1];
		let previous = 0;
		for (let streak = 0; streak <= 200; streak++) {
			const s = cooldownSecondsForFailStreak(streak);
			expect(s, `streak ${streak} never shrinks`).toBeGreaterThanOrEqual(previous);
			expect(s, `streak ${streak} is bounded`).toBeLessThanOrEqual(cap);
			previous = s;
		}
		expect(cooldownSecondsForFailStreak(200)).toBe(cap);
	});

	it('is the published schedule, and zero below the first fail', () => {
		expect(FRC_QUIZ_COOLDOWNS_SEC).toEqual([60, 300, 900, 3600]);
		expect([0, 1, 2, 3, 4, 5].map(cooldownSecondsForFailStreak)).toEqual([
			0, 60, 300, 900, 3600, 3600
		]);
		expect(cooldownSecondsForFailStreak(-1)).toBe(0);
		expect(cooldownSecondsForFailStreak(-999)).toBe(0);
	});
});

describe('cooldownState', () => {
	const T = 1_700_000_000_000;
	const fail = (at: number) => ({ status: 'failed' as const, at });
	const pass = (at: number) => ({ status: 'passed' as const, at });

	it('is nothing at all with no attempts, and nothing after a pass', () => {
		expect(cooldownState([], T, cooldownSecondsForFailStreak)).toEqual({
			remainingSec: 0,
			failStreak: 0
		});
		expect(cooldownState([pass(T - 1000)], T, cooldownSecondsForFailStreak)).toEqual({
			remainingSec: 0,
			failStreak: 0
		});
	});

	it('escalates with the streak and stops at the cap', () => {
		const fails: { status: 'failed'; at: number }[] = [];
		const seen: number[] = [];
		for (let n = 1; n <= 6; n++) {
			// Each new fail is the newest, so the cooldown re-anchors on it.
			fails.push(fail(T + n));
			const cd = cooldownState(fails, T + n, cooldownSecondsForFailStreak);
			expect(cd.failStreak).toBe(n);
			seen.push(cd.remainingSec);
		}
		expect(seen).toEqual([60, 300, 900, 3600, 3600, 3600]);
		// Monotonic in the streak, which is the property rather than the numbers.
		for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
	});

	it('anchors on the NEWEST fail and is independent of the order it is given', () => {
		const log = [fail(T - 5000), fail(T - 1000), fail(T - 3000)];
		const forward = cooldownState(log, T, cooldownSecondsForFailStreak);
		const reversed = cooldownState([...log].reverse(), T, cooldownSecondsForFailStreak);
		const shuffled = cooldownState([log[1], log[2], log[0]], T, cooldownSecondsForFailStreak);
		expect(forward).toEqual(reversed);
		expect(forward).toEqual(shuffled);
		expect(forward.failStreak).toBe(3);
		// Anchored on T-1000, so 900s minus the elapsed second.
		expect(forward.remainingSec).toBe(899);
	});

	it('counts only the fails SINCE the last pass', () => {
		const log = [fail(T - 9000), fail(T - 8000), pass(T - 7000), fail(T - 1000)];
		const cd = cooldownState(log, T, cooldownSecondsForFailStreak);
		expect(cd.failStreak).toBe(1);
		expect(cd.remainingSec).toBe(59);
	});

	it('does not mutate the log it was handed', () => {
		const log = [fail(T - 5000), fail(T - 1000)];
		const before = JSON.stringify(log);
		cooldownState(log, T, cooldownSecondsForFailStreak);
		expect(JSON.stringify(log)).toBe(before);
	});

	it('runs down to zero and never below it', () => {
		const log = [fail(T)];
		expect(cooldownState(log, T, cooldownSecondsForFailStreak).remainingSec).toBe(60);
		expect(cooldownState(log, T + 30_000, cooldownSecondsForFailStreak).remainingSec).toBe(30);
		expect(cooldownState(log, T + 60_000, cooldownSecondsForFailStreak).remainingSec).toBe(0);
		expect(cooldownState(log, T + 600_000, cooldownSecondsForFailStreak).remainingSec).toBe(0);
		// A clock behind the fail is the pathological case, and it must not go
		// negative: remaining is clamped, so the WORST it can do is over-wait.
		expect(
			cooldownState(log, T - 10_000, cooldownSecondsForFailStreak).remainingSec
		).toBeGreaterThan(0);
	});

	it('cannot be SHORTENED by adding attempts, which is the only lever a student has', () => {
		// A student's inputs reach this function through one channel: rows they
		// caused to be written. Every such row is a fail or a pass, stamped by the
		// database. Adding a FAIL can only lengthen; adding a PASS is the gate
		// opening. There is no third move, and no parameter through which now, the
		// anchor or the schedule can be supplied.
		const base = [fail(T - 1000)];
		const baseline = cooldownState(base, T, cooldownSecondsForFailStreak).remainingSec;
		for (let extra = 1; extra <= 8; extra++) {
			// Older fails: the streak grows, the anchor does not move.
			const older = [...base, ...Array.from({ length: extra }, (_, k) => fail(T - 2000 - k * 100))];
			const r = cooldownState(older, T, cooldownSecondsForFailStreak).remainingSec;
			expect(r, `${extra} older fails`).toBeGreaterThanOrEqual(baseline);
		}
		// A fail dated in the FUTURE (a clock ahead of the app server, the only
		// way a stamp can lead `now`) also lengthens rather than shortens.
		const ahead = cooldownState(
			[...base, fail(T + 30_000)],
			T,
			cooldownSecondsForFailStreak
		).remainingSec;
		expect(ahead).toBeGreaterThan(baseline);
	});

	it('takes no argument a request body could reach', () => {
		// The signature IS the guarantee, the way a student-facing write RPC taking
		// no identity parameter is: attempts come from the store, nowMs from the
		// server clock, and the schedule from track.ts. Nothing is named that a
		// caller could supply.
		expect(cooldownState.length).toBe(3);
	});
});
