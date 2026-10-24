/**
 * THE ROLE PORTAL (`/coin-balance/role`, IDEA Coin V2 2.5, migration 0247).
 * PLAIN DATA + pure helpers, client-safe.
 *
 * A class role is an evidence job now: each class day the holder takes a
 * start photo and an end photo of the same spot, live, in the portal. The
 * TIME IS THE SERVER'S, taken the moment the photo is recorded, never from
 * the photo's own metadata. A day passes on its own when the rules pass, and
 * any day can be accepted or rejected by hand. Pay is 1 coin a week, paid
 * every two weeks, for the days proven; a missed day only takes that day off.
 */

import type { CoinRequestStatus } from '$lib/coin-balance';
import { coinDay } from './extras';

function num(v: unknown, fallback = 0): number {
	const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
	return Number.isFinite(n) ? n : fallback;
}
function str(v: unknown): string {
	return typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v);
}
function strOrNull(v: unknown): string | null {
	const s = str(v).trim();
	return s ? s : null;
}
function obj(v: unknown): Record<string, unknown> {
	return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
function arr(v: unknown): unknown[] {
	return Array.isArray(v) ? v : [];
}

export type CoinRoleDayStatus = 'passed' | 'failed' | 'accepted' | 'rejected' | 'none';

export interface CoinRolePhoto {
	path: string;
	taken_at: string | null;
	/** A signed URL the route minted, or null. */
	url: string | null;
}

export interface CoinRoleDay {
	day: string;
	photos: number;
	gap_minutes: number | null;
	rules_pass: boolean;
	/** 'no_photos' | 'too_few_photos' | 'outside_window' | 'gap_too_short' | null. */
	reason: string | null;
	override: 'accepted' | 'rejected' | null;
	valid: boolean;
	status: CoinRoleDayStatus;
	class_day: boolean;
	photo_paths: CoinRolePhoto[];
	/** A check this student already asked for and its state, when known. */
	exception?: CoinRequestStatus | null;
}

export interface CoinRoleRules {
	min_gap_minutes: number;
	photos_per_day: number;
	window_start: string;
	window_end: string;
}

export interface CoinRole {
	holder_id: string;
	role_id: string;
	role: string;
	section: string | null;
	since: string | null;
	expires_at: string | null;
	instructions: string | null;
	rules: CoinRoleRules;
	today: string;
	class_today: boolean;
	days: CoinRoleDay[];
}

const STATUSES: CoinRoleDayStatus[] = ['passed', 'failed', 'accepted', 'rejected', 'none'];

/**
 * `coin_my_role()`'s jsonb. NULL for a signed-out answer. The route may have
 * added a signed `url` beside each photo `path`; a photo given as a bare
 * string (an older shape) is read as a path.
 */
export function parseMyRole(raw: unknown): CoinRole[] | null {
	const r = obj(raw);
	if (r.signed_in !== true) return null;
	return arr(r.roles)
		.map((x) => {
			const o = obj(x);
			const rules = obj(o.rules);
			return {
				holder_id: str(o.holder_id),
				role_id: str(o.role_id),
				role: str(o.role).trim() || 'Class role',
				section: strOrNull(o.section),
				since: strOrNull(o.since),
				expires_at: strOrNull(o.expires_at),
				instructions: strOrNull(o.instructions),
				rules: {
					min_gap_minutes: Math.max(0, num(rules.min_gap_minutes, 45)),
					photos_per_day: Math.max(2, Math.trunc(num(rules.photos_per_day, 2))),
					window_start: strOrNull(rules.window_start) ?? '07:00',
					window_end: strOrNull(rules.window_end) ?? '16:00'
				},
				today: str(o.today).slice(0, 10),
				class_today: o.class_today === true,
				days: arr(o.days)
					.map((d) => {
						const dd = obj(d);
						const st = str(dd.status) as CoinRoleDayStatus;
						const ov = str(dd.override);
						return {
							day: str(dd.day).slice(0, 10),
							photos: Math.max(0, Math.trunc(num(dd.photos))),
							gap_minutes: dd.gap_minutes === null || dd.gap_minutes === undefined ? null : num(dd.gap_minutes),
							rules_pass: dd.rules_pass === true,
							reason: strOrNull(dd.reason),
							override: (ov === 'accepted' || ov === 'rejected' ? ov : null) as CoinRoleDay['override'],
							valid: dd.valid === true,
							status: STATUSES.includes(st) ? st : 'none',
							class_day: dd.class_day !== false,
							photo_paths: arr(dd.photo_paths)
								.map((p) => {
									if (typeof p === 'string') return { path: p, taken_at: null, url: null };
									const po = obj(p);
									return { path: str(po.path), taken_at: strOrNull(po.taken_at), url: strOrNull(po.url) };
								})
								.filter((p) => p.path)
						};
					})
					.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.day))
			};
		})
		.filter((x) => x.holder_id);
}

/** "7:00 AM" from "07:00". */
export function clockWords(hhmm: string): string {
	const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
	if (!m) return hhmm;
	const h = Number(m[1]);
	const ap = h >= 12 ? 'PM' : 'AM';
	const h12 = h % 12 === 0 ? 12 : h % 12;
	return `${h12}:${m[2]} ${ap}`;
}

/** The rules, in words, the way the server applies them. */
export function roleRulesWords(r: CoinRoleRules): string {
	const n = r.photos_per_day;
	return `Take ${n === 2 ? 'a start photo and an end photo' : `at least ${n} photos`} of the same spot, the last at least ${r.min_gap_minutes} minutes after the first, all between ${clockWords(r.window_start)} and ${clockWords(r.window_end)} on the same day.`;
}

const REASONS: Record<string, string> = {
	no_photos: 'no photos',
	too_few_photos: 'not enough photos',
	outside_window: 'a photo was outside the time window',
	gap_too_short: 'the photos were too close together'
};

/** One day's state in words. */
export function roleDayWords(d: CoinRoleDay, rules: CoinRoleRules): string {
	if (!d.class_day && d.status === 'none') return 'Not a class day';
	switch (d.status) {
		case 'passed':
			return 'Passed';
		case 'accepted':
			return 'Accepted by your teacher';
		case 'rejected':
			return 'Rejected by your teacher';
		case 'none':
			return 'No photos';
		case 'failed': {
			let why = REASONS[d.reason ?? ''] ?? 'the photos did not meet the rules';
			if (d.reason === 'too_few_photos') why += ` (${d.photos} of ${rules.photos_per_day})`;
			if (d.reason === 'gap_too_short' && d.gap_minutes !== null) {
				why += ` (${d.gap_minutes} minutes apart, ${rules.min_gap_minutes} needed)`;
			}
			return `Failed: ${why}`;
		}
	}
}

/** The tone a day reads in, beside its words (never the only signal). */
export function roleDayTone(d: CoinRoleDay): 'good' | 'bad' | 'none' {
	if (d.status === 'passed' || d.status === 'accepted') return 'good';
	if (d.status === 'failed' || d.status === 'rejected') return 'bad';
	return 'none';
}

/** The days, newest first, as the portal lists them. */
export function roleDaysNewestFirst(days: readonly CoinRoleDay[]): CoinRoleDay[] {
	return [...days].sort((a, b) => b.day.localeCompare(a.day));
}

/** Today's row, if the payload has one. */
export function roleToday(role: CoinRole): CoinRoleDay | null {
	return role.days.find((d) => d.day === role.today) ?? null;
}

/**
 * A failed day may be sent for a check by hand, once it is over: today can
 * still be finished with the next photo.
 */
export function roleDayCheckable(d: CoinRoleDay, today: string): boolean {
	return d.status === 'failed' && d.day < today;
}

export function roleCaptureRefusalWords(r: { reason: string; data?: Record<string, unknown> }): string {
	switch (r.reason) {
		case 'not_your_role':
			return 'That role is not yours any more. Reload the page.';
		case 'no_upload':
			return 'The photo did not finish uploading. Take it again.';
		case 'outside_window': {
			const rules = obj(r.data?.rules);
			const s = strOrNull(rules.window_start);
			const e = strOrNull(rules.window_end);
			return s && e
				? `Photos count only between ${clockWords(s)} and ${clockWords(e)}. Take it inside that window.`
				: 'Photos count only inside the time window. Take it then.';
		}
		case 'too_many_today':
			return 'That is the most photos one day can hold. Today is already recorded.';
		case 'signed_out':
			return 'You are signed out. Sign in again, then try once more.';
		case 'staff_account':
			return 'This is a student action. A staff account has no coins of its own to spend here.';
		case 'not_in_economy':
			return 'None of your classes is using IDEA Coins right now, so roles are closed.';
		case 'rate_limited':
			return 'That is a lot in one minute. Wait a minute, then try again.';
		case 'not_available':
			return 'The role portal is switched off right now.';
		default:
			return 'That did not go through. Try again in a minute.';
	}
}

export function roleExceptionRefusalWords(r: { reason: string }): string {
	switch (r.reason) {
		case 'not_your_role':
			return 'That role is not yours any more. Reload the page.';
		case 'day':
			return 'Only a day in the last 30 days can be checked.';
		case 'note_required':
			return 'Say what happened that day, in 1000 characters or fewer.';
		case 'already_pending':
			return 'You already asked for this day to be checked. It is waiting for your teacher.';
		case 'signed_out':
			return 'You are signed out. Sign in again, then try once more.';
		case 'rate_limited':
			return 'That is a lot in one minute. Wait a minute, then try again.';
		default:
			return 'That did not go through. Try again in a minute.';
	}
}

/** "Oct 14" for a day row. */
export function roleDayLabel(day: string): string {
	return coinDay(day);
}
