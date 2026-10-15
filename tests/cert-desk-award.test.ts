// tests/cert-desk-award.test.ts
//
// THE AWARD KEY LIGHTS ONLY WHEN IT MAY, ON THE REAL COMPONENT (ledger 0391,
// surface d). A key that lit with a part still pending would offer a press
// whose only answer is the database's refusal; a key that lit for the
// certifier's own attempt would offer the one thing the spec forbids by name.
// Both directions are counted: the dark key carries `aria-disabled="true"` and
// the sentence saying why, the lit key carries neither, and the confirm dialog
// names every field of the record it is about to write.
//
// Server-rendered: the markup a certifier's browser receives, not a data
// structure the renderer is handed.

import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'svelte';
import { render } from 'svelte/server';
import AwardPanel from '../src/lib/certifications/desk/AwardPanel.svelte';
import { awardHeldWords, awardKeyLit } from '../src/lib/certifications/desk/desk';
import { AWARD_CONFIRM_SENTENCE, AWARD_CONFIRM_TITLE, AWARD_LOCKED_SENTENCE, EXPIRY_UNSET_SENTENCE, NO_NAME_SENTENCE } from '../src/lib/certifications/copy';
import { ANA, ATTEMPT_IN_PROGRESS, ATTEMPT_READY, AWARD_RECORD, BEN, PINA } from '../src/routes/dev/cert-desk/fixtures';

type Props = ComponentProps<typeof AwardPanel>;
const html = (props: Props) => render(AwardPanel, { props }).body;
const keyTag = (body: string) => body.match(/<button[^>]*data-testid="cert-award-key"[^>]*>/)?.[0] ?? '';
const count = (body: string, re: RegExp) => (body.match(re) ?? []).length;

describe('the award key', () => {
	it('is dark with the locked sentence while a part is pending', () => {
		const body = html({ attempt: ATTEMPT_IN_PROGRESS, student: ANA, record: null, refusal: { reason: 'incomplete', message: 'Not every part is checked.' }, callerEmail: PINA.email });
		const key = keyTag(body);
		expect(key).not.toBe('');
		expect(key).toContain('aria-disabled="true"');
		expect(key).not.toContain(' disabled');
		expect(count(body, /data-testid="cert-award-held"/g)).toBe(1);
		expect(body).toContain(AWARD_LOCKED_SENTENCE);
		expect(count(body, /data-testid="cert-award-ready"/g)).toBe(0);
		// No record was prepared, so the dialog carries no facts to mis-record.
		expect(count(body, /data-fact="/g)).toBe(0);
	});

	it('is dark when the certifier is the student, and says so', () => {
		const body = html({ attempt: ATTEMPT_READY, student: BEN, record: AWARD_RECORD, refusal: null, callerEmail: BEN.email });
		expect(keyTag(body)).toContain('aria-disabled="true"');
		expect(body).toContain('A certifier cannot award their own attempt.');
		expect(count(body, /data-testid="cert-award-ready"/g)).toBe(0);
	});

	it('is lit with every part done, a prepared record and another certifier', () => {
		const body = html({ attempt: ATTEMPT_READY, student: BEN, record: AWARD_RECORD, refusal: null, callerEmail: PINA.email });
		const key = keyTag(body);
		expect(key).not.toBe('');
		expect(key).not.toContain('aria-disabled');
		expect(count(body, /data-testid="cert-award-held"/g)).toBe(0);
		expect(count(body, /data-testid="cert-award-ready"/g)).toBe(1);
	});

	it('the confirm dialog names every field of the record', () => {
		const body = html({ attempt: ATTEMPT_READY, student: BEN, record: AWARD_RECORD, refusal: null, callerEmail: PINA.email });
		expect(body).toContain(AWARD_CONFIRM_TITLE);
		expect(body).toContain(AWARD_CONFIRM_SENTENCE);
		const facts = ['student_name', 'student_email', 'certification_name', 'code', 'level', 'category', 'awarded_at', 'expires_at', 'certifier_name'];
		for (const f of facts) expect(count(body, new RegExp(`data-fact="${f}"`, 'g'))).toBe(1);
		expect(count(body, /data-fact="/g)).toBe(facts.length);
		for (const value of [BEN.name, BEN.email, 'Manual Mill Level 1', 'MILL-1', 'Machining', PINA.name, 'October 15, 2026', 'Never']) {
			expect(body).toContain(value);
		}
		expect(count(body, /data-testid="cert-award-cancel"/g)).toBe(1);
		expect(count(body, /data-testid="cert-award-commit"/g)).toBe(1);
	});

	it('the checklist names every part with its state', () => {
		const body = html({ attempt: ATTEMPT_IN_PROGRESS, student: ANA, record: null, refusal: null, callerEmail: PINA.email });
		expect(count(body, /class="cert-check-row[^"]*"[^>]*data-part="/g)).toBe(5);
		expect(count(body, /data-state="done"/g)).toBe(1);
		expect(count(body, /data-state="pending"/g)).toBe(4);
	});
});

describe('awardKeyLit and awardHeldWords, the decisions behind the key', () => {
	it('lights only for a prepared record and a caller who is not the student', () => {
		expect(awardKeyLit({ prepared: true, callerEmail: PINA.email, studentEmail: BEN.email })).toBe(true);
		expect(awardKeyLit({ prepared: true, callerEmail: BEN.email.toUpperCase(), studentEmail: BEN.email })).toBe(false);
		expect(awardKeyLit({ prepared: false, callerEmail: PINA.email, studentEmail: BEN.email })).toBe(false);
		// An unknown caller cannot be proven to be the student; the database still refuses one.
		expect(awardKeyLit({ prepared: true, callerEmail: null, studentEmail: BEN.email })).toBe(true);
	});

	it('says why, from the function reason first and the shared sentences second', () => {
		expect(awardHeldWords({ refusal: null, self: true, allDone: true })).toContain('cannot award their own attempt');
		expect(awardHeldWords({ refusal: null, self: false, allDone: false })).toBe(AWARD_LOCKED_SENTENCE);
		expect(awardHeldWords({ refusal: null, self: false, allDone: true })).toBeNull();
		expect(awardHeldWords({ refusal: { reason: 'no_name', message: 'x' }, self: false, allDone: true })).toBe(NO_NAME_SENTENCE);
		expect(awardHeldWords({ refusal: { reason: 'expiry_unset', message: 'x' }, self: false, allDone: true })).toBe(EXPIRY_UNSET_SENTENCE);
		expect(awardHeldWords({ refusal: { reason: 'not_found', message: 'Not found.' }, self: false, allDone: true })).toBe('Not found.');
	});
});
