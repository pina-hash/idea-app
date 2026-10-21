<script lang="ts">
	/**
	 * THE ONE CONTROL WHILE AN ADMIN VIEWS OR ACTS AS SOMEONE (ledger 0422,
	 * feedback d1c9ed15). Everything else on the page is exactly what that
	 * person sees; this panel floats over it, can be dragged anywhere, and
	 * remembers where it was put (per browser, as fractions of the window, so
	 * a resize keeps it on screen). Its one button leaves.
	 *
	 * View is amber and says read-only. Act is crimson, the site's colour for
	 * a live recording, because every change made is logged under the admin.
	 */
	import { onMount } from 'svelte';
	import {
		clampPosition,
		DEFAULT_PANEL_POSITION,
		PANEL_POSITION_KEY,
		placePanel,
		positionFrom,
		timeLeft,
		type PanelPosition,
		type ViewAsState
	} from '$lib/view-as';

	let { viewAs }: { viewAs: ViewAsState } = $props();

	let panel: HTMLDivElement | undefined = $state();
	let pos = $state<PanelPosition>(DEFAULT_PANEL_POSITION);
	let box = $state({ left: -9999, top: -9999 });
	let dragging = $state(false);
	let now = $state(Date.now());

	const acting = $derived(viewAs.mode === 'act');
	const initials = $derived(
		viewAs.target_name
			.split(/\s+/)
			.filter(Boolean)
			.slice(0, 2)
			.map((w) => w[0]?.toUpperCase() ?? '')
			.join('') || '?'
	);

	function place() {
		if (!panel) return;
		box = placePanel(pos, panel.offsetWidth, panel.offsetHeight, window.innerWidth, window.innerHeight);
	}

	function save() {
		try {
			localStorage.setItem(PANEL_POSITION_KEY, JSON.stringify(pos));
		} catch {
			/* a private window keeps it for this page only */
		}
	}

	onMount(() => {
		try {
			const raw = localStorage.getItem(PANEL_POSITION_KEY);
			if (raw) pos = clampPosition(JSON.parse(raw));
		} catch {
			pos = DEFAULT_PANEL_POSITION;
		}
		const onResize = () => place();
		window.addEventListener('resize', onResize);
		const tick = setInterval(() => (now = Date.now()), 30_000);
		return () => {
			window.removeEventListener('resize', onResize);
			clearInterval(tick);
		};
	});

	// Placed once the panel has a size, and again whenever the saved spot moves.
	$effect(() => {
		if (!panel) return;
		void pos;
		const raf = requestAnimationFrame(place);
		return () => cancelAnimationFrame(raf);
	});

	let grab = { dx: 0, dy: 0, id: -1 };

	function down(e: PointerEvent) {
		if (!panel || (e.target as HTMLElement).closest('button[type="submit"]')) return;
		if (e.button !== 0) return;
		grab = { dx: e.clientX - box.left, dy: e.clientY - box.top, id: e.pointerId };
		panel.setPointerCapture(e.pointerId);
		dragging = true;
		e.preventDefault();
	}

	function move(e: PointerEvent) {
		if (!dragging || !panel || e.pointerId !== grab.id) return;
		const w = panel.offsetWidth;
		const h = panel.offsetHeight;
		pos = positionFrom(e.clientX - grab.dx, e.clientY - grab.dy, w, h, window.innerWidth, window.innerHeight);
		place();
	}

	function up(e: PointerEvent) {
		if (!dragging || e.pointerId !== grab.id) return;
		dragging = false;
		panel?.releasePointerCapture(e.pointerId);
		save();
	}

	function nudge(e: KeyboardEvent) {
		const step = e.shiftKey ? 0.2 : 0.05;
		const d: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step]
		};
		const m = d[e.key];
		if (!m) return;
		e.preventDefault();
		pos = clampPosition({ x: pos.x + m[0], y: pos.y + m[1] });
		place();
		save();
	}
</script>

<div
	bind:this={panel}
	class="va-panel"
	class:acting
	class:dragging
	style:left="{box.left}px"
	style:top="{box.top}px"
	style:visibility={box.left < -999 ? 'hidden' : null}
	role="region"
	aria-label={acting ? `Acting as ${viewAs.target_name}` : `Viewing as ${viewAs.target_name}`}
	data-testid="view-as-panel"
	data-mode={viewAs.mode}
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
>
	<button class="va-grip" type="button" aria-label="Move this panel (arrow keys)" onkeydown={nudge}>
		<span aria-hidden="true"></span>
	</button>
	<span class="va-face" aria-hidden="true">{initials}</span>
	<div class="va-text">
		<span class="va-tag"><span class="va-lamp" aria-hidden="true"></span>{acting ? 'Acting as' : 'Viewing as'}</span>
		<strong class="va-name" title={viewAs.target_email}>{viewAs.target_name}</strong>
		<span class="va-sub">
			{#if acting}
				Changes are real and logged{viewAs.changes ? ` · ${viewAs.changes}` : ''}
			{:else}
				Read-only
			{/if}
			· {timeLeft(viewAs.expires_at, now)}{viewAs.test_account ? ' · test account' : ''}
		</span>
	</div>
	<form method="POST" action="/view-as/exit" class="va-exit-form">
		<button class="va-exit" type="submit" data-testid="view-as-exit">Exit</button>
	</form>
</div>

<style>
	.va-panel {
		--va-lamp: var(--amber);
		position: fixed;
		z-index: 2147483000;
		display: flex;
		align-items: center;
		gap: 0.6rem;
		max-width: min(26rem, calc(100vw - 16px));
		padding: 0.5rem 0.55rem 0.5rem 0.35rem;
		border-radius: 14px;
		background: linear-gradient(180deg, #2a2f2c 0%, #1b1f1d 100%);
		background-color: #1b1f1d;
		border: 1px solid #5d6862;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.12),
			0 0 0 1px rgba(0, 0, 0, 0.55),
			0 10px 28px rgba(0, 0, 0, 0.55),
			0 0 18px -6px color-mix(in srgb, var(--va-lamp) 55%, transparent);
		color: #e7eae8;
		font-family: var(--font-display);
		touch-action: none;
		user-select: none;
		cursor: grab;
	}
	.va-panel.acting {
		--va-lamp: var(--crimson);
	}
	.va-panel.dragging {
		cursor: grabbing;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.12),
			0 0 0 1px rgba(0, 0, 0, 0.55),
			0 18px 40px rgba(0, 0, 0, 0.6),
			0 0 22px -4px color-mix(in srgb, var(--va-lamp) 65%, transparent);
	}
	.va-grip {
		flex: none;
		width: 22px;
		min-height: 44px;
		display: grid;
		place-items: center;
		padding: 0;
		border: 0;
		border-radius: 8px;
		background: transparent;
		cursor: inherit;
	}
	.va-grip span {
		width: 8px;
		height: 22px;
		background-image: radial-gradient(circle, #8b968f 1.3px, transparent 1.6px);
		background-size: 4px 5.5px;
	}
	.va-grip:focus-visible {
		outline: 2px solid var(--cyan);
		outline-offset: 1px;
	}
	.va-face {
		flex: none;
		width: 36px;
		height: 36px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		background: linear-gradient(180deg, #0f1110, #171a19);
		box-shadow:
			inset 0 2px 3px rgba(0, 0, 0, 0.7),
			0 1px 0 rgba(255, 255, 255, 0.08);
		font-family: var(--font-mono);
		font-size: 0.82rem;
		letter-spacing: 0.04em;
		color: #e7eae8;
	}
	.va-text {
		display: grid;
		min-width: 0;
		line-height: 1.15;
	}
	.va-tag {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.66rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--va-lamp);
	}
	.va-lamp {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: var(--va-lamp);
		box-shadow: 0 0 6px 1px color-mix(in srgb, var(--va-lamp) 70%, transparent);
	}
	@media (prefers-reduced-motion: no-preference) {
		.acting .va-lamp {
			animation: va-rec 1.6s ease-in-out infinite;
		}
	}
	@keyframes va-rec {
		50% {
			opacity: 0.35;
		}
	}
	.va-name {
		font-size: 1.05rem;
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.va-sub {
		font-family: var(--font-mono);
		font-size: 0.68rem;
		color: #9aa49d;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.va-exit-form {
		margin: 0 0 0 auto;
		flex: none;
	}
	.va-exit {
		min-height: 44px;
		min-width: 64px;
		padding: 0 0.95rem;
		border-radius: 11px;
		border: 1px solid #6f7b73;
		background: linear-gradient(180deg, #3a413c, #262b28);
		background-color: #262b28;
		box-shadow:
			inset 0 1px 0 rgba(255, 255, 255, 0.16),
			0 2px 4px rgba(0, 0, 0, 0.5);
		color: var(--green);
		font-family: var(--font-mono);
		font-size: 0.8rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		cursor: pointer;
	}
	.va-exit:hover {
		border-color: var(--green);
	}
	.va-exit:active {
		box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.6);
	}
	.va-exit:focus-visible {
		outline: 2px solid var(--cyan);
		outline-offset: 2px;
	}
</style>
