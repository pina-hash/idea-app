// tests/foundry-publisher.test.ts
//
// THE TRUSTED-PUBLISHER APPLICATION, CLIENT HALF (report 6d076258, ledger
// 0360).
//
// WHAT FAILS SILENTLY HERE, AND SO IS ASSERTED:
//   * the trick marks reaching a STUDENT'S page (a disclosure: the whole point
//     of a trick question is that the student cannot see which one it is);
//   * a Send or Save control offered for a payload the database refuses (a
//     press that does nothing, or a round trip that only says no);
//   * the client's limits drifting from 0230's, which no screen reports.
//
// THE REAL COMPONENTS ARE RENDERED, server-side, from their own files. The
// expected values come from the fixtures and from 0230's text, never from the
// predicate under test.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';

import FoundryPublisherApply from '$lib/foundry/FoundryPublisherApply.svelte';
import FoundryPublisherApplications from '$lib/foundry/FoundryPublisherApplications.svelte';
import FoundryPublisherQuestions from '$lib/foundry/FoundryPublisherQuestions.svelte';
import {
	PUBLISHER_ANSWER_MAX,
	PUBLISHER_CHOICE_MAX,
	PUBLISHER_COOLDOWN_DAYS,
	PUBLISHER_NOTE_MAX,
	PUBLISHER_PROMPT_MAX,
	PUBLISHER_QUESTIONS_MAX,
	PUBLISHER_REVIEWER_NOTE_MAX,
	publisherCanSend,
	publisherQuestionsPayload,
	publisherQuestionsValid,
	publisherRead,
	publisherRefusalSentence,
	publisherStanding,
	type FoundryPublisherApplication,
	type FoundryPublisherQuestion,
	type FoundryPublisherQuestionAdmin,
	type FoundryPublisherQuestionDraft,
	type FoundryPublisherStatus
} from '$lib/foundry/publisher';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NOW = new Date('2026-10-01T16:00:00Z');

/* ---------------------------------------------------------------- fixtures */

const Q_TEXT: FoundryPublisherQuestion = {
	id: 'aaaaaaaa-0000-4000-8000-000000000001',
	position: 1,
	prompt: 'What do you want to publish, and who is it for?',
	kind: 'text',
	choices: []
};
const Q_CHOICE: FoundryPublisherQuestion = {
	id: 'aaaaaaaa-0000-4000-8000-000000000002',
	position: 2,
	prompt: 'A friend asks you to publish their game under your name. What do you do?',
	kind: 'choice',
	choices: ['Publish it under my name', 'Say no, and help them fix it']
};

function status(over: Partial<FoundryPublisherStatus> = {}): FoundryPublisherStatus {
	return {
		ok: true,
		eligible: true,
		trusted: false,
		questions: [Q_TEXT, Q_CHOICE],
		application: null,
		cooldown_until: null,
		...over
	};
}

const APPLICATION: FoundryPublisherApplication = {
	id: 'bbbbbbbb-0000-4000-8000-000000000001',
	applicant: 'cccccccc-0000-4000-8000-000000000001',
	applicant_email: 'ana.reyes.2029@boscotech.net',
	applicant_display_name: null,
	applicant_full_name: 'Ana Reyes',
	status: 'pending',
	submitted_at: '2026-09-30T15:00:00Z',
	decided_at: null,
	decided_by: null,
	decision_note: null,
	trusted_now: false,
	flagged_count: 1,
	answers: [
		{
			question_id: Q_TEXT.id,
			position: 1,
			prompt: Q_TEXT.prompt,
			kind: 'text',
			answer: 'A physics game for my class.',
			is_trick: false,
			flagged: false,
			reviewer_note: null
		},
		{
			question_id: Q_CHOICE.id,
			position: 2,
			prompt: Q_CHOICE.prompt,
			kind: 'choice',
			answer: 'Publish it under my name',
			is_trick: true,
			flagged: true,
			reviewer_note: 'Either publish answer is a red flag.'
		}
	]
};

/* ------------------------------------------------------------ the predicates */

describe('publisherCanSend is the button and the handler', () => {
	it('refuses with no questions at all', () => {
		expect(publisherCanSend([], {})).toEqual({ ok: false, reason: 'no_questions' });
	});

	it('names the FIRST blank question before any other kind of problem (0230 order)', () => {
		const long = 'x'.repeat(PUBLISHER_ANSWER_MAX + 1);
		// Question 1 is too long AND question 2 is blank: 0230 reports the blank
		// first, because its first pass is blanks across every question.
		expect(publisherCanSend([Q_TEXT, Q_CHOICE], { [Q_TEXT.id]: long })).toEqual({
			ok: false,
			reason: 'incomplete',
			questionId: Q_CHOICE.id
		});
	});

	it('refuses whitespace as blank, an over-long answer, and a choice not on offer', () => {
		expect(publisherCanSend([Q_TEXT], { [Q_TEXT.id]: ' \n\t ' })).toMatchObject({ reason: 'incomplete' });
		expect(publisherCanSend([Q_TEXT], { [Q_TEXT.id]: 'x'.repeat(PUBLISHER_ANSWER_MAX + 1) })).toMatchObject({
			reason: 'too_long'
		});
		expect(
			publisherCanSend([Q_CHOICE], { [Q_CHOICE.id]: 'Something else' })
		).toMatchObject({ reason: 'bad_choice', questionId: Q_CHOICE.id });
	});

	it('POSITIVE CONTROL: a complete application may be sent', () => {
		expect(
			publisherCanSend([Q_TEXT, Q_CHOICE], {
				[Q_TEXT.id]: 'x'.repeat(PUBLISHER_ANSWER_MAX),
				[Q_CHOICE.id]: Q_CHOICE.choices[1]!
			})
		).toEqual({ ok: true });
	});
});

describe('publisherQuestionsValid mirrors the editor RPC', () => {
	const draft = (over: Partial<FoundryPublisherQuestionDraft> = {}): FoundryPublisherQuestionDraft => ({
		id: null,
		prompt: 'A question',
		kind: 'text',
		choices: [],
		flag_choices: [],
		is_trick: false,
		reviewer_note: null,
		...over
	});

	it('refuses an empty set, an over-long set, a blank prompt and an over-long prompt', () => {
		expect(publisherQuestionsValid([]).ok).toBe(false);
		expect(publisherQuestionsValid(Array.from({ length: PUBLISHER_QUESTIONS_MAX + 1 }, () => draft())).ok).toBe(false);
		expect(publisherQuestionsValid([draft({ prompt: '  ' })])).toMatchObject({ ok: false, index: 0 });
		expect(publisherQuestionsValid([draft(), draft({ prompt: 'x'.repeat(PUBLISHER_PROMPT_MAX + 1) })])).toMatchObject({
			ok: false,
			index: 1
		});
	});

	it('refuses a choice question with too few, duplicate or over-long choices, or a stray red flag', () => {
		const c = (choices: string[], flags: string[] = []) =>
			draft({ kind: 'choice', choices, flag_choices: flags });
		expect(publisherQuestionsValid([c(['Only one'])]).ok).toBe(false);
		expect(publisherQuestionsValid([c(['Same', ' Same '])]).ok).toBe(false);
		expect(publisherQuestionsValid([c(['ok', 'x'.repeat(PUBLISHER_CHOICE_MAX + 1)])]).ok).toBe(false);
		expect(publisherQuestionsValid([c(['a', 'b'], ['c'])]).ok).toBe(false);
		expect(
			publisherQuestionsValid([draft({ reviewer_note: 'x'.repeat(PUBLISHER_REVIEWER_NOTE_MAX + 1) })]).ok
		).toBe(false);
	});

	it('treats a blank line in the choices box as no choice, in the check and in the payload alike', () => {
		const q = draft({ kind: 'choice', choices: ['a', '', 'b', ''], flag_choices: ['b'] });
		expect(publisherQuestionsValid([q])).toEqual({ ok: true });
		expect(publisherQuestionsPayload([q])[0]).toMatchObject({ choices: ['a', 'b'], flag_choices: ['b'] });
	});

	it('POSITIVE CONTROL: the seeded shape is valid', () => {
		expect(
			publisherQuestionsValid([
				draft(),
				draft({ kind: 'choice', choices: ['Yes', 'No'], flag_choices: ['Yes'], is_trick: true })
			])
		).toEqual({ ok: true });
	});
});

describe('where a student stands', () => {
	it('walks the states in order', () => {
		expect(publisherStanding(status({ eligible: false }), NOW)).toBe('not_eligible');
		expect(publisherStanding(status({ trusted: true }), NOW)).toBe('trusted');
		const app = (s: 'pending' | 'declined') => ({
			id: 'x',
			status: s,
			submitted_at: '2026-09-30T00:00:00Z',
			decided_at: null,
			decision_note: null
		});
		expect(publisherStanding(status({ application: app('pending') }), NOW)).toBe('pending');
		expect(
			publisherStanding(status({ application: app('declined'), cooldown_until: '2026-10-05T00:00:00Z' }), NOW)
		).toBe('cooldown');
		expect(
			publisherStanding(status({ application: app('declined'), cooldown_until: '2026-09-30T00:00:00Z' }), NOW)
		).toBe('declined');
		expect(publisherStanding(status(), NOW)).toBe('open');
	});

	it('gives every refusal a sentence with no em dash', () => {
		for (const r of [
			'not_eligible',
			'already_trusted',
			'pending',
			'cooldown',
			'incomplete',
			'too_long',
			'bad_choice',
			'no_questions',
			'foundry_off',
			'not_found',
			'already_decided',
			'something new'
		]) {
			const s = publisherRefusalSentence(r, { until: '2026-10-08T15:00:00Z' });
			expect(s.length, r).toBeGreaterThan(10);
			expect(s, r).not.toMatch(/—/);
		}
		expect(publisherRefusalSentence('cooldown', { until: '2026-10-08T15:00:00Z' })).toContain('October 8');
	});

	it('reads PGRST202 as "not on yet" and any other error as a failure', () => {
		expect(publisherRead(null, { code: 'PGRST202' })).toEqual({ state: 'unavailable' });
		expect(publisherRead(null, { code: '42501', message: 'nope' })).toEqual({ state: 'failed', message: 'nope' });
		expect(publisherRead([1], null)).toEqual({ state: 'ready', value: [1] });
	});
});

/* ----------------------------------------------- the limits are 0230's own */

function migration0230(): string | null {
	const dir = join(ROOT, 'supabase/migrations');
	const name = readdirSync(dir).find((f) => f.startsWith('0230_'));
	return name && existsSync(join(dir, name)) ? readFileSync(join(dir, name), 'utf8') : null;
}

const SQL = migration0230();

/**
 * PINNED AGAINST THE MIGRATION'S TEXT WHEN IT IS IN THE TREE. The migration is
 * written by a separate lane of the same bundle, so on this lane's own branch
 * the file may not be here yet; on the integrated tree it is, and this runs.
 */
describe.skipIf(SQL === null)('every client limit is 0230 own number', () => {
	it('matches the answer, note, prompt, choice, reviewer-note, set-size and cooldown limits', () => {
		const sql = SQL!;
		expect(sql).toContain(`> ${PUBLISHER_ANSWER_MAX}`);
		expect(sql).toMatch(new RegExp(`decision_note[^\\n]*<= ${PUBLISHER_NOTE_MAX}`));
		expect(sql).toMatch(new RegExp(`between 1 and ${PUBLISHER_PROMPT_MAX}\\)`));
		expect(sql).toContain(`> ${PUBLISHER_CHOICE_MAX} then`);
		expect(sql).toMatch(new RegExp(`reviewer_note[^\\n]*<= ${PUBLISHER_REVIEWER_NOTE_MAX}`));
		expect(sql).toContain(`v_n > ${PUBLISHER_QUESTIONS_MAX}`);
		expect(sql).toContain(`interval '${PUBLISHER_COOLDOWN_DAYS} days'`);
	});
});

/* ---------------------------------------- the trick marks are admin only */

function applyHtml(read = { state: 'ready' as const, value: status() }, withApply = true) {
	return render(FoundryPublisherApply, {
		props: {
			read,
			now: NOW,
			...(withApply ? { apply: async () => ({ ok: true as const, submittedAt: null }) } : {})
		}
	}).body;
}

function applicationsHtml(withDecide = true) {
	const ready = { state: 'ready' as const, value: [APPLICATION] };
	return render(FoundryPublisherApplications, {
		props: {
			pending: ready,
			decided: { state: 'ready' as const, value: [] },
			...(withDecide ? { decide: async () => ({ ok: true as const, status: 'approved' }) } : {})
		}
	}).body;
}

describe('a student never sees which question is the trick', () => {
	it('renders every prompt and choice on the student form, and no trick or red-flag word', () => {
		const html = applyHtml();
		expect(html).toContain(Q_TEXT.prompt);
		expect(html).toContain(Q_CHOICE.choices[0]);
		expect(html.match(/type="radio"/g) ?? []).toHaveLength(2);
		expect(html).toContain('Send my application');
		expect(html).not.toMatch(/Trick question|Red flag|What to look for/);
	});

	it('POSITIVE CONTROL: the admin panel renders all three marks for the same question', () => {
		const html = applicationsHtml();
		expect(html).toContain('Trick question');
		expect(html).toContain('Red flag');
		expect(html).toContain('What to look for');
		expect(html).toContain(APPLICATION.applicant_email);
		expect(html).toContain('Ana Reyes');
	});
});

describe('absence is the mechanism', () => {
	it('gives the admin panel Approve and Decline only with a decide transport', () => {
		const withIt = applicationsHtml(true);
		expect(withIt.match(/data-testid="foundry-publisher-approve"/g) ?? []).toHaveLength(1);
		expect(withIt.match(/data-testid="foundry-publisher-decline"/g) ?? []).toHaveLength(1);
		const without = applicationsHtml(false);
		expect(without).not.toContain('foundry-publisher-approve');
		expect(without).not.toContain('foundry-publisher-decline');
		expect(without).toContain('Ana Reyes');
	});

	it('gives the student form a Send control only with an apply transport', () => {
		expect(applyHtml(undefined, true)).toContain('foundry-publisher-send');
		const without = applyHtml(undefined, false);
		expect(without).not.toContain('foundry-publisher-send');
		expect(without).toContain(Q_TEXT.prompt);
	});

	it('says the feature is not on yet on a database without 0230', () => {
		const html = applyHtml({ state: 'unavailable' } as never);
		expect(html).toContain('foundry-publisher-unavailable');
		expect(html).not.toContain('Send my application');
	});

	it('shows a waiting student their state and no form', () => {
		const html = applyHtml({
			state: 'ready',
			value: status({
				application: {
					id: 'x',
					status: 'pending',
					submitted_at: '2026-09-30T15:00:00Z',
					decided_at: null,
					decision_note: null
				}
			})
		});
		expect(html).toContain('Waiting for a decision');
		expect(html).not.toContain('Send my application');
	});

	it('gives the question editor a Save control only with a save transport', () => {
		const q: FoundryPublisherQuestionAdmin = {
			...Q_CHOICE,
			flag_choices: [Q_CHOICE.choices[0]!],
			is_trick: true,
			reviewer_note: 'Look for the publish answer.',
			active: true,
			updated_at: '2026-10-01T00:00:00Z',
			updated_by: null
		};
		const read = { state: 'ready' as const, value: [q] };
		const withIt = render(FoundryPublisherQuestions, {
			props: { read, save: async () => ({ ok: true as const, active: 1, retired: 0 }) }
		}).body;
		expect(withIt).toContain('foundry-publisher-questions-save');
		expect(withIt).toContain('Look for the publish answer.');
		const without = render(FoundryPublisherQuestions, { props: { read } }).body;
		expect(without).not.toContain('foundry-publisher-questions-save');
		expect(without).toContain(Q_CHOICE.prompt);
	});
});
