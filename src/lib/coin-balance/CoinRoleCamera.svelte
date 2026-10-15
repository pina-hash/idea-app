<script lang="ts">
	import './coin-page.css';
	import { onMount, tick } from 'svelte';
	import { coinWhen } from '$lib/coin-balance';
	import { roleCaptureRefusalWords } from './role';
	import type { CoinActionResult } from './extras';
	import type { CoinUploadResult } from './uploads';

	/**
	 * ONE ROLE PHOTO, TAKEN LIVE (2.5, 0247). The camera opens on a press,
	 * never on arrival; Capture draws the frame on screen to a canvas and sends
	 * it as a JPEG. The time recorded is the server's, the moment the photo
	 * arrives, never anything inside the picture.
	 *
	 * Where there is no camera, or the browser refuses it, the fallback is a
	 * camera-only file input (`capture="environment"`, never `multiple`), so a
	 * phone opens its camera and no camera roll is offered.
	 *
	 * THE STREAM IS STOPPED on unmount, whenever the tab hides, and after each
	 * capture, so the light never stays on. Every listener is added with
	 * `addEventListener` and removed in the same cleanup.
	 *
	 * Without `upload` and `capture` there is nothing to send and nothing renders.
	 */
	let {
		holderId,
		upload = null,
		capture = null,
		openCamera = null,
		ondone = null
	}: {
		holderId: string;
		upload?: ((file: Blob & { name?: string }) => Promise<CoinUploadResult>) | null;
		capture?: ((holderId: string, path: string) => Promise<CoinActionResult>) | null;
		openCamera?: (() => Promise<MediaStream>) | null;
		ondone?: (() => void) | null;
	} = $props();

	let mode = $state<'idle' | 'opening' | 'live' | 'fallback'>('idle');
	let refused = $state(false);
	const phase = $derived(openCamera ? mode : 'fallback');
	const fallbackWhy = $derived(
		refused
			? 'The camera did not open (it may be blocked for this site). Take the photo with your camera below instead.'
			: !openCamera
				? 'This browser has no camera this page can use, so take the photo with your camera below.'
				: null
	);
	let busy = $state(false);
	let outcome = $state<{ ok: boolean; text: string } | null>(null);
	let video = $state<HTMLVideoElement | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let stream: MediaStream | null = null;

	function stop() {
		if (stream) {
			for (const t of stream.getTracks()) t.stop();
			stream = null;
		}
		if (video) video.srcObject = null;
		if (mode === 'live' || mode === 'opening') mode = 'idle';
	}

	onMount(() => {
		const onVis = () => {
			if (document.visibilityState === 'hidden') stop();
		};
		document.addEventListener('visibilitychange', onVis);
		window.addEventListener('pagehide', stop);
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			window.removeEventListener('pagehide', stop);
			stop();
		};
	});

	async function open() {
		if (!openCamera || mode === 'opening' || mode === 'live') return;
		outcome = null;
		mode = 'opening';
		try {
			stream = await openCamera();
			mode = 'live';
			await tick();
			if (video) {
				video.srcObject = stream;
				await video.play().catch(() => {});
			}
		} catch {
			stop();
			refused = true;
			mode = 'fallback';
		}
	}

	async function send(blob: Blob & { name?: string }) {
		if (!upload || !capture) return;
		busy = true;
		try {
			const up = await upload(blob);
			if (!up.ok) {
				outcome = { ok: false, text: up.words };
				return;
			}
			const r = await capture(holderId, up.path);
			if (r.ok) {
				const at = typeof r.data.taken_at === 'string' ? coinWhen(r.data.taken_at) : '';
				outcome = { ok: true, text: `Recorded${at ? ` at ${at}` : ''}, by the server's clock.` };
				ondone?.();
			} else {
				outcome = { ok: false, text: roleCaptureRefusalWords(r) };
			}
		} catch {
			outcome = { ok: false, text: roleCaptureRefusalWords({ reason: 'error' }) };
		} finally {
			busy = false;
		}
	}

	async function snap() {
		if (busy || !video || phase !== 'live') return;
		const w = video.videoWidth;
		const h = video.videoHeight;
		if (!w || !h) {
			outcome = { ok: false, text: 'The camera is still starting. Wait a moment, then press Capture again.' };
			return;
		}
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const ctx = canvas.getContext('2d');
		if (!ctx) {
			outcome = { ok: false, text: roleCaptureRefusalWords({ reason: 'error' }) };
			return;
		}
		ctx.drawImage(video, 0, 0, w, h);
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
		if (!blob) {
			outcome = { ok: false, text: 'The photo could not be made. Try Capture again.' };
			return;
		}
		stop();
		await send(Object.assign(blob, { name: 'role-photo.jpg' }));
	}

	async function picked(e: Event & { currentTarget: HTMLInputElement }) {
		const f = e.currentTarget.files?.[0];
		if (!f) return;
		await send(f);
		if (fileInput) fileInput.value = '';
	}
</script>

{#if upload && capture}
	<div class="cpx-panel" data-testid="role-camera" data-phase={phase}>
		{#if phase === 'live' || phase === 'opening'}
			<!-- svelte-ignore a11y_media_has_caption -->
			<video class="cpx-pic role-video" bind:this={video} autoplay playsinline muted data-testid="role-video"></video>
			<div class="cpx-row">
				<button
					type="button"
					class="btn cpx-key"
					aria-disabled={busy || phase !== 'live' ? 'true' : undefined}
					data-testid="role-capture"
					onclick={snap}>{busy ? 'Sending...' : 'Capture'}</button
				>
				<button type="button" class="btn secondary cpx-key" data-testid="role-camera-stop" onclick={stop}>Close the camera</button>
			</div>
		{:else if phase === 'idle'}
			<button type="button" class="btn cpx-key" data-testid="role-camera-open" onclick={open}>Open the camera</button>
		{:else}
			{#if fallbackWhy}<p class="cpx-note" data-testid="role-fallback-why">{fallbackWhy}</p>{/if}
			<label class="cpx-field">
				<span>Take the photo</span>
				<input
					type="file"
					accept="image/*"
					capture="environment"
					onchange={picked}
					bind:this={fileInput}
					data-testid="role-file"
				/>
			</label>
		{/if}
		<p class="cpx-outcome" class:ok={outcome?.ok} class:no={outcome && !outcome.ok} role="status" data-testid="role-capture-outcome">
			{outcome?.text ?? ''}
		</p>
	</div>
{/if}

<style>
	.role-video {
		width: 100%;
		max-height: 60vh;
		background: var(--bg0);
	}
</style>
