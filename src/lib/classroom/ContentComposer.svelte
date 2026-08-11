<script lang="ts">
	import AttachmentList from '$lib/classroom/AttachmentList.svelte';
	import {
		formatBytes,
		isoToLocalInput,
		localInputToIso,
		sectionTitle,
		type ClassroomAssignment,
		type ClassroomAttachment,
		type ClassroomComposerTransports,
		type ClassroomPost,
		type ClassroomSection
	} from '$lib/classroom/classroom';

	/**
	 * THE content editor for classroom posts and assignments -- one component,
	 * mounted by the manage console (create + edit), the class stream and the
	 * assignment detail page (edit in place). Deliberately not a second editor
	 * per surface: the publish/draft rules, the resource rows, the multi-section
	 * targets and the attachment sequencing are all fiddly enough that two
	 * copies would drift, and the one that drifts is the one nobody is looking
	 * at.
	 *
	 * Presentation + orchestration only. Every server call goes through the
	 * injected transports (the ReviewConsole convention), which are thin callers
	 * of the 0082/0083 SECURITY DEFINER RPCs -- nothing here is a boundary, and
	 * a refusal comes back as text to render.
	 *
	 * ATTACHMENT SEQUENCING is the one genuinely ordered bit: an attachment row
	 * stores a Drive file id against a post/assignment id, so the content has to
	 * EXIST first. Files are therefore staged locally and uploaded after the
	 * create/update RPC hands back the ids it touched -- which is also why a
	 * multi-section publish can put one upload on all N copies.
	 */
	let {
		mode = 'create',
		kind = $bindable('post'),
		sections = [],
		post = null,
		assignment = null,
		attachments = [],
		transports,
		attachmentsEnabled = true,
		compact = false,
		onsaved,
		oncancel = null
	}: {
		mode?: 'create' | 'edit';
		kind?: 'post' | 'assignment';
		/** Publish targets; create mode only (an edit always targets one row). */
		sections?: ClassroomSection[];
		post?: ClassroomPost | null;
		assignment?: ClassroomAssignment | null;
		attachments?: ClassroomAttachment[];
		transports: ClassroomComposerTransports;
		/** False when Drive is unconfigured: the file controls hide entirely. */
		attachmentsEnabled?: boolean;
		/** Inline placement (class page / assignment detail) vs the console card. */
		compact?: boolean;
		onsaved: (info: { kind: 'post' | 'assignment'; published: boolean; text: string }) => void;
		oncancel?: (() => void) | null;
	} = $props();

	type Msg = { ok: boolean; text: string } | null;

	const editingKind = $derived(mode === 'edit' ? (post ? 'post' : 'assignment') : kind);

	// Seeded once from the row being edited; the parent REMOUNTS this component
	// (a keyed block) when the edit target changes, so there is no effect
	// resetting fields underneath someone who is typing.
	// svelte-ignore state_referenced_locally
	let postTitle = $state(post?.title ?? '');
	// svelte-ignore state_referenced_locally
	let postBody = $state(post?.body ?? '');
	// svelte-ignore state_referenced_locally
	let asgTitle = $state(assignment?.title ?? '');
	// svelte-ignore state_referenced_locally
	let asgDescription = $state(assignment?.description ?? '');
	// bind:value on <input type="number"> COERCES to a number (the ReviewConsole
	// unit-field lesson), so this is string | number and every read goes through
	// String().
	// svelte-ignore state_referenced_locally
	let asgPoints = $state<string | number>(assignment?.points == null ? '' : String(assignment.points));
	// svelte-ignore state_referenced_locally
	let asgDue = $state(isoToLocalInput(assignment?.due_at ?? null));
	// svelte-ignore state_referenced_locally
	let asgCategory = $state(assignment?.category ?? '');
	// svelte-ignore state_referenced_locally
	let resources = $state<{ label: string; url: string }[]>(
		(assignment?.resources ?? []).map((r) => ({ label: r.label, url: r.url }))
	);

	let targets = $state<Record<string, boolean>>({});
	let busy = $state(false);
	let msg = $state<Msg>(null);

	// --- Attachments ------------------------------------------------------
	// A local copy so a removal shows immediately without the parent having to
	// round-trip; the parent reloads on `onsaved` and remounts on a new target.
	// svelte-ignore state_referenced_locally
	let existing = $state<ClassroomAttachment[]>([...attachments]);
	let staged = $state<File[]>([]);
	let removingId = $state<string | null>(null);
	let pasteHint = $state<string | null>(null);

	const targetIds = $derived(sections.filter((s) => targets[s.id]).map((s) => s.id));

	function stageFiles(files: FileList | File[] | null) {
		if (!files || !attachmentsEnabled) return;
		const next = Array.from(files).filter((f) => f.size > 0);
		if (next.length) staged = [...staged, ...next];
	}

	function pickFiles(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		stageFiles(input.files);
		// Clear so picking the SAME file twice in a row still fires change.
		input.value = '';
	}

	/**
	 * Ctrl+V of a screenshot. The clipboard carries a pasted image as an
	 * `image/*` ITEM with no name, so it is read from `items` (not `files`,
	 * which several browsers leave empty for synthesised clipboard blobs) and
	 * given a filename here -- the upload route also has a fallback, but naming
	 * it at the point of paste is what lets the staged list show something a
	 * teacher recognises.
	 *
	 * Only image items are intercepted: pasting TEXT into the body must keep
	 * working exactly as it always did, so anything else falls through
	 * untouched with no preventDefault.
	 */
	function onPaste(event: ClipboardEvent) {
		if (!attachmentsEnabled) return;
		const items = event.clipboardData?.items;
		if (!items) return;
		const images: File[] = [];
		for (const item of items) {
			if (item.kind !== 'file' || !item.type.startsWith('image/')) continue;
			const file = item.getAsFile();
			if (!file) continue;
			const ext = item.type.split('/')[1]?.replace(/[^a-z0-9]/g, '') || 'png';
			const name = file.name && file.name !== 'image.png' ? file.name : `pasted-${Date.now()}.${ext}`;
			images.push(new File([file], name, { type: item.type }));
		}
		if (!images.length) return;
		event.preventDefault();
		staged = [...staged, ...images];
		pasteHint = `${images.length} pasted image${images.length === 1 ? '' : 's'} attached.`;
		setTimeout(() => (pasteHint = null), 4000);
	}

	async function removeExisting(a: ClassroomAttachment) {
		if (removingId) return;
		removingId = a.id;
		const res = await transports.deleteAttachment(a.id);
		removingId = null;
		if (res.ok) {
			existing = existing.filter((x) => x.id !== a.id);
		} else {
			msg = { ok: false, text: res.message };
		}
	}

	function assignmentInput() {
		const rawPoints = String(asgPoints ?? '').trim();
		const pts = rawPoints === '' ? null : Number.parseInt(rawPoints, 10);
		return {
			title: asgTitle,
			description: asgDescription,
			points: Number.isNaN(pts as number) ? null : pts,
			dueAt: localInputToIso(asgDue),
			category: asgCategory.trim() || null,
			resources: resources
				.map((r) => ({ label: r.label.trim(), url: r.url.trim() }))
				.filter((r) => r.url !== '')
		};
	}

	async function submit(publish: boolean) {
		if (busy) return;
		busy = true;
		msg = null;
		try {
			await runSubmit(publish);
		} finally {
			// Whatever happens, the buttons come back -- a stuck busy flag is a
			// silently wedged editor (the number-input coercion throw, found live
			// in the console's own composer, left both buttons disabled forever).
			busy = false;
		}
	}

	async function runSubmit(publish: boolean) {
		let res;
		if (mode === 'edit') {
			res =
				editingKind === 'post'
					? await transports.updatePost(post!.id, postBody, postTitle.trim() || null, publish)
					: await transports.updateAssignment(assignment!.id, assignmentInput(), publish);
		} else if (targetIds.length === 0) {
			res = { ok: false as const, message: 'Pick at least one section to publish to.' };
		} else {
			res =
				kind === 'post'
					? await transports.createPost(targetIds, postBody, postTitle.trim() || null, publish)
					: await transports.createAssignment(targetIds, assignmentInput(), publish);
		}

		if (!res.ok) {
			msg = { ok: false, text: res.message };
			return;
		}

		// The content exists; NOW the staged files can be attached to it. One
		// upload per file lands on every id the write touched.
		let attachNote = '';
		if (staged.length && res.data.ids.length) {
			const failures: string[] = [];
			for (const file of staged) {
				const up = await transports.uploadAttachment(editingKind, res.data.ids, file);
				if (!up.ok) failures.push(`${file.name}: ${up.message}`);
			}
			staged = [];
			if (failures.length) {
				// The content DID save. Saying so and naming the files that did not
				// upload is the honest report; claiming the whole thing failed would
				// send a teacher back to retype a post that is already published.
				msg = {
					ok: false,
					text: `Saved, but ${failures.length} file${failures.length === 1 ? '' : 's'} did not attach -- ${failures.join('; ')}`
				};
				onsaved({ kind: editingKind, published: publish, text: '' });
				return;
			}
			attachNote = ' Files attached.';
		}

		const what = editingKind === 'post' ? 'Post' : 'Assignment';
		const where =
			mode === 'edit'
				? publish
					? 'updated and published'
					: 'updated (draft)'
				: `${publish ? 'published' : 'saved as a draft'} to ${targetIds.length} section${targetIds.length === 1 ? '' : 's'}`;
		const text = `${what} ${where}.${attachNote}`;

		if (mode === 'create') {
			postTitle = '';
			postBody = '';
			asgTitle = '';
			asgDescription = '';
			asgPoints = '';
			asgDue = '';
			asgCategory = '';
			resources = [];
		}
		msg = { ok: true, text };
		onsaved({ kind: editingKind, published: publish, text });
	}
</script>

<div class="composer" class:compact onpaste={onPaste}>
	{#if mode === 'create'}
		<div class="kind-toggle" role="tablist" aria-label="Content type">
			<button
				type="button"
				class="kind"
				class:active={kind === 'post'}
				onclick={() => (kind = 'post')}
			>
				Announcement
			</button>
			<button
				type="button"
				class="kind"
				class:active={kind === 'assignment'}
				onclick={() => (kind = 'assignment')}
			>
				Assignment
			</button>
		</div>
	{/if}

	{#if editingKind === 'post'}
		<label>
			<span>Title (optional)</span>
			<input type="text" bind:value={postTitle} placeholder="Welcome to class" />
		</label>
		<label>
			<span>Announcement</span>
			<textarea rows={compact ? 3 : 4} bind:value={postBody} placeholder="Share something with your class..."
			></textarea>
		</label>
	{:else}
		<label>
			<span>Title</span>
			<input type="text" bind:value={asgTitle} placeholder="Bridge sketch" />
		</label>
		<label>
			<span>Instructions (plain text)</span>
			<textarea rows={compact ? 4 : 5} bind:value={asgDescription} placeholder="What to do, step by step..."
			></textarea>
		</label>
		<div class="field-row">
			<label>
				<span>Points</span>
				<input type="number" min="0" max="10000" bind:value={asgPoints} placeholder="20" />
			</label>
			<label>
				<span>Due date</span>
				<input type="datetime-local" bind:value={asgDue} />
			</label>
			<label>
				<span>Grading category</span>
				<input type="text" bind:value={asgCategory} placeholder="Unit Labs" />
			</label>
		</div>
		<div class="resources-editor">
			<span class="mini-label">Linked materials</span>
			{#each resources as r, i (i)}
				<div class="resource-row">
					<input type="text" placeholder="Label" bind:value={r.label} />
					<input type="url" placeholder="https://..." bind:value={r.url} />
					<button
						type="button"
						class="btn secondary tiny"
						aria-label="Remove resource"
						onclick={() => (resources = resources.filter((_, j) => j !== i))}
					>
						&times;
					</button>
				</div>
			{/each}
			<button
				type="button"
				class="btn secondary tiny"
				onclick={() => (resources = [...resources, { label: '', url: '' }])}
			>
				+ Add link
			</button>
		</div>
	{/if}

	{#if attachmentsEnabled}
		<div class="attach-editor">
			<span class="mini-label">Files</span>
			<p class="hint">
				Attach a file, or press <kbd>Ctrl</kbd>+<kbd>V</kbd> to paste a screenshot straight in.
			</p>
			<input type="file" multiple class="file-input" onchange={pickFiles} />
			{#if pasteHint}
				<p class="feedback ok">{pasteHint}</p>
			{/if}
			{#if staged.length}
				<ul class="staged">
					{#each staged as f, i (i)}
						<li>
							<span class="staged-name">{f.name}</span>
							<span class="staged-size">{formatBytes(f.size)}</span>
							<button
								type="button"
								class="btn secondary tiny"
								onclick={() => (staged = staged.filter((_, j) => j !== i))}
							>
								&times;
							</button>
						</li>
					{/each}
				</ul>
				<p class="hint">Uploads when you save.</p>
			{/if}
			{#if mode === 'edit' && existing.length}
				<AttachmentList attachments={existing} onremove={removeExisting} removing={removingId} />
			{/if}
		</div>
	{/if}

	{#if mode === 'create'}
		<div class="target-picker">
			<span class="mini-label">Publish to</span>
			{#if sections.length === 0}
				<p class="hint">Create a section first.</p>
			{:else}
				<div class="target-list">
					{#each sections as s (s.id)}
						<label class="target-check">
							<input type="checkbox" bind:checked={targets[s.id]} />
							<span>{sectionTitle(s)}</span>
						</label>
					{/each}
				</div>
			{/if}
		</div>
	{/if}

	<div class="composer-actions">
		<button class="btn" type="button" disabled={busy} onclick={() => submit(true)}>
			{mode === 'edit' ? 'Save & publish' : 'Publish'}
		</button>
		<button class="btn secondary" type="button" disabled={busy} onclick={() => submit(false)}>
			Save draft
		</button>
		{#if oncancel}
			<button class="btn secondary" type="button" disabled={busy} onclick={() => oncancel?.()}>
				Cancel
			</button>
		{/if}
	</div>
	{#if msg}
		<p class="feedback" class:ok={msg.ok} class:error={!msg.ok}>{msg.text}</p>
	{/if}
</div>

<style>
	.composer {
		display: block;
	}
	.composer.compact {
		border: 1px solid var(--line-strong);
		border-radius: 6px;
		padding: 0.8rem 0.9rem;
		margin-top: 0.7rem;
		background: var(--bg2);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 0.5rem;
	}
	label > span,
	.mini-label {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		color: var(--dim);
	}
	input,
	textarea {
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 5px;
		color: var(--white);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		padding: 0.45rem 0.6rem;
		width: 100%;
		min-width: 0;
	}
	.composer.compact input,
	.composer.compact textarea {
		background: var(--bg1);
	}
	textarea {
		resize: vertical;
	}
	input:focus,
	textarea:focus {
		outline: 1px solid var(--focus-ring);
	}
	.field-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr));
		gap: 0.6rem;
	}
	.kind-toggle {
		display: flex;
		gap: 0.4rem;
		margin-bottom: 0.8rem;
	}
	.kind {
		appearance: none;
		background: var(--bg2);
		border: 1px solid var(--line);
		border-radius: 999px;
		color: var(--dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		padding: 0.3rem 0.9rem;
		cursor: pointer;
	}
	.kind.active {
		color: var(--green);
		border-color: var(--line-strong);
	}
	.resources-editor,
	.attach-editor {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin: 0.5rem 0 0.6rem;
	}
	.resource-row {
		display: grid;
		grid-template-columns: minmax(6rem, 1fr) minmax(8rem, 2fr) auto;
		gap: 0.4rem;
		align-items: center;
	}
	.hint {
		margin: 0;
		color: var(--dim);
		font-size: 0.78rem;
		line-height: 1.45;
	}
	kbd {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		border: 1px solid var(--line);
		border-radius: 3px;
		padding: 0 0.25rem;
		color: var(--cyan);
	}
	.file-input {
		font-size: 0.75rem;
		padding: 0.3rem 0;
		border: none;
		background: none;
	}
	.staged {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.staged li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.staged-name {
		font-size: 0.85rem;
		overflow-wrap: anywhere;
	}
	.staged-size {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.64rem;
		color: var(--dim);
	}
	.target-picker {
		margin: 0.6rem 0;
	}
	.target-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.9rem;
		margin-top: 0.35rem;
	}
	.target-check {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.35rem;
		margin: 0;
		cursor: pointer;
	}
	.target-check input {
		width: auto;
		accent-color: var(--green);
	}
	.target-check span {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: var(--white);
		letter-spacing: 0;
	}
	.composer-actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		margin-top: 0.4rem;
	}
	.feedback {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		padding: 0.4rem 0.65rem;
		border-radius: 5px;
		margin: 0.6rem 0 0;
	}
	.feedback.ok {
		color: var(--green);
		border: 1px solid var(--line-strong);
	}
	.feedback.error {
		color: var(--amber);
		border: 1px solid var(--amber);
	}
	:global(.btn.tiny),
	:global(.btn.secondary.tiny) {
		font-size: 0.65rem;
		padding: 0.28rem 0.6rem;
	}
	@media (max-width: 560px) {
		.resource-row {
			grid-template-columns: 1fr;
		}
	}
</style>
