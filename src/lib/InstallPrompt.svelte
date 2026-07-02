<script lang="ts">
	// Platform-detected PWA install prompt, mobile only. Shown once, dismissible,
	// remembered in localStorage so it never reappears once dismissed or installed.
	// - iOS (Safari) has no programmatic install, so we show Add to Home Screen
	//   instructions (tap Share, then "Add to Home Screen").
	// - Android/Chromium fires `beforeinstallprompt`; we stash it and expose an
	//   Install button that calls prompt().
	// Everything that touches window/navigator/localStorage is guarded so SSR
	// never crashes: the module top level references no browser globals.
	import { browser } from '$app/environment';
	import { onMount } from 'svelte';

	const STORAGE_KEY = 'idea_pwa_prompt_dismissed';

	type Platform = 'ios' | 'android' | null;

	let platform = $state<Platform>(null);
	let visible = $state(false);
	// The stashed BeforeInstallPromptEvent (Android). Typed loosely since the
	// event is not in the standard lib DOM typings.
	let deferredPrompt: (Event & { prompt: () => Promise<void> }) | null = null;

	function isStandalone(): boolean {
		if (!browser) return false;
		const displayStandalone =
			typeof window.matchMedia === 'function' &&
			window.matchMedia('(display-mode: standalone)').matches;
		// iOS Safari exposes navigator.standalone when launched from the home screen.
		const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
		return displayStandalone || iosStandalone;
	}

	function isIos(): boolean {
		if (!browser) return false;
		const ua = navigator.userAgent || '';
		const iOsDevice = /iPhone|iPad|iPod/.test(ua);
		// iPadOS 13+ reports as Mac; distinguish it by touch support.
		const iPadOs = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
		return iOsDevice || iPadOs;
	}

	function isAndroid(): boolean {
		if (!browser) return false;
		return /Android/.test(navigator.userAgent || '');
	}

	function alreadyHandled(): boolean {
		if (!browser) return true;
		try {
			return localStorage.getItem(STORAGE_KEY) === '1';
		} catch {
			// Private mode / disabled storage: fail open so we do not nag.
			return true;
		}
	}

	function remember() {
		if (!browser) return;
		try {
			localStorage.setItem(STORAGE_KEY, '1');
		} catch {
			// Storage unavailable; nothing to persist.
		}
	}

	function dismiss() {
		visible = false;
		remember();
	}

	async function install() {
		if (!deferredPrompt) return;
		try {
			await deferredPrompt.prompt();
		} finally {
			// One-shot: the event cannot be reused. Remember either way so we do
			// not re-prompt on the next visit.
			deferredPrompt = null;
			dismiss();
		}
	}

	onMount(() => {
		// Desktop, standalone, or already handled: never show.
		if (isStandalone() || alreadyHandled()) return;

		if (isIos()) {
			platform = 'ios';
			visible = true;
			return;
		}

		if (isAndroid()) {
			const onBeforeInstall = (e: Event) => {
				e.preventDefault();
				deferredPrompt = e as Event & { prompt: () => Promise<void> };
				platform = 'android';
				visible = true;
			};
			window.addEventListener('beforeinstallprompt', onBeforeInstall);

			// If the app gets installed some other way, stop nagging.
			const onInstalled = () => {
				visible = false;
				remember();
			};
			window.addEventListener('appinstalled', onInstalled);

			return () => {
				window.removeEventListener('beforeinstallprompt', onBeforeInstall);
				window.removeEventListener('appinstalled', onInstalled);
			};
		}
	});
</script>

{#if visible && platform}
	<div class="install-prompt" role="dialog" aria-label="Install the IDEA app">
		<div class="ip-body">
			<span class="ip-title">Install IDEA</span>
			{#if platform === 'ios'}
				<p class="ip-copy">
					Tap the Share icon, then "Add to Home Screen" to install IDEA on your device.
				</p>
			{:else}
				<p class="ip-copy">Add IDEA to your home screen for quick, full-screen access.</p>
			{/if}
		</div>
		<div class="ip-actions">
			{#if platform === 'android'}
				<button type="button" class="ip-install" onclick={install}>Install</button>
			{/if}
			<button type="button" class="ip-dismiss" onclick={dismiss} aria-label="Dismiss">
				{platform === 'ios' ? 'Got it' : 'Not now'}
			</button>
		</div>
	</div>
{/if}

<style>
	.install-prompt {
		position: fixed;
		left: 0.75rem;
		right: 0.75rem;
		bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		padding: 0.85rem 1rem;
		background: var(--bg1);
		border: 1px solid var(--green);
		border-radius: 10px;
		box-shadow: 0 0 24px rgba(0, 0, 0, 0.55);
	}

	.ip-body {
		min-width: 0;
	}

	.ip-title {
		display: block;
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.8rem;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--green);
	}

	.ip-copy {
		margin: 0.2rem 0 0;
		font-family: 'Rajdhani', sans-serif;
		font-size: 0.95rem;
		line-height: 1.3;
		color: var(--white);
	}

	.ip-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.ip-install,
	.ip-dismiss {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.78rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 0.5rem 0.85rem;
		border-radius: 6px;
		cursor: pointer;
		white-space: nowrap;
	}

	.ip-install {
		background: var(--green);
		color: var(--bg0);
		border: 1px solid var(--green);
	}

	.ip-dismiss {
		background: transparent;
		color: var(--dim);
		border: 1px solid var(--dim);
	}

	.ip-dismiss:hover {
		color: var(--white);
		border-color: var(--white);
	}
</style>
