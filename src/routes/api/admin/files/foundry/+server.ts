import { json } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/admin';
import { normalizeFoundryInput } from '$lib/foundry/normalize';
import { FOUNDRY_UPLOAD_BUCKET } from '$lib/foundry/bundle-url';
import { idByName, readChatUpload } from '$lib/server/connector/upload-routes';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RequestHandler } from './$types';

/**
 * A FOUNDRY GAME FROM A CHAT, START TO PUBLISHED (ledger 0422, gap d782fd4e).
 * A zip, or a single HTML file, sent through the connector's upload, goes
 * through exactly the steps /foundry/submit takes, as the admin: the same
 * normalizing into a zip, the upload under his own prefix, a new version
 * (on his app named, or a new app), the server's unpack and check, and the
 * submit; then, unless told not to, the review that publishes it. Each step
 * is the site's own function deciding; a refusal stops here and says which
 * step refused. Admin only.
 */
type Body = {
	upload?: unknown;
	app?: unknown;
	title?: unknown;
	slug?: unknown;
	notes?: unknown;
	publish?: unknown;
};

const fail = (step: string, message: string, done: string[]) => json({ ok: false, step, error: message, done }, { status: 400 });

export const POST: RequestHandler = async ({ request, locals }) => {
	const supabase = locals.supabase as SupabaseClient;
	const claims = locals.claims;
	if (!claims || !(await isAdmin(supabase, claims.sub))) return json({ error: 'Not found' }, { status: 404 });
	const body = (await request.json().catch(() => ({}))) as Body;
	const done: string[] = [];

	const file = await readChatUpload(claims.sub, String(body.upload ?? ''));
	if (!file) return fail('upload', 'That upload has no file yet. Send the bytes first, then try again.', done);
	const normalized = await normalizeFoundryInput([new File([file.bytes as BlobPart], file.filename)]);
	if (!normalized.ok || !normalized.zip) return fail('file', normalized.problem ?? 'That file is not a game the Foundry can take.', done);

	// The app: one of his named, or a new one.
	let appId: string;
	let appTitle: string;
	const appSaid = typeof body.app === 'string' ? body.app.trim() : '';
	if (appSaid) {
		const found = await idByName(supabase, 'app', appSaid);
		if (!found.ok) return fail('app', found.message, done);
		appId = found.id;
		appTitle = found.name;
	} else {
		const title = typeof body.title === 'string' ? body.title.trim() : '';
		if (!title) return fail('app', 'Name the app to add this to, or give a title for a new one.', done);
		const slug =
			(typeof body.slug === 'string' && body.slug.trim()) ||
			title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
		const made = await supabase.rpc('foundry_create_app', {
			p_slug: slug,
			p_title: title,
			p_build_notes: typeof body.notes === 'string' && body.notes.trim() ? body.notes.trim() : 'Published through the IDEA Website connector.',
			p_tagline: null,
			p_description: null
		});
		const row = made.data as { ok?: boolean; app_id?: string } | null;
		if (made.error || !row?.ok || !row.app_id) return fail('app', made.error?.message ?? 'The app could not be created.', done);
		appId = row.app_id;
		appTitle = title;
		done.push(`made the app ${title}`);
	}

	const zipPath = `${claims.sub}/${crypto.randomUUID()}.zip`;
	const put = await supabase.storage.from(FOUNDRY_UPLOAD_BUCKET).upload(zipPath, normalized.zip, { contentType: 'application/zip', upsert: false });
	if (put.error) return fail('upload', put.error.message, done);
	done.push('uploaded the build');

	const version = await supabase.rpc('foundry_create_version', {
		p_app_id: appId,
		p_zip_path: zipPath,
		p_byte_size: normalized.zip.size,
		p_file_count: normalized.packed?.length ?? 0
	});
	const v = version.data as { ok?: boolean; version_id?: string; ordinal?: number } | null;
	if (version.error || !v?.ok || !v.version_id) return fail('version', version.error?.message ?? 'The version could not be recorded.', done);
	done.push(`recorded version ${v.ordinal ?? ''}`.trim());

	const ingest = await supabase.functions.invoke('foundry-ingest', { body: { version_id: v.version_id } });
	const checked = ingest.data as { ok?: boolean; failures?: unknown[] } | null;
	if (ingest.error || checked?.ok !== true) {
		return fail('check', ingest.error?.message ?? `The server's check refused it: ${JSON.stringify(checked?.failures ?? []).slice(0, 600)}`, done);
	}
	done.push('unpacked and checked it');

	const submitted = await supabase.rpc('foundry_submit_version', { p_version_id: v.version_id });
	if (submitted.error) return fail('submit', submitted.error.message, done);
	const autoPublished = (submitted.data as { auto_published?: boolean } | null)?.auto_published === true;
	done.push(autoPublished ? 'it went live (trusted publisher)' : 'sent it to review');

	if (!autoPublished && body.publish !== false) {
		const review = await supabase.rpc('foundry_review_version', {
			p_version_id: v.version_id,
			p_decision: 'approve',
			p_review_note: 'Published through the IDEA Website connector.',
			p_reject_reason: null
		});
		if (review.error) return fail('publish', review.error.message, done);
		done.push('approved and published it');
	}
	return json({ ok: true, app: appTitle, app_id: appId, version_id: v.version_id, done });
};
