import { error, redirect } from '@sveltejs/kit';
import { deskShell } from '$lib/certifications/student/shell';
import { requireCertAdmin, requireCertifier } from '$lib/server/certifications/gate';
import { CERT_PATHS } from '$lib/certifications/nav';
import { isRefusal, type CertPackage, type ExamQuestion } from '$lib/certifications/types';
import { extractManifestScript } from '$lib/classroom/html-assignment/manifest';
import type { AdminGetJson, AdminListRow } from '$lib/certifications/desk/desk';
import { dataOrNull, isUuid, loadRpc, refuseAction, runAction, str } from '../../desk-server';
import type { Actions, PageServerLoad } from './$types';

/**
 * THE EDITOR PAGE (a certifier reads, an admin writes): `cert_admin_get` for
 * the certification and its current package, the pool with its keys for an
 * admin alone (`cert_exam_pool_get`), and every other certification for the
 * prerequisite boxes. The actions are the engine's whole write surface:
 * `save` (a new revision from the package the page posts as JSON), `publish`,
 * `hide`, `retire`, `delete`, `savePool`, `saveLesson`, `deleteLesson`. Each
 * catalog write fires the mirror, wrapped.
 */
export const load: PageServerLoad = async ({ locals, params, parent }) => {
	await requireCertifier(locals);
	if (!isUuid(params.id)) error(404, 'Not found');
	const { isAdmin } = await parent();
	const [cert, list] = await Promise.all([
		loadRpc<AdminGetJson>(locals.supabase, 'cert_admin_get', { p_id: params.id }),
		loadRpc<AdminListRow[]>(locals.supabase, 'cert_admin_list')
	]);
	if (!cert.ok) return { title: 'Engine', shell: deskShell('Engine'), unavailable: true as const, cert: null, pool: null, others: [] };
	if (!cert.data || isRefusal(cert.data)) error(404, 'Not found');
	let pool: ExamQuestion[] | null = null;
	if (isAdmin) {
		const got = await loadRpc<ExamQuestion[]>(locals.supabase, 'cert_exam_pool_get', { p_cert: params.id });
		pool = Array.isArray(dataOrNull(got)) ? (dataOrNull(got) as ExamQuestion[]) : [];
	}
	const others = (dataOrNull(list) ?? []).filter((r) => r.id !== params.id).map((r) => ({ code: r.code, name: r.name }));
	return { title: `${cert.data.code} in the engine`, shell: deskShell(`${cert.data.code} in the engine`), unavailable: false as const, cert: cert.data, pool, others };
};

function parsePackage(raw: string): CertPackage | null {
	try {
		const p = JSON.parse(raw) as CertPackage;
		return p && typeof p === 'object' && typeof p.code === 'string' ? p : null;
	} catch {
		return null;
	}
}

export const actions: Actions = {
	save: async ({ request, locals, url, params }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const pkg = parsePackage(str(form, 'package'));
		if (!pkg) return refuseAction('save', 'The package did not arrive as JSON.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'save',
			fn: 'cert_admin_save',
			args: { p_id: params.id, p_package: pkg, p_note: str(form, 'note') || null },
			mirror: 'catalog',
			okMessage: (d) => `Saved as revision ${d.revision ?? '?'}.`,
			extra: (d) => ({ revision: d.revision ?? null, revision_id: d.revision_id ?? null, publish_problems: Array.isArray(d.publish_problems) ? d.publish_problems : [] })
		});
	},
	publish: async ({ locals, url, params }) => {
		await requireCertAdmin(locals);
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'publish',
			fn: 'cert_admin_publish',
			args: { p_id: params.id },
			mirror: 'catalog',
			okMessage: () => 'Published. Students can see and start it now.'
		});
	},
	hide: async ({ locals, url, params }) => {
		await requireCertAdmin(locals);
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'hide',
			fn: 'cert_admin_hide',
			args: { p_id: params.id },
			mirror: 'catalog',
			okMessage: () => 'Hidden: it is a draft again and students cannot see it.'
		});
	},
	retire: async ({ locals, url, params }) => {
		await requireCertAdmin(locals);
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'retire',
			fn: 'cert_admin_retire',
			args: { p_id: params.id },
			mirror: 'catalog',
			okMessage: () => 'Retired. No new starts; every award stays valid.'
		});
	},
	delete: async ({ locals, url, params }) => {
		await requireCertAdmin(locals);
		const answer = await runAction({
			supabase: locals.supabase,
			url,
			action: 'delete',
			fn: 'cert_admin_delete',
			args: { p_id: params.id },
			mirror: 'catalog',
			okMessage: () => 'Deleted.'
		});
		if ('ok' in answer && answer.ok) redirect(303, CERT_PATHS.deskEngine);
		return answer;
	},
	savePool: async ({ request, locals, url, params }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		let questions: unknown;
		try {
			questions = JSON.parse(str(form, 'questions'));
		} catch {
			return refuseAction('savePool', 'The pool did not arrive as JSON.');
		}
		if (!Array.isArray(questions)) return refuseAction('savePool', 'The pool is a list of questions.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'savePool',
			fn: 'cert_exam_pool_replace',
			args: { p_cert: params.id, p_questions: questions },
			okMessage: (d) => `Pool saved: ${d.total ?? questions.length} active question${d.total === 1 ? '' : 's'}.`
		});
	},
	saveLesson: async ({ request, locals, url, params }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const slug = str(form, 'slug').toLowerCase();
		const title = str(form, 'title');
		const document = String(form.get('document') ?? '');
		if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) return refuseAction('saveLesson', 'The slug is lowercase letters, digits and hyphens, up to 64 characters.');
		if (!title) return refuseAction('saveLesson', 'A title is required.');
		if (!document.trim()) return refuseAction('saveLesson', 'The document is empty.');
		let manifest: Record<string, unknown> = {};
		const found = extractManifestScript(document);
		if (found.count > 1) return refuseAction('saveLesson', 'The document carries more than one manifest block.');
		if (found.json) {
			try {
				const parsed = JSON.parse(found.json) as unknown;
				if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return refuseAction('saveLesson', 'The manifest is not a JSON object.');
				manifest = parsed as Record<string, unknown>;
			} catch {
				return refuseAction('saveLesson', 'The manifest block is not valid JSON.');
			}
		}
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'saveLesson',
			fn: 'cert_lesson_save',
			args: { p_cert: params.id, p_slug: slug, p_title: title, p_document: document, p_manifest: manifest },
			okMessage: () => `Lesson ${slug} saved. Add it to the training list and save a revision to use it.`
		});
	},
	deleteLesson: async ({ request, locals, url, params }) => {
		await requireCertAdmin(locals);
		const form = await request.formData();
		const slug = str(form, 'slug').toLowerCase();
		if (!slug) return refuseAction('deleteLesson', 'The lesson was not named.');
		return runAction({
			supabase: locals.supabase,
			url,
			action: 'deleteLesson',
			fn: 'cert_lesson_delete',
			args: { p_cert: params.id, p_slug: slug },
			okMessage: () => `Lesson ${slug} deleted.`
		});
	}
};
