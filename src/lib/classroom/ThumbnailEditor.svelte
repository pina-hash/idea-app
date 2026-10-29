<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import PostThumbnail from '$lib/classroom/PostThumbnail.svelte';
	import { dropTarget } from '$lib/file-drop';
	import {
		attachmentSrc,
		isImageAttachment,
		isImageFilename,
		resolveFigureSrc,
		type ClassroomAttachment,
		type ClassroomItem
	} from '$lib/classroom/classroom';
	import {
		THUMBNAILS_UNAVAILABLE,
		THUMBNAIL_RASTER_RE,
		thumbnailImageSrc,
		nudgeFocal,
		type ItemThumbnail,
		type ThumbGlyph,
		type ThumbPlanOptions,
		type ThumbnailTransports
	} from '$lib/classroom/thumbnail';
	import type { ManifestThumbnail } from '$lib/classroom/html-assignment/thumbnail';
	import { prepareThumbnailFile, measureImage } from '$lib/classroom/thumbnail-image';

	/**
	 * SETTING A POST'S THUMBNAIL, on the post's own creation and edit form
	 * (ledger 0396; IDEA_INTERFACE_STANDARDS: everything an item needs is
	 * attachable at creation, on one surface).
	 *
	 * FOUR WAYS IN, ONE PREVIEW. Upload a picture, paste or drop one here, pick
	 * one of the post's own pictures (its files, and on a new post the pictures
	 * staged with it), or go back: "Automatic" gives the post back to its HTML
	 * document's thumbnail or the generated look, and "Generated look" chooses
	 * the glyph tile by hand, over the document's. The preview draws the post in
	 * EVERY shape at once (Tile, Wide, Banner), so a teacher sees how one picture
	 * crops in each before choosing; the focus box under it moves the point every
	 * shape crops around, by pointer or by arrow keys.
	 *
	 * NOTHING IS WRITTEN UNTIL THE FORM IS SAVED, like every other part of this
	 * form: the choice is staged here, reported as unsaved work (`ondirtychange`),
	 * and `apply(itemId)` writes it once the post exists. A write that fails stays
	 * staged with its sentence, so saving again retries it.
	 *
	 * ABSENT TRANSPORTS REMOVE THE CONTROLS; a database without 0268 says so in
	 * one sentence instead (`unavailable`).
	 */
	type Pending =
		| { kind: 'file'; file: File; url: string; width: number; height: number; focalX: number; focalY: number }
		| { kind: 'attachment'; id: string; url: string; width: number | null; height: number | null; focalX: number; focalY: number }
		| { kind: 'none' }
		| { kind: 'auto' }
		| { kind: 'focus'; focalX: number; focalY: number };

	let {
		transports,
		item = null,
		glyph,
		attachments = [],
		stagedFiles = [],
		manifest = null,
		templateMissing = null,
		documentId = null,
		unavailable = false,
		imageSrc = null,
		title = '',
		live = false,
		ondirtychange = null
	}: {
		transports: ThumbnailTransports;
		/** The post being edited (its id and current thumbnail), or null on a new post. */
		item?: Pick<ClassroomItem, 'id' | 'thumbnail'> | null;
		glyph: ThumbGlyph;
		/** The post's own files, of which the pictures may be picked. */
		attachments?: ClassroomAttachment[];
		/** Pictures staged on this form and not uploaded yet (a new post's own pictures). */
		stagedFiles?: File[];
		/** What the HTML document's manifest declares, if this post has (or is getting) one. */
		manifest?: ManifestThumbnail | null;
		/**
		 * Whether the document does NOT carry the `<template>` its manifest names
		 * (`liveTemplateMissing`): true, and Automatic is the generated look and
		 * says why; false, it carries it; null, this form cannot tell.
		 */
		templateMissing?: boolean | null;
		/** The stored document's serving handle, so Automatic can preview a live thumbnail. */
		documentId?: string | null;
		/** The read could not tell (a database without 0268): one sentence, no controls. */
		unavailable?: boolean;
		/** A harness's own picture for the post's CURRENT thumbnail. */
		imageSrc?: ThumbPlanOptions['imageSrc'];
		/** The post's title as typed on the form, drawn beside each preview the way a class row draws it. */
		title?: string;
		/**
		 * Whether the post is published and not scheduled ahead. A live HTML
		 * thumbnail is served only for a live post (the worksheet route's own
		 * rule), so a draft's preview shows the generated look and says why.
		 */
		live?: boolean;
		ondirtychange?: ((dirty: boolean) => void) | null;
	} = $props();

	let pending = $state<Pending | null>(null);
	let problem = $state<string | null>(null);
	let busy = $state(false);
	let saved = $state<ItemThumbnail | null | undefined>(undefined);
	/* The post a write landed on. On a new post that is the id the save just
	   made, which the preview and the focus box then load the picture by. */
	let savedId = $state<string | null>(null);
	const postId = $derived(item?.id ?? savedId);
	let fileInput = $state<HTMLInputElement | null>(null);
	let dragActive = $state(false);

	/** What the post holds now: a write this form made, else what the page loaded. */
	const current = $derived(saved !== undefined ? saved : (item?.thumbnail ?? null));
	const dirty = $derived(pending !== null);
	$effect(() => {
		const value = dirty;
		untrack(() => ondirtychange?.(value));
	});

	function release(p: Pending | null): void {
		if (p?.kind === 'file') URL.revokeObjectURL(p.url);
	}
	onDestroy(() => {
		release(pending);
		ondirtychange?.(false);
	});
	function stage(next: Pending | null): void {
		if (pending !== next) release(pending);
		pending = next;
		problem = null;
	}

	/*
	 * THE POST'S OWN PICTURES THAT CAN BE ITS THUMBNAIL. A file is offered only
	 * when the thumbnail write would take it: 0268 refuses anything but a PNG,
	 * JPEG, GIF, WebP, AVIF or BMP by name (`THUMBNAIL_RASTER_RE`), so an iPhone
	 * HEIC on the post is not offered as a choice whose only answer is that
	 * refusal. A picture staged on this form and not uploaded yet is redrawn
	 * (`prepareThumbnailFile`, which turns a HEIC this browser CAN draw into a
	 * JPEG), so any picture is offered until this browser fails to draw it,
	 * and then it is not offered at all (`undrawable`).
	 */
	const pictures = $derived(
		attachments.filter((a) => isImageAttachment(a) && THUMBNAIL_RASTER_RE.test(a.filename ?? ''))
	);
	let undrawable = $state<ReadonlySet<File>>(new Set());
	const stagedImageFiles = $derived(stagedFiles.filter((f) => isImageFilename(f.name)));
	const stagedPictures = $derived(stagedImageFiles.filter((f) => !undrawable.has(f)));
	/** An attachment whose picture did not load in its tile: the tile names the file instead. */
	let unloaded = $state<ReadonlySet<string>>(new Set());

	/*
	 * A STAGED PICTURE'S OWN ADDRESS, made once per file and let go when the
	 * file leaves the form, so its tile can show it and a manifest naming it
	 * (`attachment:<filename>`) can preview it before the post is saved.
	 */
	let stagedUrls = $state<ReadonlyMap<File, string>>(new Map());
	$effect(() => {
		const files = stagedImageFiles;
		untrack(() => {
			const next = new Map<File, string>();
			for (const f of files) next.set(f, stagedUrls.get(f) ?? URL.createObjectURL(f));
			for (const [f, url] of stagedUrls) if (!next.has(f)) URL.revokeObjectURL(url);
			stagedUrls = next;
		});
	});
	onDestroy(() => {
		for (const url of stagedUrls.values()) URL.revokeObjectURL(url);
	});

	/** The picture a manifest's `attachment:<filename>` names: the post's file, else one staged here. */
	function manifestAttachmentSrc(src: string): string | null {
		const r = resolveFigureSrc(src, attachments);
		if (r.ok) return r.src;
		if (r.reason !== 'unresolved') return null;
		const wanted = src.slice('attachment:'.length).trim().toLowerCase();
		const staged = stagedPictures.find((f) => f.name.toLowerCase() === wanted);
		return staged ? (stagedUrls.get(staged) ?? null) : null;
	}

	async function useFile(file: File): Promise<void> {
		problem = null;
		busy = true;
		const prepared = await prepareThumbnailFile(file);
		busy = false;
		if (!prepared.ok) {
			problem = prepared.message;
			return;
		}
		stage({
			kind: 'file',
			file: prepared.file,
			url: URL.createObjectURL(prepared.file),
			width: prepared.width,
			height: prepared.height,
			focalX: 0.5,
			focalY: 0.5
		});
	}

	async function useAttachment(a: ClassroomAttachment): Promise<void> {
		problem = null;
		const url = attachmentSrc(a.id);
		const size = await measureImage(url);
		stage({ kind: 'attachment', id: a.id, url, width: size?.width ?? null, height: size?.height ?? null, focalX: 0.5, focalY: 0.5 });
	}

	function pickFiles(e: Event): void {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void useFile(file);
	}

	async function pasteFromClipboard(): Promise<void> {
		problem = null;
		const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
		if (!clip || typeof clip.read !== 'function') {
			problem = 'This browser cannot read the clipboard from a button. Select one of these keys and press Ctrl+V (Command+V on a Mac) instead.';
			return;
		}
		try {
			const items = await clip.read();
			for (const it of items) {
				const type = it.types.find((t) => t.startsWith('image/'));
				if (!type) continue;
				const blob = await it.getType(type);
				const ext = type.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'png';
				await useFile(new File([blob], `pasted.${ext}`, { type }));
				return;
			}
			problem = 'There is no picture on the clipboard. Copy one, then paste it here.';
		} catch {
			problem = 'The browser did not let this page read the clipboard. Select one of these keys and press Ctrl+V (Command+V on a Mac) instead.';
		}
	}

	/** The picture the preview and the focus box show, and where its focus is. */
	const framing = $derived.by((): { url: string; focalX: number; focalY: number } | null => {
		if (pending?.kind === 'file' || pending?.kind === 'attachment') return { url: pending.url, focalX: pending.focalX, focalY: pending.focalY };
		if (pending && pending.kind !== 'focus') return null;
		if (current?.source !== 'image' || !postId) return null;
		const url = imageSrc ? imageSrc({ id: postId }, current) : thumbnailImageSrc(postId, current.updated_at);
		if (!url) return null;
		const fx = pending?.kind === 'focus' ? pending.focalX : current.focal_x;
		const fy = pending?.kind === 'focus' ? pending.focalY : current.focal_y;
		return { url, focalX: fx, focalY: fy };
	});

	function setFocal(x: number, y: number): void {
		const c = nudgeFocal(x, y, 0, 0);
		if (pending?.kind === 'file' || pending?.kind === 'attachment') {
			pending = { ...pending, focalX: c.x, focalY: c.y };
		} else if (current?.source === 'image') {
			pending = { kind: 'focus', focalX: c.x, focalY: c.y };
		}
	}

	function focusFromPointer(e: PointerEvent): void {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		if (!r.width || !r.height) return;
		setFocal((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
	}
	let dragging = false;
	function focusKey(e: KeyboardEvent): void {
		if (!framing) return;
		const step = e.shiftKey ? 0.1 : 0.05;
		const moves: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		if (e.key === 'Home') {
			e.preventDefault();
			setFocal(0.5, 0.5);
			return;
		}
		const m = moves[e.key];
		if (!m) return;
		e.preventDefault();
		const n = nudgeFocal(framing.focalX, framing.focalY, m[0], m[1]);
		setFocal(n.x, n.y);
	}

	/** The preview's thumbnail row and its own picture source, built from the staged choice. */
	const preview = $derived.by((): { thumb: ItemThumbnail | null; src: ThumbPlanOptions['imageSrc'] } => {
		const base = {
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
		if (pending?.kind === 'file' || pending?.kind === 'attachment') {
			const url = pending.url;
			return {
				thumb: {
					...base,
					source: 'image',
					image_key: 'staged',
					image_width: pending.width,
					image_height: pending.height,
					focal_x: pending.focalX,
					focal_y: pending.focalY
				},
				src: () => url
			};
		}
		if (pending?.kind === 'none') return { thumb: { ...base, source: 'none' }, src: null };
		if (pending?.kind === 'auto' || (!pending && !current)) return autoPreview(base);
		if (current) {
			const thumb = pending?.kind === 'focus' ? { ...current, focal_x: pending.focalX, focal_y: pending.focalY } : current;
			return { thumb, src: imageSrc };
		}
		return { thumb: null, src: null };
	});

	function autoPreview(base: Omit<ItemThumbnail, 'source'>): { thumb: ItemThumbnail | null; src: ThumbPlanOptions['imageSrc'] } {
		/* A template the document does not carry is never asked for: the route
		   could only answer its 404, and the post shows the generated look. */
		if (manifest?.source === 'html' && documentId && templateMissing !== true) {
			return { thumb: { ...base, manual: false, source: 'html', html_document_id: documentId, interactive: manifest.interactive }, src: null };
		}
		if (manifest?.source === 'image') {
			const resolved = manifest.src.startsWith('data:') ? manifest.src : manifestAttachmentSrc(manifest.src);
			if (resolved) return { thumb: { ...base, manual: false, source: 'image', image_key: 'manifest' }, src: () => resolved };
		}
		return { thumb: null, src: null };
	}

	/** Whether Automatic is the choice in force, or the one staged to be saved. */
	const automaticNow = $derived(pending?.kind === 'auto' || (!pending && !current?.manual));

	/*
	 * A LIVE THUMBNAIL THAT DID NOT LOAD IN THE PREVIEW. Where this form cannot
	 * tell whether the stored document carries its template (a hand-set
	 * thumbnail hides the database's answer), the preview asks the route, and a
	 * frame that never says it is ready is the answer: said in words, keyed on
	 * the document and its version so a new upload is believed afresh.
	 */
	let liveFailedFor = $state<string | null>(null);
	const liveKey = (t: ItemThumbnail | null) => (t?.source === 'html' ? `${t.html_document_id}|${t.updated_at ?? ''}` : null);
	const liveFailed = $derived(liveFailedFor !== null && liveFailedFor === liveKey(preview.thumb));
	function noteLiveFail(): void {
		liveFailedFor = liveKey(preview.thumb);
	}
	/* Try again: the three previews are made afresh (a new frame each, so a
	   new request), and the failure is forgotten until they fail again. A
	   reload would do the same and costs the rest of the form's unsaved work. */
	let liveTry = $state(0);
	let nowEl = $state<HTMLParagraphElement | null>(null);
	function retryLive(): void {
		liveFailedFor = null;
		liveTry += 1;
		/* The key goes with the failure it answered, so the focus moves to the
		   status line, which says what the preview is doing now. */
		nowEl?.focus();
	}

	/** What the post shows now, or will once the form is saved, in words. */
	const describe = $derived.by((): string => {
		const automatic =
			manifest?.source === 'html'
				? templateMissing === true
					? `the generated look, because the HTML document does not carry the thumbnail template "${manifest.template}" its manifest names`
					: liveFailed
						? "the HTML document's live thumbnail, which did not load in this preview"
						: "the HTML document's live thumbnail"
				: manifest?.source === 'image'
					? missingPicture
						? "the generated look, because the picture the HTML document names is not one of this post's files"
						: "the HTML document's picture"
					: 'the generated look: its type on a tile in its unit color';
		if (pending?.kind === 'file') return 'The picture you chose. Saving the post sets it.';
		if (pending?.kind === 'attachment') return "One of the post's pictures. Saving the post sets it.";
		if (pending?.kind === 'none') return 'The generated look, chosen by hand. Saving the post sets it.';
		if (pending?.kind === 'auto') return `Automatic: ${automatic}. Saving the post sets it.`;
		if (pending?.kind === 'focus') return 'The same picture, framed differently. Saving the post sets it.';
		if (!current || !current.manual) return `Automatic: ${automatic}.`;
		return current.source === 'none' ? 'The generated look, chosen by hand.' : 'A picture chosen by hand.';
	});

	/*
	 * A MANIFEST PICTURE THAT IS NOT HERE. The document names
	 * `attachment:<filename>` and neither the post's files nor the pictures
	 * staged on this form carry that name, so Automatic shows the generated
	 * look; said in words, with the file to attach, rather than left as a
	 * preview that quietly does not match "the HTML document's picture".
	 */
	const missingPicture = $derived.by((): string | null => {
		if (manifest?.source !== 'image' || !manifest.src.startsWith('attachment:')) return null;
		if (!automaticNow) return null;
		if (manifestAttachmentSrc(manifest.src)) return null;
		const name = manifest.src.slice('attachment:'.length).trim();
		return `The document names the picture "${name}", which is not one of this post's files. Attach it to the post, or the post shows the generated look.`;
	});

	/*
	 * A TEMPLATE THE DOCUMENT DOES NOT CARRY. The manifest names one and the
	 * document has no `<template>` of that id with anything in it, so the post
	 * shows the generated look on every list (0268 records no live thumbnail
	 * for it). Said with the fix, rather than promising a live thumbnail that
	 * could never appear; the import panel's warning says the same thing.
	 */
	const missingTemplate = $derived(
		manifest?.source === 'html' && templateMissing === true && automaticNow
			? `The manifest names a thumbnail template "${manifest.template}" the document does not carry, so the post shows the generated look. Add <template id="${manifest.template}"> with the thumbnail inside it to the document, and upload it again, to show a live one.`
			: null
	);
	/*
	 * WHAT A FAILED PREVIEW MEANS DEPENDS ON WHAT THE FORM KNOWS (review of the
	 * polish round). A preview is mounted only for a live post (`previewItem`
	 * carries `live`), so a draft or a scheduled post is never asked for one
	 * and never reports a failure: `liveNote` says why it shows the generated
	 * look. On a live post a frame that never said it was ready is one of two
	 * things: where the database said the document carries its template
	 * (`templateMissing === false`) it is a load that did not finish, so the
	 * note offers another try and blames nothing; only where the form cannot
	 * tell (a hand-set look hides the database's answer) does it name the
	 * template, as the one cause the form cannot rule out.
	 */
	const liveFailNote = $derived(
		manifest?.source === 'html' && templateMissing !== true && liveFailed && automaticNow
			? templateMissing === false
				? 'The live thumbnail did not load in this preview, which shows the generated look in its place. Try again to load it.'
				: `The live thumbnail did not load in this preview, which shows the generated look in its place. Try again to load it. If it still does not load, the document may not carry <template id="${manifest.template}">, and without it the post shows the generated look.`
			: null
	);

	const liveNote = $derived(
		manifest?.source === 'html' && templateMissing !== true && (!documentId || !live) && automaticNow
			? "The document's live thumbnail shows here once the class can see the assignment (saved, published, and past any scheduled time); until then it shows the generated look."
			: null
	);

	/**
	 * WRITE THE STAGED CHOICE onto the post, once it exists. Returns the
	 * sentences of what did not land (empty when everything did); a failure
	 * stays staged so the next save retries exactly it.
	 */
	export async function apply(itemId: string): Promise<string[]> {
		const p = pending;
		if (!p) return [];
		const res =
			p.kind === 'file'
				? await transports.sendPicture(itemId, p.file, { width: p.width, height: p.height, focalX: p.focalX, focalY: p.focalY })
				: p.kind === 'attachment'
					? await transports.set(itemId, {
							source: 'image',
							attachmentId: p.id,
							width: p.width,
							height: p.height,
							focalX: p.focalX,
							focalY: p.focalY
						})
					: p.kind === 'focus'
						? await transports.focus(itemId, p.focalX, p.focalY)
						: await transports.set(itemId, { source: p.kind });
		if (!res.ok) {
			problem = res.message;
			return [`thumbnail: ${res.message}`];
		}
		// A picked attachment's picture is the post's own file, so the preview
		// keeps showing it through the image route from here on.
		saved = res.thumbnail;
		savedId = itemId;
		release(p);
		pending = null;
		problem = null;
		return [];
	}

	/** Whether there is a staged choice to write. */
	export function hasChange(): boolean {
		return pending !== null;
	}

	/* `published: live`: a live HTML thumbnail previews only for a post the
	   route serves one for (`thumbnailPlan` draws the generated look for a
	   draft and a scheduled post), so a draft's form never asks for a frame
	   the route could only answer with its 404. */
	const previewItem = $derived({ id: postId ?? 'new-post', thumbnail: preview.thumb, published: live });
	const previewTitle = $derived(title.trim() || 'Untitled post');
	const manualNow = $derived(pending ? pending.kind !== 'auto' : !!current?.manual);
</script>

<div class="te" data-testid="thumbnail-editor">
	<span class="mini-label">Thumbnail</span>
	{#if unavailable}
		<p class="te-note" data-testid="thumbnail-unavailable">{THUMBNAILS_UNAVAILABLE}</p>
	{:else}
		<p class="te-now" data-testid="thumbnail-now" aria-live="polite" tabindex="-1" bind:this={nowEl}>{describe}</p>

		<!-- EVERY SHAPE AT ONCE, AS THE POST: how this one picture crops as a
		     tile, a wide picture and a banner, each drawn with the post's title
		     where a class row puts it (beside a tile, under the other two), so a
		     teacher sees the row a class will see, whichever shape is picked. -->
		{#key liveTry}
		<div class="te-shapes" data-testid="thumbnail-preview">
			<figure class="te-shape te-shape-tile">
				<figcaption>Tile</figcaption>
				<div class="te-row">
					<PostThumbnail item={previewItem} shape="tile" {glyph} label={previewTitle} imageSrc={preview.src} onlivefail={noteLiveFail} />
					<span class="te-row-title">{previewTitle}</span>
				</div>
			</figure>
			<figure class="te-shape te-shape-wide">
				<figcaption>Wide</figcaption>
				<div class="te-row te-row-stack">
					<PostThumbnail item={previewItem} shape="wide" {glyph} label={previewTitle} imageSrc={preview.src} onlivefail={noteLiveFail} />
					<span class="te-row-title">{previewTitle}</span>
				</div>
			</figure>
			<figure class="te-shape te-shape-banner">
				<figcaption>Banner</figcaption>
				<div class="te-row te-row-stack">
					<PostThumbnail item={previewItem} shape="banner" {glyph} label={previewTitle} imageSrc={preview.src} onlivefail={noteLiveFail} />
					<span class="te-row-title">{previewTitle}</span>
				</div>
			</figure>
		</div>
		{/key}
		{#if liveNote}<p class="te-note" data-testid="thumbnail-live-note">{liveNote}</p>{/if}
		{#if missingTemplate}<p class="te-note" data-testid="thumbnail-missing-template">{missingTemplate}</p>{/if}
		{#if liveFailNote}
			<div class="te-failed">
				<p class="te-note" data-testid="thumbnail-live-failed">{liveFailNote}</p>
				<button type="button" class="btn secondary te-key" data-testid="thumbnail-live-retry" onclick={retryLive}>Try again</button>
			</div>
		{/if}
		{#if missingPicture}<p class="te-note" data-testid="thumbnail-missing-picture">{missingPicture}</p>{/if}

		<div
			class="te-drop"
			class:active={dragActive}
			role="group"
			aria-label="Thumbnail picture: upload, paste or drop one here"
			use:dropTarget={{
				onfiles: (files) => void useFile(files[0]),
				onactive: (on) => (dragActive = on),
				accept: (f) => isImageFilename(f.name) || f.type.startsWith('image/'),
				onrejected: () => (problem = 'A thumbnail has to be a picture: a PNG, JPEG, GIF, WebP, AVIF or BMP.')
			}}
		>
			<div class="te-keys">
				<!-- `accept` on THIS picker, unlike every attachment picker: a thumbnail
				     is a picture by what the feature consumes (the deck input's own
				     exemption, tests/classroom-attachment-mime.test.ts). -->
				<input
					bind:this={fileInput}
					class="te-file"
					type="file"
					accept="image/*"
					data-testid="thumbnail-upload-input"
					onchange={pickFiles}
				/>
				<button type="button" class="btn secondary te-key" disabled={busy} data-testid="thumbnail-upload" onclick={() => fileInput?.click()}>
					{busy ? 'Reading the picture...' : 'Upload a picture'}
				</button>
				<button type="button" class="btn secondary te-key" disabled={busy} data-testid="thumbnail-paste" onclick={pasteFromClipboard}>Paste</button>
				<button
					type="button"
					class="btn secondary te-key"
					class:on={pending?.kind === 'none' || (!pending && current?.manual && current.source === 'none')}
					data-testid="thumbnail-generated"
					onclick={() => stage({ kind: 'none' })}>Generated look</button
				>
				<button
					type="button"
					class="btn secondary te-key"
					class:on={!manualNow}
					data-testid="thumbnail-auto"
					onclick={() => stage(current?.manual ? { kind: 'auto' } : null)}>Automatic</button
				>
				{#if pending}
					<button type="button" class="btn secondary te-key" data-testid="thumbnail-undo" onclick={() => stage(null)}>Keep the current one</button>
				{/if}
			</div>
			<p class="te-hint">Drop a picture on this box, or select one of these keys and press Ctrl+V (Command+V on a Mac) to paste one.</p>
		</div>

		{#if pictures.length || stagedPictures.length}
			<div class="te-pick" data-testid="thumbnail-pick">
				<span class="te-pick-label">Or use one of this post's pictures</span>
				<div class="te-pick-row">
					{#each pictures as a (a.id)}
						<!-- A picture that does not load names its file instead, so the
						     tile is never a broken image and is still a choice a teacher
						     can read (the CLAUDE.md thumbnail fallback). -->
						<button
							type="button"
							class="te-pick-item"
							class:te-pick-staged={unloaded.has(a.id)}
							class:on={pending?.kind === 'attachment' && pending.id === a.id}
							aria-label="Use {a.filename}"
							title={a.filename}
							data-testid="thumbnail-pick-item"
							data-loaded={unloaded.has(a.id) ? 'false' : 'true'}
							onclick={() => useAttachment(a)}
						>
							{#if unloaded.has(a.id)}
								<span class="te-pick-name">{a.filename}</span>
							{:else}
								<img
									src={attachmentSrc(a.id)}
									alt=""
									loading="lazy"
									decoding="async"
									onerror={() => (unloaded = new Set([...unloaded, a.id]))}
								/>
							{/if}
						</button>
					{/each}
					{#each stagedPictures as f (f)}
						{@const url = stagedUrls.get(f)}
						<button
							type="button"
							class="te-pick-item"
							aria-label="Use {f.name}"
							title={f.name}
							data-testid="thumbnail-pick-item"
							data-staged="true"
							onclick={() => useFile(f)}
						>
							{#if url}
								<img src={url} alt="" decoding="async" onerror={() => (undrawable = new Set([...undrawable, f]))} />
							{/if}
						</button>
					{/each}
				</div>
			</div>
		{/if}

		{#if framing}
			<div class="te-focus" data-testid="thumbnail-focus">
				<span class="te-pick-label">Focus: the part of the picture every shape keeps in view</span>
				<div
					class="te-focus-box"
					role="slider"
					tabindex="0"
					aria-label="Picture focus. Arrow keys move it; Home centers it."
					aria-valuemin={0}
					aria-valuemax={100}
					aria-valuenow={Math.round(framing.focalX * 100)}
					aria-valuetext="{Math.round(framing.focalX * 100)}% across, {Math.round(framing.focalY * 100)}% down"
					data-testid="thumbnail-focus-box"
					onkeydown={focusKey}
					onpointerdown={(e) => {
						dragging = true;
						(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
						focusFromPointer(e);
					}}
					onpointermove={(e) => dragging && focusFromPointer(e)}
					onpointerup={() => (dragging = false)}
					onpointercancel={() => (dragging = false)}
				>
					<img src={framing.url} alt="" draggable="false" />
					<span class="te-focus-mark" style:left="{framing.focalX * 100}%" style:top="{framing.focalY * 100}%" aria-hidden="true"></span>
				</div>
				<div class="te-focus-foot">
					<span class="te-focus-read" data-testid="thumbnail-focus-read">{Math.round(framing.focalX * 100)}% across, {Math.round(framing.focalY * 100)}% down</span>
					<button type="button" class="btn secondary te-key" onclick={() => setFocal(0.5, 0.5)}>Center</button>
				</div>
			</div>
		{/if}

		{#if problem}<p class="feedback error te-problem" role="alert" data-testid="thumbnail-problem">{problem}</p>{/if}
	{/if}
</div>

<style>
	.te {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		min-width: 0;
	}
	.te-now,
	.te-note,
	.te-hint {
		margin: 0;
		color: var(--text-2);
		font-size: var(--fs-caption);
		line-height: 1.4;
	}
	.te-now {
		color: var(--text-1);
	}
	/* A failed live preview: the sentence, and its Try again beside it where
	   the form is wide enough and under it where it is not. */
	.te-failed {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem) var(--space-3, 0.75rem);
	}
	.te-failed .te-note {
		flex: 0 1 auto;
		min-width: 0;
		max-width: 46rem;
	}
	/* THE THREE SHAPES, side by side where they fit and stacked where they do
	   not: a tile, then a wide picture, then a banner that takes the rest. */
	/* THE THREE PREVIEWS, each at the width a class row gives it: a tile row
	   and a banner held to a unit column's width (so the banner crops as a row
	   crops, not as a much flatter strip), the wide one at a narrow column's,
	   wrapping onto as many lines as the form's width needs. */
	.te-shapes {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		gap: var(--space-3, 0.75rem);
		min-width: 0;
	}
	.te-shape {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		min-width: 0;
	}
	.te-shape-tile {
		flex: 0 1 18rem;
	}
	.te-shape-wide {
		flex: 0 1 14rem;
	}
	.te-shape-banner {
		flex: 1 1 18rem;
		max-width: 26rem;
	}
	.te-shape figcaption {
		font-family: var(--font-mono);
		font-size: var(--fs-micro);
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.te-row {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		min-width: 0;
		padding: 0.45rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-card, 8px);
	}
	.te-row-stack {
		flex-direction: column;
		align-items: stretch;
		gap: 0.35rem;
	}
	/* The title as a row sets it: the display face at 600, cut to two lines. */
	.te-row-title {
		min-width: 0;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: var(--fs-ui);
		line-height: 1.25;
		color: var(--text-1);
		overflow-wrap: break-word;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.te-drop {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: var(--space-2, 0.5rem);
		border: 1px dashed var(--boundary);
		border-radius: var(--radius-card, 8px);
	}
	.te-drop.active {
		outline: 2px dashed var(--green);
		outline-offset: -2px;
	}
	.te-drop:focus-within {
		border-style: solid;
	}
	.te-keys {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.te-key,
	:global(.cr-root) .te-key.btn {
		min-height: 44px;
		display: inline-flex;
		align-items: center;
	}
	.te-file {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
		pointer-events: none;
	}
	.te-pick-label {
		display: block;
		font-size: var(--fs-meta);
		color: var(--text-2);
		margin-bottom: 0.25rem;
	}
	.te-pick-row {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.te-pick-item {
		appearance: none;
		width: 4rem;
		height: 4rem;
		padding: 0;
		border: 1px solid var(--boundary);
		border-radius: 8px;
		overflow: hidden;
		background: var(--surface-2, transparent);
		cursor: pointer;
	}
	.te-pick-item img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.te-pick-item.on,
	.te-pick-item:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 1px;
	}
	.te-pick-staged {
		display: grid;
		place-items: center;
		padding: 0.25rem;
	}
	.te-pick-name {
		font-size: var(--fs-micro);
		color: var(--text-2);
		overflow-wrap: anywhere;
		max-height: 100%;
		overflow: hidden;
	}
	.te-focus-box {
		position: relative;
		display: inline-block;
		max-width: min(100%, 22rem);
		border: 1px solid var(--boundary);
		border-radius: 8px;
		overflow: hidden;
		cursor: crosshair;
		touch-action: none;
		line-height: 0;
	}
	.te-focus-box:focus-visible {
		outline: 2px solid var(--green);
		outline-offset: 2px;
	}
	.te-focus-box img {
		display: block;
		max-width: 100%;
		max-height: 14rem;
		object-fit: contain;
		user-select: none;
	}
	/* The mark: a ring in the room's text color over a dark halo, so it reads
	   on any picture. */
	.te-focus-mark {
		position: absolute;
		width: 1.6rem;
		height: 1.6rem;
		margin: -0.8rem 0 0 -0.8rem;
		border-radius: 50%;
		border: 2px solid #fff;
		box-shadow:
			0 0 0 2px rgba(0, 0, 0, 0.65),
			inset 0 0 0 2px rgba(0, 0, 0, 0.65);
		pointer-events: none;
	}
	.te-focus-foot {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
		margin-top: 0.35rem;
	}
	.te-focus-read {
		font-family: var(--font-mono);
		font-size: var(--fs-meta);
		color: var(--text-2);
	}
	.te-problem {
		margin: 0;
	}
</style>
