/**
 * IDEA COIN ROLES ON THE COIN DESK (IDEA Coin V2 session two, 0247): Shop
 * Steward, Quartermaster, Safety Officer, Lab Tech, as EVIDENCE JOBS. Plain
 * types and pure helpers (client-safe, the coin-desk.ts convention); this
 * module never talks to Supabase.
 *
 * WHAT CHANGED. A role's class is an IDEA Classroom section, never a coin
 * section. Each class has, per role, a CAP (default 1) and an on/off switch.
 * A holder proves each class day with a start photo and an end photo, timed
 * by the server; a day passes on its own when the rules pass, and any day can
 * be accepted or rejected by hand. The stipend PAYS ITSELF: autopay, every two
 * weeks, one stipend a week prorated by the proven days. A manual payment by
 * hand stays as an override.
 *
 * The one read is `coin_roles_admin()`; every write is its own RPC, made by
 * RolesManager through `callV2`.
 */

export interface RoleDefinition {
	id: string;
	name: string;
	description: string | null;
	active: boolean;
	suggested_duration_days: number | null;
	instructions: string | null;
}

export interface ClassRoleSetting {
	role_id: string;
	cap: number;
	enabled: boolean;
	held: number;
}

export interface RoleClass {
	id: string;
	label: string;
	roles: ClassRoleSetting[] | null;
}

export type QuizQuestionType = 'mc' | 'written';

export interface ApplicationAnswer {
	question: string;
	type: QuizQuestionType;
	options: string[] | null;
	written_answer: string | null;
	selected_option_index: number | null;
	is_correct: boolean | null;
}

export interface RoleApplication {
	id: string;
	email: string;
	name: string | null;
	role_id: string;
	role: string;
	section_id: string | null;
	section: string | null;
	submitted_at: string;
	answers: ApplicationAnswer[];
}

export interface HolderRules {
	min_gap_minutes: number;
	photos_per_day: number;
	window_start: string;
	window_end: string;
	/** True when this holder has rules of their own. */
	own: boolean;
}

export type RoleDayStatus = 'accepted' | 'rejected' | 'passed' | 'failed' | 'none';

export interface RoleDay {
	day: string;
	photos: number;
	gap_minutes: number | null;
	rules_pass: boolean;
	reason: string | null;
	override: 'accepted' | 'rejected' | null;
	valid: boolean;
	status: RoleDayStatus;
	class_day: boolean;
	photo_paths: { path: string; taken_at: string }[];
}

export interface RoleHolder {
	id: string;
	email: string;
	name: string | null;
	role_id: string;
	role: string;
	section_id: string | null;
	section: string | null;
	since: string;
	expires_at: string | null;
	rules: HolderRules;
	days: RoleDay[];
}

export interface RolesAdmin {
	roles: RoleDefinition[];
	classes: RoleClass[];
	applications: RoleApplication[];
	holders: RoleHolder[];
}

/** A question as `coin_role_admin_list_role_questions` returns it (0076). */
export interface RoleQuizQuestion {
	id: string;
	role_id: string;
	type: QuizQuestionType;
	question_text: string;
	sequence: number;
	options: string[] | null;
	correct_option_index: number | null;
}

export function personName(p: { email: string; name: string | null }): string {
	return p.name?.trim() || p.email;
}

/** A class's setting for one role. No row reads as on, cap 1 (0247). */
export function classRoleSetting(c: RoleClass, roleId: string): ClassRoleSetting {
	return c.roles?.find((r) => r.role_id === roleId) ?? { role_id: roleId, cap: 1, enabled: true, held: 0 };
}

export const ROLE_DAY_STATUS_WORDS: Record<RoleDayStatus, string> = {
	accepted: 'Accepted by hand',
	rejected: 'Rejected by hand',
	passed: 'Proven',
	failed: 'Not proven',
	none: 'No photos'
};

export const ROLE_DAY_REASON_WORDS: Record<string, string> = {
	no_photos: 'no photos',
	too_few_photos: 'too few photos',
	outside_window: 'a photo outside the time window',
	gap_too_short: 'the photos were too close together'
};

/** One day as a line: the status word, then why, photos and the gap. */
export function roleDayDetail(d: RoleDay): string {
	const parts: string[] = [];
	parts.push(`${d.photos} photo${d.photos === 1 ? '' : 's'}`);
	if (d.gap_minutes != null) parts.push(`${d.gap_minutes} min apart`);
	if (d.status === 'failed' && d.reason) parts.push(ROLE_DAY_REASON_WORDS[d.reason] ?? d.reason);
	if (d.override && !d.rules_pass && d.reason && d.reason !== 'no_photos') {
		parts.push(`the rules alone: ${ROLE_DAY_REASON_WORDS[d.reason] ?? d.reason}`);
	}
	return parts.join(', ');
}

/**
 * The days worth showing: a class day, a day with a photo, or a day decided
 * by hand. A weekend nobody worked is not a missed day and is not drawn.
 * Newest first, because the last few days are what a reviewer checks.
 */
export function shownRoleDays(days: RoleDay[]): RoleDay[] {
	return days.filter((d) => d.class_day || d.photos > 0 || d.override !== null).reverse();
}

export function proofSummary(days: RoleDay[]): string {
	const classDays = days.filter((d) => d.class_day);
	const valid = classDays.filter((d) => d.valid).length;
	return `${valid} of ${classDays.length} class day${classDays.length === 1 ? '' : 's'} proven in the last two weeks`;
}

/** `coin_role_admin_review`'s structured refusals, in words. */
export function reviewRefusal(r: { reason?: string; cap?: number; held?: number }): string {
	switch (r.reason) {
		case 'ratio_cap_reached':
			return `This class is full for that role: ${r.held ?? '?'} of ${r.cap ?? '?'} seats are held. Raise the class's cap below, or free a seat, then accept again.`;
		case 'no_class':
			return 'This application has no class yet. Set its class, then accept it.';
		case 'already_holds_role':
			return 'This student already holds that role.';
		default:
			return r.reason ? `Refused: ${r.reason}.` : 'Refused by the server.';
	}
}

export function applyRefusal(reason: string | undefined): string {
	switch (reason) {
		case 'unknown_role':
			return 'That role is not open any more.';
		case 'no_section':
			return 'That student is in no class with the coin economy on, so there is no class to apply in.';
		default:
			return reason ? `Refused: ${reason}.` : 'Refused by the server.';
	}
}

export function stipendRefusal(reason: string | undefined): string {
	if (reason === 'note_required') return 'A note is needed: say why the stipend is paid by hand.';
	return reason ? `Refused: ${reason}.` : 'Refused by the server.';
}

// --- a holder's own rules ------------------------------------------------------

export interface RulesDraft {
	min_gap_minutes: string;
	photos_per_day: string;
	window_start: string;
	window_end: string;
}

export function rulesDraft(r: HolderRules): RulesDraft {
	return {
		min_gap_minutes: String(r.min_gap_minutes),
		photos_per_day: String(r.photos_per_day),
		window_start: r.window_start,
		window_end: r.window_end
	};
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 0245's `_coin_setting_ok` ranges for the four keys, in words, or null. */
export function rulesProblem(d: RulesDraft): string | null {
	const gap = Number(d.min_gap_minutes);
	if (!d.min_gap_minutes.trim() || !Number.isFinite(gap) || gap < 0 || gap > 600) {
		return 'The gap between photos is minutes from 0 to 600.';
	}
	const n = Number(d.photos_per_day);
	if (!Number.isInteger(n) || n < 2 || n > 10) return 'Photos a day is a whole number from 2 to 10.';
	if (!HHMM.test(d.window_start) || !HHMM.test(d.window_end)) return 'Both window times are needed, like 07:00.';
	if (d.window_end <= d.window_start) return 'The window has to end after it starts.';
	return null;
}

/** The jsonb `coin_role_holder_rules_set` stores for a holder's own rules. */
export function rulesPayload(d: RulesDraft): Record<string, unknown> {
	return {
		min_gap_minutes: Number(d.min_gap_minutes),
		photos_per_day: Number(d.photos_per_day),
		window_start: d.window_start,
		window_end: d.window_end
	};
}

// --- dates ----------------------------------------------------------------------

/**
 * A YYYY-MM-DD date `role.suggested_duration_days` days from `from`, or null
 * when the role suggests none. A form pre-fill only.
 */
export function suggestedExpirationDate(
	role: Pick<RoleDefinition, 'suggested_duration_days'> | undefined,
	from: Date = new Date()
): string | null {
	if (!role?.suggested_duration_days) return null;
	const d = new Date(from);
	d.setDate(d.getDate() + role.suggested_duration_days);
	return d.toISOString().slice(0, 10);
}

/** A date input's value as an end-of-day timestamp, or null for "no expiration". */
export function dateInputToExpiresAt(value: string): string | null {
	const trimmed = value.trim();
	if (!trimmed) return null;
	const d = new Date(`${trimmed}T23:59:59`);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** A stored timestamp as a date input's value. */
export function expiresAtToDateInput(value: string | null): string {
	if (!value) return '';
	const d = new Date(value);
	return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA');
}

/**
 * Whether every question has a usable answer: written text, or a picked
 * option. A role with no questions passes; there is nothing to answer.
 */
export function questionsAnswered(
	questions: RoleQuizQuestion[],
	answers: Record<string, { written?: string; selected?: number }>
): boolean {
	return questions.every((q) => {
		const a = answers[q.id];
		if (!a) return false;
		if (q.type === 'written') return !!a.written?.trim();
		return typeof a.selected === 'number';
	});
}

/** The answers `coin_role_apply` reads (0247's `_coin_role_insert_application`). */
export function applicationAnswers(
	questions: RoleQuizQuestion[],
	answers: Record<string, { written?: string; selected?: number }>
): Record<string, unknown>[] {
	return questions.map((q) =>
		q.type === 'written'
			? { question_id: q.id, written_answer: answers[q.id]?.written?.trim() ?? '' }
			: { question_id: q.id, selected_option_index: answers[q.id]?.selected ?? null }
	);
}
