/**
 * What the verify page shows (ledger 0391): ONE of five states for a serial,
 * or the two states that are about the request rather than a record (nothing
 * asked yet; too many checks). The route decides the state on the server and
 * hands this down; `VerifyResult` only draws it. Nothing here names which
 * check failed, and nothing here carries an email.
 */
import type { AwardShownStatus, SignedPayload } from '$lib/certifications/types';

export type VerifyState = AwardShownStatus | 'none' | 'limited' | 'idle' | 'unavailable';

export interface VerifyRecord {
	holder_name: string;
	code: string;
	name: string;
	level: number;
	category: string;
	awarded_at: string;
	awarded_by_name: string;
	expires_at: string | null;
	status: AwardShownStatus;
	signature: string;
	signed_payload: SignedPayload;
	key_id: string;
}

export interface VerifyView {
	state: VerifyState;
	/** The normalized serial the answer is about, when there is one. */
	serial: string | null;
	/** What the person typed, so the box keeps it. */
	typed: string;
	record: VerifyRecord | null;
}

export const VERIFY_TONE: Record<VerifyState, 'ok' | 'warn' | 'bad' | 'quiet'> = {
	valid: 'ok',
	suspended: 'warn',
	revoked: 'bad',
	expired: 'bad',
	none: 'quiet',
	limited: 'warn',
	idle: 'quiet',
	unavailable: 'quiet'
};

export const VERIFY_GLYPH: Record<VerifyState, string> = {
	valid: '✓',
	suspended: '!',
	revoked: '✕',
	expired: '✕',
	none: '?',
	limited: '!',
	idle: '·',
	unavailable: '·'
};

/** Formatted JSON of the signed payload, keys in the canonical order, for "Check it yourself". */
export function payloadPretty(p: SignedPayload): string {
	return JSON.stringify(
		{
			v: p.v,
			serial: p.serial,
			code: p.code,
			level: p.level,
			holder_name: p.holder_name,
			email_sha256: p.email_sha256,
			awarded_at: p.awarded_at,
			certifier_name: p.certifier_name
		},
		null,
		2
	);
}
