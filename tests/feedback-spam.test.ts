// tests/feedback-spam.test.ts
//
// The fine prompt's rule (src/lib/feedback/spam.ts), tested against the shape
// of the 2026-10-22 runs read from the live feedback list on 2026-10-23 (as
// spam: twenty reports). Accounts are letters, never names: this repository
// is public. Times are the real UTC times; texts are the real texts.
//
//   18:50:08 A "feedback stock"   18:50:48 B "feedback stock"   18:53:47 anonymous
//   19:03:29 C "stock"  19:04:10 D "hi"  19:04:37 E "stock"   19:06:19 anonymous "hi"
//   19:06:35 F  19:06:50 G  19:07:09 H  19:07:28 I  19:07:44 J  19:08:22 K  19:08:35 L  (all "hi")
//   20:27:07 M "A"  20:27:23 N  20:27:34 B  20:27:48 E  20:27:57 D  20:28:10 O  (all "a")
//
// The anonymous reports have no account to fine and are not in the review.

import { describe, expect, test } from 'vitest';
import {
	burstsOf,
	parseSpamReview,
	runsOf,
	spamAmount,
	spamPrompts,
	SPAM_BURST_COUNT,
	SPAM_BURST_SENTENCE,
	SPAM_BURST_WINDOW_MINUTES,
	SPAM_FINE_BURST,
	SPAM_FINE_SINGLE,
	type SpamReport,
	type SpamReview
} from '../src/lib/feedback/spam';

const NOON: [string, string, string][] = [
	['A', '18:50:08', 'feedback stock'],
	['B', '18:50:48', 'feedback stock'],
	['C', '19:03:29', 'stock'],
	['D', '19:04:10', 'hi'],
	['E', '19:04:37', 'stock'],
	['F', '19:06:35', 'hi'],
	['G', '19:06:50', 'hi'],
	['H', '19:07:09', 'hi'],
	['I', '19:07:28', 'hi'],
	['J', '19:07:44', 'hi'],
	['K', '19:08:22', 'hi'],
	['L', '19:08:35', 'hi'],
	['M', '20:27:07', 'A'],
	['N', '20:27:23', 'a'],
	['B', '20:27:34', 'a'],
	['E', '20:27:48', 'a'],
	['D', '20:27:57', 'a'],
	['O', '20:28:10', 'a']
];

function rep(user: string, time: string, message: string, over: Partial<SpamReport> = {}): SpamReport {
	return {
		id: `${user}-${time}`,
		user_id: `u-${user}`,
		email: `${user.toLowerCase()}@boscotech.net`,
		name: `Student ${user}`,
		created_at: `2026-10-22T${time}Z`,
		message,
		app: 'classroom',
		page: '/classroom/[sectionId]/item/[itemId]',
		auto_spam: 'greeting_or_test',
		evidence: {},
		device_key: null,
		device_label: null,
		...over
	};
}
const review = (reports: SpamReport[], over: Partial<SpamReview> = {}): SpamReview => ({ reports, deviceAccounts: {}, usualAgents: {}, ...over });

describe('the burst rule, stated once', () => {
	test('the sentence on the prompt is built from the numbers the rule uses', () => {
		expect(SPAM_BURST_SENTENCE).toBe(
			`A burst is ${SPAM_BURST_COUNT} or more spam reports from one account within ${SPAM_BURST_WINDOW_MINUTES} minutes; each burst is 5i¢, and every other spam report is 1i¢.`
		);
		expect([SPAM_FINE_SINGLE, SPAM_FINE_BURST]).toEqual([1, 5]);
	});
	test('three reports inside ten minutes are a burst; the fourth one outside the window is a single', () => {
		const b = burstsOf([
			{ id: '1', created_at: '2026-10-22T19:00:00Z' },
			{ id: '2', created_at: '2026-10-22T19:04:00Z' },
			{ id: '3', created_at: '2026-10-22T19:09:59Z' },
			{ id: '4', created_at: '2026-10-22T19:10:01Z' }
		]);
		expect(b).toEqual({ bursts: [['1', '2', '3']], singles: ['4'] });
		expect(spamAmount(b)).toBe(6);
	});
	test('two reports are never a burst (control)', () => {
		const b = burstsOf([
			{ id: '1', created_at: '2026-10-22T19:00:00Z' },
			{ id: '2', created_at: '2026-10-22T19:00:10Z' }
		]);
		expect(b).toEqual({ bursts: [], singles: ['1', '2'] });
		expect(spamAmount(b)).toBe(2);
	});
});

describe('against the 2026-10-22 runs', () => {
	const reports = NOON.map(([u, t, m]) => rep(u, t, m));
	const prompts = spamPrompts(review(reports));
	const byUser = Object.fromEntries(prompts.map((p) => [p.userId.slice(2), p]));

	test('one prompt per account, fifteen accounts, and no account burst on its own', () => {
		expect(prompts).toHaveLength(15);
		expect(prompts.every((p) => p.bursts.length === 0)).toBe(true);
	});
	test('each account owes 1i¢ a report: two reports for B, D and E, one for everyone else', () => {
		expect(byUser.B.amount).toBe(2);
		expect(byUser.D.amount).toBe(2);
		expect(byUser.E.amount).toBe(2);
		for (const u of ['A', 'C', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O']) expect(byUser[u].amount, u).toBe(1);
		expect(prompts.reduce((t, p) => t + p.amount, 0)).toBe(18);
	});
	test('the cross-account runs are found and named on every prompt in them', () => {
		const runs = runsOf(reports);
		expect(runs.map((r) => [r.reports, r.accounts])).toEqual([
			[10, 10],
			[6, 6]
		]);
		expect(byUser.H.facts.some((f) => f.startsWith('Part of a run of 10 spam reports from 10 accounts'))).toBe(true);
		expect(byUser.B.facts.some((f) => f.startsWith('Part of a run of 6 spam reports from 6 accounts'))).toBe(true);
		// A and B's 18:50 pair is two reports, not a run.
		expect(byUser.A.facts.some((f) => f.startsWith('Part of a run'))).toBe(false);
	});
	test('with no device or session evidence, the prompt says so and raises no doubt', () => {
		expect(byUser.H.doubts).toEqual([]);
		expect(byUser.H.facts).toContain('No sign-in session was recorded for these reports.');
	});
	test('the same noon run sent from one lab computer: every prompt in it doubts the owner', () => {
		const lab = reports.map((r) => (Date.parse(r.created_at) >= Date.parse('2026-10-22T19:06:00Z') && Date.parse(r.created_at) <= Date.parse('2026-10-22T19:09:00Z') ? { ...r, device_key: 'lab-pc-6' } : r));
		const p = Object.fromEntries(spamPrompts(review(lab, { deviceAccounts: { 'lab-pc-6': 7 } })).map((x) => [x.userId.slice(2), x]));
		expect(p.H.doubts.some((d) => /shared lab computer/.test(d))).toBe(true);
		expect(p.H.doubts.some((d) => /same computer/.test(d))).toBe(true);
		// Control: an account outside that run raises no doubt.
		expect(p.M.doubts).toEqual([]);
	});
});

describe('one account bursting', () => {
	test('five reports in a minute and a later one: 5i¢ for the burst, 1i¢ for the other', () => {
		const rs = ['19:00:00', '19:00:15', '19:00:30', '19:00:45', '19:01:00', '19:40:00'].map((t) => rep('Q', t, 'hi'));
		const [p] = spamPrompts(review(rs));
		expect(p.bursts).toHaveLength(1);
		expect(p.bursts[0]).toHaveLength(5);
		expect(p.amount).toBe(6);
		expect(p.facts.some((f) => f.startsWith('A burst: 5 reports'))).toBe(true);
	});
	test('a long sign-in and an unusual browser are doubts, the usual browser is not (control)', () => {
		const win = 'Mozilla/5.0 (Windows NT 10.0; Win64) Chrome/130.0';
		const cros = 'Mozilla/5.0 (X11; CrOS x86_64) Chrome/130.0';
		const usualAgents = { 'u-Q': [{ user_agent: cros, sessions: 14 }, { user_agent: win, sessions: 1 }] };
		const strange = rep('Q', '19:00:00', 'hi', { evidence: { session_started: '2026-10-22T10:00:00Z', user_agent: win } });
		const [p] = spamPrompts(review([strange], { usualAgents }));
		expect(p.doubts.some((d) => /9 hours old/.test(d))).toBe(true);
		expect(p.doubts.some((d) => /Chrome on Windows, not the device this student usually signs in on \(Chrome on Chromebook\)/.test(d))).toBe(true);
		const normal = rep('Q', '19:00:00', 'hi', { evidence: { session_started: '2026-10-22T18:30:00Z', user_agent: cros } });
		expect(spamPrompts(review([normal], { usualAgents }))[0].doubts).toEqual([]);
	});
});

describe('the review payload', () => {
	test('parses the database answer and drops malformed rows', () => {
		const r = parseSpamReview({
			ok: true,
			reports: [{ id: 'r1', user_id: 'u1', created_at: '2026-10-22T19:00:00Z', message: 'hi', evidence: { user_agent: 'x' } }, { id: 'no user' }],
			device_accounts: { k: 3, bad: 'x' },
			usual_agents: { u1: [{ user_agent: 'x', sessions: 2 }] }
		});
		expect(r?.reports.map((x) => x.id)).toEqual(['r1']);
		expect(r?.deviceAccounts).toEqual({ k: 3 });
		expect(parseSpamReview({ ok: false })).toBeNull();
		expect(parseSpamReview(null)).toBeNull();
	});
});
