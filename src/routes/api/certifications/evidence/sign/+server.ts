import { json } from '@sveltejs/kit';
import {
	CERT_EVIDENCE_BUCKET,
	evidencePath,
	evidenceTooLarge,
	evidenceUploadRefusal
} from '$lib/server/certifications/evidence';
import { UUID_RE, readJsonBody, stringField } from '$lib/server/certifications/api';
import type { RequestHandler } from './$types';

/**
 * MINTS THE SIGNED UPLOAD URL FOR ONE EVIDENCE FILE (ledger 0391), the
 * classroom's `/api/classroom/submission-file/sign` shape.
 *
 * `POST { attempt_id, filename, size }`. The size is refused BEFORE anything
 * else, in a sentence stating the size and the limit, because a refusal after
 * a minute of school wifi is the same refusal at the worst moment. The caller
 * must own the attempt and it must be open: `cert_me` is the cheap read that
 * says so, and the refusal is in words; the storage INSERT policy
 * (`_cert_attempt_owner` on the key's first segment) is the real gate and
 * runs on the caller's own session when the URL is minted. The key is
 * `<attempt_id>/<uuid>.<ext>` and nothing a person typed is in it.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims) return json({ ok: false, reason: 'signed_out', message: 'You must be signed in.' }, { status: 401 });

	const body = await readJsonBody(request);
	if (!body) return json({ ok: false, reason: 'invalid_body', message: 'Expected a JSON body.' }, { status: 400 });
	const attemptId = stringField(body, 'attempt_id');
	if (!UUID_RE.test(attemptId)) {
		return json({ ok: false, reason: 'invalid_body', message: 'attempt_id must be a uuid.' }, { status: 400 });
	}
	const filename = stringField(body, 'filename');
	if (!filename) return json({ ok: false, reason: 'invalid_body', message: 'filename is required.' }, { status: 400 });
	const size = Number(body.size ?? 0);

	const large = evidenceTooLarge(size);
	if (large) return json({ ok: false, ...large, reason: 'too_large' }, { status: 413 });

	const me = await supabase.rpc('cert_me');
	if (me.error) {
		return json({ ok: false, reason: 'unavailable', message: me.error.message }, { status: 503 });
	}
	const attempts = ((me.data as { attempts?: { id?: string; state?: string }[] } | null)?.attempts ?? []).filter(
		(a) => a && typeof a === 'object'
	);
	const mine = attempts.find((a) => a.id === attemptId);
	if (!mine || (mine.state !== 'active' && mine.state !== 'dormant')) {
		return json(
			{ ok: false, reason: 'not_found', message: 'That attempt is not one of yours, or it is no longer open.' },
			{ status: 404 }
		);
	}

	const path = evidencePath(attemptId, filename);
	const { data, error } = await supabase.storage.from(CERT_EVIDENCE_BUCKET).createSignedUploadUrl(path);
	if (error || !data) {
		const status = Number((error as { statusCode?: string | number } | null)?.statusCode ?? 403);
		const refusal = evidenceUploadRefusal(Number.isFinite(status) ? status : 403, error?.message, size);
		return json({ ok: false, ...refusal, reason: refusal.gate }, { status: 200 });
	}
	return json({ ok: true, bucket: CERT_EVIDENCE_BUCKET, path: data.path, token: data.token, signedUrl: data.signedUrl });
};
