import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { normalizeSerial } from '$lib/certifications/serial';
import { readSignedPayload } from '$lib/certifications/signing-payload';
import type { VerifyJson } from '$lib/certifications/types';
import { certNotAvailable, type CertShellData } from '$lib/certifications/student/shell';
import type { VerifyRecord, VerifyView } from '$lib/certifications/student/verify';
import { readSigningKey, verifySignature } from '$lib/server/certifications/signing';
import { allowVerify } from '$lib/server/certifications/verify-limit';

const SHELL: CertShellData = {
	title: 'Verify a certificate',
	lead: 'Every IDEA certificate carries a serial and a QR code. Type the serial and this page reads the live, signed record. It shows that one certificate and nothing else.'
};

const view = (state: VerifyView['state'], typed: string, serial: string | null = null, record: VerifyRecord | null = null): VerifyView => ({
	state,
	serial,
	typed,
	record
});

/**
 * THE PUBLIC VERIFY PAGE (ledger 0391, DECISIONS D9 and D10). No session is
 * needed and none is read for the answer. In order: normalize what was typed
 * (nothing normalizable is "No such certificate" with no call made), rate
 * limit per client address, `cert_verify` on the request's own client (anon
 * when signed out), then re-check the Ed25519 signature against the server's
 * public key. A mismatch, a record signed under a key this server does not
 * hold, or a payload naming a different serial is "No such certificate": the
 * page never says which check failed. The mismatch is logged through
 * `cert_error_log` when a session exists, else to the server console without
 * the serial.
 *
 * A page load cannot set the response status, so the rate-limited answer
 * renders in the same page with its one sentence; `status` rides in the data
 * for the record.
 */
export const load: PageServerLoad = async ({ url, locals, getClientAddress }) => {
	const typed = (url.searchParams.get('serial') ?? '').trim();
	if (!typed) return { shell: SHELL, view: view('idle', ''), status: 200 };

	const serial = normalizeSerial(typed);
	if (!serial) return { shell: SHELL, view: view('none', typed), status: 200 };

	let address = 'unknown';
	try {
		address = getClientAddress();
	} catch {
		address = 'unknown';
	}
	if (!allowVerify(address)) return { shell: SHELL, view: view('limited', typed, serial), status: 429 };

	const { data, error: e } = await locals.supabase.rpc('cert_verify', { p_serial: serial });
	if (e) {
		if (certNotAvailable(e)) return { shell: SHELL, view: view('unavailable', typed, serial), status: 200 };
		error(500, 'cert_verify could not be read.');
	}
	const answer = data as VerifyJson | null;
	if (!answer || typeof answer !== 'object' || answer.found !== true) return { shell: SHELL, view: view('none', typed, serial), status: 200 };

	const key = readSigningKey();
	const payload = readSignedPayload(answer.signed_payload);
	const reason = !key.ok
		? `server key ${key.reason}`
		: !payload
			? 'payload unreadable'
			: payload.serial !== serial
				? 'payload serial differs'
				: !verifySignature(payload, answer.signature, key.publicKey)
					? 'signature invalid'
					: null;
	if (reason !== null) {
		if (locals.claims) {
			try {
				await locals.supabase.rpc('cert_error_log', {
					p_where: 'certifications.verify',
					p_message: `verify: ${reason}`,
					p_detail: { record_key_id: answer.key_id, server_key_id: key.ok ? key.keyId : null },
					p_correlation: null
				});
			} catch {
				// Logging never changes the answer.
			}
		} else {
			console.error(`certifications.verify: ${reason} (record key ${answer.key_id})`);
		}
		return { shell: SHELL, view: view('none', typed, serial), status: 200 };
	}

	const record: VerifyRecord = {
		holder_name: answer.holder_name,
		code: answer.code,
		name: answer.name,
		level: answer.level,
		category: answer.category,
		awarded_at: answer.awarded_at,
		awarded_by_name: answer.awarded_by_name,
		expires_at: answer.expires_at,
		status: answer.status,
		signature: answer.signature,
		signed_payload: payload!,
		key_id: answer.key_id
	};
	return { shell: SHELL, view: view(answer.status, typed, serial, record), status: 200 };
};
