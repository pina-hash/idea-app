/**
 * THE CLASS PICKER: random teams, a random order, and one student.
 *
 * Pure functions over names, with the randomness INJECTED AS A SEED rather than
 * read from `Math.random`. No Svelte, no DOM, no clock.
 *
 * WHY A SEED AND NOT `Math.random`, WHICH IS THE WHOLE DESIGN.
 *
 * A draw made in front of a class has to be REPEATABLE, and an unseeded shuffle
 * is not. The surface re-renders for a dozen reasons that have nothing to do
 * with the draw -- a poll lands, a save acknowledges, the pane resizes, someone
 * navigates back -- and every one of them would re-roll a `Math.random` shuffle
 * silently. A teacher who says "team three, you are up" and then scrolls has
 * changed the answer. Worse, they cannot tell: there is no wrong-looking state,
 * just a different correct-looking one.
 *
 * SO THE DRAW IS A PURE FUNCTION OF (names, seed), the seed is held by the
 * surface, and a new draw is a new seed rather than a new call. Showing the
 * seed is what makes the claim checkable by the room: the same seed and the
 * same list always give the same teams, so a student who suspects the teacher
 * arranged it can be handed the seed and get the same answer.
 *
 * THE PRNG IS `mulberry32`, WRITTEN OUT HERE RATHER THAN REUSED, and the two
 * shuffles already in this repo are why. `shuffled` in `$lib/frc/drill-banks`
 * is unseeded (`Math.random` inline) and lives in a module that imports a
 * question bank; `shuffledIndices` in `$lib/server/frc/quiz-engine` is
 * server-only and module-private. Neither is reachable or reusable for a
 * reproducible client-side draw, so this is a new rule rather than a second
 * copy of one -- and it is deliberately the only place in the classroom module
 * that produces randomness.
 */

/** One person in a draw. Deliberately not `ClassroomEnrollment`: a draw is over names. */
export interface PickerCandidate {
	email: string;
	name: string;
}

/**
 * A 32-bit PRNG from a 32-bit seed. Small, deterministic, and good enough for
 * deciding who presents first -- this is not a cryptographic draw and must
 * never be used as one.
 */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * A seed's printed form, and it is printed BECAUSE it is checkable.
 *
 * Eight lowercase hex characters: short enough to read out, long enough that
 * two draws in one lesson will not collide by eye.
 */
export function pickerSeedLabel(seed: number): string {
	return (seed >>> 0).toString(16).padStart(8, '0');
}

/**
 * A fresh seed. Takes its entropy as a parameter for the same reason every
 * other function in this module does: a test pins it, and the surface is the
 * one place a clock or `Math.random` is read.
 */
export function pickerSeedFrom(entropy: number): number {
	return Math.floor(Math.abs(entropy) * 0xffffffff) >>> 0 || 1;
}

/**
 * Fisher-Yates over a copy, driven by the seeded generator. Never mutates the
 * input, so a caller can hold the roster order and the draw order at once.
 */
export function pickerShuffle<T>(items: readonly T[], seed: number): T[] {
	const rng = mulberry32(seed);
	const out = items.slice();
	for (let i = out.length - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[out[i], out[j]] = [out[j], out[i]];
	}
	return out;
}

/** One student, or null when nobody is in the draw. */
export function pickerOne(
	candidates: readonly PickerCandidate[],
	seed: number
): PickerCandidate | null {
	if (candidates.length === 0) return null;
	return pickerShuffle(candidates, seed)[0];
}

/**
 * TEAMS OF ROUGHLY `size`, DEALT ROUND-ROBIN RATHER THAN SLICED.
 *
 * SLICING IS THE OBVIOUS IMPLEMENTATION AND IT IS THE WRONG ONE. Chunking a
 * shuffled list into runs of `size` leaves the remainder as a final team, so 13
 * students in teams of 4 produces 4, 4, 4 and ONE PERSON ON THEIR OWN. That is
 * not a smaller team, it is a student with no team, and it happens for every
 * class size that is one more than a multiple -- which is most of them over a
 * term.
 *
 * So the team COUNT is decided first (`ceil(n / size)`) and the shuffled list is
 * then dealt one at a time across those teams, which guarantees every team is
 * within one member of every other. 13 in fours becomes 4, 3, 3, 3.
 *
 * A `size` of zero or less, or an empty list, is no teams rather than an error:
 * the surface offers a number input and a caller mid-keystroke is an ordinary
 * state, not a fault.
 */
export function pickerTeams(
	candidates: readonly PickerCandidate[],
	size: number,
	seed: number
): PickerCandidate[][] {
	if (candidates.length === 0 || !Number.isFinite(size) || size < 1) return [];
	const count = Math.ceil(candidates.length / Math.floor(size));
	const teams: PickerCandidate[][] = Array.from({ length: count }, () => []);
	pickerShuffle(candidates, seed).forEach((person, i) => {
		teams[i % count].push(person);
	});
	return teams;
}

/**
 * WHO IS IN THE DRAW, AND SAYING SO IS NOT OPTIONAL.
 *
 * A presentation order full of people who are not in the room is useless, so
 * absences are excludable -- but an exclusion that vanishes silently is how a
 * student gets left out of every draw for a week because a checkbox stayed
 * ticked. The count of who was left out rides back with the draw and the
 * surface states it.
 */
export interface PickerPool {
	included: PickerCandidate[];
	excluded: PickerCandidate[];
}

/**
 * The draw's population: active students, minus anyone marked absent.
 *
 * MANAGERS ARE NOT CANDIDATES, and it is 0138's rule rather than a courtesy: an
 * instructor with an enrollment row in their own section is not a student in
 * it, so putting them in a team draw is the same defect as counting them on the
 * check-in grid. The caller passes rows that have already been split, and this
 * function's job is only the absence layer.
 */
export function pickerPool(
	candidates: readonly PickerCandidate[],
	absentEmails: ReadonlySet<string>
): PickerPool {
	const included: PickerCandidate[] = [];
	const excluded: PickerCandidate[] = [];
	for (const person of candidates) {
		(absentEmails.has(person.email) ? excluded : included).push(person);
	}
	return { included, excluded };
}

/**
 * THE LINE THAT SAYS THIS WAS A DRAW AND NOT A CHOICE.
 *
 * "Make it obvious it was random" is a claim the surface has to be able to
 * back, and a shuffled list on its own cannot -- it looks exactly like a list
 * somebody arranged. What backs it is the SEED: naming it, and saying that the
 * same seed over the same names always gives the same answer, turns the draw
 * into something a student can check rather than something they have to accept.
 */
export function pickerDrawNote(seed: number, pool: PickerPool): string {
	const n = pool.included.length;
	const base = `Random draw of ${n} student${n === 1 ? '' : 's'}, seed ${pickerSeedLabel(seed)}. The same seed over the same names always gives this same result.`;
	if (pool.excluded.length === 0) return base;
	return `${base} ${pool.excluded.length} marked absent and left out: ${pool.excluded.map((p) => p.name).join(', ')}.`;
}
