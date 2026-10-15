// tests/dom/cert-exam-runner.test.ts
//
// THE REAL `ExamRunner`, MOUNTED OVER A FAKE TRANSPORT (ledger 0391, surface e).
// What is asserted is structure and which handler a real click ran, never a
// box or a colour (happy-dom has no layout engine; those claims are
// `verify:browser`'s). Both directions are counted everywhere a gate is
// claimed: the failed state names TOPICS and carries NO question or option
// text, with the question state as the positive control for those strings;
// the question state has exactly ONE Next key and ZERO back controls; Next is
// aria-disabled (never disabled) until an answer is complete; the lockdown
// prevents a copy only while a question is up, and the flag reaches the
// transport with its kind.

import { afterEach, describe, expect, it } from 'vitest';
import type { Component } from 'svelte';
import ExamRunner from '$lib/certifications/exam/ExamRunner.svelte';
import type { ExamTransport } from '$lib/certifications/exam/exam-client';
import { COOLDOWN_SENTENCE } from '$lib/certifications/copy';
import { formatCertDate } from '$lib/certifications/status';
import type { ExamAnswer, ExamFlagKind, ExamQuestionView, ExamStudentResult } from '$lib/certifications/types';
import { DRAW, OPTION_TEXTS, TOPIC_NAMES, type FixtureQuestion } from '../../src/routes/dev/cert-exam/fixtures';
import { mountInto, type Mounted } from './mount';

const Runner = ExamRunner as unknown as Component<Record<string, unknown>>;

interface Fake extends ExamTransport {
	calls: { fn: string; args: unknown[] }[];
	flags: ExamFlagKind[];
}

/** An immediate in-memory `cert_exam_*` over the harness draw, with no delays. */
function fakeTransport(options: { draw?: FixtureQuestion[]; deadline?: string; result?: ExamStudentResult; expired?: boolean } = {}): Fake {
	const draw = options.draw ?? DRAW;
	const deadline = options.deadline ?? new Date(Date.now() + 30 * 60_000).toISOString();
	let index = 0;
	const view = (i: number): ExamQuestionView => ({ index: i, total: draw.length, type: draw[i].type, prompt: draw[i].prompt, options: draw[i].options, unit: draw[i].unit, deadline });
	const t: Fake = {
		calls: [],
		flags: [],
		open: async (examId) => {
			t.calls.push({ fn: 'open', args: [examId] });
			if (options.expired) return { ok: false, reason: 'release_expired', message: 'Too late.' };
			return { ok: true, exam: { id: examId, state: 'in_progress', total: draw.length, current_index: index, deadline }, question: index < draw.length ? view(index) : null };
		},
		answer: async (examId, i, answer: ExamAnswer) => {
			t.calls.push({ fn: 'answer', args: [examId, i, answer] });
			if (i !== index) return { ok: false, reason: 'out_of_order', message: 'Not that one.' };
			index++;
			return index >= draw.length ? { ok: true, done: true } : { ok: true, question: view(index) };
		},
		flag: async (examId, kind) => {
			t.calls.push({ fn: 'flag', args: [examId, kind] });
			t.flags.push(kind);
			return { ok: true, flags_count: t.flags.length };
		},
		submit: async (examId) => {
			t.calls.push({ fn: 'submit', args: [examId] });
			return options.result ?? { ok: true, passed: true, total: draw.length, correct: draw.length, missed_topics: [], cooldown_until: null };
		}
	};
	return t;
}

const FAILED: ExamStudentResult = { ok: true, passed: false, total: 5, correct: 3, missed_topics: ['setup', 'speeds'], cooldown_until: '2026-10-22T20:00:00Z' };
const PASSED: ExamStudentResult = { ok: true, passed: true, total: 5, correct: 5, missed_topics: [], cooldown_until: null };

const mounted: Mounted[] = [];
function mountRunner(props: Record<string, unknown>): Mounted {
	const m = mountInto(Runner, { examId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullscreen: false, topicNames: TOPIC_NAMES, tickMs: 60_000, ...props });
	mounted.push(m);
	return m;
}

afterEach(async () => {
	for (const m of mounted.splice(0)) await m.stop();
});

const pressNext = (m: Mounted) => m.one<HTMLButtonElement>('[data-testid="cert-exam-next"]').click();
const text = (m: Mounted) => m.target.textContent ?? '';

describe('the failed state', () => {
	it('names the missed topics in words, the cooldown date, and no question or option text', async () => {
		const m = mountRunner({ transport: fakeTransport(), initial: { kind: 'result', result: FAILED } });
		await m.settle();
		expect(m.all('[data-testid="cert-exam-failed"]').length).toBe(1);
		const topics = m.all('[data-testid="cert-exam-topics"] li').map((li) => li.textContent?.trim());
		expect(topics).toEqual(['Workholding and setup', 'Speeds and feeds']);
		expect(m.one('[data-testid="cert-exam-cooldown"]').textContent).toBe(COOLDOWN_SENTENCE(formatCertDate(FAILED.cooldown_until)));
		expect(m.one('[data-testid="cert-exam-cooldown"]').textContent).not.toMatch(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/);
		// Zero questions, zero options, zero of the draw's strings (the control is the question state below).
		expect(m.all('[data-testid="cert-exam-option"]').length).toBe(0);
		expect(m.all('[data-testid="cert-exam-prompt"]').length).toBe(0);
		const leaked = [...OPTION_TEXTS, ...DRAW.map((q) => q.prompt)].filter((s) => text(m).includes(s));
		expect(leaked).toEqual([]);
		expect(text(m)).toContain('Not this time');
	});
	it('renders a topic id as itself when no name is known', async () => {
		const m = mountRunner({ transport: fakeTransport(), initial: { kind: 'result', result: { ...FAILED, missed_topics: ['mystery'] } }, topicNames: null });
		await m.settle();
		expect(m.all('[data-testid="cert-exam-topics"] li').map((li) => li.textContent?.trim())).toEqual(['mystery']);
	});
});

describe('the passed state', () => {
	it('is a plain Passed panel with no topics', async () => {
		const m = mountRunner({ transport: fakeTransport(), initial: { kind: 'result', result: PASSED } });
		await m.settle();
		expect(m.all('[data-testid="cert-exam-passed"]').length).toBe(1);
		expect(m.all('[data-testid="cert-exam-failed"]').length).toBe(0);
		expect(m.all('[data-testid="cert-exam-topics"]').length).toBe(0);
		expect(text(m)).toContain('Passed');
		expect(text(m)).toContain('5 of 5 correct');
	});
});

describe('the expired state', () => {
	it('says to ask the proctor and offers no Begin', async () => {
		const m = mountRunner({ transport: fakeTransport(), initial: { kind: 'expired' } });
		await m.settle();
		expect(m.all('[data-testid="cert-exam-expired"]').length).toBe(1);
		expect(text(m)).toContain('This release has expired. Ask your proctor to release the exam again.');
		expect(m.all('[data-testid="cert-exam-begin"]').length).toBe(0);
	});
	it('is also where a release_expired refusal on Begin lands', async () => {
		const t = fakeTransport({ expired: true });
		const m = mountRunner({ transport: t });
		await m.settle();
		m.one<HTMLButtonElement>('[data-testid="cert-exam-begin"]').click();
		await m.settle();
		expect(t.calls.map((c) => c.fn)).toEqual(['open']);
		expect(m.all('[data-testid="cert-exam-expired"]').length).toBe(1);
	});
});

describe('the lobby', () => {
	it('shows both sentences and one Begin key, and Begin opens the exam under the overlay class', async () => {
		const t = fakeTransport();
		const m = mountRunner({ transport: t, fullscreen: true });
		await m.settle();
		expect(m.all('[data-testid="cert-exam-begin"]').length).toBe(1);
		expect(m.all('[data-testid="cert-exam-waiting"]').length).toBe(1);
		expect(m.all('[data-testid="cert-exam-lockdown-words"]').length).toBe(1);
		// POSITIVE CONTROL for the lockdown below: in the lobby a copy is not prevented.
		const before = new Event('copy', { bubbles: true, cancelable: true });
		m.one('[data-testid="cert-exam-runner"]').dispatchEvent(before);
		expect(before.defaultPrevented).toBe(false);
		m.one<HTMLButtonElement>('[data-testid="cert-exam-begin"]').click();
		await m.settle();
		expect(t.calls.map((c) => c.fn)).toEqual(['open']);
		const root = m.one('[data-testid="cert-exam-runner"]');
		expect(root.classList.contains('is-full')).toBe(true); // happy-dom has no requestFullscreen: the overlay path
		expect(root.classList.contains('is-native')).toBe(false);
		expect(root.getAttribute('data-phase')).toBe('question');
	});
});

describe('the question state', () => {
	it('has exactly one Next key, zero back controls, the counter, four 44px-styled option rows', async () => {
		const m = mountRunner({ transport: fakeTransport(), initial: { kind: 'open' } });
		await m.settle();
		expect(m.all('[data-testid="cert-exam-question"]').length).toBe(1);
		expect(m.all('[data-testid="cert-exam-next"]').length).toBe(1);
		expect(m.all('[data-testid="cert-exam-back"], [data-testid="cert-exam-back-link"]').length).toBe(0);
		const backish = m.all('button, a').filter((el) => /\b(back|previous)\b/i.test(el.textContent ?? ''));
		expect(backish.length).toBe(0);
		expect(m.one('[data-testid="cert-exam-counter"]').textContent).toBe('Question 1 of 5');
		expect(m.all('[data-testid="cert-exam-option"]').length).toBe(4);
		// The control for the failed state's absence rows: the draw's strings ARE here.
		expect(text(m)).toContain(DRAW[0].prompt);
		expect(text(m)).toContain(OPTION_TEXTS[0]);
		expect(m.one('[data-testid="cert-exam-remaining"]').textContent).toMatch(/\d+:\d\d left/);
	});

	it('Next is aria-disabled, never disabled, until an option is picked, then sends the answer and shows the next question', async () => {
		const t = fakeTransport();
		const m = mountRunner({ transport: t, initial: { kind: 'open' } });
		await m.settle();
		const next = m.one<HTMLButtonElement>('[data-testid="cert-exam-next"]');
		expect(next.getAttribute('aria-disabled')).toBe('true');
		expect(next.disabled).toBe(false);
		pressNext(m);
		await m.settle();
		expect(t.calls.filter((c) => c.fn === 'answer').length).toBe(0);
		const first = m.all<HTMLInputElement>('[data-testid="cert-exam-option"] input')[0];
		first.click();
		await m.settle();
		expect(m.one('[data-testid="cert-exam-next"]').getAttribute('aria-disabled')).toBe('false');
		expect(m.all('[data-testid="cert-exam-option"].is-picked').length).toBe(1);
		pressNext(m);
		await m.settle();
		expect(t.calls.filter((c) => c.fn === 'answer').map((c) => c.args)).toEqual([['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 'a']]);
		expect(m.one('[data-testid="cert-exam-counter"]').textContent).toBe('Question 2 of 5');
		expect(m.all('[data-testid="cert-exam-numeric"] input').length).toBe(1);
		expect(text(m)).toContain('rpm');
		// The first question's strings are gone: no going back.
		expect(text(m)).not.toContain(DRAW[0].prompt);
	});

	it('a numeric answer needs a number, a short answer needs words, a multiple select needs one box', async () => {
		const t = fakeTransport({ draw: DRAW.slice(1, 4) });
		const m = mountRunner({ transport: t, initial: { kind: 'open' } });
		await m.settle();
		const num = m.one<HTMLInputElement>('[data-testid="cert-exam-numeric"] input');
		num.value = 'abc';
		num.dispatchEvent(new Event('input', { bubbles: true }));
		await m.settle();
		expect(m.one('[data-testid="cert-exam-next"]').getAttribute('aria-disabled')).toBe('true');
		num.value = '2,300';
		num.dispatchEvent(new Event('input', { bubbles: true }));
		await m.settle();
		expect(m.one('[data-testid="cert-exam-next"]').getAttribute('aria-disabled')).toBe('false');
		pressNext(m);
		await m.settle();
		expect(t.calls.filter((c) => c.fn === 'answer').at(-1)?.args[2]).toBe(2300);
		// multiple select
		expect(m.all('[data-testid="cert-exam-option"] input[type="checkbox"]').length).toBe(4);
		expect(m.one('[data-testid="cert-exam-next"]').getAttribute('aria-disabled')).toBe('true');
		const boxes = m.all<HTMLInputElement>('[data-testid="cert-exam-option"] input');
		boxes[0].click();
		boxes[3].click();
		await m.settle();
		expect(m.one('[data-testid="cert-exam-next"]').getAttribute('aria-disabled')).toBe('false');
		pressNext(m);
		await m.settle();
		expect(t.calls.filter((c) => c.fn === 'answer').at(-1)?.args[2]).toEqual(['a', 'd']);
		// short: the last question, so the key says Submit
		const short = m.one<HTMLInputElement>('[data-testid="cert-exam-short"] input');
		expect(m.one('[data-testid="cert-exam-next"]').textContent).toBe('Submit exam');
		short.value = '   ';
		short.dispatchEvent(new Event('input', { bubbles: true }));
		await m.settle();
		expect(m.one('[data-testid="cert-exam-next"]').getAttribute('aria-disabled')).toBe('true');
		short.value = ' reamer ';
		short.dispatchEvent(new Event('input', { bubbles: true }));
		await m.settle();
		pressNext(m);
		await m.settle();
		expect(t.calls.filter((c) => c.fn === 'answer').at(-1)?.args[2]).toBe('reamer');
		// done -> submit -> result
		expect(t.calls.map((c) => c.fn).at(-1)).toBe('submit');
		expect(m.all('[data-testid="cert-exam-passed"]').length).toBe(1);
		expect(m.all('[data-testid="cert-exam-question"]').length).toBe(0);
	});

	it('the lockdown is on: a copy on the runner is prevented and flagged to the transport with its kind', async () => {
		const t = fakeTransport();
		const m = mountRunner({ transport: t, initial: { kind: 'open' } });
		await m.settle();
		const root = m.one('[data-testid="cert-exam-runner"]');
		expect(root.classList.contains('is-locked')).toBe(true);
		const e = new Event('copy', { bubbles: true, cancelable: true });
		root.dispatchEvent(e);
		expect(e.defaultPrevented).toBe(true);
		await m.settle();
		expect(t.flags).toEqual(['copy']);
		expect(root.getAttribute('data-flags')).toBe('1');
		// A flag never blocks: the question is still up.
		expect(m.all('[data-testid="cert-exam-question"]').length).toBe(1);
	});

	it('an out-of-order refusal re-opens the exam at the server\'s own question', async () => {
		const t = fakeTransport();
		const m = mountRunner({ transport: t, initial: { kind: 'open' } });
		await m.settle();
		// Advance the fake behind the runner's back, the way a second tab could.
		await t.answer('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 'a');
		m.all<HTMLInputElement>('[data-testid="cert-exam-option"] input')[1].click();
		await m.settle();
		pressNext(m);
		await m.settle();
		expect(t.calls.map((c) => c.fn)).toEqual(['open', 'answer', 'answer', 'open']);
		expect(m.one('[data-testid="cert-exam-counter"]').textContent).toBe('Question 2 of 5');
	});
});

describe('the deadline', () => {
	it('submits itself once the clock has passed it', async () => {
		const t = fakeTransport({ deadline: '2020-01-01T00:00:00Z', result: FAILED });
		const m = mountRunner({ transport: t, initial: { kind: 'open' }, now: () => new Date('2030-01-01T00:00:00Z') });
		await m.settle();
		await m.settle();
		expect(t.calls.filter((c) => c.fn === 'submit').length).toBe(1);
		expect(m.all('[data-testid="cert-exam-failed"]').length).toBe(1);
		expect(text(m)).toContain('Time is up');
	});
});
