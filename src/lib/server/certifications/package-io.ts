import type { SupabaseClient } from '@supabase/supabase-js';
import type { CertPackage, ExamQuestion } from '$lib/certifications/types';
import type { PackageBundle, PackageLesson } from './package-zip';

/**
 * READING ONE CERTIFICATION'S WHOLE BUNDLE OFF THE DATABASE (ledger 0391),
 * shared by the package export and the import's diff: `cert_admin_get` (the
 * package and the lesson list), `cert_exam_pool_get` (every question with its
 * key, admin only) and `cert_lesson_document` per lesson. Every call runs on
 * the caller's own client, so the functions' own admin checks decide.
 */

export interface AdminGetJson {
	id: string;
	code: string;
	name?: string;
	state?: string;
	revision?: number;
	package: CertPackage;
	lessons?: { id: string; slug: string; title: string }[];
	revisions?: { id: string; revision: number }[];
	[key: string]: unknown;
}

export interface CurrentBundle {
	adminGet: AdminGetJson;
	bundle: PackageBundle;
}

export type BundleRead = { ok: true; current: CurrentBundle } | { ok: false; reason: string; message: string };

/** The pool function's answer, an array or an object carrying one. */
export function readPoolAnswer(data: unknown): ExamQuestion[] {
	const list = Array.isArray(data)
		? data
		: data && typeof data === 'object' && Array.isArray((data as { questions?: unknown }).questions)
			? (data as { questions: unknown[] }).questions
			: [];
	return list.filter((q): q is ExamQuestion => !!q && typeof q === 'object' && typeof (q as ExamQuestion).prompt === 'string');
}

/** `cert_admin_list`'s rows, an array or an object carrying one. */
export function readAdminList(data: unknown): { id: string; code: string; revision?: number }[] {
	const list = Array.isArray(data)
		? data
		: data && typeof data === 'object' && Array.isArray((data as { certifications?: unknown }).certifications)
			? (data as { certifications: unknown[] }).certifications
			: [];
	return list.filter(
		(c): c is { id: string; code: string; revision?: number } =>
			!!c && typeof c === 'object' && typeof (c as { id?: unknown }).id === 'string' && typeof (c as { code?: unknown }).code === 'string'
	);
}

export async function findCertificationByCode(supabase: SupabaseClient, code: string): Promise<{ id: string; revision?: number } | null> {
	const { data, error } = await supabase.rpc('cert_admin_list');
	if (error) return null;
	const wanted = code.trim().toUpperCase();
	return readAdminList(data).find((c) => c.code.toUpperCase() === wanted) ?? null;
}

export async function loadCurrentBundle(supabase: SupabaseClient, id: string): Promise<BundleRead> {
	const got = await supabase.rpc('cert_admin_get', { p_id: id });
	if (got.error) return { ok: false, reason: 'rpc_error', message: got.error.message };
	const adminGet = got.data as AdminGetJson | null;
	if (!adminGet || typeof adminGet !== 'object' || (adminGet as { ok?: unknown }).ok === false || !adminGet.package) {
		return { ok: false, reason: 'not_found', message: 'No such certification.' };
	}
	const pool = await supabase.rpc('cert_exam_pool_get', { p_cert: id });
	if (pool.error) return { ok: false, reason: 'rpc_error', message: pool.error.message };
	const lessons: PackageLesson[] = [];
	for (const ref of adminGet.lessons ?? []) {
		if (!ref || typeof ref.id !== 'string') continue;
		const doc = await supabase.rpc('cert_lesson_document', { p_id: ref.id });
		if (doc.error) return { ok: false, reason: 'rpc_error', message: doc.error.message };
		const d = doc.data as { title?: string; document?: string; manifest?: unknown } | null;
		if (!d || typeof d.document !== 'string') continue;
		lessons.push({
			slug: ref.slug,
			title: typeof d.title === 'string' && d.title ? d.title : ref.title ?? ref.slug,
			document: d.document,
			manifest: d.manifest && typeof d.manifest === 'object' && !Array.isArray(d.manifest) ? (d.manifest as Record<string, unknown>) : {}
		});
	}
	return { ok: true, current: { adminGet, bundle: { package: adminGet.package, pool: readPoolAnswer(pool.data), lessons } } };
}
