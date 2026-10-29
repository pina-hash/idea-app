<script lang="ts">
	/**
	 * NAMES WAITING FOR AN OK (ledger 0456, report 3d4d8b76; ledger 0471 added
	 * tournament entries and IDEA Market listings). A student's team name or
	 * tagline, tournament entry name, roster name or tagline, or market listing
	 * that names a classmate is held, not shown; here an instructor reads it
	 * with the names it matched and allows it or turns it down.
	 *
	 * Each SOURCE is one pair of database calls: team text reads
	 * `classroom_team_text_holds_list` and decides through
	 * `classroom_team_text_hold_decide`; tournament and market text reads
	 * `idea_text_holds_list` and decides through `idea_text_hold_decide`. Every
	 * one answers only what the caller may decide. A source that fails to read
	 * shows nothing, so a deployment without one still shows the other. Renders
	 * nothing while nothing is held.
	 */
	import { untrack } from 'svelte';

	type Source = {
		read: () => Promise<unknown>;
		decide: (id: string, approve: boolean) => Promise<{ ok?: boolean } | null>;
	};
	type Hold = { key: string; id: string; source: number; where: string; what: string; text: string; hits: string[]; by: string };
	let { sources }: { sources: Source[] } = $props();

	let holds = $state<Hold[]>([]);
	let busy = $state(false);

	/** Where a held text sits and what it is, in words, from either list's row. */
	function place(h: Record<string, unknown>): { where: string; what: string } {
		if (typeof h.where === 'string') return { where: h.where, what: String(h.field ?? 'name') };
		return { where: `${String(h.section ?? '')} · ${String(h.team ?? '')}`, what: h.field === 'tagline' ? 'tagline' : 'team name' };
	}

	async function load() {
		const lists = await Promise.all(
			sources.map(async (s, source) => {
				const raw = (await s.read().catch(() => null)) as { ok?: boolean; holds?: unknown } | null;
				return raw?.ok && Array.isArray(raw.holds)
					? (raw.holds as Record<string, unknown>[]).map((h): Hold => ({
							key: `${source}:${String(h.id)}`,
							id: String(h.id),
							source,
							...place(h),
							text: String(h.text ?? ''),
							hits: Array.isArray(h.hits) ? h.hits.map(String) : [],
							by: String(h.by ?? '')
						}))
					: [];
			})
		);
		holds = lists.flat();
	}
	$effect(() => {
		untrack(() => void load());
	});
	async function act(h: Hold, approve: boolean) {
		busy = true;
		await sources[h.source].decide(h.id, approve).catch(() => null);
		busy = false;
		await load();
	}
</script>

{#if holds.length}
	<section class="card tnh" data-testid="team-name-holds" aria-label="Names waiting for your OK">
		<h2 class="section-label">Names waiting for your OK</h2>
		<ul class="tnh-list">
			{#each holds as h (h.key)}
				<li data-testid="name-hold" data-source={h.source}>
					<p class="tnh-where">{h.where} · {h.what} by {h.by}</p>
					<p class="tnh-text">“{h.text}”</p>
					<p class="tnh-hits">Matches a classmate: {h.hits.join(', ')}</p>
					<div class="tnh-keys">
						<button type="button" class="btn secondary" disabled={busy} onclick={() => act(h, true)}>Allow</button>
						<button type="button" class="btn secondary" disabled={busy} onclick={() => act(h, false)}>Turn down</button>
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
		font-size: var(--fs-meta);
		color: var(--text-2, var(--dim));
	}
	.tnh-text {
		margin: 0;
		font-family: var(--font-display);
		font-size: var(--fs-h4);
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
