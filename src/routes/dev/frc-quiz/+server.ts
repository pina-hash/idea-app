import { dev } from '$app/environment';
import { json, error } from '@sveltejs/kit';
import { gradeAttempt, type AttemptRecord, type SealedItem } from '$lib/server/frc/quiz-engine';
import { startQuiz, submitQuiz, type QuizStore } from '$lib/server/frc/quiz-service';
import type { RequestHandler } from './$types';

/**
 * DEV-ONLY mock of the unit quiz endpoint (404 in production). It runs the REAL
 * engine + service (selection, shuffle, grading, cooldown, missed-topic mapping)
 * over an in-memory store, so the client flow and the network contract can be
 * verified without a live Supabase/DB. Only the storage backend and the cooldown
 * schedule (short, for fast verification) differ from production. The answer key
 * still never appears in a response.
 */

const UNIT_ID = 'MDM-1';

// In-memory store (module-level, persists across requests in the dev process).
const sealedById = new Map<string, { sealed: SealedItem[]; passPercent: number; unitId: string }>();
const logs = new Map<string, AttemptRecord[]>();
let counter = 0;

// Short escalating cooldown so the refuse -> elapse -> allow cycle is verifiable
// in seconds (production uses the real track.ts schedule).
const DEV_COOLDOWNS = [3, 6, 9, 12];
const devCooldown = (streak: number) =>
	streak <= 0 ? 0 : DEV_COOLDOWNS[Math.min(streak, DEV_COOLDOWNS.length) - 1];

function memStore(): QuizStore {
	return {
		async listFinalized(_userId, unitId) {
			return logs.get(unitId) ?? [];
		},
		async createAttempt(_userId, unitId, sealed, passPercent) {
			const attemptId = `mock-${++counter}`;
			sealedById.set(attemptId, { sealed, passPercent, unitId });
			return { attemptId };
		},
		async gradeAttempt(_userId, attemptId, answers) {
			const held = sealedById.get(attemptId);
			if (!held) return { error: 'no_attempt' };
			sealedById.delete(attemptId);
			const graded = gradeAttempt(held.sealed, answers, held.passPercent);
			const arr = logs.get(held.unitId) ?? [];
			arr.push({ status: graded.passed ? 'passed' : 'failed', at: Date.now() });
			logs.set(held.unitId, arr);
			return graded;
		}
	};
}

export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');

	let body: { action?: string; attemptId?: string; answers?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ ok: false, reason: 'bad_request' }, { status: 400 });
	}

	const store = memStore();
	const now = Date.now();

	if (body.action === 'reset') {
		sealedById.clear();
		logs.clear();
		return json({ ok: true });
	}

	if (body.action === 'start') {
		const result = await startQuiz(store, 'dev-user', UNIT_ID, devCooldown, now);
		const status = result.ok ? 200 : result.reason === 'cooldown' ? 429 : 503;
		return json(result, { status });
	}

	if (body.action === 'submit') {
		const answers = Array.isArray(body.answers) ? body.answers.map((a) => Number(a)) : [];
		if (!body.attemptId) return json({ ok: false, reason: 'bad_request' }, { status: 400 });
		const result = await submitQuiz(
			store,
			'dev-user',
			UNIT_ID,
			body.attemptId,
			answers,
			devCooldown,
			now,
			async () => {}
		);
		const status = result.ok ? 200 : result.reason === 'no_attempt' ? 409 : 503;
		return json(result, { status });
	}

	return json({ ok: false, reason: 'bad_request' }, { status: 400 });
};
