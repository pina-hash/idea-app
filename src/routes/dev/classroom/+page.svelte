<script lang="ts">
	import { page } from '$app/state';
	import MyClasses from '$lib/classroom/MyClasses.svelte';
	import ClassPage from '$lib/classroom/ClassPage.svelte';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import ManageConsole from '$lib/classroom/ManageConsole.svelte';
	import UpdatesPage from '$lib/classroom/UpdatesPage.svelte';
	import FeedbackConsole from '$lib/classroom/FeedbackConsole.svelte';
	import ImpersonationBanner from '$lib/classroom/ImpersonationBanner.svelte';
	import GradingConsole from '$lib/classroom/GradingConsole.svelte';
	import { registerLocalAttachmentUrl } from '$lib/classroom/classroom';
	import type {
		ClassroomAttachment,
		ClassroomCourse,
		ClassroomEnrollment,
		ClassroomItem,
		ClassroomManageTransports,
		ClassroomSection,
		FeedbackRow,
		FeedbackStatus,
		ImportSummary,
		LinkPreview,
		SectionDeleteResult
	} from '$lib/classroom/classroom';
	import {
		filesByBlockCount,
		gatedModuleIds,
		registerLocalSubmissionFileUrl,
		responsesMap,
		rubricFromSpec,
		specUnmet,
		validateSpec,
		type AssignmentEngineTransports,
		type AssignmentSpec,
		type AssignmentTeacherTransports,
		type ModuleApprovalRow,
		type ResponseRow,
		type ResponseValue,
		type RubricCriterion,
		type StudentEngineData,
		type SubmissionFileRow,
		type SubmissionRow
	} from '$lib/classroom/assignment-spec';
	import type { FeedbackEntry } from '$lib/feedback/feedback';

	/**
	 * In-memory store driving the REAL components. It mirrors the 0085 rules
	 * closely enough to reach every refusal shape the surfaces render (teacher
	 * of record, the import's per-row reasons, idempotent upserts, the
	 * last-posting unlink refusal) -- the real enforcement is covered by
	 * tests/classroom-security.test.ts and tests/classroom-canonical.test.ts
	 * against real Postgres. Every transport call is logged verbatim below.
	 *
	 * THE POINT OF THIS HARNESS, since 0085: a canonical item lives in ONE
	 * place and appears in several classes, so the sync loop (edit in Period 1,
	 * see it in Period 2) is drivable here without a session, a Drive
	 * credential, or a second browser.
	 */

	const TEACHER = 'tvargas@boscotech.edu';
	const FOREIGN_TEACHER = 'mreed@boscotech.edu';

	let seq = $state(100);
	function nid(prefix: string): string {
		seq += 1;
		return `${prefix}-${seq}`;
	}
	const daysFromNow = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
	const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

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
		{ section_id: 's-1', student_email: 'carla@boscotech.net', display_name: 'Carla Cardenas', active: true },
		{ section_id: 's-2', student_email: 'alice@boscotech.net', display_name: 'Alice Alvarez', active: true }
	]);

	function item(over: Partial<ClassroomItem> & { id: string; kind: ClassroomItem['kind'] }): ClassroomItem {
		return {
			title: null,
			body: '',
			points: null,
			due_at: null,
			category: null,
			author_email: TEACHER,
			author_name: 'T. Vargas',
			published: true,
			pinned: false,
			sort_order: 0,
			first_published_at: daysFromNow(-3),
			edited_at: null,
			created_at: daysFromNow(-3),
			updated_at: daysFromNow(-3),
			links: [],
			attachments: [],
			postings: [{ section_id: 's-1' }],
			viewed_at: null,
			instructorAttachments: [],
			instructorLinks: [],
			...over
		};
	}

	let items = $state<ClassroomItem[]>([
		item({
			id: 'i-1',
			kind: 'post',
			title: 'Welcome to the bridge unit',
			body: 'Notebooks out tomorrow -- we start the bridge unit.\nBring your safety glasses.',
			// Posted to BOTH classes: this is the item the sync loop is driven on.
			postings: [{ section_id: 's-1' }, { section_id: 's-2' }]
		}),
		item({
			id: 'i-2',
			kind: 'post',
			body: 'Draft: schedule change for grading day (do not publish yet).',
			published: false,
			first_published_at: null,
			created_at: daysFromNow(-1),
			updated_at: daysFromNow(-1)
		}),
		item({
			id: 'i-3',
			kind: 'assignment',
			title: 'Bridge sketch',
			body: 'Sketch the truss bridge from three views.\n\n1. Front, top, side.\n2. Label every member.\n3. Bring the sketch to class Thursday.',
			points: 20,
			due_at: daysFromNow(6),
			category: 'Unit Labs',
			created_at: daysFromNow(-2),
			updated_at: hoursFromNow(-2),
			// Edited after publishing and never opened since: the "Updated" case.
			edited_at: hoursFromNow(-2),
			viewed_at: daysFromNow(-1),
			links: [
				{ id: 'r-1', label: 'Truss design guide', url: 'https://example.com/truss-guide', sort_order: 1 },
				{ id: 'r-2', label: 'Sketching rubric', url: 'https://example.com/rubric', sort_order: 2 }
			],
			postings: [{ section_id: 's-1' }, { section_id: 's-2' }],
			// Seeded instructor-only material (0090): a teacher opening this item
			// should see these immediately, and a student (or view-as-student)
			// never should.
			instructorAttachments: [
				{ id: 'iatt-1', filename: 'bridge-sketch-answer-key.pdf', mime_type: 'application/pdf', size_bytes: 84213, sort_order: 1 }
			],
			instructorLinks: [
				{ id: 'ir-1', label: 'Grading notes (internal)', url: 'https://example.com/grading-notes', sort_order: 1 }
			]
		}),
		item({
			id: 'i-4',
			kind: 'assignment',
			title: 'Sketchbook check',
			body: 'Bring your sketchbook up to date.',
			points: 10,
			due_at: daysFromNow(-4),
			category: 'Documentation',
			created_at: daysFromNow(-10),
			updated_at: daysFromNow(-10)
		}),
		item({
			id: 'i-5',
			kind: 'assignment',
			title: 'Reading: what makes a good design brief',
			body: 'Read the linked article. No due date -- finish before the unit ends.',
			published: false,
			first_published_at: null,
			created_at: daysFromNow(-1),
			updated_at: daysFromNow(-1),
			links: [{ id: 'r-3', label: 'Article', url: 'https://example.com/design-brief', sort_order: 1 }]
		}),
		item({
			id: 'i-6',
			kind: 'material',
			title: 'Course syllabus',
			body: 'Grading, materials, and the shop safety rules. Keep this open all term.',
			pinned: true,
			created_at: daysFromNow(-30),
			updated_at: daysFromNow(-30),
			first_published_at: daysFromNow(-30),
			links: [
				{ id: 'r-4', label: 'Syllabus (PDF)', url: 'https://example.com/syllabus', sort_order: 1 }
			],
			postings: [{ section_id: 's-1' }, { section_id: 's-2' }]
		}),
		item({
			id: 'i-7',
			kind: 'material',
			title: 'Shop tool reference',
			body: 'What each tool is for and who may use it unsupervised.',
			created_at: daysFromNow(-20),
			updated_at: daysFromNow(-20),
			first_published_at: daysFromNow(-20)
		})
	]);

	let log = $state<string[]>([]);
	function note(call: string, args: unknown) {
		log = [`${call} ${JSON.stringify(args)}`, ...log].slice(0, 60);
	}

	const EMAIL_RE = /^[^@\s]+@[^@\s]+$/;

	function patch(id: string, over: Partial<ClassroomItem>) {
		items = items.map((i) => (i.id === id ? { ...i, ...over } : i));
	}

	/**
	 * Attachments, mirrored in memory. The harness cannot reach Drive, so an
	 * "upload" records the metadata and hands back an object URL the same <img>
	 * the real proxy would feed -- enough to drive the paste flow, the staged
	 * previews and the remove path end to end without credentials.
	 */
	/** attachment row id -> the object URL its bytes live at, so a DUPLICATE can
	 *  re-register the same bytes under its own new row ids (which is what the
	 *  real duplicate does with one Drive file id and two rows). */
	const attachmentUrls = new Map<string, string>();

	function attachTo(itemId: string, file: File) {
		const url = URL.createObjectURL(file);
		attachmentUrls.set(itemId, url);
		const row: ClassroomAttachment = {
			id: nid('att'),
			filename: file.name,
			mime_type: file.type || 'application/octet-stream',
			size_bytes: file.size,
			sort_order: 1
		};
		registerLocalAttachmentUrl(row.id, url);
		attachmentUrls.set(row.id, url);
		items = items.map((i) =>
			i.id === itemId ? { ...i, attachments: [...i.attachments, row] } : i
		);
	}

	/** Same idea as attachTo, for the instructor-only list (0090). */
	function attachInstructorTo(itemId: string, file: File) {
		const url = URL.createObjectURL(file);
		const row: ClassroomAttachment = {
			id: nid('iatt'),
			filename: file.name,
			mime_type: file.type || 'application/octet-stream',
			size_bytes: file.size,
			sort_order: 1
		};
		registerLocalAttachmentUrl(row.id, url);
		attachmentUrls.set(row.id, url);
		items = items.map((i) =>
			i.id === itemId
				? { ...i, instructorAttachments: [...(i.instructorAttachments ?? []), row] }
				: i
		);
	}

	/** The 0085 "manages every class it is posted to" bar, mirrored. */
	function managesItem(i: ClassroomItem): boolean {
		return i.postings.every(
			(p) => sections.find((s) => s.id === p.section_id)?.teacher_email === TEACHER
		);
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
			const trimmed = label.trim();
			if (!trimmed) return { ok: false, message: 'A section label is required.' };
			const clash = sections.find(
				(s) =>
					s.course_id === courseId &&
					s.label.toLowerCase() === trimmed.toLowerCase() &&
					s.id !== id
			);
			if (clash) {
				return { ok: false, message: `That course already has a section labelled "${trimmed}".` };
			}
			if (id) {
				sections = sections.map((s) =>
					s.id === id
						? { ...s, course_id: courseId, label: trimmed, block, teacher_email: teacherEmail || s.teacher_email }
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
					label: trimmed,
					block,
					teacher_email: teacherEmail || TEACHER,
					active: true,
					course: null
				}
			];
			return { ok: true, data: { sectionId: made } };
		},
		async reloadSections() {
			note('reloadSections', {});
			return { ok: true, data: { sections: ownSections, courses } };
		},
		async loadRoster(sectionId) {
			note('loadRoster', { sectionId });
			if (sections.find((s) => s.id === sectionId)?.teacher_email !== TEACHER) {
				return {
					ok: false,
					message: "Only the section's teacher of record or a site admin can manage its roster."
				};
			}
			return { ok: true, data: enrollments.filter((e) => e.section_id === sectionId) };
		},
		async setEnrollment(sectionId, email, name, active) {
			note('setEnrollment', { sectionId, email, name, active });
			const norm = email.trim().toLowerCase();
			if (!EMAIL_RE.test(norm)) return { ok: false, message: 'Enter a valid student email address.' };
			const existing = enrollments.find(
				(e) => e.section_id === sectionId && e.student_email === norm
			);
			if (existing) {
				enrollments = enrollments.map((e) =>
					e === existing ? { ...e, display_name: name?.trim() || e.display_name, active } : e
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
		async importRoster(rows) {
			note('importRoster', { count: rows.length });
			const summary: ImportSummary = { total: 0, succeeded: 0, refused: 0, results: [] };
			rows.forEach((row, index) => {
				summary.total += 1;
				const email = row.email.trim().toLowerCase();
				const course = courses.find((c) => c.code === row.course_code.trim().toUpperCase());
				const section = course
					? sections.find(
							(s) =>
								s.course_id === course.id &&
								s.label.toLowerCase() === row.section_label.trim().toLowerCase()
						)
					: undefined;
				let reason: string | null = null;
				if (!EMAIL_RE.test(email)) reason = 'bad_email';
				else if (!course) reason = 'course_not_found';
				else if (!section) reason = 'section_not_found';
				else if (section.teacher_email !== TEACHER) reason = 'not_your_section';

				if (reason || !section) {
					summary.refused += 1;
					summary.results.push({ row: index + 1, email, ok: false, reason: reason ?? 'error' });
					return;
				}
				const existing = enrollments.find(
					(e) => e.section_id === section.id && e.student_email === email
				);
				if (existing) {
					enrollments = enrollments.map((e) =>
						e === existing ? { ...e, display_name: row.name || e.display_name, active: true } : e
					);
				} else {
					enrollments = [
						...enrollments,
						{
							section_id: section.id,
							student_email: email,
							display_name: row.name || email.split('@')[0],
							active: true
						}
					];
				}
				summary.succeeded += 1;
				summary.results.push({
					row: index + 1,
					email,
					ok: true,
					action: existing ? 'updated' : 'created'
				});
			});
			return { ok: true, data: summary };
		},
		async loadContent(sectionId) {
			note('loadContent', { sectionId });
			return {
				ok: true,
				data: { items: items.filter((i) => i.postings.some((p) => p.section_id === sectionId)) }
			};
		},
		async createItem(kind, sectionIds, input, published) {
			note('createItem', { kind, sectionIds, title: input.title, published });
			if (kind !== 'post' && !input.title?.trim()) {
				return { ok: false, message: 'A title is required.' };
			}
			if (kind === 'post' && !input.body.trim()) {
				return { ok: false, message: 'The announcement needs a body.' };
			}
			if (sectionIds.some((id) => sections.find((s) => s.id === id)?.teacher_email !== TEACHER)) {
				return {
					ok: false,
					message: 'You are not the teacher of record for one of the selected sections.'
				};
			}
			const now = new Date().toISOString();
			const made = item({
				id: nid('i'),
				kind,
				title: input.title?.trim() || null,
				body: input.body,
				points: kind === 'assignment' ? input.points : null,
				due_at: kind === 'assignment' ? input.dueAt : null,
				category: input.category,
				published,
				created_at: now,
				updated_at: now,
				first_published_at: published ? now : null,
				links: input.links.map((r, i) => ({ ...r, id: nid('r'), sort_order: i + 1 })),
				postings: sectionIds.map((section_id) => ({ section_id }))
			});
			items = [...items, made];
			return { ok: true, data: { itemId: made.id } };
		},
		async updateItem(id, input, published) {
			note('updateItem', { id, title: input.title, published });
			const current = items.find((i) => i.id === id);
			if (!current) return { ok: false, message: 'That item does not exist.' };
			if (!managesItem(current)) {
				return {
					ok: false,
					message: 'Only the teacher of record for every class this is posted to can edit it.'
				};
			}
			if (current.kind !== 'post' && !input.title?.trim()) {
				return { ok: false, message: 'A title is required.' };
			}
			const now = new Date().toISOString();
			const changed =
				(input.title?.trim() || '') !== (current.title ?? '') ||
				input.body !== current.body ||
				input.points !== current.points ||
				input.dueAt !== current.due_at ||
				(input.category ?? '') !== (current.category ?? '');
			patch(id, {
				title: input.title?.trim() || null,
				body: input.body,
				points: current.kind === 'assignment' ? input.points : null,
				due_at: current.kind === 'assignment' ? input.dueAt : null,
				category: input.category,
				published: published ?? current.published,
				first_published_at:
					current.first_published_at ?? ((published ?? current.published) ? now : null),
				// Only a content change to something already published is an edit.
				edited_at: changed && current.first_published_at ? now : current.edited_at,
				updated_at: now,
				links: input.links.map((r, i) => ({ ...r, id: nid('r'), sort_order: i + 1 }))
			});
			return { ok: true, data: { itemId: id } };
		},
		async deleteItem(id) {
			note('deleteItem', { id });
			items = items.filter((i) => i.id !== id);
			return { ok: true, data: undefined };
		},
		async duplicateItem(id) {
			note('duplicateItem', { id });
			const source = items.find((i) => i.id === id);
			if (!source) return { ok: false, message: 'That item does not exist.' };
			const now = new Date().toISOString();
			const copy: ClassroomItem = {
				...source,
				id: nid('i'),
				title: source.kind === 'post' ? source.title : `${source.title ?? ''} (copy)`,
				published: false,
				pinned: false,
				sort_order: 0,
				first_published_at: null,
				edited_at: null,
				viewed_at: null,
				created_at: now,
				updated_at: now,
				// New rows, same Drive files: a copy carries its attachments without
				// re-uploading anything.
				attachments: source.attachments.map((a) => ({ ...a, id: nid('att') })),
				links: source.links.map((r) => ({ ...r, id: nid('r') })),
				postings: source.postings.map((p) => ({ ...p })),
				// Instructor-only materials (0090) carry over the same way.
				instructorAttachments: (source.instructorAttachments ?? []).map((a) => ({
					...a,
					id: nid('iatt')
				})),
				instructorLinks: (source.instructorLinks ?? []).map((r) => ({ ...r, id: nid('ir') }))
			};
			// The copy's attachment rows point at the SAME bytes, so the harness
			// registers the same object URL under the new row ids.
			source.attachments.forEach((a, index) => {
				const url = attachmentUrls.get(a.id);
				if (url) {
					registerLocalAttachmentUrl(copy.attachments[index].id, url);
					attachmentUrls.set(copy.attachments[index].id, url);
				}
			});
			(source.instructorAttachments ?? []).forEach((a, index) => {
				const url = attachmentUrls.get(a.id);
				if (url) {
					registerLocalAttachmentUrl(copy.instructorAttachments![index].id, url);
					attachmentUrls.set(copy.instructorAttachments![index].id, url);
				}
			});
			items = [...items, copy];
			return { ok: true, data: { itemId: copy.id } };
		},
		async addPostings(itemId, sectionIds) {
			note('addPostings', { itemId, sectionIds });
			const current = items.find((i) => i.id === itemId);
			if (!current) return { ok: false, message: 'That item does not exist.' };
			if (sectionIds.some((id) => sections.find((s) => s.id === id)?.teacher_email !== TEACHER)) {
				return {
					ok: false,
					message: 'You are not the teacher of record for one of the selected sections.'
				};
			}
			const fresh = sectionIds.filter(
				(id) => !current.postings.some((p) => p.section_id === id)
			);
			patch(itemId, {
				postings: [...current.postings, ...fresh.map((section_id) => ({ section_id }))]
			});
			return { ok: true, data: { added: fresh.length } };
		},
		async removePosting(itemId, sectionId) {
			note('removePosting', { itemId, sectionId });
			const current = items.find((i) => i.id === itemId);
			if (!current) return { ok: false, message: 'That item is not posted to that class.' };
			if (current.postings.length <= 1) {
				return { ok: true, data: { ok: false, reason: 'last_posting' } };
			}
			patch(itemId, { postings: current.postings.filter((p) => p.section_id !== sectionId) });
			return { ok: true, data: { ok: true } };
		},
		async setPinned(itemId, pinned) {
			note('setPinned', { itemId, pinned });
			patch(itemId, { pinned });
			return { ok: true, data: undefined };
		},
		async setOrder(itemIds) {
			note('setOrder', { itemIds });
			itemIds.forEach((id, index) => patch(id, { sort_order: index + 1 }));
			return { ok: true, data: undefined };
		},
		async markViewed(itemId) {
			note('markViewed', { itemId });
			patch(itemId, { viewed_at: new Date().toISOString() });
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
				items: items.filter((i) => i.postings.some((p) => p.section_id === id)).length,
				enrollments: enrollments.filter((e) => e.section_id === id).length
			};
			if (blocked.items || blocked.enrollments) {
				return { ok: true, data: blocked };
			}
			if (confirmLabel.trim().toLowerCase() !== section.label.trim().toLowerCase()) {
				return { ok: false, message: `Type the section label ("${section.label}") to confirm deletion.` };
			}
			sections = sections.filter((s) => s.id !== id);
			return { ok: true, data: { ok: true } };
		},
		async uploadAttachment(itemId, file) {
			note('uploadAttachment', { itemId, name: file.name, type: file.type, size: file.size });
			attachTo(itemId, file);
			return { ok: true, data: undefined };
		},
		async deleteAttachment(id) {
			note('deleteAttachment', { id });
			items = items.map((i) => ({
				...i,
				attachments: i.attachments.filter((a) => a.id !== id)
			}));
			return { ok: true, data: undefined };
		},
		async uploadInstructorAttachment(itemId, file) {
			note('uploadInstructorAttachment', { itemId, name: file.name, type: file.type, size: file.size });
			const current = items.find((i) => i.id === itemId);
			if (!current || !managesItem(current)) {
				return {
					ok: false,
					message: 'Only the teacher of record for every class this is posted to can attach instructor-only files here.'
				};
			}
			attachInstructorTo(itemId, file);
			return { ok: true, data: undefined };
		},
		async deleteInstructorAttachment(id) {
			note('deleteInstructorAttachment', { id });
			items = items.map((i) => ({
				...i,
				instructorAttachments: (i.instructorAttachments ?? []).filter((a) => a.id !== id)
			}));
			return { ok: true, data: undefined };
		},
		async setInstructorResources(itemId, links) {
			note('setInstructorResources', { itemId, count: links.length });
			const current = items.find((i) => i.id === itemId);
			if (!current || !managesItem(current)) {
				return {
					ok: false,
					message: 'Only the teacher of record for every class this is posted to can edit instructor-only materials.'
				};
			}
			patch(itemId, {
				instructorLinks: links.map((r, i) => ({ ...r, id: nid('ir'), sort_order: i + 1 }))
			});
			return { ok: true, data: undefined };
		}
	};

	// --- Assignment engine (0086), mirrored in memory -----------------------
	// The REAL pure layer does the thinking (validateSpec, specUnmet,
	// rubricFromSpec); this store only mirrors the 0086 state rules closely
	// enough to reach every refusal shape the surfaces render. The real
	// enforcement is tests/classroom-engine.test.ts against real Postgres.

	const STUDENT_EMAIL = 'alice@boscotech.net';

	const SEED_SPEC: AssignmentSpec = {
		schemaVersion: 1,
		meta: {
			assignmentId: 'idea100-bridge-01',
			title: 'Bridge Sketch Worksheet',
			totalPoints: 20,
			gradingCategory: 'Unit Labs'
		},
		modules: [
			{
				id: 'm1',
				title: 'Three Views',
				points: 8,
				aiLevel: 0,
				intro: 'Sketch the truss bridge from three views before you touch CAD.',
				blocks: [
					{
						type: 'instructions',
						content: '1. Front, top, side.\n2. Label every member.\n3. Use a straightedge.'
					},
					{
						type: 'textField',
						id: 'f1',
						prompt: 'Which view was hardest to get right, and why?',
						minSentences: 3,
						maxSentences: 5
					},
					{
						type: 'table',
						id: 't1',
						columns: [
							{ key: 'member', label: 'Member', tip: 'Member — the truss member name.' },
							{ key: 'loading', label: 'Loading', tip: 'Loading — tension or compression.' }
						],
						minRows: 3
					}
				],
				rubric: [
					{ criterion: 'All three views complete and labeled', points: 5 },
					{ criterion: 'Hardest-view reflection is specific', points: 3 }
				]
			},
			{
				id: 'm2',
				title: 'Photo Evidence',
				points: 6,
				blocks: [
					{ type: 'imageZone', id: 'z1', minImages: 2, captions: true },
					{ type: 'checklist', id: 'c1', items: ['Sketch dated', 'Name on every page'] }
				],
				rubric: [{ criterion: 'Photos legible and captioned', points: 6 }]
			},
			{
				id: 'm3',
				title: 'Design Reflection',
				points: 6,
				blocks: [
					{
						type: 'textField',
						id: 'f2',
						prompt: 'Where would this bridge fail first under load? Explain.',
						minSentences: 2
					}
				],
				rubric: [{ criterion: 'Failure prediction is reasoned', points: 6 }]
			}
		],
		declarations: { academicIntegrity: true },
		approvalGate: { afterModule: 'm2', label: 'Instructor Approval Required' }
	};

	const ENGINE_ITEM = 'i-3';
	let engineSpec = $state<AssignmentSpec | null>(SEED_SPEC);
	let engineRubric = $state<RubricCriterion[] | null>(rubricFromSpec(SEED_SPEC));
	let engSubmissions = $state<SubmissionRow[]>([]);
	let engResponses = $state<ResponseRow[]>([]);
	let engFiles = $state<SubmissionFileRow[]>([]);
	let engApprovals = $state<ModuleApprovalRow[]>([]);

	const SAMPLE_IMG =
		'data:image/svg+xml;utf8,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220"><rect width="320" height="220" fill="#101a12"/><path d="M20 180 L80 60 L140 180 L200 60 L260 180 Z" fill="none" stroke="#00FF41" stroke-width="5"/><text x="20" y="205" fill="#7a8" font-size="14" font-family="monospace">bridge sketch</text></svg>'
		);

	function ensureSubmission(email: string): SubmissionRow {
		let row = engSubmissions.find((s) => s.item_id === ENGINE_ITEM && s.student_email === email);
		if (!row) {
			row = {
				id: nid('sub'),
				item_id: ENGINE_ITEM,
				student_email: email,
				state: 'draft',
				submitted_at: null,
				returned_at: null,
				rubric_scores: null,
				score: null,
				teacher_comment: null,
				graded_by: null,
				graded_at: null
			};
			engSubmissions = [...engSubmissions, row];
		}
		return row;
	}
	function patchSubmission(email: string, over: Partial<SubmissionRow>) {
		ensureSubmission(email);
		engSubmissions = engSubmissions.map((s) =>
			s.item_id === ENGINE_ITEM && s.student_email === email ? { ...s, ...over } : s
		);
	}
	function subOf(email: string): SubmissionRow | null {
		return (
			engSubmissions.find((s) => s.item_id === ENGINE_ITEM && s.student_email === email) ?? null
		);
	}
	function responsesOf(email: string): ResponseRow[] {
		return engResponses.filter((r) => r.item_id === ENGINE_ITEM && r.student_email === email);
	}
	function filesOf(email: string): SubmissionFileRow[] {
		const sub = subOf(email);
		return sub ? engFiles.filter((f) => f.submission_id === sub.id) : [];
	}
	function approvalsOf(email: string): ModuleApprovalRow[] {
		return engApprovals.filter((a) => a.item_id === ENGINE_ITEM && a.student_email === email);
	}
	function seedFile(email: string, blockId: string | null, caption: string | null, name: string) {
		const sub = ensureSubmission(email);
		const row: SubmissionFileRow = {
			id: nid('sf'),
			submission_id: sub.id,
			block_id: blockId,
			caption,
			filename: name,
			mime_type: 'image/svg+xml',
			size_bytes: 4200,
			sort_order: engFiles.filter((f) => f.submission_id === sub.id).length + 1
		};
		registerLocalSubmissionFileUrl(row.id, SAMPLE_IMG);
		engFiles = [...engFiles, row];
		return row;
	}

	// Seed CARLA as a complete, submitted student so the grading console has
	// real work to grade the moment it opens.
	{
		patchSubmission('carla@boscotech.net', {
			state: 'submitted',
			submitted_at: hoursFromNow(-20)
		});
		engResponses = [
			{
				item_id: ENGINE_ITEM,
				student_email: 'carla@boscotech.net',
				block_id: 'f1',
				value: {
					text: 'The side view was hardest. The diagonals overlap there. I had to redraw it twice.'
				}
			},
			{
				item_id: ENGINE_ITEM,
				student_email: 'carla@boscotech.net',
				block_id: 't1',
				value: {
					rows: [
						{ member: 'Top chord', loading: 'Compression' },
						{ member: 'Bottom chord', loading: 'Tension' },
						{ member: 'Diagonal', loading: 'Tension' }
					]
				}
			},
			{
				item_id: ENGINE_ITEM,
				student_email: 'carla@boscotech.net',
				block_id: 'c1',
				value: { checked: [true, true] }
			},
			{
				item_id: ENGINE_ITEM,
				student_email: 'carla@boscotech.net',
				block_id: 'f2',
				value: { text: 'The center bottom chord carries the most tension. It fails first.' }
			},
			{
				item_id: ENGINE_ITEM,
				student_email: 'carla@boscotech.net',
				block_id: '@declaration',
				value: { checked: [true] }
			}
		];
		seedFile('carla@boscotech.net', 'z1', 'Front view', 'front-view.svg');
		seedFile('carla@boscotech.net', 'z1', 'Side view', 'side-view.svg');
		engApprovals = [
			{
				item_id: ENGINE_ITEM,
				student_email: 'carla@boscotech.net',
				module_id: 'm2',
				approved_by: TEACHER,
				approved_at: hoursFromNow(-22)
			}
		];
	}

	function buildStudentData(email: string): StudentEngineData {
		return {
			spec: engineSpec,
			rubric: engineRubric,
			submission: subOf(email),
			responses: responsesOf(email),
			files: filesOf(email),
			approvals: approvalsOf(email)
		};
	}

	function blockIn(spec: AssignmentSpec, blockId: string) {
		for (const mod of spec.modules) {
			for (const b of mod.blocks) {
				if ('id' in b && b.id === blockId) return { mod, block: b };
			}
		}
		return null;
	}

	const engineTransports: AssignmentEngineTransports = {
		async saveResponse(itemId, blockId, value) {
			note('saveResponse', { itemId, blockId, value });
			if (!engineSpec) return { ok: false, message: 'This assignment has no interactive spec.' };
			if (subOf(STUDENT_EMAIL)?.state === 'submitted') {
				return { ok: true, data: { ok: false, reason: 'locked' } };
			}
			if (blockId !== '@declaration') {
				const found = blockIn(engineSpec, blockId);
				if (!found) return { ok: false, message: `Unknown block "${blockId}".` };
				const gated = gatedModuleIds(engineSpec);
				const approved = approvalsOf(STUDENT_EMAIL).some(
					(a) => a.module_id === engineSpec?.approvalGate?.afterModule
				);
				if (gated.includes(found.mod.id) && !approved) {
					return {
						ok: true,
						data: { ok: false, reason: 'approval_pending', module_id: found.mod.id }
					};
				}
			}
			const existing = engResponses.find(
				(r) =>
					r.item_id === ENGINE_ITEM && r.student_email === STUDENT_EMAIL && r.block_id === blockId
			);
			if (existing) {
				engResponses = engResponses.map((r) => (r === existing ? { ...r, value } : r));
			} else {
				engResponses = [
					...engResponses,
					{ item_id: ENGINE_ITEM, student_email: STUDENT_EMAIL, block_id: blockId, value }
				];
			}
			return { ok: true, data: { ok: true } };
		},
		async submitAssignment(itemId) {
			note('submitAssignment', { itemId });
			const sub = subOf(STUDENT_EMAIL);
			if (sub?.state === 'submitted') {
				return { ok: true, data: { ok: false, reason: 'already_submitted' } };
			}
			if (engineSpec) {
				const unmet = specUnmet(
					engineSpec,
					responsesMap(responsesOf(STUDENT_EMAIL)),
					filesByBlockCount(filesOf(STUDENT_EMAIL)),
					approvalsOf(STUDENT_EMAIL)
				);
				if (unmet.length) {
					return { ok: true, data: { ok: false, reason: 'incomplete', unmet } };
				}
			} else if (filesOf(STUDENT_EMAIL).length === 0) {
				return { ok: true, data: { ok: false, reason: 'nothing_attached' } };
			}
			patchSubmission(STUDENT_EMAIL, { state: 'submitted', submitted_at: new Date().toISOString() });
			return { ok: true, data: { ok: true, state: 'submitted' } };
		},
		async unsubmitAssignment(itemId) {
			note('unsubmitAssignment', { itemId });
			const sub = subOf(STUDENT_EMAIL);
			if (!sub || sub.state !== 'submitted') {
				return { ok: true, data: { ok: false, reason: 'not_submitted' } };
			}
			if (sub.graded_at) {
				return { ok: true, data: { ok: false, reason: 'graded' } };
			}
			patchSubmission(STUDENT_EMAIL, { state: 'draft' });
			return { ok: true, data: { ok: true, state: 'draft' } };
		},
		async uploadSubmissionFile(itemId, file, blockId = null, caption = null) {
			note('uploadSubmissionFile', { itemId, name: file.name, blockId, caption });
			if (subOf(STUDENT_EMAIL)?.state === 'submitted') {
				return { ok: true, data: { reason: 'locked' } };
			}
			const sub = ensureSubmission(STUDENT_EMAIL);
			const row: SubmissionFileRow = {
				id: nid('sf'),
				submission_id: sub.id,
				block_id: blockId ?? null,
				caption: caption ?? null,
				filename: file.name,
				mime_type: file.type || 'application/octet-stream',
				size_bytes: file.size,
				sort_order: engFiles.filter((f) => f.submission_id === sub.id).length + 1
			};
			registerLocalSubmissionFileUrl(row.id, URL.createObjectURL(file));
			engFiles = [...engFiles, row];
			return { ok: true, data: { file: row } };
		},
		async deleteSubmissionFile(fileId) {
			note('deleteSubmissionFile', { fileId });
			if (subOf(STUDENT_EMAIL)?.state === 'submitted') {
				return { ok: true, data: { ok: false, reason: 'locked' } };
			}
			engFiles = engFiles.filter((f) => f.id !== fileId);
			return { ok: true, data: { ok: true } };
		},
		async setFileCaption(fileId, caption) {
			note('setFileCaption', { fileId, caption });
			engFiles = engFiles.map((f) => (f.id === fileId ? { ...f, caption } : f));
			return { ok: true, data: { ok: true } };
		},
		async reloadStudent() {
			note('reloadStudent', {});
			return { ok: true, data: buildStudentData(STUDENT_EMAIL) };
		}
	};

	const teacherEngineTransports: AssignmentTeacherTransports = {
		async setSpec(itemId, spec) {
			note('setSpec', { itemId, removed: spec == null });
			if (spec == null) {
				engineSpec = null;
				return { ok: true, data: undefined };
			}
			const result = validateSpec(spec);
			if (!result.spec) {
				return { ok: false, message: result.errors[0] ?? 'Invalid spec.' };
			}
			engineSpec = result.spec;
			return { ok: true, data: undefined };
		},
		async setRubric(itemId, criteria) {
			note('setRubric', { itemId, count: criteria?.length ?? 0 });
			engineRubric = criteria;
			return { ok: true, data: undefined };
		},
		async gradeSubmission(itemId, studentEmail, scores, comment, release) {
			note('gradeSubmission', { itemId, studentEmail, scores, comment, release });
			if (!engineRubric?.length) {
				return { ok: false, message: 'Create a rubric for this assignment before grading.' };
			}
			for (const [key, value] of Object.entries(scores)) {
				const crit = engineRubric.find((c) => c.id === key);
				if (!crit) return { ok: false, message: `Score key "${key}" is not a rubric criterion.` };
				if (value < 0 || value > crit.points) {
					return {
						ok: false,
						message: `The score for "${crit.criterion}" must be between 0 and ${crit.points}.`
					};
				}
			}
			const missing = engineRubric.filter((c) => scores[c.id] == null).map((c) => c.id);
			if (release && missing.length) {
				return { ok: true, data: { ok: false, reason: 'incomplete_scores', missing } };
			}
			const total = Object.values(scores).reduce((sum, v) => sum + v, 0);
			ensureSubmission(studentEmail);
			patchSubmission(studentEmail, {
				rubric_scores: scores,
				score: total,
				teacher_comment: comment,
				graded_by: TEACHER,
				graded_at: new Date().toISOString(),
				...(release ? { state: 'returned' as const, returned_at: new Date().toISOString() } : {})
			});
			return { ok: true, data: { ok: true, score: total, state: release ? 'returned' : subOf(studentEmail)?.state } };
		},
		async approveModule(itemId, studentEmail, moduleId, approved) {
			note('approveModule', { itemId, studentEmail, moduleId, approved });
			engApprovals = engApprovals.filter(
				(a) =>
					!(a.item_id === ENGINE_ITEM && a.student_email === studentEmail && a.module_id === moduleId)
			);
			if (approved) {
				engApprovals = [
					...engApprovals,
					{
						item_id: ENGINE_ITEM,
						student_email: studentEmail,
						module_id: moduleId,
						approved_by: TEACHER,
						approved_at: new Date().toISOString()
					}
				];
			}
			return { ok: true, data: undefined };
		},
		async loadGrading(itemId, sectionId) {
			note('loadGrading', { itemId, sectionId });
			return {
				ok: true,
				data: {
					roster: enrollments.filter((e) => e.section_id === sectionId),
					submissions: engSubmissions.filter((s) => s.item_id === itemId),
					responses: engResponses.filter((r) => r.item_id === itemId),
					files: engFiles,
					approvals: engApprovals.filter((a) => a.item_id === itemId)
				}
			};
		}
	};

	/**
	 * Link previews, answered from a fixture. The real endpoint fetches the page
	 * server-side; the harness has no network, so this proves the CARD renders
	 * both states -- a rich preview and the plain-link degradation -- which is
	 * the half that lives in the component.
	 */
	const PREVIEWS: Record<string, LinkPreview> = {
		'https://example.com/truss-guide': {
			url: 'https://example.com/truss-guide',
			ok: true,
			title: 'Truss bridge design: a field guide',
			site_name: 'Example Engineering',
			description:
				'Every common truss, what it is good at, and how to tell them apart from a photograph.',
			image_url:
				'data:image/svg+xml;utf8,' +
				encodeURIComponent(
					'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160"><rect width="240" height="160" fill="#12301c"/><path d="M10 130 L60 40 L110 130 L160 40 L210 130 Z" fill="none" stroke="#00FF41" stroke-width="4"/></svg>'
				)
		},
		'https://example.com/syllabus': {
			url: 'https://example.com/syllabus',
			ok: true,
			title: 'IDEA100 syllabus 2026-27',
			site_name: 'Bosco Tech',
			description: null,
			image_url: null
		}
	};
	async function fetchPreview(url: string): Promise<LinkPreview | null> {
		note('linkPreview', { url });
		// Anything not in the fixture degrades to a plain link, which is exactly
		// what a timeout or a metadata-free page does in production.
		return PREVIEWS[url] ?? null;
	}

	// --- Feedback ---------------------------------------------------------
	let feedbackRows = $state<FeedbackRow[]>([
		{
			id: 'f-1',
			app: 'classroom',
			context: 'class',
			kind: 'bug',
			message: 'The due date on Bridge sketch shows a day early on my phone.',
			meta: { section: 'IDEA100 · Period 1', tab: 'classwork' },
			status: 'new',
			created_at: hoursFromNow(-5),
			reviewed_at: null,
			reviewed_by: null,
			submitter_name: 'Alice Alvarez',
			submitter_email: 'alice@boscotech.net'
		},
		{
			id: 'f-2',
			app: 'classroom',
			context: 'item',
			kind: 'idea',
			message: 'Could materials be sorted alphabetically? I keep losing the syllabus.',
			meta: { section: 'IDEA100 · Period 2', kind: 'material' },
			status: 'seen',
			created_at: daysFromNow(-2),
			reviewed_at: daysFromNow(-1),
			reviewed_by: TEACHER,
			submitter_name: 'Carla Cardenas',
			submitter_email: 'carla@boscotech.net'
		}
	]);

	async function submitFeedback(entry: FeedbackEntry) {
		note('submitFeedback', { context: entry.context, kind: entry.kind, meta: entry.meta });
		feedbackRows = [
			{
				id: nid('f'),
				app: entry.app,
				context: entry.context ?? null,
				kind: entry.kind,
				message: entry.message,
				meta: (entry.meta ?? {}) as Record<string, unknown>,
				status: 'new',
				created_at: new Date().toISOString(),
				reviewed_at: null,
				reviewed_by: null,
				submitter_name: 'Alice Alvarez',
				submitter_email: 'alice@boscotech.net'
			},
			...feedbackRows
		];
		return { error: null };
	}

	async function setFeedbackStatus(id: string, status: FeedbackStatus) {
		note('app_feedback_set_status', { id, status });
		feedbackRows = feedbackRows.map((r) =>
			r.id === id
				? { ...r, status, reviewed_at: new Date().toISOString(), reviewed_by: TEACHER }
				: r
		);
		return { ok: true };
	}

	// --- Student-view slices (mimicking what RLS would return) -------------
	const section1 = $derived(withCourse(sections.find((s) => s.id === 's-1')!));
	const section2 = $derived(withCourse(sections.find((s) => s.id === 's-2')!));
	function inSection(id: string, publishedOnly: boolean): ClassroomItem[] {
		return items.filter(
			(i) => i.postings.some((p) => p.section_id === id) && (!publishedOnly || i.published)
		);
	}
	const detailItem = $derived(items.find((i) => i.id === 'i-3') ?? inSection('s-1', true)[0]);

	// --- View-as-student slices ------------------------------------------
	const VIEW_AS_EMAIL = 'alice@boscotech.net';
	const viewAsSections = $derived(
		enrollments
			.filter((e) => e.student_email === VIEW_AS_EMAIL && e.active)
			.map((e) => sections.find((s) => s.id === e.section_id))
			.filter((s): s is ClassroomSection => !!s)
			.map(withCourse)
	);
	const viewAsBase = `/dev/classroom`;

	const VIEWS = [
		['home', 'Student home'],
		['home-empty', 'Home: no classes'],
		['home-staff-empty', 'Home: staff, no sections'],
		['home-notready', 'Home: migration unapplied'],
		['class', 'Class P1 (student)'],
		['class-teacher', 'Class P1 (teacher)'],
		['class2-teacher', 'Class P2 (teacher)'],
		['class2', 'Class P2 (student)'],
		['class-empty', 'Class page: empty'],
		['item', 'Item detail'],
		['item-teacher', 'Item detail (teacher)'],
		['assignment', 'Assignment engine (student)'],
		['grade', 'Grading console'],
		['manage', 'Manage console'],
		['manage-notready', 'Manage: migration unapplied'],
		['updates', 'Update log'],
		['feedback', 'Feedback console'],
		['feedback-notready', 'Feedback: unapplied'],
		['viewas-home', 'View as: My Classes'],
		['viewas-class', 'View as: class'],
		['viewas-item', 'View as: item']
	] as const;
	type ViewId = (typeof VIEWS)[number][0];
	const initial = page.url.searchParams.get('view') as ViewId | null;
	let view = $state<ViewId>(initial && VIEWS.some(([v]) => v === initial) ? initial : 'home');

	const emptySection = $derived(withCourse({ ...section2, id: 's-empty' }));
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
	<MyClasses sections={[section1, section2]} {submitFeedback} />
{:else if view === 'home-empty'}
	<MyClasses sections={[]} />
{:else if view === 'home-staff-empty'}
	<MyClasses sections={[]} isStaff={true} />
{:else if view === 'home-notready'}
	<MyClasses sections={[]} ready={false} />
{:else if view === 'class'}
	<ClassPage
		section={section1}
		items={inSection('s-1', true)}
		{transports}
		{fetchPreview}
		{submitFeedback}
	/>
{:else if view === 'class-teacher'}
	<ClassPage
		section={section1}
		items={inSection('s-1', false)}
		sections={ownSections}
		canManage={true}
		{transports}
		{fetchPreview}
		{submitFeedback}
	/>
{:else if view === 'class2-teacher'}
	<ClassPage
		section={section2}
		items={inSection('s-2', false)}
		sections={ownSections}
		canManage={true}
		{transports}
		{fetchPreview}
		{submitFeedback}
	/>
{:else if view === 'class2'}
	<ClassPage section={section2} items={inSection('s-2', true)} {transports} {fetchPreview} />
{:else if view === 'class-empty'}
	<ClassPage section={emptySection} items={[]} />
{:else if view === 'item'}
	{#if detailItem}
		<ItemDetail section={section1} item={detailItem} {transports} {fetchPreview} {submitFeedback} />
	{:else}
		<p class="harness-note">The sample item was deleted in another view.</p>
	{/if}
{:else if view === 'item-teacher'}
	{#if detailItem}
		<ItemDetail
			section={section1}
			item={detailItem}
			sections={ownSections}
			canManage={true}
			{transports}
			{fetchPreview}
			{submitFeedback}
			spec={engineSpec}
			rubric={engineRubric}
			teacherTransports={teacherEngineTransports}
			gradeHref="/dev/classroom?view=grade"
		/>
	{:else}
		<p class="harness-note">The sample item was deleted in another view.</p>
	{/if}
{:else if view === 'assignment'}
	{#if detailItem}
		<ItemDetail
			section={section1}
			item={detailItem}
			{transports}
			{fetchPreview}
			{submitFeedback}
			engine={buildStudentData(STUDENT_EMAIL)}
			{engineTransports}
		/>
	{:else}
		<p class="harness-note">The sample item was deleted in another view.</p>
	{/if}
{:else if view === 'grade'}
	{#if detailItem}
		<GradingConsole
			section={section1}
			item={detailItem}
			spec={engineSpec}
			rubric={engineRubric}
			transports={teacherEngineTransports}
		/>
	{:else}
		<p class="harness-note">The sample item was deleted in another view.</p>
	{/if}
{:else if view === 'updates'}
	<UpdatesPage {submitFeedback} />
{:else if view === 'feedback'}
	<FeedbackConsole rows={feedbackRows} setStatus={setFeedbackStatus} />
{:else if view === 'feedback-notready'}
	<FeedbackConsole ready={false} rows={[]} setStatus={setFeedbackStatus} />
{:else if view === 'viewas-home'}
	<ImpersonationBanner email={VIEW_AS_EMAIL} displayName="Alice Alvarez" exitHref={viewAsBase} />
	<MyClasses sections={viewAsSections} basePath={viewAsBase} homeHref={viewAsBase} />
{:else if view === 'viewas-class'}
	<ImpersonationBanner email={VIEW_AS_EMAIL} displayName="Alice Alvarez" exitHref={viewAsBase} />
	<ClassPage
		section={section1}
		items={inSection('s-1', true)}
		canManage={false}
		transports={null}
		submitFeedback={null}
		{fetchPreview}
		basePath={viewAsBase}
		viewAs={VIEW_AS_EMAIL}
	/>
{:else if view === 'viewas-item'}
	<ImpersonationBanner email={VIEW_AS_EMAIL} displayName="Alice Alvarez" exitHref={viewAsBase} />
	{#if detailItem}
		<ItemDetail
			section={section1}
			item={detailItem}
			canManage={false}
			transports={null}
			submitFeedback={null}
			{fetchPreview}
			basePath={viewAsBase}
			viewAs={VIEW_AS_EMAIL}
		/>
	{:else}
		<p class="harness-note">No published item in this section.</p>
	{/if}
{:else if view === 'manage'}
	<ManageConsole
		email={TEACHER}
		initialSections={ownSections}
		initialCourses={courses}
		{transports}
		{submitFeedback}
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
