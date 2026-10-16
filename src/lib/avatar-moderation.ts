/**
 * TURNING OFF A PROFILE PICTURE (ledger 0392, migration 0267, Mr. Pina: "I need
 * to have the ability to turn off a student's profile picture ... a general
 * moderation tool").
 *
 * Plain data and pure helpers plus the one place the five RPCs are called, so
 * the admin page, the student page and their harnesses share one vocabulary.
 * Every write is the database's: `profile_avatar_hide` clears the two stored
 * picture values (every surface then draws initials) and locks them, and
 * `profile_avatar_restore` puts back exactly what was there. A transport that
 * answers `unavailable` means the migration is not applied here, and a surface
 * then shows no control at all.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AvatarHoldReason = 'not_admin' | 'no_account' | 'already_hidden' | 'not_hidden' | 'reason_too_long' | 'unavailable' | 'failed';

export interface AvatarHoldResult {
	ok: boolean;
	reason?: AvatarHoldReason;
	hadPicture?: boolean;
	/** A failure's own words, when it was not one of the reasons above. */
	message?: string;
}

export interface AvatarHoldStatus {
	account: boolean;
	hidden: boolean;
	hiddenAt: string | null;
	hiddenBy: string | null;
	reason: string | null;
}

export interface AvatarHold {
	email: string;
	name: string;
	hiddenAt: string;
	hiddenBy: string;
	reason: string | null;
	hadPicture: boolean;
}

export interface AvatarModerationTransports {
	status(email: string): Promise<AvatarHoldStatus | null>;
	hide(email: string, reason: string | null): Promise<AvatarHoldResult>;
	restore(email: string): Promise<AvatarHoldResult>;
	list(): Promise<AvatarHold[] | null>;
}

/** The longest reason the database keeps. */
export const AVATAR_HOLD_REASON_MAX = 300;

/** What a held student reads where they would change their picture. */
export const AVATAR_HELD_NOTE =
	'Your profile picture was turned off by a site admin, so it shows your initials for now. Ask a teacher if you think this is a mistake.';

const REASONS = new Set<AvatarHoldReason>(['not_admin', 'no_account', 'already_hidden', 'not_hidden', 'reason_too_long']);

/** A write's answer, read defensively. */
export function normalizeHoldResult(raw: unknown): AvatarHoldResult {
	if (!raw || typeof raw !== 'object') return { ok: false, reason: 'failed' };
	const r = raw as Record<string, unknown>;
	if (r.ok === true) return { ok: true, hadPicture: r.had_picture === true };
	const reason = typeof r.reason === 'string' && REASONS.has(r.reason as AvatarHoldReason) ? (r.reason as AvatarHoldReason) : 'failed';
	return { ok: false, reason };
}

export function normalizeHoldStatus(raw: unknown): AvatarHoldStatus | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	return {
		account: r.account === true,
		hidden: r.hidden === true,
		hiddenAt: typeof r.hidden_at === 'string' ? r.hidden_at : null,
		hiddenBy: typeof r.hidden_by === 'string' ? r.hidden_by : null,
		reason: typeof r.reason === 'string' && r.reason.trim() ? r.reason : null
	};
}

export function normalizeHolds(raw: unknown): AvatarHold[] | null {
	if (!Array.isArray(raw)) return null;
	const out: AvatarHold[] = [];
	for (const row of raw) {
		if (!row || typeof row !== 'object') continue;
		const r = row as Record<string, unknown>;
		if (typeof r.email !== 'string' || typeof r.hidden_at !== 'string') continue;
		out.push({
			email: r.email,
			name: typeof r.name === 'string' && r.name.trim() ? r.name : r.email,
			hiddenAt: r.hidden_at,
			hiddenBy: typeof r.hidden_by === 'string' ? r.hidden_by : '',
			reason: typeof r.reason === 'string' && r.reason.trim() ? r.reason : null,
			hadPicture: r.had_picture === true
		});
	}
	return out;
}

/** A refusal, in words. */
export function holdRefusalSentence(result: AvatarHoldResult): string {
	switch (result.reason) {
		case 'not_admin':
			return 'Only a site admin can turn a profile picture off or on.';
		case 'no_account':
			return 'No account uses that address yet, so there is no picture to turn off.';
		case 'already_hidden':
			return 'That profile picture is already turned off.';
		case 'not_hidden':
			return 'That profile picture is not turned off.';
		case 'reason_too_long':
			return `A reason can be at most ${AVATAR_HOLD_REASON_MAX} characters.`;
		case 'unavailable':
			return 'Profile picture moderation is not set up on this database yet.';
		default:
			return result.message ? `That did not go through: ${result.message}` : 'That did not go through. Try again.';
	}
}

/** The day and time a hold was made, on the school's clock, with no weekday. */
export function holdWhen(iso: string | null): string {
	if (!iso) return '';
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleString('en-US', {
		timeZone: 'America/Los_Angeles',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit'
	});
}

const isMissing = (code: string | undefined) => code === 'PGRST202';

/** The real transports, on the caller's own client. Every RPC re-checks `is_admin()` itself. */
export function createAvatarModerationTransports(supabase: SupabaseClient): AvatarModerationTransports {
	return {
		async status(email) {
			const { data, error } = await supabase.rpc('profile_avatar_hold_status', { p_email: email });
			if (error) return null;
			return normalizeHoldStatus(data);
		},
		async hide(email, reason) {
			const { data, error } = await supabase.rpc('profile_avatar_hide', { p_email: email, p_reason: reason });
			if (error) return isMissing(error.code) ? { ok: false, reason: 'unavailable' } : { ok: false, reason: 'failed', message: error.message };
			return normalizeHoldResult(data);
		},
		async restore(email) {
			const { data, error } = await supabase.rpc('profile_avatar_restore', { p_email: email });
			if (error) return isMissing(error.code) ? { ok: false, reason: 'unavailable' } : { ok: false, reason: 'failed', message: error.message };
			return normalizeHoldResult(data);
		},
		async list() {
			const { data, error } = await supabase.rpc('profile_avatar_holds');
			if (error) return null;
			return normalizeHolds(data);
		}
	};
}

/** Is the caller's own picture held? Null when the database cannot say (not applied, signed out). */
export async function myAvatarHold(supabase: SupabaseClient): Promise<boolean | null> {
	try {
		const { data, error } = await supabase.rpc('profile_avatar_my_hold');
		if (error || !data || typeof data !== 'object') return null;
		return (data as { held?: unknown }).held === true;
	} catch {
		// A read that cannot answer leaves the picker as it was; the lock still holds.
		return null;
	}
}

/** An in-memory stand-in for the harnesses, seeded with who has a picture and who is held. */
export function createMemoryAvatarModeration(seed: { accounts: string[]; held?: AvatarHold[] }): AvatarModerationTransports {
	const accounts = new Set(seed.accounts.map((e) => e.toLowerCase()));
	const held = new Map((seed.held ?? []).map((h) => [h.email.toLowerCase(), { ...h }]));
	const norm = (e: string) => e.trim().toLowerCase();
	return {
		async status(email) {
			const e = norm(email);
			const h = held.get(e);
			return { account: accounts.has(e), hidden: !!h, hiddenAt: h?.hiddenAt ?? null, hiddenBy: h?.hiddenBy ?? null, reason: h?.reason ?? null };
		},
		async hide(email, reason) {
			const e = norm(email);
			if (!accounts.has(e)) return { ok: false, reason: 'no_account' };
			if (held.has(e)) return { ok: false, reason: 'already_hidden' };
			if (reason && reason.length > AVATAR_HOLD_REASON_MAX) return { ok: false, reason: 'reason_too_long' };
			held.set(e, { email: e, name: e, hiddenAt: new Date().toISOString(), hiddenBy: 'apina@boscotech.edu', reason: reason?.trim() || null, hadPicture: true });
			return { ok: true, hadPicture: true };
		},
		async restore(email) {
			const e = norm(email);
			if (!held.delete(e)) return { ok: false, reason: 'not_hidden' };
			return { ok: true };
		},
		async list() {
			return [...held.values()].sort((a, b) => b.hiddenAt.localeCompare(a.hiddenAt));
		}
	};
}
