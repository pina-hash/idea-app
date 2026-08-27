<script lang="ts">
	import ReviewConsole from '$lib/notebook/ReviewConsole.svelte';
	import type { NotebookFlagReason, NotebookPhoto } from '$lib/notebook';
	import { MANAGE_SESSION_SELECTS, REVIEW_ENTRY_SELECTS } from '$lib/notebook-selects';
	import { saveSessionGuidance } from '$lib/check-in-guidance';
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
	import type {
		AdminLogRow,
		AdminLogTransports,
		EntryMoveResult,
		EntryMoveTransports,
		ExcusalRow,
		ExcusalTransports,
		LinkTargetItem,
		SessionItemLink,
		SessionItemTransports,
		StaffNoteTransports
	} from '$lib/notebook/admin-actions';
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
		/**
		 * THE GUIDANCE WRITE (0123), and the only one on this console.
		 *
		 * Not a `supabase.rpc` call like its neighbours, and it cannot be: the RPC
		 * takes the STORED document shape and the browser holds the EDITOR's, and
		 * the translation between them is a `$lib/server` whitelist. One egress
		 * point for that write lives in $lib/check-in-guidance and is shared with
		 * the classroom's own check-in transports, so the two surfaces cannot come
		 * to disagree about what a prompt is.
		 *
		 * The route calls `notebook_set_session_guidance` as THIS caller, so
		 * `_notebook_manages_session` is still what decides.
		 */
		async setSessionGuidance(sessionId, doc) {
			const res = await saveSessionGuidance(sessionId, doc);
			return res.ok
				? { ok: true, value: { cleared: res.cleared } }
				: { ok: false, error: res.message };
		},

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

			// TWO RUNGS (0123), widest first, and the select strings live in
			// $lib/notebook-selects with every other one for the same reason: they
			// name an EMBED, and an embed is an assertion about the foreign keys
			// that nothing in the type system checks.
			//
			// Degrading costs the guidance field and nothing else -- the console
			// keeps every control it had before 0123 -- because the narrow rung is
			// byte-identical to what this call read then.
			let rows: unknown[] | null = null;
			let error: unknown = null;
			for (const rung of MANAGE_SESSION_SELECTS) {
				const res = await data.supabase
					.from('notebook_sessions')
					.select(rung.select)
					.in('id', ids)
					.order('session_date');
				error = res.error;
				if (!res.error) {
					rows = (res.data ?? []) as unknown[];
					break;
				}
			}
			if (!rows) return fail(error, 'Could not load this section’s check-ins.');

			const value = (rows as unknown as Record<string, unknown>[]).map(
				(row): GridSession => ({
					id: row.id as string,
					unit_number: Number(row.unit_number),
					session_date: row.session_date as string,
					session_label: row.session_label as string,
					// Undefined on the narrow rung, which is "not asked" rather than
					// "no prompt" -- the field is not rendered either way, because the
					// route hands in no transport when the column is missing.
					guidance_doc: row.guidance_doc as GridSession['guidance_doc'],
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
			/**
			 * A DELETED ENTRY IS NOT REVIEWABLE (0116). The grid already excludes
			 * them, so the only way to arrive here holding one is a cell that went
			 * stale under an open panel -- a student removing an entry while its
			 * instructor has it up. The row is still READABLE (0116 leaves
			 * notebook_can_read_entry alone on purpose, so a reversal can show its
			 * contents), which is exactly why the refusal has to be stated here
			 * rather than assumed from an empty result.
			 *
			 * `deleted_at` is undefined on a narrower rung, where the column does
			 * not exist and nothing can be deleted -- so this can only ever fire on
			 * a real stamp.
			 */
			if (r.deleted_at) return { ok: false, error: 'That entry has been deleted.' };
			/**
			 * A DRAFT IS NOT REVIEWABLE, AND IS NOT NORMALLY EVEN READABLE (0118).
			 * The staff SELECT policy excludes an unturned-in entry, so a draft
			 * makes the read above come back with no row at all and the "no longer
			 * available" line fires first -- this is the case where a cell went
			 * stale under an open panel and the row was pulled back to a draft
			 * between the grid load and the click.
			 *
			 * Kept anyway, and it is not belt-and-braces: `submitted_at` is
			 * `undefined` on a narrower rung (where nothing can be a draft), so
			 * this can only ever fire on a real null from a real 0118 read -- and
			 * it makes the console SAY what happened rather than reporting an
			 * unreadable row as a missing one, which are different things a
			 * teacher would chase differently.
			 */
			if ('submitted_at' in r && r.submitted_at === null)
				return { ok: false, error: 'That entry has been pulled back to a draft.' };
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
					// Removed photos are dropped by `livePhotos` wherever this list is
					// rendered or counted (NotebookPhotos, photoPages), the same one
					// filter the student's own feed goes through.
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
		},

		async acceptEntry(entryId) {
			const { error } = await data.supabase.rpc('notebook_accept_entry', {
				p_entry_id: entryId
			});
			if (error) return fail(error, 'Could not mark that entry reviewed.');
			return { ok: true, value: undefined };
		},

		async unacceptEntry(entryId) {
			const { error } = await data.supabase.rpc('notebook_unaccept_entry', {
				p_entry_id: entryId
			});
			if (error) return fail(error, 'Could not undo that review.');
			return { ok: true, value: undefined };
		},

		/**
		 * LIVE UPDATES (0121 publishes these three tables). The gauntlet-room and
		 * tournament pattern: ONE channel per section, named for it, torn down
		 * with removeChannel.
		 *
		 * ONLY ONE OF THE THREE CAN CARRY A FILTER, and that is a fact about the
		 * schema rather than an omission. `notebook_entries` has `section_id`, so
		 * a class is only ever woken by its own entries. Photos and notes hang off
		 * the ENTRY and have no section column, and a Realtime filter is a
		 * comparison on the row itself -- there is no join to filter through. So
		 * those two arrive for every row THIS CALLER MAY READ, which RLS has
		 * already narrowed to the students of the sections they teach: at worst a
		 * photo filed in their period 4 costs their period 2 grid one debounced
		 * re-read, and no row anybody else's student wrote is ever delivered.
		 *
		 * The handler takes no payload deliberately -- see `subscribe` in
		 * notebook-review.ts for why re-reading beats patching.
		 */
		subscribe(sectionId, onChange) {
			const channel = data.supabase
				.channel(`notebook-review-${sectionId}`)
				.on(
					'postgres_changes',
					{
						event: '*',
						schema: 'public',
						table: 'notebook_entries',
						filter: `section_id=eq.${sectionId}`
					},
					() => onChange()
				)
				.on(
					'postgres_changes',
					{ event: '*', schema: 'public', table: 'notebook_entry_photos' },
					() => onChange()
				)
				.on(
					'postgres_changes',
					{ event: '*', schema: 'public', table: 'notebook_entry_notes' },
					() => onChange()
				)
				.subscribe();
			return () => {
				data.supabase.removeChannel(channel);
			};
		},

		async deleteEntry(entryId) {
			const { error } = await data.supabase.rpc('notebook_staff_delete_entry', {
				p_entry_id: entryId
			});
			if (error) return fail(error, 'Could not delete that entry.');
			return { ok: true, value: undefined };
		},

		async deleteNote(noteId) {
			const { error } = await data.supabase.rpc('notebook_staff_delete_note', {
				p_note_id: noteId
			});
			if (error) return fail(error, 'Could not delete that note.');
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

	/**
	 * ---------------------------------------------------------------------
	 * THE FIVE STAFF CAPABILITIES THAT HAD NO CALLER (0069-0120).
	 *
	 * Same doctrine as everything above: every call runs as the CALLER'S OWN
	 * session through the browser client, so each function's own gate and each
	 * table's own RLS is what decides the answer. Nothing here re-implements a
	 * permission rule.
	 *
	 * WHAT THIS ROUTE DOES DECIDE is which bundles to hand in at all, and it
	 * decides it from `data.isChair` -- which is `isAdmin()` resolved
	 * server-side by `notebookAccess`, not `role === 'teacher'`. That is
	 * PRESENTATION (CLAUDE.md's "hiding a control is presentation, the function
	 * refusing is the boundary"): an admin-only bundle withheld from an
	 * instructor means there is no write to execute, and the RPC would raise for
	 * them anyway if a client sent one.
	 *
	 * THE SPLIT IS NOT UNIFORM, AND THAT IS THE POINT OF FIVE FIELDS RATHER THAN
	 * ONE `isAdmin` FLAG:
	 *
	 *   excusals.load     INSTRUCTOR   0098's SELECT policy on the table
	 *   excusals.set      ADMIN        notebook_admin_set_excusal: is_admin()
	 *   entryMove         ADMIN        notebook_admin_override_entry: is_admin()
	 *   adminLog          ADMIN        the table's own policy: is_admin()
	 *   staffNote         INSTRUCTOR   classroom_manages_section OR
	 *                                    notebook_manages_student
	 *   itemLink          INSTRUCTOR   classroom_manages_section
	 */
	function adminFail(err: unknown, fallback: string): ReviewResult<never> {
		const message = (err as { message?: string } | null)?.message?.trim();
		return { ok: false, error: message || fallback };
	}

	/**
	 * READING an excusal is the INSTRUCTOR tier and WRITING one is not, so the
	 * two halves of this object are handed in on different conditions. `load` is
	 * a plain RLS-scoped select rather than an RPC, because 0098's policy already
	 * says exactly who may read a row: the subject, and any manager of a section
	 * the check-in is posted to. No `.eq('student_id', ...)` filter -- the policy
	 * IS the boundary (the /coin-balance doctrine).
	 */
	const excusalTransports: ExcusalTransports = {
		async load(sessionIds) {
			if (sessionIds.length === 0) return { ok: true, value: [] };
			const { data: rows, error } = await data.supabase
				.from('notebook_session_excusals')
				.select('session_id, student_id, excused_at, excused_by, note')
				.in('session_id', sessionIds);
			if (error) return adminFail(error, 'Could not read the excusals for this section.');
			return { ok: true, value: (rows ?? []) as unknown as ExcusalRow[] };
		},
		// ADMIN ONLY. Handed in below on `isChair` alone; the RPC raises
		// "Only a site admin can excuse notebook sessions." regardless.
		async set(input) {
			const { data: result, error } = await data.supabase.rpc('notebook_admin_set_excusal', {
				p_session_id: input.sessionId,
				p_student_id: input.studentId,
				p_excused: input.excused,
				p_note: input.note
			});
			if (error) return adminFail(error, 'Could not record that excusal.');
			return { ok: true, value: result as { excused: boolean } };
		}
	};

	/**
	 * FIVE OF THE NINE PARAMETERS, and the four that are missing are missing
	 * deliberately -- see `EntryMoveInput` for why exposing the status, the flag
	 * reason, the comment and the label here would be a second path to decisions
	 * this console already has proper controls for.
	 */
	const entryMoveTransports: EntryMoveTransports = {
		async move(input) {
			const { data: result, error } = await data.supabase.rpc('notebook_admin_override_entry', {
				p_entry_id: input.entryId,
				p_set_session: input.setSession,
				p_session_id: input.sessionId,
				p_set_section: input.setSection,
				p_section_id: input.sectionId
			});
			if (error) return adminFail(error, 'Could not move that entry.');
			return { ok: true, value: result as EntryMoveResult };
		}
	};

	/**
	 * THE LOG IS A TABLE READ, NOT AN RPC, and its gate is the policy 0069 put on
	 * it (`using (public.is_admin())`). So a non-admin who somehow reached this
	 * transport gets an EMPTY LIST rather than an error -- the /admin doctrine,
	 * where an empty RLS result is indistinguishable from the rows not existing.
	 * The console is additionally handed no transport at all unless `isChair`.
	 *
	 * `created_at desc` is what `notebook_admin_log_created_idx` was built for.
	 */
	const adminLogTransports: AdminLogTransports = {
		async load(limit) {
			const { data: rows, error } = await data.supabase
				.from('notebook_admin_log')
				.select('id, actor_id, action, section_id, session_id, entry_id, student_id, details, created_at')
				.order('created_at', { ascending: false })
				.limit(limit);
			if (error) return adminFail(error, 'Could not read the admin log.');
			return { ok: true, value: (rows ?? []) as unknown as AdminLogRow[] };
		}
	};

	/** The undo for the staff note delete this console has always offered. */
	const staffNoteTransports: StaffNoteTransports = {
		async restore(noteId) {
			const { error } = await data.supabase.rpc('notebook_staff_restore_note', {
				p_note_id: noteId
			});
			if (error) return adminFail(error, 'Could not restore that note.');
			return { ok: true, value: undefined };
		}
	};

	const itemLinkTransports: SessionItemTransports = {
		async load(sectionId) {
			// RLS-scoped: notebook_session_postings is readable by any signed-in
			// user (0098), which is also why the grid is what gates section access.
			const { data: rows, error } = await data.supabase
				.from('notebook_session_postings')
				.select('session_id, section_id, item_id')
				.eq('section_id', sectionId);
			if (error) return adminFail(error, 'Could not read the item links for this class.');
			return { ok: true, value: (rows ?? []) as unknown as SessionItemLink[] };
		},
		async candidates(sectionId) {
			// THE `!inner` EMBED IS THE "posted to this class" FILTER, which is
			// exactly the condition notebook_link_session_item refuses on -- so the
			// picker can never offer something the RPC would turn down. The same
			// shape the Documentation Check's own candidate read uses, minus the
			// `kind` filter: a check-in can hang off a material as readily as an
			// assignment, and 0120 constrains it to neither.
			const { data: rows, error } = await data.supabase
				.from('classroom_items')
				.select('id, title, classroom_postings!inner(section_id)')
				.eq('classroom_postings.section_id', sectionId)
				.order('title');
			if (error) return adminFail(error, 'Could not read this class’s items.');
			const value = ((rows ?? []) as unknown as Record<string, unknown>[]).map(
				(row): LinkTargetItem => ({
					id: String(row.id),
					title: (row.title as string | null) ?? 'Untitled item'
				})
			);
			return { ok: true, value };
		},
		async link(sessionId, sectionId, itemId) {
			const { data: result, error } = await data.supabase.rpc('notebook_link_session_item', {
				p_session_id: sessionId,
				p_section_id: sectionId,
				p_item_id: itemId
			});
			if (error) return adminFail(error, 'Could not attach that check-in.');
			return { ok: true, value: result as { linked: number } };
		},
		async unlink(sessionId, sectionId) {
			const { data: result, error } = await data.supabase.rpc('notebook_unlink_session_item', {
				p_session_id: sessionId,
				p_section_id: sectionId
			});
			if (error) return adminFail(error, 'Could not detach that check-in.');
			return { ok: true, value: result as { cleared: number } };
		}
	};

	/**
	 * THE ADMIN HALF OF THE EXCUSAL BUNDLE, assembled here rather than inside
	 * CellExcusal: the component asks whether it HAS a `set`, never who the
	 * viewer is, so there is one statement of the rule and it is this line.
	 */
	const excusalsForViewer: ExcusalTransports = $derived(
		data.isChair ? excusalTransports : { load: excusalTransports.load }
	);

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
	excusals={excusalsForViewer}
	entryMove={data.isChair ? entryMoveTransports : null}
	adminLog={data.isChair ? adminLogTransports : null}
	staffNote={staffNoteTransports}
	itemLink={itemLinkTransports}
	viewerId={data.viewerId}
/>
