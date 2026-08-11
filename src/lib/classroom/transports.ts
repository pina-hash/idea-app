/**
 * The REAL classroom transports: thin callers of the 0082/0083/0085 SECURITY
 * DEFINER RPCs plus RLS-scoped selects, run on the browser client.
 *
 * ONE module, not one per route: the manage console, the class stream and the
 * item detail page all mount the same composer, so they must all reach the same
 * calls -- a per-page copy is how a surface quietly ends up talking to a stale
 * RPC signature. Every classroom rule (teacher of record, publish-target
 * authorization, draft visibility) lives in the database; these only carry
 * refusals back for a component to render.
 *
 * The three file paths are HTTP routes rather than RPCs on purpose: an upload
 * needs the school account's Drive credentials, and a delete needs to sweep the
 * blob the row was the last reference to -- neither is something a browser can
 * or should do.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { submitFeedback, type FeedbackEntry } from '$lib/feedback/feedback';
import {
	normalizeItemRow,
	normalizeSectionRow,
	type ClassroomCourse,
	type ClassroomEnrollment,
	type ClassroomItem,
	type ClassroomManageTransports,
	type ImportSummary,
	type LinkPreview,
	type SectionDeleteResult,
	type TxResult
} from './classroom';

/**
 * Link metadata for one URL, from OUR endpoint -- never the target site. A
 * browser cannot read another origin's <head> anyway, and going through the app
 * keeps the class's reading list off a third-party unfurler.
 *
 * Resolves null on any failure so a card degrades to a plain link, which is the
 * whole failure story: a preview that did not load is not an error state for
 * the page it sits on.
 */
export async function fetchLinkPreviewClient(url: string): Promise<LinkPreview | null> {
	try {
		const res = await fetch(`/api/classroom/link-preview?url=${encodeURIComponent(url)}`);
		if (!res.ok) return null;
		return (await res.json()) as LinkPreview;
	} catch {
		return null;
	}
}

/**
 * The classroom's feedback writer: a bound caller of the SHARED 0053 insert
 * (own-row RLS, no RPC -- a note about yourself has nothing to forge). Every
 * classroom page hands this to ClassroomFeedback so the control is identical
 * everywhere and only its `context` differs.
 */
export function classroomFeedbackSubmit(
	supabase: SupabaseClient,
	userId: string | null | undefined
): ((entry: FeedbackEntry) => Promise<{ error: string | null }>) | null {
	if (!userId) return null;
	return (entry) => submitFeedback(supabase, userId, entry);
}

export const SECTION_SELECT =
	'id, course_id, label, block, teacher_email, active, classroom_courses(id, code, title, active)';

/**
 * One canonical item and everything hanging off it. `classroom_postings` is
 * embedded NON-inner and unfiltered so an item carries the full list of classes
 * the caller may see it in -- which is what the linkage controls and the "also
 * posted to" line read. Filtering to one section happens on a SECOND embed
 * (see itemsForSection), never on this one.
 */
export const ITEM_SELECT =
	'id, kind, title, body, points, due_at, category, author_email, author_name, published, ' +
	'pinned, sort_order, first_published_at, edited_at, created_at, updated_at, ' +
	'classroom_item_resources(id, label, url, sort_order), ' +
	'classroom_attachments(id, filename, mime_type, size_bytes, sort_order), ' +
	'classroom_postings(id, section_id), ' +
	'classroom_item_views(viewed_at)';

function fail(error: { message?: string } | null): { ok: false; message: string } {
	return { ok: false, message: error?.message ?? 'Something went wrong.' };
}

/**
 * Every item posted to one section.
 *
 * The section filter rides an aliased INNER embed (`posted_in`) rather than the
 * `classroom_postings` embed above: PostgREST applies a filter to the embed it
 * names, so filtering the unaliased one would also trim the posting LIST down
 * to the single section -- and the "also posted to Period 2 and 3" line, which
 * the linkage controls depend on, would silently always read "just this class".
 */
export async function itemsForSection(
	supabase: SupabaseClient,
	sectionId: string
): Promise<{ items: ClassroomItem[]; error: { message?: string } | null }> {
	const { data, error } = await supabase
		.from('classroom_items')
		.select(`${ITEM_SELECT}, posted_in:classroom_postings!inner(section_id)`)
		.eq('posted_in.section_id', sectionId)
		.order('created_at', { ascending: false });
	return {
		items: ((data ?? []) as unknown as Record<string, unknown>[]).map(normalizeItemRow),
		error
	};
}

async function uploadAttachment(itemId: string, file: File): Promise<TxResult<undefined>> {
	const form = new FormData();
	form.set('file', file, file.name);
	form.set('item_id', itemId);
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
async function deleteItem(id: string): Promise<TxResult<undefined>> {
	try {
		const res = await fetch('/api/classroom/delete-content', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ id })
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
			const { items, error } = await itemsForSection(supabase, sectionId);
			if (error) return fail(error);
			return { ok: true, data: { items } };
		},
		async createItem(kind, sectionIds, input, published) {
			const { data: res, error } = await supabase.rpc('classroom_create_item', {
				p_kind: kind,
				p_section_ids: sectionIds,
				p_title: input.title,
				p_body: input.body,
				p_points: input.points,
				p_due_at: input.dueAt,
				p_category: input.category,
				p_published: published,
				p_resources: input.links
			});
			if (error) return fail(error);
			return { ok: true, data: { itemId: (res as { item_id: string }).item_id } };
		},
		async updateItem(id, input, published) {
			const { error } = await supabase.rpc('classroom_update_item', {
				p_id: id,
				p_title: input.title,
				p_body: input.body,
				p_points: input.points,
				p_due_at: input.dueAt,
				p_category: input.category,
				p_published: published,
				p_resources: input.links
			});
			return error ? fail(error) : { ok: true, data: { itemId: id } };
		},
		deleteItem,
		async duplicateItem(id) {
			const { data: res, error } = await supabase.rpc('classroom_duplicate_item', {
				p_item_id: id
			});
			if (error) return fail(error);
			return { ok: true, data: { itemId: (res as { item_id: string }).item_id } };
		},
		async addPostings(itemId, sectionIds) {
			const { data: res, error } = await supabase.rpc('classroom_add_postings', {
				p_item_id: itemId,
				p_section_ids: sectionIds
			});
			if (error) return fail(error);
			return { ok: true, data: { added: Number((res as { added?: number })?.added ?? 0) } };
		},
		async removePosting(itemId, sectionId) {
			const { data: res, error } = await supabase.rpc('classroom_remove_posting', {
				p_item_id: itemId,
				p_section_id: sectionId
			});
			if (error) return fail(error);
			return { ok: true, data: res as { ok: boolean; reason?: string } };
		},
		async setPinned(itemId, pinned) {
			const { error } = await supabase.rpc('classroom_set_item_pinned', {
				p_item_id: itemId,
				p_pinned: pinned
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async setOrder(itemIds) {
			const { error } = await supabase.rpc('classroom_set_item_order', { p_item_ids: itemIds });
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async markViewed(itemId) {
			const { error } = await supabase.rpc('classroom_mark_item_viewed', { p_item_id: itemId });
			return error ? fail(error) : { ok: true, data: undefined };
		},
		uploadAttachment,
		deleteAttachment
	};
}
