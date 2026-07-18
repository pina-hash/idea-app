<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import {
		MUSIC_TRACKS,
		SHUFFLE,
		musicGain,
		musicSettings,
		toggleMusicMuted,
		type TrackCategory
	} from './audio-settings.svelte';

	/**
	 * GREENLINE music director. Wires the existing soundtrack to the route's
	 * screen state machine (title -> garage -> race -> results). This is a
	 * small purpose-built controller, NOT a reuse of VANGUARD's audio system:
	 * VANGUARD's playback lives inline inside its legacy HTML monolith
	 * (src/lib/legacy/vanguard/index.html), coupled to that game's own
	 * music-lane/sector logic and the vanguard_ localStorage keys, so it is not
	 * an extractable module a Svelte component could adopt.
	 *
	 * Playback is a two-channel crossfade over plain HTMLAudioElements: entering
	 * a screen fades the previous track out while the new one fades in over a
	 * few hundred ms, so screen changes never hard-cut or pop. Tracks loop, so a
	 * race that outlasts its track cleanly restarts rather than going silent.
	 *
	 * Volume, mute, and per-category track pins live in the shared, reload-
	 * persisted store (audio-settings.svelte.ts); the settings overlay edits it
	 * and this component reacts. The floating button here is a quick mute toggle.
	 *
	 * Autoplay: browsers block audio before a user gesture, so the first play()
	 * is attempted on mount and, if rejected, retried on the first pointer/key
	 * event on the page.
	 */
	type Screen = 'title' | 'garage' | 'race' | 'results';

	let {
		screen,
		finishPosition = null
	}: { screen: Screen; finishPosition?: number | null } = $props();

	const BASE = '/greenline/audio/';

	const MASTER = 0.55; // ceiling volume; the player's 0..1 gain multiplies it
	const FADE_MS = 350;

	let current: HTMLAudioElement | null = null;
	let currentSrc = '';
	let gestureArmed = false;
	let menuIdx = 0;
	let workshopIdx = 0;
	let lastScreen: Screen | '' = '';
	let lastFinish: number | null = null;

	const targetVol = () => MASTER * musicGain();
	const showMuted = $derived(musicSettings.muted || musicSettings.volume === 0);

	function rampTo(audio: HTMLAudioElement, to: number, done?: () => void) {
		const from = audio.volume;
		const start = performance.now();
		const step = (now: number) => {
			const t = Math.min(1, (now - start) / FADE_MS);
			// clamp: rounding can push volume a hair past [0,1], which throws.
			audio.volume = Math.max(0, Math.min(1, from + (to - from) * t));
			if (t < 1) requestAnimationFrame(step);
			else done?.();
		};
		requestAnimationFrame(step);
	}

	function armGesture() {
		if (gestureArmed) return;
		gestureArmed = true;
		const handler = () => {
			window.removeEventListener('pointerdown', handler);
			window.removeEventListener('keydown', handler);
			gestureArmed = false;
			current?.play().catch(() => {});
		};
		window.addEventListener('pointerdown', handler);
		window.addEventListener('keydown', handler);
	}

	function crossfadeTo(src: string, loop = true) {
		if (src === currentSrc && current) return;
		const old = current;
		const next = new Audio(src);
		next.loop = loop;
		next.preload = 'auto';
		next.volume = 0;
		current = next;
		currentSrc = src;

		const p = next.play();
		if (p) p.catch(() => armGesture());
		rampTo(next, targetVol());
		if (old) rampTo(old, 0, () => old.pause());
	}

	/** Category for a screen (results has no category, returns null). */
	function categoryFor(s: Screen | ''): TrackCategory | null {
		if (s === 'garage') return 'workshop';
		if (s === 'race') return 'race';
		if (s === 'title' || s === '') return 'menu';
		return null;
	}

	function selectFor(s: Screen, fp: number | null): string {
		if (s === 'results') return fp === 1 ? 'winner.mp3' : 'loser.mp3';
		const cat = categoryFor(s)!;
		const pin = musicSettings.pins[cat];
		// A concrete pin wins over the shuffle default.
		if (pin !== SHUFFLE && MUSIC_TRACKS[cat].includes(pin)) return pin;
		// Shuffle: race is random each start; menu/workshop rotate their pool.
		if (cat === 'race') {
			return MUSIC_TRACKS.race[Math.floor(Math.random() * MUSIC_TRACKS.race.length)];
		}
		if (cat === 'workshop') {
			const t = MUSIC_TRACKS.workshop[workshopIdx % MUSIC_TRACKS.workshop.length];
			workshopIdx++;
			return t;
		}
		const t = MUSIC_TRACKS.menu[menuIdx % MUSIC_TRACKS.menu.length];
		menuIdx++;
		return t;
	}

	// React to screen changes ONLY. The selection + crossfade are wrapped in
	// untrack so a volume / mute / pin change never re-triggers this effect
	// (which would reroll a random race track). Those are handled by the two
	// dedicated effects below.
	$effect(() => {
		const s = screen;
		const fp = finishPosition;
		// Re-select on a real screen change, or when the results outcome flips
		// while already on the results screen (winner <-> loser).
		const flip = s === 'results' && fp !== lastFinish;
		if (s === lastScreen && !flip) return;
		lastScreen = s;
		lastFinish = fp;
		untrack(() => crossfadeTo(BASE + selectFor(s, fp), true));
	});

	// Live volume / mute: ramp whatever is playing to the new gain. This is what
	// makes the settings slider and the mute button change playback immediately.
	$effect(() => {
		const g = musicGain();
		if (current) untrack(() => rampTo(current!, MASTER * g));
	});

	// Live track pinning: if the player pins a CONCRETE track for the category
	// currently playing, switch to it at once. Switching a category to SHUFFLE
	// does not interrupt the current track (no reroll mid-screen).
	$effect(() => {
		const pins = musicSettings.pins;
		// Touch each so a change to any category fires this effect.
		void (pins.menu + pins.workshop + pins.race);
		untrack(() => {
			if (!current) return;
			const cat = categoryFor(lastScreen);
			if (!cat) return;
			const pin = musicSettings.pins[cat];
			if (pin === SHUFFLE || !MUSIC_TRACKS[cat].includes(pin)) return;
			const desired = BASE + pin;
			if (desired !== currentSrc) crossfadeTo(desired);
		});
	});

	onDestroy(() => {
		current?.pause();
		current = null;
	});
</script>

<div class="glb glm-wrap">
	<button
		class="glm-btn"
		class:muted={showMuted}
		onclick={toggleMusicMuted}
		aria-label={showMuted ? 'Unmute music' : 'Mute music'}
		title={showMuted ? 'Unmute music' : 'Mute music'}
	>
		{#if showMuted}
			<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
				<path
					d="M4 9v6h4l5 5V4L8 9H4z"
					fill="currentColor"
					stroke="currentColor"
					stroke-width="1"
					stroke-linejoin="round"
				/>
				<line x1="16" y1="9" x2="22" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
				<line x1="22" y1="9" x2="16" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
		{:else}
			<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
				<path
					d="M4 9v6h4l5 5V4L8 9H4z"
					fill="currentColor"
					stroke="currentColor"
					stroke-width="1"
					stroke-linejoin="round"
				/>
				<path
					d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
				/>
			</svg>
		{/if}
	</button>
</div>

<style>
	.glm-wrap {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		z-index: 40;
	}
	.glm-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.2rem;
		height: 2.2rem;
		padding: 0;
		background: var(--glb-panel);
		border: 1px solid var(--glb-line-strong);
		border-radius: 3px;
		color: var(--glb-steel);
		cursor: pointer;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.55);
		transition:
			color 0.15s ease,
			border-color 0.15s ease,
			background 0.15s ease;
	}
	.glm-btn:hover {
		color: var(--glb-chrome-hi);
		border-color: var(--glb-line-strong);
		background: var(--glb-panel-2);
	}
	.glm-btn.muted {
		color: var(--glb-steel-dim);
	}
	.glm-btn:focus-visible {
		outline: 1px solid var(--glb-cool-rim);
		outline-offset: 2px;
	}
</style>
