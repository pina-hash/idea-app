import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { openChatUpload } from '$lib/server/connector/upload-routes';
import type { RequestHandler } from './$types';

/**
 * OPEN A ONE-TIME UPLOAD (ledger 0422, gap d782fd4e), for a file too big to
 * send as text from a chat: a worksheet with pictures, a game, a cover, a
 * handout. It answers where to send the bytes; it changes nothing on the site.
 * Admin only.
 */
export const POST: RequestHandler = async ({ request, locals: { supabase, claims } }) => {
	if (!claims || !(await isAdmin(supabase, claims.sub))) return json({ error: 'Not found' }, { status: 404 });
	const body = (await request.json().catch(() => ({}))) as { filename?: unknown; type?: unknown; megabytes?: unknown };
	const mb = Number(body.megabytes);
	try {
		return json(
			await openChatUpload(
				claims.sub,
				String(body.filename ?? 'file'),
				typeof body.type === 'string' && body.type.trim() ? body.type.trim() : null,
				Number.isFinite(mb) && mb > 0 ? mb : null
			)
		);
	} catch (e) {
		return json({ error: (e as Error).message || 'The upload could not be opened.' }, { status: 503 });
	}
};
