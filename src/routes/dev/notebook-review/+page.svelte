<script lang="ts">
	import ReviewConsole from '$lib/notebook/ReviewConsole.svelte';
	import type { NotebookFlagReason, NotebookPhoto, NotebookStatus } from '$lib/notebook';
	import type { NoteDoc, NotebookNoteRow } from '$lib/notebook-notes';
	import {
		buildCsv,
		type GridCell,
		type GridSession,
		type GridStudent,
		type ReviewEntry,
		type ReviewResult,
		type ReviewSection,
		type ReviewTransports,
		type SectionGrid
	} from '$lib/notebook-review';

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
	/** A reviewer who is not yet the instructor of anything. */
	let noSections = $state(false);

	const INSTRUCTOR_ID = 'u-instr';
	const CHAIR_ID = 'u-chair';

	const SECTIONS: ReviewSection[] = [
		{
			id: 'sec-a',
			course_id: 'eng1h-sophomore',
			section_label: 'Engineering I Honors · P2',
			instructor_id: INSTRUCTOR_ID
		},
		{
			id: 'sec-b',
			course_id: 'eng1h-senior',
			section_label: 'Engineering I Honors · P4',
			instructor_id: 'u-someone-else'
		}
	];

	// ---- the in-memory database -------------------------------------------

	interface StoreSession extends GridSession {
		section_id: string;
	}
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
	interface StoreStudent {
		id: string;
		name: string;
		email: string;
		/** profiles.section_id -- enrollment is the loose 0003 match on course_id. */
		course_id: string | null;
	}

	let sessions = $state<StoreSession[]>([
		{ id: 'ses-a1', section_id: 'sec-a', unit_number: 3, session_date: '2026-08-03', session_label: 'Design brief' },
		{ id: 'ses-a2', section_id: 'sec-a', unit_number: 3, session_date: '2026-08-05', session_label: 'Shaft stackup calcs' },
		{ id: 'ses-a3', section_id: 'sec-a', unit_number: 3, session_date: '2026-08-07', session_label: 'Bearing teardown' },
		{ id: 'ses-a4', section_id: 'sec-a', unit_number: 2, session_date: '2026-07-28', session_label: 'Shop safety walk' },
		{ id: 'ses-b1', section_id: 'sec-b', unit_number: 3, session_date: '2026-08-04', session_label: 'Gear train sketch' }
	]);

	const STUDENTS: StoreStudent[] = [
		{ id: 'stu-1', name: 'Ana Ruiz', email: 'ana.ruiz@boscotech.net', course_id: 'eng1h-sophomore' },
		{ id: 'stu-2', name: 'Ben Okafor', email: 'ben.okafor@boscotech.net', course_id: 'eng1h-sophomore' },
		{ id: 'stu-3', name: 'Chloe Tran', email: 'chloe.tran@boscotech.net', course_id: 'eng1h-sophomore' },
		// Transferred out: NOT enrolled any more, but holds entries in sec-a, so
		// the RPC's roster UNION must keep them visible.
		{ id: 'stu-4', name: 'Dev Patel', email: 'dev.patel@boscotech.net', course_id: 'eng1h-senior' },
		{ id: 'stu-5', name: 'Eli Moreno', email: 'eli.moreno@boscotech.net', course_id: 'eng1h-senior' }
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
		mk('e-10', 'stu-5', 'sec-b', 'ses-b1', '2026-08-04T17:00:00Z', 'compliant', [photo('p-10', 1)])
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

	const actorId = $derived(viewer === 'chair' ? CHAIR_ID : INSTRUCTOR_ID);
	const isChair = $derived(viewer === 'chair');

	/** `public.is_admin() or public.notebook_is_section_instructor(section)` */
	function mayManage(sectionId: string): boolean {
		if (isChair) return true;
		return SECTIONS.some((s) => s.id === sectionId && s.instructor_id === actorId);
	}

	/** The RPC's LA-calendar-date comparison against session_date. */
	function onTime(uploadIso: string, sessionDate: string): boolean {
		const day = new Date(uploadIso).toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
		return day <= sessionDate;
	}

	function buildGrid(sectionId: string, unitNumber: number | null): SectionGrid {
		const section = SECTIONS.find((s) => s.id === sectionId)!;
		const sessionRows = sessions
			.filter((s) => s.section_id === sectionId && (unitNumber === null || s.unit_number === unitNumber))
			.sort(
				(a, b) =>
					a.session_date.localeCompare(b.session_date) ||
					a.unit_number - b.unit_number ||
					a.session_label.localeCompare(b.session_label)
			);

		// Roster: enrolled UNION anyone holding entries or excusals here.
		const sectionSessionIds = new Set(sessions.filter((s) => s.section_id === sectionId).map((s) => s.id));
		const roster: GridStudent[] = STUDENTS.filter(
			(p) =>
				p.course_id === section.course_id ||
				entries.some((e) => e.student_id === p.id && e.section_id === sectionId) ||
				EXCUSALS.some((x) => x.student_id === p.id && sectionSessionIds.has(x.session_id))
		)
			.map((p) => ({
				id: p.id,
				name: p.name,
				email: p.email,
				free_entries: entries.filter(
					(e) => e.student_id === p.id && e.section_id === sectionId && e.session_id === null
				).length
			}))
			.sort((a, b) => a.name.localeCompare(b.name));

		const cells: GridCell[] = [];
		for (const student of roster) {
			for (const session of sessionRows) {
				const mine = entries
					.filter((e) => e.student_id === student.id && e.session_id === session.id)
					.sort((a, b) => b.upload_timestamp.localeCompare(a.upload_timestamp));
				const latest = mine[0];
				const excused = EXCUSALS.some(
					(x) => x.student_id === student.id && x.session_id === session.id
				);
				cells.push({
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
			sessions: sessionRows.map(({ section_id: _s, ...rest }) => rest),
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
			note(`select notebook_sessions where section_id=${JSON.stringify(sectionId)}`);
			return {
				ok: true,
				value: sessions
					.filter((s) => s.section_id === sectionId)
					.map(({ section_id: _s, ...rest }) => rest)
			};
		},

		async saveSession(input) {
			note(`rpc notebook_admin_upsert_session ${JSON.stringify(input)}`);
			if (!mayManage(input.section_id)) {
				return {
					ok: false,
					error: 'Only the section instructor or a site admin can manage notebook sessions.'
				};
			}
			if (input.session_label.trim() === '') {
				return { ok: false, error: 'A session label is required.' };
			}
			if (input.id) {
				sessions = sessions.map((s) =>
					s.id === input.id
						? {
								...s,
								unit_number: input.unit_number,
								session_date: input.session_date,
								session_label: input.session_label
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
					section_id: input.section_id,
					unit_number: input.unit_number,
					session_date: input.session_date,
					session_label: input.session_label
				}
			];
			return { ok: true, value: { session_id: id } };
		},

		async deleteSession(sessionId) {
			note(`rpc notebook_admin_delete_session ${JSON.stringify({ p_session_id: sessionId })}`);
			const session = sessions.find((s) => s.id === sessionId);
			if (!session) return { ok: false, error: 'That session does not exist.' };
			if (!mayManage(session.section_id)) {
				return {
					ok: false,
					error: 'Only the section instructor or a site admin can delete notebook sessions.'
				};
			}
			// Entries are DETACHED, never deleted: session_id nulled and
			// custom_label backfilled from the session's own label.
			let detached = 0;
			entries = entries.map((e) => {
				if (e.session_id !== sessionId) return e;
				detached++;
				return { ...e, session_id: null, custom_label: e.custom_label ?? session.session_label };
			});
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
		noSections ? [] : isChair ? SECTIONS : SECTIONS.filter((s) => s.instructor_id === actorId)
	);

	// ---- CSV preview: the real buildCsv over the same store ----------------

	let csvSection = $state('sec-a');
	let csvUnit = $state('3');
	const csvText = $derived.by(() => {
		if (!mayManage(csvSection)) return '(this viewer may not read that section)';
		return buildCsv(buildGrid(csvSection, csvUnit === 'all' ? null : Number(csvUnit)));
	});

	// Console hook, so the CSV and the grid can be asserted programmatically.
	$effect(() => {
		(window as unknown as Record<string, unknown>).__notebookReview = {
			buildGrid,
			buildCsv,
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
	<label><input type="checkbox" bind:checked={noSections} /> no sections</label>
	<span class="hint">
		sections offered: {visibleSections.map((s) => s.id).join(', ') || '(none)'}
	</span>
	<button type="button" onclick={() => (log = [])}>clear log</button>
</div>

{#key viewer}
	<ReviewConsole sections={visibleSections} {isChair} {configured} {transports} />
{/key}

<section class="panel">
	<h2>CSV preview (the real buildCsv over the same store)</h2>
	<div class="csv-controls">
		<label>
			section
			<select bind:value={csvSection}>
				{#each SECTIONS as s (s.id)}<option value={s.id}>{s.id}</option>{/each}
			</select>
		</label>
		<label>
			unit
			<select bind:value={csvUnit}>
				<option value="all">all</option>
				<option value="2">2</option>
				<option value="3">3</option>
			</select>
		</label>
	</div>
	<pre>{csvText}</pre>
</section>

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
	.harness-bar button,
	.csv-controls select {
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
	.csv-controls {
		display: flex;
		gap: 1rem;
		margin-bottom: 0.6rem;
	}
	.csv-controls label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		color: var(--dim);
	}
	pre {
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--cyan);
		margin: 0;
	}
	ol {
		margin: 0;
		padding-left: 1.4rem;
		color: var(--dim);
		display: grid;
		gap: 0.2rem;
	}
</style>
