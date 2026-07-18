<script lang="ts" module>
	/**
	 * Session-scoped mute state. Module-level so it survives the component
	 * remounting as the player navigates within the /greenline SPA session
	 * (it deliberately does NOT survive a full reload, per the spec).
	 */
	let sessionMuted = false;
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';

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
	// Two menu and two workshop tracks shipped alongside the five race tracks;
	// rotate through each pool so repeat visits vary. Race picks at random each
	// start.
	const MENU = ['menu-1.mp3', 'menu-2.mp3'];
	const WORKSHOP = ['workshop-1.mp3', 'workshop-2.mp3'];
	const RACE = ['race-1.mp3', 'race-2.mp3', 'race-3.mp3', 'race-4.mp3', 'race-5.mp3'];

	const MASTER = 0.55; // ceiling volume for whichever track is active
	const FADE_MS = 350;

	let muted = $state(sessionMuted);

	let current: HTMLAudioElement | null = null;
	let currentSrc = '';
	let gestureArmed = false;
	let menuIdx = 0;
	let workshopIdx = 0;
	let lastScreen: Screen | '' = '';
	let lastFinish: number | null = null;

	const targetVol = () => (muted ? 0 : MASTER);

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

	function selectFor(s: Screen, fp: number | null): string {
		if (s === 'garage') {
			const t = WORKSHOP[workshopIdx % WORKSHOP.length];
			workshopIdx++;
			return t;
		}
		if (s === 'race') {
			return RACE[Math.floor(Math.random() * RACE.length)];
		}
		if (s === 'results') {
			return fp === 1 ? 'winner.mp3' : 'loser.mp3';
		}
		// title (and any fallback)
		const t = MENU[menuIdx % MENU.length];
		menuIdx++;
		return t;
	}

	// React to screen changes. The effect only reads `screen`/`finishPosition`,
	// so it runs on mount and on every real transition, and nothing else.
	$effect(() => {
		const s = screen;
		const fp = finishPosition;
		// Re-select on a real screen change, or when the results outcome flips
		// while already on the results screen (winner <-> loser).
		const flip = s === 'results' && fp !== lastFinish;
		if (s === lastScreen && !flip) return;
		lastScreen = s;
		lastFinish = fp;
		crossfadeTo(BASE + selectFor(s, fp), true);
	});

	function toggleMute() {
		muted = !muted;
		sessionMuted = muted;
		// A muted track keeps looping silently so an unmute picks the current
		// screen's music back up instantly.
		if (current) rampTo(current, targetVol());
	}

	onDestroy(() => {
		current?.pause();
		current = null;
	});
</script>

<div class="glb glm-wrap">
	<button
		class="glm-btn"
		class:muted
		onclick={toggleMute}
		aria-label={muted ? 'Unmute music' : 'Mute music'}
		title={muted ? 'Unmute music' : 'Mute music'}
	>
		{#if muted}
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
