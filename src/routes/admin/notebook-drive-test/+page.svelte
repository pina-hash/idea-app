<script lang="ts">
	/**
	 * Bare smoke-test form for the notebook Drive write path: one image + a
	 * label, POSTed to the existing /api/notebook/upload as custom_label only
	 * (no section_id / session_id -- none exist yet). Shows the raw outcome:
	 * entry id + Drive file id with a view-in-Drive link on success, the
	 * actual error text on failure.
	 */
	let { data } = $props();

	let file = $state<File | null>(null);
	let label = $state('');
	let busy = $state(false);
	let result = $state<{ entryId: string; fileId: string } | null>(null);
	let errorMsg = $state<string | null>(null);

	function onFileChange(e: Event) {
		file = (e.currentTarget as HTMLInputElement).files?.[0] ?? null;
	}

	async function submit(e: SubmitEvent) {
		e.preventDefault();
		if (!file || !label.trim() || busy) return;
		busy = true;
		result = null;
		errorMsg = null;
		try {
			const form = new FormData();
			form.set('photo', file);
			form.set('custom_label', label.trim());
			const res = await fetch('/api/notebook/upload', { method: 'POST', body: form });
			let body: { ok?: boolean; drive_file_id?: string; entry?: { entry_id?: string }; error?: string };
			try {
				body = await res.json();
			} catch {
				errorMsg = `The upload route answered ${res.status} with a non-JSON body.`;
				return;
			}
			if (!res.ok || !body.ok || !body.drive_file_id) {
				errorMsg = body.error ?? `The upload route answered ${res.status}.`;
				return;
			}
			result = { entryId: body.entry?.entry_id ?? '(no entry id returned)', fileId: body.drive_file_id };
		} catch (err) {
			errorMsg = (err as Error).message || 'The request failed to send.';
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Notebook Drive test</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="wrap">
	<h1>Notebook Drive upload test</h1>
	<p class="dim">
		Smoke test of the Drive write path: one image through the real
		<code>/api/notebook/upload</code>, as a custom-label entry (no section or session).
		<a href="/admin">Back to /admin</a>
	</p>

	{#if !data.driveConfigured}
		<p class="err">
			The Drive integration is not configured (GOOGLE_OAUTH_CLIENT_ID /
			GOOGLE_OAUTH_CLIENT_SECRET / GOOGLE_DRIVE_REFRESH_TOKEN). The upload will answer 503.
			Connect it at <a href="/admin/drive-connect">/admin/drive-connect</a> first.
		</p>
	{/if}

	<form onsubmit={submit}>
		<label>
			Photo (JPEG / PNG / WebP / HEIC, max 4 MB)
			<input type="file" accept="image/jpeg,image/png,image/webp,image/heic" onchange={onFileChange} required />
		</label>
		<label>
			Label (stored as custom_label)
			<input type="text" bind:value={label} maxlength="200" placeholder="Drive smoke test" required />
		</label>
		<button type="submit" disabled={busy || !file || !label.trim()}>
			{busy ? 'Uploading…' : 'Upload'}
		</button>
	</form>

	{#if result}
		<div class="ok">
			<p><strong>Uploaded.</strong></p>
			<p>Entry id: <code>{result.entryId}</code></p>
			<p>Drive file id: <code>{result.fileId}</code></p>
			<p>
				<a href={`https://drive.google.com/file/d/${result.fileId}/view`} target="_blank" rel="noopener noreferrer">
					View the file in Drive
				</a>
				(confirm it by eye; if Drive says the file does not exist, the upload did not really land)
			</p>
		</div>
	{:else if errorMsg}
		<div class="err">
			<p><strong>Failed.</strong></p>
			<p>{errorMsg}</p>
		</div>
	{/if}
</main>

<style>
	.wrap {
		max-width: 40rem;
		margin: 3rem auto;
		padding: 0 1rem;
		color: var(--white, #e8ffe8);
		font-family: Rajdhani, sans-serif;
	}
	h1 {
		font-size: 1.4rem;
	}
	.dim {
		color: var(--dim, #7a8a7a);
	}
	form {
		display: grid;
		gap: 0.9rem;
		margin: 1.4rem 0;
		padding: 1rem;
		border: 1px solid var(--line, #1e2e1e);
		border-radius: 8px;
	}
	label {
		display: grid;
		gap: 0.3rem;
		font-size: 0.95rem;
	}
	input {
		background: var(--bg1, #0d120d);
		color: inherit;
		border: 1px solid var(--line, #1e2e1e);
		border-radius: 6px;
		padding: 0.5rem;
		font: inherit;
	}
	button {
		justify-self: start;
		padding: 0.5rem 1.2rem;
		background: var(--green, #00ff41);
		color: #041004;
		border: 0;
		border-radius: 6px;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.ok,
	.err {
		border: 1px solid;
		border-radius: 8px;
		padding: 0.8rem 1rem;
		margin-top: 1rem;
		overflow-wrap: anywhere;
	}
	.ok {
		border-color: var(--green, #00ff41);
	}
	.err {
		border-color: var(--crimson, #ff3355);
		color: var(--crimson, #ff3355);
	}
	code {
		font-family: 'Share Tech Mono', monospace;
	}
	a {
		color: var(--cyan, #00f0ff);
	}
</style>
