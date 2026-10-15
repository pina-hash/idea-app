<script lang="ts">
	/**
	 * PACKAGE IMPORT, IN TWO STEPS (PACKAGE_FORMAT.md "Import behavior"): a
	 * file box for the ZIP; step 1 posts it to `CERT_API.packageImport`
	 * WITHOUT confirm and renders the problems, the summary and the diff;
	 * step 2, Import, posts the same file with `confirm=1` and navigates to
	 * the editor. A problem list holds the Import key, in words. The transport
	 * is injected so the harness answers in memory.
	 */
	import { goto } from '$app/navigation';
	import { deskEngineHref } from '$lib/certifications/nav';
	import type { ImportAnswer } from './desk';
	import PackageDiff from './PackageDiff.svelte';

	let {
		send = defaultSend,
		initial = null
	}: {
		send?: (form: FormData) => Promise<ImportAnswer>;
		/** A harness's pre-answered step 1. */
		initial?: ImportAnswer | null;
	} = $props();

	async function defaultSend(form: FormData): Promise<ImportAnswer> {
		try {
			const res = await fetch('/api/certifications/package/import', { method: 'POST', body: form });
			const body = (await res.json().catch(() => null)) as ImportAnswer | null;
			if (!body) return { ok: false, message: `The server answered HTTP ${res.status} with no body.` };
			return body;
		} catch (e) {
			return { ok: false, message: (e as Error)?.message || 'The server could not be reached.' };
		}
	}

	let file = $state<File | null>(null);
	// svelte-ignore state_referenced_locally
	let answer = $state<ImportAnswer | null>(initial);
	let busy = $state(false);
	// svelte-ignore state_referenced_locally
	let fileName = $state(initial ? `${initial.summary?.code ?? 'package'}.idea-certification.zip` : '');

	const problems = $derived(answer?.problems ?? []);
	const canCheck = $derived(!!file && !busy);
	const canImport = $derived(!!answer && answer.ok && problems.length === 0 && (!!file || !!initial) && !busy);

	function pick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		file = input.files?.[0] ?? null;
		fileName = file?.name ?? '';
		answer = null;
	}

	async function step(confirm: boolean) {
		if (!file) return;
		busy = true;
		try {
			const form = new FormData();
			form.set('file', file);
			if (confirm) form.set('confirm', '1');
			if (confirm && answer?.summary?.existing_id) form.set('id', answer.summary.existing_id);
			const result = await send(form);
			if (confirm && result.ok && result.id) {
				await goto(deskEngineHref(result.id));
				return;
			}
			answer = result;
		} finally {
			busy = false;
		}
	}
</script>

<div class="dk-import" data-testid="cert-import">
	<section class="cert-panel" id="file" aria-labelledby="cert-import-file-h">
		<h2 id="cert-import-file-h">The package</h2>
		<p class="cert-help">One ZIP in the IDEA certification package format (version 1): certification.json plus one file per kit part. An existing code becomes a new revision; a new code becomes a draft. Nothing is published by importing.</p>
		<label class="cert-field">
			<span>Package ZIP</span>
			<input type="file" accept=".zip,application/zip" onchange={pick} data-testid="cert-import-file" />
		</label>
		<div class="cert-actions">
			<button type="button" class="btn cert-btn" aria-disabled={canCheck ? undefined : 'true'} onclick={() => canCheck && step(false)} data-testid="cert-import-check">{busy ? 'Checking' : 'Check the package'}</button>
			{#if fileName}<span class="dk-row-meta">{fileName}</span>{/if}
		</div>
	</section>

	{#if answer}
		<section class="cert-panel" id="result" aria-labelledby="cert-import-result-h" data-testid="cert-import-result">
			<h2 id="cert-import-result-h">What the portal found</h2>
			{#if answer.message && !answer.summary}
				<p class="cert-notice cert-notice-bad" role="alert" data-testid="cert-import-refusal">
					<span class="cert-notice-glyph" aria-hidden="true">!</span>
					<span>{answer.message}</span>
				</p>
			{/if}
			{#if problems.length}
				<h3 class="cert-section-h">Problems</h3>
				<ul class="cert-well" data-testid="cert-import-problems">
					{#each problems as p, i (i)}<li class="dk-file-row"><span>{p}</span></li>{/each}
				</ul>
			{/if}
			{#if answer.summary}
				<dl class="cert-facts" data-testid="cert-import-summary">
					<dt>Code</dt><dd>{answer.summary.code}</dd>
					<dt>Name</dt><dd>{answer.summary.name}</dd>
					<dt>Outcome</dt><dd>{answer.summary.existing ? `A new revision of an existing certification (revision ${answer.summary.current_revision ?? '?'} today)` : 'A new draft'}</dd>
					<dt>Questions</dt><dd>{answer.summary.questions}</dd>
					<dt>Lessons</dt><dd>{answer.summary.lessons}</dd>
					<dt>Training items</dt><dd>{answer.summary.training_items}</dd>
					<dt>Changes</dt><dd>{answer.summary.changes}</dd>
				</dl>
				<h3 class="cert-section-h">Diff against the current revision</h3>
				<PackageDiff changes={answer.diff ?? []} />
			{/if}
			<div class="cert-actions">
				<button type="button" class="btn cert-btn" aria-disabled={canImport ? undefined : 'true'} onclick={() => canImport && step(true)} data-testid="cert-import-confirm">{busy ? 'Importing' : 'Import'}</button>
				{#if !canImport && problems.length}<span class="dk-held" data-testid="cert-import-held">Fix the problems above and check the package again.</span>{/if}
			</div>
		</section>
	{/if}
</div>
