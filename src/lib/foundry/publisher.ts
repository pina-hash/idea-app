/**
 * THE TRUSTED-PUBLISHER APPLICATION, ON THE CLIENT SIDE OF IT (report
 * 6d076258, ledger 0360).
 *
 * WHAT IT IS. A trusted publisher's app goes live the moment they submit it
 * (0173, decision 06): the allowlist `foundry_trusted_publishers`, written
 * only by `foundry_trusted_grant`. Until now an admin added names by hand. Mr.
 * Pina asked for an application a student fills in -- "some real questions,
 * maybe a trick question or two, just to make sure they're not trying to have
 * bad intentions" -- that he can approve or decline with one click each on the
 * review page, and whose questions he can edit there. Claude drafted the six
 * questions 0230 seeds; he edits them from the page.
 *
 * APPROVING ADDS NO NEW FLAG. `foundry_publisher_decide` calls the EXISTING
 * `foundry_trusted_grant`, so an approved applicant is on the same list, with
 * the same effect, as a name an admin typed in.
 *
 * WHAT A STUDENT NEVER SEES IS THE POINT OF THE TRICK. `is_trick`,
 * `flag_choices` and `reviewer_note` are projected only by the admin reads;
 * `foundry_publisher_status` (the student's) carries prompts, kinds and
 * choices and nothing else, and these types say so by having no field for
 * them on the student shape.
 *
 * PURE, CLIENT-SAFE, NO SVELTE. The predicates here are what BOTH the control
 * and its handler ask, so a button cannot be offered for a payload the
 * database will refuse, and every limit is pinned against 0230's text by a
 * test (whenever the migration is in the tree) so the two cannot drift.
 */

import { FOUNDRY_SITE_OFF_LEAD } from './access.ts';

export type FoundryPublisherKind = 'text' | 'choice';

/** One question as a STUDENT reads it. No trick flag, no flagged answers, no note. */
export interface FoundryPublisherQuestion {
	id: string;
	position: number;
	prompt: string;
	kind: FoundryPublisherKind;
	choices: string[];
}

/** One question as an ADMIN edits it, from `foundry_publisher_questions_admin`. */
export interface FoundryPublisherQuestionAdmin extends FoundryPublisherQuestion {
	flag_choices: string[];
	is_trick: boolean;
	reviewer_note: string | null;
	active: boolean;
	updated_at: string;
	updated_by: string | null;
}

export type FoundryPublisherApplicationStatus = 'pending' | 'approved' | 'declined';

/** The caller's own latest application, as `foundry_publisher_status` returns it. */
export interface FoundryPublisherOwnApplication {
	id: string;
	status: FoundryPublisherApplicationStatus;
	submitted_at: string;
	decided_at: string | null;
	decision_note: string | null;
}

/** `foundry_publisher_status()`, the student's read. No identity parameter. */
export interface FoundryPublisherStatus {
	ok: true;
	eligible: boolean;
	trusted: boolean;
	questions: FoundryPublisherQuestion[];
	application: FoundryPublisherOwnApplication | null;
	cooldown_until: string | null;
}

/**
 * ONE ANSWER AS IT WAS GIVEN: a SNAPSHOT of the question at the moment of
 * applying, so editing a question later never rewrites what somebody answered.
 */
export interface FoundryPublisherAnswer {
	question_id: string;
	position: number;
	prompt: string;
	kind: FoundryPublisherKind;
	answer: string;
	is_trick: boolean;
	flagged: boolean;
	reviewer_note: string | null;
}

/** One application as an ADMIN reads it, `foundry_publisher_applications`. */
export interface FoundryPublisherApplication {
	id: string;
	applicant: string;
	applicant_email: string;
	applicant_display_name: string | null;
	applicant_full_name: string | null;
	status: FoundryPublisherApplicationStatus;
	submitted_at: string;
	decided_at: string | null;
	decided_by: string | null;
	decision_note: string | null;
	trusted_now: boolean;
	flagged_count: number;
	answers: FoundryPublisherAnswer[];
}

/** A question in the editor, before it is saved. `id` null is a new one. */
export interface FoundryPublisherQuestionDraft {
	id: string | null;
	prompt: string;
	kind: FoundryPublisherKind;
	choices: string[];
	flag_choices: string[];
	is_trick: boolean;
	reviewer_note: string | null;
}

/* -------------------------------------------------------------------------
 * THE LIMITS. Each is 0230's own number, and `tests/foundry-publisher.test.ts`
 * reads the migration text to hold them equal once the file is in the tree.
 * ---------------------------------------------------------------------- */
export const PUBLISHER_ANSWER_MAX = 2000;
export const PUBLISHER_COOLDOWN_DAYS = 7;
export const PUBLISHER_NOTE_MAX = 300;
export const PUBLISHER_PROMPT_MAX = 500;
export const PUBLISHER_REVIEWER_NOTE_MAX = 500;
export const PUBLISHER_CHOICE_MAX = 120;
export const PUBLISHER_CHOICES_MIN = 2;
export const PUBLISHER_CHOICES_MAX = 6;
export const PUBLISHER_QUESTIONS_MAX = 10;

/**
 * `_foundry_norm`, mirrored: leading and trailing whitespace off, nothing
 * else. NOT `trim()` on its own terms but the same regex 0130 uses, so a
 * value the client calls blank is one the database calls blank.
 */
export function publisherNorm(value: string | null | undefined): string {
	return (value ?? '').replace(/^\s+|\s+$/g, '');
}

/** Characters as Postgres `char_length` counts them: code points, not UTF-16 units. */
export function publisherLength(value: string): number {
	return [...value].length;
}

export type PublisherSendVerdict =
	| { ok: true }
	| { ok: false; reason: 'no_questions' | 'incomplete' | 'too_long' | 'bad_choice'; questionId?: string };

/**
 * MAY THIS APPLICATION BE SENT. The button's `aria-disabled` and the handler
 * both ask THIS, so a press that does nothing cannot happen (the two spellings
 * of "is this ready" problem `reviewCanSend` already solved for the queue).
 * Every question needs an answer; a choice answer must be one of its choices;
 * a text answer must be within the limit. It mirrors `foundry_publisher_apply`'s
 * own refusals, in the same order.
 */
export function publisherCanSend(
	questions: readonly FoundryPublisherQuestion[],
	answers: Readonly<Record<string, string | undefined>>
): PublisherSendVerdict {
	if (questions.length === 0) return { ok: false, reason: 'no_questions' };
	// THREE PASSES, IN 0230's ORDER: the first blank answer, then the first
	// over-long one, then the first choice that is not on offer. So the sentence
	// beside the button names the same question the database would.
	for (const q of questions) {
		if (!publisherNorm(answers[q.id])) return { ok: false, reason: 'incomplete', questionId: q.id };
	}
	for (const q of questions) {
		if (publisherLength(publisherNorm(answers[q.id])) > PUBLISHER_ANSWER_MAX) {
			return { ok: false, reason: 'too_long', questionId: q.id };
		}
	}
	for (const q of questions) {
		if (q.kind === 'choice' && !q.choices.includes(publisherNorm(answers[q.id]))) {
			return { ok: false, reason: 'bad_choice', questionId: q.id };
		}
	}
	return { ok: true };
}

/** The answers as the RPC takes them: `{ "<question id>": "answer" }`, normalized. */
export function publisherAnswersPayload(
	questions: readonly FoundryPublisherQuestion[],
	answers: Readonly<Record<string, string | undefined>>
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const q of questions) out[q.id] = publisherNorm(answers[q.id]);
	return out;
}

/** A date a student reads, in the school's own day. Never a weekday (`formatDue`'s rule). */
export function publisherDay(iso: string | null | undefined): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleDateString('en-US', {
		month: 'long',
		day: 'numeric',
		year: 'numeric',
		timeZone: 'America/Los_Angeles'
	});
}

/**
 * EVERY REFUSAL `foundry_publisher_apply` AND `foundry_publisher_decide` CAN
 * GIVE, AS A SENTENCE A STUDENT OR AN ADMIN CAN ACT ON. NO EM DASHES. An
 * unknown reason gets a sentence too rather than an empty refusal.
 */
export function publisherRefusalSentence(
	reason: string | null | undefined,
	extra: { until?: string | null; limit?: number | null } = {}
): string {
	switch (reason) {
		case 'not_eligible':
			return 'Only a Bosco Tech account can apply to publish without review.';
		case 'already_trusted':
			return 'You are already a trusted publisher, so your apps go live as soon as you submit them.';
		case 'pending':
			return 'Your application is already waiting for a decision. You can apply again after it is decided.';
		case 'cooldown': {
			const day = publisherDay(extra.until ?? null);
			return day
				? `Your last application was declined less than ${PUBLISHER_COOLDOWN_DAYS} days ago. You can apply again on ${day}.`
				: `Your last application was declined less than ${PUBLISHER_COOLDOWN_DAYS} days ago, so you cannot apply again yet.`;
		}
		case 'incomplete':
			return 'Every question needs an answer before you send it.';
		case 'too_long':
			return `One answer is longer than ${extra.limit ?? PUBLISHER_ANSWER_MAX} characters. Shorten it and send it again.`;
		case 'bad_choice':
			return 'One answer is not one of the choices offered. Reload the page and choose again.';
		case 'no_questions':
			return 'There are no questions to answer right now, so applications are closed for the moment.';
		case 'foundry_off':
			return FOUNDRY_SITE_OFF_LEAD;
		case 'not_found':
			return 'That application is not there any more. Reload the page.';
		case 'already_decided':
			return 'That application was already decided, perhaps in another tab. Reload the page.';
		default:
			return 'That did not go through. Try again.';
	}
}

/**
 * THE STATE A STUDENT IS IN, AS ONE WORD THE PAGE BRANCHES ON. In order: not
 * eligible, already trusted, waiting, declined and cooling down, declined and
 * free to try again, never applied. `approved` lands in `trusted` because the
 * approval writes the allowlist.
 */
export type PublisherStanding =
	| 'not_eligible'
	| 'trusted'
	| 'pending'
	| 'cooldown'
	| 'declined'
	| 'open';

export function publisherStanding(
	status: FoundryPublisherStatus,
	now: Date
): PublisherStanding {
	if (!status.eligible) return 'not_eligible';
	if (status.trusted) return 'trusted';
	if (status.application?.status === 'pending') return 'pending';
	if (status.cooldown_until && new Date(status.cooldown_until).getTime() > now.getTime()) {
		return 'cooldown';
	}
	if (status.application?.status === 'declined') return 'declined';
	return 'open';
}

export type PublisherQuestionsVerdict =
	| { ok: true }
	| { ok: false; index: number; message: string };

/**
 * THE EDITOR'S CHECKS, MIRRORING `foundry_publisher_set_questions` SO SAVE IS
 * NEVER OFFERED FOR A SET THE DATABASE REFUSES. The database still checks;
 * this is so the person editing reads the problem beside the question rather
 * than after a round trip. `index` is zero-based; the message names the
 * question by its number.
 */
export function publisherQuestionsValid(
	list: readonly FoundryPublisherQuestionDraft[]
): PublisherQuestionsVerdict {
	if (list.length === 0) {
		return { ok: false, index: -1, message: 'Keep at least one question.' };
	}
	if (list.length > PUBLISHER_QUESTIONS_MAX) {
		return {
			ok: false,
			index: PUBLISHER_QUESTIONS_MAX,
			message: `Keep it to ${PUBLISHER_QUESTIONS_MAX} questions or fewer.`
		};
	}
	for (let i = 0; i < list.length; i++) {
		const q = list[i]!;
		const n = i + 1;
		const prompt = publisherNorm(q.prompt);
		if (!prompt) return { ok: false, index: i, message: `Question ${n} needs some words.` };
		if (publisherLength(prompt) > PUBLISHER_PROMPT_MAX) {
			return {
				ok: false,
				index: i,
				message: `Question ${n} is longer than ${PUBLISHER_PROMPT_MAX} characters.`
			};
		}
		if (q.kind !== 'text' && q.kind !== 'choice') {
			return { ok: false, index: i, message: `Question ${n} needs a kind.` };
		}
		// A blank line in the editor's one-choice-per-line box is not a choice:
		// the payload drops it too, so the two agree about what will be sent.
		const choices = q.choices.map(publisherNorm).filter((c) => c !== '');
		if (q.kind === 'text') {
			if (choices.some((c) => c !== '')) {
				return {
					ok: false,
					index: i,
					message: `Question ${n} is a written answer, so it cannot have choices.`
				};
			}
			if (q.flag_choices.length > 0) {
				return {
					ok: false,
					index: i,
					message: `Question ${n} is a written answer, so no choice can be marked as a red flag.`
				};
			}
		} else {
			if (choices.length < PUBLISHER_CHOICES_MIN || choices.length > PUBLISHER_CHOICES_MAX) {
				return {
					ok: false,
					index: i,
					message: `Question ${n} needs between ${PUBLISHER_CHOICES_MIN} and ${PUBLISHER_CHOICES_MAX} choices.`
				};
			}
			if (choices.some((c) => publisherLength(c) > PUBLISHER_CHOICE_MAX)) {
				return {
					ok: false,
					index: i,
					message: `A choice in question ${n} is longer than ${PUBLISHER_CHOICE_MAX} characters.`
				};
			}
			if (new Set(choices).size !== choices.length) {
				return { ok: false, index: i, message: `Question ${n} has the same choice twice.` };
			}
			const flags = q.flag_choices.map(publisherNorm);
			if (flags.some((f) => !choices.includes(f))) {
				return {
					ok: false,
					index: i,
					message: `A red-flag answer in question ${n} is not one of its choices.`
				};
			}
		}
		if (q.reviewer_note && publisherLength(publisherNorm(q.reviewer_note)) > PUBLISHER_REVIEWER_NOTE_MAX) {
			return {
				ok: false,
				index: i,
				message: `The note on question ${n} is longer than ${PUBLISHER_REVIEWER_NOTE_MAX} characters.`
			};
		}
	}
	return { ok: true };
}

/** The editor's list as the RPC takes it, normalized, in order. */
export function publisherQuestionsPayload(
	list: readonly FoundryPublisherQuestionDraft[]
): Record<string, unknown>[] {
	return list.map((q) => {
		const choices =
			q.kind === 'choice' ? q.choices.map(publisherNorm).filter((c) => c !== '') : [];
		return {
			id: q.id,
			prompt: publisherNorm(q.prompt),
			kind: q.kind,
			choices,
			flag_choices:
				q.kind === 'choice' ? q.flag_choices.map(publisherNorm).filter((f) => choices.includes(f)) : [],
			is_trick: q.is_trick,
			reviewer_note: publisherNorm(q.reviewer_note) || null
		};
	});
}

/** A loaded admin question as an editor draft. */
export function publisherDraftOf(q: FoundryPublisherQuestionAdmin): FoundryPublisherQuestionDraft {
	return {
		id: q.id,
		prompt: q.prompt,
		kind: q.kind,
		choices: [...q.choices],
		flag_choices: [...q.flag_choices],
		is_trick: q.is_trick,
		reviewer_note: q.reviewer_note
	};
}

/**
 * `foundry_publisher_pending_count()` as a number or NOTHING. Null for a
 * non-admin (the function's own answer), for a database without 0230
 * (PGRST202), and for any other failure: a count nobody could read is not a
 * count of zero.
 */
export function publisherPendingCount(
	raw: unknown,
	err: { code?: string | null } | null
): number | null {
	if (err) return null;
	if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
	return null;
}

/**
 * A READ THAT CAN BE MISSING. 0230 lands at nearly the same moment as the
 * client that calls it, so `PGRST202` -- the function genuinely not there --
 * is a real state, and the surface removes the feature and says why rather
 * than blanking the page. Any other error is a failure, reported as one.
 */
export type PublisherRead<T> =
	| { state: 'ready'; value: T }
	| { state: 'unavailable' }
	| { state: 'failed'; message: string };

export function publisherRead<T>(
	data: unknown,
	err: { code?: string | null; message?: string | null } | null
): PublisherRead<T> {
	if (err) {
		if (err.code === 'PGRST202') return { state: 'unavailable' };
		return { state: 'failed', message: err.message ?? 'That could not be read.' };
	}
	if (data === null || data === undefined) return { state: 'failed', message: 'That could not be read.' };
	return { state: 'ready', value: data as T };
}

/** What a surface says when 0230 is not on this deployment yet. */
export const PUBLISHER_UNAVAILABLE_NOTE =
	'Publisher applications are not switched on yet on this site. They arrive with the next database update.';
