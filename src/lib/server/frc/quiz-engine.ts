/**
 * FRC knowledge-gate quiz engine. SERVER-ONLY (under `$lib/server`, which
 * SvelteKit refuses to bundle to the client): it imports the answer-bearing
 * item bank, so it must never be reachable from client code.
 *
 * Responsibilities, all pure and testable:
 *   - `pickAttempt` selects `testLength` items at random and shuffles each
 *     item's options, returning the client-safe questions (stems + shuffled
 *     options, NO answer) plus the `sealed` key (correct shuffled index +
 *     objective per question) that the server holds to grade.
 *   - `gradeAttempt` is the CANONICAL grader (score, pass, missed objectives).
 *     The SQL `frc_quiz_grade` RPC mirrors this exact comparison; keep them in
 *     sync (same TS-canonical / SQL-mirror pattern as vanguard-save).
 *   - `cooldownState` derives the escalating-cooldown remaining time from the
 *     attempt log (schedule injected, so the tunable numbers stay in track.ts).
 *   - `missedTopics` maps objective tags to short human-readable names.
 *
 * The bank's answer indices are NEVER placed in any value returned toward the
 * client: `pickAttempt` splits them into `sealed`, which stays server-side.
 */
import bank from './mdm-1-quiz-bank.json';

interface BankItem {
	id: string;
	objective: string;
	stem: string;
	options: string[];
	answer: number;
}
interface QuizBank {
	unit: string;
	title: string;
	testLength: number;
	passPercent: number;
	objectives: Record<string, string>;
	items: BankItem[];
}

const MDM1_BANK = bank as QuizBank;

/** Unit id -> its quiz bank. Only MDM-1 is wired for now. */
const BANKS: Record<string, QuizBank> = { 'MDM-1': MDM1_BANK };

/** The quiz bank for a unit, or undefined if the unit has no quiz gate. */
export function getQuizBank(unitId: string): QuizBank | undefined {
	return BANKS[unitId];
}

/** A client-safe question: stem + shuffled options, no answer. */
export interface QuizQuestion {
	stem: string;
	options: string[];
}
/** The server-held key for one served question. */
export interface SealedItem {
	/** Correct index WITHIN the shuffled options. */
	c: number;
	/** Objective tag (for missed-topic reporting). */
	o: string;
}

/** Fisher-Yates shuffle of indices 0..n-1, using the injected RNG. */
function shuffledIndices(n: number, rng: () => number): number[] {
	const idx = Array.from({ length: n }, (_, i) => i);
	for (let i = n - 1; i > 0; i--) {
		const j = Math.floor(rng() * (i + 1));
		[idx[i], idx[j]] = [idx[j], idx[i]];
	}
	return idx;
}

/**
 * Select `testLength` distinct items at random and shuffle each item's options.
 * Returns the client-safe questions and the server-held sealed key (aligned by
 * position). `rng` defaults to Math.random; injectable for deterministic tests.
 */
export function pickAttempt(
	b: QuizBank,
	rng: () => number = Math.random
): { questions: QuizQuestion[]; sealed: SealedItem[] } {
	const order = shuffledIndices(b.items.length, rng).slice(0, b.testLength);
	const questions: QuizQuestion[] = [];
	const sealed: SealedItem[] = [];
	for (const itemIdx of order) {
		const item = b.items[itemIdx];
		const perm = shuffledIndices(item.options.length, rng);
		questions.push({ stem: item.stem, options: perm.map((p) => item.options[p]) });
		// The correct option's new position after the shuffle.
		sealed.push({ c: perm.indexOf(item.answer), o: item.objective });
	}
	return { questions, sealed };
}

/**
 * Grade an attempt: `answers[i]` is the chosen option index for question `i`.
 * CANONICAL grader; the SQL RPC mirrors this. Returns the percent score, the
 * pass flag (>= passPercent), and the DISTINCT missed objective tags (never any
 * correct answers).
 */
export function gradeAttempt(
	sealed: SealedItem[],
	answers: number[],
	passPercent: number
): { score: number; passed: boolean; missed: string[] } {
	const total = sealed.length;
	let correct = 0;
	const missed = new Set<string>();
	for (let i = 0; i < total; i++) {
		if (answers[i] === sealed[i].c) correct++;
		else missed.add(sealed[i].o);
	}
	const score = total > 0 ? Math.round((100 * correct) / total) : 0;
	return { score, passed: score >= passPercent, missed: [...missed] };
}

/** Short, human-readable topic name per objective tag (never leaks the answer). */
const TOPIC_NAMES: Record<string, string> = {
	'demand-vs-goal': 'Demands vs goals',
	sequence: 'Design-process order',
	'next-step': 'Choosing the next step',
	'constraints-first': 'Constraints before geometry',
	'select-why': 'Selecting with a documented reason',
	'prototype-purpose': 'What a prototype is for',
	iteration: 'Iterating past the first version',
	'scenario-apply': 'Applying the whole process'
};

/** Map objective tags to short topic names (dedup-preserving order). */
export function missedTopics(tags: string[]): string[] {
	return tags.map((t) => TOPIC_NAMES[t] ?? t.replace(/-/g, ' '));
}

/** A finalized attempt as the cooldown walk needs it. */
export interface AttemptRecord {
	status: 'passed' | 'failed';
	/** When the attempt was finalized (ms since epoch). */
	at: number;
}

/**
 * Derive the current cooldown from the attempt log. Walks newest-first: counts
 * consecutive fails since the last pass (the streak) and anchors the cooldown
 * on the most recent fail. `cooldownFn(streak)` supplies the seconds (the
 * tunable schedule lives in track.ts). A pass (or no fails) means no cooldown.
 */
export function cooldownState(
	attempts: AttemptRecord[],
	nowMs: number,
	cooldownFn: (failStreak: number) => number
): { remainingSec: number; failStreak: number } {
	const sorted = [...attempts].sort((a, b) => b.at - a.at);
	let failStreak = 0;
	let lastFailAt = 0;
	for (const a of sorted) {
		if (a.status === 'passed') break;
		if (failStreak === 0) lastFailAt = a.at;
		failStreak++;
	}
	if (failStreak === 0) return { remainingSec: 0, failStreak: 0 };
	const until = lastFailAt + cooldownFn(failStreak) * 1000;
	return { remainingSec: Math.max(0, Math.ceil((until - nowMs) / 1000)), failStreak };
}
