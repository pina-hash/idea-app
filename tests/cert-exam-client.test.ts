// tests/cert-exam-client.test.ts
//
// THE EXAM RUNTIME'S PURE HALF (ledger 0391, surface e): the transport over
// `supabase.rpc` names the four functions and their parameters once, the
// readers turn jsonb into named shapes and could not carry an answer key, the
// clock formats and the deadline passes, and an answer is complete or not per
// question type. Every expected value is written by hand from DATA_MODEL.md.

import { describe, expect, it } from 'vitest';
import {
	answerIsComplete,
	deadlinePassed,
	EXAM_RPC,
	EXAM_STATE_WORDS,
	examTransportFrom,
	FLAG_WORDS,
	formatRemaining,
	parseNumericInput,
	parseShortInput,
	questionCounter,
	readAnswer,
	readOpen,
	readQuestion,
	readResult,
	readSubmit,
	remainingMs
} from '$lib/certifications/exam/exam-client';
import * as client from '$lib/certifications/exam/exam-client';
import { EXAM_FLAG_KINDS, EXAM_STATES } from '$lib/certifications/types';

const QUESTION = {
	index: 2,
	total: 20,
	type: 'multiple_choice',
	prompt: 'Which jaw is fixed?',
	options: [
		{ key: 'c', text: 'Either' },
		{ key: 'a', text: 'The back one' }
	],
	unit: null,
	deadline: '2026-10-15T20:00:00Z'
};

describe('examTransportFrom', () => {
	it('names the four functions and their parameters exactly once', async () => {
		const calls: [string, Record<string, unknown>][] = [];
		const t = examTransportFrom(async (fn, args) => {
			calls.push([fn, args]);
			return { data: { ok: true, echoed: fn }, error: null };
		});
		await t.open('E1');
		await t.answer('E1', 3, ['a', 'c']);
		await t.flag('E1', 'blur');
		await t.submit('E1');
		expect(calls).toEqual([
			['cert_exam_open', { p_exam: 'E1' }],
			['cert_exam_answer', { p_exam: 'E1', p_index: 3, p_answer: ['a', 'c'] }],
			['cert_exam_flag', { p_exam: 'E1', p_kind: 'blur' }],
			['cert_exam_submit', { p_exam: 'E1' }]
		]);
		expect(Object.values(EXAM_RPC)).toEqual(['cert_exam_open', 'cert_exam_answer', 'cert_exam_flag', 'cert_exam_submit']);
	});
	it('folds a PostgREST error into a refusal the reader renders, keyed on its code', async () => {
		const t = examTransportFrom(async () => ({ data: null, error: { message: 'no such function', code: 'PGRST202' } }));
		expect(await t.open('E1')).toEqual({ ok: false, reason: 'PGRST202', message: 'no such function' });
	});
	it('folds a thrown network failure into a refusal too', async () => {
		const t = examTransportFrom(async () => {
			throw new Error('fetch failed');
		});
		const r = (await t.submit('E1')) as { ok: boolean; reason: string };
		expect(r.ok).toBe(false);
		expect(r.reason).toBe('network');
	});
});

describe('readQuestion', () => {
	it('keeps the view and drops malformed options', () => {
		const q = readQuestion({ ...QUESTION, options: [...QUESTION.options, { key: 7 }, 'x'] });
		expect(q).toEqual({ ...QUESTION, options: QUESTION.options });
	});
	it('refuses a shape that is not a question', () => {
		expect(readQuestion(null)).toBeNull();
		expect(readQuestion({ ...QUESTION, type: 'essay' })).toBeNull();
		expect(readQuestion({ ...QUESTION, index: '2' })).toBeNull();
		expect(readQuestion({ ...QUESTION, prompt: 3 })).toBeNull();
	});
	it('reads a numeric unit and leaves options null', () => {
		const q = readQuestion({ ...QUESTION, type: 'numeric', options: null, unit: 'rpm' });
		expect(q?.unit).toBe('rpm');
		expect(q?.options).toBeNull();
		expect(readQuestion({ ...QUESTION, unit: '' })?.unit).toBeNull();
	});
	it('has no field an answer key could ride in', () => {
		const q = readQuestion({ ...QUESTION, answer: 'a', key: 'a' });
		expect(Object.keys(q!).sort()).toEqual(['deadline', 'index', 'options', 'prompt', 'total', 'type', 'unit']);
	});
});

describe('readOpen', () => {
	const exam = { id: 'E1', state: 'in_progress', total: 20, current_index: 2, deadline: '2026-10-15T20:00:00Z' };
	it('a started or resumed exam with a question', () => {
		const r = readOpen({ ok: true, exam, question: QUESTION });
		expect(r.kind).toBe('question');
		if (r.kind === 'question') {
			expect(r.exam).toEqual(exam);
			expect(r.question.index).toBe(2);
		}
	});
	it('an exam whose every question is answered but not submitted: done', () => {
		const r = readOpen({ ok: true, exam: { ...exam, current_index: 20 }, question: null });
		expect(r).toEqual({ kind: 'done', exam: { ...exam, current_index: 20 } });
	});
	it('the release window passed: expired, by reason or by state', () => {
		expect(readOpen({ ok: false, reason: 'release_expired', message: 'Too late.' })).toEqual({ kind: 'expired', message: 'Too late.' });
		expect(readOpen({ ok: true, exam: { ...exam, state: 'expired' }, question: null }).kind).toBe('expired');
	});
	it('any other refusal is a refusal with its words', () => {
		expect(readOpen({ ok: false, reason: 'not_found', message: 'No such exam.' })).toEqual({ kind: 'refused', reason: 'not_found', message: 'No such exam.' });
	});
	it('a result (a submitted exam opened again) is a result', () => {
		const r = readOpen({ ok: true, passed: false, total: 20, correct: 17, missed_topics: ['setup'], cooldown_until: '2026-10-22T20:00:00Z' });
		expect(r.kind).toBe('result');
	});
	it('garbage is refused as unexpected', () => {
		expect(readOpen(null).kind).toBe('refused');
		expect(readOpen({ ok: true }).kind).toBe('refused');
		expect(readOpen('x').kind).toBe('refused');
	});
});

describe('readAnswer and readSubmit', () => {
	it('the next question, done, a result or a refusal', () => {
		expect(readAnswer({ ok: true, question: QUESTION }).kind).toBe('question');
		expect(readAnswer({ ok: true, done: true })).toEqual({ kind: 'done' });
		expect(readAnswer({ ok: true, passed: true, total: 5, correct: 5, missed_topics: [], cooldown_until: null }).kind).toBe('result');
		expect(readAnswer({ ok: false, reason: 'out_of_order', message: 'Not that one.' })).toEqual({ kind: 'refused', reason: 'out_of_order', message: 'Not that one.' });
		expect(readAnswer({ ok: true }).kind).toBe('refused');
	});
	it('a submission is a result or a refusal', () => {
		const r = readSubmit({ ok: true, passed: false, total: 5, correct: 4, missed_topics: ['speeds'], cooldown_until: '2026-10-22T20:00:00Z' });
		expect(r).toEqual({ kind: 'result', result: { ok: true, passed: false, total: 5, correct: 4, missed_topics: ['speeds'], cooldown_until: '2026-10-22T20:00:00Z' } });
		expect(readSubmit({ ok: false, reason: 'not_in_progress', message: 'Already submitted.' }).kind).toBe('refused');
		expect(readSubmit({}).kind).toBe('refused');
	});
});

describe('readResult never carries a key', () => {
	it('keeps the six student fields and nothing a server might have leaked', () => {
		const r = readResult({ ok: true, passed: false, total: 5, correct: 4, missed_topics: ['speeds', 7], cooldown_until: null, per_question: [{ answer: 'a' }], answers: ['a'] });
		expect(r).toEqual({ ok: true, passed: false, total: 5, correct: 4, missed_topics: ['speeds'], cooldown_until: null });
	});
	it('refuses a shape without a verdict', () => {
		expect(readResult({ ok: true, total: 5 })).toBeNull();
		expect(readResult({ ok: false, passed: true })).toBeNull();
	});
});

describe('the clock', () => {
	const now = new Date('2026-10-15T19:00:00Z');
	const plus = (s: number) => new Date(now.getTime() + s * 1000).toISOString();
	it('formats minutes and seconds, and hours past one', () => {
		expect(formatRemaining(plus(754), now)).toBe('12:34');
		expect(formatRemaining(plus(59), now)).toBe('0:59');
		expect(formatRemaining(plus(3723), now)).toBe('1:02:03');
		expect(formatRemaining(plus(3600), now)).toBe('1:00:00');
	});
	it('floors at 0:00 past the deadline and for no deadline', () => {
		expect(formatRemaining(plus(-5), now)).toBe('0:00');
		expect(formatRemaining(null, now)).toBe('0:00');
		expect(formatRemaining('not a date', now)).toBe('0:00');
		expect(remainingMs(plus(-5), now)).toBe(0);
	});
	it('says when the deadline has passed, and never for a missing one', () => {
		expect(deadlinePassed(plus(1), now)).toBe(false);
		expect(deadlinePassed(plus(0), now)).toBe(true);
		expect(deadlinePassed(plus(-1), now)).toBe(true);
		expect(deadlinePassed(null, now)).toBe(false);
	});
});

describe('answers', () => {
	it('parses a typed number, commas and spaces included, and refuses words', () => {
		expect(parseNumericInput('1,234.5')).toBe(1234.5);
		expect(parseNumericInput(' 12 ')).toBe(12);
		expect(parseNumericInput('-3')).toBe(-3);
		expect(parseNumericInput('.5')).toBe(0.5);
		expect(parseNumericInput('1e3')).toBe(1000);
		expect(parseNumericInput('')).toBeNull();
		expect(parseNumericInput('abc')).toBeNull();
		expect(parseNumericInput('12abc')).toBeNull();
		expect(parseNumericInput('1 2')).toBeNull();
	});
	it('trims a short answer and refuses a blank', () => {
		expect(parseShortInput('  reamer ')).toBe('reamer');
		expect(parseShortInput('   ')).toBeNull();
		expect(parseShortInput('')).toBeNull();
	});
	it('decides completeness per type', () => {
		expect(answerIsComplete('multiple_choice', 'a')).toBe(true);
		expect(answerIsComplete('multiple_choice', '')).toBe(false);
		expect(answerIsComplete('multiple_choice', null)).toBe(false);
		expect(answerIsComplete('multiple_select', ['a'])).toBe(true);
		expect(answerIsComplete('multiple_select', [])).toBe(false);
		expect(answerIsComplete('multiple_select', 'a')).toBe(false);
		expect(answerIsComplete('numeric', 12.5)).toBe(true);
		expect(answerIsComplete('numeric', NaN)).toBe(false);
		expect(answerIsComplete('numeric', '12')).toBe(false);
		expect(answerIsComplete('short', 'reamer')).toBe(true);
		expect(answerIsComplete('short', '  ')).toBe(false);
		expect(answerIsComplete('short', null)).toBe(false);
	});
	it('counts questions from one', () => {
		expect(questionCounter(2, 20)).toBe('Question 3 of 20');
		expect(questionCounter(0, 1)).toBe('Question 1 of 1');
		expect(questionCounter(0, 0)).toBe('Question 1 of 1');
	});
});

describe('words', () => {
	it('has a word for every flag kind and every exam state, and no others', () => {
		expect(Object.keys(FLAG_WORDS).sort()).toEqual([...EXAM_FLAG_KINDS].sort());
		expect(Object.keys(EXAM_STATE_WORDS).sort()).toEqual([...EXAM_STATES].sort());
		for (const w of Object.values(FLAG_WORDS)) expect(w.trim()).not.toBe('');
	});
	it('no exported sentence carries an em dash', () => {
		for (const [name, value] of Object.entries(client)) {
			if (typeof value === 'string') expect(value, name).not.toMatch(/—/);
			if (typeof value === 'function' && /SENTENCE/.test(name)) expect(String((value as (a: number, b: number) => string)(3, 5))).not.toMatch(/—/);
		}
	});
});
