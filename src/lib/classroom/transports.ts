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
	normalizeSubmissionRow,
	type AssignmentEngineTransports,
	type AssignmentTeacherTransports,
	type EngineOpResult,
	type ModuleApprovalRow,
	type ResponseRow,
	type StudentEngineData,
	type SubmissionFileRow
} from './assignment-spec';
import {
	normalizeItemRow,
	normalizeSectionRow,
	type ClassroomAttachment,
	type ClassroomCourse,
	type ClassroomEnrollment,
	type ClassroomItem,
	type ClassroomManageTransports,
	type ImportSummary,
	type ItemLink,
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
 * The instructor-only counterpart of uploadAttachment/deleteAttachment (0090):
 * same shape, a DIFFERENT route (/api/classroom/instructor-attachment), whose
 * proxy has no ?as= support at all -- there is nothing view-as-student could
 * ever be pointed at here.
 */
async function uploadInstructorAttachment(itemId: string, file: File): Promise<TxResult<undefined>> {
	const form = new FormData();
	form.set('file', file, file.name);
	form.set('item_id', itemId);
	try {
		const res = await fetch('/api/classroom/instructor-attachment', { method: 'POST', body: form });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Upload failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Upload failed.' };
	}
}

async function deleteInstructorAttachment(id: string): Promise<TxResult<undefined>> {
	try {
		const res = await fetch(`/api/classroom/instructor-attachment/${id}`, { method: 'DELETE' });
		if (!res.ok) {
			const body = (await res.json().catch(() => null)) as { error?: string } | null;
			return { ok: false, message: body?.error ?? `Remove failed (${res.status}).` };
		}
		return { ok: true, data: undefined };
	} catch (e) {
		return { ok: false, message: (e as Error).message || 'Remove failed.' };
	}
}

const INSTRUCTOR_ATTACHMENT_SELECT = 'id, item_id, filename, mime_type, size_bytes, sort_order';
const INSTRUCTOR_RESOURCE_SELECT = 'id, item_id, label, url, sort_order';

/**
 * Fetches instructor-only attachments + links for a batch of items and merges
 * them in. NEVER called for a non-manager: every server load that reads
 * `canManage === true` calls this explicitly, and every other read simply
 * never does -- so a student's item read never even carries the query, and
 * `instructorAttachments`/`instructorLinks` stay `undefined` for them (RLS
 * would also return nothing, but the caller is not supposed to ask).
 */
export async function mergeInstructorMaterials(
	supabase: SupabaseClient,
	items: ClassroomItem[]
): Promise<ClassroomItem[]> {
	if (!items.length) return items;
	const ids = items.map((i) => i.id);
	const [attRes, linkRes] = await Promise.all([
		supabase
			.from('classroom_instructor_attachments')
			.select(INSTRUCTOR_ATTACHMENT_SELECT)
			.in('item_id', ids)
			.order('sort_order'),
		supabase
			.from('classroom_instructor_resources')
			.select(INSTRUCTOR_RESOURCE_SELECT)
			.in('item_id', ids)
			.order('sort_order')
	]);

	const attByItem = new Map<string, ClassroomAttachment[]>();
	for (const row of (attRes.data ?? []) as Record<string, unknown>[]) {
		const key = String(row.item_id);
		const list = attByItem.get(key) ?? [];
		list.push({
			id: String(row.id),
			filename: String(row.filename),
			mime_type: String(row.mime_type),
			size_bytes: (row.size_bytes as number | null) ?? null,
			sort_order: Number(row.sort_order ?? 0)
		});
		attByItem.set(key, list);
	}

	const linksByItem = new Map<string, ItemLink[]>();
	for (const row of (linkRes.data ?? []) as Record<string, unknown>[]) {
		const key = String(row.item_id);
		const list = linksByItem.get(key) ?? [];
		list.push({
			id: String(row.id),
			label: String(row.label),
			url: String(row.url),
			sort_order: Number(row.sort_order ?? 0)
		});
		linksByItem.set(key, list);
	}

	return items.map((i) => ({
		...i,
		instructorAttachments: attByItem.get(i.id) ?? [],
		instructorLinks: linksByItem.get(i.id) ?? []
	}));
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

const SUBMISSION_SELECT =
	'id, item_id, student_email, state, submitted_at, returned_at, rubric_scores, score, ' +
	'teacher_comment, graded_by, graded_at, updated_at';

const SUBMISSION_FILE_SELECT =
	'id, submission_id, block_id, caption, filename, mime_type, size_bytes, sort_order';

function opResult(res: unknown): { ok: true; data: EngineOpResult } {
	return { ok: true, data: (res ?? { ok: true }) as EngineOpResult };
}

/**
 * The student half of the assignment engine: autosave, files, submit,
 * unsubmit. Reads are RLS-scoped selects with NO student_email filter (the
 * /coin-balance doctrine -- the policy IS the filter); writes are the 0086
 * SECURITY DEFINER RPCs, which resolve the caller themselves.
 */
export function createEngineTransports(supabase: SupabaseClient): AssignmentEngineTransports {
	return {
		async saveResponse(itemId, blockId, value) {
			const { data: res, error } = await supabase.rpc('classroom_save_response', {
				p_item_id: itemId,
				p_block_id: blockId,
				p_value: value
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async submitAssignment(itemId) {
			const { data: res, error } = await supabase.rpc('classroom_submit_assignment', {
				p_item_id: itemId
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async unsubmitAssignment(itemId) {
			const { data: res, error } = await supabase.rpc('classroom_unsubmit_assignment', {
				p_item_id: itemId
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async uploadSubmissionFile(itemId, file, blockId = null, caption = null) {
			const form = new FormData();
			form.set('file', file, file.name);
			form.set('item_id', itemId);
			if (blockId) form.set('block_id', blockId);
			if (caption) form.set('caption', caption);
			try {
				const res = await fetch('/api/classroom/submission-file', { method: 'POST', body: form });
				const body = (await res.json().catch(() => null)) as
					| { error?: string; reason?: string; file?: SubmissionFileRow }
					| null;
				if (!res.ok) {
					return { ok: false, message: body?.error ?? `Upload failed (${res.status}).` };
				}
				return { ok: true, data: { file: body?.file, reason: body?.reason } };
			} catch (e) {
				return { ok: false, message: (e as Error).message || 'Upload failed.' };
			}
		},
		async deleteSubmissionFile(fileId) {
			try {
				const res = await fetch(`/api/classroom/submission-file/${fileId}`, { method: 'DELETE' });
				const body = (await res.json().catch(() => null)) as
					| { error?: string; reason?: string }
					| null;
				if (!res.ok) {
					return { ok: false, message: body?.error ?? `Remove failed (${res.status}).` };
				}
				return { ok: true, data: (body ?? { ok: true }) as EngineOpResult };
			} catch (e) {
				return { ok: false, message: (e as Error).message || 'Remove failed.' };
			}
		},
		async setFileCaption(fileId, caption) {
			const { data: res, error } = await supabase.rpc('classroom_set_submission_file_caption', {
				p_id: fileId,
				p_caption: caption
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async reloadStudent(itemId) {
			const data = await loadStudentEngineData(supabase, itemId);
			if (!data) return { ok: false, message: 'Could not reload this assignment.' };
			return { ok: true, data };
		}
	};
}

/**
 * The caller's OWN engine slice for one assignment. Every select here is
 * RLS-scoped with no student filter; for a student the policies return exactly
 * their own rows. (A manager would legitimately read every student's rows
 * through the same policies -- which is why this is only ever called for the
 * non-manager view; the grading console loads per-item data explicitly.)
 */
export async function loadStudentEngineData(
	supabase: SupabaseClient,
	itemId: string
): Promise<StudentEngineData | null> {
	const [specRes, rubricRes, submissionRes, responsesRes, filesRes, approvalsRes] =
		await Promise.all([
			supabase.from('classroom_assignment_specs').select('spec').eq('item_id', itemId).maybeSingle(),
			supabase.from('classroom_rubrics').select('criteria').eq('item_id', itemId).maybeSingle(),
			supabase.from('classroom_submissions').select(SUBMISSION_SELECT).eq('item_id', itemId).maybeSingle(),
			supabase
				.from('classroom_responses')
				.select('item_id, student_email, block_id, value, updated_at')
				.eq('item_id', itemId),
			supabase
				.from('classroom_submission_files')
				.select(`${SUBMISSION_FILE_SELECT}, classroom_submissions!inner(item_id)`)
				.eq('classroom_submissions.item_id', itemId)
				.order('sort_order'),
			supabase
				.from('classroom_module_approvals')
				.select('item_id, student_email, module_id, approved_by, approved_at')
				.eq('item_id', itemId)
		]);
	// The spec/rubric miss is an ordinary state; a TABLE-level error (0086 not
	// applied) reads as "no engine" and the caller falls soft.
	if (specRes.error && submissionRes.error) return null;
	return {
		spec: (specRes.data?.spec as StudentEngineData['spec']) ?? null,
		rubric: (rubricRes.data?.criteria as StudentEngineData['rubric']) ?? null,
		submission: submissionRes.data
			? normalizeSubmissionRow(submissionRes.data as unknown as Record<string, unknown>)
			: null,
		responses: (responsesRes.data ?? []) as ResponseRow[],
		files: (filesRes.data ?? []) as SubmissionFileRow[],
		approvals: (approvalsRes.data ?? []) as ModuleApprovalRow[]
	};
}

/** The teacher half: spec import, rubric, grading, the approval gate. */
export function createTeacherEngineTransports(
	supabase: SupabaseClient
): AssignmentTeacherTransports {
	return {
		async setSpec(itemId, spec) {
			const { error } = await supabase.rpc('classroom_set_assignment_spec', {
				p_item_id: itemId,
				p_spec: spec
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async setRubric(itemId, criteria) {
			const { error } = await supabase.rpc('classroom_set_rubric', {
				p_item_id: itemId,
				p_criteria: criteria
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async gradeSubmission(itemId, studentEmail, scores, comment, release) {
			const { data: res, error } = await supabase.rpc('classroom_grade_submission', {
				p_item_id: itemId,
				p_student_email: studentEmail,
				p_scores: scores,
				p_comment: comment,
				p_return: release
			});
			if (error) return fail(error);
			return opResult(res);
		},
		async approveModule(itemId, studentEmail, moduleId, approved) {
			const { error } = await supabase.rpc('classroom_approve_module', {
				p_item_id: itemId,
				p_student_email: studentEmail,
				p_module_id: moduleId,
				p_approved: approved
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async loadGrading(itemId, sectionId) {
			const [rosterRes, submissionsRes, responsesRes, filesRes, approvalsRes] =
				await Promise.all([
					supabase
						.from('classroom_enrollments')
						.select('section_id, student_email, display_name, active, updated_at')
						.eq('section_id', sectionId)
						.order('display_name'),
					supabase.from('classroom_submissions').select(SUBMISSION_SELECT).eq('item_id', itemId),
					supabase
						.from('classroom_responses')
						.select('item_id, student_email, block_id, value, updated_at')
						.eq('item_id', itemId),
					supabase
						.from('classroom_submission_files')
						.select(`${SUBMISSION_FILE_SELECT}, classroom_submissions!inner(item_id)`)
						.eq('classroom_submissions.item_id', itemId)
						.order('sort_order'),
					supabase
						.from('classroom_module_approvals')
						.select('item_id, student_email, module_id, approved_by, approved_at')
						.eq('item_id', itemId)
				]);
			if (rosterRes.error) return fail(rosterRes.error);
			return {
				ok: true,
				data: {
					roster: (rosterRes.data ?? []) as ClassroomEnrollment[],
					submissions: ((submissionsRes.data ?? []) as unknown as Record<string, unknown>[]).map(
						normalizeSubmissionRow
					),
					responses: (responsesRes.data ?? []) as ResponseRow[],
					files: (filesRes.data ?? []) as SubmissionFileRow[],
					approvals: (approvalsRes.data ?? []) as ModuleApprovalRow[]
				}
			};
		}
	};
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
			// The manage console is teacher-only for the whole route, so every
			// item it lists gets its instructor-only materials merged in.
			return { ok: true, data: { items: await mergeInstructorMaterials(supabase, items) } };
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
		deleteAttachment,
		uploadInstructorAttachment,
		deleteInstructorAttachment,
		async setInstructorResources(itemId, links) {
			const { error } = await supabase.rpc('classroom_set_instructor_resources', {
				p_item_id: itemId,
				p_resources: links
			});
			return error ? fail(error) : { ok: true, data: undefined };
		}
	};
}
