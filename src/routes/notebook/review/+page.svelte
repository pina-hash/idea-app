<script lang="ts">
	import ReviewConsole from '$lib/notebook/ReviewConsole.svelte';
	import type { NotebookFlagReason, NotebookPhoto } from '$lib/notebook';
	import { REVIEW_ENTRY_SELECTS } from '$lib/notebook-selects';
	import type {
		GridSession,
		ReviewEntry,
		ReviewResult,
		ReviewTransports,
		SectionGrid,
		SessionInput
	} from '$lib/notebook-review';
	import type { RubricCriterion } from '$lib/classroom/assignment-spec';
	import type {
		DocCheckResult,
		DocCheckSubmission,
		DocCheckTransports,
		GradeOutcome,
		LinkableItem,
		UnitItemLink
	} from '$lib/notebook-documentation-check';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/**
	 * The one place the real server calls live. Every transport runs as the
	 * CALLER'S OWN session through the browser client, so 0069's RLS and the
	 * SECURITY DEFINER RPCs' own instructor-or-admin checks are what actually
	 * decide the answer -- nothing here re-implements a permission rule.
	 *
	 * Errors are turned into `{ ok: false }` rather than thrown: the RPCs
	 * raise on refusal (wrong tier, missing session, bad unit number), and the
	 * message they raise is written to be shown, so it is surfaced as-is.
	 */
	function fail(err: unknown, fallback: string): ReviewResult<never> {
		const message = (err as { message?: string } | null)?.message?.trim();
		return { ok: false, error: message || fallback };
	}

	const transports: ReviewTransports = {
		async loadSessions(sectionId) {
			// Plain RLS-scoped selects, not an RPC: notebook_sessions and its
			// postings are readable by any signed-in user (0069, 0098), which is
			// also why the grid itself is what gates section access, not this.
			//
			// The embed carries EVERY section each check-in runs in, not just
			// this one -- filtering the embed would answer "which of these did I
			// ask about", which is the one thing the "posted to" line must not
			// say. So the postings are read first, then the check-ins by id.
			const posted = await data.supabase
				.from('notebook_session_postings')
				.select('session_id')
				.eq('section_id', sectionId);
			if (posted.error) return fail(posted.error, 'Could not load this section’s check-ins.');

			const ids = (posted.data ?? []).map((r) => r.session_id as string);
			if (ids.length === 0) return { ok: true, value: [] };

			const { data: rows, error } = await data.supabase
				.from('notebook_sessions')
				.select(
					'id, unit_number, session_date, session_label, notebook_session_postings ( section_id )'
				)
				.in('id', ids)
				.order('session_date');
			if (error) return fail(error, 'Could not load this section’s check-ins.');

			const value = ((rows ?? []) as unknown as Record<string, unknown>[]).map(
				(row): GridSession => ({
					id: row.id as string,
					unit_number: Number(row.unit_number),
					session_date: row.session_date as string,
					session_label: row.session_label as string,
					section_ids: ((row.notebook_session_postings ?? []) as { section_id: string }[]).map(
						(p) => p.section_id
					)
				})
			);
			return { ok: true, value };
		},

		async saveSession(input: SessionInput) {
			const { data: result, error } = await data.supabase.rpc('notebook_admin_upsert_session', {
				p_section_ids: input.section_ids,
				p_unit_number: input.unit_number,
				p_session_date: input.session_date,
				p_session_label: input.session_label,
				p_id: input.id
			});
			if (error) return fail(error, 'Could not save that check-in.');
			return { ok: true, value: result as { session_id: string } };
		},

		async deleteSession(sessionId) {
			const { data: result, error } = await data.supabase.rpc('notebook_admin_delete_session', {
				p_session_id: sessionId
			});
			if (error) return fail(error, 'Could not delete that check-in.');
			return { ok: true, value: result as { detached_entries: number } };
		},

		async addSessionSections(sessionId, sectionIds) {
			const { data: result, error } = await data.supabase.rpc('notebook_add_session_postings', {
				p_session_id: sessionId,
				p_section_ids: sectionIds
			});
			if (error) return fail(error, 'Could not add that check-in to those classes.');
			return { ok: true, value: result as { added: number } };
		},

		async removeSessionSection(sessionId, sectionId) {
			const { data: result, error } = await data.supabase.rpc(
				'notebook_remove_session_posting',
				{ p_session_id: sessionId, p_section_id: sectionId }
			);
			if (error) return fail(error, 'Could not remove that check-in from that class.');
			return {
				ok: true,
				value: result as { ok: boolean; reason?: string; detached_entries?: number }
			};
		},

		async loadGrid(sectionId, unitNumber) {
			const { data: result, error } = await data.supabase.rpc('notebook_get_section_grid', {
				p_section_id: sectionId,
				p_unit_number: unitNumber
			});
			if (error) return fail(error, 'Could not load the grid for this section.');
			return { ok: true, value: result as SectionGrid };
		},

		async loadEntry(entryId) {
			// RLS decides: 'section staff read notebook entries' covers the
			// instructor and the admin tier, and the photos follow the entry
			// via notebook_can_read_entry. No .eq('student_id', ...) filter and
			// no RPC -- the filtering IS the policy (the /coin-balance and
			// /notebook doctrine).
			//
			// The select strings themselves live in $lib/notebook-selects, where
			// the student feed's do, so the embeds they name are held against the
			// real catalog by tests/notebook-page-load.test.ts rather than by
			// nothing at all.
			const read = (select: string) =>
				data.supabase.from('notebook_entries').select(select).eq('id', entryId).maybeSingle();

			// Widest first, then one capability at a time -- see the array's own
			// comment for why each embed has to degrade on its own.
			let row: unknown = null;
			let error: unknown = null;
			for (const select of REVIEW_ENTRY_SELECTS) {
				({ data: row, error } = await read(select));
				if (!error) break;
			}
			if (error) return fail(error, 'Could not load that entry.');
			if (!row) return { ok: false, error: 'That entry is no longer available.' };
			const r = row as unknown as Record<string, unknown>;
			return {
				ok: true,
				value: {
					id: r.id as string,
					student_id: r.student_id as string,
					session_id: (r.session_id as string | null) ?? null,
					custom_label: (r.custom_label as string | null) ?? null,
					upload_timestamp: r.upload_timestamp as string,
					status: r.status as ReviewEntry['status'],
					flag_reason: (r.flag_reason as NotebookFlagReason | null) ?? null,
					instructor_comment: (r.instructor_comment as string | null) ?? null,
					folder_name: (r.notebook_folders as { name?: string } | null)?.name ?? null,
					photos: (r.notebook_entry_photos as NotebookPhoto[]) ?? [],
					notes: (r.notebook_entry_notes as ReviewEntry['notes']) ?? []
				}
			};
		},

		async flagEntry(entryId, reason, comment) {
			const { error } = await data.supabase.rpc('notebook_flag_entry', {
				p_entry_id: entryId,
				p_flag_reason: reason,
				p_instructor_comment: comment
			});
			if (error) return fail(error, 'Could not flag that entry.');
			return { ok: true, value: undefined };
		},

		async resolveEntry(entryId, comment) {
			const { error } = await data.supabase.rpc('notebook_resolve_entry', {
				p_entry_id: entryId,
				p_instructor_comment: comment
			});
			if (error) return fail(error, 'Could not accept that entry.');
			return { ok: true, value: undefined };
		}
	};

	/**
	 * The Documentation Check's own transports (0097). Same doctrine as above:
	 * every call runs as the caller's own session, so RLS and each RPC's own
	 * check decide the answer.
	 *
	 * TWO OF THESE ARE CLASSROOM'S, NOT THE NOTEBOOK'S, ON PURPOSE.
	 * `classroom_set_rubric` and `classroom_grade_submission` are called here
	 * exactly as `/classroom/.../grade` calls them, because a Documentation
	 * Check IS a Classroom assignment -- a notebook-side copy of either would
	 * be a second implementation of the rubric validation, the override rule
	 * and the release gate.
	 */
	const docCheckTransports: DocCheckTransports = {
		async load(sectionId, unitNumber) {
			// The link, RLS-scoped to whoever manages the section (0097). A
			// missing row is the ordinary unlinked state, not an error.
			const linkRes = await data.supabase
				.from('notebook_unit_items')
				.select('section_id, unit_number, item_id')
				.eq('section_id', sectionId)
				.eq('unit_number', unitNumber)
				.maybeSingle();
			// 0097 unapplied: the panel is not rendered at all in that case (the
			// load reports it), so a table error here is a real one.
			if (linkRes.error) {
				return { ok: false, error: linkRes.error.message || 'Could not read the unit link.' };
			}
			const link = (linkRes.data as UnitItemLink | null) ?? null;

			// Every assignment posted to this section: what the picker offers,
			// and what 0097 will accept. The !inner embed IS the "posted to this
			// section" filter, so the picker can never offer something the link
			// RPC would refuse.
			const candidateRes = await data.supabase
				.from('classroom_items')
				.select('id, title, points, classroom_postings!inner(section_id)')
				.eq('classroom_postings.section_id', sectionId)
				.eq('kind', 'assignment')
				.order('title');
			const candidates = ((candidateRes.data ?? []) as unknown as Record<string, unknown>[]).map(
				(row): LinkableItem => ({
					id: String(row.id),
					title: (row.title as string | null) ?? 'Untitled assignment',
					points: row.points == null ? null : Number(row.points)
				})
			);

			if (!link) {
				return {
					ok: true,
					value: { link, item: null, rubric: null, submissions: {}, candidates }
				};
			}

			const [itemRes, rubricRes, submissionRes] = await Promise.all([
				data.supabase
					.from('classroom_items')
					.select('id, title, points')
					.eq('id', link.item_id)
					.maybeSingle(),
				data.supabase
					.from('classroom_rubrics')
					.select('criteria')
					.eq('item_id', link.item_id)
					.maybeSingle(),
				// No .eq('student_email', ...) anywhere: classroom_submissions is
				// already scoped to own-rows-or-reviewer, so the filtering IS the
				// policy (the /coin-balance doctrine).
				data.supabase
					.from('classroom_submissions')
					.select(
						'student_email, state, score, rubric_scores, criterion_comments, teacher_comment, graded_at, returned_at'
					)
					.eq('item_id', link.item_id)
			]);

			const itemRow = itemRes.data as Record<string, unknown> | null;
			const submissions: Record<string, DocCheckSubmission> = {};
			for (const row of (submissionRes.data ?? []) as unknown as DocCheckSubmission[]) {
				submissions[String(row.student_email).toLowerCase()] = {
					...row,
					score: row.score == null ? null : Number(row.score)
				};
			}

			return {
				ok: true,
				value: {
					link,
					item: itemRow
						? {
								id: String(itemRow.id),
								title: (itemRow.title as string | null) ?? 'Untitled assignment',
								points: itemRow.points == null ? null : Number(itemRow.points)
							}
						: null,
					rubric: (rubricRes.data?.criteria as RubricCriterion[] | undefined) ?? null,
					submissions,
					candidates
				}
			};
		},

		async linkItem(sectionId, unitNumber, itemId) {
			const { error } = await data.supabase.rpc('notebook_link_unit_item', {
				p_section_id: sectionId,
				p_unit_number: unitNumber,
				p_item_id: itemId
			});
			if (error) return docFail(error, 'Could not link that assignment.');
			return { ok: true, value: undefined };
		},

		async unlinkItem(sectionId, unitNumber) {
			const { error } = await data.supabase.rpc('notebook_unlink_unit_item', {
				p_section_id: sectionId,
				p_unit_number: unitNumber
			});
			if (error) return docFail(error, 'Could not unlink that assignment.');
			return { ok: true, value: undefined };
		},

		async installRubric(itemId, criteria) {
			const { error } = await data.supabase.rpc('classroom_set_rubric', {
				p_item_id: itemId,
				p_criteria: criteria
			});
			if (error) return docFail(error, 'Could not save the rubric.');
			return { ok: true, value: undefined };
		},

		async gradeSubmission(itemId, studentEmail, scores, comment, release, criterionComments) {
			const { data: result, error } = await data.supabase.rpc('classroom_grade_submission', {
				p_item_id: itemId,
				p_student_email: studentEmail,
				p_scores: scores,
				p_comment: comment,
				p_return: release,
				p_criterion_comments: criterionComments
			});
			if (error) return docFail(error, 'Could not save that grade.');
			return { ok: true, value: result as GradeOutcome };
		}
	};

	function docFail(err: unknown, fallback: string): DocCheckResult<never> {
		const message = (err as { message?: string } | null)?.message?.trim();
		return { ok: false, error: message || fallback };
	}
</script>

<ReviewConsole
	sections={data.sections}
	isChair={data.isChair}
	configured={data.configured}
	initialSectionId={data.initialSectionId}
	{transports}
	docCheck={data.docCheckReady ? docCheckTransports : null}
/>
