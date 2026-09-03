<script lang="ts">
	/**
	 * THE PERSISTENT SEARCH BAR (spec 6): the same control at every level, with
	 * the query in the URL so the descent never erases the search that produced
	 * it.
	 *
	 * IT IS A REAL `<form>` WITH A REAL SUBMIT, and the live results are the
	 * upgrade rather than the mechanism. With no JavaScript the form navigates
	 * to `/maps?q=...`, the server load renders the page and the results list
	 * is server-rendered from the same transport -- which matters more here
	 * than anywhere else in the app, because the person using it is on school
	 * wifi in a shop with a phone in one hand.
	 *
	 * THE LIVE PATH IS DEBOUNCED AND RACE-GUARDED, and the guard is a sequence
	 * number rather than an abort: two keystrokes in flight can land in either
	 * order, and the older one landing second would paint stale results under a
	 * newer query with nothing on screen to say so.
	 *
	 * THE MISS LOG IS FIRED AND FORGOTTEN (spec 5.4). It is best-effort
	 * instrumentation, so it can neither fail the search nor delay it: no
	 * await, no result, nothing to branch on.
	 *
	 * EVERY RESULT ROW IS A LINK TO THE STAGED ROUTE'S FIRST STAGE, never to
	 * the item. That is the whole staging decision, expressed as an href: the
	 * thing a person clicks is the beginning of the walk, and the walk's end is
	 * one more control away.
	 */
	import Pending from '$lib/Pending.svelte';
	import type { MapsSearchRow, MapsViewerTransports } from '../transports';

	let {
		q,
		results,
		state = 'idle',
		message = null,
		transports = null,
		onquery,
		onresults,
		hrefFor,
		routeHrefFor
	}: {
		q: string;
		results: MapsSearchRow[];
		state?: 'idle' | 'running' | 'failed';
		message?: string | null;
		/** Omitted removes the live path entirely; the form still submits. */
		transports?: MapsViewerTransports | null;
		onquery: (value: string) => void;
		onresults: (
			payload: { results: MapsSearchRow[]; state: 'idle' | 'running' | 'failed'; message: string | null }
		) => void;
		/** Where a result's staged route starts. */
		hrefFor: (row: MapsSearchRow) => string;
		/** Where a result's END is, for the skip-ahead control. */
		routeHrefFor: (row: MapsSearchRow) => string;
	} = $props();

	const DEBOUNCE_MS = 220;
	let timer: ReturnType<typeof setTimeout> | null = null;
	let sequence = 0;

	function run(value: string) {
		const client = transports;
		if (!client) return;
		const trimmed = value.trim();
		if (!trimmed) {
			sequence += 1;
			onresults({ results: [], state: 'idle', message: null });
			return;
		}
		const mine = ++sequence;
		onresults({ results, state: 'running', message: null });
		client
			.search(trimmed)
			.then((outcome) => {
				// The stale-response guard. This runs in a microtask, outside any
				// tracking context, so it needs no untrack.
				if (mine !== sequence) return;
				if (!outcome.ok) {
					onresults({ results: [], state: 'failed', message: outcome.message });
					return;
				}
				onresults({ results: outcome.data, state: 'idle', message: null });
				// Fired and forgotten -- spec 5.4's miss log. Never awaited.
				void client.log?.(trimmed, outcome.data.length);
			})
			.catch(() => {
				if (mine !== sequence) return;
				onresults({ results: [], state: 'failed', message: 'The search did not run. Try again in a moment.' });
			});
	}

	function onInput(event: Event) {
		const value = (event.currentTarget as HTMLInputElement).value;
		onquery(value);
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => run(value), DEBOUNCE_MS);
	}

	function onSubmit(event: SubmitEvent) {
		// With a live transport the results are already on screen, so a submit
		// would only reload the page under the person's finger. With none, the
		// default action is the whole feature and must not be prevented.
		if (!transports) return;
		event.preventDefault();
		if (timer) clearTimeout(timer);
		run(q);
	}

	/** The container a result sits in, for the row's "where" line. */
	function whereOf(row: MapsSearchRow): string {
		const chain = row.chain ?? [];
		if (chain.length === 0) return '';
		return chain.map((link) => link.name).join(' / ');
	}
</script>

<form class="mv-search" data-testid="maps-viewer-search" action="/maps" method="get" role="search" onsubmit={onSubmit}>
	<label class="mv-search-label" for="mv-q">Search the map</label>
	<div class="mv-search-row">
		<input
			id="mv-q"
			name="q"
			type="search"
			value={q}
			placeholder="A name, a brand, a part number, or what it does"
			autocomplete="off"
			oninput={onInput}
		/>
		<button type="submit" class="tap-44">Search</button>
	</div>
	<p class="mv-search-hint">
		Half a name works. So does the wrong name, a brand, or what the thing is for.
	</p>
</form>

{#if q.trim()}
	<section class="mv-results" aria-label="Search results" data-testid="maps-viewer-results">
		{#if state === 'running' && results.length === 0}
			<Pending label="Searching the map" />
		{:else if state === 'failed'}
			<p class="mv-search-failed" role="status">{message ?? 'The search did not run.'}</p>
		{:else if results.length === 0}
			<p class="mv-search-empty" role="status">
				Nothing on the map matches <strong>{q.trim()}</strong> yet. It may not have been added,
				or it may be called something else here. Try a brand, a part number, or what it does.
			</p>
		{:else}
			<p class="mv-results-count" role="status">
				{results.length}
				{results.length === 1 ? 'match' : 'matches'} for <strong>{q.trim()}</strong>
			</p>
			<ul>
				{#each results as row (row.result_kind + row.result_id)}
					<li>
						<a class="mv-result" data-testid="maps-viewer-result" href={hrefFor(row)}>
							<span class="mv-result-label">{row.label}</span>
							<span class="mv-result-where">{whereOf(row)}</span>
							<span class="mv-result-go">Show me the way</span>
						</a>
						<a class="mv-result-skip tap-44" data-testid="maps-viewer-result-skip" href={routeHrefFor(row)}>
							Skip to it
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
{/if}

<style>
	.mv-search {
		margin-bottom: var(--space-4);
	}
	.mv-search-label {
		display: block;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--text-2, #9aa49d);
		margin-bottom: var(--space-1);
	}
	.mv-search-row {
		display: flex;
		gap: var(--space-2);
	}
	input {
		flex: 1 1 auto;
		min-width: 0;
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
		background: var(--surface-2, #161a18);
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-control);
		color: var(--text-1, #e7eae8);
		font-family: var(--font-display);
		font-size: 1rem;
	}
	input:focus-visible {
		outline: 2px solid var(--mv-accent);
		outline-offset: 1px;
	}
	button {
		flex: none;
		min-height: 44px;
		padding: 0 var(--space-4);
		background: var(--surface-2, #161a18);
		border: 1px solid var(--mv-accent);
		border-radius: var(--radius-control);
		color: var(--mv-accent-ink);
		font-family: var(--font-mono);
		font-size: 0.875rem;
		cursor: pointer;
	}
	button:hover,
	button:focus-visible {
		background: var(--mv-shape-fill-hover);
	}
	.mv-search-hint {
		margin: var(--space-1) 0 0;
		font-size: 0.8125rem;
		color: var(--text-2, #9aa49d);
	}
	.mv-results {
		margin-bottom: var(--space-5);
	}
	.mv-results-count,
	.mv-search-empty,
	.mv-search-failed {
		font-size: 0.875rem;
		color: var(--text-2, #9aa49d);
		margin: 0 0 var(--space-2);
	}
	.mv-search-failed {
		color: var(--crimson);
	}
	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}
	li {
		display: flex;
		gap: var(--space-2);
		align-items: stretch;
	}
	.mv-result {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-height: 44px;
		padding: var(--space-2) var(--space-3);
		background: var(--surface-1, #101312);
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-card);
		color: var(--text-1, #e7eae8);
		text-decoration: none;
	}
	.mv-result:hover,
	.mv-result:focus-visible {
		border-color: var(--mv-accent);
		background: var(--mv-shape-fill);
	}
	.mv-result-label {
		font-family: var(--font-display);
		font-weight: 600;
	}
	.mv-result-where {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--text-2, #9aa49d);
		overflow-wrap: anywhere;
	}
	.mv-result-go {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		color: var(--mv-accent-ink);
	}
	.mv-result-skip {
		flex: none;
		display: flex;
		align-items: center;
		padding: 0 var(--space-3);
		background: var(--surface-1, #101312);
		border: 1px solid var(--mv-boundary);
		border-radius: var(--radius-card);
		color: var(--text-2, #9aa49d);
		font-family: var(--font-mono);
		font-size: 0.75rem;
		text-decoration: none;
		text-align: center;
	}
	.mv-result-skip:hover,
	.mv-result-skip:focus-visible {
		border-color: var(--mv-mark);
		color: var(--mv-mark);
	}
</style>
