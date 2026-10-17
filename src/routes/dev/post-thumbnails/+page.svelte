<script lang="ts">
	import { CLASSROOM_PLATE } from '$lib/classroom/plate';
	import '$lib/classroom/classroom.css';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import ClassView from '$lib/classroom/ClassView.svelte';
	import ContentComposer from '$lib/classroom/ContentComposer.svelte';
	import ClassSettingsPanel from '$lib/classroom/ClassSettingsPanel.svelte';
	import ClassroomSettings from '$lib/classroom/ClassroomSettings.svelte';
	import ClassSplit from '$lib/shell/ClassSplit.svelte';
	import { createClassroomPreferences } from '$lib/preferences/classroom';
	import { provideClassroomPreferences, reactivePreferences } from '$lib/preferences/context';
	import { classroomMeasure, locateClassroom } from '$lib/classroom/nav';
	import {
		isThumbShape,
		isThumbShapeChoice,
		type ItemThumbnail,
		type SectionThumbShapeWriter,
		type ThumbShape,
		type ThumbnailTransports
	} from '$lib/classroom/thumbnail';
	import type { ClassroomComposerTransports, ClassroomItem } from '$lib/classroom/classroom';
	import type { HtmlAssignmentData } from '$lib/classroom/html-assignment/mount';
	import type { HtmlAssignmentTransports } from '$lib/classroom/html-assignment/store';
	import { manifestThumbnail, servedThumbnailTemplate } from '$lib/classroom/html-assignment/thumbnail';
	import PostThumbnail from '$lib/classroom/PostThumbnail.svelte';
	/* A real document the importer accepts (the html-instructor harness's own:
	   a manifest, a field for every block, a working bridge), handed to a spec
	   as `window.__thumbDocument`, which rewrites its manifest's thumbnail key
	   into each form and stages it through the composer's own file input. */
	import { hxHarnessDocument } from '../html-instructor/fixture';
	import { BASE, CHECK_INS, CLOCK, ITEMS, SECTION, UNITS, automaticThumbnail, liveItems, pictureFor } from './fixture';

	/*
	 * POST THUMBNAILS ON THE REAL CLASS PAGE AND THE REAL COMPOSER (ledger
	 * 0396). Nothing here draws a thumbnail: ClassView, PostThumbnail,
	 * HtmlThumbnailFrame and ThumbnailEditor do, over the fixture and over
	 * in-memory writes.
	 *
	 * THE CLASS PAGE'S OWN MEASURE, set the way the classroom layout sets it
	 * (CLAUDE.md: a classroom harness that omits `--cr-measure-route` measures
	 * a width the real route never has).
	 */
	const params = page.url.searchParams;
	const shapeParam = params.get('shape');
	const classShape = isThumbShape(shapeParam) ? shapeParam : null;
	const themeParam = params.get('theme');
	const manage = params.get('manage') === '1';
	const pane = params.get('pane') === '1';
	const count = Math.min(60, Math.max(0, Number(params.get('count') ?? 0) || 0));
	const viewParam = params.get('view');
	/* `&editdoc=notemplate`: the assignment being edited stores the typo
	   document (its manifest names `cam-thumbnail`, it carries only
	   `idea-thumbnail`), so the database recorded no live thumbnail for it.
	   `&editdoc=notemplate-manual`: the same document under a look set by hand,
	   which hides the database's answer from the form.
	   `&editdoc=draft` / `&editdoc=scheduled`: the gear assignment, unpublished
	   or published for later, so the route would refuse its live thumbnail and
	   the form must not ask for one. `&editdoc=refused`: a live post whose
	   stored row says the document carries its template, served by a handle
	   the route does not know, so every preview frame meets the bodyless 404
	   (a load that did not finish, as far as the form can tell). */
	const editDoc = params.get('editdoc');
	const EDIT_DOC_ID =
		editDoc === 'notemplate' || editDoc === 'notemplate-manual' ? 'thumb-notemplate' : editDoc === 'refused' ? 'thumb-refused' : 'thumb-gear';
	const view = viewParam === 'editor' ? 'editor' : viewParam === 'settings' ? 'settings' : 'class';
	const items = count
		? liveItems(count, params.get('live') !== '0', params.get('quiet') === '1')
		: manage
			? ITEMS
			: ITEMS.filter((i) => i.published);
	const measure = classroomMeasure(locateClassroom(`/classroom/${SECTION.id}`));

	/*
	 * THE PERSON'S OWN DISPLAY SETTINGS, the real classroom preference store
	 * the classroom layout provides, in memory here, and the REAL Display
	 * settings panel over it. `?mine=wide` stands for a person who already
	 * chose a shape there; with no value they follow the class default. The
	 * class page reads the choice from this context exactly as it does on the
	 * real route, so a press in the panel redraws every row live.
	 */
	const mineParam = params.get('mine');
	const prefStore = createClassroomPreferences({ viewer: null, account: null, storage: null });
	if (isThumbShapeChoice(mineParam)) {
		prefStore.set('display', { ...prefStore.current.display, thumbShape: mineParam });
	}
	provideClassroomPreferences(prefStore);
	const prefs = reactivePreferences(prefStore);
	let settingsEl = $state<ClassroomSettings | null>(null);

	/* FORCED THEME ATTRIBUTE, as /dev/class-videos writes it: a harness holds
	   no session, so ThemeRoot's own decision is always "none" here. */
	$effect(() => {
		if (themeParam !== 'space-white' && themeParam !== 'matrix') return;
		const el = document.documentElement;
		const apply = () => el.setAttribute('data-theme', themeParam);
		apply();
		const t = setTimeout(apply, 0);
		return () => {
			clearTimeout(t);
			el.removeAttribute('data-theme');
		};
	});

	/*
	 * WHAT EACH LIVE THUMBNAIL REPORTS, recorded for a spec to read: the last
	 * state each document was told, every pointer it saw, its frame rate, and
	 * the interactive one's own button presses. The class page ignores these
	 * types; this listener is the harness's alone.
	 */
	type Report = { kind: string; state: unknown; extra: unknown; layout: unknown; at: number };
	/* The post whose slot holds the frame a message came from: the frame is
	   found by its own window, never by the document id it reports, because two
	   posts may show one document. */
	function senderItem(source: MessageEventSource | null): string | null {
		if (!source) return null;
		for (const f of document.querySelectorAll('iframe')) {
			if (f.contentWindow === source) return f.closest('[data-item-id]')?.getAttribute('data-item-id') ?? f.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
		}
		return null;
	}
	onMount(() => {
		const w = window as unknown as {
			__thumbReports: Record<string, Report[]>;
			__thumbReportsByItem: Record<string, Report[]>;
			__thumbFps: { doc: string; fps: number; longest: number; at: number }[];
			__thumbInteractive: number[];
			__thumbHydrated: boolean;
		};
		w.__thumbReports = {};
		w.__thumbReportsByItem = {};
		(window as unknown as { __thumbDocument: string }).__thumbDocument = hxHarnessDocument('kept').html;
		w.__thumbFps = [];
		w.__thumbInteractive = [];
		const on = (e: MessageEvent) => {
			const d = e.data as Record<string, unknown> | null;
			if (!d || typeof d !== 'object' || typeof d.type !== 'string') return;
			if (d.type === 'harness:thumb' && typeof d.doc === 'string') {
				const report = { kind: String(d.kind), state: d.state, extra: d.extra, layout: d.layout ?? null, at: performance.now() };
				(w.__thumbReports[d.doc] ??= []).push(report);
				const item = senderItem(e.source);
				if (item) (w.__thumbReportsByItem[item] ??= []).push(report);
			} else if (d.type === 'harness:fps') {
				w.__thumbFps.push({ doc: String(d.doc), fps: Number(d.fps), longest: Number(d.longest), at: performance.now() });
			} else if (d.type === 'harness:interactive') {
				w.__thumbInteractive.push(Number(d.n));
			}
		};
		window.addEventListener('message', on);
		/*
		 * EVERY FRAME THE PAGE MAKES, by its address, from the first: what a spec
		 * counts to say a live thumbnail was or was not asked for. The parent's
		 * resource timing cannot say it: measured on this page, a sandboxed
		 * frame's document load is reported there zero times, whether it answered
		 * 200 or 404, while the network carried every one. A frame already made
		 * (a child mounts first) is counted too.
		 */
		const made: string[] = [];
		(window as unknown as { __framesMade: string[] }).__framesMade = made;
		const note = (el: Element) => {
			for (const f of el.tagName === 'IFRAME' ? [el] : [...el.querySelectorAll('iframe')]) made.push(f.getAttribute('src') ?? '');
		};
		note(document.body);
		const watch = new MutationObserver((records) => {
			for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) note(n as Element);
		});
		watch.observe(document.body, { childList: true, subtree: true });
		document.documentElement.setAttribute('data-thumb-hydrated', 'true');
		w.__thumbHydrated = true;
		return () => {
			window.removeEventListener('message', on);
			watch.disconnect();
		};
	});

	// -------------------------------------------------------------------------
	// THE EDITOR VIEW: in-memory writes, recorded.
	// -------------------------------------------------------------------------

	type Write = { op: string; itemId: string; detail: Record<string, unknown> };
	let writes = $state<Write[]>([]);
	let rows = $state<Record<string, ItemThumbnail | null>>({});
	let nextItem = 1;

	function stamp(): string {
		return new Date(Date.now() + writes.length).toISOString();
	}
	function record(op: string, itemId: string, detail: Record<string, unknown>, row: ItemThumbnail | null) {
		writes = [...writes, { op, itemId, detail }];
		rows = { ...rows, [itemId]: row };
		(window as unknown as { __thumbWrites?: Write[] }).__thumbWrites = writes;
		return { ok: true as const, thumbnail: row };
	}
	const base: Omit<ItemThumbnail, 'source'> = {
		manual: true,
		image_key: null,
		attachment_id: null,
		image_width: null,
		image_height: null,
		focal_x: 0.5,
		focal_y: 0.5,
		html_document_id: null,
		interactive: false,
		updated_at: null
	};
	const thumbnailTransports: ThumbnailTransports = {
		async sendPicture(itemId, file, meta) {
			return record(
				'picture',
				itemId,
				{ name: file.name, type: file.type, size: file.size, ...meta },
				{ ...base, source: 'image', image_key: `${itemId}/${file.name}`, image_width: meta.width, image_height: meta.height, focal_x: meta.focalX, focal_y: meta.focalY, updated_at: stamp() }
			);
		},
		async set(itemId, choice) {
			if (choice.source === 'image') {
				return record('attachment', itemId, { ...choice }, { ...base, source: 'image', attachment_id: choice.attachmentId, image_width: choice.width, image_height: choice.height, focal_x: choice.focalX, focal_y: choice.focalY, updated_at: stamp() });
			}
			if (choice.source === 'none') return record('generated', itemId, {}, { ...base, source: 'none', updated_at: stamp() });
			// Automatic: what the document's manifest says, which here is the edit
			// view's own document (0268's sync does this in the database).
			const auto = itemId === EDIT_ID ? automaticThumbnail(EDIT_DOC_ID) : null;
			return record('auto', itemId, {}, auto ? { ...auto, updated_at: stamp() } : null);
		},
		async focus(itemId, x, y) {
			const prev = rows[itemId] ?? editItem.thumbnail ?? null;
			if (!prev || prev.source !== 'image') return { ok: false, message: 'Only a picture has a focus to move.' };
			return record('focus', itemId, { x, y }, { ...prev, focal_x: x, focal_y: y, updated_at: stamp() });
		}
	};

	/*
	 * THE HTML IMPORT, in memory, on both forms (an admin's composer). Uploading a
	 * document writes it and then does what 0268's trigger does in the database:
	 * the manifest's thumbnail becomes the post's, unless a person set one by
	 * hand (`manual`), which an upload never touches. `manifestPictures` is the
	 * harness's stand-in for the thumbnail image route: a manifest picture
	 * resolved the way that route resolves it (a `data:` picture as it is, an
	 * `attachment:<filename>` against the files the post was saved with).
	 */
	let manifestPictures = $state<Record<string, string>>({});
	const savedFiles: Record<string, Record<string, string>> = {};
	const htmlTransports: HtmlAssignmentTransports = {
		async setHtmlAssignment(itemId, html, manifest, filename) {
			/* 0268's sync, mirrored: a live thumbnail the document does not carry
			   the template for is no thumbnail (the generated look, no request). */
			const named = manifestThumbnail(manifest);
			const declared =
				named?.source === 'html' && servedThumbnailTemplate(html, named.template) === null
					? null
					: named;
			writes = [...writes, { op: 'html', itemId, detail: { filename, thumbnail: (manifest as { thumbnail?: unknown }).thumbnail ?? null } }];
			const prev = itemId in rows ? rows[itemId] : itemId === EDIT_ID ? editItem.thumbnail : null;
			if (prev?.manual) return { ok: true, revision: 2 };
			/* The dev document route serves its own fixtures and nothing a form
			   uploads, so the gear fixture stands in for a new post's document: a
			   saved, published post's live thumbnail is what the slot then shows. */
			const docId = 'thumb-gear';
			const next: ItemThumbnail | null = !declared
				? null
				: declared.source === 'html'
					? { ...base, manual: false, source: 'html', html_document_id: docId, interactive: declared.interactive, updated_at: stamp() }
					: { ...base, manual: false, source: 'image', updated_at: stamp() };
			rows = { ...rows, [itemId]: next };
			if (declared?.source === 'image') {
				const src = declared.src.startsWith('data:')
					? declared.src
					: savedFiles[itemId]?.[declared.src.slice('attachment:'.length).trim().toLowerCase()];
				if (src) manifestPictures = { ...manifestPictures, [itemId]: src };
			}
			return { ok: true, revision: 1 };
		},
		async setRubric() {
			return { ok: true };
		},
		async countOrphanedAnswers() {
			return { ok: true, responses: 0, files: 0 };
		}
	};
	/** A saved post's picture: the fixture's, a manifest picture, or none (the generated look). */
	function savedPicture(item: { id: string }): string | null {
		return manifestPictures[item.id] ?? pictureFor(item);
	}

	const composerTransports = {
		async createItem() {
			const itemId = `new-${nextItem++}`;
			writes = [...writes, { op: 'create', itemId, detail: {} }];
			return { ok: true as const, data: { itemId } };
		},
		async updateItem(id: string) {
			writes = [...writes, { op: 'update', itemId: id, detail: {} }];
			return { ok: true as const, data: { itemId: id } };
		},
		async uploadAttachment(itemId: string, file: File) {
			writes = [...writes, { op: 'attach', itemId, detail: { name: file.name } }];
			(savedFiles[itemId] ??= {})[file.name.toLowerCase()] = URL.createObjectURL(file);
			return { ok: true as const, data: undefined };
		},
		async uploadInstructorAttachment() {
			return { ok: true as const, data: undefined };
		},
		async deleteAttachment() {
			return { ok: true as const, data: undefined };
		},
		async deleteInstructorAttachment() {
			return { ok: true as const, data: undefined };
		},
		async setInstructorResources() {
			return { ok: true as const, data: undefined };
		},
		async addPostings() {
			return { ok: true as const, data: { added: 0 } };
		},
		async removePosting() {
			return { ok: true as const, data: { ok: true } };
		},
		async loadCategorySuggestions() {
			return [] as string[];
		},
		/* The class page's own row writes (select, drag, pin, duplicate,
		   delete), recorded and answered in memory, so a teacher's row carries
		   the checkbox, the drag handle and the menu it has on the real page. */
		async setOrder(ids: string[]) {
			writes = [...writes, { op: 'order', itemId: ids[0] ?? '', detail: { ids } }];
			return { ok: true as const, data: undefined };
		},
		async setPinned(id: string, pinned: boolean) {
			writes = [...writes, { op: 'pin', itemId: id, detail: { pinned } }];
			return { ok: true as const, data: undefined };
		},
		async duplicateItem(id: string) {
			writes = [...writes, { op: 'duplicate', itemId: id, detail: {} }];
			return { ok: true as const, data: { itemId: `${id}-copy` } };
		},
		async deleteItem(id: string) {
			writes = [...writes, { op: 'delete', itemId: id, detail: {} }];
			return { ok: true as const, data: undefined };
		}
	} as unknown as ClassroomComposerTransports;

	/* The post being edited: an HTML assignment whose document declares the live
	   gear thumbnail, with two pictures of its own to pick from (and a PDF and a
	   HEIC photo that are not offered). */
	const EDIT_ID = 'as-edit';
	const editItem: ClassroomItem = {
		...ITEMS[0],
		id: EDIT_ID,
		title: 'Gear ratios worksheet (edit me)',
		unit_id: null,
		attachments: [
			{ id: 'att-bench', filename: 'bench.png', mime_type: 'application/octet-stream' },
			{ id: 'att-arm', filename: 'arm.png', mime_type: 'application/octet-stream' },
			{ id: 'att-notes', filename: 'notes.pdf', mime_type: 'application/octet-stream' },
			// An iPhone photo: a picture, and not one a thumbnail may be (0268
			// takes PNG, JPEG, GIF, WebP, AVIF and BMP), so it is not offered.
			{ id: 'att-heic', filename: 'IMG_0412.HEIC', mime_type: 'application/octet-stream' }
		],
		thumbnail:
			editDoc === 'notemplate-manual'
				? { ...base, source: 'none', updated_at: '2026-10-16T09:00:00.000Z' }
				: editDoc === 'notemplate'
					? automaticThumbnail(EDIT_DOC_ID)
					: { ...base, manual: false, source: 'html', html_document_id: EDIT_DOC_ID, updated_at: '2026-10-16T09:00:00.000Z' },
		...(editDoc === 'draft' ? { published: false } : editDoc === 'scheduled' ? { published: true, publish_at: '2099-01-05T15:00:00.000Z' } : {})
	} as ClassroomItem;
	const editHtml: HtmlAssignmentData = {
		documentId: EDIT_DOC_ID,
		manifest: {
			schemaVersion: 3,
			kind: 'html-assignment',
			title: 'Gear ratios',
			thumbnail: { kind: 'html', template: EDIT_DOC_ID === 'thumb-notemplate' ? 'cam-thumbnail' : 'idea-thumbnail' }
		},
		filename: 'gear-ratios.html',
		updatedAt: '2026-10-16T09:00:00.000Z'
	};
	/* The edit form shows what the post holds NOW: a save here lands in `rows`,
	   and the form is remounted on it, as the item page's own reload does. */
	const editNow = $derived({ ...editItem, thumbnail: EDIT_ID in rows ? rows[EDIT_ID] : editItem.thumbnail } as ClassroomItem);
	let editKey = $state(0);

	const lastRow = $derived(Object.entries(rows).at(-1) ?? null);

	/* THE SETTINGS VIEW: the class's own Settings tab with the class default
	   card, over an in-memory writer that records what it was asked. */
	const settingsTransports = {
		async upsertSection() {
			return { ok: true as const, data: undefined };
		},
		async setSectionActive() {
			return { ok: true as const, data: undefined };
		},
		async deleteSection() {
			return { ok: true as const, data: { ok: true } };
		}
	} as unknown as Parameters<typeof ClassSettingsPanel>[1]['transports'];
	let classDefault = $state<ThumbShape | null>(classShape);
	const setThumbShape: SectionThumbShapeWriter = async (_id, shape) => {
		classDefault = shape;
		(window as unknown as { __thumbClassDefault?: unknown[] }).__thumbClassDefault = [
			...(((window as unknown as { __thumbClassDefault?: unknown[] }).__thumbClassDefault) ?? []),
			shape
		];
		return { ok: true, shape };
	};
</script>

<svelte:head>
	<title>Post thumbnails // dev harness</title>
</svelte:head>

<div
	class="harness thumbs-harness"
	data-testid="thumbs-harness"
	data-view={view}
	data-shape={classShape ?? 'built-in'}
	data-count={count}
>
	<section
		class="cr-root {CLASSROOM_PLATE}"
		aria-label={view === 'editor' ? 'The composer' : 'The class page'}
		data-testid="thumbs-class"
		style={measure ? `--cr-measure-route: var(--measure-${measure})` : undefined}
	>
		{#if view === 'class'}
			<!-- The class page inside the REAL split, as the section layout mounts
			     it, so the list takes the width the real route gives it (the
			     classroom split uses the whole window) rather than the plain
			     page measure a bare ClassView would get. -->
			<p class="thumbs-bar">
				<button type="button" class="btn secondary tiny" data-testid="settings-trigger" onclick={() => settingsEl?.open()}>
					Display settings
				</button>
				<span class="note" data-testid="thumbs-mine">Your choice: {prefs.current.display.thumbShape}</span>
			</p>
			<ClassSplit hasDetail={pane} nav={classList} overlay={null}>
				<main class="classroom-page item-page thumbs-detail" data-testid="thumbs-detail">
					<h1>Gear ratios (live thumbnail)</h1>
					<p class="note">The open post. The class list beside it is the pane a teacher works from.</p>
				</main>
			</ClassSplit>
			<ClassroomSettings bind:this={settingsEl} preferences={prefStore} role={manage ? 'manager' : 'student'} />
		{:else if view === 'settings'}
			<ClassSettingsPanel
				section={SECTION}
				transports={settingsTransports}
				thumbShape={{ ready: true, shape: classDefault }}
				{setThumbShape}
			/>
		{:else}
			<main class="classroom-page cr-instructor-surface thumbs-editor">
				<h1>Thumbnail editor</h1>
				<p class="note">
					The real composer over in-memory writes. Pictures the post owns load from the attachment
					route, which a browser pass stands in for.
				</p>
				<section class="card" data-testid="thumbs-create">
					<h2>A new post</h2>
					<ContentComposer
						mode="create"
						kind="assignment"
						sections={[SECTION]}
						initialTargets={[SECTION.id]}
						transports={composerTransports}
						htmlAssignmentTransports={htmlTransports}
						htmlAssignmentAdmin={true}
						{thumbnailTransports}
						onsaved={() => {}}
					/>
				</section>
				<section class="card" data-testid="thumbs-edit">
					<h2>An HTML assignment being edited</h2>
					{#key editKey}
						<ContentComposer
							mode="edit"
							kind="assignment"
							item={editNow}
							sections={[SECTION]}
							initialTargets={[SECTION.id]}
							transports={composerTransports}
							htmlAssignment={editHtml}
							htmlAssignmentTransports={htmlTransports}
							htmlAssignmentAdmin={true}
							{thumbnailTransports}
							onsaved={() => (editKey += 1)}
						/>
					{/key}
				</section>
				<section class="card" data-testid="thumbs-writes">
					<h2>Writes</h2>
					<ol class="writes">
						{#each writes as w, i (i)}
							<li data-testid="thumbs-write" data-op={w.op}>{w.op} {w.itemId} {JSON.stringify(w.detail)}</li>
						{/each}
					</ol>
					{#if lastRow}
						<p class="note last-row" data-testid="thumbs-last-row">{lastRow[0]}: {JSON.stringify(lastRow[1])}</p>
					{/if}
					<!-- Each saved post's slot, as the class page then draws it: the
					     real PostThumbnail over the row the writes left. -->
					<ul class="saved">
						{#each Object.entries(rows) as [id, row] (id)}
							<li class="saved-row" data-testid="thumbs-saved" data-item-id={id}>
								<PostThumbnail item={{ id, thumbnail: row }} shape="wide" glyph="assignment" label={id} imageSrc={savedPicture} />
								<span class="note">{id}</span>
							</li>
						{/each}
					</ul>
				</section>
			</main>
		{/if}
	</section>
</div>

{#snippet classList()}
	<ClassView
		section={SECTION}
		{items}
		units={UNITS}
		canManage={manage}
		transports={manage ? composerTransports : null}
		thumbnailTransports={manage ? thumbnailTransports : null}
		checkIns={count ? [] : CHECK_INS}
		clock={CLOCK}
		basePath={BASE}
		asPane={pane}
		selectedItemId={pane ? 'as-gears' : null}
		classThumbShape={classShape}
		thumbImageSrc={pictureFor}
	/>
{/snippet}

<style>
	.thumbs-harness {
		padding: 0;
	}
	.thumbs-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		margin: 0;
		padding: 0.5rem var(--cr-gutter, 1rem);
	}
	.thumbs-detail {
		padding: 1rem var(--cr-gutter, 1rem);
	}
	.thumbs-editor {
		max-width: var(--measure-split);
		margin: 0 auto;
		padding: 0 var(--cr-gutter, 1.2rem) 3rem;
	}
	.thumbs-editor .card {
		margin-bottom: 1.2rem;
	}
	.last-row {
		overflow-wrap: anywhere;
	}
	.saved {
		list-style: none;
		margin: 0.75rem 0 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
		gap: 0.75rem;
	}
	.saved-row {
		display: grid;
		gap: 0.3rem;
	}
	.writes {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2);
		overflow-wrap: anywhere;
	}
</style>
