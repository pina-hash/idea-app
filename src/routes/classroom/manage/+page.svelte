<script lang="ts">
	import ManageConsole from '$lib/classroom/ManageConsole.svelte';
	import {
		normalizeAssignmentRow,
		normalizeSectionRow,
		type ClassroomCourse,
		type ClassroomEnrollment,
		type ClassroomManageTransports,
		type ClassroomPost,
		type ImportSummary
	} from '$lib/classroom/classroom';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The REAL transports: thin callers of the 0082 SECURITY DEFINER RPCs plus
	 * RLS-scoped selects, run on the browser client. Every 0082 rule (teacher
	 * of record, publish-target authorization, roster idempotency) lives in
	 * the database -- these only carry refusals back for the console to show.
	 */
	function fail(error: { message?: string } | null): { ok: false; message: string } {
		return { ok: false, message: error?.message ?? 'Something went wrong.' };
	}

	const transports: ClassroomManageTransports = {
		async upsertCourse(code, title) {
			const { data: res, error } = await data.supabase.rpc('classroom_upsert_course', {
				p_code: code,
				p_title: title
			});
			if (error) return fail(error);
			const r = res as { course_id: string; created: boolean };
			return { ok: true, data: { courseId: r.course_id, created: r.created === true } };
		},
		async upsertSection(courseId, label, block, id = null) {
			const args: Record<string, unknown> = {
				p_course_id: courseId,
				p_label: label,
				p_block: block
			};
			if (id) args.p_id = id;
			const { data: res, error } = await data.supabase.rpc('classroom_upsert_section', args);
			if (error) return fail(error);
			return { ok: true, data: { sectionId: (res as { section_id: string }).section_id } };
		},
		async reloadSections() {
			const [sectionsRes, coursesRes] = await Promise.all([
				data.supabase
					.from('classroom_sections')
					.select(
						'id, course_id, label, block, teacher_email, classroom_courses(id, code, title, active)'
					),
				data.supabase.from('classroom_courses').select('id, code, title, active').order('code')
			]);
			if (sectionsRes.error) return fail(sectionsRes.error);
			return {
				ok: true,
				data: {
					sections: ((sectionsRes.data ?? []) as Record<string, unknown>[]).map(
						normalizeSectionRow
					),
					courses: (coursesRes.data ?? []) as ClassroomCourse[]
				}
			};
		},
		async loadRoster(sectionId) {
			const { data: rows, error } = await data.supabase
				.from('classroom_enrollments')
				.select('section_id, student_email, display_name, active, updated_at')
				.eq('section_id', sectionId)
				.order('display_name');
			if (error) return fail(error);
			return { ok: true, data: (rows ?? []) as ClassroomEnrollment[] };
		},
		async setEnrollment(sectionId, email, name, active) {
			const { error } = await data.supabase.rpc('classroom_set_enrollment', {
				p_section_id: sectionId,
				p_student_email: email,
				p_display_name: name,
				p_active: active
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async importRoster(rows) {
			const { data: res, error } = await data.supabase.rpc('classroom_import_roster', {
				p_rows: rows
			});
			if (error) return fail(error);
			return { ok: true, data: res as ImportSummary };
		},
		async loadContent(sectionId) {
			const [postsRes, asgRes] = await Promise.all([
				data.supabase
					.from('classroom_posts')
					.select(
						'id, section_id, group_id, title, body, author_email, author_name, published, created_at, updated_at'
					)
					.eq('section_id', sectionId)
					.order('created_at', { ascending: false }),
				data.supabase
					.from('classroom_assignments')
					.select(
						'id, section_id, group_id, title, description, points, due_at, category, author_email, author_name, published, created_at, updated_at, classroom_assignment_resources(id, label, url, sort_order)'
					)
					.eq('section_id', sectionId)
					.order('created_at', { ascending: false })
			]);
			if (postsRes.error) return fail(postsRes.error);
			if (asgRes.error) return fail(asgRes.error);
			return {
				ok: true,
				data: {
					posts: (postsRes.data ?? []) as ClassroomPost[],
					assignments: ((asgRes.data ?? []) as Record<string, unknown>[]).map(
						normalizeAssignmentRow
					)
				}
			};
		},
		async createPost(sectionIds, body, title, published) {
			const { error } = await data.supabase.rpc('classroom_create_post', {
				p_section_ids: sectionIds,
				p_body: body,
				p_title: title,
				p_published: published
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async updatePost(id, body, title, published) {
			const { error } = await data.supabase.rpc('classroom_update_post', {
				p_id: id,
				p_body: body,
				p_title: title,
				p_published: published
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async deletePost(id) {
			const { error } = await data.supabase.rpc('classroom_delete_post', { p_id: id });
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async createAssignment(sectionIds, input, published) {
			const { error } = await data.supabase.rpc('classroom_create_assignment', {
				p_section_ids: sectionIds,
				p_title: input.title,
				p_description: input.description,
				p_points: input.points,
				p_due_at: input.dueAt,
				p_category: input.category,
				p_published: published,
				p_resources: input.resources
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async updateAssignment(id, input, published) {
			const { error } = await data.supabase.rpc('classroom_update_assignment', {
				p_id: id,
				p_title: input.title,
				p_description: input.description,
				p_points: input.points,
				p_due_at: input.dueAt,
				p_category: input.category,
				p_published: published,
				p_resources: input.resources
			});
			return error ? fail(error) : { ok: true, data: undefined };
		},
		async deleteAssignment(id) {
			const { error } = await data.supabase.rpc('classroom_delete_assignment', { p_id: id });
			return error ? fail(error) : { ok: true, data: undefined };
		}
	};
</script>

<ManageConsole
	ready={data.ready}
	email={data.email}
	initialSections={data.sections}
	initialCourses={data.courses}
	{transports}
/>
