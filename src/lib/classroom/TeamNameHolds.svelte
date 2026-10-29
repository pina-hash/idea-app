<script lang="ts">
	/**
	 * TEAM NAMES WAITING FOR AN OK (ledger 0456, report 3d4d8b76). A student's
	 * team name or tagline that names a classmate is held, not shown; here an
	 * instructor reads it with the names it matched and allows it or turns it
	 * down. Reads `classroom_team_text_holds_list`, decides through
	 * `classroom_team_text_hold_decide`; both answer only the classes the caller
	 * manages. Renders nothing while nothing is held.
	 */
	import { untrack } from 'svelte';

	type Hold = { id: string; field: string; text: string; hits: string[]; by: string; team: string; section: string };
	let {
		read,
		decide
	}: {
		read: () => Promise<unknown>;
		decide: (id: string, approve: boolean) => Promise<{ ok?: boolean } | null>;
	} = $props();

	let holds = $state<Hold[]>([]);
	let busy = $state(false);

	async function load() {
		const raw = (await read().catch(() => null)) as { ok?: boolean; holds?: unknown } | null;
		holds = raw?.ok && Array.isArray(raw.holds)
			? (raw.holds as Record<string, unknown>[]).map((h) => ({
					id: String(h.id),
					field: h.field === 'tagline' ? 'tagline' : 'name',
					text: String(h.text ?? ''),
					hits: Array.isArray(h.hits) ? h.hits.map(String) : [],
					by: String(h.by ?? ''),
					team: String(h.team ?? ''),
					section: String(h.section ?? '')
				}))
			: [];
	}
	$effect(() => {
		untrack(() => void load());
	});
	async function act(id: string, approve: boolean) {
		busy = true;
		await decide(id, approve).catch(() => null);
		busy = false;
		await load();
	}
</script>

{#if holds.length}
	<section class="card tnh" data-testid="team-name-holds" aria-label="Team names waiting for your OK">
		<h2 class="section-label">Team names waiting for your OK</h2>
		<ul class="tnh-list">
			{#each holds as h (h.id)}
				<li>
					<p class="tnh-where">{h.section} · {h.team} · {h.field === 'tagline' ? 'tagline' : 'team name'} by {h.by}</p>
					<p class="tnh-text">“{h.text}”</p>
					<p class="tnh-hits">Matches a classmate: {h.hits.join(', ')}</p>
					<div class="tnh-keys">
						<button type="button" class="btn secondary" disabled={busy} onclick={() => act(h.id, true)}>Allow</button>
						<button type="button" class="btn secondary" disabled={busy} onclick={() => act(h.id, false)}>Turn down</button>
					</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}

<style>
	.tnh {
		display: grid;
		gap: 0.6rem;
		padding: 0.9rem;
	}
	.tnh .section-label {
		margin: 0;
	}
	.tnh-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		gap: 0.6rem;
	}
	.tnh-list li {
		display: grid;
		gap: 0.3rem;
		padding: 0.55rem 0.6rem;
		border: 1px solid var(--amber);
		border-radius: var(--radius-card, 8px);
	}
	.tnh-where,
	.tnh-hits {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 0.78rem;
		color: var(--text-2, var(--dim));
	}
	.tnh-text {
		margin: 0;
		font-family: var(--font-display);
		font-size: 1.1rem;
		color: var(--text-1, var(--white));
		overflow-wrap: anywhere;
	}
	.tnh-keys {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.tnh-keys .btn {
		min-height: 48px;
	}
</style>
