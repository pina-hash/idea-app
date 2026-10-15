import { certSiteOrigin, requireCertAdmin } from '$lib/server/certifications/gate';
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
import { buildSignedPayload } from '$lib/certifications/signing-payload';
import { certificateHref } from '$lib/certifications/nav';
import type { CertAwardJson } from '$lib/certifications/types';
import type { RequestHandler } from './$types';

/**
 * A CORRECTION (ledger 0391; `docs/CERTIFICATIONS.md` "Suspend, revoke,
 * correct"): a misspelled name or a wrong address re-signs the record UNDER
 * THE SAME SERIAL and keeps the old values in its history. Admin only.
 *
 * `POST { award_id, holder_name, email, reason }`, the award route's order:
 * gate, signing key before anything else, the award read back on the caller's
 * client (`cert_award_get`, for the serial, code, level, award date and
 * certifier name the payload keeps), the corrected payload signed, then
 * `cert_award_correct`, which recomputes the payload from the corrected values
 * and refuses a mismatch. The holder is notified and the mirror refreshed,
 * both wrapped.
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	await requireCertAdmin(locals);

	const body = await readJsonBody(request);
	if (!body) return refuse('invalid_body', 'Expected a JSON body with award_id, holder_name, email and reason.', 400);
	const awardId = stringField(body, 'award_id');
	const holderName = stringField(body, 'holder_name');
	const email = stringField(body, 'email').toLowerCase();
	const reason = stringField(body, 'reason');
	if (!UUID_RE.test(awardId)) return refuse('invalid_body', 'award_id must be a uuid.', 400);
	if (!holderName) return refuse('invalid_body', 'holder_name is required.', 400);
	if (!email.includes('@') || /\s/.test(email)) return refuse('invalid_body', 'email must be one address.', 400);
	if (!reason) return refuse('reason_required', 'A correction needs a written reason.', 400);

	const key = readSigningKey();
	const noKey = signingRefusal(key);
	if (noKey || !key.ok) return noKey as Response;

	const current = await locals.supabase.rpc('cert_award_get', { p_id: awardId });
	if (current.error) return rpcFailure(current.error);
	if (isRefusalObject(current.data)) return passRefusal(current.data, 404);
	const award = (current.data ?? null) as CertAwardJson | null;
	if (!award?.serial || !award.code || typeof award.level !== 'number' || !award.awarded_at || !award.awarded_by_name) {
		return refuse('not_found', 'No such award.', 404);
	}

	const signed = await buildSignedPayload({
		serial: award.serial,
		code: award.code,
		level: award.level,
		holder_name: holderName,
		email,
		awarded_at: award.awarded_at,
		certifier_name: award.awarded_by_name
	});
	const signature = signPayload(signed, key.privateKey);

	const corrected = await locals.supabase.rpc('cert_award_correct', {
		p_award: awardId,
		p_holder_name: holderName,
		p_email: email,
		p_signature: signature,
		p_key_id: key.keyId,
		p_signed: signed,
		p_reason: reason
	});
	if (corrected.error) return rpcFailure(corrected.error);
	if (isRefusalObject(corrected.data)) return passRefusal(corrected.data);
	const result = (corrected.data ?? {}) as { award?: Record<string, unknown>; notify?: unknown };
	const updated = result.award ?? { serial: award.serial };

	const origin = certSiteOrigin(url);
	let notified = 0;
	try {
		notified = (await sendCertNotifications(result.notify, origin, locals.supabase)).notified;
	} catch {
		// Best effort.
	}
	let mirror: unknown = null;
	try {
		mirror = await sendMirror('award', locals.supabase);
	} catch {
		mirror = null;
	}
	return okJson({ award: updated, certificate_href: certificateHref(award.serial), notified, mirror });
};
