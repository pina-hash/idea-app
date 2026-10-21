import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { sendSiteFile, type SiteFileRole } from '$lib/server/connector/files';
import { idByName, readChatUpload } from '$lib/server/connector/upload-routes';
import type { RequestHandler } from './$types';

/**
 * PUT A FILE FROM A CHAT ON A POST (ledger 0422, gap d782fd4e): a handout for
 * students, an instructor-only file, the post's thumbnail picture, or a file
 * on a class notice. It runs the site's own sign, upload and record steps for
 * that kind of file, as the admin, so every size limit and refusal is the one
 * the page gives. Admin only.
 */
const ROLES: Record<string, SiteFileRole> = {
	students: 'attachment',
	attachment: 'attachment',
	instructors: 'instructor',
	instructor: 'instructor',
	thumbnail: 'thumbnail',
	notice: 'quick-post'
};

export const POST: RequestHandler = async ({ request, locals }) => {
	const { supabase, claims } = locals;
	if (!claims || !(await isAdmin(supabase, claims.sub))) return json({ error: 'Not found' }, { status: 404 });
	const body = (await request.json().catch(() => ({}))) as { upload?: unknown; post?: unknown; as?: unknown; filename?: unknown };
	const role = ROLES[String(body.as ?? 'students').toLowerCase()];
	if (!role) return json({ error: 'Say students, instructors, thumbnail or notice.' }, { status: 400 });
	const file = await readChatUpload(claims.sub, String(body.upload ?? ''));
	if (!file) return json({ error: 'That upload has no file yet. Send the bytes first, then try again.' }, { status: 400 });
	const owner = await idByName(supabase, role === 'quick-post' ? 'quick_post' : 'post', String(body.post ?? ''));
	if (!owner.ok) return json({ error: owner.message }, { status: 400 });
	const filename = (typeof body.filename === 'string' && body.filename.trim()) || file.filename;
	const out = await sendSiteFile(locals as never, role, owner.id, filename, file.bytes);
	if (!out.ok) return json({ error: out.message }, { status: 400 });
	return json({ ok: true, post: owner.name, file: filename, bytes: file.bytes.byteLength, as: role });
};
