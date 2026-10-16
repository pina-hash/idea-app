<script lang="ts">
	/**
	 * ONE PERSON'S PROFILE PICTURE, OFF OR ON (ledger 0392, migration 0267). An
	 * admin's control, mounted only where the caller handed in transports:
	 * absence is the mechanism, so a teacher who is not an admin has no control
	 * to find. It asks the database once on mount; a null answer (not an admin,
	 * or the migration not applied) renders nothing at all.
	 *
	 * Turning a picture off takes two presses and an optional reason, and says
	 * what it does before the second press: the picture becomes their initials
	 * everywhere, and they cannot set a new one until it is turned back on.
	 */
	import { onMount } from 'svelte';
	import {
		AVATAR_HOLD_REASON_MAX,
		holdRefusalSentence,
		holdWhen,
		type AvatarHoldStatus,
		type AvatarModerationTransports
	} from '$lib/avatar-moderation';

	let {
		email,
		name,
		transports,
		onchange
	}: {
		email: string;
		name: string;
		transports: AvatarModerationTransports;
		/** Told the new state after a landed change, so the page can redraw the picture. */
		onchange?: (hidden: boolean) => void;
	} = $props();

	let status = $state<AvatarHoldStatus | null>(null);
	let armed = $state(false);
	let reason = $state('');
	let busy = $state(false);
	let notice = $state('');
	let problem = $state('');

	onMount(() => {
		transports.status(email).then((s) => {
			status = s;
			if (s) onchange?.(s.hidden);
		});
	});

	async function run(kind: 'hide' | 'restore') {
		if (busy) return;
		busy = true;
		problem = '';
		notice = '';
		try {
			const r = kind === 'hide' ? await transports.hide(email, reason.trim() || null) : await transports.restore(email);
			if (!r.ok) {
				problem = holdRefusalSentence(r);
				return;
			}
			armed = false;
			reason = '';
			status = await transports.status(email);
			const hidden = kind === 'hide';
			onchange?.(hidden);
			notice = hidden
				? `${name}'s profile picture is off. Everyone now sees their initials.`
				: `${name}'s profile picture is back on, exactly as it was.`;
		} finally {
			busy = false;
		}
	}
</script>

{#if status && status.account}
	<div class="ahc" data-testid="avatar-hold" data-hidden={status.hidden ? 'true' : 'false'}>
		{#if status.hidden}
			<p class="ahc-state" data-testid="avatar-hold-state">
				<svg class="ahc-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c5 0 9 4.5 10 7a12.6 12.6 0 0 1-3.2 4.3M6.6 6.6C4.4 8 2.8 10.1 2 12c1 2.5 5 7 10 7a9.5 9.5 0 0 0 4.4-1.1" /></svg>
				<span>
					Profile picture turned off{status.hiddenAt ? ` ${holdWhen(status.hiddenAt)}` : ''}{status.hiddenBy ? ` by ${status.hiddenBy}` : ''}.
					{#if status.reason}<span class="ahc-reason">Reason: {status.reason}</span>{/if}
				</span>
			</p>
			<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => run('restore')} data-testid="avatar-hold-restore">
				Turn picture back on
			</button>
		{:else if !armed}
			<button type="button" class="btn secondary tiny" onclick={() => (armed = true)} data-testid="avatar-hold-arm">
				Turn off profile picture
			</button>
		{:else}
			<div class="ahc-confirm" data-testid="avatar-hold-confirm">
				<p class="ahc-cost">
					Their picture becomes their initials everywhere on the site, and they cannot set a new one until it is turned
					back on. The picture itself is kept, so turning it back on restores it exactly.
				</p>
				<label class="ahc-label">
					<span>Reason (optional, only admins see it)</span>
					<input type="text" bind:value={reason} maxlength={AVATAR_HOLD_REASON_MAX} data-testid="avatar-hold-reason" />
				</label>
				<div class="ahc-keys">
					<button type="button" class="btn tiny" disabled={busy} onclick={() => run('hide')} data-testid="avatar-hold-go">
						Turn it off
					</button>
					<button type="button" class="btn secondary tiny" disabled={busy} onclick={() => (armed = false)}>Cancel</button>
				</div>
			</div>
		{/if}
		<p class="ahc-live" role="status" aria-live="polite" data-testid="avatar-hold-notice">{notice}</p>
		{#if problem}<p class="ahc-problem" role="alert" data-testid="avatar-hold-problem">{problem}</p>{/if}
	</div>
{/if}

<style>
	.ahc {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.4rem 0.7rem;
		margin-top: 0.4rem;
	}
	.ahc .btn {
		min-height: 44px;
	}
	.ahc-state {
		display: flex;
		align-items: flex-start;
		gap: 0.4rem;
		margin: 0;
		color: var(--text-1);
		font-size: 0.95rem;
	}
	.ahc-mark {
		flex: none;
		width: 1.1rem;
		height: 1.1rem;
		margin-top: 0.15rem;
		fill: none;
		stroke: var(--amber);
		stroke-width: 2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}
	.ahc-reason {
		display: block;
		color: var(--text-2);
	}
	.ahc-confirm {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		width: 100%;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--boundary);
		border-left: 3px solid var(--amber);
		border-radius: var(--radius-card, 10px);
	}
	.ahc-cost {
		margin: 0;
		color: var(--text-1);
	}
	.ahc-label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		color: var(--text-2);
		font-size: 0.9rem;
	}
	.ahc-label input {
		min-height: 44px;
		box-sizing: border-box;
	}
	.ahc-keys {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	.ahc-live,
	.ahc-problem {
		margin: 0;
		width: 100%;
		font-size: 0.92rem;
	}
	.ahc-live {
		color: var(--text-1);
	}
	.ahc-problem {
		color: var(--amber);
	}
	@media print {
		.ahc {
			display: none !important;
		}
	}
</style>
