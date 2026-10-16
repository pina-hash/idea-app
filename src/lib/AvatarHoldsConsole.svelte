<script lang="ts">
	/**
	 * THE PROFILE PICTURE MODERATION PAGE (ledger 0392, migration 0267). Every
	 * picture currently turned off, with Turn back on, and a way to turn one off
	 * by school address from anywhere, not only from a class's student page.
	 * Mounted by `/admin/avatars` and `/dev/avatar-holds` alike; the route hands
	 * in the real transports, the harness an in-memory stand-in.
	 */
	import { onMount } from 'svelte';
	import Pending from '$lib/Pending.svelte';
	import {
		AVATAR_HOLD_REASON_MAX,
		holdRefusalSentence,
		holdWhen,
		type AvatarHold,
		type AvatarModerationTransports
	} from '$lib/avatar-moderation';

	let { transports }: { transports: AvatarModerationTransports } = $props();

	let holds = $state<AvatarHold[] | null>(null);
	let loaded = $state(false);
	let email = $state('');
	let reason = $state('');
	let armed = $state(false);
	let busy = $state(false);
	let notice = $state('');
	let problem = $state('');

	async function reload() {
		holds = await transports.list();
		loaded = true;
	}
	onMount(() => {
		void reload();
	});

	const canHide = $derived(/^\S+@\S+\.\S+$/.test(email.trim()));

	async function hide() {
		if (busy || !canHide) return;
		busy = true;
		problem = '';
		notice = '';
		try {
			const target = email.trim().toLowerCase();
			const r = await transports.hide(target, reason.trim() || null);
			if (!r.ok) {
				problem = holdRefusalSentence(r);
				return;
			}
			notice = `Turned off the profile picture for ${target}. They now show their initials everywhere.`;
			email = '';
			reason = '';
			armed = false;
			await reload();
		} finally {
			busy = false;
		}
	}

	async function restore(h: AvatarHold) {
		if (busy) return;
		busy = true;
		problem = '';
		notice = '';
		try {
			const r = await transports.restore(h.email);
			if (!r.ok) {
				problem = holdRefusalSentence(r);
				return;
			}
			notice = `Turned ${h.name}'s profile picture back on, exactly as it was.`;
			await reload();
		} finally {
			busy = false;
		}
	}
</script>

<div class="ahx" data-testid="avatar-holds">
	<section class="card ahx-card" aria-labelledby="ahx-h-off">
		<h2 id="ahx-h-off">Turn off a profile picture</h2>
		<p class="ahx-note">
			Their picture becomes their initials on every page of the site, and they cannot set a new one until it is turned
			back on here or on their student page. Nothing is deleted.
		</p>
		<label class="ahx-field">
			<span>School address</span>
			<input type="email" bind:value={email} autocomplete="off" placeholder="name@boscotech.net" data-testid="avatar-holds-email" />
		</label>
		<label class="ahx-field">
			<span>Reason (optional, only admins see it)</span>
			<input type="text" bind:value={reason} maxlength={AVATAR_HOLD_REASON_MAX} data-testid="avatar-holds-reason" />
		</label>
		<div class="ahx-keys">
			{#if !armed}
				<button
					type="button"
					class="btn"
					aria-disabled={!canHide}
					onclick={() => canHide && (armed = true)}
					data-testid="avatar-holds-arm">Turn off picture</button
				>
				{#if !canHide && email.trim()}<span class="ahx-hint">Enter a whole school address.</span>{/if}
			{:else}
				<button type="button" class="btn" disabled={busy} onclick={hide} data-testid="avatar-holds-go"
					>Yes, turn off {email.trim().toLowerCase()}</button
				>
				<button type="button" class="btn secondary" disabled={busy} onclick={() => (armed = false)}>Cancel</button>
			{/if}
		</div>
		<p class="ahx-live" role="status" aria-live="polite" data-testid="avatar-holds-notice">{notice}</p>
		{#if problem}<p class="ahx-problem" role="alert" data-testid="avatar-holds-problem">{problem}</p>{/if}
	</section>

	<section class="card ahx-card" aria-labelledby="ahx-h-list">
		<h2 id="ahx-h-list">Turned off now</h2>
		{#if !loaded}
			<Pending label="Loading the pictures turned off" />
		{:else if holds === null}
			<p class="ahx-note" data-testid="avatar-holds-unavailable">
				Profile picture moderation is not set up on this database yet.
			</p>
		{:else if holds.length === 0}
			<p class="ahx-note" data-testid="avatar-holds-empty">No profile pictures are turned off.</p>
		{:else}
			<ul class="ahx-list">
				{#each holds as h (h.email)}
					<li class="ahx-row" data-testid="avatar-holds-row">
						<div class="ahx-who">
							<span class="ahx-name person-name" title={h.name}>{h.name}</span>
							<span class="ahx-meta">{h.email}</span>
							<span class="ahx-meta">Turned off {holdWhen(h.hiddenAt)}{h.hiddenBy ? ` by ${h.hiddenBy}` : ''}</span>
							{#if h.reason}<span class="ahx-reason">Reason: {h.reason}</span>{/if}
						</div>
						<button type="button" class="btn secondary" disabled={busy} onclick={() => restore(h)} data-testid="avatar-holds-restore"
							>Turn back on</button
						>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

<style>
	.ahx {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.ahx-card {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.ahx-card h2 {
		margin: 0;
		font-size: 1.15rem;
	}
	.ahx-note {
		margin: 0;
		color: var(--text-2);
	}
	.ahx-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		color: var(--text-2);
		font-size: 0.92rem;
	}
	.ahx-field input {
		min-height: 44px;
		box-sizing: border-box;
	}
	.ahx-keys {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.ahx-keys .btn,
	.ahx-row .btn {
		min-height: 44px;
	}
	.ahx-hint {
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.ahx-live,
	.ahx-problem {
		margin: 0;
	}
	.ahx-live {
		color: var(--text-1);
	}
	.ahx-problem {
		color: var(--amber);
	}
	.ahx-list {
		list-style: none;
		margin: 0;
		padding: 0;
	}
	.ahx-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 1rem;
		padding: 0.7rem 0;
		border-top: 1px solid var(--hairline);
	}
	.ahx-row:first-child {
		border-top: none;
	}
	.ahx-who {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
		min-width: 0;
	}
	.ahx-name {
		font-weight: 600;
		color: var(--text-1);
	}
	.ahx-meta,
	.ahx-reason {
		color: var(--text-2);
		font-size: 0.9rem;
	}
</style>
