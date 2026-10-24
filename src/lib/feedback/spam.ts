/**
 * THE FEEDBACK SPAM FINE PROMPT (ledger 0432, feedback 4f1bdc96): the one
 * statement of what a burst is, what each fine costs, and what evidence points
 * away from the account owner. Pure, so the console, the dev harness and the
 * test all build the same prompts from `app_feedback_spam_review()`.
 *
 * Mr. Pina, 2026-10-23: 1 coin for a single spam report, 5 for a burst; the
 * site prompts him with a ready fine and never fines on its own; the student
 * can dispute it from their coin page; fine the owner only when the evidence
 * points to them.
 */
import { coins } from '$lib/coin-format';

/** An account bursts when it sends this many spam reports... */
export const SPAM_BURST_COUNT = 3;
/** ...inside this window, measured from the first of them. */
export const SPAM_BURST_WINDOW_MINUTES = 10;
/** The fine for one spam report that is not part of a burst. */
export const SPAM_FINE_SINGLE = 1;
/** The fine for one burst, however many reports it holds. */
export const SPAM_FINE_BURST = 5;
/** A run is this many spam reports in a row from any accounts... */
export const SPAM_RUN_COUNT = 3;
/** ...each sent within this many seconds of the one before. */
export const SPAM_RUN_GAP_SECONDS = 120;
/** A report sent from a session this old was likely a computer left signed in. */
export const LONG_SESSION_HOURS = 6;

/** The sentence the prompt carries, built from the constants so it cannot drift from them. */
export const SPAM_BURST_SENTENCE = `A burst is ${SPAM_BURST_COUNT} or more spam reports from one account within ${SPAM_BURST_WINDOW_MINUTES} minutes; each burst is ${coins(SPAM_FINE_BURST)}, and every other spam report is ${coins(SPAM_FINE_SINGLE)}.`;

export interface SpamReport {
	id: string;
	user_id: string;
	email: string;
	name: string;
	created_at: string;
	message: string;
	app: string | null;
	page: string | null;
	auto_spam: string | null;
	evidence: { session_id?: string; session_started?: string; user_agent?: string; seconds_since_previous?: number };
	device_key: string | null;
	device_label: string | null;
}

export interface SpamReview {
	reports: SpamReport[];
	/** Per device key: how many accounts have sent reports from it (90 days). */
	deviceAccounts: Record<string, number>;
	/** Per account id: its sign-in browsers over 30 days, most used first. */
	usualAgents: Record<string, { user_agent: string; sessions: number }[]>;
}

export interface SpamRun {
	start: string;
	end: string;
	reports: number;
	accounts: number;
}

export interface SpamPrompt {
	userId: string;
	name: string;
	email: string;
	reports: SpamReport[];
	/** Each burst, as the report ids it holds, oldest first. */
	bursts: string[][];
	/** The reports that are not in a burst. */
	singles: string[];
	amount: number;
	/** Why the evidence may point away from the account owner, in plain words. Empty: nothing found. */
	doubts: string[];
	/** What the evidence shows either way, one fact a line. */
	facts: string[];
}

const minutes = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60_000;

/** The bursts in one account's reports: greedy from the oldest, each window opened by its first report. */
export function burstsOf(reports: { id: string; created_at: string }[]): { bursts: string[][]; singles: string[] } {
	const sorted = [...reports].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
	const bursts: string[][] = [];
	const singles: string[] = [];
	let i = 0;
	while (i < sorted.length) {
		let j = i;
		while (j + 1 < sorted.length && minutes(sorted[i].created_at, sorted[j + 1].created_at) <= SPAM_BURST_WINDOW_MINUTES) j++;
		if (j - i + 1 >= SPAM_BURST_COUNT) {
			bursts.push(sorted.slice(i, j + 1).map((r) => r.id));
			i = j + 1;
		} else {
			singles.push(sorted[i].id);
			i++;
		}
	}
	return { bursts, singles };
}

/** The fine for one account: each burst once, each other report once. */
export function spamAmount(b: { bursts: string[][]; singles: string[] }): number {
	return b.bursts.length * SPAM_FINE_BURST + b.singles.length * SPAM_FINE_SINGLE;
}

/** Runs across every account: consecutive spam reports, each close behind the one before. */
export function runsOf(reports: SpamReport[]): (SpamRun & { ids: string[] })[] {
	const sorted = [...reports].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
	const out: (SpamRun & { ids: string[] })[] = [];
	let chain: SpamReport[] = [];
	const close = () => {
		if (chain.length >= SPAM_RUN_COUNT) {
			out.push({
				start: chain[0].created_at,
				end: chain[chain.length - 1].created_at,
				reports: chain.length,
				accounts: new Set(chain.map((r) => r.user_id)).size,
				ids: chain.map((r) => r.id)
			});
		}
	};
	for (const r of sorted) {
		const last = chain[chain.length - 1];
		if (last && (Date.parse(r.created_at) - Date.parse(last.created_at)) / 1000 > SPAM_RUN_GAP_SECONDS) {
			close();
			chain = [];
		}
		chain.push(r);
	}
	close();
	return out;
}

function clock(iso: string): string {
	return new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Los_Angeles', hour: 'numeric', minute: '2-digit' });
}

function browserWords(agent: string): string {
	const os = /Windows/.test(agent) ? 'Windows' : /CrOS/.test(agent) ? 'Chromebook' : /Mac OS X|Macintosh/.test(agent) ? 'Mac' : /iPhone|iPad/.test(agent) ? 'iPhone or iPad' : /Android/.test(agent) ? 'Android' : 'another system';
	const app = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'a browser';
	return `${app} on ${os}`;
}

/** Every account's ready fine, newest spam first, with the evidence for and against the owner. */
export function spamPrompts(review: SpamReview): SpamPrompt[] {
	const runs = runsOf(review.reports);
	const byUser = new Map<string, SpamReport[]>();
	for (const r of review.reports) byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r]);
	const prompts: SpamPrompt[] = [];
	for (const [userId, reports] of byUser) {
		const split = burstsOf(reports);
		const doubts: string[] = [];
		const facts: string[] = [];
		const devices = [...new Set(reports.map((r) => r.device_key).filter((k): k is string => !!k))];
		const shared = devices.filter((k) => (review.deviceAccounts[k] ?? 0) >= 2);
		if (shared.length) {
			const most = Math.max(...shared.map((k) => review.deviceAccounts[k] ?? 0));
			doubts.push(`Sent from a computer ${most} accounts have used to send reports, likely a shared lab computer.`);
		}
		const long = reports.filter((r) => r.evidence.session_started && (Date.parse(r.created_at) - Date.parse(r.evidence.session_started)) / 3_600_000 >= LONG_SESSION_HOURS);
		if (long.length) {
			const hours = Math.floor(Math.max(...long.map((r) => (Date.parse(r.created_at) - Date.parse(r.evidence.session_started!)) / 3_600_000)));
			doubts.push(`Sent from a sign-in that was already ${hours} hours old, so the computer may have been left signed in.`);
		}
		const usual = (review.usualAgents[userId] ?? []).filter((a) => a.user_agent);
		const agents = [...new Set(reports.map((r) => r.evidence.user_agent).filter((a): a is string => !!a))];
		if (usual.length >= 2 && agents.length) {
			const top = usual[0];
			const strange = agents.filter((a) => a !== top.user_agent && (usual.find((u) => u.user_agent === a)?.sessions ?? 0) <= 1);
			if (strange.length) doubts.push(`Sent from ${browserWords(strange[0])}, not the device this student usually signs in on (${browserWords(top.user_agent)}).`);
		}
		const mine = new Set(reports.map((r) => r.id));
		for (const run of runs) {
			if (!run.ids.some((id) => mine.has(id))) continue;
			const runDevices = new Set(review.reports.filter((r) => run.ids.includes(r.id)).map((r) => r.device_key).filter(Boolean));
			facts.push(`Part of a run of ${run.reports} spam reports from ${run.accounts} accounts, ${clock(run.start)} to ${clock(run.end)}.`);
			if (run.accounts >= 2 && runDevices.size === 1) doubts.push('Every account in that run sent from the same computer, so one person may have used several accounts.');
		}
		for (const b of split.bursts) {
			const rs = reports.filter((r) => b.includes(r.id)).sort((x, y) => Date.parse(x.created_at) - Date.parse(y.created_at));
			facts.push(`A burst: ${b.length} reports from ${clock(rs[0].created_at)} to ${clock(rs[rs.length - 1].created_at)}.`);
		}
		if (agents.length) facts.push(`Browser: ${agents.map(browserWords).join(', ')}.`);
		else facts.push('No sign-in session was recorded for these reports.');
		if (!devices.length) facts.push('The report box sent no device key (an older page).');
		prompts.push({
			userId,
			name: reports[0].name,
			email: reports[0].email,
			reports: [...reports].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
			bursts: split.bursts,
			singles: split.singles,
			amount: spamAmount(split),
			doubts,
			facts
		});
	}
	return prompts.sort((a, b) => Date.parse(b.reports[0].created_at) - Date.parse(a.reports[0].created_at));
}

/** `app_feedback_spam_review()`'s answer, or null when it is missing or not an answer. */
export function parseSpamReview(raw: unknown): SpamReview | null {
	if (!raw || typeof raw !== 'object' || (raw as { ok?: unknown }).ok !== true) return null;
	const o = raw as Record<string, unknown>;
	const str = (v: unknown) => (typeof v === 'string' ? v : null);
	const reports = (Array.isArray(o.reports) ? o.reports : [])
		.map((x) => (x && typeof x === 'object' ? (x as Record<string, unknown>) : null))
		.filter((x): x is Record<string, unknown> => !!x && typeof x.id === 'string' && typeof x.user_id === 'string' && typeof x.created_at === 'string')
		.map(
			(x): SpamReport => ({
				id: x.id as string,
				user_id: x.user_id as string,
				email: str(x.email) ?? '',
				name: str(x.name) ?? 'A student',
				created_at: x.created_at as string,
				message: str(x.message) ?? '',
				app: str(x.app),
				page: str(x.page),
				auto_spam: str(x.auto_spam),
				evidence: x.evidence && typeof x.evidence === 'object' ? (x.evidence as SpamReport['evidence']) : {},
				device_key: str(x.device_key),
				device_label: str(x.device_label)
			})
		);
	const record = <T>(v: unknown, ok: (x: unknown) => x is T): Record<string, T> => {
		const out: Record<string, T> = {};
		if (v && typeof v === 'object' && !Array.isArray(v)) for (const [k, x] of Object.entries(v)) if (ok(x)) out[k] = x;
		return out;
	};
	return {
		reports,
		deviceAccounts: record(o.device_accounts, (x): x is number => typeof x === 'number'),
		usualAgents: record(o.usual_agents, (x): x is { user_agent: string; sessions: number }[] => Array.isArray(x))
	};
}

/** Why a report was marked spam automatically, in words. */
export const AUTO_SPAM_WORDS: Record<string, string> = {
	too_short: 'Marked automatically: almost no letters.',
	one_letter: 'Marked automatically: one letter repeated.',
	greeting_or_test: 'Marked automatically: a greeting or a test word.',
	repeat: 'Marked automatically: the same words this account sent earlier today.'
};

/** A fine or dismissal that did not land, in words. */
export function spamFineRefusalWords(reason: string): string {
	switch (reason) {
		case 'not_open_spam':
			return 'One of those reports is no longer open spam. Reload and look again.';
		case 'more_than_one_account':
			return 'Those reports came from more than one account. Nothing was fined.';
		case 'not_a_student':
			return 'That account is not a student account. Nothing was fined.';
		case 'amount':
			return 'A fine is a whole number from 1 to 50.';
		default:
			return `The fine did not go through (${reason}).`;
	}
}
