import { certSiteOrigin, requireCertifier } from '$lib/server/certifications/gate';
import { readSigningKey, signPayload } from '$lib/server/certifications/signing';
import { sendCertNotifications } from '$lib/server/certifications/notify';
import { sendMirror } from '$lib/server/certifications/mirror';
import {
	UUID_RE,
	isRefusalObject,
	okJson,
	passRefusal,
	readJsonBody,
	refuse,
	rpcFailure,
	signingRefusal,
	stringField
} from '$lib/server/certifications/api';
import { newSerial } from '$lib/certifications/serial';
import { buildSignedPayload } from '$lib/certifications/signing-payload';
import { certificateHref } from '$lib/certifications/nav';
import type { AwardRecordPreview } from '$lib/certifications/types';
import type { RequestHandler } from './$types';

/**
 * THE AWARD (ledger 0391; `docs/CERTIFICATIONS.md` "The award moment";
 * DECISIONS D9). One confirmed press from the desk lands here as
 * `POST { attempt_id }`, and the order below is the whole design:
 *
 *   1. The certifier gate (404 to anybody else, convenience over the
 *      function's own check).
 *   2. THE SIGNING KEY, BEFORE ANYTHING ELSE HAPPENS. No key, or a malformed
 *      one, is a 409 with the admin-facing sentence and NOTHING is called:
 *      nothing is ever awarded unsigned, and a prepare that cannot be followed
 *      by a commit would only write an event for nothing.
 *   3. `cert_award_prepare` on the CALLER'S client: every requirement
 *      re-checked in the database, the holder name, the certifier name, the
 *      expiry. A refusal is passed through as it stands.
 *   4. A fresh serial, the canonical payload from the prepared record, the
 *      Ed25519 signature.
 *   5. `cert_award_commit`, which re-runs every check, recomputes the payload's
 *      values and refuses a mismatch, and writes the award, its history, the
 *      attempt's completion, the event and the notification in one
 *      transaction.
 *   6. The email and the push, and the FRC mirror, each wrapped: a delivery
 *      problem never makes a committed award read as failed.
 *
 * Nothing here logs the key, the signature or the payload.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	await requireCertifier(locals);

	const body = await readJsonBody(request);
	if (!body) return refuse('invalid_body', 'Expected a JSON body with attempt_id.', 400);
	const attemptId = stringField(body, 'attempt_id');
	if (!UUID_RE.test(attemptId)) return refuse('invalid_body', 'attempt_id must be a uuid.', 400);

	const key = readSigningKey();
	const noKey = signingRefusal(key);
	if (noKey || !key.ok) return noKey as Response;

	const prepared = await locals.supabase.rpc('cert_award_prepare', { p_attempt: attemptId });
	if (prepared.error) return rpcFailure(prepared.error);
	if (isRefusalObject(prepared.data)) return passRefusal(prepared.data);
	const record = (prepared.data as { record?: AwardRecordPreview } | null)?.record;
	if (!record?.student?.email || !record.certification?.code || !record.certifier?.name) {
		return refuse('prepare_shape', 'The award could not be prepared: the record is incomplete.', 500);
	}

	const serial = newSerial();
	const signed = await buildSignedPayload({
		serial,
		code: record.certification.code,
		level: record.certification.level,
		holder_name: record.student.name,
		email: record.student.email,
		awarded_at: record.awarded_at,
		certifier_name: record.certifier.name
	});
	const signature = signPayload(signed, key.privateKey);

	const committed = await locals.supabase.rpc('cert_award_commit', {
		p_attempt: attemptId,
		p_serial: serial,
		p_signature: signature,
		p_key_id: key.keyId,
		p_signed: signed
	});
	if (committed.error) return rpcFailure(committed.error);
	if (isRefusalObject(committed.data)) return passRefusal(committed.data);
	const result = (committed.data ?? {}) as { award?: Record<string, unknown>; notify?: unknown };
	const award = result.award ?? { serial };
	const awardSerial = typeof award.serial === 'string' ? award.serial : serial;

	// The award is committed. Everything from here is best effort.
	const origin = certSiteOrigin(url);
	let notified = 0;
	try {
		notified = (await sendCertNotifications(result.notify, origin, locals.supabase)).notified;
	} catch {
		// Never let a delivery problem make a committed award look failed.
	}
	let mirror: unknown = null;
	try {
		mirror = await sendMirror('award', locals.supabase);
	} catch {
		mirror = null;
	}

	return okJson({ award, certificate_href: certificateHref(awardSerial), notified, mirror });
};
