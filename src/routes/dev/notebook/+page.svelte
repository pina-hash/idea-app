<script lang="ts">
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import type {
		AddPhotoResult,
		CreateEntryResult,
		NotebookEntry,
		NotebookSession,
		NotePayload
	} from '$lib/notebook';

	/**
	 * Dev harness: mounts the REAL NotebookView with the three save transports
	 * faked in memory, so the whole screen -- role branches, the session
	 * quick-picks, the free-form path (photos AND the 0075 note tier), the
	 * multi-photo sequencing, and every entry-title fallback -- is drivable
	 * with no auth, no Supabase and no Drive.
	 *
	 * The fakes answer in the same shape the real page's fetch wrappers do,
	 * and every call is logged verbatim (including WHICH form fields were
	 * sent), which is how "a blank label submits no custom_label at all" is
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

	// Deliberately OLDEST-FIRST: the real load asks Postgres for newest-first,
	// so feeding the reverse is what proves the component's own newestFirst()
	// ordering is doing the work rather than inheriting the caller's order.
	const STUDENT_ENTRIES: NotebookEntry[] = [
		{
			// Session-linked: the session's own label wins over everything.
			id: 'e-1',
			session_id: 'ses-3',
			section_id: 'sec-1',
			custom_label: null,
			upload_timestamp: '2026-07-29T15:42:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: { session_label: 'Design brief + sketches', unit_number: 2, session_date: '2026-07-29' },
			photos: [photo('p-1', 1, 'IMG_4821.HEIC'), photo('p-2', 2, 'IMG_4822.HEIC')]
		},
		{
			// Free entry with a typed label, flagged with a reason + comment.
			id: 'e-2',
			session_id: null,
			section_id: null,
			custom_label: 'Gearbox ratio worksheet',
			upload_timestamp: '2026-08-02T19:10:00Z',
			status: 'flagged',
			flag_reason: 'illegible',
			instructor_comment: 'The second page is too dark to read. Reshoot it in better light.',
			session: null,
			photos: [photo('p-3', 1, 'gearbox.jpg')]
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
			photos: [photo('p-4', 1, 'mount-v2.png'), photo('p-5', 2, null, 'enhanced')]
		},
		{
			// Label falls all the way back to the browser filename (0071).
			id: 'e-4',
			session_id: null,
			section_id: null,
			custom_label: null,
			upload_timestamp: '2026-08-06T08:30:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [photo('p-6', 1, 'flywheel-sketch.jpg')]
		},
		{
			// THE FULLY UNLABELED ENTRY: no session, no custom label, and no
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
			photos: [photo('p-7', 1, null)]
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
			photos: [photo('ip-1', 1, 'layout.jpg')]
		}
	];

	// Live copies so a fake upload can actually append to the feed.
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
			photos: [photo(`${id}-1`, 1, file?.name ?? null)]
		};
		if (account === 'student') studentEntries = [entry, ...studentEntries];
		else if (account === 'instructor') instructorEntries = [entry, ...instructorEntries];
		else plainEntries = [entry, ...plainEntries];
		return { ok: true, entryId: id };
	}

	/**
	 * The 0075 note tier: no photo at all. Mirrors the RPC's own refusal (a
	 * free entry needs a photo or a label) so the error path is drivable here
	 * too, and appends an entry with an EMPTY photos array -- the state a
	 * note-only entry really has in the feed.
	 */
	async function createNote(payload: NotePayload): Promise<CreateEntryResult> {
		log = [...log, `POST /api/notebook/note  ${JSON.stringify(payload)}`];
		const label = payload.custom_label.trim();
		if (!label) return { ok: false, error: 'A free-form entry needs a photo or a label.' };
		const id = `new-${++seq}`;
		const entry: NotebookEntry = {
			id,
			session_id: null,
			section_id: null,
			custom_label: label,
			upload_timestamp: new Date().toISOString(),
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: []
		};
		if (account === 'student') studentEntries = [entry, ...studentEntries];
		else if (account === 'instructor') instructorEntries = [entry, ...instructorEntries];
		else plainEntries = [entry, ...plainEntries];
		return { ok: true, entryId: id };
	}

	async function addPhoto(form: FormData): Promise<AddPhotoResult> {
		log = [...log, `POST /api/notebook/add-photo  ${describe(form)}`];
		record('add-photo', form);
		const entryId = form.get('entry_id') as string;
		const file = form.get('photo') as File | null;
		// Mirrors the RPC: variant is stored, sequence_order is max+1.
		const variant = (form.get('variant') as string) === 'enhanced' ? 'enhanced' : 'original';
		const push = (list: NotebookEntry[]) =>
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
			);
		if (account === 'student') studentEntries = push(studentEntries);
		else if (account === 'instructor') instructorEntries = push(instructorEntries);
		else plainEntries = push(plainEntries);
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
		{uploadReady}
		{createEntry}
		{addPhoto}
		{createNote}
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
