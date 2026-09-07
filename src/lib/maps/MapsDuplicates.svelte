<script lang="ts">
	/**
	 * THE SURPLUS COPIES, seen and removed one at a time (prompt 0098).
	 *
	 * One press of "Create draft" once wrote about thirty identical rooms into
	 * the live map (`tests/dom/maps-node-create-once.test.ts` holds the
	 * mechanism). This is the surface that shows what is there and lets a
	 * person take it back out: grouped by what makes them copies, the oldest
	 * kept, every other copy offered its own Remove behind a two-step confirm
	 * that names what goes -- and a copy that holds containers, items or stock,
	 * or that is on the public map, listed SEPARATELY with the reason and no
	 * control at all. NOTHING HERE REMOVES MORE THAN ONE ROW PER PRESS: there
	 * is no checkbox, no "remove all", no count to type. Thirty presses for
	 * thirty rooms is the price of a delete with no undo, and it is cheap.
	 *
	 * THE COMPONENT FETCHES NOTHING. The shell derives the groups from the
	 * same data everything else reads and hands them down; removal is an
	 * INJECTED transport, so an omitted `remove` removes every Remove control.
	 * What is OFFERED is decided by `mapsDuplicateBlockedReason` in maps.ts;
	 * what is ALLOWED is decided again by the database, which refuses a delete
	 * while anything is inside (0161) and refuses a granted editor outside
	 * their scope (0172). A control that is absent for a reason says the
	 * reason, where every sibling row has one.
	 *
	 * THE ACKNOWLEDGEMENT LIVES ABOVE THE LIST, NOT ON THE ROW: the row is
	 * what just went.
	 */
	import {
		MAPS_KIND_LABELS,
		type MapsDuplicateCopy,
		type MapsDuplicateGroup
	} from './maps';
	import type { MapsResult } from './transports';

	let {
		groups,
		totals,
		remove = null,
		onselectnode
	}: {
		groups: MapsDuplicateGroup[];
		totals: { groups: number; surplus: number; removable: number; blocked: number };
		/** OMITTED REMOVES EVERY REMOVE CONTROL. Absence is the mechanism. */
		remove?: ((id: string) => Promise<MapsResult<null>>) | null;
		/** Open a copy's own editor -- the kept one, or a blocked one whose contents need moving. */
		onselectnode: (id: string) => void;
	} = $props();

	/** Which copy is armed. Two-step inline confirm: arm, then confirm. */
	let armed = $state<string | null>(null);
	let busy = $state<string | null>(null);
	let note = $state<string | null>(null);
	let failure = $state<string | null>(null);
	let removed = $state(0);

	async function confirmRemove(group: MapsDuplicateGroup, copy: MapsDuplicateCopy) {
		if (!remove || copy.blocked !== null) return;
		busy = copy.node.id;
		failure = null;
		try {
			const result = await remove(copy.node.id);
			if (result.ok) {
				removed += 1;
				note = `Removed one copy of "${group.name}" (created ${when(copy.node.created_at)}). The copy created ${when(group.keep.created_at)} is kept.`;
				armed = null;
			} else {
				failure = `That copy was not removed: ${result.message}`;
			}
		} catch {
			failure = 'That copy was not removed. Nothing was changed.';
		} finally {
			// Cleared in `finally`: a throw mid-remove would otherwise leave the
			// row's control disabled forever.
			busy = null;
		}
	}

	function when(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	const summary = $derived.by(() => {
		if (totals.surplus === 0) return 'No duplicate containers. Nothing to clean up.';
		const head = `${totals.surplus} surplus ${totals.surplus === 1 ? 'copy' : 'copies'} across ${totals.groups} ${totals.groups === 1 ? 'container' : 'containers'}.`;
		if (totals.blocked === 0) return `${head} All of them can be removed from here, one at a time.`;
		if (totals.removable === 0) return `${head} None can be removed from here: each is on the public map or holds something.`;
		return `${head} ${totals.removable} can be removed from here, one at a time; ${totals.blocked} ${totals.blocked === 1 ? 'is' : 'are'} listed separately with the reason.`;
	});
</script>

<section class="dup" data-testid="maps-duplicates" aria-labelledby="maps-dup-title">
	<header class="dup-head">
		<h2 id="maps-dup-title">Duplicate containers</h2>
		<p class="dup-sum" data-testid="maps-dup-summary">{summary}</p>
		<p class="dup-why">
			Two containers are copies when they sit in the same place, are the same kind, and carry the same
			name and the same outline. The oldest copy is kept (the published one, if one of them is on the
			public map). A copy that holds containers, items or stock, or that is already public, is listed
			separately and is not offered for removal here. Each removal is one press, one confirm, one row.
		</p>
	</header>

	{#if note}
		<p class="dup-note" role="status" data-testid="maps-dup-note" data-removed={removed}>{note}</p>
	{/if}
	{#if failure}
		<p class="dup-fail" role="alert" data-testid="maps-dup-failure">{failure}</p>
	{/if}

	{#if groups.length === 0}
		<p class="dup-empty" data-testid="maps-dup-empty">
			Nothing to clean up. Every container in this map is the only copy of itself.
		</p>
	{:else}
		<ol class="dup-groups">
			{#each groups as group (group.key)}
				{@const safe = group.surplus.filter((c) => c.blocked === null)}
				{@const blocked = group.surplus.filter((c) => c.blocked !== null)}
				<li class="dup-group" data-testid="maps-dup-group">
					<div class="dup-g-head">
						<h3 class="dup-g-title">{group.name}</h3>
						<span class="dup-chip">{MAPS_KIND_LABELS[group.kind]}</span>
						<span class="dup-count" data-testid="maps-dup-copies">
							{group.surplus.length + 1} copies
						</span>
					</div>
					<p class="dup-g-meta">
						{group.parentPath ? `In ${group.parentPath}` : 'At the top level'}
						<span class="dup-sep" aria-hidden="true">&middot;</span>
						{group.outlineLabel}
					</p>
					<p class="dup-keep" data-testid="maps-dup-keep">
						Keeping the copy created {when(group.keep.created_at)}{group.keep.status === 'published'
							? ', which is on the public map'
							: ''}.
						<button type="button" class="dup-open" onclick={() => onselectnode(group.keep.id)}>
							Open it
						</button>
					</p>

					{#if safe.length > 0}
						<ul class="dup-copies">
							{#each safe as copy (copy.node.id)}
								<li class="dup-copy" data-testid="maps-dup-copy" data-removable="true">
									<span class="dup-when">Created {when(copy.node.created_at)}</span>
									{#if remove}
										{#if armed === copy.node.id}
											<div class="dup-confirm" role="alertdialog" aria-label="Confirm removal" data-testid="maps-dup-confirm">
												<p>
													Remove the "{group.name}" created {when(copy.node.created_at)}? It holds nothing.
													This cannot be undone.
												</p>
												<div class="dup-confirm-row">
													<button
														type="button"
														class="btn danger"
														disabled={busy === copy.node.id}
														onclick={() => confirmRemove(group, copy)}
														data-testid="maps-dup-do-remove"
													>
														{busy === copy.node.id ? 'Removing...' : 'Remove this copy'}
													</button>
													<button type="button" class="btn secondary" onclick={() => (armed = null)}>
														Keep it
													</button>
												</div>
											</div>
										{:else}
											<button
												type="button"
												class="btn secondary dup-arm"
												onclick={() => (armed = copy.node.id)}
												data-testid="maps-dup-arm"
											>
												Remove&hellip;
											</button>
										{/if}
									{/if}
								</li>
							{/each}
						</ul>
					{/if}

					{#if blocked.length > 0}
						<div class="dup-blocked" data-testid="maps-dup-blocked">
							<h4>Not removable from here</h4>
							<ul class="dup-copies">
								{#each blocked as copy (copy.node.id)}
									<li class="dup-copy is-blocked" data-testid="maps-dup-copy" data-removable="false">
										<span class="dup-when">Created {when(copy.node.created_at)}</span>
										<p class="dup-reason" data-testid="maps-dup-reason">{copy.blocked}</p>
										<button type="button" class="btn secondary dup-open-btn" onclick={() => onselectnode(copy.node.id)}>
											Open it
										</button>
									</li>
								{/each}
							</ul>
						</div>
					{/if}
				</li>
			{/each}
		</ol>
	{/if}
</section>

<style>
	.dup {
		padding: 0 0 2rem;
		max-width: var(--measure-reading, 46rem);
	}
	.dup-head h2 {
		margin: 0 0 0.4rem;
	}
	.dup-sum {
		margin: 0 0 0.5rem;
		color: var(--text-1);
		font-weight: 600;
	}
	.dup-why,
	.dup-g-meta,
	.dup-when {
		color: var(--text-2);
		font-size: 0.86rem;
	}
	.dup-note {
		padding: 0.5rem 0.7rem;
		border-left: 3px solid var(--green);
		color: var(--text-1);
	}
	.dup-fail {
		padding: 0.5rem 0.7rem;
		border-left: 3px solid var(--crimson);
		color: var(--text-1);
	}
	.dup-groups {
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
		display: grid;
		gap: 1rem;
	}
	.dup-group {
		padding: 0.8rem 0.9rem;
		background: var(--surface-1, var(--bg1));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-md, 6px);
	}
	.dup-g-head {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.5rem 0.7rem;
	}
	.dup-g-title {
		margin: 0;
		font-size: 1.05rem;
	}
	.dup-chip {
		font-family: var(--font-mono);
		font-size: 0.7rem;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-2);
		border: 1px solid var(--hairline);
		border-radius: 999px;
		padding: 0.1rem 0.5rem;
	}
	.dup-count {
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--amber);
	}
	.dup-g-meta {
		margin: 0.2rem 0 0;
	}
	.dup-sep {
		margin: 0 0.35rem;
		color: var(--boundary);
	}
	.dup-keep {
		margin: 0.5rem 0 0;
		color: var(--text-1);
		font-size: 0.9rem;
	}
	.dup-open {
		background: none;
		border: 0;
		padding: 0;
		margin-left: 0.3rem;
		min-height: 44px;
		color: var(--cyan);
		font: inherit;
		text-decoration: underline;
		cursor: pointer;
	}
	.dup-copies {
		list-style: none;
		margin: 0.5rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.4rem;
	}
	.dup-copy {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem 0.8rem;
		padding: 0.4rem 0.6rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-sm, 4px);
	}
	.dup-copy.is-blocked {
		flex-direction: column;
		align-items: flex-start;
	}
	.dup-reason {
		margin: 0;
		color: var(--text-1);
		font-size: 0.88rem;
	}
	.dup-confirm {
		flex-basis: 100%;
		padding: 0.5rem 0.6rem;
		border-left: 3px solid var(--crimson);
	}
	.dup-confirm p {
		margin: 0 0 0.5rem;
	}
	.dup-confirm-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}
	/* Every control here clears the 44px floor: a phone at a toolbox is a real
	   caller of this editor, and nothing on this surface declares a density. */
	.dup-arm,
	.dup-open-btn,
	.dup-confirm-row .btn {
		min-height: 44px;
	}
	.btn.danger {
		border-color: var(--crimson);
		color: var(--crimson);
	}
	.dup-blocked {
		margin-top: 0.7rem;
		padding-top: 0.5rem;
		border-top: 1px solid var(--hairline);
	}
	.dup-blocked h4 {
		margin: 0;
		font-size: 0.8rem;
		font-family: var(--font-mono);
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--text-2);
	}
	.dup-empty {
		color: var(--text-2);
	}
</style>
