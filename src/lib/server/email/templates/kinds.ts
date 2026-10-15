/**
 * WHAT EACH NOTIFICATION KIND SAYS IN ITS EMAIL (ledger 0391, surface f):
 * the subject, the eyebrow word, the tone, the call to action's word, and
 * which facts from the payload sit in the fact rows. One rule per kind in
 * `NOTIFICATION_KINDS`, plus a generic rule for a kind this file does not
 * know, so `renderCertEmail` never throws.
 *
 * THE PAYLOADS ARE THE MIGRATIONS' (0261 to 0264), read here and never
 * trusted: a missing key drops its row rather than printing "undefined". The
 * fact rows the contract asks for that the tree's payloads do not carry
 * (the award's level and date) are read when present and left off when not,
 * so a later widening of the payload shows them with no change here; the
 * title and body, which carry the certification's name and the date in
 * words, are always on the page.
 *
 * SUBJECTS start with the certification code where the payload has one,
 * carry no em dash, and are held under `SUBJECT_MAX` characters.
 */
import { PART_WORDS } from '$lib/certifications/parts';
import { formatCertDate, formatCertDateTime } from '$lib/certifications/status';
import type { CertPart, NotificationKind } from '$lib/certifications/types';
import type { EmailFact, EmailTone } from './html';

export const SUBJECT_MAX = 70;

export interface KindInput {
	kind: string;
	title: string;
	body: string;
	payload: Record<string, unknown>;
}

export interface KindRule {
	eyebrow: string;
	tone: (input: KindInput) => EmailTone;
	cta: string;
	subject: (input: KindInput) => string;
	facts: (input: KindInput) => EmailFact[];
	/** Which labels inside the body open a quoted block: Feedback, Note, Reason. */
	quoteLabels: string[];
}

const str = (payload: Record<string, unknown>, key: string): string => {
	const v = payload[key];
	if (typeof v === 'string') return v.trim();
	if (typeof v === 'number' && Number.isFinite(v)) return String(v);
	return '';
};
const strList = (payload: Record<string, unknown>, key: string): string[] => {
	const v = payload[key];
	return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()) : [];
};
const partWord = (part: string): string => (part in PART_WORDS ? PART_WORDS[part as CertPart] : part);
const withCode = (payload: Record<string, unknown>, rest: string): string => {
	const code = str(payload, 'code');
	return code ? `${code}: ${rest}` : rest;
};
const fact = (label: string, value: string, href?: string): EmailFact | null => (value ? { label, value, href } : null);
const present = (rows: (EmailFact | null)[]): EmailFact[] => rows.filter((r): r is EmailFact => !!r);

/** "Awarded: Manual Mill Level 1" -> "Manual Mill Level 1". */
const titleAfterColon = (title: string): string => {
	const i = title.indexOf(': ');
	return i >= 0 ? title.slice(i + 2).trim() : title.trim();
};

/** The student the body names: "<name> handed in the ..." / "<name> asked for ...". */
export function studentFromBody(body: string): string {
	const m = /^(.+?) (?:handed in|asked for) /.exec(body);
	return m ? m[1].trim() : '';
}

/**
 * The certification the body names: "... for <name>." The LAST " for " of
 * the first sentence, because "asked for an exam sitting for Manual Mill
 * Level 1." carries two.
 */
export function certFromBody(body: string): string {
	const sentence = body.split(/\.(?:\s|$)/)[0] ?? '';
	const at = sentence.lastIndexOf(' for ');
	return at >= 0 ? sentence.slice(at + 5).trim() : '';
}

/** A date and time in words, the shared module's one spelling. */
const dateTimeWords = (at: string | null): string => formatCertDateTime(at);

/**
 * The body split into its sentences and a quoted block, where the body
 * carries one of the labels (" Feedback: ", " Note: ", " Reason: "). The
 * LAST label wins, so a feedback that itself says "Note:" stays whole.
 */
export function splitBody(body: string, labels: string[]): { intro: string; quote: { label: string; text: string } | null } {
	let best: { at: number; label: string; len: number } | null = null;
	for (const label of labels) {
		const needle = `${label}: `;
		const at = body.lastIndexOf(needle);
		if (at >= 0 && (!best || at > best.at)) best = { at, label, len: needle.length };
	}
	if (!best) return { intro: body.trim(), quote: null };
	const text = body.slice(best.at + best.len).trim();
	if (!text) return { intro: body.trim(), quote: null };
	return { intro: body.slice(0, best.at).trim(), quote: { label: best.label, text } };
}

const decisionOf = (input: KindInput): 'pass' | 'fail' | null => {
	const d = str(input.payload, 'decision');
	if (d === 'pass' || d === 'fail') return d;
	if (str(input.payload, 'exam') === 'failed') return 'fail';
	return null;
};

export const GENERIC_RULE: KindRule = {
	eyebrow: 'IDEA Certifications',
	tone: () => 'green',
	cta: 'Open it',
	subject: (i) => withCode(i.payload, i.title),
	facts: () => [],
	quoteLabels: ['Feedback', 'Note', 'Reason']
};

export const KIND_RULES: Record<NotificationKind, KindRule> = {
	part_checked: {
		eyebrow: 'Checked off',
		tone: () => 'green',
		cta: 'Keep going',
		subject: (i) => {
			const part = str(i.payload, 'part');
			return withCode(i.payload, part ? `${partWord(part)} checked off` : i.title);
		},
		facts: (i) =>
			present([
				fact('Part', partWord(str(i.payload, 'part'))),
				fact('Certification', str(i.payload, 'code')),
				fact('Next up', str(i.payload, 'next_part') ? partWord(str(i.payload, 'next_part')) : '')
			]),
		quoteLabels: []
	},
	review_returned: {
		eyebrow: 'Review returned',
		tone: (i) => (decisionOf(i) === 'fail' ? 'warn' : 'green'),
		cta: 'Open the certification',
		subject: (i) => withCode(i.payload, i.title),
		facts: (i) => {
			const decision = decisionOf(i);
			const exam = str(i.payload, 'exam') === 'failed';
			return present([
				fact('Decision', decision === 'pass' ? 'Passed' : decision === 'fail' ? 'Not yet' : ''),
				fact('Part', exam ? 'Exam' : partWord(str(i.payload, 'part'))),
				fact('Certification', str(i.payload, 'code')),
				fact('Topics to study', strList(i.payload, 'missed_topics').join(', ')),
				fact('Exam again on', formatCertDate(str(i.payload, 'cooldown_until') || null))
			]);
		},
		quoteLabels: ['Feedback']
	},
	sitting_approved: {
		eyebrow: 'Exam sitting',
		tone: () => 'green',
		cta: 'Open the certification',
		subject: (i) => withCode(i.payload, 'exam sitting approved'),
		facts: (i) =>
			present([fact('Date and time', dateTimeWords(str(i.payload, 'scheduled_at') || null)), fact('Certification', str(i.payload, 'code'))]),
		quoteLabels: ['Note']
	},
	sitting_declined: {
		eyebrow: 'Exam sitting',
		tone: () => 'warn',
		cta: 'Open the certification',
		subject: (i) => (i.payload.cancelled === true ? 'Exam window cancelled' : withCode(i.payload, 'exam sitting declined')),
		facts: (i) => present([fact('Certification', str(i.payload, 'code'))]),
		quoteLabels: ['Note']
	},
	cooldown_ended: {
		eyebrow: 'Cooldown over',
		tone: () => 'green',
		cta: 'Open the certification',
		subject: (i) => withCode(i.payload, 'you can take the exam again'),
		facts: (i) =>
			present([
				fact('Date', formatCertDate(str(i.payload, 'cooldown_until') || str(i.payload, 'date') || str(i.payload, 'at') || null)),
				fact('Certification', str(i.payload, 'code'))
			]),
		quoteLabels: []
	},
	awarded: {
		eyebrow: 'Awarded',
		tone: () => 'green',
		cta: 'Open your certificate',
		subject: (i) => {
			const serial = str(i.payload, 'serial');
			return withCode(i.payload, serial ? `awarded, serial ${serial}` : 'awarded');
		},
		facts: (i) => {
			const name = titleAfterColon(i.title);
			const code = str(i.payload, 'code');
			const verify = str(i.payload, 'verify_url');
			return present([
				fact('Serial', str(i.payload, 'serial')),
				fact('Certification', name && code ? `${name} (${code})` : name || code),
				fact('Level', str(i.payload, 'level')),
				fact('Awarded on', formatCertDate(str(i.payload, 'awarded_at') || null)),
				fact('Valid through', formatCertDate(str(i.payload, 'expires_at') || null)),
				verify ? fact('Verify', `Anyone can verify it at ${verify}`, verify) : null
			]);
		},
		quoteLabels: []
	},
	suspended: {
		eyebrow: 'Suspended',
		tone: () => 'bad',
		cta: 'Open my certifications',
		subject: (i) => withCode(i.payload, 'certification suspended'),
		facts: (i) => present([fact('Serial', str(i.payload, 'serial')), fact('Certification', str(i.payload, 'code'))]),
		quoteLabels: ['Reason', 'Note']
	},
	reinstated: {
		eyebrow: 'Reinstated',
		tone: () => 'green',
		cta: 'Open my certifications',
		subject: (i) => withCode(i.payload, 'certification reinstated'),
		facts: (i) => present([fact('Serial', str(i.payload, 'serial')), fact('Certification', str(i.payload, 'code'))]),
		quoteLabels: ['Note', 'Reason']
	},
	revoked: {
		eyebrow: 'Revoked',
		tone: () => 'bad',
		cta: 'Open my certifications',
		subject: (i) => withCode(i.payload, 'certification revoked'),
		facts: (i) => present([fact('Serial', str(i.payload, 'serial')), fact('Certification', str(i.payload, 'code'))]),
		quoteLabels: ['Reason', 'Note']
	},
	expiring: {
		eyebrow: 'Expiring soon',
		tone: () => 'warn',
		cta: 'Renew it',
		subject: (i) => {
			const date = formatCertDate(str(i.payload, 'expires_at') || null);
			return withCode(i.payload, date ? `expires ${date}` : 'expiring soon');
		},
		facts: (i) =>
			present([
				fact('Expires', formatCertDate(str(i.payload, 'expires_at') || null)),
				fact('Serial', str(i.payload, 'serial')),
				fact('To renew', 'Start it again from the catalog. The same steps apply, and the expired award stays in your history.')
			]),
		quoteLabels: []
	},
	queue_submission: {
		eyebrow: 'Review queue',
		tone: () => 'green',
		cta: 'Open the desk',
		subject: (i) => {
			const part = str(i.payload, 'part');
			return withCode(i.payload, part ? `${partWord(part)} to review` : 'new submission to review');
		},
		facts: (i) => {
			const code = str(i.payload, 'code');
			const name = certFromBody(i.body);
			return present([
				fact('Student', str(i.payload, 'student_name') || studentFromBody(i.body)),
				fact('Certification', name && code ? `${name} (${code})` : name || code),
				fact('Part', partWord(str(i.payload, 'part')))
			]);
		},
		quoteLabels: []
	},
	queue_request: {
		eyebrow: 'Sitting request',
		tone: () => 'green',
		cta: 'Open the desk',
		subject: (i) => withCode(i.payload, 'exam sitting requested'),
		facts: (i) => {
			const code = str(i.payload, 'code');
			const name = certFromBody(i.body);
			return present([
				fact('Student', str(i.payload, 'student_name') || studentFromBody(i.body)),
				fact('Certification', name && code ? `${name} (${code})` : name || code)
			]);
		},
		quoteLabels: ['Note']
	}
};

export function ruleFor(kind: string): KindRule {
	return Object.prototype.hasOwnProperty.call(KIND_RULES, kind) ? KIND_RULES[kind as NotificationKind] : GENERIC_RULE;
}

/** Under `SUBJECT_MAX`, cut at a word; never an em dash; one line. */
export function clampSubject(subject: string): string {
	let s = subject.replace(/\s+/g, ' ').replace(/—/g, ',').trim();
	if (s.length <= SUBJECT_MAX) return s;
	s = s.slice(0, SUBJECT_MAX);
	const cut = s.lastIndexOf(' ');
	return (cut > 24 ? s.slice(0, cut) : s).replace(/[\s,:;]+$/, '');
}
