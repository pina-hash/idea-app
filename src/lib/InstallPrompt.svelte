<script lang="ts">
	/**
	 * THE ONE-TIME PHONE POP-UP (unchanged behaviour since before ledger 0396):
	 * phones only, shown once, and gone for good when dismissed or installed.
	 * - iOS has no programmatic install, so it shows the Share, then Add to Home
	 *   Screen steps.
	 * - Android Chromium offers `beforeinstallprompt`; the pop-up shows an
	 *   Install key that opens the browser's own dialog.
	 *
	 * IT NO LONGER LISTENS FOR THE EVENT ITSELF (ledger 0396). It used to add its
	 * own `beforeinstallprompt` listener on mount, which could miss an event fired
	 * before mount and would have raced the home header's Install app key for the
	 * one event a page gets. Both now read `$lib/install-app`, whose mailbox is
	 * filled by the single listener in `src/app.html`. Its dismissal is ITS OWN
	 * memory (`INSTALL_POPUP_DISMISSED_KEY`): dismissing the pop-up never hides
	 * the header key, which reads nothing from storage.
	 *
	 * WHILE THE HEADER KEY'S CARD IS OPEN IT STEPS ASIDE (`installCardOpen`), so
	 * the same Share steps are never on screen twice, and comes back when the
	 * card closes. That is page state: its once-and-dismissed memory is not
	 * touched by it.
	 *
	 * Everything that touches window or storage runs in `onMount`, so the server
	 * render never reads a browser global.
	 */
	import { onMount } from 'svelte';
	import InstallSteps from '$lib/InstallSteps.svelte';
	import {
		INSTALL_COPY,
		INSTALL_POPUP_DISMISSED_KEY,
		UNKNOWN_INSTALL,
		installCardOpen,
		installPopupMode,
		promptInstall,
		readInstall,
		subscribeInstall,
		type InstallSnapshot
	} from '$lib/install-app';

	let snapshot = $state<InstallSnapshot>(UNKNOWN_INSTALL);
	/* Until storage has been read, treat the pop-up as dismissed, so it never
	   flashes on for somebody who already said no. */
	let dismissed = $state(true);
	/* The header key's card is open: step aside, without dismissing. */
	let stepAside = $state(false);
	const platform = $derived(installPopupMode(snapshot, dismissed));

	function alreadyHandled(): boolean {
		try {
			return localStorage.getItem(INSTALL_POPUP_DISMISSED_KEY) === '1';
		} catch {
			// Private mode / disabled storage: fail open so we do not nag.
			return true;
		}
	}

	function remember() {
		try {
			localStorage.setItem(INSTALL_POPUP_DISMISSED_KEY, '1');
		} catch {
			// Storage unavailable; nothing to persist.
		}
	}

	function dismiss() {
		dismissed = true;
		remember();
	}

	async function install() {
		try {
			await promptInstall();
		} finally {
			// One-shot: the event cannot be reused. Remember either way so we do
			// not re-prompt on the next visit.
			dismiss();
		}
	}

	onMount(() => {
		dismissed = alreadyHandled();
		snapshot = readInstall();
		stepAside = installCardOpen();
		return subscribeInstall(() => {
			stepAside = installCardOpen();
			const next = readInstall();
			// Installed some other way (the header key, the browser menu): stop nagging.
			if (next.installed && !snapshot.installed) remember();
			snapshot = next;
		});
	});
</script>

{#if platform && !stepAside}
	<div class="install-prompt" role="dialog" aria-label="Install the IDEA app" data-install="popup">
		<div class="ip-body">
			<span class="ip-title">{INSTALL_COPY.title}</span>
			{#if platform === 'ios'}
				<p class="ip-copy"><InstallSteps steps={INSTALL_COPY.ios} /></p>
			{:else}
				<p class="ip-copy">{INSTALL_COPY.androidBody}</p>
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
	/* Under Space White the prompt lifts on the theme's hard elevation rather
	   than a dark halo (ledger 0297, package F1b). */
	:global(:root[data-theme='space-white']) .install-prompt {
		box-shadow: var(--elevation-2);
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
