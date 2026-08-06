<script lang="ts">
	/**
	 * "Match alerts" enable card for competitors: one button that walks the
	 * whole flow (permission -> service worker -> push subscription ->
	 * push_subscribe RPC). Renders nothing when the deployment has no VAPID
	 * key. Subscription is per-browser and account-wide: once on, this device
	 * gets "your next match is set" pushes for any tournament this account
	 * competes in, plus host pings.
	 */
	import { onMount } from 'svelte';
	import type { SupabaseClient } from '@supabase/supabase-js';
	import {
		enablePush,
		hasLocalSubscription,
		pushAvailability,
		type PushAvailability
	} from './push-client';

	let { supabase }: { supabase: SupabaseClient } = $props();

	let availability = $state<PushAvailability>('unconfigured');
	let enabled = $state(false);
	let busy = $state(false);
	let message = $state('');

	onMount(async () => {
		availability = pushAvailability();
		enabled = await hasLocalSubscription();
	});

	async function enable() {
		busy = true;
		message = '';
		const res = await enablePush(supabase);
		busy = false;
		if (res.ok) {
			enabled = true;
			message = 'Alerts are on for this device.';
		} else {
			availability = pushAvailability();
			message = res.error ?? 'Could not enable alerts.';
		}
	}
</script>

{#if availability !== 'unconfigured'}
	<div class="alerts card">
		<div class="alerts-text">
			<span class="alerts-title">Match alerts</span>
			<span class="alerts-note">
				{#if enabled}
					This device gets a push the moment your next match is set.
				{:else}
					Get a push on this device the moment your next match is set.
				{/if}
			</span>
			{#if message}<span class="alerts-msg" class:ok={enabled}>{message}</span>{/if}
		</div>
		{#if enabled}
			<button class="btn secondary" disabled={busy} onclick={enable}>Re-sync</button>
		{:else if availability === 'unsupported'}
			<span class="alerts-msg">Not supported in this browser.</span>
		{:else if availability === 'denied'}
			<span class="alerts-msg">Notifications are blocked in browser settings.</span>
		{:else}
			<button class="btn" disabled={busy} onclick={enable}>
				{busy ? 'Enabling…' : 'Enable notifications'}
			</button>
		{/if}
	</div>
{/if}

<style>
	.alerts {
		display: flex;
		align-items: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 1.1rem;
	}
	.alerts-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1;
	}
	.alerts-title {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--cyan, #00f0ff);
	}
	.alerts-note {
		color: var(--dim, #7a8a7a);
		font-size: 0.88rem;
	}
	.alerts-msg {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.72rem;
		color: var(--amber, #ffb400);
	}
	.alerts-msg.ok {
		color: var(--green, #00ff41);
	}
</style>
