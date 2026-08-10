<script lang="ts">
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import type {
		AddPhotoResult,
		CreateEntryResult,
		NoteSaveResult,
		NotebookEntry,
		NotebookSession,
		NotePayload
	} from '$lib/notebook';
	import type { NoteDoc, NotebookNoteRow, TiptapNode } from '$lib/notebook-notes';

	/**
	 * Dev harness: mounts the REAL NotebookView with the five save transports
	 * faked in memory, so the whole screen -- role branches, the session
	 * quick-picks, the free-form path (photos AND the written-note tier), the
	 * multi-photo sequencing, adding to an existing entry, note revision
	 * history, and every entry-title fallback -- is drivable with no auth, no
	 * Supabase and no Drive.
	 *
	 * NOTE CONTENT IS NORMALIZED BY THE REAL SANITIZER. The fakes POST the
	 * editor's output to /dev/notebook/normalize, which runs the shipped
	 * normalizeNoteDoc; nothing here re-implements it. So what the harness
	 * stores and renders is what the real routes would have stored.
	 *
	 * The fakes answer in the same shape the real page's fetch wrappers do,
	 * and every call is logged verbatim (including WHICH form fields were
	 * sent), which is how "a blank title submits no custom_label at all" is
	 * verified rather than assumed.
	 *
	 * Accounts:
	 *  - "student"    -- pinned class, three scheduled check-ins (one already
	 *                    covered), a populated feed. No review link.
	 *  - "instructor" -- teaches a section, so the "Section review" link
	 *                    renders. Keeps a personal notebook of their own.
	 *  - "plain"      -- signed in, no pinned class, no sessions, no entries:
	 *                    the free-form-only path and the empty state.
	 */

	type Account = 'student' | 'instructor' | 'plain';
	let account = $state<Account>('student');
	let configured = $state(true);
	let notesReady = $state(true);
	let uploadReady = $state(true);
	let log = $state<string[]>([]);

	/**
	 * Platform simulator for the capture-path branch.
	 *
	 * Patches navigator.userAgent for real and REMOUNTS NotebookView (the
	 * {#key} below), so the shipped `preferredCapturePath(navigator.userAgent,
	 * ...)` call is the thing being exercised -- rather than adding a
	 * test-only prop to production code and then verifying the prop.
	 */
	type SimPlatform = 'device' | 'android' | 'ios';
	let platform = $state<SimPlatform>('device');
	const UA: Record<SimPlatform, string | null> = {
		device: null,
		android:
			'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Mobile Safari/537.36',
		ios: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
	};
	const realUA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
	$effect(() => {
		const ua = UA[platform] ?? realUA;
		Object.defineProperty(navigator, 'userAgent', { configurable: true, get: () => ua });
	});

	const SESSIONS: NotebookSession[] = [
		{
			id: 'ses-1',
			section_id: 'sec-1',
			unit_number: 3,
			session_date: '2026-08-08',
			session_label: 'Bearing teardown'
		},
		{
			id: 'ses-2',
			section_id: 'sec-1',
			unit_number: 3,
			session_date: '2026-08-05',
			session_label: 'Shaft stackup calcs'
		},
		{
			id: 'ses-3',
			section_id: 'sec-1',
			unit_number: 2,
			session_date: '2026-07-29',
			session_label: 'Design brief + sketches'
		}
	];

	function photo(
		id: string,
		seq: number,
		original_filename: string | null = null,
		variant: 'original' | 'enhanced' = 'original'
	) {
		return { id, drive_file_id: `drive-${id}`, variant, sequence_order: seq, original_filename };
	}

	/** One stored revision row, in the shape 0078 returns. */
	function note(
		id: string,
		entry_id: string,
		note_id: string,
		revision: number,
		content: NoteDoc,
		created_at: string
	): NotebookNoteRow {
		return { id, entry_id, note_id, revision, content, created_at };
	}

	/** Shorthand for a plain-paragraph document. */
	const p = (...text: string[]): NoteDoc => text.map((t) => ({ type: 'p', runs: [{ text: t }] }));

	// Deliberately OLDEST-FIRST: the real load asks Postgres for newest-first,
	// so feeding the reverse is what proves the component's own newestFirst()
	// ordering is doing the work rather than inheriting the caller's order.
	const STUDENT_ENTRIES: NotebookEntry[] = [
		{
			// Session-linked: the session's own label wins over everything, and
			// its note carries NO edit control (0078 refuses the edit anyway).
			id: 'e-1',
			session_id: 'ses-3',
			section_id: 'sec-1',
			custom_label: null,
			upload_timestamp: '2026-07-29T15:42:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: { session_label: 'Design brief + sketches', unit_number: 2, session_date: '2026-07-29' },
			photos: [photo('p-1', 1, 'IMG_4821.HEIC'), photo('p-2', 2, 'IMG_4822.HEIC')],
			notes: [
				note(
					'n-1',
					'e-1',
					'n-1',
					1,
					p('Sketched three layouts before settling on the belt drive.'),
					'2026-07-29T15:44:00Z'
				)
			]
		},
		{
			// Free entry with a typed title, flagged with a reason + comment.
			id: 'e-2',
			session_id: null,
			section_id: null,
			custom_label: 'Gearbox ratio worksheet',
			upload_timestamp: '2026-08-02T19:10:00Z',
			status: 'flagged',
			flag_reason: 'illegible',
			instructor_comment: 'The second page is too dark to read. Reshoot it in better light.',
			session: null,
			photos: [photo('p-3', 1, 'gearbox.jpg')],
			notes: []
		},
		{
			// Resubmitted after a flag: back to pending_review.
			id: 'e-3',
			session_id: null,
			section_id: null,
			custom_label: 'Motor mount iteration 2',
			upload_timestamp: '2026-08-04T11:05:00Z',
			status: 'pending_review',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-4', 1, 'mount-v2.png'), photo('p-5', 2, null, 'enhanced')],
			notes: []
		},
		{
			// THE LONG-IDLE ENTRY: one free-form entry, three notes written days
			// apart, one of them already revised twice. It must read as a single
			// chronological record -- notes in the order they were WRITTEN, an
			// edited note keeping its place rather than jumping to the end.
			id: 'e-6',
			session_id: null,
			section_id: null,
			custom_label: 'Chassis build log',
			upload_timestamp: '2026-07-20T09:00:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-8', 1, 'chassis-day1.jpg')],
			notes: [
				note('n-2', 'e-6', 'n-2', 1, p('Cut the rails 2mm long on purpose.'), '2026-07-20T09:05:00Z'),
				// Revised a week after it was written; both earlier versions survive.
				note(
					'n-3',
					'e-6',
					'n-3',
					1,
					p('Welded the front bulkhead. Might be out of square.'),
					'2026-07-24T14:20:00Z'
				),
				note(
					'n-4',
					'e-6',
					'n-3',
					2,
					p('Welded the front bulkhead. It IS out of square, about 1.5mm across the diagonal.'),
					'2026-07-25T08:10:00Z'
				),
				note(
					'n-5',
					'e-6',
					'n-3',
					3,
					[
						{
							type: 'p',
							runs: [
								{ text: 'Welded the front bulkhead. Out of square by ' },
								{ text: '1.5mm', bold: true },
								{ text: ' across the diagonal, fixed by shimming.' }
							]
						},
						{ type: 'ul', items: [[{ text: 'Re-check after the next weld' }], [{ text: 'Buy a longer square' }]] }
					],
					'2026-07-26T17:45:00Z'
				),
				note(
					'n-6',
					'e-6',
					'n-6',
					1,
					p('Two weeks later: the shim held. Moving on to the gearbox mounts.'),
					'2026-08-09T10:30:00Z'
				)
			]
		},
		{
			// Title falls all the way back to the browser filename (0071).
			id: 'e-4',
			session_id: null,
			section_id: null,
			custom_label: null,
			upload_timestamp: '2026-08-06T08:30:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-6', 1, 'flywheel-sketch.jpg')],
			notes: []
		},
		{
			// THE FULLY UNLABELED ENTRY: no session, no title, and no
			// original_filename either. Valid since 0071 dropped the
			// has-a-target CHECK, and must render as "Untitled entry" rather
			// than a blank line.
			id: 'e-5',
			session_id: null,
			section_id: null,
			custom_label: null,
			upload_timestamp: '2026-08-07T16:55:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-7', 1, null)],
			notes: []
		}
	];

	const INSTRUCTOR_ENTRIES: NotebookEntry[] = [
		{
			id: 'i-1',
			session_id: null,
			section_id: null,
			custom_label: 'Shop layout notes',
			upload_timestamp: '2026-08-07T09:00:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('ip-1', 1, 'layout.jpg')],
			notes: []
		}
	];

	// Live copies so a fake save can actually append to the feed.
	let studentEntries = $state<NotebookEntry[]>([...STUDENT_ENTRIES]);
	let instructorEntries = $state<NotebookEntry[]>([...INSTRUCTOR_ENTRIES]);
	let plainEntries = $state<NotebookEntry[]>([]);

	const entries = $derived(
		account === 'student' ? studentEntries : account === 'instructor' ? instructorEntries : plainEntries
	);
	const sessions = $derived(account === 'student' ? SESSIONS : []);
	const sectionLabel = $derived(account === 'student' ? 'Engineering I Honors' : null);
	const canReview = $derived(account === 'instructor');

	let seq = 0;

	function update(fn: (list: NotebookEntry[]) => NotebookEntry[]) {
		if (account === 'student') studentEntries = fn(studentEntries);
		else if (account === 'instructor') instructorEntries = fn(instructorEntries);
		else plainEntries = fn(plainEntries);
	}

	function current(): NotebookEntry[] {
		return account === 'student' ? studentEntries : account === 'instructor' ? instructorEntries : plainEntries;
	}

	/** Every field the component actually put on the FormData, verbatim. */
	function describe(form: FormData): string {
		const parts: string[] = [];
		for (const [k, v] of form.entries()) {
			// Size is logged because the upload route caps it: a camera-sized
			// original has to arrive here already shrunk, and that is only
			// checkable if the number is on screen.
			parts.push(
				v instanceof File
					? `${k}=<File ${v.name} ${v.type || 'no-type'} ${(v.size / 1024).toFixed(0)}KB>`
					: `${k}=${JSON.stringify(v)}`
			);
		}
		return parts.length ? parts.join(' ') : '(no fields)';
	}

	/**
	 * Every received upload, file included, exposed for scripted verification
	 * (decoding the corrected JPEG the corrector actually produced and
	 * diffing it against another run is how "dragging a handle changes where
	 * the warp draws from" is ASSERTED rather than eyeballed). Dev-only page.
	 */
	const received: { route: string; fields: Record<string, string>; file: File | null }[] = [];
	if (typeof window !== 'undefined') {
		(window as unknown as Record<string, unknown>).__notebookReceived = received;
	}
	function record(route: string, form: FormData) {
		const fields: Record<string, string> = {};
		let file: File | null = null;
		for (const [k, v] of form.entries()) {
			if (v instanceof File) file = v;
			else fields[k] = v;
		}
		received.push({ route, fields, file });
	}

	/** The REAL sanitizer, behind a dev-only endpoint. */
	async function normalize(content: TiptapNode): Promise<NoteDoc | { error: string }> {
		const res = await fetch('/dev/notebook/normalize', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content })
		});
		const body = (await res.json()) as { ok?: boolean; doc?: NoteDoc; error?: string };
		return body.ok && body.doc ? body.doc : { error: body.error ?? 'That note could not be saved.' };
	}

	async function createEntry(form: FormData): Promise<CreateEntryResult> {
		log = [...log, `POST /api/notebook/upload  ${describe(form)}`];
		record('upload', form);
		const id = `new-${++seq}`;
		const file = form.get('photo') as File | null;
		const sessionId = (form.get('session_id') as string | null) ?? null;
		const session = SESSIONS.find((s) => s.id === sessionId) ?? null;
		const entry: NotebookEntry = {
			id,
			session_id: sessionId,
			section_id: session ? session.section_id : null,
			custom_label: (form.get('custom_label') as string | null) ?? null,
			upload_timestamp: new Date().toISOString(),
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: session
				? {
						session_label: session.session_label,
						unit_number: session.unit_number,
						session_date: session.session_date
					}
				: null,
			photos: [photo(`${id}-1`, 1, file?.name ?? null)],
			notes: []
		};
		update((list) => [entry, ...list]);
		return { ok: true, entryId: id };
	}

	/**
	 * The note tier: no photo at all. Mirrors notebook_create_note_entry --
	 * content is required, the title is optional -- and appends an entry with
	 * an EMPTY photos array, the state a note-only entry really has.
	 */
	async function createNote(payload: NotePayload): Promise<CreateEntryResult> {
		log = [
			...log,
			`POST /api/notebook/note  custom_label=${JSON.stringify(payload.custom_label)} content=<editor doc>`
		];
		const doc = await normalize(payload.content);
		if ('error' in doc) return { ok: false, error: doc.error };
		const id = `new-${++seq}`;
		const noteId = `${id}-note`;
		const entry: NotebookEntry = {
			id,
			session_id: null,
			section_id: null,
			custom_label: payload.custom_label,
			upload_timestamp: new Date().toISOString(),
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [],
			notes: [note(noteId, id, noteId, 1, doc, new Date().toISOString())]
		};
		update((list) => [entry, ...list]);
		return { ok: true, entryId: id };
	}

	async function addPhoto(form: FormData): Promise<AddPhotoResult> {
		log = [...log, `POST /api/notebook/add-photo  ${describe(form)}`];
		record('add-photo', form);
		const entryId = form.get('entry_id') as string;
		const file = form.get('photo') as File | null;
		// Mirrors the RPC: variant is stored, sequence_order is max+1.
		const variant = (form.get('variant') as string) === 'enhanced' ? 'enhanced' : 'original';
		update((list) =>
			list.map((e) =>
				e.id === entryId
					? {
							...e,
							photos: [
								...e.photos,
								photo(
									`${entryId}-${e.photos.length + 1}`,
									e.photos.length + 1,
									file?.name ?? null,
									variant
								)
							]
						}
					: e
			)
		);
		return { ok: true };
	}

	/** notebook_add_note: a brand new chain (revision 1) on an existing entry. */
	async function addNote(entryId: string, content: TiptapNode): Promise<NoteSaveResult> {
		log = [...log, `POST /api/notebook/add-note  entry_id=${JSON.stringify(entryId)}`];
		const doc = await normalize(content);
		if ('error' in doc) return { ok: false, error: doc.error };
		const noteId = `n-new-${++seq}`;
		update((list) =>
			list.map((e) =>
				e.id === entryId
					? { ...e, notes: [...e.notes, note(noteId, entryId, noteId, 1, doc, new Date().toISOString())] }
					: e
			)
		);
		return { ok: true };
	}

	/**
	 * notebook_edit_note: appends a revision. Mirrors the RPC's own refusal on
	 * a session-linked entry, so the error path is drivable here too -- the UI
	 * never offers the control on those entries, but this proves what would
	 * happen if it did.
	 */
	async function editNote(noteId: string, content: TiptapNode): Promise<NoteSaveResult> {
		log = [...log, `POST /api/notebook/edit-note  note_id=${JSON.stringify(noteId)}`];
		const owner = current().find((e) => e.notes.some((n) => n.note_id === noteId));
		if (!owner) return { ok: false, error: 'That note does not exist.' };
		if (owner.session_id !== null) {
			return {
				ok: false,
				error:
					'A note on a scheduled check-in cannot be edited. Add another note to this entry instead.'
			};
		}
		const doc = await normalize(content);
		if ('error' in doc) return { ok: false, error: doc.error };
		const latest = Math.max(...owner.notes.filter((n) => n.note_id === noteId).map((n) => n.revision));
		update((list) =>
			list.map((e) =>
				e.id === owner.id
					? {
							...e,
							notes: [
								...e.notes,
								note(`${noteId}-r${latest + 1}`, e.id, noteId, latest + 1, doc, new Date().toISOString())
							]
						}
					: e
			)
		);
		return { ok: true };
	}
</script>

<svelte:head><title>dev // notebook</title></svelte:head>

<div class="dev-bar">
	<strong>dev harness</strong>
	<label>
		account
		<select bind:value={account}>
			<option value="student">student (class + check-ins)</option>
			<option value="instructor">instructor (can review)</option>
			<option value="plain">plain account (no class, no entries)</option>
		</select>
	</label>
	<label>
		platform
		<select bind:value={platform} data-testid="sim-platform">
			<option value="device">this device</option>
			<option value="android">Android (Chrome)</option>
			<option value="ios">iOS (Safari)</option>
		</select>
	</label>
	<label><input type="checkbox" bind:checked={configured} /> 0069 applied</label>
	<label><input type="checkbox" bind:checked={notesReady} /> 0078 applied</label>
	<label><input type="checkbox" bind:checked={uploadReady} /> Drive configured</label>
	<button type="button" onclick={() => (log = [])}>clear log</button>
	<span class="tag" data-testid="can-review">canReview={canReview}</span>
</div>

{#if log.length}
	<pre class="dev-log" data-testid="dev-log">{log.join('\n')}</pre>
{/if}

<!-- Keyed on the simulated platform so switching remounts the component and
     its capture-path detection runs again from scratch. -->
{#key platform}
	<NotebookView
		{entries}
		{sessions}
		{sectionLabel}
		{canReview}
		{configured}
		{notesReady}
		{uploadReady}
		{createEntry}
		{addPhoto}
		{createNote}
		{addNote}
		{editNote}
	/>
{/key}

<style>
	.dev-bar {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		padding: 0.6rem 1.2rem;
		border-bottom: 1px solid var(--line);
		background: var(--bg1);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
	}
	.dev-bar strong {
		color: var(--gold);
	}
	.tag {
		color: var(--cyan);
	}
	.dev-log {
		margin: 0;
		padding: 0.6rem 1.2rem;
		background: var(--bg0);
		border-bottom: 1px solid var(--line);
		color: var(--cyan);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		white-space: pre-wrap;
		word-break: break-all;
	}
</style>
