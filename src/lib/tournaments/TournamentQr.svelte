<script lang="ts">
	/**
	 * Registration QR for the public tournament page: encodes the page's own
	 * URL, generated fully client-side by the `qrcode` package (no external
	 * image service -- the dependency is dynamic-imported browser-only, the
	 * StlViewer convention). Two presentations: an inline card, and a
	 * large-format full-screen mode for a shop TV or a printout (dark modules
	 * on a white sheet, the only combination phone cameras reliably scan).
	 */
	import { onMount } from 'svelte';

	let {
		url,
		name = ''
	}: {
		url: string;
		name?: string;
	} = $props();

	let smallCanvas = $state<HTMLCanvasElement | null>(null);
	let bigCanvas = $state<HTMLCanvasElement | null>(null);
	let presenting = $state(false);
	let qrFailed = $state(false);

	type QrModule = typeof import('qrcode');
	let qrModule: QrModule | null = null;

	async function draw(canvas: HTMLCanvasElement | null, width: number) {
		if (!canvas) return;
		try {
			qrModule ??= await import('qrcode');
			await qrModule.toCanvas(canvas, url, {
				width,
				margin: 2,
				color: { dark: '#04140a', light: '#ffffff' }
			});
		} catch {
			qrFailed = true;
		}
	}

	onMount(() => {
		draw(smallCanvas, 180);
	});

	// Re-render whenever the URL changes or the big canvas mounts.
	$effect(() => {
		void url;
		draw(smallCanvas, 180);
	});
	$effect(() => {
		if (presenting && bigCanvas) draw(bigCanvas, 720);
	});

	function onKeydown(e: KeyboardEvent) {
		if (presenting && e.key === 'Escape') {
			e.preventDefault();
			presenting = false;
		}
	}

	const displayUrl = $derived(url.replace(/^https?:\/\//, ''));
</script>

<svelte:window onkeydown={onKeydown} />

<div class="qr-card">
	{#if qrFailed}
		<p class="qr-fail">QR unavailable — share the link: <span class="qr-url">{displayUrl}</span></p>
	{:else}
		<div class="qr-frame"><canvas bind:this={smallCanvas}></canvas></div>
		<div class="qr-side">
			<p class="qr-head">Scan to register</p>
			<p class="qr-url">{displayUrl}</p>
			<button class="btn secondary" onclick={() => (presenting = true)}>
				Present full screen
			</button>
		</div>
	{/if}
</div>

{#if presenting}
	<div class="qr-present" role="dialog" aria-label="Registration QR code">
		<button class="qr-close" onclick={() => (presenting = false)} aria-label="Close">✕</button>
		{#if name}<h1 class="qr-title">{name}</h1>{/if}
		<p class="qr-sub">Scan to register</p>
		<div class="qr-sheet"><canvas bind:this={bigCanvas}></canvas></div>
		<p class="qr-big-url">{displayUrl}</p>
		<p class="qr-hint">Esc to exit · Ctrl+P to print this screen</p>
	</div>
{/if}

<style>
	.qr-card {
		display: flex;
		align-items: center;
		gap: 1.1rem;
		flex-wrap: wrap;
	}
	.qr-frame {
		background: #fff;
		border-radius: 8px;
		padding: 0.5rem;
		line-height: 0;
		flex: none;
	}
	.qr-side {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		align-items: flex-start;
	}
	.qr-head {
		margin: 0;
		font-weight: 700;
		font-size: 1.05rem;
	}
	.qr-url {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		color: var(--cyan);
		margin: 0;
		word-break: break-all;
	}
	.qr-fail {
		color: var(--dim);
		font-size: 0.9rem;
	}

	/* Large-format presentation: a white sheet so it reads as a printout and
	 * scans off a TV from across a room. */
	.qr-present {
		position: fixed;
		inset: 0;
		z-index: 60;
		background: #fff;
		color: #04140a;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 2rem;
		text-align: center;
	}
	.qr-title {
		margin: 0;
		font-size: clamp(1.6rem, 4.5vw, 3.2rem);
		color: #04140a;
	}
	.qr-sub {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(0.85rem, 1.8vw, 1.2rem);
		letter-spacing: 0.18em;
		text-transform: uppercase;
		color: #1a5c33;
	}
	.qr-sheet {
		line-height: 0;
	}
	.qr-sheet canvas {
		width: min(62vh, 82vw) !important;
		height: min(62vh, 82vw) !important;
	}
	.qr-big-url {
		margin: 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: clamp(0.9rem, 2vw, 1.4rem);
		color: #04140a;
		word-break: break-all;
	}
	.qr-hint {
		margin: 0.4rem 0 0;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.7rem;
		color: #8a938c;
	}
	.qr-close {
		position: absolute;
		top: 1rem;
		right: 1.2rem;
		background: none;
		border: 1px solid #c5cdc7;
		border-radius: 6px;
		color: #04140a;
		font-size: 1rem;
		padding: 0.3rem 0.65rem;
		cursor: pointer;
	}
	@media print {
		.qr-close,
		.qr-hint {
			display: none;
		}
	}
</style>
