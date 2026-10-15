/**
 * Derived readings every certification surface agrees on: what status an
 * award shows, whether a cooldown is in force, and how a date is written to a
 * student (America/Los_Angeles, no weekday, the school's calendar).
 */
import type { AwardShownStatus, AwardStoredStatus } from './types';

export const CERT_TIME_ZONE = 'America/Los_Angeles';

/**
 * The shown status from the stored one: `active` past its expiry reads
 * `expired`. The database's `_cert_award_status` is the same rule; a surface
 * that already has the shown status from a function uses that and never
 * recomputes it.
 */
export function awardShownStatus(
	stored: AwardStoredStatus,
	expiresAt: string | null,
	now: Date = new Date()
): AwardShownStatus {
	if (stored === 'revoked') return 'revoked';
	if (stored === 'suspended') return 'suspended';
	if (expiresAt && new Date(expiresAt).getTime() < now.getTime()) return 'expired';
	return 'valid';
}

export const STATUS_WORDS: Record<AwardShownStatus, string> = {
	valid: 'Valid',
	suspended: 'Suspended',
	revoked: 'Revoked',
	expired: 'Expired'
};

export function cooldownActive(cooldownUntil: string | null, now: Date = new Date()): boolean {
	return !!cooldownUntil && new Date(cooldownUntil).getTime() > now.getTime();
}

const dateFmt = new Intl.DateTimeFormat('en-US', {
	timeZone: CERT_TIME_ZONE,
	month: 'long',
	day: 'numeric',
	year: 'numeric'
});
const dateTimeFmt = new Intl.DateTimeFormat('en-US', {
	timeZone: CERT_TIME_ZONE,
	month: 'long',
	day: 'numeric',
	year: 'numeric',
	hour: 'numeric',
	minute: '2-digit'
});
const timeFmt = new Intl.DateTimeFormat('en-US', {
	timeZone: CERT_TIME_ZONE,
	hour: 'numeric',
	minute: '2-digit'
});

/** "October 15, 2026". Never a weekday. */
export function formatCertDate(at: string | Date | null | undefined): string {
	if (!at) return '';
	const d = typeof at === 'string' ? new Date(at) : at;
	if (Number.isNaN(d.getTime())) return '';
	return dateFmt.format(d);
}

/** "October 15, 2026 at 3:05 PM". */
export function formatCertDateTime(at: string | Date | null | undefined): string {
	if (!at) return '';
	const d = typeof at === 'string' ? new Date(at) : at;
	if (Number.isNaN(d.getTime())) return '';
	// Some ICU builds already write "October 22, 2026 at 3:15 PM" and some write
	// "October 22, 2026, 3:15 PM": the word is added only where it is missing,
	// so no build prints "at at" (ledger 0391, surface f found it on ICU 77).
	return dateTimeFmt.format(d).replace(/(\d{4}),? (?!at )/, '$1 at ');
}

/** "3:05 PM". */
export function formatCertTime(at: string | Date | null | undefined): string {
	if (!at) return '';
	const d = typeof at === 'string' ? new Date(at) : at;
	if (Number.isNaN(d.getTime())) return '';
	return timeFmt.format(d);
}

/** A YYYY-MM-DD calendar date (a setting) written as a date. */
export function formatCalendarDate(ymd: string | null | undefined): string {
	if (!ymd) return '';
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
	if (!m) return '';
	// Noon UTC lands on the same calendar day in Los Angeles.
	return dateFmt.format(new Date(`${ymd}T12:00:00Z`));
}

/** "2 days", "5 hours", "12 minutes", for a queue's wait. */
export function waitedWords(seconds: number): string {
	const s = Math.max(0, Math.floor(seconds));
	if (s < 60) return 'just now';
	const m = Math.floor(s / 60);
	if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
	const h = Math.floor(m / 60);
	if (h < 48) return `${h} hour${h === 1 ? '' : 's'}`;
	const d = Math.floor(h / 24);
	return `${d} day${d === 1 ? '' : 's'}`;
}

/** Whole days between two instants, for "average completion time". */
export function daysBetween(a: string | Date, b: string | Date): number {
	const ms = new Date(b).getTime() - new Date(a).getTime();
	return Math.round(ms / 86_400_000);
}
