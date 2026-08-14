import { json, error } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { ingestFixture } from '$lib/server/dev-deck-fixture';
import type { RequestHandler } from './$types';

/**
 * Dev harness only (404 in production, no auth, no Supabase, no Drive):
 * zips the real deck at static/fsp/day2 and runs it through the SHIPPING
 * unpacker. See $lib/server/dev-deck-fixture.
 */
export const POST: RequestHandler = async ({ request }) => {
	if (!dev) error(404, 'Not found');

	const body = (await request.json().catch(() => ({}))) as {
		id?: string;
		withoutStateFile?: boolean;
		ambiguous?: boolean;
		traversal?: boolean;
		entryPath?: string | null;
	};
	const id = body.id ?? 'dev-deck';

	const res = ingestFixture(id, {
		withoutStateFile: body.withoutStateFile === true,
		ambiguous: body.ambiguous === true,
		traversal: body.traversal === true,
		entryPath: body.entryPath ?? null
	});

	if (!res.ok) {
		return json({ ok: false, error: res.error, candidates: res.candidates ?? [] }, { status: 400 });
	}
	return json({
		ok: true,
		deck: {
			id,
			title: 'IDEA FSP Day 2',
			item_id: 'dev-item',
			entry_path: res.plan.entryPath,
			thumbnail_path: res.plan.thumbnailPath,
			file_count: res.plan.files.length,
			total_bytes: res.plan.totalBytes,
			has_state_file: res.plan.hasStateFile,
			slides: res.plan.slides
		},
		warnings: res.plan.warnings,
		paths: res.plan.files.map((f) => f.path)
	});
};
