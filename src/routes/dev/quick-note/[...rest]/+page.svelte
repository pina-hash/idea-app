<script lang="ts">
	import '$lib/classroom/classroom.css';
	import { page } from '$app/state';
	import { setContext } from 'svelte';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import NotebookView from '$lib/notebook/NotebookView.svelte';
	import { sectionTitle, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		classroomPathname,
		locateClassroom,
		sectionTabs
	} from '$lib/classroom/nav';
	import {
		todayIso,
		type CreateEntryResult,
		type EntryActionResult,
		type NoteSaveResult,
		type NotebookEntry,
		type NotebookSession,
		type NotePayload
	} from '$lib/notebook';
	import { docSummary, type NoteDoc, type NotebookNoteRow, type TiptapNode } from '$lib/notebook-notes';
	import { QUICK_NOTE_HARNESS, type QuickNoteTransports } from '$lib/notebook/quick-note-transports';
	import { quickNoteHidden, setQuickNoteHidden } from '$lib/notebook/quick-note-state.svelte';

	/**
	 * THE QUICK NOTE AND THE INBOX, END TO END, with no network (see +page.ts).
	 *
	 * ONE IN-MEMORY NOTEBOOK. The header's quick note (through the harness
	 * context the real `QuickNoteDock` reads) and the real `NotebookView` below
	 * write to the same `entries`, so the drive is the real one: type in the
	 * header, Save, find the draft in the Inbox, file it, and watch it leave the
	 * Inbox and land on the check-in. Note content goes through the REAL
	 * normalizer behind /dev/notebook/normalize, never a copy of it. Every call
	 * is logged verbatim below the notebook (`qn-log`), which is how the
	 * payloads -- a draft, the class, the title, autosave -- are asserted rather
	 * than assumed.
	 */
	const BASE = '/dev/quick-note';
	const VIEWER = 'dev-quick-note-user';

	const SECTIONS: ClassroomSection[] = [
		{
			id: 's-1',
			course_id: 'c-1',
			label: 'Period 2',
			block: 'B',
			teacher_email: 'vargas@boscotech.edu',
			active: true,
			course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
		},
		{
			id: 's-2',
			course_id: 'c-2',
			label: 'Period 4',
			block: 'D',
			teacher_email: 'vargas@boscotech.edu',
			active: true,
			course: { id: 'c-2', code: 'IDEA209H', title: 'Product Design Honors', active: true }
		}
	];
	const CLASSES = SECTIONS.map((s) => ({ id: s.id, label: sectionTitle(s) }));
	const ITEM_TITLE = 'Truss bridge analysis';

	const today = todayIso();
	const SESSIONS: NotebookSession[] = [
		{ id: 'ses-1', section_id: 's-1', unit_number: 2, session_date: today, session_label: 'Bridge sketch check-in' }
	];

	const loc = $derived(locateClassroom(classroomPathname(page.url.pathname, BASE)));
	const measure = $derived(classroomMeasure(loc));
	const crumbs = $derived(
		classroomCrumbs(
			loc,
			{
				section: loc.sectionId ? sectionTitle(SECTIONS.find((s) => s.id === loc.sectionId) ?? SECTIONS[0]) : null,
				item: loc.itemId ? ITEM_TITLE : null
			},
			BASE
		)
	);
	const tabs = $derived(loc.sectionId ? sectionTabs(loc.sectionId) : []);

	const signedOut = page.url.searchParams.get('signedout') === '1';
	const failing = page.url.searchParams.get('fail');
	/**
	 * `?latency=<ms>` holds every note write that long before it lands, so a
	 * write can be IN FLIGHT when the header is remounted (the Remount header
	 * control below, which is what moving between the home page and a class does
	 * to the real control). Logged at dispatch, landed after the wait.
	 */
	const latency = Math.max(0, Number(page.url.searchParams.get('latency') ?? 0) || 0);
	const land = () => (latency ? new Promise<void>((resolve) => setTimeout(resolve, latency)) : Promise.resolve());
	let shellKey = $state(0);

	// ---- the in-memory notebook ---------------------------------------------

	const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
	const dayAgo = new Date(Date.now() - 26 * 60 * 60 * 1000).toISOString();

	function note(id: string, entryId: string, content: NoteDoc, at: string, revision = 1): NotebookNoteRow {
		return { id, entry_id: entryId, note_id: id, revision, content, created_at: at, updated_at: null };
	}
	function para(text: string): NoteDoc {
		return [{ type: 'p', runs: [{ text }] }];
	}
	function base(id: string, over: Partial<NotebookEntry>): NotebookEntry {
		return {
			id,
			session_id: null,
			section_id: null,
			folder_id: null,
			pinned_at: null,
			custom_label: null,
			upload_timestamp: hourAgo,
			submitted_at: null,
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [],
			notes: [],
			...over
		};
	}

	let entries = $state<NotebookEntry[]>([
		base('e-free', {
			upload_timestamp: hourAgo,
			notes: [note('n-free', 'e-free', para('Gusset plate measured 3.2 mm; the drawing says 3.0.'), hourAgo)]
		}),
		base('e-photo', {
			upload_timestamp: dayAgo,
			section_id: 's-1',
			custom_label: 'Deck test photos',
			photos: [{ id: 'p-1', drive_file_id: 'drive-p-1', variant: 'original', sequence_order: 1, original_filename: 'deck.jpg' }]
		}),
		base('e-done', {
			upload_timestamp: dayAgo,
			section_id: 's-1',
			submitted_at: dayAgo,
			notes: [note('n-done', 'e-done', para('Turned in last week.'), dayAgo)]
		})
	]);
	let log = $state<string[]>([]);
	let seq = 0;

	async function normalize(content: TiptapNode): Promise<NoteDoc | { error: string }> {
		const res = await fetch('/dev/notebook/normalize', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content })
		});
		const body = (await res.json()) as { ok?: boolean; doc?: NoteDoc; error?: string };
		return body.ok && body.doc ? body.doc : { error: body.error ?? 'That note could not be saved.' };
	}

	async function createNote(payload: NotePayload): Promise<CreateEntryResult> {
		log = [
			...log,
			`POST /api/notebook/note section_id=${JSON.stringify(payload.section_id ?? null)} session_id=${JSON.stringify(
				payload.session_id ?? null
			)} custom_label=${JSON.stringify(payload.custom_label)} submitted=${JSON.stringify(
				payload.submitted ?? true
			)} autosave=${JSON.stringify(payload.autosave === true)}`
		];
		if (failing === 'create') return { ok: false, error: 'The server is unreachable (dev harness).', retryable: false };
		await land();
		const doc = await normalize(payload.content);
		if ('error' in doc) return { ok: false, error: doc.error, retryable: false };
		const id = `new-${++seq}`;
		const noteId = `${id}-note`;
		const session = SESSIONS.find((s) => s.id === payload.session_id) ?? null;
		const now = new Date().toISOString();
		entries = [
			base(id, {
				upload_timestamp: now,
				session_id: session?.id ?? null,
				section_id: session ? session.section_id : (payload.section_id ?? null),
				folder_id: payload.folder_id,
				custom_label: payload.custom_label,
				submitted_at: payload.submitted === false ? null : now,
				session: session
					? { session_label: session.session_label, unit_number: session.unit_number, session_date: session.session_date }
					: null,
				notes: [note(noteId, id, doc, now)]
			}),
			...entries
		];
		return { ok: true, entryId: id, noteId };
	}

	async function editNote(noteId: string, content: TiptapNode, autosave = false): Promise<NoteSaveResult> {
		log = [...log, `POST /api/notebook/edit-note note_id=${JSON.stringify(noteId)} autosave=${autosave}`];
		await land();
		const owner = entries.find((e) => e.notes.some((n) => n.note_id === noteId));
		if (!owner) return { ok: false, error: 'That note does not exist.', retryable: false };
		const doc = await normalize(content);
		if ('error' in doc) return { ok: false, error: doc.error, retryable: false };
		const now = new Date().toISOString();
		entries = entries.map((e) =>
			e.id === owner.id
				? { ...e, notes: e.notes.map((n) => (n.note_id === noteId ? { ...n, content: doc, updated_at: now } : n)) }
				: e
		);
		return { ok: true, noteId };
	}

	async function addNote(entryId: string, content: TiptapNode, autosave = false): Promise<NoteSaveResult> {
		log = [...log, `POST /api/notebook/add-note entry_id=${JSON.stringify(entryId)} autosave=${autosave}`];
		await land();
		const doc = await normalize(content);
		if ('error' in doc) return { ok: false, error: doc.error, retryable: false };
		const noteId = `n-${++seq}`;
		const now = new Date().toISOString();
		entries = entries.map((e) => (e.id === entryId ? { ...e, notes: [...e.notes, note(noteId, entryId, doc, now)] } : e));
		return { ok: true, noteId };
	}

	async function sealNotes(entryId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_seal_notes p_entry_id=${JSON.stringify(entryId)}`];
		return { ok: true };
	}

	async function deleteEntry(entryId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_delete_entry p_entry_id=${JSON.stringify(entryId)}`];
		if (failing === 'delete') return { ok: false, error: 'The server is unreachable (dev harness).' };
		entries = entries.filter((e) => e.id !== entryId);
		return { ok: true };
	}

	async function submitEntry(entryId: string): Promise<EntryActionResult> {
		log = [...log, `RPC notebook_submit_entry p_entry_id=${JSON.stringify(entryId)}`];
		const now = new Date().toISOString();
		entries = entries.map((e) => (e.id === entryId ? { ...e, submitted_at: now } : e));
		return { ok: true };
	}

	const transports: QuickNoteTransports = {
		createNote,
		editNote,
		addNote,
		sealNotes,
		async draftOpen(entryId) {
			return entries.some((e) => e.id === entryId && e.submitted_at === null);
		}
	};

	// No session, no harness viewer: the dock falls back to `page.data.claims`, which is null.
	if (!signedOut) setContext(QUICK_NOTE_HARNESS, { viewerId: VIEWER, transports });

	const initialView = $derived(page.url.searchParams.get('view') === 'inbox' ? 'inbox' : 'feed');
	const quickNoteShown = $derived(!quickNoteHidden(VIEWER, page.data.userProfile?.preferences));
</script>

<svelte:head><title>Quick note harness</title></svelte:head>

<div class="cr-root" style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}>
	{#key shellKey}
	<ClassroomShell
		basePath={BASE}
		sections={SECTIONS}
		currentSectionId={loc.sectionId}
		{crumbs}
		{tabs}
		tab={activeTab(loc)}
		canManage={false}
	>
		<main class="qnh-body" data-testid="qnh-body">
			<p class="qnh-strip" data-testid="qnh-place">
				place=<strong>{loc.place}</strong> &middot; <a href={BASE}>home</a> &middot;
				<a href={`${BASE}/s-1`}>class</a> &middot; <a href={`${BASE}/s-1/item/i-1`}>assignment</a> &middot;
				<a href={`${BASE}/s-1/item/i-1/deck`}>deck</a> &middot; <a href={`${BASE}?view=inbox`}>inbox</a>
			</p>
			<NotebookView
				{entries}
				sessions={SESSIONS}
				classes={CLASSES}
				viewerId={VIEWER}
				{initialView}
				{createNote}
				{addNote}
				{editNote}
				{sealNotes}
				{deleteEntry}
				{submitEntry}
				{quickNoteShown}
				onQuickNoteShown={(shown) => void setQuickNoteHidden(VIEWER, !shown, null)}
			/>
			<section class="qnh-log">
				<h2>Transport log</h2>
				<ol data-testid="qn-log">
					{#each log as line, i (i)}<li>{line}</li>{/each}
				</ol>
				<!-- Unmounts the whole shell and mounts it again, as moving between the
				     home page and a class does to the real header's quick note. -->
				<button type="button" data-testid="qnh-remount" onclick={() => (shellKey += 1)}>Remount header</button>
				<h2>Stored drafts and entries</h2>
				<ol data-testid="qnh-store">
					{#each entries as e (e.id)}
						<li data-store-id={e.id} data-submitted={e.submitted_at ? 'yes' : 'no'}>
							{e.id} {e.submitted_at ? 'turned-in' : 'draft'}: {e.notes.map((n) => docSummary(n.content, 500)).join(' | ')}
						</li>
					{/each}
				</ol>
			</section>
		</main>
	</ClassroomShell>
	{/key}
</div>

<style>
	.qnh-body {
		max-width: var(--cr-measure);
		margin: 0 auto;
		padding: var(--space-4) var(--cr-gutter, 1rem) var(--space-8);
	}
	.qnh-strip {
		font-family: var(--font-mono);
		font-size: 0.74rem;
		color: var(--text-2);
		margin: 0 0 var(--space-4);
	}
	.qnh-strip strong {
		color: var(--text-1);
	}
	.qnh-log {
		margin-top: var(--space-6);
		font-family: var(--font-mono);
		font-size: 0.72rem;
		color: var(--text-2);
	}
	.qnh-log h2 {
		font-size: 0.9rem;
	}
	.qnh-log ol {
		overflow-wrap: anywhere;
	}
</style>
