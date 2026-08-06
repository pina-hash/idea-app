<script lang="ts">
	import { untrack } from 'svelte';
	import '$lib/tournaments/tournaments-theme.css';
	import BadgeIcon from './BadgeIcon.svelte';
	import EntryBanner from './EntryBanner.svelte';
	import type { TournamentEntry } from './tournaments';
	import {
		ACCENT_PRESETS,
		BADGES,
		FLOURISHES,
		EMPTY_STYLE,
		type EntryStyle,
		type EntryStyleDraft
	} from './entry-styles';

	/**
	 * The banner customization panel. Presentation + callbacks only (the
	 * Garage / RewardRulesEditor convention): it holds the draft, the caller
	 * owns the RPC and the upload. Chrome uses the tournament system palette
	 * (.tnm-root), with exactly ONE emerald element on the panel -- Save.
	 * Everything the STUDENT picks is their own palette and is not
	 * constrained by the system one.
	 */
	let {
		entry,
		style = null,
		busy = false,
		error = '',
		note = '',
		onsave,
		onupload = null
	}: {
		entry: TournamentEntry;
		style?: EntryStyle | null;
		busy?: boolean;
		error?: string;
		note?: string;
		onsave: (draft: EntryStyleDraft) => void;
		/** Uploads a background image and resolves its public https URL. */
		onupload?: ((file: File) => Promise<string>) | null;
	} = $props();

	type BgMode = 'none' | 'solid' | 'gradient' | 'image';

	// Defaults for a background the student has not configured yet. Chosen off
	// the neutral end of the wheel, never emerald, so nothing is pre-selected
	// toward the system palette.
	let bgMode = $state<BgMode>('none');
	let solid = $state('#3e7bfa');
	let gradA = $state('#3e7bfa');
	let gradB = $state('#8e5bf0');
	let imageUrl = $state('');
	let accent = $state<string | null>(null);
	let badge = $state<string | null>(null);
	let flourish = $state<string | null>(null);
	let tagline = $state('');
	let uploadError = $state('');
	let uploading = $state(false);

	function seed(s: EntryStyle | null) {
		bgMode = (s?.background_type as BgMode) ?? 'none';
		const v = s?.background_value;
		if (s?.background_type === 'solid' && typeof v === 'string') solid = v;
		if (s?.background_type === 'gradient' && Array.isArray(v)) {
			gradA = v[0];
			gradB = v[1];
		}
		if (s?.background_type === 'image' && typeof v === 'string') imageUrl = v;
		accent = s?.accent_color ?? null;
		badge = s?.badge ?? null;
		flourish = s?.flourish ?? null;
		tagline = s?.tagline ?? '';
		uploadError = '';
	}

	// Seed once per entry (and when a save round-trips a new style back in
	// for an entry that had none), never on every keystroke of the caller's
	// own state: reading style inside untrack keeps this from clobbering a
	// draft in progress.
	$effect(() => {
		void entry.id;
		untrack(() => seed(style));
	});

	const draft = $derived<EntryStyleDraft>({
		background_type: bgMode === 'none' ? null : bgMode,
		background_value:
			bgMode === 'solid'
				? solid
				: bgMode === 'gradient'
					? ([gradA, gradB] as [string, string])
					: bgMode === 'image'
						? imageUrl.trim()
						: null,
		accent_color: accent,
		badge,
		flourish,
		tagline: tagline.trim() || null
	});

	// The preview reads the draft through the same renderer the live surfaces
	// use, so what you see here is exactly what the bracket and the TV show.
	const preview = $derived<EntryStyle>({
		entry_id: entry.id,
		tournament_id: entry.tournament_id,
		...draft
	});

	const imageMissing = $derived(bgMode === 'image' && !imageUrl.trim());

	async function pickImage(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file || !onupload) return;
		uploadError = '';
		uploading = true;
		try {
			imageUrl = await onupload(file);
			bgMode = 'image';
		} catch (err) {
			uploadError = err instanceof Error ? err.message : String(err);
		} finally {
			uploading = false;
			input.value = '';
		}
	}

	function reset() {
		seed(null);
		onsave({ ...EMPTY_STYLE });
	}

	const BG_MODES: { id: BgMode; label: string }[] = [
		{ id: 'none', label: 'None' },
		{ id: 'solid', label: 'Solid' },
		{ id: 'gradient', label: 'Gradient' },
		{ id: 'image', label: 'Image' }
	];
</script>

<div class="tnm-root style-editor">
	<div class="preview-wrap">
		<span class="tnm-label prev-label">Preview</span>
		<EntryBanner {entry} style={preview} size="md" />
	</div>

	{#if note}<p class="ed-note">{note}</p>{/if}
	{#if error}<p class="ed-error">{error}</p>{/if}

	<div class="field">
		<span class="tnm-label">Background</span>
		<div class="chips">
			{#each BG_MODES as m (m.id)}
				<button
					type="button"
					class="chip"
					class:on={bgMode === m.id}
					onclick={() => (bgMode = m.id)}
				>
					{m.label}
				</button>
			{/each}
		</div>
		{#if bgMode === 'solid'}
			<label class="inline">
				<input type="color" bind:value={solid} aria-label="Background color" />
				<span class="mono">{solid}</span>
			</label>
		{:else if bgMode === 'gradient'}
			<label class="inline">
				<input type="color" bind:value={gradA} aria-label="Gradient color one" />
				<input type="color" bind:value={gradB} aria-label="Gradient color two" />
				<span class="mono">{gradA} → {gradB}</span>
			</label>
		{:else if bgMode === 'image'}
			<div class="stack">
				{#if onupload}
					<label class="file">
						<span>Upload an image</span>
						<input type="file" accept="image/*" disabled={uploading || busy} onchange={pickImage} />
					</label>
				{/if}
				<input
					class="text"
					type="url"
					placeholder="https://… image URL"
					bind:value={imageUrl}
					maxlength="600"
				/>
				{#if uploading}<span class="mono">Uploading…</span>{/if}
				{#if uploadError}<span class="ed-error">{uploadError}</span>{/if}
			</div>
		{/if}
	</div>

	<div class="field">
		<span class="tnm-label">Accent color</span>
		<div class="swatches">
			<button
				type="button"
				class="swatch none"
				class:on={accent === null}
				title="No accent"
				aria-label="No accent"
				onclick={() => (accent = null)}
			></button>
			{#each ACCENT_PRESETS as p (p.id)}
				<button
					type="button"
					class="swatch"
					class:on={accent?.toLowerCase() === p.hex}
					style="--sw:{p.hex}"
					title={p.label}
					aria-label={p.label}
					onclick={() => (accent = p.hex)}
				></button>
			{/each}
			<label class="inline custom">
				<input
					type="color"
					value={accent ?? '#8a938c'}
					aria-label="Custom accent color"
					oninput={(e) => (accent = (e.currentTarget as HTMLInputElement).value)}
				/>
				<span class="mono">custom</span>
			</label>
		</div>
	</div>

	<div class="field">
		<span class="tnm-label">Badge</span>
		<div class="chips">
			<button type="button" class="chip" class:on={badge === null} onclick={() => (badge = null)}>
				None
			</button>
			{#each BADGES as b (b.id)}
				<button
					type="button"
					class="chip glyph"
					class:on={badge === b.id}
					title={b.label}
					aria-label={b.label}
					onclick={() => (badge = b.id)}
				>
					<BadgeIcon id={b.id} size="1.05rem" />
				</button>
			{/each}
		</div>
	</div>

	<div class="field">
		<span class="tnm-label">Flourish</span>
		<div class="chips">
			<button
				type="button"
				class="chip"
				class:on={flourish === null}
				onclick={() => (flourish = null)}
			>
				None
			</button>
			{#each FLOURISHES as f (f.id)}
				<button
					type="button"
					class="chip"
					class:on={flourish === f.id}
					title={f.note}
					onclick={() => (flourish = f.id)}
				>
					{f.label}
				</button>
			{/each}
		</div>
		<p class="hint">Cosmetic only — flourishes never change how a match is scored or shown.</p>
	</div>

	<div class="field">
		<span class="tnm-label">Tagline</span>
		<input
			class="text"
			type="text"
			maxlength="48"
			placeholder="Short line under your name (optional)"
			bind:value={tagline}
		/>
	</div>

	<div class="actions">
		<button
			class="save"
			type="button"
			disabled={busy || uploading || imageMissing}
			onclick={() => onsave(draft)}
		>
			{busy ? 'Saving…' : 'Save banner'}
		</button>
		<button class="chip" type="button" disabled={busy} onclick={reset}>Reset to default</button>
	</div>
</div>

<style>
	.style-editor {
		display: flex;
		flex-direction: column;
		gap: 0.95rem;
		font-family: 'Rajdhani', sans-serif;
	}
	.preview-wrap {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.prev-label,
	.style-editor :global(.tnm-label) {
		font-size: 0.68rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.chips,
	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
		align-items: center;
	}
	/* Neutral by default: selection reads as a brighter border + ink, never a
	 * flooded surface. */
	.chip {
		background: var(--tnm-panel);
		border: 1px solid var(--tnm-line);
		border-radius: 6px;
		color: var(--tnm-ink-dim);
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		padding: 0.3rem 0.6rem;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
	}
	.chip:hover:not(:disabled) {
		color: var(--tnm-ink);
		border-color: var(--tnm-line-strong);
	}
	.chip.on {
		color: var(--tnm-ink);
		border-color: var(--tnm-ink-dim);
		background: var(--tnm-panel-2);
	}
	.chip:disabled {
		opacity: 0.4;
		cursor: default;
	}
	.chip.glyph {
		padding: 0.28rem 0.45rem;
	}
	.swatch {
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		border: 2px solid transparent;
		background: var(--sw);
		cursor: pointer;
		padding: 0;
		outline-offset: 2px;
	}
	.swatch.on {
		border-color: var(--tnm-ink);
	}
	.swatch.none {
		background:
			linear-gradient(45deg, transparent 45%, var(--tnm-ink-dim) 45%, var(--tnm-ink-dim) 55%, transparent 55%),
			var(--tnm-panel-2);
		border: 2px solid var(--tnm-line-strong);
	}
	.swatch.none.on {
		border-color: var(--tnm-ink);
	}
	.inline {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
	}
	.inline.custom {
		margin-left: 0.3rem;
	}
	input[type='color'] {
		width: 2rem;
		height: 1.7rem;
		padding: 0;
		border: 1px solid var(--tnm-line-strong);
		border-radius: 5px;
		background: var(--tnm-panel);
		cursor: pointer;
	}
	.text {
		background: var(--tnm-bg);
		border: 1px solid var(--tnm-line);
		border-radius: 6px;
		color: var(--tnm-ink);
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		padding: 0.4rem 0.6rem;
		max-width: 26rem;
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		align-items: flex-start;
	}
	.file {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--tnm-ink-dim);
	}
	.mono {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.68rem;
		color: var(--tnm-ink-dim);
	}
	.hint,
	.ed-note {
		margin: 0;
		font-size: 0.82rem;
		color: var(--tnm-ink-dim);
	}
	.ed-error {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		color: #e5484d;
	}
	.actions {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
		margin-top: 0.2rem;
	}
	/* The one emerald element on this panel. */
	.save {
		background: var(--tnm-accent);
		border: 1px solid var(--tnm-accent);
		border-radius: 6px;
		color: #062018;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.74rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 0.42rem 0.95rem;
		cursor: pointer;
	}
	.save:disabled {
		opacity: 0.45;
		cursor: default;
	}
</style>
