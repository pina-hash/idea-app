// tests/frc-quiz-dev-harness-answer-normalize.test.ts
//
// The dev mock of the quiz endpoint (`src/routes/dev/frc-quiz/+server.ts`) used
// to coerce answers with `.map((a) => Number(a))` before handing them to
// submitQuiz -- the exact bug the real route fixed in `normalizeAnswers`
// (tests/frc-quiz-answer-normalize.test.ts), left standing in the harness
// because it belonged to another session. `Number(null)` is 0, so a question
// left blank graded as "chose the first option".
//
// THE INVARIANT THIS DRIVES: a sealed correct-answer index (`sealed[i].c`) is
// always a real position in an option list and therefore never negative
// (quiz-service.ts's own comment on `NO_ANSWER`). So a submission of every
// answer as `NO_ANSWER` (-1) can NEVER match any correct index, whatever the
// bank or shuffle drew -- `score` is deterministically 0 and `passed` is
// deterministically false. `normalizeAnswers` maps a JSON `null` to exactly
// `NO_ANSWER`. So submitting an all-null answer set through the harness must
// be JUST AS DETERMINISTIC: score 0, passed false, on every draw.
//
// MUTATION TARGET: reintroduce `.map((a) => Number(a))` in the harness and
// `null` becomes `0` before grading -- a real option index that DOES
// sometimes match the sealed key, so an all-null submission can score above
// 0 and even pass. This is what makes the assertion below bite reliably
// rather than depending on a particular shuffle.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setDev } from './stubs/app-environment';
import { POST } from '../src/routes/dev/frc-quiz/+server';

async function post(body: unknown, unit = 'MDM-1') {
	const request = new Request(`http://localhost/dev/frc-quiz?unit=${unit}`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body)
	});
	const res = (await (POST as unknown as (e: unknown) => Promise<Response>)({
		request,
		url: new URL(`http://localhost/dev/frc-quiz?unit=${unit}`)
	})) as Response;
	return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

beforeEach(() => setDev(true));
afterEach(() => setDev(false));

describe('the dev frc-quiz mock normalizes answers the same way the real route does', () => {
	it('a wholly blank submission (JSON null throughout) always scores 0 and never passes', async () => {
		// Repeated across several fresh attempts (each a different shuffle/draw)
		// so a mutant that only sometimes matches option 0 cannot slip through
		// on a lucky draw.
		for (let round = 0; round < 5; round++) {
			await post({ action: 'reset' });
			const start = await post({ action: 'start' });
			expect(start.status).toBe(200);
			const attemptId = start.body.attemptId as string;
			const total = start.body.total as number;
			expect(total).toBeGreaterThan(0);

			const submit = await post({
				action: 'submit',
				attemptId,
				answers: Array(total).fill(null)
			});
			expect(submit.status).toBe(200);
			expect(submit.body.ok).toBe(true);
			// A sealed correct index is never negative, so NO_ANSWER (-1, what a
			// null normalizes to) can never match it -- deterministic, not just
			// probable. A `Number(null) -> 0` mutant scores above 0 whenever the
			// draw's correct index happens to be 0.
			expect(submit.body.score).toBe(0);
			expect(submit.body.passed).toBe(false);
		}
	});

	it('an explicit choice of option 0 is still accepted and graded (not refused)', async () => {
		await post({ action: 'reset' });
		const start = await post({ action: 'start' });
		const attemptId = start.body.attemptId as string;
		const total = start.body.total as number;

		const submit = await post({ action: 'submit', attemptId, answers: Array(total).fill(0) });
		expect(submit.status).toBe(200);
		expect(submit.body.ok).toBe(true);
		expect(typeof submit.body.score).toBe('number');
	});
});
