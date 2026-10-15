/**
 * Fixtures for the certificate harness (ledger 0391, surface f): one
 * `cert_certificate` record per state the sheet can be in. Every date is
 * pinned so a render is the same twice; the serials are real Crockford
 * spellings so the normalizer and the QR both take them.
 */
import type { CertificateJson, SignedPayload } from '$lib/certifications/types';
import { verifyHref } from '$lib/certifications/nav';

export const CERTIFICATE_STATES = ['valid', 'valid-dated', 'expired', 'suspended', 'revoked', 'long-name'] as const;
export type CertificateState = (typeof CERTIFICATE_STATES)[number];

export const SERIAL_VALID = 'IDEA-7K3Q-M9XD-2HTR-W4PB';
export const SERIAL_SAFE = 'IDEA-0A1B-2C3D-4E5F-6G7H';
export const SERIAL_LONG = 'IDEA-9ZYX-WVTS-RQPN-MKJH';

const payload = (serial: string, code: string, level: number, holder: string, awardedAt: string): SignedPayload => ({
	v: 1,
	serial,
	code,
	level,
	holder_name: holder,
	email_sha256: 'a9993e364706816aba3e25717850c26c9cd0d89d0000000000000000deadbeef',
	awarded_at: awardedAt,
	certifier_name: 'Mr. Pina'
});

const record = (
	serial: string,
	holder: string,
	code: string,
	name: string,
	level: number,
	category: string,
	awardedAt: string,
	expiresAt: string | null,
	status: CertificateJson['status'],
	definition: string
): CertificateJson => ({
	serial,
	holder_name: holder,
	code,
	name,
	level,
	category,
	awarded_at: awardedAt,
	expires_at: expiresAt,
	awarded_by_name: 'Mr. Pina',
	status,
	signature: 'c2lnbmF0dXJlLWZpeHR1cmUtNjQtYnl0ZXMtbG9uZy1iYXNlNjQtZm9yLXRoZS1oYXJuZXNz',
	signed_payload: payload(serial, code, level, holder, awardedAt),
	key_id: 'a1b2c3d4',
	definition,
	verify_url_path: verifyHref(serial)
});

const MILL_DEFINITION =
	'You can set up and run the manual mill alone: tram the head, square stock in the vise, locate an edge, and face, slot and drill to a drawing within 0.005 in.';
const SAFE_DEFINITION = 'You know the shop rules, the machine guards, the stop buttons and the way out, and you can say them without looking.';

export const CERTIFICATE_RECORDS: Record<CertificateState, CertificateJson> = {
	valid: record(SERIAL_VALID, 'Ana Reyes', 'MILL-1', 'Manual Mill Level 1', 1, 'Machining', '2026-11-05T21:30:00Z', null, 'valid', MILL_DEFINITION),
	'valid-dated': record(SERIAL_SAFE, 'Ana Reyes', 'SAFE-1', 'Shop Safety Level 1', 1, 'Safety', '2026-08-20T22:10:00Z', '2027-08-16T07:00:00Z', 'valid', SAFE_DEFINITION),
	expired: record(SERIAL_SAFE, 'Ana Reyes', 'SAFE-1', 'Shop Safety Level 1', 1, 'Safety', '2025-09-03T22:10:00Z', '2026-08-17T07:00:00Z', 'expired', SAFE_DEFINITION),
	suspended: record(SERIAL_VALID, 'Ana Reyes', 'MILL-1', 'Manual Mill Level 1', 1, 'Machining', '2026-11-05T21:30:00Z', null, 'suspended', MILL_DEFINITION),
	revoked: record(SERIAL_VALID, 'Ana Reyes', 'MILL-1', 'Manual Mill Level 1', 1, 'Machining', '2026-11-05T21:30:00Z', null, 'revoked', MILL_DEFINITION),
	'long-name': record(
		SERIAL_LONG,
		'Maximiliano Fernandez de la Cruz',
		'MILL-2',
		'CNC Mill Level 2',
		2,
		'Machining',
		'2027-02-12T23:00:00Z',
		null,
		'valid',
		'You can program, set up and run the CNC mill alone, from a CAM file to a finished part, and prove the part to the drawing.'
	)
};

export function isCertificateState(value: string | null): value is CertificateState {
	return !!value && (CERTIFICATE_STATES as readonly string[]).includes(value);
}
