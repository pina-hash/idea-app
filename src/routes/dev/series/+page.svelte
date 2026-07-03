<script lang="ts">
	import { onMount } from 'svelte';
	import SeriesThumbRotator from '$lib/gauntlet/SeriesThumbRotator.svelte';
	import '$lib/gauntlet/viewport/viewport.css';

	/**
	 * Dev-only harness for the collapsible Speedrun series + rotating thumbnail
	 * (SeriesThumbRotator). Feeds the rotator PRE-RESOLVED sample images (generated
	 * to canvas) so the cross-fade, reduced-motion, and empty-placeholder paths are
	 * verifiable with no Supabase / STL. Also exercises the collapse toggle with
	 * per-browser localStorage persistence, mirroring the real speedrun page.
	 */

	const STORE = 'gauntlet_dev_series_collapsed';

	// Three visually distinct sample thumbnails so the cross-fade is obvious.
	function sample(label: string, bg: string, fg: string): string {
		const w = 264;
		const h = 198;
		const c = document.createElement('canvas');
		c.width = w;
		c.height = h;
		const g = c.getContext('2d');
		if (!g) return '';
		g.fillStyle = bg;
		g.fillRect(0, 0, w, h);
		g.strokeStyle = fg;
		g.fillStyle = fg;
		g.lineWidth = 4;
		g.strokeRect(40, 40, w - 80, h - 80);
		g.beginPath();
		g.moveTo(w / 2, 40);
		g.lineTo(w / 2, h - 40);
		g.moveTo(40, h / 2);
		g.lineTo(w - 40, h / 2);
		g.stroke();
		g.font = 'bold 40px monospace';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText(label, w / 2, h / 2);
		return c.toDataURL('image/png');
	}

	// ?reduced=1 forces the reduced-motion path so it is verifiable without
	// toggling the OS setting (the preview can't emulate the media feature).
	let forceReduced = $state<boolean | null>(null);

	let samples = $state<string[]>([]);

	type Series = { id: string; name: string; count: number; sources: string[] };
	let seriesList = $state<Series[]>([]);
	let collapsed = $state<Record<string, boolean>>({});
	let activeReadout = $state('');

	function toggle(id: string) {
		collapsed[id] = !collapsed[id];
		try {
			localStorage.setItem(STORE, JSON.stringify(collapsed));
		} catch {
			/* ignore */
		}
	}

	onMount(() => {
		forceReduced = new URLSearchParams(location.search).get('reduced') === '1' ? true : null;
		samples = [
			sample('A', '#ffffff', '#111'),
			sample('B', '#0b1a12', '#00ff41'),
			sample('C', '#101a24', '#00f0ff')
		];
		seriesList = [
			{ id: 'multi', name: 'Fundamentals (3 levels, rotates)', count: 3, sources: samples },
			{ id: 'single', name: 'One-off (1 level, static)', count: 1, sources: [samples[0]] },
			{ id: 'empty', name: 'No thumbnails (placeholder)', count: 2, sources: [] }
		];
		try {
			const raw = localStorage.getItem(STORE);
			collapsed = raw ? JSON.parse(raw) : { multi: true, single: true, empty: true };
		} catch {
			collapsed = { multi: true, single: true, empty: true };
		}
		// Surface the rotating card's active image index for headless verification.
		const id = setInterval(() => {
			const card = document.querySelector('[data-series="multi"] .series-thumb');
			const imgs = card ? [...card.querySelectorAll('img')] : [];
			const on = imgs.findIndex((im) => im.classList.contains('on'));
			activeReadout = `multi active=${on} of ${imgs.length}`;
		}, 300);
		return () => clearInterval(id);
	});
</script>

<svelte:head><title>Series harness</title></svelte:head>

<div class="gt-root">
	<div class="harness">
		<h1>Collapsible series + rotating thumbnail harness</h1>
		<p class="note">
			Dev-only. The first card rotates through 3 sample thumbnails (~1.5s here, 3.5s in production);
			the second is a single static thumbnail; the third has no thumbnails and shows the placeholder.
			Toggle collapse and reload to confirm localStorage persistence. Enable OS "reduce motion" to
			confirm the first card stops rotating and holds one frame.
		</p>
		<p class="readout" data-testid="active">{activeReadout}</p>

		{#each seriesList as s (s.id)}
			<section class="series-section" data-series={s.id}>
				<div class="series-head-row">
					<button
						class="series-toggle"
						type="button"
						aria-expanded={!collapsed[s.id]}
						onclick={() => toggle(s.id)}
					>
						<span class="caret" class:down={!collapsed[s.id]}>&rsaquo;</span>
						<span class="series-name">{s.name}</span>
						<span class="chip-n">{s.count}</span>
					</button>
				</div>
				{#if collapsed[s.id]}
					<div class="collapsed-body">
						<SeriesThumbRotator preresolved={s.sources} intervalMs={1500} reducedMotion={forceReduced} />
						<p class="dim collapsed-hint">
							{s.count} drawing{s.count === 1 ? '' : 's'}. Expand to run them.
						</p>
					</div>
				{:else}
					<ul class="fake-list">
						{#each Array(s.count) as _, i (i)}
							<li>Level {i + 1}</li>
						{/each}
					</ul>
				{/if}
			</section>
		{/each}
	</div>
</div>

<style>
	.harness {
		max-width: 780px;
		margin: 0 auto;
		padding: 2rem 1.5rem 5rem;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
	}
	h1 {
		font-family: 'Orbitron', sans-serif;
		font-size: 1.15rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}
	.note {
		color: var(--dim, #5f8a78);
		font-size: 0.88rem;
		line-height: 1.5;
	}
	.readout {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		color: var(--cyan, #00f0ff);
	}
	.series-section {
		margin: 1rem 0;
		border: 1px solid var(--line, #16242c);
		border-radius: 8px;
		padding: 0.9rem 1rem;
		background: var(--bg1, #050f07);
	}
	.series-toggle {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		width: 100%;
		background: none;
		border: none;
		cursor: pointer;
		color: var(--white, #e8ffe8);
		font-family: 'Rajdhani', sans-serif;
		font-size: 1.05rem;
		text-align: left;
		padding: 0;
	}
	.caret {
		display: inline-block;
		color: var(--green, #00ff41);
		transition: transform 0.2s ease;
	}
	.caret.down {
		transform: rotate(90deg);
	}
	.series-name {
		flex: 1;
	}
	.chip-n {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: var(--cyan, #00f0ff);
		border: 1px solid var(--line, #16242c);
		border-radius: 3px;
		padding: 0.1rem 0.4rem;
	}
	.collapsed-body {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-top: 0.8rem;
	}
	.collapsed-hint {
		font-size: 0.85rem;
	}
	.fake-list {
		margin: 0.8rem 0 0;
		padding-left: 1.1rem;
		color: var(--dim, #5f8a78);
	}
	@media (prefers-reduced-motion: reduce) {
		.caret {
			transition: none;
		}
	}
</style>
