import { json } from '@sveltejs/kit';
import { requireCertAdmin } from '$lib/server/certifications/gate';
import { sendMirror } from '$lib/server/certifications/mirror';
import { findCertificationByCode, loadCurrentBundle } from '$lib/server/certifications/package-io';
import {
	PACKAGE_ZIP_MAX_BYTES,
	diffPackages,
	parsePackageZip,
	type PackageBundle,
	type PackageChange
} from '$lib/server/certifications/package-zip';
import { UUID_RE, isRefusalObject, refuse, rpcFailure } from '$lib/server/certifications/api';
import { validateHtmlManifest } from '$lib/classroom/html-assignment/manifest';
import type { RequestHandler } from './$types';

/**
 * IMPORT A PACKAGE ZIP, IN TWO STEPS (ledger 0391; `PACKAGE_FORMAT.md` "Import
 * behavior"). `POST multipart { file, confirm?: "1", id? }`, admin only.
 *
 *   WITHOUT `confirm=1`: the ZIP is unpacked and validated against the format,
 *   every problem named by file and field; the current revision of the same
 *   code (or of `id`) is read back and diffed; the answer is
 *   `{ ok, problems, diff, summary }` and NOTHING is written.
 *
 *   WITH `confirm=1` AND NO PROBLEMS: `cert_admin_save` (a new revision for an
 *   existing code, a draft for a new one), then `cert_exam_pool_replace`
 *   (whole; questions absent from the file are deactivated, never deleted),
 *   then `cert_lesson_save` per lesson in the ZIP, in that order, then the
 *   catalog mirror, wrapped. Nothing is published by importing.
 *
 * A lesson's manifest is checked with the HTML assignment engine's own
 * validator here (0260 stores it after an object check only), so a lesson that
 * declares blocks the engine cannot render is a problem before anything is
 * saved; an empty `{}` manifest is a lesson with nothing to answer and passes.
 */
const NO_STORE = { 'cache-control': 'no-store' };

function summarize(bundle: PackageBundle, existing: { id: string; revision?: number } | null, diff: PackageChange[]) {
	return {
		code: bundle.package.code,
		name: bundle.package.name,
		existing: !!existing,
		existing_id: existing?.id ?? null,
		current_revision: existing?.revision ?? null,
		questions: bundle.pool.length,
		lessons: bundle.lessons.length,
		training_items: bundle.package.training.items.length,
		changes: diff.length
	};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	await requireCertAdmin(locals);

	const declared = Number(request.headers.get('content-length') ?? '');
	if (Number.isFinite(declared) && declared > PACKAGE_ZIP_MAX_BYTES + 64 * 1024) {
		return refuse('too_large', `The package is larger than the ${PACKAGE_ZIP_MAX_BYTES} byte limit.`, 413);
	}
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		return refuse('invalid_body', 'Expected multipart/form-data with a file.', 400);
	}
	const file = form.get('file');
	if (!(file instanceof File)) return refuse('invalid_body', 'The form needs a file named "file".', 400);
	if (file.size > PACKAGE_ZIP_MAX_BYTES) {
		return refuse('too_large', `The package is ${file.size} bytes; the limit is ${PACKAGE_ZIP_MAX_BYTES}.`, 413);
	}
	const confirm = String(form.get('confirm') ?? '') === '1';
	const idParam = String(form.get('id') ?? '').trim();
	if (idParam && !UUID_RE.test(idParam)) return refuse('invalid_body', 'id must be a uuid.', 400);

	const bytes = new Uint8Array(await file.arrayBuffer());
	const parsed = await parsePackageZip(bytes);
	const problems = [...parsed.problems];
	for (const lesson of parsed.lessons) {
		if (!Object.keys(lesson.manifest).length) continue;
		const check = validateHtmlManifest(lesson.document, lesson.manifest);
		for (const e of check.errors) problems.push(`lessons/${lesson.slug}.manifest.json: ${e}`);
	}
	if (!parsed.package) {
		return json({ ok: false, problems, diff: [], summary: null }, { status: 200, headers: NO_STORE });
	}
	const incoming: PackageBundle = { package: parsed.package, pool: parsed.pool, lessons: parsed.lessons };

	// The certification this package names, if the portal holds it already.
	let existing: { id: string; revision?: number } | null = null;
	if (idParam) existing = { id: idParam };
	else existing = await findCertificationByCode(locals.supabase, parsed.package.code);
	let current: PackageBundle | null = null;
	if (existing) {
		const read = await loadCurrentBundle(locals.supabase, existing.id);
		if (!read.ok) {
			if (read.reason === 'not_found' && idParam) return refuse('not_found', 'No such certification.', 404);
			if (read.reason !== 'not_found') return refuse(read.reason, read.message, 503);
			existing = null;
		} else {
			current = read.current.bundle;
			existing = { id: existing.id, revision: typeof read.current.adminGet.revision === 'number' ? read.current.adminGet.revision : existing.revision };
		}
	}
	const diff = diffPackages(current, incoming);
	const summary = summarize(incoming, existing, diff);

	if (!confirm || problems.length) {
		return json({ ok: problems.length === 0, problems, diff, summary }, { status: 200, headers: NO_STORE });
	}

	// CONFIRMED. The package first, so the pool's topics exist.
	const saved = await locals.supabase.rpc('cert_admin_save', {
		p_id: existing?.id ?? null,
		p_package: incoming.package,
		p_note: `Imported package${existing ? '' : ' (new draft)'}`
	});
	if (saved.error) return rpcFailure(saved.error);
	if (isRefusalObject(saved.data)) return json({ ...saved.data, ok: false, diff, summary }, { status: 409, headers: NO_STORE });
	const savedJson = (saved.data ?? {}) as { id?: string; revision?: number; revision_id?: string; publish_problems?: unknown };
	const id = typeof savedJson.id === 'string' ? savedJson.id : (existing?.id ?? '');
	if (!UUID_RE.test(id)) return refuse('save_shape', 'The save answered without an id.', 500);

	const pool = await locals.supabase.rpc('cert_exam_pool_replace', { p_cert: id, p_questions: incoming.pool });
	if (pool.error) return json({ ...rpcBody(pool.error), id, revision: savedJson.revision ?? null, step: 'pool' }, { status: 500, headers: NO_STORE });
	if (isRefusalObject(pool.data)) return json({ ...pool.data, ok: false, id, revision: savedJson.revision ?? null, step: 'pool' }, { status: 409, headers: NO_STORE });

	const lessonsSaved: string[] = [];
	for (const lesson of incoming.lessons) {
		const r = await locals.supabase.rpc('cert_lesson_save', {
			p_cert: id,
			p_slug: lesson.slug,
			p_title: lesson.title,
			p_document: lesson.document,
			p_manifest: lesson.manifest
		});
		if (r.error) return json({ ...rpcBody(r.error), id, revision: savedJson.revision ?? null, step: `lesson:${lesson.slug}` }, { status: 500, headers: NO_STORE });
		if (isRefusalObject(r.data)) return json({ ...r.data, ok: false, id, revision: savedJson.revision ?? null, step: `lesson:${lesson.slug}` }, { status: 409, headers: NO_STORE });
		lessonsSaved.push(lesson.slug);
	}

	let mirror: unknown = null;
	try {
		mirror = await sendMirror('catalog', locals.supabase);
	} catch {
		mirror = null;
	}
	return json(
		{
			ok: true,
			id,
			revision: savedJson.revision ?? null,
			revision_id: savedJson.revision_id ?? null,
			publish_problems: Array.isArray(savedJson.publish_problems) ? savedJson.publish_problems : [],
			pool: pool.data ?? null,
			lessons: lessonsSaved,
			summary,
			mirror
		},
		{ status: 200, headers: NO_STORE }
	);
};

function rpcBody(error: { code?: string | null; message?: string | null }) {
	return { ok: false, reason: 'rpc_error', code: error.code ?? null, message: error.message ?? 'The database refused this request.' };
}
