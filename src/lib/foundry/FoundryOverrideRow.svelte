<script lang="ts">
	/**
	 * ONE RELEASE'S GALLERY DETAILS (ledger 0380, report c5f811e4): the title,
	 * the description and the thumbnail an admin shows on its gallery card
	 * instead of the repo's or the student's own. Each field is saved on its own
	 * terms: a box left EMPTY falls back to the default, and Use default says
	 * so in words. The thumbnail is uploaded first (the caller's transport) and
	 * the path it returns is what is saved.
	 *
	 * The student's app record is never what changes, and the row says so.
	 */
	import type { FoundryGalleryOverride } from './gallery-extras.ts';

	type Outcome = { ok: true } | { ok: false; message: string };

	let {
		subject,
		name,
		defaults,
		override,
		coverUrl,
		save,
		upload
	}: {
		subject: string;
		/** What the row is called in the editor. */
		name: string;
		/** What the card says with no override: the repo's or the student's own words. */
		defaults: { title: string; description: string | null };
		override: FoundryGalleryOverride | undefined;
		coverUrl: (path: string) => string | null;
		save: (
			subject: string,
			fields: { title: string | null; description: string | null; thumbnail_path: string | null }
		) => Promise<Outcome>;
		upload?: (file: File) => Promise<{ ok: true; path: string } | { ok: false; message: string }>;
	} = $props();

	// Seeded once from the prop; a fresh load remounts the row (its parent keys
	// the list on the subject and the saved fields), so these never need to
	// follow the prop after mount.
	/* svelte-ignore state_referenced_locally */
	let title = $state(override?.title ?? '');
	/* svelte-ignore state_referenced_locally */
	let description = $state(override?.description ?? '');
	/* svelte-ignore state_referenced_locally */
	let thumb = $state<string | null>(override?.thumbnail_path ?? null);
	let busy = $state(false);
	let note = $state<string | null>(null);
	let isProblem = $state(false);
	const preview = $derived(thumb ? coverUrl(thumb) : null);
	const uid = `fdy-ovr-${Math.random().toString(36).slice(2, 8)}`;

	async function persist(fields: { title: string; description: string; thumb: string | null }, done: string) {
		busy = true;
		note = null;
		try {
			const r = await save(subject, {
				title: fields.title.trim() || null,
				description: fields.description.trim() || null,
				thumbnail_path: fields.thumb
			});
			isProblem = !r.ok;
			note = r.ok ? done : r.message;
		} catch {
			isProblem = true;
			note = 'Could not reach the server. Try again.';
		} finally {
			busy = false;
		}
	}

	async function pick(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file || !upload) return;
		busy = true;
		note = null;
		try {
			const r = await upload(file);
			if (!r.ok) {
				isProblem = true;
				note = r.message;
				return;
			}
			thumb = r.path;
		} catch {
			isProblem = true;
			note = 'The picture did not upload. Try again.';
		} finally {
			busy = false;
		}
	}
</script>

<li class="fdy-ovr" data-testid="foundry-override-row" data-subject={subject}>
	<h4 class="fdy-ovr-name">{name}</h4>
	<div class="fdy-ovr-field">
		<label for="{uid}-t">Title</label>
		<input id="{uid}-t" type="text" maxlength="80" placeholder={defaults.title} bind:value={title} />
	</div>
	<div class="fdy-ovr-field">
		<label for="{uid}-d">Description</label>
		<textarea id="{uid}-d" rows="2" maxlength="300" placeholder={defaults.description ?? ''} bind:value={description}></textarea>
	</div>
	<div class="fdy-ovr-field">
		<span class="fdy-ovr-label">Thumbnail</span>
		<div class="fdy-ovr-thumb">
			{#if preview}
				<img class="fdy-ovr-img" src={preview} alt="The thumbnail chosen for {name}" />
			{:else}
				<span class="fdy-ovr-none">Using the default picture.</span>
			{/if}
			{#if upload}
				<label class="btn tap-44 fdy-ovr-file">
					Choose a picture
					<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onchange={pick} disabled={busy} />
				</label>
			{/if}
			{#if thumb}
				<button type="button" class="btn tap-44" disabled={busy} onclick={() => (thumb = null)}>Use default picture</button>
			{/if}
		</div>
	</div>
	<div class="fdy-ovr-actions">
		<button
			type="button"
			class="btn tap-44"
			disabled={busy}
			data-testid="foundry-override-save"
			onclick={() => persist({ title, description, thumb }, 'Saved. The gallery card shows these now.')}
		>
			Save
		</button>
		<button
			type="button"
			class="btn tap-44"
			disabled={busy}
			data-testid="foundry-override-reset"
			onclick={() => {
				title = '';
				description = '';
				thumb = null;
				void persist({ title: '', description: '', thumb: null }, 'Back to the defaults.');
			}}
		>
			Use all defaults
		</button>
	</div>
	{#if note}
		<p class="fdy-ovr-note" class:is-problem={isProblem} role="status">{note}</p>
	{/if}
</li>

<style>
	.fdy-ovr {
		display: flex;
		flex-direction: column;
		gap: var(--space-2, 0.5rem);
		padding: var(--space-3, 0.75rem);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		list-style: none;
		min-width: 0;
	}
	.fdy-ovr-name {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.05rem;
		color: var(--text-1);
	}
	.fdy-ovr-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	.fdy-ovr-field label,
	.fdy-ovr-label {
		color: var(--text-2);
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
	}
	.fdy-ovr-field input[type='text'],
	.fdy-ovr-field textarea {
		min-height: 44px;
		box-sizing: border-box;
		padding: 0.5rem 0.6rem;
		background: var(--surface-2);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		color: var(--text-1);
		font-family: var(--font-display);
		font-size: 0.95rem;
	}
	.fdy-ovr-thumb {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-2, 0.5rem);
	}
	.fdy-ovr-img {
		width: 9rem;
		aspect-ratio: 1.5;
		object-fit: cover;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
	}
	.fdy-ovr-none {
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.fdy-ovr-file input {
		position: absolute;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.fdy-ovr-file {
		position: relative;
		cursor: pointer;
	}
	.fdy-ovr-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2, 0.5rem);
	}
	.fdy-ovr-note {
		margin: 0;
		color: var(--text-1);
		font-size: 0.9rem;
	}
	.fdy-ovr-note.is-problem {
		color: var(--amber);
	}
</style>
