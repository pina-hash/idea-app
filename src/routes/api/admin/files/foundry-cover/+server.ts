import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { FOUNDRY_COVER_BUCKET } from '$lib/foundry/bundle-url';
import { looksLikeHtmlCover } from '$lib/foundry/html-cover';
import { idByName, readChatUpload } from '$lib/server/connector/upload-routes';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

/**
 * A GAME'S COVER FROM A CHAT (ledger 0422, feedback 1cc58a6e). A picture or an
 * HTML file sent through the connector's upload becomes the game's cover on
 * its gallery card, through the same two steps the card's editor takes as the
 * admin: a picture goes into his own folder in the covers bucket (the only
 * place its policy allows), then `foundry_cover_set` decides. `clear` puts the
 * student's own cover back and needs no upload. Admin only; anyone else gets
 * the site's 404.
 */
const IMAGE_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };

export const POST: RequestHandler = async ({ request, locals }) => {
	const supabase = locals.supabase as SupabaseClient;
	const claims = locals.claims;
	if (!claims || !(await isAdmin(supabase, claims.sub))) return json({ error: 'Not found' }, { status: 404 });
	const body = (await request.json().catch(() => ({}))) as { upload?: unknown; app?: unknown; clear?: unknown };

	const app = await idByName(supabase, 'app', String(body.app ?? ''));
	if (!app.ok) return json({ error: app.message }, { status: 400 });

	let kind: 'image' | 'html' | 'clear';
	let value: string | null = null;
	if (body.clear === true) {
		kind = 'clear';
	} else {
		const file = await readChatUpload(claims.sub, String(body.upload ?? ''));
		if (!file) return json({ error: 'That upload has no file yet. Send the bytes first, then try again.' }, { status: 400 });
		const ext = file.filename.slice(file.filename.lastIndexOf('.') + 1).toLowerCase();
		if (IMAGE_TYPES[ext]) {
			const path = `${claims.sub}/${crypto.randomUUID()}.${ext}`;
			const { error } = await supabase.storage
				.from(FOUNDRY_COVER_BUCKET)
				.upload(path, file.bytes as unknown as Blob, { contentType: IMAGE_TYPES[ext], upsert: false });
			if (error) return json({ error: 'The picture could not be uploaded. Try again.' }, { status: 400 });
			kind = 'image';
			value = path;
		} else {
			const text = new TextDecoder().decode(file.bytes);
			if (!looksLikeHtmlCover(file.filename, text)) {
				return json({ error: 'A cover is a picture (PNG, JPG, GIF or WebP) or an HTML file.' }, { status: 400 });
			}
			kind = 'html';
			value = text;
		}
	}

	const { data, error } = await supabase.rpc('foundry_cover_set', {
		p_app: app.id,
		p_kind: kind,
		p_image_path: kind === 'image' ? value : null,
		p_html: kind === 'html' ? value : null
	});
	const out = data as { ok?: boolean; message?: string } | null;
	if (error || !out) return json({ error: 'Covers are not available yet. They arrive with the next database update.' }, { status: 400 });
	if (!out.ok) return json({ error: out.message ?? 'That cover could not be saved.' }, { status: 400 });
	return json({ ok: true, app: app.name, cover: kind === 'clear' ? 'the student’s own' : kind });
};
