<script lang="ts">
	import ReviewConsole from '$lib/notebook/ReviewConsole.svelte';
	import type { NotebookFlagReason, NotebookPhoto, NotebookStatus } from '$lib/notebook';
	import type { NoteDoc, NotebookNoteRow } from '$lib/notebook-notes';
	import {
		type GridCell,
		type GridSession,
		type GridStudent,
		type ReviewEntry,
		type ReviewResult,
		type ReviewSection,
		type ReviewTransports,
		type SectionGrid
	} from '$lib/notebook-review';
	import {
		criterionMax,
		levelIndexForScore,
		type RubricCriterion
	} from '$lib/classroom/assignment-spec';
	import type {
		DocCheckData,
		DocCheckResult,
		DocCheckSubmission,
		DocCheckTransports,
		GradeOutcome,
		LinkableItem,
		UnitItemLink
	} from '$lib/notebook-documentation-check';

	/**
	 * Dev harness: mounts the REAL ReviewConsole (and with it the real
	 * SessionManager, SectionGrid, EntryReview and NotebookPhotos) against an
	 * in-memory store that mirrors 0069's actual rules -- no auth, no
	 * Supabase, no Drive.
	 *
	 * The store is not a stub that always says yes. It reproduces the parts of
	 * `notebook_get_section_grid` whose OUTPUT the UI is written against (the
	 * roster union, latest-entry-per-cell, entry_count, the
	 * America/Los_Angeles-date on_time comparison, excusals, free_entries) AND
	 * the instructor-or-admin refusal every notebook RPC performs -- so
	 * "an instructor cannot reach another section's grid" is demonstrable
	 * here, not merely assumed from the route's own scoping.
	 *
	 * Every transport call is logged VERBATIM, which is how "a flag reaches
	 * notebook_flag_entry with these exact arguments" is verified rather than
	 * assumed.
	 *
	 * Viewers:
	 *  - "instructor" -- teaches section A only. Must not see section B.
	 *  - "chair"      -- the 0067 admin tier. Sees both.
	 */

	type Viewer = 'instructor' | 'chair';
	let viewer = $state<Viewer>('instructor');
	let log = $state<string[]>([]);
	/** 0069 unapplied (the fail-soft card), the /dev/notebook toggle. */
	let configured = $state(true);
	/** 0097 unapplied: the Documentation Check panel is simply absent. */
	let docCheckReady = $state(true);
	/** A reviewer who is not yet the instructor of anything. */
	let noSections = $state(false);

	// Staff identity is an EMAIL since 0094 (classroom_sections.teacher_email),
	// so the old instructor/chair uuids are gone with the check that used them.
	const INSTRUCTOR_EMAIL = 'ines.tructor@boscotech.edu';

	// Since 0094 these are CLASSROOM sections (0082) and "the instructor" is the
	// teacher of record, matched by email rather than by uuid.
	const SECTIONS: ReviewSection[] = [
		{
			id: 'sec-a',
			course_code: 'ENG1H',
			course_title: 'Engineering I Honors',
			label: 'Period 2',
			block: 'B',
			teacher_email: INSTRUCTOR_EMAIL
		},
		{
			id: 'sec-b',
			course_code: 'ENG1H',
			course_title: 'Engineering I Honors',
			label: 'Period 4',
			block: null,
			teacher_email: 'someone.else@boscotech.edu'
		}
	];

	// ---- the in-memory database -------------------------------------------

	/**
	 * Since 0098 a check-in is ONE canonical record with a posting per section,
	 * so the store holds the full set rather than a single owner. GridSession
	 * already carries `section_ids`, so nothing is added here at all.
	 */
	type StoreSession = GridSession & { section_ids: string[] };
	interface StoreEntry {
		id: string;
		student_id: string;
		section_id: string;
		session_id: string | null;
		custom_label: string | null;
		upload_timestamp: string;
		status: NotebookStatus;
		flag_reason: NotebookFlagReason | null;
		instructor_comment: string | null;
		/**
		 * The student's own filing (0088), shown to staff as context. Optional
		 * here so the existing fixtures keep meaning "unfiled" without being
		 * rewritten -- which is also the real pre-0088 state.
		 */
		folder_name?: string | null;
		photos: NotebookPhoto[];
		/** Written notes (0078). The review panel renders them read-only. */
		notes: NotebookNoteRow[];
	}
	/**
	 * A roster row. Since 0094 enrollment is a classroom_enrollments row keyed
	 * by EMAIL, and `id` is null for a student who has been enrolled but has
	 * never signed in -- a normal state a real roster reaches every August.
	 */
	interface StoreStudent {
		id: string | null;
		name: string;
		email: string;
		/** The section they are ACTIVELY enrolled in, or null once they leave. */
		section_id: string | null;
	}

	let sessions = $state<StoreSession[]>([
		{ id: 'ses-a1', section_ids: ['sec-a'], unit_number: 3, session_date: '2026-08-03', session_label: 'Design brief' },
		// SHARED ACROSS BOTH SECTIONS: the case the whole change exists for.
		// One record, one date, a column in each of the two grids.
		{ id: 'ses-a2', section_ids: ['sec-a', 'sec-b'], unit_number: 3, session_date: '2026-08-05', session_label: 'Shaft stackup calcs' },
		{ id: 'ses-a3', section_ids: ['sec-a'], unit_number: 3, session_date: '2026-08-07', session_label: 'Bearing teardown' },
		{ id: 'ses-a4', section_ids: ['sec-a'], unit_number: 2, session_date: '2026-07-28', session_label: 'Shop safety walk' },
		{ id: 'ses-b1', section_ids: ['sec-b'], unit_number: 3, session_date: '2026-08-04', session_label: 'Gear train sketch' }
	]);

	const STUDENTS: StoreStudent[] = [
		{ id: 'stu-1', name: 'Ruiz, Ana', email: 'ana.ruiz@boscotech.net', section_id: 'sec-a' },
		{ id: 'stu-2', name: 'Okafor, Ben', email: 'ben.okafor@boscotech.net', section_id: 'sec-a' },
		{ id: 'stu-3', name: 'Tran, Chloe', email: 'chloe.tran@boscotech.net', section_id: 'sec-a' },
		// Transferred out: NOT on the active roster any more, but holds entries in
		// sec-a, so the RPC's roster UNION must keep them visible (flagged as no
		// longer enrolled).
		{ id: 'stu-4', name: 'Patel, Dev', email: 'dev.patel@boscotech.net', section_id: 'sec-b' },
		{ id: 'stu-5', name: 'Moreno, Eli', email: 'eli.moreno@boscotech.net', section_id: 'sec-b' },
		// ON THE ROSTER, NEVER SIGNED IN. No account, so no uuid at all -- the
		// state that makes the grid's row key the email rather than the id.
		{ id: null, name: 'Newcomer, Dana', email: 'dana.newcomer@boscotech.net', section_id: 'sec-a' }
	];

	function photo(
		id: string,
		seq: number,
		filename: string | null = null,
		variant: 'original' | 'enhanced' = 'original'
	): NotebookPhoto {
		return {
			id,
			drive_file_id: `drive-${id}`,
			variant,
			sequence_order: seq,
			original_filename: filename
		};
	}

	let entries = $state<StoreEntry[]>([
		// Ana: three on-time entries -> 3 of 3. The first carries an original +
		// its adjacent 'enhanced' pair, so the review panel's page grouping
		// (corrected shown by default, toggle back to the original) is
		// drivable here.
		mk('e-1', 'stu-1', 'sec-a', 'ses-a1', '2026-08-03T16:10:00Z', 'compliant', [
			photo('p-1', 1, 'brief.jpg'),
			photo('p-1e', 2, 'brief-corrected.jpg', 'enhanced')
		]),
		mk('e-2', 'stu-1', 'sec-a', 'ses-a2', '2026-08-05T15:40:00Z', 'compliant', [photo('p-2', 1, 'stackup.jpg')]),
		// A session-linked entry carrying a note that has already been REVISED:
		// the instructor sees the current text and the earlier version, and no
		// edit control anywhere (0078 refuses it for anyone but the owner, and
		// on a check-in for the owner too).
		mk(
			'e-3',
			'stu-1',
			'sec-a',
			'ses-a3',
			'2026-08-07T15:05:00Z',
			'compliant',
			[photo('p-3', 1)],
			[
				noteRow('n-1', 'e-3', 'n-1', 1, 'Pulled the bearing without the puller.', '2026-08-07T15:06:00Z'),
				noteRow(
					'n-2',
					'e-3',
					'n-1',
					2,
					'Pulled the bearing without the puller, which scored the race.',
					'2026-08-07T15:20:00Z'
				)
			]
		),
		// Ben: one LATE, one FLAGGED, one missing -> 2 of 3, 1 flag. The late
		// one carries a folder, so the staff-facing "Filed under" context (0088)
		// renders on one entry and is absent on every other -- both states.
		{
			...mk('e-4', 'stu-2', 'sec-a', 'ses-a1', '2026-08-06T20:15:00Z', 'compliant', [
				photo('p-4', 1, 'late-brief.jpg')
			]),
			folder_name: 'Gearbox build'
		},
		{
			...mk('e-5', 'stu-2', 'sec-a', 'ses-a2', '2026-08-05T14:00:00Z', 'flagged', [photo('p-5', 1)]),
			flag_reason: 'illegible',
			instructor_comment: 'Pencil is too faint to read past the second page.'
		},
		// Chloe: one excused (below), one resubmitted -> 1 of 3.
		mk('e-6', 'stu-3', 'sec-a', 'ses-a3', '2026-08-07T18:30:00Z', 'pending_review', [
			photo('p-6', 1, 'teardown-1.jpg'),
			photo('p-7', 2, 'teardown-2.jpg')
		]),
		// Dev (transferred in): TWO entries for one check-in -> the cell shows
		// the latest and badges the count.
		mk('e-7', 'stu-4', 'sec-a', 'ses-a3', '2026-08-06T09:00:00Z', 'compliant', [photo('p-8', 1)]),
		mk('e-8', 'stu-4', 'sec-a', 'ses-a3', '2026-08-07T09:00:00Z', 'compliant', [photo('p-9', 1, 'redo.jpg')]),
		// ...and a session-less free entry, which has no column but is counted.
		{
			// No photos at all: a written-note entry, which is exactly what the
			// review panel must render rather than an "empty entry" message.
			...mk('e-9', 'stu-4', 'sec-a', null, '2026-08-08T11:00:00Z', 'compliant', [], [
				noteRow(
					'n-3',
					'e-9',
					'n-3',
					1,
					'Measured the bench spacing; the drill press needs another 300mm.',
					'2026-08-08T11:00:00Z'
				)
			]),
			custom_label: 'Shop layout notes'
		},
		// Section B, so the chair has something to switch to.
		mk('e-10', 'stu-5', 'sec-b', 'ses-b1', '2026-08-04T17:00:00Z', 'compliant', [photo('p-10', 1)]),
		// Filed by a sec-b student against the SHARED check-in (ses-a2). It has
		// to stay on sec-b's grid and off sec-a's, and it is what unposting
		// sec-b must detach rather than destroy.
		mk('e-11', 'stu-4', 'sec-b', 'ses-a2', '2026-08-05T18:20:00Z', 'compliant', [photo('p-11', 1)])
	]);

	function mk(
		id: string,
		student_id: string,
		section_id: string,
		session_id: string | null,
		upload_timestamp: string,
		status: NotebookStatus,
		photos: NotebookPhoto[],
		notes: NotebookNoteRow[] = []
	): StoreEntry {
		return {
			id,
			student_id,
			section_id,
			session_id,
			custom_label: null,
			upload_timestamp,
			status,
			flag_reason: null,
			instructor_comment: null,
			photos,
			notes
		};
	}

	/** One stored revision row, in the shape 0078 returns. */
	function noteRow(
		id: string,
		entry_id: string,
		note_id: string,
		revision: number,
		text: string,
		created_at: string
	): NotebookNoteRow {
		const content: NoteDoc = [{ type: 'p', runs: [{ text }] }];
		return { id, entry_id, note_id, revision, content, created_at };
	}

	/** Chloe is excused from the stackup check-in. */
	const EXCUSALS = [{ session_id: 'ses-a2', student_id: 'stu-3' }];

	// ---- the RPC's own rules, mirrored -------------------------------------

	const isChair = $derived(viewer === 'chair');

	/** `public.classroom_manages_section(section)` -- teacher of record or admin. */
	function mayManage(sectionId: string): boolean {
		if (isChair) return true;
		return SECTIONS.some((s) => s.id === sectionId && s.teacher_email === INSTRUCTOR_EMAIL);
	}

	/**
	 * 0098's _notebook_detach_session_entries: entries filed against a check-in
	 * are DETACHED, never deleted -- session_id nulled, custom_label backfilled
	 * from the check-in's own label. `sectionId` null = every section (delete),
	 * otherwise just that one (unpost, or a reconcile that drops it).
	 */
	function detachFrom(session: StoreSession, sectionId: string | null): number {
		let detached = 0;
		entries = entries.map((e) => {
			if (e.session_id !== session.id) return e;
			if (sectionId !== null && e.section_id !== sectionId) return e;
			detached++;
			return { ...e, session_id: null, custom_label: e.custom_label ?? session.session_label };
		});
		return detached;
	}

	/** The RPC's LA-calendar-date comparison against session_date. */
	function onTime(uploadIso: string, sessionDate: string): boolean {
		const day = new Date(uploadIso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
		return day <= sessionDate;
	}

	function buildGrid(sectionId: string, unitNumber: number | null): SectionGrid {
		const section = SECTIONS.find((s) => s.id === sectionId)!;
		const sessionRows = sessions
			.filter(
				(s) =>
					s.section_ids.includes(sectionId) &&
					(unitNumber === null || s.unit_number === unitNumber)
			)
			.sort(
				(a, b) =>
					a.session_date.localeCompare(b.session_date) ||
					a.unit_number - b.unit_number ||
					a.session_label.localeCompare(b.session_label)
			);

		// Roster (0094): the section's ACTIVE enrollments UNION anyone holding
		// entries or excusals here, keyed by email because a roster row may have
		// no account behind it.
		const sectionSessionIds = new Set(
			sessions.filter((s) => s.section_ids.includes(sectionId)).map((s) => s.id)
		);
		const roster: GridStudent[] = STUDENTS.filter(
			(p) =>
				p.section_id === sectionId ||
				(p.id !== null &&
					(entries.some((e) => e.student_id === p.id && e.section_id === sectionId) ||
						EXCUSALS.some((x) => x.student_id === p.id && sectionSessionIds.has(x.session_id))))
		)
			.map((p) => ({
				student_key: p.email || String(p.id),
				id: p.id,
				name: p.name,
				email: p.email,
				enrolled: p.section_id === sectionId,
				free_entries: entries.filter(
					(e) => p.id !== null && e.student_id === p.id && e.section_id === sectionId && e.session_id === null
				).length
			}))
			.sort((a, b) => a.name.localeCompare(b.name) || a.student_key.localeCompare(b.student_key));

		const cells: GridCell[] = [];
		for (const student of roster) {
			for (const session of sessionRows) {
				const mine = entries
					// SCOPED TO THIS SECTION, which the single-section model got
					// for free: a shared check-in also holds the other class's
					// entries, and they belong on that class's grid.
					.filter(
						(e) =>
							e.student_id === student.id &&
							e.session_id === session.id &&
							e.section_id === sectionId
					)
					.sort((a, b) => b.upload_timestamp.localeCompare(a.upload_timestamp));
				const latest = mine[0];
				const excused = EXCUSALS.some(
					(x) => x.student_id === student.id && x.session_id === session.id
				);
				cells.push({
					student_key: student.student_key,
					student_id: student.id,
					session_id: session.id,
					status: latest ? latest.status : excused ? 'excused' : 'missing',
					entry_id: latest?.id ?? null,
					entry_count: mine.length,
					upload_timestamp: latest?.upload_timestamp ?? null,
					on_time: latest ? onTime(latest.upload_timestamp, session.session_date) : null,
					excused,
					flag_reason: latest?.flag_reason ?? null
				});
			}
		}

		return {
			section,
			unit_number: unitNumber,
			generated_at: new Date().toISOString(),
			sessions: sessionRows,
			students: roster,
			cells
		};
	}

	function note(line: string) {
		log = [...log, line];
	}

	let nextId = 0;

	const transports: ReviewTransports = {
		async loadSessions(sectionId) {
			note(`select notebook_session_postings where section_id=${JSON.stringify(sectionId)}`);
			return {
				ok: true,
				// Every section each one runs in, not just the one asked about --
				// what the real transport's two-step read is for.
				value: sessions.filter((s) => s.section_ids.includes(sectionId)).map((s) => ({ ...s }))
			};
		},

		async saveSession(input) {
			note(`rpc notebook_admin_upsert_session ${JSON.stringify(input)}`);
			// ALL-OR-NOTHING over every target, the real _notebook_check_session_targets.
			if (input.section_ids.length === 0) {
				return { ok: false, error: 'Select at least one section for this check-in.' };
			}
			if (!input.section_ids.every(mayManage)) {
				return {
					ok: false,
					error: 'You are not the teacher of record for one of the selected sections.'
				};
			}
			if (input.session_label.trim() === '') {
				return { ok: false, error: 'A session label is required.' };
			}
			if (input.id) {
				const existing = sessions.find((s) => s.id === input.id);
				if (!existing) return { ok: false, error: 'That session does not exist.' };
				// Editing needs EVERY section it runs in, not just the ones
				// being listed -- otherwise reconcile-to-mine would be a way to
				// seize a shared check-in.
				if (!existing.section_ids.every(mayManage)) {
					return {
						ok: false,
						error:
							'Only the teacher of record for every section this check-in runs in can edit it.'
					};
				}
				const dropped = existing.section_ids.filter((id) => !input.section_ids.includes(id));
				for (const id of dropped) detachFrom(existing, id);
				sessions = sessions.map((s) =>
					s.id === input.id
						? {
								...s,
								unit_number: input.unit_number,
								session_date: input.session_date,
								session_label: input.session_label,
								section_ids: [...input.section_ids]
							}
						: s
				);
				return { ok: true, value: { session_id: input.id } };
			}
			const id = `ses-new-${++nextId}`;
			sessions = [
				...sessions,
				{
					id,
					section_ids: [...input.section_ids],
					unit_number: input.unit_number,
					session_date: input.session_date,
					session_label: input.session_label
				}
			];
			return { ok: true, value: { session_id: id } };
		},

		async addSessionSections(sessionId, sectionIds) {
			note(
				`rpc notebook_add_session_postings ${JSON.stringify({ p_session_id: sessionId, p_section_ids: sectionIds })}`
			);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session) return { ok: false, error: 'That session does not exist.' };
			if (!session.section_ids.every(mayManage)) {
				return {
					ok: false,
					error:
						'Only the teacher of record for every section this check-in runs in can add another.'
				};
			}
			if (!sectionIds.every(mayManage)) {
				return {
					ok: false,
					error: 'You are not the teacher of record for one of the selected sections.'
				};
			}
			const added = sectionIds.filter((id) => !session.section_ids.includes(id));
			sessions = sessions.map((s) =>
				s.id === sessionId ? { ...s, section_ids: [...s.section_ids, ...added] } : s
			);
			return { ok: true, value: { added: added.length } };
		},

		async removeSessionSection(sessionId, sectionId) {
			note(
				`rpc notebook_remove_session_posting ${JSON.stringify({ p_session_id: sessionId, p_section_id: sectionId })}`
			);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session || !session.section_ids.includes(sectionId)) {
				return { ok: false, error: 'That check-in does not run in that section.' };
			}
			// THE WEAKER PERMISSION, deliberately: taking your own class off a
			// shared check-in needs only that section.
			if (!mayManage(sectionId)) {
				return {
					ok: false,
					error: "Only the section's teacher of record or a site admin can remove it."
				};
			}
			if (session.section_ids.length <= 1) {
				return { ok: true, value: { ok: false, reason: 'last_posting' } };
			}
			const detached = detachFrom(session, sectionId);
			sessions = sessions.map((s) =>
				s.id === sessionId
					? { ...s, section_ids: s.section_ids.filter((id) => id !== sectionId) }
					: s
			);
			return {
				ok: true,
				value: { ok: true, detached_entries: detached, remaining: session.section_ids.length - 1 }
			};
		},

		async deleteSession(sessionId) {
			note(`rpc notebook_admin_delete_session ${JSON.stringify({ p_session_id: sessionId })}`);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session) return { ok: false, error: 'That session does not exist.' };
			if (!session.section_ids.every(mayManage)) {
				return {
					ok: false,
					error:
						'Only the teacher of record for every section this check-in runs in can delete it.'
				};
			}
			const detached = detachFrom(session, null);
			sessions = sessions.filter((s) => s.id !== sessionId);
			return { ok: true, value: { detached_entries: detached } };
		},

		async loadGrid(sectionId, unitNumber) {
			note(
				`rpc notebook_get_section_grid ${JSON.stringify({ p_section_id: sectionId, p_unit_number: unitNumber })}`
			);
			if (!SECTIONS.some((s) => s.id === sectionId)) {
				return { ok: false, error: 'That section does not exist.' };
			}
			if (!mayManage(sectionId)) {
				return {
					ok: false,
					error: 'Only the section instructor or a site admin can view the notebook grid.'
				};
			}
			return { ok: true, value: buildGrid(sectionId, unitNumber) };
		},

		async loadEntry(entryId) {
			note(`select notebook_entries where id=${JSON.stringify(entryId)}`);
			const entry = entries.find((e) => e.id === entryId);
			// RLS: staff read entries of sections they own; anything else is
			// simply not there.
			if (!entry || !mayManage(entry.section_id)) {
				return { ok: false, error: 'That entry is no longer available.' };
			}
			return { ok: true, value: { ...entry } as ReviewEntry };
		},

		async flagEntry(entryId, reason, comment) {
			note(
				`rpc notebook_flag_entry ${JSON.stringify({
					p_entry_id: entryId,
					p_flag_reason: reason,
					p_instructor_comment: comment
				})}`
			);
			const entry = entries.find((e) => e.id === entryId);
			if (!entry) return { ok: false, error: 'That entry does not exist.' };
			if (!mayManage(entry.section_id)) {
				return {
					ok: false,
					error: 'Only the section instructor or a site admin can flag notebook entries.'
				};
			}
			entries = entries.map((e) =>
				e.id === entryId
					? { ...e, status: 'flagged', flag_reason: reason, instructor_comment: comment }
					: e
			);
			return { ok: true, value: undefined };
		},

		async resolveEntry(entryId, comment) {
			note(
				`rpc notebook_resolve_entry ${JSON.stringify({
					p_entry_id: entryId,
					p_instructor_comment: comment
				})}`
			);
			const entry = entries.find((e) => e.id === entryId);
			if (!entry) return { ok: false, error: 'That entry does not exist.' };
			if (!mayManage(entry.section_id)) {
				return {
					ok: false,
					error: 'Only the section instructor or a site admin can resolve notebook entries.'
				};
			}
			entries = entries.map((e) =>
				e.id === entryId
					? {
							...e,
							status: 'compliant',
							flag_reason: null,
							instructor_comment: comment ?? e.instructor_comment
						}
					: e
			);
			return { ok: true, value: undefined };
		}
	};

	/** Exactly what the route's load hands the console: scoped per viewer. */
	const visibleSections = $derived(
		noSections
			? []
			: isChair
				? SECTIONS
				: SECTIONS.filter((s) => s.teacher_email === INSTRUCTOR_EMAIL)
	);

	// ---- Documentation Check (0097 + Classroom's grading RPC), mirrored -----
	//
	// The store reproduces the rules the UI is written against, not a stub that
	// always says yes: which assignments a section may be graded on, the
	// composite "posted to this section" requirement 0097's FK enforces, and --
	// the important one -- classroom_can_review_submission, so
	// "a teacher of one class cannot grade another class's student" is
	// demonstrable here rather than assumed. Grades land in the same
	// {itemId|email} shape classroom_submissions holds them in.

	interface StoreItem extends LinkableItem {
		kind: 'assignment' | 'material';
		/** classroom_postings: which sections this one canonical item is in. */
		section_ids: string[];
	}

	const ITEMS: StoreItem[] = [
		{ id: 'itm-doc3', title: 'Unit 3 Documentation Check', points: 25, kind: 'assignment', section_ids: ['sec-a'] },
		{ id: 'itm-gearbox', title: 'Gearbox teardown writeup', points: 40, kind: 'assignment', section_ids: ['sec-a'] },
		{ id: 'itm-syllabus', title: 'Course syllabus', points: null, kind: 'material', section_ids: ['sec-a'] },
		{ id: 'itm-doc-b', title: 'Unit 3 Documentation Check (P4)', points: 25, kind: 'assignment', section_ids: ['sec-b'] }
	];

	let docLinks = $state<UnitItemLink[]>([]);
	let docRubrics = $state<Record<string, RubricCriterion[]>>({});
	let docSubmissions = $state<Record<string, DocCheckSubmission>>({});

	function docFail(message: string): DocCheckResult<never> {
		return { ok: false, error: message };
	}

	/** `classroom_can_review_submission(item, email)`, mirrored exactly. */
	function mayReview(itemId: string, email: string): boolean {
		const item = ITEMS.find((i) => i.id === itemId);
		if (!item) return false;
		return item.section_ids.some(
			(sid) =>
				mayManage(sid) &&
				STUDENTS.some((s) => s.email === email && s.section_id === sid)
		);
	}

	const docCheckTransports: DocCheckTransports = {
		async load(sectionId, unitNumber) {
			log = [...log, `docCheck.load(${sectionId}, ${unitNumber})`];
			if (!mayManage(sectionId)) return docFail('Only the section instructor or a site admin can view this.');
			const link = docLinks.find((l) => l.section_id === sectionId && l.unit_number === unitNumber) ?? null;
			const candidates: LinkableItem[] = ITEMS.filter(
				(i) => i.kind === 'assignment' && i.section_ids.includes(sectionId)
			).map((i) => ({ id: i.id, title: i.title, points: i.points }));
			const item = link ? (ITEMS.find((i) => i.id === link.item_id) ?? null) : null;
			const submissions: Record<string, DocCheckSubmission> = {};
			if (item) {
				for (const [key, row] of Object.entries(docSubmissions)) {
					if (key.startsWith(`${item.id}|`)) submissions[row.student_email] = row;
				}
			}
			const value: DocCheckData = {
				link,
				item: item ? { id: item.id, title: item.title, points: item.points } : null,
				rubric: item ? (docRubrics[item.id] ?? null) : null,
				submissions,
				candidates
			};
			return { ok: true, value };
		},

		async linkItem(sectionId, unitNumber, itemId) {
			log = [...log, `notebook_link_unit_item(${sectionId}, ${unitNumber}, ${itemId})`];
			if (!mayManage(sectionId)) {
				return docFail('Only the section instructor or a site admin can link a Documentation Check.');
			}
			const item = ITEMS.find((i) => i.id === itemId);
			if (!item) return docFail('That classwork item does not exist.');
			if (item.kind !== 'assignment') {
				return docFail(`A Documentation Check has to be an assignment; ${item.kind} cannot be graded.`);
			}
			if (!item.section_ids.includes(sectionId)) {
				return docFail('That assignment is not posted to this class, so this class cannot be graded on it.');
			}
			docLinks = [
				...docLinks.filter((l) => !(l.section_id === sectionId && l.unit_number === unitNumber)),
				{ section_id: sectionId, unit_number: unitNumber, item_id: itemId }
			];
			return { ok: true, value: undefined };
		},

		async unlinkItem(sectionId, unitNumber) {
			log = [...log, `notebook_unlink_unit_item(${sectionId}, ${unitNumber})`];
			if (!mayManage(sectionId)) return docFail('Only the section instructor or a site admin can unlink this.');
			docLinks = docLinks.filter((l) => !(l.section_id === sectionId && l.unit_number === unitNumber));
			return { ok: true, value: undefined };
		},

		async installRubric(itemId, criteria) {
			log = [...log, `classroom_set_rubric(${itemId}, ${criteria.length} criteria)`];
			docRubrics = { ...docRubrics, [itemId]: criteria };
			return { ok: true, value: undefined };
		},

		async gradeSubmission(itemId, studentEmail, scores, comment, release, criterionComments) {
			log = [
				...log,
				`classroom_grade_submission(${itemId}, ${studentEmail}, ${JSON.stringify(scores)}, ${JSON.stringify(comment)}, ${release}, ${JSON.stringify(criterionComments)})`
			];
			if (!mayReview(itemId, studentEmail)) {
				return docFail("Only a teacher of record for this student's class can grade this.");
			}
			const criteria = docRubrics[itemId];
			if (!criteria?.length) return docFail('Create a rubric for this assignment before grading.');

			// The 0095 rules the panel must render: an off-level score needs a
			// comment, and a release needs every criterion scored.
			const uncommented: string[] = [];
			const missing: string[] = [];
			let total = 0;
			for (const c of criteria) {
				const value = scores[c.id];
				if (value == null) {
					missing.push(c.id);
					continue;
				}
				if (value < 0 || value > criterionMax(c)) {
					return docFail(`The score for "${c.criterion}" must be between 0 and ${criterionMax(c)}.`);
				}
				total += value;
				if (levelIndexForScore(c, value) < 0 && !(criterionComments[c.id] ?? '').trim()) {
					uncommented.push(c.id);
				}
			}
			for (const key of Object.keys(scores)) {
				if (!criteria.some((c) => c.id === key)) {
					return docFail(`Score key "${key}" is not a rubric criterion.`);
				}
			}
			if (uncommented.length) {
				const outcome: GradeOutcome = { ok: false, reason: 'override_needs_comment', missing: uncommented };
				return { ok: true, value: outcome };
			}
			if (release && missing.length) {
				const outcome: GradeOutcome = { ok: false, reason: 'incomplete_scores', missing };
				return { ok: true, value: outcome };
			}

			const now = new Date().toISOString();
			const prior = docSubmissions[`${itemId}|${studentEmail}`];
			docSubmissions = {
				...docSubmissions,
				[`${itemId}|${studentEmail}`]: {
					student_email: studentEmail,
					state: release ? 'returned' : (prior?.state ?? 'draft'),
					score: total,
					rubric_scores: { ...scores },
					criterion_comments: { ...criterionComments },
					teacher_comment: comment,
					graded_at: now,
					returned_at: release ? now : (prior?.returned_at ?? null)
				}
			};
			const outcome: GradeOutcome = { ok: true, score: total, state: release ? 'returned' : 'draft' };
			return { ok: true, value: outcome };
		}
	};

	// Console hook, so the grid and the Documentation Check store can be
	// asserted programmatically.
	$effect(() => {
		(window as unknown as Record<string, unknown>).__notebookReview = {
			buildGrid,
			docCheckTransports,
			get docLinks() {
				return docLinks;
			},
			get docRubrics() {
				return docRubrics;
			},
			get docSubmissions() {
				return docSubmissions;
			},
			/**
			 * The same object the console is driving. Exposed so the SCOPING can
			 * be shown to be a real refusal -- an instructor asking the transport
			 * for another section's grid directly -- rather than only a shorter
			 * picker.
			 */
			transports,
			get entries() {
				return entries;
			},
			get sessions() {
				return sessions;
			},
			get log() {
				return log;
			},
			setViewer: (v: Viewer) => (viewer = v)
		};
	});
</script>

<svelte:head><title>dev // notebook review</title></svelte:head>

<div class="harness-bar">
	<strong>dev harness</strong>
	<label>
		viewer
		<select bind:value={viewer}>
			<option value="instructor">instructor (teaches P2 only)</option>
			<option value="chair">chair / admin (all sections)</option>
		</select>
	</label>
	<label><input type="checkbox" bind:checked={configured} /> 0069 applied</label>
	<label><input type="checkbox" bind:checked={docCheckReady} /> 0097 applied</label>
	<label><input type="checkbox" bind:checked={noSections} /> no sections</label>
	<span class="hint">
		sections offered: {visibleSections.map((s) => s.id).join(', ') || '(none)'}
	</span>
	<button type="button" onclick={() => (log = [])}>clear log</button>
</div>

{#key viewer}
	<ReviewConsole
		sections={visibleSections}
		{isChair}
		{configured}
		{transports}
		docCheck={docCheckReady ? docCheckTransports : null}
	/>
{/key}

<section class="panel">
	<h2>Transport log</h2>
	{#if log.length === 0}
		<p class="hint">Nothing called yet.</p>
	{:else}
		<ol>
			{#each log as line, i (i)}<li>{line}</li>{/each}
		</ol>
	{/if}
</section>

<style>
	.harness-bar {
		position: sticky;
		top: 0;
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.5rem 1.2rem;
		background: var(--bg2);
		border-bottom: 1px solid var(--line-strong);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
	}
	.harness-bar label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}
	.harness-bar select,
	.harness-bar button {
		background: var(--bg0);
		color: var(--white);
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0.25rem 0.4rem;
		font-family: inherit;
		font-size: inherit;
	}
	.hint {
		color: var(--dim);
	}
	.panel {
		max-width: 76rem;
		margin: 0 auto 1.5rem;
		padding: 0.9rem 1.2rem;
		border: 1px dashed var(--line);
		border-radius: 4px;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
	}
	.panel h2 {
		font-size: 0.85rem;
		margin: 0 0 0.5rem;
		color: var(--gold);
	}
	ol {
		margin: 0;
		padding-left: 1.4rem;
		color: var(--dim);
		display: grid;
		gap: 0.2rem;
	}
</style>
