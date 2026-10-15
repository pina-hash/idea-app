<script lang="ts">
	/**
	 * The evidence picker for one photo or file item (ledger 0391): a plain
	 * picker with NO `accept` (the classroom's rule: any file type, and the
	 * bucket's size cap is the only gate), a camera key beside it for a photo
	 * item (`capture="environment"` is what opens a phone's camera at all, and
	 * it only ever sits BESIDE the unfiltered picker), each file's own state in
	 * words (uploading, landed, refused with the reason and a Retry), and a
	 * Remove key per landed file. The upload itself is the injected
	 * `EvidenceUploader`; absent, the picker is not offered.
	 *
	 * A failed file stays staged and names its gate; only what LANDED reaches
	 * the form's value (`onchange`), so one refusal never discards the rest.
	 */
	import Pending from '$lib/Pending.svelte';
	import type { CertEvidenceFile } from '$lib/certifications/types';
	import { formatBytesShort } from '$lib/classroom/upload-errors';
	import type { EvidenceUploader } from './evidence-upload';

	let {
		label,
		kind,
		files,
		upload,
		onchange
	}: {
		label: string;
		kind: 'photo' | 'file';
		files: CertEvidenceFile[];
		upload: EvidenceUploader | null;
		onchange: (files: CertEvidenceFile[]) => void;
	} = $props();

	interface Staged {
		key: number;
		file: File;
		state: 'uploading' | 'failed';
		message: string | null;
		retryable: boolean;
	}
	let staged = $state<Staged[]>([]);
	let nextKey = 0;
	const inputId = $props.id();

	async function send(entry: Staged) {
		if (!upload) return;
		entry.state = 'uploading';
		entry.message = null;
		const outcome = await upload(entry.file);
		if (outcome.ok) {
			staged = staged.filter((s) => s.key !== entry.key);
			onchange([...files, outcome.file]);
		} else {
			entry.state = 'failed';
			entry.message = outcome.message;
			entry.retryable = outcome.retryable;
		}
	}

	function picked(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const list = Array.from(input.files ?? []);
		input.value = '';
		for (const file of list) {
			const entry: Staged = { key: nextKey++, file, state: 'uploading', message: null, retryable: true };
			staged = [...staged, entry];
			void send(staged[staged.length - 1]);
		}
	}

	function remove(path: string) {
		onchange(files.filter((f) => f.path !== path));
	}
	function discard(key: number) {
		staged = staged.filter((s) => s.key !== key);
	}
</script>

<div class="cert-uploader" data-testid="cert-evidence-uploader" data-kind={kind}>
	{#if upload}
		<div class="cert-actions">
			<label class="btn secondary cert-btn cert-uploader-pick" for={`pick-${inputId}`}>
				{kind === 'photo' ? 'Choose photos' : 'Choose files'}
				<input id={`pick-${inputId}`} class="cert-uploader-input" type="file" multiple onchange={picked} data-testid="cert-evidence-input" />
			</label>
			{#if kind === 'photo'}
				<label class="btn secondary cert-btn cert-uploader-pick" for={`cam-${inputId}`} data-testid="cert-evidence-camera">
					Take a photo
					<input id={`cam-${inputId}`} class="cert-uploader-input" type="file" accept="image/*" capture="environment" onchange={picked} data-testid="cert-evidence-camera-input" />
				</label>
			{/if}
		</div>
	{:else}
		<p class="cert-help">Sign in to add {kind === 'photo' ? 'photos' : 'files'}.</p>
	{/if}

	{#if files.length > 0 || staged.length > 0}
		<ul class="cert-well cert-uploader-list" aria-label={`${label}: files`}>
			{#each files as f (f.path)}
				<li class="cert-uploader-row" data-testid="cert-evidence-file" data-state="landed">
					<span class="cert-tone-ok" aria-hidden="true">✓</span>
					<span class="cert-uploader-name">{f.name}</span>
					<span class="cert-readout">{formatBytesShort(f.size)}</span>
					<button type="button" class="btn secondary cert-btn cert-uploader-key" onclick={() => remove(f.path)} data-testid="cert-evidence-remove">Remove</button>
				</li>
			{/each}
			{#each staged as s (s.key)}
				<li class="cert-uploader-row" data-testid="cert-evidence-file" data-state={s.state}>
					{#if s.state === 'uploading'}
						<span class="cert-uploader-name">{s.file.name}</span>
						<Pending label={`Uploading ${formatBytesShort(s.file.size)}`} variant="inline" />
					{:else}
						<span class="cert-tone-bad" aria-hidden="true">✕</span>
						<span class="cert-uploader-name">{s.file.name}</span>
						<span class="cert-uploader-why cert-tone-bad" role="alert">{s.message}</span>
						{#if s.retryable}
							<button type="button" class="btn secondary cert-btn cert-uploader-key" onclick={() => send(s)} data-testid="cert-evidence-retry">Retry</button>
						{/if}
						<button type="button" class="btn secondary cert-btn cert-uploader-key" onclick={() => discard(s.key)}>Discard</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.cert-uploader {
		display: grid;
		gap: 0.5rem;
	}
	.cert-uploader-pick {
		position: relative;
		overflow: hidden;
		cursor: pointer;
	}
	/* The real input covers the whole key, so a click, a tap and a keyboard
	   activation all reach it; it is not display:none, which would take it out
	   of the tab order. */
	.cert-uploader-input {
		position: absolute;
		inset: 0;
		opacity: 0;
		width: 100%;
		height: 100%;
		cursor: pointer;
	}
	.cert-uploader-list {
		margin: 0;
	}
	.cert-uploader-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.6rem;
		min-height: 44px;
		padding: 0.35rem 0;
	}
	.cert-uploader-name {
		flex: 1 1 10rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.cert-uploader-why {
		flex-basis: 100%;
		font-size: 0.9rem;
		line-height: 1.4;
	}
	.cert-uploader-key {
		padding-inline: 0.8rem;
	}
</style>
