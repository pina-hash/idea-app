<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		captureFileName,
		captureFrame,
		cameraErrorMessage,
		hasMultipleCameras,
		openCameraStream,
		stopStream,
		type CameraFacing
	} from './camera';

	/**
	 * In-app camera: a live preview the student shoots from without ever
	 * leaving the page.
	 *
	 * DELIBERATELY THE SECONDARY PATH, not the default. The OS camera app
	 * reached through the file input produces a far better photo of a page --
	 * full sensor resolution, autofocus, HDR, multi-frame stacking -- and iOS
	 * Safari serves getUserMedia at roughly 720p no matter what resolution is
	 * asked for, which is under a megapixel and genuinely marginal for reading
	 * handwriting. Making this the default would trade the thing the feature
	 * exists for (a legible page) against the thing it fixes.
	 *
	 * What it DOES fix is the one thing the file input cannot: WHICH CAMERA.
	 * Android browsers honour the presence of the `capture` attribute but not
	 * its value, so `capture="environment"` gets you the camera app with
	 * whichever lens it last used -- the front one, if that is where the
	 * student left it. Here the facing mode is a real constraint and there is
	 * a switch button, so a student staring at their own face has somewhere to
	 * go. It also never backgrounds the page, which sidesteps the Android
	 * low-memory tab eviction that can eat a capture whole.
	 *
	 * Every failure reports out through `onError` rather than being handled
	 * here, so the parent can put the student back on the file input, which is
	 * always still on screen behind this.
	 */

	let {
		onCapture,
		onCancel,
		onError
	}: {
		onCapture: (file: File) => void;
		onCancel: () => void;
		onError: (message: string) => void;
	} = $props();

	let videoEl = $state<HTMLVideoElement | null>(null);
	let stream: MediaStream | null = null;
	let facing = $state<CameraFacing>('environment');
	let starting = $state(true);
	let shooting = $state(false);
	let canSwitch = $state(false);
	let notice = $state<string | null>(null);
	/** Set on teardown so an in-flight start() cannot attach a live stream. */
	let closed = false;

	onMount(() => {
		void start('environment');
	});

	onDestroy(() => {
		closed = true;
		stopStream(stream);
		stream = null;
	});

	async function start(next: CameraFacing) {
		starting = true;
		notice = null;
		// Release the old camera FIRST: a phone will not hand out the back
		// camera while the front one is still held, so switching without this
		// fails on exactly the devices the switch button exists for.
		stopStream(stream);
		stream = null;
		try {
			const opened = await openCameraStream(next);
			if (closed) {
				stopStream(opened);
				return;
			}
			stream = opened;
			facing = next;
			if (videoEl) {
				videoEl.srcObject = opened;
				// Safari does not reliably autoplay a srcObject without this,
				// and a rejected play() is not fatal (the poster frame updates
				// anyway once the track delivers), so it is not awaited.
				void videoEl.play().catch(() => {});
			}
			canSwitch = await hasMultipleCameras();
			// The facing mode is a request, not a promise: a browser that
			// cannot honour it falls back rather than failing, so say what was
			// actually opened instead of asserting it is the rear camera.
			const settings = opened.getVideoTracks()[0]?.getSettings?.();
			if (next === 'environment' && settings?.facingMode && settings.facingMode !== 'environment') {
				notice = canSwitch
					? 'This device opened a different camera. Use switch if you are looking at yourself.'
					: 'This device opened a different camera.';
			}
		} catch (err) {
			if (closed) return;
			onError(cameraErrorMessage(err));
			return;
		} finally {
			if (!closed) starting = false;
		}
	}

	async function shoot() {
		if (shooting || starting || !videoEl) return;
		shooting = true;
		try {
			const file = await captureFrame(videoEl, captureFileName());
			if (!file) {
				notice = 'That frame could not be saved. Try again, or choose a photo instead.';
				return;
			}
			onCapture(file);
		} finally {
			shooting = false;
		}
	}

	function switchCamera() {
		if (starting || shooting) return;
		void start(facing === 'environment' ? 'user' : 'environment');
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			onCancel();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div class="cc-overlay" role="dialog" aria-modal="true" aria-label="Take a photo">
	<header class="cc-head">
		<span class="cc-title">Take a photo</span>
		<p class="cc-hint">Fill the frame with the page, then tap the shutter.</p>
	</header>

	<div class="cc-stage">
		<!-- playsinline is load-bearing on iOS: without it the video takes over
		     the screen in the native fullscreen player and the shutter button
		     is unreachable. muted is what makes autoplay permissible. -->
		<video bind:this={videoEl} playsinline muted autoplay data-testid="cc-video"></video>
		{#if starting}
			<p class="cc-status">Starting camera...</p>
		{/if}
	</div>

	{#if notice}
		<p class="cc-notice" role="status" data-testid="cc-notice">{notice}</p>
	{/if}

	<footer class="cc-actions">
		<button type="button" class="cc-secondary" data-testid="cc-cancel" onclick={onCancel}>
			Cancel
		</button>
		<button
			type="button"
			class="cc-shutter"
			data-testid="cc-shoot"
			onclick={shoot}
			disabled={starting || shooting}
			aria-label="Take photo"
		>
			<span></span>
		</button>
		{#if canSwitch}
			<button
				type="button"
				class="cc-secondary"
				data-testid="cc-switch"
				onclick={switchCamera}
				disabled={starting || shooting}
			>
				Switch
			</button>
		{:else}
			<span class="cc-spacer" aria-hidden="true"></span>
		{/if}
	</footer>
</div>

<style>
	/* Same dark island as PhotoCorrector, and for the same reason: a live
	   camera frame needs its own surround, and a light one fights it. */
	.cc-overlay {
		position: fixed;
		inset: 0;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		background: rgba(22, 20, 16, 0.98);
		padding: 0.9rem 1rem calc(0.9rem + env(safe-area-inset-bottom, 0px));
	}
	.cc-head {
		flex: none;
	}
	.cc-title {
		font-weight: 700;
		font-size: 1.05rem;
		letter-spacing: -0.01em;
		color: #f5f2e9;
	}
	.cc-hint {
		margin: 0.25rem 0 0;
		color: rgba(245, 242, 233, 0.62);
		font-size: 0.83rem;
	}
	.cc-stage {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 0.6rem 0;
		position: relative;
	}
	.cc-stage video {
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		border: 1px solid rgba(245, 242, 233, 0.16);
		background: #171512;
	}
	.cc-status {
		position: absolute;
		color: rgba(245, 242, 233, 0.62);
		font-size: 0.88rem;
	}
	.cc-notice {
		flex: none;
		margin: 0 0 0.6rem;
		color: var(--nb-accent);
		font-size: 0.82rem;
	}
	.cc-actions {
		flex: none;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.7rem;
	}
	.cc-shutter {
		width: 68px;
		height: 68px;
		border-radius: 50%;
		border: 3px solid #f5f2e9;
		background: transparent;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.cc-shutter span {
		width: 52px;
		height: 52px;
		border-radius: 50%;
		background: #f5f2e9;
	}
	.cc-shutter:disabled {
		opacity: 0.45;
		cursor: default;
	}
	.cc-secondary,
	.cc-spacer {
		min-width: 5.2rem;
		text-align: center;
	}
	.cc-secondary {
		background: none;
		border: 1px solid rgba(245, 242, 233, 0.38);
		border-radius: 6px;
		color: #f5f2e9;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.6rem 0.9rem;
		cursor: pointer;
	}
	.cc-secondary:hover:not(:disabled) {
		border-color: #f5f2e9;
	}
	.cc-secondary:disabled {
		opacity: 0.45;
		cursor: default;
	}
</style>
