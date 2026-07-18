<script lang="ts">
	import { onMount } from 'svelte';
	import './brand/brand';
	import {
		MUSIC_TRACKS,
		SHUFFLE,
		musicSettings,
		setMusicVolume,
		setMusicMuted,
		setTrackPin,
		trackLabel,
		type TrackCategory
	} from './audio-settings.svelte';

	/**
	 * GREENLINE settings overlay. A modal (NOT a screen in the title/garage/race/
	 * results state machine), reachable from the gear on the title and garage
	 * screens. Sections: CONTROLS (a read-only key legend this pass; a remap UI
	 * drops into the same layout next), AUDIO (music-only for now: continuous
	 * volume, quick mute, per-category track pinning), and a clearly labelled
	 * CAMERA placeholder for Phase 9.
	 *
	 * Presentation only: reads/writes the shared audio-settings store, one
	 * `onClose` callback out. Escape closes; the overlay swallows keydowns so the
	 * title's Enter-start shortcut can never fire from underneath (the parent
	 * also disables that shortcut while this is open, belt and suspenders).
	 */
	const { onClose }: { onClose: () => void } = $props();

	// Read-only bindings for this pass (remap UI is the next prompt). Grouped so
	// a remap control can slot in per row without a layout change.
	const CONTROL_GROUPS: { title: string; rows: { action: string; keys: string[] }[] }[] = [
		{
			title: 'Driving',
			rows: [
				{ action: 'Accelerate', keys: ['W', '↑'] },
				{ action: 'Brake / Reverse', keys: ['S', '↓'] },
				{ action: 'Steer left', keys: ['A', '←'] },
				{ action: 'Steer right', keys: ['D', '→'] },
				{ action: 'Handbrake', keys: ['Space'] },
				{ action: 'Recover / flip upright', keys: ['R'] }
			]
		},
		{
			title: 'Combat',
			rows: [
				{ action: 'EMP burst', keys: ['F'] },
				{ action: 'Oil slick', keys: ['E'] },
				{ action: 'Tether', keys: ['Q'] },
				{ action: 'Shockwave ram', keys: ['nose contact'] }
			]
		}
	];

	// Volume slider works in whole percents; the store keeps a 0..1 gain.
	const volumePct = $derived(Math.round(musicSettings.volume * 100));
	function onVolumeInput(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		setMusicVolume(v / 100);
	}

	const AUDIO_CATS: { id: TrackCategory; label: string; where: string }[] = [
		{ id: 'menu', label: 'Menu', where: 'title screen' },
		{ id: 'workshop', label: 'Workshop', where: 'garage' },
		{ id: 'race', label: 'Race', where: 'on track' }
	];

	function onKeydown(e: KeyboardEvent) {
		// Swallow keys while open so nothing (Enter-to-start, driving keys) leaks
		// to the screen underneath.
		if (e.key === 'Escape') {
			e.preventDefault();
			onClose();
			return;
		}
		e.stopPropagation();
	}

	let panelEl = $state<HTMLDivElement | null>(null);
	onMount(() => panelEl?.focus());
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="glb gs-scrim"
	role="presentation"
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
>
	<div
		class="gs-panel"
		role="dialog"
		aria-label="Settings"
		aria-modal="true"
		tabindex="-1"
		bind:this={panelEl}
	>
		<div class="gs-head">
			<span class="gs-title">SETTINGS</span>
			<span class="gs-note">controls · audio · camera</span>
			<button class="gs-btn gs-btn-primary" onclick={onClose}>DONE</button>
		</div>

		<!-- CONTROLS -->
		<div class="gs-section-label">Controls</div>
		<div class="gs-controls">
			{#each CONTROL_GROUPS as g (g.title)}
				<div class="gs-ctrl-group">
					<div class="gs-ctrl-group-title">{g.title}</div>
					{#each g.rows as row (row.action)}
						<div class="gs-ctrl-row">
							<span class="gs-ctrl-action">{row.action}</span>
							<span class="gs-keys">
								{#each row.keys as k (k)}
									<kbd class="gs-key">{k}</kbd>
								{/each}
							</span>
						</div>
					{/each}
				</div>
			{/each}
		</div>
		<div class="gs-foot">
			Gamepad (standard mapping) is supported too. Key remapping arrives in the next update.
		</div>

		<!-- AUDIO -->
		<div class="gs-section-label">Audio · music</div>
		<div class="gs-audio">
			<div class="gs-vol-row">
				<label class="gs-vol-label" for="gs-vol">Music volume</label>
				<input
					id="gs-vol"
					class="gs-slider"
					type="range"
					min="0"
					max="100"
					step="1"
					value={volumePct}
					oninput={onVolumeInput}
					aria-label="Music volume"
				/>
				<span class="gs-vol-val">{volumePct}%</span>
				<button
					class="gs-btn gs-mute"
					class:on={musicSettings.muted}
					onclick={() => setMusicMuted(!musicSettings.muted)}
				>
					{musicSettings.muted ? 'MUTED' : 'MUTE'}
				</button>
			</div>

			<div class="gs-tracks">
				{#each AUDIO_CATS as cat (cat.id)}
					<div class="gs-track-row">
						<label class="gs-track-label" for={`gs-track-${cat.id}`}>
							{cat.label} <span class="gs-track-where">{cat.where}</span>
						</label>
						<select
							id={`gs-track-${cat.id}`}
							class="gs-select"
							value={musicSettings.pins[cat.id]}
							onchange={(e) => setTrackPin(cat.id, (e.currentTarget as HTMLSelectElement).value)}
						>
							<option value={SHUFFLE}>Shuffle</option>
							{#each MUSIC_TRACKS[cat.id] as file (file)}
								<option value={file}>{trackLabel(cat.id, file)}</option>
							{/each}
						</select>
					</div>
				{/each}
			</div>
			<div class="gs-foot">
				Shuffle rotates the pool (today's default). Pin a track to always hear it. A separate
				sound-effects mix arrives with SFX in a later update.
			</div>
		</div>

		<!-- CAMERA (placeholder, Phase 9) -->
		<div class="gs-section-label">Camera</div>
		<div class="gs-placeholder">
			<span class="gs-soon">COMING SOON</span>
			Chase-camera distance, height, and field-of-view controls arrive in a later update (Phase 9).
		</div>
	</div>
</div>

<style>
	.gs-scrim {
		position: absolute;
		inset: 0;
		background: rgba(2, 3, 4, 0.82);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 50;
	}
	.gs-panel {
		width: min(94vw, 46rem);
		max-height: 92vh;
		overflow-y: auto;
		background:
			radial-gradient(120% 50% at 50% -10%, rgba(120, 165, 205, 0.06), transparent 60%),
			linear-gradient(180deg, #0b1016 0%, #070a0e 42%, #04060a 100%);
		border: 1px solid var(--glb-line);
		border-top-color: var(--glb-line-strong);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.08),
			0 30px 80px rgba(0, 0, 0, 0.6);
		padding: 1rem 1.2rem 1.1rem;
		color: var(--glb-ink);
	}
	.gs-panel:focus-visible {
		outline: none;
	}
	.gs-head {
		display: flex;
		align-items: center;
		gap: 0.9rem;
		margin-bottom: 0.7rem;
		padding-bottom: 0.6rem;
		border-bottom: 1px solid var(--glb-line);
	}
	.gs-title {
		font-family: var(--glb-font-display);
		font-size: 1.15rem;
		letter-spacing: -0.01em;
		transform: skewX(-7deg);
		background: var(--glb-chrome-grad);
		-webkit-background-clip: text;
		background-clip: text;
		color: transparent;
		user-select: none;
	}
	.gs-note {
		color: var(--glb-ink-faint);
		font-size: 0.72rem;
		letter-spacing: 0.08em;
		flex: 1;
	}
	.gs-btn {
		background: linear-gradient(180deg, rgba(23, 30, 37, 0.85), rgba(9, 13, 17, 0.9));
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		color: var(--glb-steel);
		font: 600 0.72rem var(--glb-font-ui);
		letter-spacing: 0.18em;
		padding: 0.34rem 0.8rem;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease,
			box-shadow 140ms ease;
	}
	.gs-btn:hover,
	.gs-btn:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: var(--glb-line-strong);
		outline: none;
	}
	.gs-btn-primary {
		color: var(--glb-chrome-mid);
		border-color: var(--glb-line-strong);
		box-shadow: inset 0 1px 0 rgba(247, 251, 254, 0.12);
	}
	.gs-btn-primary:hover,
	.gs-btn-primary:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: rgba(42, 229, 126, 0.7);
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.16),
			0 0 14px rgba(42, 229, 126, 0.25);
	}
	.gs-section-label {
		color: var(--glb-ink-dim);
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.26em;
		font-size: 0.66rem;
		border-bottom: 1px solid var(--glb-line);
		padding-bottom: 0.2rem;
		margin: 0.9rem 0 0.5rem;
	}
	.gs-controls {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
		gap: 0.9rem;
	}
	.gs-ctrl-group-title {
		color: var(--glb-steel);
		font-size: 0.66rem;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		margin-bottom: 0.35rem;
	}
	.gs-ctrl-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.6rem;
		padding: 0.22rem 0;
		border-bottom: 1px solid rgba(147, 163, 176, 0.08);
	}
	.gs-ctrl-action {
		color: var(--glb-ink-dim);
		font-size: 0.78rem;
	}
	.gs-keys {
		display: flex;
		gap: 0.25rem;
	}
	.gs-key {
		font-family: var(--glb-font-data);
		font-size: 0.66rem;
		color: var(--glb-chrome-mid);
		background: linear-gradient(180deg, rgba(23, 30, 37, 0.9), rgba(9, 13, 17, 0.92));
		border: 1px solid var(--glb-line-strong);
		border-radius: 3px;
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.1),
			0 1px 0 rgba(0, 0, 0, 0.5);
		padding: 0.1rem 0.4rem;
		min-width: 1.1rem;
		text-align: center;
		white-space: nowrap;
	}
	.gs-audio {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.gs-vol-row {
		display: flex;
		align-items: center;
		gap: 0.7rem;
	}
	.gs-vol-label {
		color: var(--glb-ink-dim);
		font-size: 0.78rem;
		min-width: 7rem;
	}
	.gs-slider {
		flex: 1;
		accent-color: #2ae57e;
		height: 4px;
		cursor: pointer;
	}
	.gs-vol-val {
		font-family: var(--glb-font-data);
		font-size: 0.82rem;
		color: var(--glb-chrome-hi);
		min-width: 3rem;
		text-align: right;
	}
	.gs-mute {
		letter-spacing: 0.12em;
	}
	.gs-mute.on {
		color: var(--glb-amber);
		border-color: rgba(255, 176, 46, 0.5);
	}
	.gs-tracks {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr));
		gap: 0.5rem 0.9rem;
	}
	.gs-track-row {
		display: flex;
		flex-direction: column;
		gap: 0.22rem;
	}
	.gs-track-label {
		color: var(--glb-ink-dim);
		font-size: 0.74rem;
		letter-spacing: 0.04em;
	}
	.gs-track-where {
		color: var(--glb-ink-faint);
		font-size: 0.64rem;
	}
	.gs-select {
		background: linear-gradient(180deg, rgba(16, 22, 28, 0.9), rgba(7, 10, 14, 0.92));
		border: 1px solid var(--glb-line-strong);
		border-radius: 2px;
		color: var(--glb-chrome-mid);
		font: 600 0.74rem var(--glb-font-ui);
		letter-spacing: 0.04em;
		padding: 0.32rem 0.5rem;
		cursor: pointer;
	}
	.gs-select:focus-visible {
		outline: 1px solid rgba(42, 229, 126, 0.5);
		outline-offset: 1px;
	}
	.gs-placeholder {
		color: var(--glb-ink-faint);
		font-size: 0.74rem;
		line-height: 1.5;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.5rem 0.7rem;
		border: 1px dashed var(--glb-line);
		border-radius: 2px;
	}
	.gs-soon {
		color: var(--glb-steel-dim);
		font-family: var(--glb-font-data);
		font-size: 0.62rem;
		letter-spacing: 0.24em;
	}
	.gs-foot {
		color: var(--glb-ink-faint);
		font-size: 0.66rem;
		letter-spacing: 0.03em;
		line-height: 1.45;
		margin-top: 0.3rem;
	}
</style>
