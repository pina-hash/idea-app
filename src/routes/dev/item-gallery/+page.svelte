<script lang="ts">
	import { page } from '$app/state';
	import '$lib/classroom/classroom.css';
	import ClassroomShell from '$lib/classroom/ClassroomShell.svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ItemDetail from '$lib/classroom/ItemDetail.svelte';
	import { itemInspector } from '$lib/classroom/inspector.svelte';
	import {
		itemTitle,
		registerLocalAttachmentUrl,
		sectionTitle,
		type ClassroomAttachment,
		type ClassroomComposerTransports,
		type ClassroomItem,
		type ClassroomSection
	} from '$lib/classroom/classroom';
	import type { ItemDoc } from '$lib/classroom/classroom-doc';
	import type { DeckTransports } from '$lib/classroom/deck';
	import { buildZip } from '$lib/foundry/zip-write';
	import {
		activeTab,
		classroomCrumbs,
		classroomMeasure,
		classNotebookHref,
		locateClassroom,
		sectionTabs
	} from '$lib/classroom/nav';

	/**
	 * PICTURES ON AN ITEM PAGE (ledger 0297, package ITEM). See +page.ts.
	 *
	 *   (default)       a student reading a material: a body with a figure and
	 *                   three YouTube links, and six picture attachments plus
	 *                   one PDF, which is the gallery grid beside one list row.
	 *   ?role=manager   the teacher of the class, tools open. The presentation
	 *                   box takes a zip; `window.__dropGalleryZip()` builds a
	 *                   real zip of four pictures in the page and drops it on
	 *                   that box with a real DragEvent, so the zip choice and
	 *                   the upload of each picture run exactly as they do for a
	 *                   file dragged from the desktop. Uploads land in memory
	 *                   and appear on the page as attachments.
	 *
	 * THE PICTURES ARE DRAWN, NOT FETCHED: a canvas at load, with a grid and a
	 * label, so a screenshot of the lightbox shows whether zoom and pan moved
	 * anything (a solid colour cannot say). They reach the page through
	 * `registerLocalAttachmentUrl`, which is the attachment proxy's own dev seam,
	 * so every component runs its real src builder.
	 */
	const BASE = '/dev/item-gallery';
	const manager = page.url.searchParams.get('role') === 'manager';
	const TODAY = '2026-09-23';

	function picture(w: number, h: number, hue: number, label: string): string {
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const g = c.getContext('2d');
		if (!g) return '';
		const grad = g.createLinearGradient(0, 0, w, h);
		grad.addColorStop(0, `hsl(${hue} 45% 32%)`);
		grad.addColorStop(1, `hsl(${(hue + 40) % 360} 50% 18%)`);
		g.fillStyle = grad;
		g.fillRect(0, 0, w, h);
		g.strokeStyle = 'rgba(240, 238, 230, 0.35)';
		g.lineWidth = 2;
		const step = Math.max(40, Math.round(Math.min(w, h) / 8));
		for (let x = 0; x <= w; x += step) {
			g.beginPath();
			g.moveTo(x, 0);
			g.lineTo(x, h);
			g.stroke();
		}
		for (let y = 0; y <= h; y += step) {
			g.beginPath();
			g.moveTo(0, y);
			g.lineTo(w, y);
			g.stroke();
		}
		g.fillStyle = 'rgba(240, 238, 230, 0.92)';
		g.font = `bold ${Math.round(Math.min(w, h) / 9)}px sans-serif`;
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText(label, w / 2, h / 2);
		g.font = `${Math.round(Math.min(w, h) / 22)}px monospace`;
		g.fillText(`${w} x ${h}`, w / 2, h / 2 + Math.min(w, h) / 7);
		return c.toDataURL('image/png');
	}

	const SHOTS: { id: string; name: string; w: number; h: number; hue: number }[] = [
		{ id: 'att-1', name: 'gearbox-stage-1.jpg', w: 1600, h: 1200, hue: 150 },
		{ id: 'att-2', name: 'gearbox-stage-2.jpg', w: 1200, h: 1600, hue: 30 },
		{ id: 'att-3', name: 'gearbox-stage-3.jpg', w: 1600, h: 900, hue: 200 },
		{ id: 'att-4', name: 'bearing-race.png', w: 1000, h: 1000, hue: 280 },
		{ id: 'att-5', name: 'shaft-keyway.png', w: 1400, h: 1050, hue: 90 },
		{ id: 'att-6', name: 'housing-bolts.png', w: 900, h: 1400, hue: 340 }
	];
	for (const s of SHOTS) registerLocalAttachmentUrl(s.id, picture(s.w, s.h, s.hue, s.name.replace(/\.\w+$/, '')));

	const ATTACHMENTS: ClassroomAttachment[] = [
		...SHOTS.map((s, i) => ({
			id: s.id,
			filename: s.name,
			/* What the 0133 record route stores for every object: the picture is
			   told from its FILENAME, never from a type the uploader chose. */
			mime_type: 'application/octet-stream',
			size_bytes: 180_000 + i * 1_000,
			sort_order: i
		})),
		{ id: 'att-pdf', filename: 'torque-table.pdf', mime_type: 'application/pdf', size_bytes: 92_000, sort_order: 9 }
	];

	const BODY: ItemDoc = [
		{ type: 'p', runs: [{ text: 'Take the gearbox apart and photograph each stage. The finished teardown looks like this:' }] },
		{ type: 'img', src: 'attachment:gearbox-stage-3.jpg', alt: 'Stage three, laid out on the bench' },
		{ type: 'p', runs: [{ text: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', href: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' }] },
		{
			type: 'p',
			runs: [
				{ text: 'Before you start, watch how the bearing is pressed out: ' },
				{ text: 'bearing removal', href: 'https://youtu.be/9bZkp7q19f0' }
			]
		},
		{
			type: 'p',
			runs: [
				{ text: 'A link in the middle of a sentence, ' },
				{ text: 'like this one', href: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ' },
				{ text: ', stays a plain link.' }
			]
		}
	];

	const SECTION = {
		id: 's-1',
		course_id: 'c-1',
		label: 'Period 2',
		block: 'B',
		teacher_email: 'vargas@boscotech.edu',
		active: true,
		course: { id: 'c-1', code: 'IDEA209H', title: 'Engineering I Honors', active: true }
	} as ClassroomSection;

	let attachments = $state<ClassroomAttachment[]>([...ATTACHMENTS]);
	const item = $derived({
		id: 'i-1',
		kind: 'material',
		title: 'Gearbox teardown photographs',
		body: 'Take the gearbox apart and photograph each stage.',
		body_doc: BODY,
		points: null,
		due_at: null,
		category: 'Lab',
		author_email: 'vargas@boscotech.edu',
		author_name: 'T. Vargas',
		published: true,
		pinned: false,
		unit_id: null,
		sort_order: 1,
		first_published_at: '2026-09-15T15:00:00Z',
		edited_at: null,
		created_at: '2026-09-15T15:00:00Z',
		updated_at: '2026-09-15T15:00:00Z',
		links: [],
		attachments,
		postings: [{ section_id: 's-1' }],
		viewed_at: null,
		instructorAttachments: [],
		instructorLinks: []
	} as unknown as ClassroomItem);

	// ---- the manager's in-memory writes --------------------------------

	const uploads: string[] = [];
	let upSeq = 0;
	const answer = async () => ({ ok: true as const, data: undefined });
	const transports = new Proxy(
		{
			async uploadAttachment(_itemId: string, file: File, onProgress?: (f: number) => void) {
				onProgress?.(0.5);
				await new Promise((r) => setTimeout(r, 60));
				const id = `att-up-${++upSeq}`;
				registerLocalAttachmentUrl(id, URL.createObjectURL(file));
				uploads.push(file.name);
				attachments = [
					...attachments,
					{ id, filename: file.name, mime_type: 'application/octet-stream', size_bytes: file.size, sort_order: 20 + upSeq }
				];
				onProgress?.(1);
				return { ok: true as const, data: undefined };
			},
			async loadCategorySuggestions() {
				return [];
			}
		},
		{
			get: (target, key) => (key in target ? target[key as keyof typeof target] : answer)
		}
	) as unknown as ClassroomComposerTransports;
	const deckTransports = {
		async uploadDeck() {
			return { ok: false, code: 'harness', message: 'Presentations are not uploaded on this page.' };
		},
		async deleteDeck() {
			return { ok: true };
		}
	} as unknown as DeckTransports;

	if (manager) itemInspector.open = true;

	if (typeof window !== 'undefined') {
		const w = window as unknown as Record<string, unknown>;
		w.__galleryUploads = () => [...uploads];
		/**
		 * A real zip of four drawn pictures (plus the Mac noise a right-click
		 * Compress adds), dropped on the presentation box with a real DragEvent
		 * carrying a real DataTransfer. Returns the number of files dropped.
		 */
		w.__dropGalleryZip = async () => {
			const png = async (w: number, h: number, hue: number, label: string) =>
				new Uint8Array(await (await fetch(picture(w, h, hue, label))).arrayBuffer());
			const zip = await buildZip([
				{ path: 'bench/photo2.png', bytes: await png(800, 600, 20, 'photo 2') },
				{ path: 'bench/photo10.png', bytes: await png(600, 800, 120, 'photo 10') },
				{ path: 'bench/photo1.png', bytes: await png(900, 600, 220, 'photo 1') },
				{ path: 'bench/overview.png', bytes: await png(1000, 700, 300, 'overview') },
				{ path: '__MACOSX/bench/._photo2.png', bytes: new Uint8Array([0, 5, 22, 7]) }
			]);
			const file = new File([zip as BlobPart], 'bench photos.zip', { type: 'application/zip' });
			const zone = document.querySelector('[data-testid="deck-panel-manage"]') as HTMLElement | null;
			if (!zone) return 0;
			const dt = new DataTransfer();
			dt.items.add(file);
			for (const type of ['dragenter', 'dragover', 'drop']) {
				zone.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt }));
			}
			return dt.files.length;
		};
	}

	const loc = locateClassroom(`/classroom/s-1/item/i-1`);
	const measure = classroomMeasure(loc);
	const crumbs = $derived(classroomCrumbs(loc, { section: sectionTitle(SECTION), item: itemTitle(item) }, BASE));
	const tabs = sectionTabs('s-1', BASE);
</script>

<svelte:head><title>dev // item gallery</title></svelte:head>

{#snippet classList()}
	<ClassView
		section={SECTION}
		items={[item]}
		units={[]}
		sections={[SECTION]}
		selectedItemId="i-1"
		collapsed={[]}
		canManage={manager}
		transports={null}
		checkIns={[]}
		work={{}}
		asPane={true}
		basePath={BASE}
		notebookHref={classNotebookHref('s-1', BASE)}
		clock={{ now: `${TODAY}T20:00:00.000Z`, today: TODAY }}
	/>
{/snippet}

<div
	class="cr-root"
	class:cr-app={measure === 'console'}
	style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
	data-role={manager ? 'manager' : 'student'}
>
	<ClassroomShell
		basePath={BASE}
		sections={[SECTION]}
		currentSectionId="s-1"
		{crumbs}
		{tabs}
		tab={activeTab(loc)}
		canManage={manager}
	>
		<ClassSplit hasDetail={true} nav={classList} overlay={null}>
			<ItemDetail
				section={SECTION}
				{item}
				canManage={manager}
				basePath={BASE}
				transports={manager ? transports : null}
				deckTransports={manager ? deckTransports : null}
				onchanged={() => {}}
			/>
		</ClassSplit>
	</ClassroomShell>
</div>
