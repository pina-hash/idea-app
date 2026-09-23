<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import NotebookCapture from '$lib/notebook/NotebookCapture.svelte';
	import { captureFiling } from '$lib/notebook/capture';
	import { IdbCaptureStore, MemoryCaptureStore, type CaptureStore } from '$lib/notebook/capture-store';
	import type { NotebookCaptureTransports } from '$lib/notebook/capture-queue';
	import { checkInsForItem, type ClassCheckIn } from '$lib/classroom/class-check-ins';
	import { itemTitle, sectionTitle, type ClassroomItem, type ClassroomSection } from '$lib/classroom/classroom';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		classNotebookHref,
		locateClassroom,
		sectionTabs
	} from '$lib/classroom/nav';
	import type { NotebookEntry } from '$lib/notebook';
	import type { TiptapNode } from '$lib/notebook-notes';

	/**
	 * THE ITEM PAGE A STUDENT OPENS, WITH THE CAPTURE BLOCK IN IT (ledger 0297,
	 * package F4b). The real shell, the real split, the real class list and the
	 * real ItemDetail, under the same `--cr-measure-route` the real route sets,
	 * with NotebookCapture handed in as the route hands it. The "server" is in
	 * memory with a stated latency, and every call is logged with its time on
	 * `window.__captureLog` so a spec can read what was sent and when.
	 *
	 *   ?item=i-2        the material with NO check-in (files to the class + title)
	 *   ?latency=<ms>    each upload's simulated latency (default 400); `hang`
	 *                    never answers, for the reload proof
	 *   ?fail=first      the first upload lands and then the connection drops
	 *   ?store=off|full  photos kept in memory only / the device refuses
	 *   ?drive=0         uploads not configured (no photo controls)
	 *   ?filed=1         the student already filed one entry for this item
	 */
	const BASE = '/dev/notebook-capture';
	const q = page.url.searchParams;
	const itemId = q.get('item') === 'i-2' ? 'i-2' : 'i-1';
	const latencyParam = q.get('latency');
	const hang = latencyParam === 'hang';
	const latency = hang ? 0 : Math.max(0, Number(latencyParam ?? 400) || 0);
	const failFirst = q.get('fail') === 'first';
	const storeMode = q.get('store');
	const uploadReady = q.get('drive') !== '0';
	const filedOne = q.get('filed') === '1';
	const TODAY = '2026-09-23';
	const VIEWER = 'harness-student';

	const SECTION: ClassroomSection = {
		id: 's-1',
		course_id: 'c-1',
		label: 'Period 2',
		block: 'B',
		teacher_email: 'vargas@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'ENG1H', title: 'Engineering 1 Honors', active: true }
	} as ClassroomSection;

	function item(over: Partial<ClassroomItem> & { id: string; kind: ClassroomItem['kind'] }): ClassroomItem {
		return {
			title: null,
			body: '',
			body_doc: null,
			points: null,
			due_at: null,
			category: null,
			author_email: 'vargas@boscotech.edu',
			author_name: 'T. Vargas',
			published: true,
			pinned: false,
			unit_id: null,
			sort_order: 0,
			first_published_at: '2026-09-20T15:00:00Z',
			edited_at: null,
			created_at: '2026-09-20T15:00:00Z',
			updated_at: '2026-09-20T15:00:00Z',
			links: [],
			attachments: [],
			postings: [{ section_id: 's-1' }],
			viewed_at: null,
			instructorAttachments: [],
			instructorLinks: [],
			...over
		} as ClassroomItem;
	}

	const ITEMS: ClassroomItem[] = [
		item({
			id: 'i-1',
			kind: 'assignment',
			title: 'Gearbox teardown',
			points: 10,
			due_at: '2026-09-24T15:00:00Z',
			sort_order: 1,
			body: 'Take the gearbox apart, photograph each stage, and explain one design decision.'
		}),
		item({
			id: 'i-2',
			kind: 'material',
			title: 'Bridge truss reading',
			sort_order: 2,
			body: 'Read the truss chapter and sketch one joint.'
		})
	];
	const CHECK_INS: ClassCheckIn[] = [
		{
			session_id: 'ns-1',
			section_id: 's-1',
			unit_number: 3,
			session_date: TODAY,
			session_label: 'Day 12 gearbox teardown',
			status: 'missing',
			flag_reason: null,
			item_id: 'i-1'
		} as ClassCheckIn
	];

	const current = ITEMS.find((i) => i.id === itemId) as ClassroomItem;
	const itemCheckIns = checkInsForItem(CHECK_INS, itemId);
	const filing = captureFiling({
		sectionId: SECTION.id,
		itemId,
		itemTitle: current.title,
		checkIns: itemCheckIns,
		today: TODAY
	});

	// ---- the in-memory server -------------------------------------------

	type Row = NotebookEntry;
	const log: { at: number; call: string; detail: string }[] = [];
	const rows = $state<Row[]>([]);
	if (filedOne) {
		rows.push({
			id: 'e-filed',
			session_id: filing.sessionId,
			section_id: SECTION.id,
			folder_id: null,
			pinned_at: null,
			custom_label: filing.customLabel,
			upload_timestamp: '2026-09-22T17:00:00Z',
			submitted_at: '2026-09-22T17:05:00Z',
			status: 'compliant',
			flag_reason: null,
			instructor_comment: null,
			session: null,
			photos: [
				{ id: 'ph-old', drive_file_id: 'd', variant: 'original', sequence_order: 1, original_filename: 'IMG_1.jpg' }
			],
			notes: []
		});
	}
	let seq = 0;
	let failed = false;
	const wait = () =>
		hang ? new Promise<never>(() => {}) : new Promise<void>((r) => setTimeout(r, latency));
	function note(call: string, detail = '') {
		log.push({ at: Math.round(performance.now()), call, detail });
	}

	const transports: NotebookCaptureTransports = {
		async createEntry(form) {
			const photo = form.get('photo') as File;
			note('upload', `${photo.name} ${[...form.keys()].filter((k) => k !== 'photo').join(',')} submitted=${form.get('submitted')}`);
			await wait();
			const id = `e-${++seq}`;
			rows.push({
				id,
				session_id: (form.get('session_id') as string) || null,
				section_id: form.get('section_id') as string,
				folder_id: null,
				pinned_at: null,
				custom_label: (form.get('custom_label') as string) || null,
				upload_timestamp: new Date().toISOString(),
				submitted_at: null,
				status: 'compliant',
				flag_reason: null,
				instructor_comment: null,
				session: null,
				photos: [{ id: `ph-${seq}-1`, drive_file_id: 'd', variant: 'original', sequence_order: 1, original_filename: photo.name }],
				notes: []
			});
			if (failFirst && !failed) {
				failed = true;
				note('drop', 'connection dropped after the server stored it');
				throw new Error('The connection dropped.');
			}
			return { ok: true, entryId: id };
		},
		async addPhoto(form) {
			const photo = form.get('photo') as File;
			note('add-photo', `${photo.name} ${form.get('variant')} -> ${form.get('entry_id')}`);
			await wait();
			const row = rows.find((r) => r.id === form.get('entry_id'));
			if (!row) return { ok: false, error: 'That entry does not exist.' };
			row.photos.push({
				id: `ph-${row.id}-${row.photos.length + 1}`,
				drive_file_id: 'd',
				variant: form.get('variant') as 'original' | 'enhanced',
				sequence_order: row.photos.length + 1,
				original_filename: photo.name
			});
			return { ok: true };
		},
		async findUpload(name) {
			note('find', name);
			for (const r of rows) if (r.photos.some((p) => p.original_filename === name)) return { entryId: r.id };
			return null;
		},
		async createNote(payload) {
			note('note', `create submitted=${payload.submitted}`);
			await wait();
			const id = `e-${++seq}`;
			rows.push({
				id,
				session_id: payload.session_id ?? null,
				section_id: payload.section_id ?? SECTION.id,
				folder_id: null,
				pinned_at: null,
				custom_label: payload.custom_label,
				upload_timestamp: new Date().toISOString(),
				submitted_at: null,
				status: 'compliant',
				flag_reason: null,
				instructor_comment: null,
				session: null,
				photos: [],
				notes: []
			});
			return { ok: true, entryId: id, noteId: `n-${id}` };
		},
		async addNote(entryId: string, _doc: TiptapNode) {
			note('add-note', entryId);
			await wait();
			return { ok: true, noteId: `n-${entryId}` };
		},
		async editNote(noteId: string) {
			note('edit-note', noteId);
			await wait();
			return { ok: true, noteId };
		},
		async submitEntry(entryId) {
			note('submit', entryId);
			await wait();
			const row = rows.find((r) => r.id === entryId);
			if (!row) return { ok: false, error: 'That entry does not exist.' };
			row.submitted_at = new Date().toISOString();
			return { ok: true };
		}
	};

	class RefusingStore extends MemoryCaptureStore {
		constructor() {
			super();
			this.refuse = 'full';
		}
	}
	const store: CaptureStore | null =
		storeMode === 'off' ? null : storeMode === 'full' ? new RefusingStore() : new IdbCaptureStore();

	let generation = $state(0);
	const entries = $derived.by(() => {
		void generation;
		return rows.map((r) => ({ ...r, photos: [...r.photos] }));
	});

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		w.__captureLog = log;
		w.__captureRows = () => JSON.parse(JSON.stringify(rows));
	}

	// ---- the shell, as the real route renders this place ---------------

	const loc = locateClassroom(`/classroom/s-1/item/${itemId}`);
	const measure = classroomMeasure(loc);
	const crumbs = classroomCrumbs(loc, { section: sectionTitle(SECTION), item: itemTitle(current) }, BASE);
	const tabs = sectionTabs('s-1', BASE);
</script>

<svelte:head><title>dev // notebook capture</title></svelte:head>

{#snippet classList()}
	<ClassView
		section={SECTION}
		items={ITEMS}
		units={[]}
		sections={[SECTION]}
		selectedItemId={itemId}
		collapsed={[]}
		canManage={false}
		transports={null}
		checkIns={CHECK_INS}
		work={{}}
		asPane={true}
		basePath={BASE}
		notebookHref={classNotebookHref('s-1', BASE)}
		clock={{ now: `${TODAY}T20:00:00.000Z`, today: TODAY }}
	/>
{/snippet}

{#snippet capture()}
	<NotebookCapture
		viewerId={VIEWER}
		{filing}
		{entries}
		{uploadReady}
		draftsReady={true}
		coalescingReady={true}
		{transports}
		{store}
		notebookHref={classNotebookHref('s-1', BASE)}
		onChanged={() => generation++}
	/>
{/snippet}

<div
	class="cr-root"
	class:cr-app={measure === 'console'}
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
>
	<ClassroomShell
		basePath={BASE}
		sections={[SECTION]}
		currentSectionId="s-1"
		{crumbs}
		{tabs}
		tab={activeTab(loc)}
		canManage={false}
	>
		<ClassSplit hasDetail={true} nav={classList} overlay={null}>
			<ItemDetail
				section={SECTION}
				item={current}
				canManage={false}
				basePath={BASE}
				checkIns={itemCheckIns}
				notebookCapture={capture}
			/>
		</ClassSplit>
	</ClassroomShell>
</div>
