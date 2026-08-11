<script lang="ts">
	import { page } from '$app/state';
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import ClassPage from '$lib/classroom/ClassPage.svelte';
	import AssignmentDetail from '$lib/classroom/AssignmentDetail.svelte';
	import ManageConsole from '$lib/classroom/ManageConsole.svelte';
	import ImpersonationBanner from '$lib/classroom/ImpersonationBanner.svelte';
	import { registerLocalAttachmentUrl } from '$lib/classroom/classroom';
	import type {
		ClassroomAssignment,
		ClassroomAttachment,
		ClassroomCourse,
		ClassroomEnrollment,
		ClassroomManageTransports,
		ClassroomPost,
		ClassroomSection,
		ImportSummary,
		SectionDeleteResult
	} from '$lib/classroom/classroom';

	/**
	 * In-memory store driving the REAL components. It mirrors the 0082 rules
	 * closely enough to reach every refusal shape the console renders
	 * (teacher-of-record checks, the import's per-row reasons, idempotent
	 * upserts) -- the real enforcement is covered by
	 * tests/classroom-security.test.ts against real Postgres. Every transport
	 * call is logged verbatim below the view.
	 */

	const TEACHER = 'tvargas@boscotech.edu';
	const FOREIGN_TEACHER = 'mreed@boscotech.edu';

	let seq = $state(100);
	function nid(prefix: string): string {
		seq += 1;
		return `${prefix}-${seq}`;
	}
	const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();

	let courses = $state<ClassroomCourse[]>([
		{ id: 'c-1', code: 'IDEA100', title: 'Intro to Engineering Design', active: true },
		{ id: 'c-2', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	]);

	let sections = $state<ClassroomSection[]>([
		{ id: 's-1', course_id: 'c-1', label: 'Period 1', block: 'Block A', teacher_email: TEACHER, course: null },
		{ id: 's-2', course_id: 'c-1', label: 'Period 2', block: 'Block C', teacher_email: TEACHER, course: null },
		// Foreign section: resolvable by the roster import (course + label) but
		// NOT the harness teacher's -- exercises the not_your_section refusal.
		{ id: 's-9', course_id: 'c-1', label: 'Period 9', block: null, teacher_email: FOREIGN_TEACHER, course: null }
	]);

	function withCourse(s: ClassroomSection): ClassroomSection {
		return { ...s, course: courses.find((c) => c.id === s.course_id) ?? null };
	}
	const ownSections = $derived(sections.filter((s) => s.teacher_email === TEACHER).map(withCourse));

	let enrollments = $state<ClassroomEnrollment[]>([
		{ section_id: 's-1', student_email: 'alice@boscotech.net', display_name: 'Alice Alvarez', active: true },
		{ section_id: 's-1', student_email: 'ben@boscotech.net', display_name: 'Ben Okafor', active: false },
		{ section_id: 's-1', student_email: 'carla@boscotech.net', display_name: 'Carla Cardenas', active: true }
	]);

	let posts = $state<ClassroomPost[]>([
		{
			id: 'p-1',
			section_id: 's-1',
			group_id: 'g-1',
			title: 'Welcome to Period 1',
			body: 'Notebooks out tomorrow -- we start the bridge unit.\nBring your safety glasses.',
			author_email: TEACHER,
			author_name: 'T. Vargas',
			published: true,
			created_at: daysFromNow(-3),
			updated_at: daysFromNow(-3)
		},
		{
			id: 'p-2',
			section_id: 's-1',
			group_id: 'g-2',
			title: null,
			body: 'Draft: schedule change for grading day (do not publish yet).',
			author_email: TEACHER,
			author_name: 'T. Vargas',
			published: false,
			created_at: daysFromNow(-1),
			updated_at: daysFromNow(-1)
		}
	]);

	let assignments = $state<ClassroomAssignment[]>([
		{
			id: 'a-1',
			section_id: 's-1',
			group_id: 'g-3',
			title: 'Bridge sketch',
			description:
				'Sketch the truss bridge from three views.\n\n1. Front, top, side.\n2. Label every member.\n3. Bring the sketch to class Thursday.',
			points: 20,
			due_at: daysFromNow(6),
			category: 'Unit Labs',
			author_email: TEACHER,
			author_name: 'T. Vargas',
			published: true,
			created_at: daysFromNow(-2),
			updated_at: daysFromNow(-2),
			resources: [
				{ id: 'r-1', label: 'Truss design guide', url: 'https://example.com/truss-guide', sort_order: 1 },
				{ id: 'r-2', label: 'Sketching rubric', url: 'https://example.com/rubric', sort_order: 2 }
			]
		},
		{
			id: 'a-2',
			section_id: 's-1',
			group_id: 'g-4',
			title: 'Sketchbook check',
			description: 'Bring your sketchbook up to date.',
			points: 10,
			due_at: daysFromNow(-4),
			category: 'Documentation',
			author_email: TEACHER,
			author_name: 'T. Vargas',
			published: true,
			created_at: daysFromNow(-10),
			updated_at: daysFromNow(-10),
			resources: []
		},
		{
			id: 'a-3',
			section_id: 's-1',
			group_id: 'g-5',
			title: 'Reading: what makes a good design brief',
			description: 'Read the linked article. No due date -- finish before the unit ends.',
			points: null,
			due_at: null,
			category: null,
			author_email: TEACHER,
			author_name: 'T. Vargas',
			published: false,
			created_at: daysFromNow(-1),
			updated_at: daysFromNow(-1),
			resources: [{ id: 'r-3', label: 'Article', url: 'https://example.com/design-brief', sort_order: 1 }]
		}
	]);

	let log = $state<string[]>([]);
	function note(call: string, args: unknown) {
		log = [`${call} ${JSON.stringify(args)}`, ...log].slice(0, 50);
	}

	const EMAIL_RE = /^[^@\s]+@[^@\s]+$/;

	/**
	 * Attachments, mirrored in memory. The harness cannot reach Drive, so an
	 * "upload" records the metadata and hands back an object URL the same <img>
	 * the real proxy would feed -- enough to drive the paste flow, the staged
	 * list, the previews and the remove path end to end without credentials.
	 */
	function attachTo(kind: 'post' | 'assignment', ids: string[], file: File) {
		const url = URL.createObjectURL(file);
		for (const id of ids) {
			const row: ClassroomAttachment = {
				id: nid('att'),
				filename: file.name,
				mime_type: file.type || 'application/octet-stream',
				size_bytes: file.size,
				sort_order: 1
			};
			registerLocalAttachmentUrl(row.id, url);
			if (kind === 'post') {
				posts = posts.map((p) =>
					p.id === id ? { ...p, attachments: [...(p.attachments ?? []), row] } : p
				);
			} else {
				assignments = assignments.map((a) =>
					a.id === id ? { ...a, attachments: [...(a.attachments ?? []), row] } : a
				);
			}
		}
	}

	const transports: ClassroomManageTransports = {
		async upsertCourse(code, title, active = true, id = null) {
			note('upsertCourse', { code, title, active, id });
			const norm = code.trim().toUpperCase();
			if (norm.length < 2) return { ok: false, message: 'A course code (2-40 characters) is required.' };
			if (id) {
				if (!title.trim()) return { ok: false, message: 'A course title is required.' };
				courses = courses.map((c) =>
					c.id === id ? { ...c, code: norm, title: title.trim(), active } : c
				);
				return { ok: true, data: { courseId: id, created: false } };
			}
			const existing = courses.find((c) => c.code === norm);
			if (existing) return { ok: true, data: { courseId: existing.id, created: false } };
			if (!title.trim()) return { ok: false, message: 'A course title is required.' };
			const made = nid('c');
			courses = [...courses, { id: made, code: norm, title: title.trim(), active: true }];
			return { ok: true, data: { courseId: made, created: true } };
		},
		async upsertSection(courseId, label, block, id = null, teacherEmail = null) {
			note('upsertSection', { courseId, label, block, id, teacherEmail });
			if (!label.trim()) return { ok: false, message: 'A section label is required.' };
			if (!courses.some((c) => c.id === courseId))
				return { ok: false, message: 'That course does not exist.' };
			if (
				sections.some(
					(s) =>
						s.id !== id &&
						s.course_id === courseId &&
						s.label.toLowerCase() === label.trim().toLowerCase()
				)
			) {
				return { ok: false, message: `That course already has a section labelled "${label.trim()}".` };
			}
			const teacher = (teacherEmail ?? '').trim().toLowerCase();
			if (teacher && !teacher.endsWith('@boscotech.edu')) {
				return {
					ok: false,
					message: `The teacher of record must be a @boscotech.edu account (got "${teacher}").`
				};
			}
			if (id) {
				sections = sections.map((s) =>
					s.id === id
						? { ...s, label: label.trim(), block, teacher_email: teacher || s.teacher_email }
						: s
				);
				return { ok: true, data: { sectionId: id } };
			}
			const made = nid('s');
			sections = [
				...sections,
				{
					id: made,
					course_id: courseId,
					label: label.trim(),
					block,
					teacher_email: teacher || TEACHER,
					active: true,
					course: null
				}
			];
			return { ok: true, data: { sectionId: made } };
		},
		async reloadSections() {
			return { ok: true, data: { sections: ownSections, courses: [...courses] } };
		},
		async loadRoster(sectionId) {
			return {
				ok: true,
				data: enrollments
					.filter((e) => e.section_id === sectionId)
					.sort((a, b) => a.display_name.localeCompare(b.display_name))
			};
		},
		async setEnrollment(sectionId, email, name, active) {
			note('setEnrollment', { sectionId, email, name, active });
			const norm = email.trim().toLowerCase();
			if (!EMAIL_RE.test(norm))
				return { ok: false, message: 'Enter a valid student email address.' };
			const existing = enrollments.find(
				(e) => e.section_id === sectionId && e.student_email === norm
			);
			if (existing) {
				enrollments = enrollments.map((e) =>
					e === existing
						? { ...e, display_name: name?.trim() || e.display_name, active }
						: e
				);
			} else {
				enrollments = [
					...enrollments,
					{
						section_id: sectionId,
						student_email: norm,
						display_name: name?.trim() || norm.split('@')[0],
						active
					}
				];
			}
			return { ok: true, data: undefined };
		},
		async importRoster(rows) {
			note('importRoster', { rows: rows.length });
			const results: ImportSummary['results'] = [];
			let ok = 0;
			let bad = 0;
			rows.forEach((r, i) => {
				const email = r.email.trim().toLowerCase();
				if (!EMAIL_RE.test(email)) {
					bad++;
					results.push({ row: i + 1, email, ok: false, reason: 'bad_email' });
					return;
				}
				const course = courses.find((c) => c.code === r.course_code.trim().toUpperCase());
				if (!course) {
					bad++;
					results.push({ row: i + 1, email, ok: false, reason: 'course_not_found' });
					return;
				}
				const section = sections.find(
					(s) =>
						s.course_id === course.id &&
						s.label.toLowerCase() === r.section_label.trim().toLowerCase()
				);
				if (!section) {
					bad++;
					results.push({ row: i + 1, email, ok: false, reason: 'section_not_found' });
					return;
				}
				if (section.teacher_email !== TEACHER) {
					bad++;
					results.push({ row: i + 1, email, ok: false, reason: 'not_your_section' });
					return;
				}
				const existing = enrollments.find(
					(e) => e.section_id === section.id && e.student_email === email
				);
				if (existing) {
					enrollments = enrollments.map((e) =>
						e === existing ? { ...e, display_name: r.name || e.display_name, active: true } : e
					);
				} else {
					enrollments = [
						...enrollments,
						{
							section_id: section.id,
							student_email: email,
							display_name: r.name || email.split('@')[0],
							active: true
						}
					];
				}
				ok++;
				results.push({
					row: i + 1,
					email,
					ok: true,
					action: existing ? 'updated' : 'created'
				});
			});
			return { ok: true, data: { total: rows.length, succeeded: ok, refused: bad, results } };
		},
		async loadContent(sectionId) {
			return {
				ok: true,
				data: {
					posts: posts
						.filter((p) => p.section_id === sectionId)
						.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
					assignments: assignments
						.filter((a) => a.section_id === sectionId)
						.sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
				}
			};
		},
		async createPost(sectionIds, body, title, published) {
			note('createPost', { sectionIds, title, published });
			if (!body.trim()) return { ok: false, message: 'The post needs a body.' };
			if (sectionIds.some((id) => sections.find((s) => s.id === id)?.teacher_email !== TEACHER)) {
				return {
					ok: false,
					message: 'You are not the teacher of record for one of the selected sections.'
				};
			}
			const group = nid('g');
			const now = new Date().toISOString();
			const made = sectionIds.map((sectionId) => ({
				id: nid('p'),
				section_id: sectionId,
				group_id: group,
				title: title?.trim() || null,
				body: body.trim(),
				author_email: TEACHER,
				author_name: 'T. Vargas',
				published,
				created_at: now,
				updated_at: now,
				attachments: [] as ClassroomAttachment[]
			}));
			posts = [...posts, ...made];
			return { ok: true, data: { ids: made.map((p) => p.id) } };
		},
		async updatePost(id, body, title, published) {
			note('updatePost', { id, title, published });
			if (!body.trim()) return { ok: false, message: 'The post needs a body.' };
			posts = posts.map((p) =>
				p.id === id
					? {
							...p,
							body: body.trim(),
							title: title?.trim() || null,
							published: published ?? p.published,
							updated_at: new Date().toISOString()
						}
					: p
			);
			return { ok: true, data: { ids: [id] } };
		},
		async deletePost(id) {
			note('deletePost', { id });
			posts = posts.filter((p) => p.id !== id);
			return { ok: true, data: undefined };
		},
		async createAssignment(sectionIds, input, published) {
			note('createAssignment', { sectionIds, title: input.title, published });
			if (!input.title.trim())
				return { ok: false, message: 'An assignment title (1-300 characters) is required.' };
			if (sectionIds.some((id) => sections.find((s) => s.id === id)?.teacher_email !== TEACHER)) {
				return {
					ok: false,
					message: 'You are not the teacher of record for one of the selected sections.'
				};
			}
			const group = nid('g');
			const now = new Date().toISOString();
			const made = sectionIds.map((sectionId) => ({
				id: nid('a'),
				section_id: sectionId,
				group_id: group,
				title: input.title.trim(),
				description: input.description,
				points: input.points,
				due_at: input.dueAt,
				category: input.category,
				author_email: TEACHER,
				author_name: 'T. Vargas',
				published,
				created_at: now,
				updated_at: now,
				resources: input.resources.map((r, i) => ({ ...r, id: nid('r'), sort_order: i + 1 })),
				attachments: [] as ClassroomAttachment[]
			}));
			assignments = [...assignments, ...made];
			return { ok: true, data: { ids: made.map((a) => a.id) } };
		},
		async updateAssignment(id, input, published) {
			note('updateAssignment', { id, title: input.title, published });
			if (!input.title.trim())
				return { ok: false, message: 'An assignment title (1-300 characters) is required.' };
			assignments = assignments.map((a) =>
				a.id === id
					? {
							...a,
							title: input.title.trim(),
							description: input.description,
							points: input.points,
							due_at: input.dueAt,
							category: input.category,
							published: published ?? a.published,
							updated_at: new Date().toISOString(),
							resources: input.resources.map((r, i) => ({ ...r, id: nid('r'), sort_order: i + 1 }))
						}
					: a
			);
			return { ok: true, data: { ids: [id] } };
		},
		async deleteAssignment(id) {
			note('deleteAssignment', { id });
			assignments = assignments.filter((a) => a.id !== id);
			return { ok: true, data: undefined };
		},
		async setSectionActive(id, active) {
			note('setSectionActive', { id, active });
			sections = sections.map((s) => (s.id === id ? { ...s, active } : s));
			return { ok: true, data: undefined };
		},
		async deleteSection(id, confirmLabel) {
			note('deleteSection', { id, confirmLabel });
			const section = sections.find((s) => s.id === id);
			if (!section) return { ok: false, message: 'That section does not exist.' };
			const blocked: SectionDeleteResult = {
				ok: false,
				reason: 'not_empty',
				posts: posts.filter((p) => p.section_id === id).length,
				assignments: assignments.filter((a) => a.section_id === id).length,
				enrollments: enrollments.filter((e) => e.section_id === id).length
			};
			if (blocked.posts || blocked.assignments || blocked.enrollments) {
				return { ok: true, data: blocked };
			}
			if (confirmLabel.trim().toLowerCase() !== section.label.trim().toLowerCase()) {
				return { ok: false, message: `Type the section label ("${section.label}") to confirm deletion.` };
			}
			sections = sections.filter((s) => s.id !== id);
			return { ok: true, data: { ok: true } };
		},
		async updateEnrollment(sectionId, email, newEmail, name) {
			note('updateEnrollment', { sectionId, email, newEmail, name });
			const next = (newEmail ?? email).trim().toLowerCase();
			if (!EMAIL_RE.test(next)) return { ok: false, message: 'Enter a valid student email address.' };
			if (
				next !== email &&
				enrollments.some((e) => e.section_id === sectionId && e.student_email === next)
			) {
				return { ok: true, data: { ok: false, reason: 'already_enrolled' } };
			}
			enrollments = enrollments.map((e) =>
				e.section_id === sectionId && e.student_email === email
					? { ...e, student_email: next, display_name: name?.trim() || e.display_name }
					: e
			);
			return { ok: true, data: { ok: true } };
		},
		async uploadAttachment(ownerKind, ownerIds, file) {
			note('uploadAttachment', {
				ownerKind,
				ownerIds,
				name: file.name,
				type: file.type,
				size: file.size
			});
			attachTo(ownerKind, ownerIds, file);
			return { ok: true, data: undefined };
		},
		async deleteAttachment(id) {
			note('deleteAttachment', { id });
			posts = posts.map((p) => ({
				...p,
				attachments: (p.attachments ?? []).filter((a) => a.id !== id)
			}));
			assignments = assignments.map((a) => ({
				...a,
				attachments: (a.attachments ?? []).filter((x) => x.id !== id)
			}));
			return { ok: true, data: undefined };
		}
	};

	// --- Student-view slices (mimicking what RLS would return) -------------
	const section1 = $derived(withCourse(sections.find((s) => s.id === 's-1')!));
	const section2 = $derived(withCourse(sections.find((s) => s.id === 's-2')!));
	const publishedPosts1 = $derived(
		posts.filter((p) => p.section_id === 's-1' && p.published)
	);
	const publishedAsgs1 = $derived(
		assignments.filter((a) => a.section_id === 's-1' && a.published)
	);
	const detailAssignment = $derived(assignments.find((a) => a.id === 'a-1') ?? publishedAsgs1[0]);

	// --- View-as-student slices ------------------------------------------
	// Mirrors what the 0083 view_as RPCs return: the student's ACTIVE
	// enrollments only, PUBLISHED content only.
	const VIEW_AS_EMAIL = 'alice@boscotech.net';
	const viewAsSections = $derived(
		enrollments
			.filter((e) => e.student_email === VIEW_AS_EMAIL && e.active)
			.map((e) => sections.find((s) => s.id === e.section_id))
			.filter((s): s is ClassroomSection => !!s)
			.map(withCourse)
	);
	const viewAsPosts = $derived(posts.filter((p) => p.section_id === 's-1' && p.published));
	const viewAsAssignments = $derived(
		assignments.filter((a) => a.section_id === 's-1' && a.published)
	);
	const viewAsBase = `/dev/classroom`;

	const VIEWS = [
		['home', 'Student home'],
		['home-empty', 'Home: no classes'],
		['home-staff-empty', 'Home: staff, no sections'],
		['home-notready', 'Home: migration unapplied'],
		['class', 'Class page (student)'],
		['class-teacher', 'Class page (teacher)'],
		['class-empty', 'Class page: empty'],
		['assignment', 'Assignment detail'],
		['assignment-teacher', 'Assignment detail (teacher)'],
		['manage', 'Manage console'],
		['manage-notready', 'Manage: migration unapplied'],
		['viewas-home', 'View as: My Classes'],
		['viewas-class', 'View as: class'],
		['viewas-assignment', 'View as: assignment']
	] as const;
	type ViewId = (typeof VIEWS)[number][0];
	const initial = page.url.searchParams.get('view') as ViewId | null;
	let view = $state<ViewId>(initial && VIEWS.some(([v]) => v === initial) ? initial : 'home');
</script>

<svelte:head>
	<title>DEV // Classroom harness</title>
</svelte:head>

<div class="harness-bar">
	<span class="harness-label">DEV // classroom</span>
	{#each VIEWS as [id, label] (id)}
		<button type="button" class="harness-view" class:active={view === id} onclick={() => (view = id)}>
			{label}
		</button>
	{/each}
</div>

{#if view === 'home'}
	<MyClasses sections={[section1, section2]} />
{:else if view === 'home-empty'}
	<MyClasses sections={[]} />
{:else if view === 'home-staff-empty'}
	<MyClasses sections={[]} isStaff={true} />
{:else if view === 'home-notready'}
	<MyClasses sections={[]} ready={false} />
{:else if view === 'class'}
	<ClassPage section={section1} posts={publishedPosts1} assignments={publishedAsgs1} />
{:else if view === 'class-teacher'}
	<ClassPage
		section={section1}
		posts={posts.filter((p) => p.section_id === 's-1')}
		assignments={assignments.filter((a) => a.section_id === 's-1')}
		canManage={true}
		{transports}
	/>
{:else if view === 'class-empty'}
	<ClassPage section={section2} posts={[]} assignments={[]} />
{:else if view === 'assignment'}
	{#if detailAssignment}
		<AssignmentDetail section={section1} assignment={detailAssignment} />
	{:else}
		<p class="harness-note">The sample assignment was deleted in the manage view.</p>
	{/if}
{:else if view === 'assignment-teacher'}
	{#if detailAssignment}
		<AssignmentDetail
			section={section1}
			assignment={detailAssignment}
			canManage={true}
			{transports}
		/>
	{:else}
		<p class="harness-note">The sample assignment was deleted in the manage view.</p>
	{/if}
{:else if view === 'viewas-home'}
	<ImpersonationBanner email={VIEW_AS_EMAIL} displayName="Alice Alvarez" exitHref={viewAsBase} />
	<MyClasses sections={viewAsSections} basePath={viewAsBase} homeHref={viewAsBase} />
{:else if view === 'viewas-class'}
	<ImpersonationBanner email={VIEW_AS_EMAIL} displayName="Alice Alvarez" exitHref={viewAsBase} />
	<ClassPage
		section={section1}
		posts={viewAsPosts}
		assignments={viewAsAssignments}
		canManage={false}
		transports={null}
		basePath={viewAsBase}
		viewAs={VIEW_AS_EMAIL}
	/>
{:else if view === 'viewas-assignment'}
	<ImpersonationBanner email={VIEW_AS_EMAIL} displayName="Alice Alvarez" exitHref={viewAsBase} />
	{#if viewAsAssignments[0]}
		<AssignmentDetail
			section={section1}
			assignment={viewAsAssignments[0]}
			canManage={false}
			transports={null}
			basePath={viewAsBase}
			viewAs={VIEW_AS_EMAIL}
		/>
	{:else}
		<p class="harness-note">No published assignment in this section.</p>
	{/if}
{:else if view === 'manage'}
	<ManageConsole
		email={TEACHER}
		initialSections={ownSections}
		initialCourses={courses}
		{transports}
	/>
{:else if view === 'manage-notready'}
	<ManageConsole
		ready={false}
		email={TEACHER}
		initialSections={[]}
		initialCourses={[]}
		{transports}
	/>
{/if}

<div class="harness-log">
	<span class="harness-label">transport log</span>
	{#if log.length === 0}
		<p class="harness-note">No transport calls yet.</p>
	{:else}
		{#each log as line, i (i)}
			<code>{line}</code>
		{/each}
	{/if}
</div>

<style>
	.harness-bar {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		flex-wrap: wrap;
		padding: 0.5rem 0.8rem;
		border-bottom: 1px dashed var(--amber);
		margin-bottom: 0.5rem;
	}
	.harness-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.65rem;
		letter-spacing: 0.1em;
		color: var(--amber);
		margin-right: 0.4rem;
	}
	.harness-view {
		appearance: none;
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		padding: 0.22rem 0.6rem;
		cursor: pointer;
	}
	.harness-view.active {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.harness-log {
		max-width: 52rem;
		margin: 1.5rem auto 2rem;
		padding: 0.6rem 0.9rem;
		border: 1px dashed var(--line);
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.harness-log code {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.62rem;
		color: var(--dim);
		overflow-wrap: anywhere;
	}
	.harness-note {
		color: var(--dim);
		font-size: 0.8rem;
		padding: 0.5rem 0.9rem;
	}
</style>
