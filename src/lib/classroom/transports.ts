/**
 * The REAL classroom transports: thin callers of the 0082/0083 SECURITY
 * DEFINER RPCs plus RLS-scoped selects, run on the browser client.
 *
 * ONE module, not one per route: the manage console, the class stream and the
 * assignment detail page all mount the same composer, so they must all reach
 * the same calls -- a per-page copy is how a surface quietly ends up talking to
 * a stale RPC signature. Every classroom rule (teacher of record, publish-target
 * authorization, draft visibility) lives in the database; these only carry
 * refusals back for a component to render.
 *
 * The two file paths are HTTP routes rather than RPCs on purpose: an upload
 * needs the school account's Drive credentials, and a delete needs to sweep the
 * blob the row was the last reference to -- neither is something a browser can
 * or should do.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
	normalizeAssignmentRow,
	normalizePostRow,
	normalizeSectionRow,
	type ClassroomAssignment,
	type ClassroomCourse,
	type ClassroomEnrollment,
	type ClassroomManageTransports,
	type ClassroomPost,
	type ImportSummary,
	type SectionDeleteResult,
	type TxResult
} from './classroom';

export const SECTION_SELECT =
	'id, course_id, label, block, teacher_email, active, classroom_courses(id, code, title, active)';
export const POST_SELECT =
	'id, section_id, group_id, title, body, author_email, author_name, published, created_at, updated_at, ' +
	'classroom_attachments(id, filename, mime_type, size_bytes, sort_order)';
export const ASSIGNMENT_SELECT =
	'id, section_id, group_id, title, description, points, due_at, category, author_email, author_name, ' +
	'published, created_at, updated_at, classroom_assignment_resources(id, label, url, sort_order), ' +
	'classroom_attachments(id, filename, mime_type, size_bytes, sort_order)';

function fail(error: { message?: string } | null): { ok: false; message: string } {
	return { ok: false, message: error?.message ?? 'Something went wrong.' };
}

/** post_ids / assignment_ids come back as a jsonb array from the create RPCs. */
function idsOf(res: unknown, key: 'post_ids' | 'assignment_ids'): string[] {
	const value = (res as Record<string, unknown> | null)?.[key];
	return Array.isArray(value) ? (value as string[]) : [];
}

async function uploadAttachment(
	ownerKind: 'post' | 'assignment',
	ownerIds: string[],
	file: File
): Promise<TxResult<undefined>> {
	const form = new FormData();
	form.set('file', file, file.name);
	form.set('owner_kind', ownerKind);
	form.set('owner_ids', ownerIds.join(','));
	try {
		const res = await fetch('/api/classroom/attachment', { method: 'POST', body: form });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Upload failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Upload failed.' };
	}
}

async function deleteAttachment(id: string): Promise<TxResult<undefined>> {
	try {
		const res = await fetch(`/api/classroom/attachment/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Remove failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Remove failed.' };
	}
}

/**
 * Deleting content goes through a ROUTE, not the RPC directly: the cascade
 * takes the attachment rows with it, and the Drive blobs they were the last
 * reference to have to be swept server-side (see /api/classroom/delete-content).
 */
async function deleteContent(kind: 'post' | 'assignment', id: string): Promise<TxResult<undefined>> {
	try {
		const res = await fetch('/api/classroom/delete-content', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ kind, id })
		});
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Delete failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Delete failed.' };
	}
}

export function createClassroomTransports(supabase: SupabaseClient): ClassroomManageTransports {
	return {
		async upsertCourse(code, title, active = true, id = null) {
			const args: Record<string, unknown> = { p_code: code, p_title: title, p_active: active };
			if (id) args.p_id = id;
			const { data: res, error } = await supabase.rpc('classroom_upsert_course', args);
			if (error) return fail(error);
			const r = res as { course_id: string; created: boolean };
			return { ok: true, data: { courseId: r.course_id, created: r.created === true } };
		},
		async upsertSection(courseId, label, block, id = null, teacherEmail = null) {
			const args: Record<string, unknown> = {
				p_course_id: courseId,
				p_label: label,
				p_block: block
			};
			if (teacherEmail) args.p_teacher_email = teacherEmail;
			if (id) args.p_id = id;
			const { data: res, error } = await supabase.rpc('classroom_upsert_section', args);
			if (error) return fail(error);
			return { ok: true, data: { sectionId: (res as { section_id: string }).section_id } };
		},
		async setSectionActive(id, active) {
			const { error } = await supabase.rpc('classroom_set_section_active', {
				p_id: id,
				p_active: active
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async deleteSection(id, confirmLabel) {
			const { data: res, error } = await supabase.rpc('classroom_delete_section', {
				p_id: id,
				p_confirm_label: confirmLabel
			});
			if (error) return fail(error);
			return { ok: true, data: res as SectionDeleteResult };
		},
		async reloadSections() {
			const [sectionsRes, coursesRes] = await Promise.all([
				supabase.from('classroom_sections').select(SECTION_SELECT),
				supabase.from('classroom_courses').select('id, code, title, active').order('code')
			]);
			if (sectionsRes.error) return fail(sectionsRes.error);
			return {
				ok: true,
				data: {
					sections: ((sectionsRes.data ?? []) as Record<string, unknown>[]).map(normalizeSectionRow),
					courses: (coursesRes.data ?? []) as ClassroomCourse[]
				}
			};
		},
		async loadRoster(sectionId) {
			const { data: rows, error } = await supabase
				.from('classroom_enrollments')
				.select('section_id, student_email, display_name, active, updated_at')
				.eq('section_id', sectionId)
				.order('display_name');
			if (error) return fail(error);
			return { ok: true, data: (rows ?? []) as ClassroomEnrollment[] };
		},
		async setEnrollment(sectionId, email, name, active) {
			const { error } = await supabase.rpc('classroom_set_enrollment', {
				p_section_id: sectionId,
				p_student_email: email,
				p_display_name: name,
				p_active: active
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async updateEnrollment(sectionId, email, newEmail, name) {
			const { data: res, error } = await supabase.rpc('classroom_update_enrollment', {
				p_section_id: sectionId,
				p_student_email: email,
				p_new_email: newEmail,
				p_display_name: name
			});
			if (error) return fail(error);
			return { ok: true, data: res as { ok: boolean; reason?: string } };
		},
		async importRoster(rows) {
			const { data: res, error } = await supabase.rpc('classroom_import_roster', { p_rows: rows });
			if (error) return fail(error);
			return { ok: true, data: res as ImportSummary };
		},
		async loadContent(sectionId) {
			const [postsRes, asgRes] = await Promise.all([
				supabase
					.from('classroom_posts')
					.select(POST_SELECT)
					.eq('section_id', sectionId)
					.order('created_at', { ascending: false }),
				supabase
					.from('classroom_assignments')
					.select(ASSIGNMENT_SELECT)
					.eq('section_id', sectionId)
					.order('created_at', { ascending: false })
			]);
			if (postsRes.error) return fail(postsRes.error);
			if (asgRes.error) return fail(asgRes.error);
			return {
				ok: true,
				data: {
					posts: ((postsRes.data ?? []) as unknown as Record<string, unknown>[]).map(
						normalizePostRow
					) as ClassroomPost[],
					assignments: ((asgRes.data ?? []) as unknown as Record<string, unknown>[]).map(
						normalizeAssignmentRow
					) as ClassroomAssignment[]
				}
			};
		},
		async createPost(sectionIds, body, title, published) {
			const { data: res, error } = await supabase.rpc('classroom_create_post', {
				p_section_ids: sectionIds,
				p_body: body,
				p_title: title,
				p_published: published
			});
			return error ? fail(error) : { ok: true, data: { ids: idsOf(res, 'post_ids') } };
		},
		async updatePost(id, body, title, published) {
			const { error } = await supabase.rpc('classroom_update_post', {
				p_id: id,
				p_body: body,
				p_title: title,
				p_published: published
			});
			return error ? fail(error) : { ok: true, data: { ids: [id] } };
		},
		deletePost: (id) => deleteContent('post', id),
		async createAssignment(sectionIds, input, published) {
			const { data: res, error } = await supabase.rpc('classroom_create_assignment', {
				p_section_ids: sectionIds,
				p_title: input.title,
				p_description: input.description,
				p_points: input.points,
				p_due_at: input.dueAt,
				p_category: input.category,
				p_published: published,
				p_resources: input.resources
			});
			return error ? fail(error) : { ok: true, data: { ids: idsOf(res, 'assignment_ids') } };
		},
		async updateAssignment(id, input, published) {
			const { error } = await supabase.rpc('classroom_update_assignment', {
				p_id: id,
				p_title: input.title,
				p_description: input.description,
				p_points: input.points,
				p_due_at: input.dueAt,
				p_category: input.category,
				p_published: published,
				p_resources: input.resources
			});
			return error ? fail(error) : { ok: true, data: { ids: [id] } };
		},
		deleteAssignment: (id) => deleteContent('assignment', id),
		uploadAttachment,
		deleteAttachment
	};
}
