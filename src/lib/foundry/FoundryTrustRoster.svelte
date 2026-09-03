<script lang="ts">
	/**
	 * THE TRUSTED PUBLISHER ROSTER (0173, decision 06). Admin only.
	 *
	 * WHAT BEING ON IT DOES, and it is exactly one thing: this student's
	 * submit publishes instead of queueing, and the build shows up in the
	 * review queue's "Live, not yet reviewed" list to be read afterwards. It
	 * grants no read, no other write, and no reach at anybody else's app.
	 *
	 * BY ADDRESS, NOT BY APP, AND THE REASON IS IN transports.ts: these
	 * surfaces never carry an author's email, and a client-reachable
	 * name-to-address lookup is the school directory this codebase refuses.
	 * So it is managed the way `app_admins` and `gauntlet_authors` are.
	 *
	 * THE ROSTER IS ADMIN-ONLY IN THE DATABASE, not here.
	 * `foundry_trusted_roster()` answers nothing at all to anybody who is not
	 * an admin, so this panel renders an empty list rather than a leak if it
	 * is ever mounted somewhere it should not be. That is the boundary; the
	 * absent transports are the convenience.
	 *
	 * REVOKING IS TWO STEPS AND SAYS WHAT IT DOES NOT DO. Nothing already
	 * published comes down -- 0173's own comment says so and so does this --
	 * because an admin who expected a revoke to unpublish would be wrong in a
	 * way nothing on screen corrects.
	 */
	import Pending from '$lib/Pending.svelte';
	import { pendingLabel } from '$lib/pending';

	import type { FoundryTrustTransports, FoundryTrustedRow } from './transports.ts';

	let {
		rows = [],
		transports = {},
		onChanged
	}: {
		rows?: FoundryTrustedRow[];
		transports?: FoundryTrustTransports;
		/** The roster moved; the route re-reads it. */
		onChanged?: () => void;
	} = $props();

	let email = $state('');
	let note = $state('');
	let busy = $state(false);
	let problem = $state<string | null>(null);
	let said = $state<string | null>(null);
	let armed = $state<string | null>(null);

	/**
	 * ONE PREDICATE, read by the control and by the handler. Two spellings of
	 * "is this ready" is what produces a press that does nothing.
	 */
	const canGrant = $derived(email.trim().length > 3 && email.includes('@') && !busy);

	async function grant() {
		if (!canGrant || !transports.grantTrust) return;
		busy = true;
		problem = null;
		said = null;
		try {
			const r = await transports.grantTrust(email.trim(), note.trim() || null);
			if (!r.ok) {
				problem = r.message ?? 'That did not go through.';
				return;
			}
			said = `${email.trim()} publishes straight to the gallery from now on.`;
			email = '';
			note = '';
			onChanged?.();
		} finally {
			busy = false;
		}
	}

	async function revoke(address: string) {
		if (!transports.revokeTrust) return;
		busy = true;
		problem = null;
		said = null;
		try {
			const r = await transports.revokeTrust(address);
			if (!r.ok) {
				problem = r.message ?? 'That did not go through.';
				return;
			}
			armed = null;
			said = `${address} goes back through the queue. Anything already published stays up.`;
			onChanged?.();
		} finally {
			busy = false;
		}
	}

	function stamp(iso: string): string {
		const d = new Date(iso);
		return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
	}
</script>

<section class="fdy-trust" data-testid="foundry-trust-roster">
	<h3>Trusted publishers</h3>
	<p class="fdy-trust-lead">
		A trusted student's app goes live the moment they submit it, and turns up under
		"Live, not yet reviewed" for you to read afterwards. It changes nothing else about
		what they can do.
	</p>

	{#if transports.grantTrust}
		<div class="fdy-trust-add">
			<label class="fdy-trust-field">
				<span>Bosco Tech address</span>
				<input
					type="email"
					bind:value={email}
					maxlength="200"
					autocomplete="off"
					placeholder="student@boscotech.net"
					disabled={busy}
				/>
			</label>
			<label class="fdy-trust-field">
				<span>Note (optional)</span>
				<input type="text" bind:value={note} maxlength="200" disabled={busy} />
			</label>
			<button
				type="button"
				class="btn fdy-trust-do tap-44"
				aria-disabled={!canGrant ? 'true' : undefined}
				onclick={grant}
			>
				Trust them
			</button>
		</div>
	{/if}

	{#if busy}
		<Pending label={pendingLabel('Writing')} />
	{/if}
	{#if problem}
		<p class="fdy-trust-problem" role="status">{problem}</p>
	{/if}
	{#if said}
		<p class="fdy-trust-said" role="status">{said}</p>
	{/if}

	{#if rows.length === 0}
		<p class="fdy-trust-empty">
			Nobody is trusted yet, so every submission goes through the queue.
		</p>
	{:else}
		<ul class="fdy-trust-list">
			{#each rows as row (row.email)}
				<li class="fdy-trust-row">
					<div class="fdy-trust-who">
						<span class="fdy-trust-email">{row.email}</span>
						<span class="fdy-trust-meta">
							Since {stamp(row.granted_at)}{row.granted_by ? ` · by ${row.granted_by}` : ''}
						</span>
						{#if row.note}<span class="fdy-trust-note">{row.note}</span>{/if}
					</div>
					{#if transports.revokeTrust}
						<div class="fdy-trust-act">
							{#if armed === row.email}
								<button
									type="button"
									class="btn fdy-trust-danger tap-44"
									disabled={busy}
									onclick={() => revoke(row.email)}
								>
									Yes, stop trusting
								</button>
								<button type="button" class="btn tap-44" onclick={() => (armed = null)}>
									Keep it
								</button>
							{:else}
								<button
									type="button"
									class="btn tap-44"
									disabled={busy}
									onclick={() => (armed = row.email)}
								>
									Stop trusting
								</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.fdy-trust {
		margin-top: 1.25rem;
		padding: 1rem;
		background: var(--surface-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 8px);
	}

	.fdy-trust h3 {
		margin: 0 0 0.4rem;
		font-family: var(--font-display);
		color: var(--text-1);
	}

	.fdy-trust-lead,
	.fdy-trust-empty {
		margin: 0 0 0.9rem;
		color: var(--text-2);
		font-size: 0.92rem;
	}

	.fdy-trust-add {
		display: grid;
		gap: 0.6rem;
		margin-bottom: 0.9rem;
	}

	.fdy-trust-field span {
		display: block;
		font-size: 0.8rem;
		color: var(--text-2);
		margin-bottom: 0.2rem;
	}

	.fdy-trust-field input {
		width: 100%;
		min-height: 44px;
		padding: 0 0.6rem;
		background: var(--surface-2);
		color: var(--text-1);
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 4px);
		font-family: var(--font-display);
	}

	.fdy-trust-do {
		justify-self: start;
	}

	.fdy-trust-list {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.5rem;
	}

	.fdy-trust-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.55rem 0.7rem;
		background: var(--surface-2);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
		min-width: 0;
	}

	.fdy-trust-who {
		min-width: 0;
	}

	.fdy-trust-email {
		display: block;
		color: var(--text-1);
		font-family: var(--font-mono);
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}

	.fdy-trust-meta {
		display: block;
		font-size: 0.78rem;
		color: var(--text-2);
	}

	.fdy-trust-note {
		display: block;
		margin-top: 0.2rem;
		font-size: 0.85rem;
		color: var(--text-2);
	}

	.fdy-trust-act {
		display: flex;
		gap: 0.4rem;
		flex-wrap: wrap;
	}

	.fdy-trust-danger {
		color: var(--fg-st-quench-ink, var(--text-1));
		border-color: var(--fg-st-quench-edge, var(--boundary));
	}

	.fdy-trust-problem {
		margin: 0 0 0.6rem;
		color: var(--fg-error, var(--crimson));
	}

	.fdy-trust-said {
		margin: 0 0 0.6rem;
		color: var(--fg-st-live-ink, var(--green));
	}
</style>
