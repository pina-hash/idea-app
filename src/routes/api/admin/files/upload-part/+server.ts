import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { storeChatUploadPart } from '$lib/server/connector/upload-routes';
import type { RequestHandler } from './$types';

/**
 * ONE PIECE OF AN UPLOAD (ledger 0422), for a chat that cannot send a file
 * any other way: numbered from 1, joined in order when the upload is used.
 * Admin only, and only to the admin's own upload.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims || !(await isAdmin(supabase, claims.sub))) return json({ error: 'Not found' }, { status: 404 });
	const body = (await request.json().catch(() => ({}))) as { upload?: unknown; part?: unknown; text?: unknown; base64?: unknown };
	const r = await storeChatUploadPart(
		claims.sub,
		String(body.upload ?? ''),
		Number(body.part),
		typeof body.text === 'string' ? body.text : null,
		typeof body.base64 === 'string' ? body.base64 : null
	);
	return json(r, { status: r.ok ? 200 : 400 });
};
