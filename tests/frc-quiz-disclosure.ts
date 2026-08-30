// tests/frc-quiz-disclosure.ts
//
// The non-disclosure detector for the FRC knowledge gate, shared by
// tests/frc-quiz-engine.test.ts (the pure engine) and
// tests/frc-quiz-route.test.ts (the real endpoint over a real database).
//
// WHY IT ASSERTS ON SHAPE AND NOT ON FIELD NAMES. This is the detector idea
// 0147 built for the GAUNTLET target (tests/gauntlet-target-disclosure.ts):
// 0061 removed `target_volume_mm3` from a payload and then shipped
// `target_mass_level` beside the public density, which reconstructs it by one
// division -- so a test spelling `expect(payload.target_volume_mm3)
// .toBeUndefined()` would have passed for the whole of 0061's life while the
// answer sat in the same object under another name. A quiz answer has the same
// property one step further: it is not only a NUMBER (the correct index) but
// also a STRING (the correct option's text), and the string is already in the
// payload legitimately, exactly once, as one of the options. So "is the answer
// present" is the wrong question. The question is whether a caller holding ONLY
// this payload can say WHICH option it is.
//
// Every route below therefore takes the payload plus the ground truth, and asks
// whether the correct option is RECOVERABLE -- by a duplicated string, by a
// substring, by a positionally aligned number, by a constant, or by the served
// order being the bank's own order. A new field can only pass by not
// disclosing.
//
// THE GROUND TRUTH IS TAKEN FROM THE BANK'S TEXT, NEVER FROM `sealed`. If it
// were read off the sealed key, an engine that sealed the wrong index would
// still agree with the detector and every assertion here would pass while the
// gate graded the wrong option. `correctTextFor` matches a served question back
// to its bank item by STEM (stems are unique within every bank, asserted in the
// engine suite) and reads `item.options[item.answer]`.

/** One served question as a caller receives it. */
export interface ServedQuestion {
	stem: string;
	options: string[];
}

/** What the detector must not be able to recover, per served question. */
export interface AnswerTruth {
	/** The correct option's TEXT, from the bank. */
	text: string;
	/** Where that text sits in the SERVED options. */
	index: number;
}

/** Pull every finite number out of a payload, whatever its nesting or key. */
export function numbersIn(value: unknown, out: number[] = []): number[] {
	if (typeof value === 'number' && Number.isFinite(value)) out.push(value);
	else if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value)))
		out.push(Number(value));
	else if (Array.isArray(value)) for (const v of value) numbersIn(v, out);
	else if (value && typeof value === 'object')
		for (const v of Object.values(value as Record<string, unknown>)) numbersIn(v, out);
	return out;
}

/** Pull every string out of a payload, whatever its nesting or key. */
export function stringsIn(value: unknown, out: string[] = []): string[] {
	if (typeof value === 'string') out.push(value);
	else if (Array.isArray(value)) for (const v of value) stringsIn(v, out);
	else if (value && typeof value === 'object')
		for (const v of Object.values(value as Record<string, unknown>)) stringsIn(v, out);
	return out;
}

/**
 * Every array of numbers anywhere in the payload, so an index vector cannot
 * hide one level down inside a wrapper object.
 */
export function numberArraysIn(value: unknown, out: number[][] = []): number[][] {
	if (Array.isArray(value)) {
		if (value.length > 0 && value.every((v) => typeof v === 'number' && Number.isFinite(v)))
			out.push(value as number[]);
		for (const v of value) numberArraysIn(v, out);
	} else if (value && typeof value === 'object')
		for (const v of Object.values(value as Record<string, unknown>)) numberArraysIn(v, out);
	return out;
}

/**
 * Every way the correct option is recoverable from a payload. Returns a
 * human-readable reason per route, so a firing assertion says WHICH disclosure
 * it found rather than only that something failed.
 *
 * `served` is what the caller was given (used to know which strings are the
 * legitimate single copy of an option); `truth` is the answer, positionally
 * aligned with `served`.
 */
export interface RecoveryOptions {
	/**
	 * Report a correct index that is CONSTANT across every question. Off by
	 * default, and that is a measurement fact rather than a preference: with four
	 * options and six questions a fair shuffle lands every answer on one index
	 * 0.098% of the time, so over a few hundred draws a correct engine produces
	 * this "hit" about once. It is a statistical property of the shuffle, not a
	 * property of one payload, and the fixed-index sweep in the engine suite
	 * measures it far more sensitively. Kept here so the ROUTE exists and can be
	 * demonstrated against a deliberately collapsed shuffle.
	 */
	flagConstantIndex?: boolean;
}

/**
 * Every way the correct option is recoverable from a payload. Returns a
 * human-readable reason per route, so a firing assertion says WHICH disclosure
 * it found rather than only that something failed.
 *
 * `served` is what the caller was given (used to know which strings are the
 * legitimate single copy of an option); `truth` is the answer, positionally
 * aligned with `served`.
 */
export function recoveries(
	payload: unknown,
	served: readonly ServedQuestion[],
	truth: readonly AnswerTruth[],
	options: RecoveryOptions = {}
): string[] {
	const hits: string[] = [];
	const allStrings = stringsIn(payload);
	// Every option text the caller is legitimately holding, with how many times
	// the payload is entitled to contain it (once per appearance in an options
	// array).
	const allowance = new Map<string, number>();
	for (const q of served)
		for (const o of q.options) allowance.set(o, (allowance.get(o) ?? 0) + 1);
	// The stems are legitimately there too, and a stem is a long sentence: one
	// question's short option ("A hole") is a substring of ANOTHER question's stem
	// often enough that comparing every truth against every string in the payload
	// reports noise rather than disclosure. So R2 below is scoped to the strings
	// that could actually identify THIS question's answer: its own stem, and
	// anything outside the questions entirely -- a message, a topic name, a label.
	const stems = new Set(served.map((q) => q.stem));
	const outsideQuestions = allStrings.filter((s) => !allowance.has(s) && !stems.has(s));

	truth.forEach((t, i) => {
		// R1: the correct text appears MORE times than the options entitle it to.
		// A second copy is a second copy however it is labelled.
		const seen = allStrings.filter((s) => s === t.text).length;
		const owed = allowance.get(t.text) ?? 0;
		if (seen > owed)
			hits.push(`q${i}: correct option text appears ${seen}x, options entitle ${owed}x`);

		// R2a: a payload string that is neither an option nor a stem CONTAINS the
		// correct text. A missed-topic name or an error message that quoted the
		// answer lands here, and so does a truncated copy of it.
		for (const s of outsideQuestions)
			if (s.includes(t.text))
				hits.push(`q${i}: a non-question string quotes the correct option ("${s}")`);

		// R2b: this question's OWN stem gives the answer away by quoting the
		// correct option and none of its siblings. Measured 0 of 140 items across
		// every committed bank today, so the route is live rather than vacuous.
		const stem = served[i]?.stem ?? '';
		const siblings = (served[i]?.options ?? []).filter((o) => o !== t.text);
		if (stem.includes(t.text) && !siblings.some((o) => stem.includes(o)))
			hits.push(`q${i}: the stem quotes the correct option and no other ("${t.text}")`);
	});

	// R3: a positionally aligned index vector anywhere in the payload.
	const wanted = truth.map((t) => t.index);
	for (const arr of numberArraysIn(payload)) {
		if (arr.length !== wanted.length) continue;
		if (arr.every((n, i) => n === wanted[i]))
			hits.push(`a number array equals the correct-index vector (${arr.join(',')})`);
	}

	// R4: a per-question number, outside that question's own options, that is
	// that question's correct index for EVERY question. Requiring all of them is
	// what keeps a coincidence -- `total` happening to equal one c -- out of the
	// result; a real `answer` field matches every one.
	const perQuestion = Array.isArray((payload as { questions?: unknown }).questions)
		? ((payload as { questions: unknown[] }).questions as unknown[])
		: [];
	if (perQuestion.length === truth.length && perQuestion.length > 0) {
		const numsPer = perQuestion.map((q) => {
			const { options: _drop, ...rest } = (q ?? {}) as Record<string, unknown>;
			return numbersIn(rest);
		});
		const common = numsPer[0].filter((_n, k) =>
			// the k-th number of each question object, compared positionally, is
			// the shape a per-question `answer` field actually takes.
			numsPer.every((ns, i) => ns[k] === truth[i].index)
		);
		if (common.length > 0)
			hits.push(`a per-question field carries every correct index (${common.join(',')})`);
	}

	// R5: one constant index across every question -- what a COLLAPSED shuffle
	// looks like from outside, with nothing added to the payload at all. Opt-in;
	// see RecoveryOptions for the measurement that makes it opt-in.
	if (options.flagConstantIndex && truth.length > 1 && truth.every((t) => t.index === truth[0].index))
		hits.push(
			`the correct index is the constant ${truth[0].index} for all ${truth.length} questions`
		);

	return [...new Set(hits)];
}

/**
 * Hit rate of a strategy that reads ONLY the payload. Used to measure whether
 * the shuffle is doing its job: a fixed index must be worth exactly chance.
 * `pick` receives one served question and returns the index it would choose.
 */
export function strategyHitRate(
	draws: readonly { served: readonly ServedQuestion[]; truth: readonly AnswerTruth[] }[],
	pick: (q: ServedQuestion) => number
): { hits: number; total: number; rate: number } {
	let hits = 0;
	let total = 0;
	for (const d of draws)
		d.served.forEach((q, i) => {
			total++;
			if (pick(q) === d.truth[i].index) hits++;
		});
	return { hits, total, rate: total === 0 ? 0 : hits / total };
}

/** The index of the single longest option, or -1 when the longest is tied. */
export function longestOptionIndex(q: ServedQuestion): number {
	const lens = q.options.map((o) => o.length);
	const max = Math.max(...lens);
	return lens.filter((l) => l === max).length === 1 ? lens.indexOf(max) : -1;
}

/** A seeded PRNG, so every sweep below is reproducible rather than flaky. */
export function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
