// tests/frc-quiz-bank-bias.ts
//
// MEASURES HOW MUCH A QUIZ BANK GIVES AWAY. Not a grader, not a detector of a
// leak in the CODE (that is `tests/frc-quiz-disclosure.ts`, which asks whether
// the SERVED PAYLOAD carries the key): this asks whether the answer is
// recoverable from the OPTION TEXT ITSELF, which no amount of shuffling can
// fix, because every heuristic here is invariant under permutation.
//
// WHY IT EXISTS. Measured over the ten committed banks, 140 items: the single
// longest option is the correct one 95 times, 68%, against 25% at chance. That
// is not a curiosity -- the gate is 90% on a six-question draw, so a student
// who knows nothing and always picks the longest option passes MDM-10 first
// try 57.1% of the time, against 0.024% at random. The banks are the defect and
// the person who wrote the questions is the person who should fix them; this
// module makes the size of it visible and keeps it from getting worse.
//
// IT IS ALSO THE REPORT GENERATOR'S ONLY SOURCE. `frc-quiz-bank-bias.test.ts`
// is the lint and `frc-quiz-bank-bias-report.mjs` writes the per-item document
// for whoever rewrites the questions; both call the functions below, so the
// number in the document and the number the test enforces cannot disagree.
// Node 22 strips the types, so the `.mjs` generator imports this `.ts` file
// directly and nothing is written twice.

import mdm1Bank from '../src/lib/server/frc/mdm-1-quiz-bank.json' with { type: 'json' };
import sharedBanks from '../src/lib/server/frc/mdm-quiz-banks.json' with { type: 'json' };

export interface BankItem {
	id: string;
	objective: string;
	stem: string;
	options: string[];
	answer: number;
}
export interface Bank {
	title?: string;
	testLength: number;
	passPercent: number;
	objectives?: Record<string, string>;
	items: BankItem[];
}

/**
 * Every committed bank, keyed by unit id -- assembled here exactly as
 * `quiz-engine.ts` assembles it, from the same two JSON files. It is read
 * straight from the content rather than through the engine because the engine
 * is server-only and this measures the CONTENT, not the code.
 */
export const BANKS: Record<string, Bank> = {
	'MDM-1': mdm1Bank as unknown as Bank,
	...((sharedBanks as unknown as { banks: Record<string, Bank> }).banks)
};

// ---------------------------------------------------------------------------
// The tells. Each takes one item and answers "which option does this heuristic
// point at", or null where it does not apply. A tell that does not apply is
// NOT a miss and must never be counted as one -- a heuristic that fires on two
// items and is right both times is a different (and worse) fact than one that
// fires on 140 and is right twice.
// ---------------------------------------------------------------------------

/** A word that makes a claim absolute, which is how a distractor is usually written. */
const ABSOLUTE = /\b(always|never|all|only|every|none|must|entirely|impossible|guarantee[sd]?)\b/i;

/** The uniquely longest option by character count, or null if there is a tie. */
export function longestOption(item: BankItem): number | null {
	const lens = item.options.map((o) => o.length);
	const max = Math.max(...lens);
	return lens.filter((l) => l === max).length === 1 ? lens.indexOf(max) : null;
}

/** The uniquely longest option by WORD count. A second reading of the same tell. */
export function wordiestOption(item: BankItem): number | null {
	const lens = item.options.map((o) => o.trim().split(/\s+/).length);
	const max = Math.max(...lens);
	return lens.filter((l) => l === max).length === 1 ? lens.indexOf(max) : null;
}

/**
 * The only option carrying no absolute qualifier, or null. Measured: this
 * applies to 9 of 140 items and is correct on all 9 -- narrow, and a certainty
 * where it fires. It is the "three of the four options start with Only" shape,
 * which a student recognises without knowing any content.
 */
export function absoluteFreeOption(item: BankItem): number | null {
	const free = item.options.map((o, i) => [i, !ABSOLUTE.test(o)] as const).filter(([, f]) => f);
	return free.length === 1 ? free[0][0] : null;
}

/** An "all/none/both of the above" option, or null. Classically a giveaway. */
export function ofTheAboveOption(item: BankItem): number | null {
	const i = item.options.findIndex((o) => /^(all|none|both) of (the above|these)\b/i.test(o.trim()));
	return i === -1 ? null : i;
}

function tokens(s: string): Set<string> {
	return new Set(
		s
			.toLowerCase()
			.replace(/[^a-z0-9 ]/g, ' ')
			.split(/\s+/)
			.filter((w) => w.length > 2)
	);
}

function jaccard(a: string, b: string): number {
	const A = tokens(a);
	const B = tokens(b);
	let inter = 0;
	for (const w of A) if (B.has(w)) inter++;
	return inter / (A.size + B.size - inter || 1);
}

/**
 * The most similar pair of options, when they are near-duplicates of each
 * other (Jaccard over content words at or above `threshold`). A near-duplicate
 * pair narrows the field: a student who spots it knows the answer is one of
 * the two, which halves the guess. Returns the pair, or null.
 */
export function nearDuplicatePair(item: BankItem, threshold = 0.5): [number, number] | null {
	let best = -1;
	let pair: [number, number] | null = null;
	for (let i = 0; i < item.options.length; i++)
		for (let j = i + 1; j < item.options.length; j++) {
			const s = jaccard(item.options[i], item.options[j]);
			if (s > best) {
				best = s;
				pair = [i, j];
			}
		}
	return best >= threshold ? pair : null;
}

/**
 * The option that uniquely shares the most content words with the stem, or
 * null on a tie. A correct answer written by restating the question is a tell;
 * measured here it runs BELOW chance, so the banks do not have this one.
 */
export function stemEchoOption(item: BankItem): number | null {
	const stem = tokens(item.stem);
	const scores = item.options.map((o) => {
		let c = 0;
		for (const w of tokens(o)) if (stem.has(w)) c++;
		return c;
	});
	const max = Math.max(...scores);
	return scores.filter((x) => x === max).length === 1 ? scores.indexOf(max) : null;
}

/**
 * The only option whose article agreement matches a stem ending in "a"/"an".
 * Zero items trip this today; it is here so that staying at zero is asserted
 * rather than assumed.
 */
export function articleAgreementOption(item: BankItem): number | null {
	const m = item.stem.trim().match(/\b(a|an)\s*[:.]?$/i);
	if (!m) return null;
	const wantVowel = m[1].toLowerCase() === 'an';
	const ok = item.options
		.map((o, i) => [i, /^[aeiou]/i.test(o.trim()) === wantVowel] as const)
		.filter(([, f]) => f);
	return ok.length === 1 ? ok[0][0] : null;
}

// ---------------------------------------------------------------------------
// Aggregation.
// ---------------------------------------------------------------------------

export interface TellResult {
	/** Items the heuristic fired on. */
	applies: number;
	/** Of those, how many it pointed at the correct option. */
	hits: number;
	/** hits / applies, or null where it never fired. */
	rate: number | null;
	/** What a blind guess would score on the items it fired on. */
	chance: number;
}

/** Run one tell over a list of items. */
export function runTell(
	items: BankItem[],
	tell: (item: BankItem) => number | null,
	chanceOf: (item: BankItem) => number = (it) => 1 / it.options.length
): TellResult {
	let applies = 0;
	let hits = 0;
	let chanceSum = 0;
	for (const it of items) {
		const pick = tell(it);
		if (pick === null) continue;
		applies++;
		chanceSum += chanceOf(it);
		if (pick === it.answer) hits++;
	}
	return {
		applies,
		hits,
		rate: applies === 0 ? null : hits / applies,
		chance: applies === 0 ? 0 : chanceSum / applies
	};
}

/** log(n choose k), so the exact draw arithmetic holds for a 32-item bank. */
function logChoose(n: number, k: number): number {
	let s = 0;
	for (let i = 0; i < k; i++) s += Math.log(n - i) - Math.log(i + 1);
	return s;
}

/** P(exactly x of the k drawn items are "gettable"), hypergeometric. */
function hypergeometric(N: number, m: number, k: number, x: number): number {
	if (x > m || x > k || k - x > N - m || x < 0) return 0;
	return Math.exp(logChoose(m, x) + logChoose(N - m, k - x) - logChoose(N, k));
}

/**
 * The fewest correct answers that reach this bank's pass threshold. Mirrors the
 * graders exactly: `round(100 * correct / total) >= passPercent`, and Postgres
 * `round()` and `Math.round()` agree at the only tie a bank this small reaches.
 */
export function correctNeeded(bank: Bank): number {
	for (let c = 0; c <= bank.testLength; c++)
		if (Math.round((100 * c) / bank.testLength) >= bank.passPercent) return c;
	return bank.testLength + 1;
}

/**
 * EXACT probability that one attempt passes, for a student who answers every
 * question with `tell` and gets the rest wrong. The draw is without
 * replacement (`pickAttempt` slices a shuffle of the item indices), so this is
 * hypergeometric over the bank rather than binomial -- which matters: a small
 * bank whose gettable items are most of it passes far more often than an
 * independent-trials model would say.
 *
 * A tell that does not apply to an item is counted as a MISS, not skipped: the
 * student still has to answer it, and answering it by another route is a
 * different (higher) number this deliberately does not claim.
 */
export function passProbability(bank: Bank, tell: (item: BankItem) => number | null): number {
	const N = bank.items.length;
	const gettable = bank.items.filter((it) => tell(it) === it.answer).length;
	const need = correctNeeded(bank);
	let p = 0;
	for (let x = need; x <= bank.testLength; x++) p += hypergeometric(N, gettable, bank.testLength, x);
	return p;
}

/** EXACT probability that one attempt passes on uniform random guessing. */
export function randomPassProbability(bank: Bank): number {
	const need = correctNeeded(bank);
	const k = bank.testLength;
	let p = 0;
	for (let c = need; c <= k; c++) {
		// Options-per-item is uniform within every committed bank; if it ever is
		// not, the mean is the honest approximation and the lint asserts
		// uniformity separately so this stays exact in practice.
		const q = 1 / (bank.items[0].options.length || 4);
		p += Math.exp(logChoose(k, c) + c * Math.log(q) + (k - c) * Math.log(1 - q));
	}
	return p;
}

export interface BankBias {
	unitId: string;
	items: number;
	testLength: number;
	passPercent: number;
	correctNeeded: number;
	/** Items whose correct option is the uniquely longest. */
	longest: number;
	longestRate: number;
	/** P(pass first try) for a longest-option-only student. */
	passLongest: number;
	/** P(pass first try) at random, the honest floor to compare against. */
	passRandom: number;
	/** How many distinct option counts the bank's items use. 1 is the good answer. */
	optionCounts: number[];
}

/** The per-bank measurement the lint and the report both read. */
export function measureBank(unitId: string, bank: Bank): BankBias {
	const longest = bank.items.filter((it) => longestOption(it) === it.answer).length;
	return {
		unitId,
		items: bank.items.length,
		testLength: bank.testLength,
		passPercent: bank.passPercent,
		correctNeeded: correctNeeded(bank),
		longest,
		longestRate: longest / bank.items.length,
		passLongest: passProbability(bank, longestOption),
		passRandom: randomPassProbability(bank),
		optionCounts: [...new Set(bank.items.map((it) => it.options.length))].sort((a, b) => a - b)
	};
}

/** Every bank measured, worst pass probability first. */
export function measureAll(banks: Record<string, Bank> = BANKS): BankBias[] {
	return Object.entries(banks)
		.map(([id, b]) => measureBank(id, b))
		.sort((a, b) => b.passLongest - a.passLongest || b.longestRate - a.longestRate);
}

/** Every item in every bank, flattened, with its unit id attached. */
export function allItems(banks: Record<string, Bank> = BANKS): (BankItem & { unitId: string })[] {
	return Object.entries(banks).flatMap(([unitId, b]) =>
		b.items.map((it) => ({ ...it, unitId }))
	);
}

/**
 * DOES A SECOND HEURISTIC KNOW ANYTHING THE LENGTH TELL DOES NOT? Restricted
 * to the items where both fire and POINT AT DIFFERENT OPTIONS, which is the
 * only place they can be told apart, it counts which one was right.
 *
 * This exists because a naive reading gets it wrong in both directions. The
 * stem-echo heuristic -- pick the option sharing the most content words with
 * the question -- fires on 40 items and is correct on 27, 67.5% against 25%
 * chance, which reads as a second serious leak. It is not one: 26 of those 27
 * are items where the longest option was already the answer, and on the ten
 * items where the two heuristics disagreed on the 2026-08-29 corpus, LENGTH
 * was right 8 times and echo once. A longer option overlaps a stem more
 * because it has more words in it. So the echo carried no signal of its own,
 * and reporting it as a separate finding would send somebody rewriting
 * questions to fix a shadow.
 *
 * THAT RATIO DECAYS AS THE LENGTH TELL IS FIXED, and is not what the lint
 * asserts any more. Lengthening a distractor past the answer makes the length
 * tell WRONG on that item by construction, so an item whose answer happens to
 * echo the stem joins the disagreements on the echo's side without the echo
 * having changed (prompt 0099: 10 -> 16 disagreements, echo right 1 -> 6). The
 * durable statement is `passProbability(bank, stemEchoOption)`, zero on every
 * bank; this function is kept for the report, which prints both numbers.
 */
export function independenceFrom(
	items: BankItem[],
	tell: (item: BankItem) => number | null,
	baseline: (item: BankItem) => number | null = longestOption
): { disagreements: number; tellRight: number; baselineRight: number } {
	let disagreements = 0;
	let tellRight = 0;
	let baselineRight = 0;
	for (const it of items) {
		const a = tell(it);
		const b = baseline(it);
		if (a === null || b === null || a === b) continue;
		disagreements++;
		if (a === it.answer) tellRight++;
		if (b === it.answer) baselineRight++;
	}
	return { disagreements, tellRight, baselineRight };
}

/**
 * HOW MUCH ONE ITEM GIVES AWAY, for ordering the rewrite list. The margin is
 * the correct option's length as a multiple of the longest DISTRACTOR: 1.0
 * means the answer is no longer than the best distractor and the tell is dead;
 * 3.0 means it is three times the length and visible across the room. Items
 * where the answer is not the longest score 0 -- they are not the problem.
 */
export function giveaway(item: BankItem): number {
	if (longestOption(item) !== item.answer) return 0;
	const distractors = item.options.filter((_, i) => i !== item.answer).map((o) => o.length);
	const best = Math.max(...distractors);
	return best === 0 ? 0 : item.options[item.answer].length / best;
}

// ---------------------------------------------------------------------------
// THE OTHER CHEAP STRATEGIES. Added 2026-09-05, because "the longest option is
// the answer 68% of the time" is only half a finding: if a SECOND strategy a
// student can execute without knowing anything also clears the gate, the
// rewrite is a different and larger job. Both of these are RECORDED rather
// than budgeted -- see the lint for why a measurement that comes back at
// chance gets an assertion and not a ceiling.
// ---------------------------------------------------------------------------

/** The uniquely SHORTEST option by character count, or null on a tie. */
export function shortestOption(item: BankItem): number | null {
	const lens = item.options.map((o) => o.length);
	const min = Math.min(...lens);
	return lens.filter((l) => l === min).length === 1 ? lens.indexOf(min) : null;
}

/**
 * A token that LOOKS technical without anybody deciding what is technical in
 * this subject: an acronym (two or more capitals), anything carrying a digit,
 * a hyphenated compound, or a word of nine characters or more. Deliberately
 * mechanical -- a hand-written jargon list would be a judgement about the
 * content, which is exactly what this module may not make, and a list somebody
 * curated would measure the list rather than the banks.
 */
const TECHNICAL_TOKEN = /^(?:[A-Z]{2,}|[^\s]*\d[^\s]*|[A-Za-z]+-[A-Za-z]+|[A-Za-z]{9,})$/;

function technicalTokens(s: string): number {
	return s.split(/[\s,;:().]+/).filter((w) => w.length > 0 && TECHNICAL_TOKEN.test(w)).length;
}

/**
 * The option carrying uniquely the most technical-looking tokens, or null on a
 * tie or where no option carries any. "Pick the one that sounds like it came
 * out of a manual" is a strategy a student reaches for without reading the
 * question, so it belongs beside the length tell rather than in a footnote.
 */
export function techiestOption(item: BankItem): number | null {
	const counts = item.options.map(technicalTokens);
	const max = Math.max(...counts);
	if (max === 0) return null;
	return counts.filter((c) => c === max).length === 1 ? counts.indexOf(max) : null;
}

// ---------------------------------------------------------------------------
// WHAT THE GATE ACTUALLY COSTS THE ATTACKER. A per-attempt pass probability is
// not what a student experiences: there is no attempt limit anywhere in the
// quiz path, only an escalating cooldown, so the real question is how many
// retries and how much waiting a strategy needs before it lands. A bank whose
// single-attempt number looks reassuring at 13% is a bank that falls on the
// eighth try.
// ---------------------------------------------------------------------------

/**
 * Expected attempts before one passes, at a per-attempt probability `p`.
 * Geometric, which is right here because each attempt is a FRESH draw from the
 * whole bank (`pickAttempt` reshuffles every item index) and a failed attempt
 * reveals no per-question feedback -- the grader returns a score and the missed
 * OBJECTIVE tags, never which questions were wrong. So attempts are
 * independent and nothing accumulates between them. Infinity where p is 0.
 */
export function expectedAttempts(p: number): number {
	return p <= 0 ? Infinity : 1 / p;
}

/**
 * Expected seconds spent WAITING on cooldowns before a pass, at per-attempt
 * probability `p` and a cooldown schedule `cooldownFn(failStreak)`. The
 * schedule is injected for the same reason the engine injects it: the tunable
 * numbers live in `track.ts` and there must not be a second copy of them here.
 * Summed over where the first pass lands; the tail past 500 attempts is
 * negligible at any p this is asked about and finite p always converges.
 */
export function expectedCooldownSeconds(p: number, cooldownFn: (streak: number) => number): number {
	if (p <= 0) return Infinity;
	let total = 0;
	let waitedBefore = 0;
	for (let k = 1; k <= 500; k++) {
		total += Math.pow(1 - p, k - 1) * p * waitedBefore;
		waitedBefore += cooldownFn(k);
	}
	return total;
}

// ---------------------------------------------------------------------------
// THE SIZE OF THE REWRITE. The whole point of the report is deciding whether to
// do this now, and that decision needs a count of ITEMS, not a percentage.
// ---------------------------------------------------------------------------

/**
 * A bank's items whose answer is the uniquely longest option, worst give-away
 * first. This is the fix order: the item whose answer most dwarfs its best
 * distractor is both the most visible to a student and the cheapest to
 * neutralise, because the distractor only has to catch up to it.
 */
export function worstFirst(bank: Bank): { index: number; item: BankItem; giveaway: number }[] {
	return bank.items
		.map((item, index) => ({ index, item, giveaway: giveaway(item) }))
		.filter((x) => x.giveaway > 0)
		.sort((a, b) => b.giveaway - a.giveaway);
}

/**
 * HOW MANY ITEMS HAVE TO BE REWRITTEN, two different answers to two different
 * questions, both of which a person deciding needs.
 *
 * `toChance` is the full job: enough items neutralised that the longest option
 * is the answer no more often than one in four, which is what a bank with no
 * length tell measures. `toGateHeld` is the URGENT job: enough items
 * neutralised that a student running the strategy passes fewer than
 * `passCeiling` of first attempts, which is the point at which the retake
 * arithmetic stops handing them the unit. They differ by a lot, and reporting
 * only the larger one is how a fixable thing gets deferred as too big.
 *
 * Neutralising is modelled as the tell MISSING that item -- which is what
 * lengthening a distractor past the answer does -- and never as deleting it,
 * because a bank that shrinks is a bank that got easier to pass.
 */
export function fixesNeeded(
	bank: Bank,
	{ targetRate = 0.25, passCeiling = 0.01 } = {}
): { toChance: number; toGateHeld: number; passAfterGateHeld: number } {
	const longest = bank.items.filter((it) => longestOption(it) === it.answer).length;
	const toChance = Math.max(0, longest - Math.floor(targetRate * bank.items.length));

	const fixed = new Set<number>();
	const tell = (it: BankItem) => (fixed.has(bank.items.indexOf(it)) ? null : longestOption(it));
	let toGateHeld = 0;
	for (const candidate of worstFirst(bank)) {
		if (passProbability(bank, tell) < passCeiling) break;
		fixed.add(candidate.index);
		toGateHeld++;
	}
	return { toChance, toGateHeld, passAfterGateHeld: passProbability(bank, tell) };
}
