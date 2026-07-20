<script lang="ts">
	import { onMount } from 'svelte';
	import './brand/brand';
	import {
		MUSIC_TRACKS,
		SHUFFLE,
		musicSettings,
		setMusicVolume,
		setMusicMuted,
		setSfxVolume,
		setTrackPin,
		sfxSettings,
		trackLabel,
		type TrackCategory
	} from './audio-settings.svelte';
	import { creativeSettings, setCreativeMode } from './creative.svelte';
	import { ENV_PRESETS, ENV_PRESET_IDS } from './environment';
	import { weatherSettings, setWeatherPreset } from './weather.svelte';
	import { CURRENCY_NAME, CURRENCY_SHORT } from './economy';
	import {
		CONTROL_ACTIONS,
		actionLabel,
		controlSettings,
		keyConflict,
		keyLabel,
		padConflict,
		padLabel,
		resetActionBindings,
		resetAllBindings,
		samePadBinding,
		setKeyBinding,
		setPadBinding,
		swapKeyBindings,
		swapPadBindings,
		type ControlAction,
		type ControlDevice,
		type PadBinding
	} from './control-settings.svelte';

	/**
	 * GREENLINE settings overlay. A modal (NOT a screen in the title/garage/race/
	 * results state machine), reachable from the gear on the title and garage
	 * screens. Sections: CONTROLS (the full rebind UI over the control-settings
	 * store: keyboard + gamepad capture, conflict swap, per-action and reset-all
	 * defaults), AUDIO (music-only for now: continuous volume, quick mute,
	 * per-category track pinning), and a clearly labelled CAMERA placeholder for
	 * Phase 9.
	 *
	 * Presentation only: reads/writes the shared settings stores, one `onClose`
	 * callback out. Escape closes; the overlay swallows keydowns so the title's
	 * Enter-start shortcut can never fire from underneath (the parent also
	 * disables that shortcut while this is open, belt and suspenders).
	 */
	const { onClose }: { onClose: () => void } = $props();

	const CONTROL_GROUPS = [
		{ title: 'Driving', rows: CONTROL_ACTIONS.filter((a) => a.group === 'driving') },
		{ title: 'Combat', rows: CONTROL_ACTIONS.filter((a) => a.group === 'combat') }
	];

	// ---- Rebind capture ----
	// Arming a binding cell listens for the NEXT relevant input: a keydown for
	// the keyboard column, or the next gamepad button press / axis push for the
	// gamepad column (two separate capture modes; a key and a pad input can
	// never conflict with each other). Escape cancels a capture.
	let capture = $state<{ action: ControlAction; device: ControlDevice } | null>(null);
	// A captured input already bound to ANOTHER action on the same device parks
	// here pending the player's choice: swap the two bindings, or cancel.
	let conflict = $state<{
		action: ControlAction;
		device: ControlDevice;
		other: ControlAction;
		candidate: string | PadBinding;
	} | null>(null);

	const arming = (id: ControlAction, d: ControlDevice) =>
		capture !== null && capture.action === id && capture.device === d;

	function armCapture(action: ControlAction, device: ControlDevice) {
		conflict = null;
		// Clicking the armed cell again cancels the capture.
		capture = arming(action, device) ? null : { action, device };
	}

	function applyCapturedKey(action: ControlAction, code: string) {
		capture = null;
		const other = keyConflict(code, action);
		if (other) {
			conflict = { action, device: 'key', other, candidate: code };
			return;
		}
		setKeyBinding(action, code);
	}

	function applyCapturedPad(action: ControlAction, b: PadBinding) {
		capture = null;
		if (samePadBinding(controlSettings.gamepad[action], b)) return;
		const other = padConflict(b, action);
		if (other) {
			conflict = { action, device: 'pad', other, candidate: b };
			return;
		}
		setPadBinding(action, b);
	}

	function confirmSwap() {
		if (!conflict) return;
		if (conflict.device === 'key') swapKeyBindings(conflict.action, conflict.other);
		else swapPadBindings(conflict.action, conflict.other);
		conflict = null;
	}

	// Gamepad capture: poll for the first NEW button press or axis push past
	// the threshold, judged against a baseline snapshot taken at arm time so an
	// already-held trigger or a drifted/resting-at-full axis can never bind
	// itself; releasing an input re-arms its baseline slot.
	$effect(() => {
		if (capture?.device !== 'pad') return;
		const action = capture.action;
		let baseline: { buttons: boolean[]; axes: number[] } | null = null;
		const iv = setInterval(() => {
			const pads = navigator.getGamepads ? navigator.getGamepads() : [];
			const pad = Array.from(pads).find((p) => p && p.connected) ?? null;
			if (!pad) {
				baseline = null;
				return;
			}
			if (!baseline) {
				baseline = {
					buttons: pad.buttons.map((b) => b.pressed),
					axes: pad.axes.map((v) => (Math.abs(v) > 0.4 ? v : 0))
				};
				return;
			}
			// Buttons win over axes (a press is unambiguous).
			for (let i = 0; i < pad.buttons.length; i++) {
				const pressed = pad.buttons[i]?.pressed ?? false;
				if (pressed && !baseline.buttons[i]) {
					applyCapturedPad(action, { kind: 'button', index: i });
					return;
				}
				if (!pressed) baseline.buttons[i] = false;
			}
			for (let i = 0; i < pad.axes.length; i++) {
				const v = pad.axes[i] ?? 0;
				const base = baseline.axes[i] ?? 0;
				if (Math.abs(v) > 0.6 && Math.abs(base) < 0.4) {
					applyCapturedPad(action, { kind: 'axis', axis: i, dir: v < 0 ? -1 : 1 });
					return;
				}
				if (Math.abs(v) < 0.4) baseline.axes[i] = 0;
			}
		}, 50);
		return () => clearInterval(iv);
	});

	// Volume slider works in whole percents; the store keeps a 0..1 gain.
	const volumePct = $derived(Math.round(musicSettings.volume * 100));
	function onVolumeInput(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		setMusicVolume(v / 100);
	}

	// SFX volume: an independent slider (music and SFX adjust separately).
	const sfxPct = $derived(Math.round(sfxSettings.volume * 100));
	function onSfxVolumeInput(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		setSfxVolume(v / 100);
	}

	const AUDIO_CATS: { id: TrackCategory; label: string; where: string }[] = [
		{ id: 'menu', label: 'Menu', where: 'title screen' },
		{ id: 'workshop', label: 'Workshop', where: 'garage' },
		{ id: 'race', label: 'Race', where: 'on track' }
	];

	function onKeydown(e: KeyboardEvent) {
		// A keyboard capture eats the next key outright (Escape cancels it and
		// deliberately cannot be bound).
		if (capture?.device === 'key') {
			e.preventDefault();
			e.stopPropagation();
			if (e.code === 'Escape') capture = null;
			// A keydown with no code (some synthetic/IME events) can't be a
			// binding; stay armed and wait for a real key.
			else if (e.code) applyCapturedKey(capture.action, e.code);
			return;
		}
		// Swallow keys while open so nothing (Enter-to-start, driving keys) leaks
		// to the screen underneath. Escape steps back: dialog, capture, modal.
		if (e.key === 'Escape') {
			e.preventDefault();
			if (conflict) conflict = null;
			else if (capture) capture = null;
			else onClose();
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
		<div class="gs-section-label gs-controls-head">
			<span>Controls</span>
			<button
				class="gs-btn gs-reset-all"
				onclick={() => {
					capture = null;
					conflict = null;
					resetAllBindings();
				}}
			>
				RESET ALL
			</button>
		</div>
		<div class="gs-controls">
			{#each CONTROL_GROUPS as g (g.title)}
				<div class="gs-ctrl-group">
					<div class="gs-ctrl-row gs-ctrl-cols">
						<span class="gs-ctrl-group-title">{g.title}</span>
						<span class="gs-col-label">Key</span>
						<span class="gs-col-label">Pad</span>
						<span></span>
					</div>
					{#each g.rows as row (row.id)}
						<div class="gs-ctrl-row">
							<span class="gs-ctrl-action">{row.label}</span>
							<button
								class="gs-bind"
								class:arming={arming(row.id, 'key')}
								onclick={() => armCapture(row.id, 'key')}
								aria-label={`Rebind ${row.label} (keyboard)`}
							>
								{arming(row.id, 'key') ? 'PRESS KEY' : keyLabel(controlSettings.keyboard[row.id])}
							</button>
							<button
								class="gs-bind"
								class:arming={arming(row.id, 'pad')}
								onclick={() => armCapture(row.id, 'pad')}
								aria-label={`Rebind ${row.label} (gamepad)`}
							>
								{arming(row.id, 'pad') ? 'PRESS INPUT' : padLabel(controlSettings.gamepad[row.id])}
							</button>
							<button
								class="gs-row-reset"
								onclick={() => {
									capture = null;
									conflict = null;
									resetActionBindings(row.id);
								}}
								title="Reset to default"
								aria-label={`Reset ${row.label} to default`}
							>
								↺
							</button>
						</div>
					{/each}
					{#if g.title === 'Combat'}
						<!-- The ram is not a binding: it triggers on nose-first contact. -->
						<div class="gs-ctrl-row gs-ctrl-static">
							<span class="gs-ctrl-action">Shockwave ram</span>
							<span class="gs-key gs-key-static">nose contact</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
		{#if conflict}
			<div class="gs-conflict" role="alertdialog" aria-label="Binding conflict">
				<span class="gs-conflict-text">
					<kbd class="gs-key"
						>{conflict.device === 'key'
							? keyLabel(conflict.candidate as string)
							: padLabel(conflict.candidate as PadBinding)}</kbd
					>
					is bound to {actionLabel(conflict.other)}. Swap it with {actionLabel(conflict.action)}?
				</span>
				<button class="gs-btn gs-btn-primary" onclick={confirmSwap}>SWAP</button>
				<button class="gs-btn" onclick={() => (conflict = null)}>CANCEL</button>
			</div>
		{/if}
		<div class="gs-foot">
			Click a binding, then press the new key or gamepad input (Esc cancels). Gamepad uses standard
			mapping; a stick binds one direction per action. The ram has no button: it triggers on
			nose-first contact.
		</div>

		<!-- AUDIO -->
		<div class="gs-section-label">Audio</div>
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

			<div class="gs-vol-row">
				<label class="gs-vol-label" for="gs-sfx-vol">Effects volume</label>
				<input
					id="gs-sfx-vol"
					class="gs-slider"
					type="range"
					min="0"
					max="100"
					step="1"
					value={sfxPct}
					oninput={onSfxVolumeInput}
					aria-label="Sound effects volume"
				/>
				<span class="gs-vol-val">{sfxPct}%</span>
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
				Shuffle rotates the pool (today's default). Pin a track to always hear it. Music and effects
				are mixed independently; effect sounds arrive with later updates.
			</div>
		</div>

		<!-- GAMEPLAY (Phase 7): creative mode -->
		<div class="gs-section-label">Gameplay</div>
		<div class="gs-creative-row">
			<div class="gs-creative-text">
				<span class="gs-creative-name">Creative mode</span>
				<span class="gs-creative-note">
					Build and race with everything unlocked. While on, races earn no {CURRENCY_NAME}
					({CURRENCY_SHORT}) and never count for the leaderboard. Turning it off returns your build
					to what you actually own.
				</span>
			</div>
			<button
				class="gs-btn gs-creative-toggle"
				class:on={creativeSettings.enabled}
				onclick={() => setCreativeMode(!creativeSettings.enabled)}
				aria-pressed={creativeSettings.enabled}
			>
				{creativeSettings.enabled ? 'ON' : 'OFF'}
			</button>
		</div>

		<!-- WEATHER (Phase 8c) -->
		<div class="gs-section-label">Weather</div>
		<div class="gs-weather">
			{#each ENV_PRESET_IDS as id (id)}
				{@const p = ENV_PRESETS[id]}
				<button
					class="gs-weather-card"
					class:on={weatherSettings.preset === id}
					onclick={() => setWeatherPreset(id)}
					aria-pressed={weatherSettings.preset === id}
				>
					<span class="gs-weather-name">{p.label}</span>
					<span class="gs-weather-note">{p.note}</span>
				</button>
			{/each}
		</div>
		<div class="gs-foot">
			Look only. Weather never changes grip, damage, or lap times, so every run is raced on the same
			physics and still counts.
		</div>

		<!-- CAMERA (placeholder, Phase 9) -->
		<div class="gs-section-label">Camera</div>
		<div class="gs-placeholder">
			<span class="gs-soon">COMING SOON</span>
			The chase camera already pulls back and lifts on its own as you gain speed. Manual distance,
			height, and field-of-view controls arrive in a later update (Phase 9).
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
	.gs-controls-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.gs-reset-all {
		padding: 0.14rem 0.5rem;
		font-size: 0.6rem;
		margin-bottom: 0.15rem;
	}
	.gs-ctrl-row {
		display: grid;
		grid-template-columns: 1fr 5rem 5rem 1.3rem;
		align-items: center;
		gap: 0.45rem;
		padding: 0.22rem 0;
		border-bottom: 1px solid rgba(147, 163, 176, 0.08);
	}
	.gs-ctrl-cols {
		border-bottom: none;
		padding-bottom: 0;
	}
	.gs-col-label {
		color: var(--glb-ink-faint);
		font-size: 0.58rem;
		letter-spacing: 0.18em;
		text-transform: uppercase;
		text-align: center;
	}
	.gs-ctrl-action {
		color: var(--glb-ink-dim);
		font-size: 0.78rem;
	}
	.gs-bind {
		font-family: var(--glb-font-data);
		font-size: 0.64rem;
		color: var(--glb-chrome-mid);
		background: linear-gradient(180deg, rgba(23, 30, 37, 0.9), rgba(9, 13, 17, 0.92));
		border: 1px solid var(--glb-line-strong);
		border-radius: 3px;
		box-shadow:
			inset 0 1px 0 rgba(247, 251, 254, 0.1),
			0 1px 0 rgba(0, 0, 0, 0.5);
		padding: 0.18rem 0.25rem;
		text-align: center;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}
	.gs-bind:hover,
	.gs-bind:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: rgba(42, 229, 126, 0.5);
		outline: none;
	}
	.gs-bind.arming {
		color: #8fffc4;
		border-color: rgba(42, 229, 126, 0.75);
		animation: gs-arm-pulse 0.9s ease-in-out infinite;
	}
	@keyframes gs-arm-pulse {
		0%,
		100% {
			box-shadow:
				inset 0 1px 0 rgba(247, 251, 254, 0.1),
				0 0 4px rgba(42, 229, 126, 0.2);
		}
		50% {
			box-shadow:
				inset 0 1px 0 rgba(247, 251, 254, 0.1),
				0 0 12px rgba(42, 229, 126, 0.5);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.gs-bind.arming {
			animation: none;
			box-shadow:
				inset 0 1px 0 rgba(247, 251, 254, 0.1),
				0 0 10px rgba(42, 229, 126, 0.4);
		}
	}
	.gs-row-reset {
		background: none;
		border: 1px solid transparent;
		border-radius: 3px;
		color: var(--glb-ink-faint);
		font-size: 0.78rem;
		line-height: 1;
		padding: 0.1rem 0;
		cursor: pointer;
		transition:
			color 140ms ease,
			border-color 140ms ease;
	}
	.gs-row-reset:hover,
	.gs-row-reset:focus-visible {
		color: var(--glb-chrome-hi);
		border-color: var(--glb-line);
		outline: none;
	}
	.gs-ctrl-static .gs-ctrl-action {
		color: var(--glb-ink-faint);
	}
	.gs-key-static {
		grid-column: 2 / 4;
		color: var(--glb-ink-faint);
	}
	.gs-conflict {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
		margin-top: 0.55rem;
		padding: 0.45rem 0.6rem;
		border: 1px solid rgba(255, 176, 46, 0.45);
		border-radius: 2px;
		background: rgba(255, 176, 46, 0.06);
	}
	.gs-conflict-text {
		flex: 1;
		min-width: 14rem;
		color: var(--glb-ink-dim);
		font-size: 0.74rem;
		line-height: 1.5;
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
	.gs-creative-row {
		display: flex;
		align-items: center;
		gap: 0.9rem;
	}
	.gs-creative-text {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.gs-creative-name {
		color: var(--glb-ink-dim);
		font-size: 0.78rem;
	}
	.gs-creative-note {
		color: var(--glb-ink-faint);
		font-size: 0.68rem;
		line-height: 1.45;
	}
	.gs-creative-toggle {
		min-width: 3.6rem;
	}
	.gs-creative-toggle.on {
		color: #8fffc4;
		border-color: rgba(42, 229, 126, 0.6);
		box-shadow: 0 0 10px rgba(42, 229, 126, 0.2);
	}
	.gs-weather {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 0.45rem;
	}
	.gs-weather-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-align: left;
		padding: 0.5rem 0.6rem;
		background: rgba(10, 15, 21, 0.6);
		border: 1px solid var(--glb-line);
		border-radius: 2px;
		cursor: pointer;
	}
	.gs-weather-card:hover {
		border-color: var(--glb-line-strong);
	}
	.gs-weather-card.on {
		border-color: rgba(42, 229, 126, 0.6);
		box-shadow: 0 0 10px rgba(42, 229, 126, 0.16);
	}
	.gs-weather-name {
		color: var(--glb-ink-dim);
		font-family: var(--glb-font-data);
		font-size: 0.72rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
	}
	.gs-weather-card.on .gs-weather-name {
		color: #8fffc4;
	}
	.gs-weather-note {
		color: var(--glb-ink-faint);
		font-size: 0.66rem;
		line-height: 1.4;
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
