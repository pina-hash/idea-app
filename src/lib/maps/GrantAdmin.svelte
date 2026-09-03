<script lang="ts">
	/**
	 * THE GRANT CONSOLE. Admin only: give a named person a container, read
	 * back who holds what, take one away.
	 *
	 * A GRANT IS SHOWN BY ITS CONTAINMENT PATH, NEVER BY A UUID. Nobody
	 * recognises `9f2c...`, and a grant is a security decision somebody has to
	 * be able to read back and be sure of before they leave the page --
	 * "IDEA Building / Machine Shop" is a thing an admin can check against the
	 * room they meant. `mapsNodePath` is the ONE implementation of that, which
	 * is why 0172's `maps_editor_roster` projects `node_id` and no path: a SQL
	 * twin would be a second answer to "what is this container called".
	 *
	 * IT IS MOUNTED ONLY WHERE THE TRANSPORTS ARE HANDED IN. `MapsGrantTransports`
	 * is a separate injected object (see transports.ts), so a surface given
	 * none renders no console at all -- absence is the mechanism, exactly as it
	 * is for photos and for publish. The database is still the boundary: every
	 * one of the three RPCs refuses a non-admin in its own body, and the
	 * roster answers an EMPTY SET rather than an error, which is the same
	 * answer an empty roster gives.
	 *
	 * THE REFUSAL IS RENDERED VERBATIM. `maps_editor_grant` already words its
	 * own domain refusal for the person who caused it; the browser-side
	 * pre-check uses the SAME sentence (`mapsGrantEmailProblem`), so somebody
	 * who trips it before pressing and somebody who trips it after read one
	 * thing rather than two.
	 */
	import { mapsNodePath, mapsTreeRows, type MapsNode } from './maps';
	import {
		mapsGrantEmailProblem,
		mapsNormalizeGrantEmail,
		type MapsRosterRow
	} from './grants';
	import type { MapsGrantTransports } from './transports';

	let {
		nodes,
		transports
	}: {
		nodes: MapsNode[];
		transports: MapsGrantTransports;
	} = $props();

	let roster = $state<MapsRosterRow[]>([]);
	let loaded = $state(false);
	let loadProblem = $state<string | null>(null);
	let email = $state('');
	let nodeId = $state('');
	let note = $state('');
	let busy = $state(false);
	let problem = $state<string | null>(null);
	let notice = $state<string | null>(null);
	/** Armed revokes, keyed `email|node`. Two steps, like every destructive act here. */
	let armed = $state<string | null>(null);

	/* Every container, deepest path first in the tree's own order, so the
	   picker reads like the tree beside it rather than like a sorted list of
	   names that repeat. */
	const options = $derived(
		mapsTreeRows(nodes).map((row) => ({
			id: row.node.id,
			label: mapsNodePath(nodes, row.node.id)
		}))
	);

	const emailProblem = $derived(email.trim() === '' ? null : mapsGrantEmailProblem(email));
	const canSubmit = $derived(
		!busy && email.trim() !== '' && nodeId !== '' && emailProblem === null
	);

	async function load() {
		const result = await transports.roster(null);
		if (!result.ok) {
			loadProblem = result.message;
			return;
		}
		roster = result.data;
		loaded = true;
		loadProblem = null;
	}

	// The transport is CALLER-SUPPLIED code, so the invocation is untracked
	// and only the transport itself is read tracked -- whatever it touches
	// reactively before its first await would otherwise join this effect's
	// dependency set (CLAUDE.md, the effect_update_depth_exceeded trap).
	$effect(() => {
		const t = transports;
		void t;
		if (!loaded) queueMicrotask(() => void load());
	});

	async function submit() {
		if (!canSubmit) return;
		busy = true;
		problem = null;
		notice = null;
		try {
			const address = mapsNormalizeGrantEmail(email);
			const result = await transports.grant(address, nodeId, note.trim() === '' ? null : note.trim());
			if (!result.ok) {
				problem = result.message;
				return;
			}
			notice = `${address} can now edit drafts in ${mapsNodePath(nodes, nodeId)} and anything inside it.`;
			email = '';
			note = '';
			await load();
		} finally {
			busy = false;
		}
	}

	async function revoke(row: MapsRosterRow) {
		busy = true;
		problem = null;
		notice = null;
		try {
			const result = await transports.revoke(row.email, row.node_id);
			if (!result.ok) {
				problem = result.message;
				return;
			}
			// The acknowledgement renders on the surface that is on screen
			// AFTERWARDS -- this list, which is what the revoke changed.
			notice = `${row.email} can no longer edit ${mapsNodePath(nodes, row.node_id)}. That took effect immediately.`;
			armed = null;
			await load();
		} finally {
			busy = false;
		}
	}

	const rowKey = (r: MapsRosterRow) => `${r.email}|${r.node_id}`;
</script>

<section class="grant-admin" data-testid="maps-grant-admin">
	<h2>Who can edit the map</h2>
	<p class="hint">
		A grant covers <strong>drafts</strong> in one container and everything inside it. It never
		covers publishing, and never anything already on the public map. Taking one back takes effect
		immediately.
	</p>

	<form
		class="grant-form"
		data-testid="maps-grant-form"
		onsubmit={(e) => {
			e.preventDefault();
			void submit();
		}}
	>
		<label class="field">
			<span>Bosco Tech email</span>
			<input
				type="email"
				bind:value={email}
				placeholder="student@boscotech.net"
				data-testid="maps-grant-email"
			/>
		</label>
		<label class="field">
			<span>Container</span>
			<select bind:value={nodeId} data-testid="maps-grant-node">
				<option value="">Choose a container&hellip;</option>
				{#each options as opt (opt.id)}
					<option value={opt.id}>{opt.label}</option>
				{/each}
			</select>
		</label>
		<label class="field">
			<span>Note (optional)</span>
			<input type="text" bind:value={note} placeholder="Cataloguing the tool chests" />
		</label>
		<div class="form-actions">
			<button
				type="submit"
				class="btn"
				aria-disabled={!canSubmit}
				data-testid="maps-grant-submit"
			>
				{busy ? 'Working&hellip;' : 'Grant editing'}
			</button>
		</div>
		{#if emailProblem}
			<p class="problem" role="alert" data-testid="maps-grant-email-problem">{emailProblem}</p>
		{/if}
	</form>

	{#if notice}
		<p class="notice" role="status" data-testid="maps-grant-notice">{notice}</p>
	{/if}
	{#if problem}
		<p class="problem" role="alert" data-testid="maps-grant-problem">{problem}</p>
	{/if}
	{#if loadProblem}
		<p class="problem" role="alert">The grant list could not be read: {loadProblem}</p>
	{/if}

	<h3>Current grants</h3>
	{#if roster.length === 0}
		<p class="hint" data-testid="maps-grant-empty">
			{loaded ? 'Nobody else can edit the map yet.' : 'Reading the grant list…'}
		</p>
	{:else}
		<ul class="roster" data-testid="maps-grant-roster">
			{#each roster as row (rowKey(row))}
				<li class="roster-row">
					<div class="who">
						<span class="email">{row.email}</span>
						<span class="path">{mapsNodePath(nodes, row.node_id)}</span>
						{#if row.note}<span class="note">{row.note}</span>{/if}
					</div>
					{#if armed === rowKey(row)}
						<div class="confirm-row">
							<button
								type="button"
								class="btn danger-btn"
								onclick={() => void revoke(row)}
								disabled={busy}
								data-testid="maps-grant-revoke-go"
							>
								Take it back
							</button>
							<button type="button" class="btn secondary" onclick={() => (armed = null)}>
								Keep it
							</button>
						</div>
					{:else}
						<button
							type="button"
							class="btn secondary"
							onclick={() => (armed = rowKey(row))}
							data-testid="maps-grant-revoke-arm"
						>
							Revoke&hellip;
						</button>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.grant-admin {
		display: flex;
		flex-direction: column;
		gap: 0.7rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		padding: 0.9rem;
		background: var(--bg1);
	}
	h2,
	h3 {
		margin: 0;
	}
	.hint {
		margin: 0;
		font-size: 0.88rem;
		color: var(--text-2, var(--white));
	}
	.grant-form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.7rem;
		align-items: flex-end;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1 1 14rem;
		min-width: 0;
		font-size: 0.8rem;
		font-family: var(--font-mono);
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--cyan);
	}
	.field input,
	.field select {
		min-height: 44px;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--boundary);
		border-radius: var(--radius-control, 6px);
		background: var(--bg0);
		color: var(--white);
		font-family: var(--font-display);
		font-size: 0.95rem;
		text-transform: none;
		letter-spacing: normal;
	}
	.form-actions {
		flex: 0 0 auto;
	}
	.form-actions .btn {
		min-height: 44px;
	}
	.roster {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.roster-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.6rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.6rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control, 6px);
		background: var(--bg2);
	}
	.roster-row .btn {
		min-height: 44px;
	}
	.who {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
		flex: 1 1 16rem;
	}
	.email {
		font-family: var(--font-display);
		font-size: 0.95rem;
		color: var(--white);
	}
	.path {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--cyan);
	}
	.note {
		font-size: 0.82rem;
		color: var(--text-2, var(--white));
	}
	.confirm-row {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}
	.notice {
		margin: 0;
		font-size: 0.88rem;
		color: var(--white);
	}
	.problem {
		margin: 0;
		font-size: 0.85rem;
		color: var(--crimson);
	}
</style>
