<script lang="ts">
	/**
	 * HTML LESSONS for a certification: the stored lessons as rows (slug,
	 * title, when, a two-step Delete the server refuses while the revision
	 * names the slug), and a form that saves one: slug, title, the document
	 * from a file read as text (2 MiB cap) or typed into the textarea.
	 *
	 * VALIDATED CLIENT-SIDE WITH THE HTML ASSIGNMENT ENGINE'S OWN VALIDATOR,
	 * never a copy: `validateHtmlManifest` runs only when the document carries
	 * a manifest block (a lesson with nothing to answer has none), and
	 * `documentScripts` must mention `idea:ready` or the editor refuses in
	 * words, because a document that never sends the handshake cannot talk to
	 * the portal. The server stores the manifest after its own object check.
	 */
	import { documentScripts, extractManifestScript, validateHtmlManifest } from '$lib/classroom/html-assignment/manifest';
	import { formatCertDateTime } from '$lib/certifications/status';
	import { LESSON_FILE_MAX_BYTES, LESSON_READY_MESSAGE, LESSON_READY_REFUSAL, LESSON_TOO_LARGE, type DeskFormResult, type LessonRow } from './desk';
	import ConfirmKey from './ConfirmKey.svelte';

	let {
		lessons,
		usedSlugs = [],
		saveResult = null,
		deleteResult = null
	}: {
		lessons: LessonRow[];
		/** Slugs the current revision's training items name; those cannot be deleted. */
		usedSlugs?: string[];
		saveResult?: DeskFormResult | null;
		deleteResult?: DeskFormResult | null;
	} = $props();

	let slug = $state('');
	let title = $state('');
	let document_ = $state('');
	let fileProblem = $state<string | null>(null);

	const slugOk = $derived(/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug.trim()));
	const problems = $derived.by(() => {
		const out: string[] = [];
		if (!slugOk) out.push('The slug is lowercase letters, digits and hyphens, up to 64 characters.');
		if (!title.trim()) out.push('A title is required.');
		if (!document_.trim()) out.push('The document is empty.');
		else {
			if (!documentScripts(document_).includes(LESSON_READY_MESSAGE)) out.push(LESSON_READY_REFUSAL);
			if (extractManifestScript(document_).count > 0) {
				const check = validateHtmlManifest(document_);
				out.push(...check.errors);
			}
		}
		if (fileProblem) out.push(fileProblem);
		return out;
	});
	const canSave = $derived(problems.length === 0);

	async function pick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		if (file.size > LESSON_FILE_MAX_BYTES) {
			fileProblem = LESSON_TOO_LARGE(file.size);
			return;
		}
		fileProblem = null;
		document_ = await file.text();
		if (!slug.trim()) slug = file.name.replace(/\.html?$/i, '').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64);
		if (!title.trim()) {
			const m = /<title[^>]*>([^<]*)<\/title>/i.exec(document_);
			if (m) title = m[1].trim();
		}
	}
</script>

<div class="dk-lessons" data-testid="cert-lessons">
	<h4 class="cert-section-h">Stored lessons</h4>
	{#if deleteResult}
		<p class="cert-notice {deleteResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-lesson-delete-result">
			<span class="cert-notice-glyph" aria-hidden="true">{deleteResult.ok ? '✓' : '!'}</span>
			<span>{deleteResult.message}</span>
		</p>
	{/if}
	{#if lessons.length === 0}
		<p class="dk-empty" data-testid="cert-lessons-none">No lesson is stored for this certification yet.</p>
	{:else}
		<ul class="cert-well">
			{#each lessons as l (l.id)}
				<li class="dk-row" data-testid="cert-lesson-row">
					<div class="dk-row-main">
						<strong>{l.title}</strong>
						<span class="dk-row-meta">lesson:{l.slug}</span>
						{#if l.updated_at}<span class="dk-row-meta">updated {formatCertDateTime(l.updated_at)}</span>{/if}
						{#if usedSlugs.includes(l.slug)}<span class="cert-readout is-ok"><span aria-hidden="true">✓</span>In the training list</span>{/if}
					</div>
					<form method="post" action="?/deleteLesson" class="cert-actions">
						<input type="hidden" name="slug" value={l.slug} />
						{#if usedSlugs.includes(l.slug)}
							<span class="dk-held" data-testid="cert-lesson-in-use">Remove it from the training list and save before deleting it.</span>
						{:else}
							<ConfirmKey word="Delete lesson" confirmWord="Delete {l.slug}" cost="The lesson's document is removed for good. Students' progress on it is kept as a record but points at nothing." danger={true} testId="cert-lesson-delete" />
						{/if}
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	<h4 class="cert-section-h">Save a lesson</h4>
	<form method="post" action="?/saveLesson" class="dk-fields" data-testid="cert-lesson-form" onsubmit={(e) => { if (!canSave) e.preventDefault(); }}>
		<label class="cert-field"><span>Slug</span><input type="text" name="slug" bind:value={slug} placeholder="tramming" /></label>
		<label class="cert-field"><span>Title</span><input type="text" name="title" bind:value={title} placeholder="Tramming the head" /></label>
		<label class="cert-field dk-wide"><span>HTML file (read into the box below; up to 2 MiB)</span><input type="file" accept=".html,.htm,text/html" onchange={pick} data-testid="cert-lesson-file" /></label>
		<label class="cert-field dk-wide"><span>Document</span><textarea name="document" rows="12" bind:value={document_} spellcheck="false" data-testid="cert-lesson-document"></textarea></label>
		{#if problems.length && (document_.trim() || slug.trim() || title.trim())}
			<ul class="cert-well dk-wide" data-testid="cert-lesson-problems">
				{#each problems as p, i (i)}<li class="dk-file-row"><span>{p}</span></li>{/each}
			</ul>
		{/if}
		<div class="cert-actions dk-wide">
			<button type="submit" class="btn cert-btn" aria-disabled={canSave ? undefined : 'true'} data-testid="cert-lesson-save">Save lesson</button>
			{#if !canSave}<span class="dk-held">The lesson saves once every line above is answered.</span>{/if}
		</div>
		{#if saveResult}
			<p class="cert-notice dk-wide {saveResult.ok ? 'cert-notice-ok' : 'cert-notice-bad'}" role="status" data-testid="cert-lesson-save-result">
				<span class="cert-notice-glyph" aria-hidden="true">{saveResult.ok ? '✓' : '!'}</span>
				<span>{saveResult.message}</span>
			</p>
		{/if}
	</form>
</div>
