<script lang="ts" module>
	/** The two calls the editor makes. Handed in by the route only for an admin; absent, nothing is drawn. */
	export interface FoundryCoverTransports {
		/** Puts a picture in foundry-covers, in the admin's own folder. */
		uploadImage(file: File): Promise<{ ok: true; path: string } | { ok: false; message: string }>;
		/** `foundry_cover_set`: 'image' with a path, 'html' with the document, or 'clear'. */
		setCover(
			appId: string,
			kind: 'image' | 'html' | 'clear',
			value?: string
		): Promise<{ ok: true } | { ok: false; message: string }>;
	}
</script>

<script lang="ts">
	import { FOUNDRY_COVER_HTML_MAX, FOUNDRY_COVER_SANDBOX, looksLikeHtmlCover } from './html-cover.ts';

	/**
	 * REPLACE A GAME'S COVER, FROM ITS GALLERY CARD (ledger 0422, feedback
	 * 1cc58a6e). An admin opens a card and this sits above the student's page,
	 * beside the door to the review controls, never inside `FoundryDetail`
	 * (the one render path the review queue shares has no staff branch).
	 *
	 * A picture, or an HTML cover (animated or interactive), or back to the
	 * student's own. The change is the gallery's presentation (0291's override
	 * layer): the student's own record is never touched, so "back" is always
	 * there. The preview frames the HTML cover exactly as the card does, with
	 * the pointer live, so what is saved is what was tried.
	 */
	let {
		app,
		imageUrl = null,
		htmlUrl = null,
		overridden = false,
		transports,
		onchanged
	}: {
		app: { id: string; title: string };
		/** The picture the card shows now (an override's, else the student's). */
		imageUrl?: string | null;
		/** The HTML cover's frame address, or null. */
		htmlUrl?: string | null;
		/** Whether an admin's cover is in force, so "back to the student's" means something. */
		overridden?: boolean;
		transports: FoundryCoverTransports;
		onchanged?: () => void;
	} = $props();

	let busy = $state(false);
	let message = $state<{ tone: 'ok' | 'err'; text: string } | null>(null);
	let pasted = $state('');

	async function run(step: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string) {
		busy = true;
		message = null;
		try {
			const out = await step();
			if (out.ok) {
				message = { tone: 'ok', text: done };
				onchanged?.();
			} else message = { tone: 'err', text: out.message };
		} catch {
			message = { tone: 'err', text: 'Could not reach the server. Try again.' };
		} finally {
			busy = false;
		}
	}

	function pickedImage(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			message = { tone: 'err', text: 'That is not a picture. Use a PNG, JPG, GIF or WebP.' };
			return;
		}
		void run(async () => {
			const up = await transports.uploadImage(file);
			if (!up.ok) return up;
			return transports.setCover(app.id, 'image', up.path);
		}, 'The picture is now this game’s cover.');
	}

	async function saveHtml(text: string, filename = 'cover.html') {
		if (!text.trim()) {
			message = { tone: 'err', text: 'The HTML cover is empty.' };
			return;
		}
		if (!looksLikeHtmlCover(filename, text)) {
			message = { tone: 'err', text: 'That does not look like HTML. Start it with <!doctype html> or a tag.' };
			return;
		}
		if (text.length > FOUNDRY_COVER_HTML_MAX) {
			message = { tone: 'err', text: 'An HTML cover can be at most 200,000 characters.' };
			return;
		}
		await run(() => transports.setCover(app.id, 'html', text), 'The HTML cover is live on the card.');
		if (message?.tone === 'ok') pasted = '';
	}

	async function pickedHtml(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		await saveHtml(await file.text(), file.name);
	}
</script>

<section class="fce card" aria-labelledby="fce-h-{app.id}" data-testid="foundry-cover-editor">
	<header class="fce-head">
		<h2 id="fce-h-{app.id}">Cover</h2>
		<span class="fce-sub">What this game's card shows in the gallery. The student's own cover stays theirs.</span>
	</header>

	<div class="fce-body">
		<div class="fce-preview" data-testid="fce-preview">
			{#if htmlUrl}
				<iframe
					class="fce-frame"
					src={htmlUrl}
					title="{app.title} cover preview"
					sandbox={FOUNDRY_COVER_SANDBOX}
					referrerpolicy="no-referrer"
					data-testid="fce-frame"
				></iframe>
				<span class="fce-tag">HTML cover</span>
			{:else if imageUrl}
				<img class="fce-img" src={imageUrl} alt="{app.title} cover" />
				<span class="fce-tag">{overridden ? 'Your picture' : 'Student’s cover'}</span>
			{:else}
				<span class="fce-none">No cover yet. The card draws the game's name.</span>
			{/if}
		</div>

		<div class="fce-keys">
			<label class="btn secondary fce-key" class:disabled={busy}>
				<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" onchange={pickedImage} disabled={busy} data-testid="fce-image" />
				Replace with a picture
			</label>
			<label class="btn secondary fce-key" class:disabled={busy}>
				<input type="file" accept=".html,.htm,text/html" onchange={pickedHtml} disabled={busy} data-testid="fce-html-file" />
				Replace with an HTML file
			</label>
			<details class="fce-paste">
				<summary class="fce-summary">Or paste HTML</summary>
				<textarea
					class="fce-text"
					bind:value={pasted}
					rows="6"
					spellcheck="false"
					placeholder="<!doctype html> ..."
					aria-label="HTML cover"
					data-testid="fce-html-text"
				></textarea>
				<button class="btn fce-key" type="button" disabled={busy || !pasted.trim()} onclick={() => saveHtml(pasted)} data-testid="fce-html-save">Use this HTML</button>
			</details>
			{#if overridden}
				<button class="btn secondary fce-key" type="button" disabled={busy} onclick={() => run(() => transports.setCover(app.id, 'clear'), 'The student’s own cover is back.')} data-testid="fce-clear">
					Back to the student's cover
				</button>
			{/if}
			<p class="fce-note">An HTML cover runs in a sealed frame on a separate address: it can animate and react to the pointer, and it cannot read anyone's account, cookies or this page, or reach the internet. Pictures go inside it as data: addresses.</p>
		</div>
	</div>

	{#if message}
		<p class="fce-msg" class:err={message.tone === 'err'} role={message.tone === 'err' ? 'alert' : 'status'} data-testid="fce-msg">{message.text}</p>
	{/if}
</section>

<style>
	.fce {
		margin: 0 0 1rem;
		padding: 1rem 1.1rem 1.1rem;
		display: flex;
		flex-direction: column;
		gap: 0.8rem;
	}
	.fce-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.3rem 0.9rem;
	}
	.fce-head h2 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.85rem;
		font-weight: 400;
		letter-spacing: 0.16em;
		text-transform: uppercase;
	}
	.fce-sub,
	.fce-note {
		color: var(--text-2, var(--dim));
		font-size: 0.92rem;
		margin: 0;
	}
	.fce-body {
		display: grid;
		grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
		gap: 1rem;
		align-items: start;
	}
	@media (max-width: 720px) {
		.fce-body {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.fce-preview {
		position: relative;
		aspect-ratio: 1.5;
		border-radius: var(--radius-sm, 6px);
		overflow: hidden;
		background: var(--plate-well-face, var(--bg0));
		box-shadow:
			inset 0 1px 3px var(--plate-inset-shade, rgba(0, 0, 0, 0.5)),
			0 0 0 1px var(--line);
		display: grid;
		place-items: center;
	}
	.fce-frame,
	.fce-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		display: block;
	}
	.fce-img {
		object-fit: cover;
	}
	.fce-tag {
		position: absolute;
		left: 0.5rem;
		bottom: 0.5rem;
		padding: 0.15rem 0.5rem;
		border-radius: 4px;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #ece8e0;
		background: rgba(10, 12, 11, 0.78);
		pointer-events: none;
	}
	.fce-none {
		color: var(--text-2, var(--dim));
		padding: 1rem;
		text-align: center;
	}
	.fce-keys {
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
		min-width: 0;
	}
	.fce-key {
		min-height: 44px;
		justify-content: center;
		position: relative;
		cursor: pointer;
	}
	.fce-key input[type='file'] {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.fce-key.disabled {
		opacity: 0.6;
		pointer-events: none;
	}
	.fce-paste {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	.fce-summary {
		min-height: 44px;
		display: flex;
		align-items: center;
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--text-2, var(--dim));
	}
	.fce-text {
		width: 100%;
		font-family: var(--font-mono);
		font-size: 0.82rem;
		margin-bottom: 0.5rem;
	}
	.fce-msg {
		margin: 0;
		color: var(--green);
	}
	.fce-msg.err {
		color: var(--amber);
	}
</style>
