<script lang="ts">
	import { onMount } from 'svelte';
	import { prepareMapsPhoto } from '$lib/maps/photo-prepare';
	import { MAPS_PERMANENT_UNIQUE, mapsTransports } from '$lib/maps/transports';
	import type { MapsTable } from '$lib/maps/maps';
	import { MEDIA_FIXTURES } from './fixtures';

	/* --- A. what happens to a picked file ------------------------------- */

	type PrepareRow = {
		key: string;
		about: string;
		caveat: string | null;
		source: string;
		outcome: 'kept' | 'converted' | 'refused' | 'error';
		detail: string;
		/** Set only when the bytes changed, so a spec can prove they did. */
		bytes: string;
	};

	let prepared = $state<PrepareRow[]>([]);
	let prepareDone = $state(false);

	async function runPrepare() {
		const rows: PrepareRow[] = [];
		for (const fixture of MEDIA_FIXTURES) {
			let file: File;
			try {
				file = await fixture.file();
			} catch (cause) {
				rows.push({
					key: fixture.key,
					about: fixture.about,
					caveat: fixture.caveat,
					source: '(fixture failed)',
					outcome: 'error',
					detail: cause instanceof Error ? cause.message : String(cause),
					bytes: ''
				});
				continue;
			}
			const source = `${file.name} type=${file.type || '(empty)'} ${file.size}B`;
			const result = await prepareMapsPhoto(file);
			if (!result.ok) {
				rows.push({
					key: fixture.key,
					about: fixture.about,
					caveat: fixture.caveat,
					source,
					outcome: 'refused',
					detail: result.problem,
					bytes: ''
				});
				continue;
			}
			rows.push({
				key: fixture.key,
				about: fixture.about,
				caveat: fixture.caveat,
				source,
				outcome: result.transcoded ? 'converted' : 'kept',
				detail: result.transcoded
					? `${result.sourceMimeType} -> ${result.mimeType} (.${result.ext})`
					: `${result.mimeType} (.${result.ext}), same object: ${result.file === file}`,
				bytes: result.transcoded ? `${result.file.name} ${result.file.size}B` : ''
			});
		}
		prepared = rows;
		prepareDone = true;
	}

	/* --- B. how a unique-constraint refusal is classified ---------------- */

	type RefusalRow = { constraint: string; table: MapsTable; retryable: boolean; message: string };

	/**
	 * The wording Postgres emits for a unique violation, verbatim in shape.
	 * `tests/maps-constraint-refusals.test.ts` provokes each of these against a
	 * REAL database and asserts the parser reads what Postgres actually wrote;
	 * this surface is the human half of that -- what a person ends up reading,
	 * and whether the surface will ask them the same question five times.
	 */
	const pgUnique = (constraint: string) => ({
		code: '23505',
		message: `duplicate key value violates unique constraint "${constraint}"`,
		details: 'Key (a, b)=(1, 2) already exists.'
	});

	function clientAnswering(error: unknown) {
		const answer = { data: null, error };
		const builder = {
			insert: () => builder,
			update: () => builder,
			delete: () => builder,
			eq: () => builder,
			select: () => builder,
			single: () => Promise.resolve(answer),
			then: (resolve: (v: typeof answer) => unknown) => Promise.resolve(answer).then(resolve)
		};
		return { from: () => builder, rpc: () => Promise.resolve(answer) };
	}

	const REFUSAL_CASES: { constraint: string; table: MapsTable }[] = [
		{ constraint: 'maps_stock_one_row_per_placement', table: 'maps_stock' },
		{ constraint: 'maps_nodes_elevation_slot', table: 'maps_nodes' },
		// The CONTROL, and it is the half that makes the other two mean
		// something: a unique index that is a genuine race stays retryable.
		{ constraint: 'some_upsert_that_really_did_race', table: 'maps_items' }
	];

	let refusals = $state<RefusalRow[]>([]);
	let refusalsDone = $state(false);

	async function runRefusals() {
		const rows: RefusalRow[] = [];
		for (const c of REFUSAL_CASES) {
			const transports = mapsTransports(
				clientAnswering(pgUnique(c.constraint)) as unknown as Parameters<typeof mapsTransports>[0]
			);
			const result = await transports.insertRow(c.table, {});
			rows.push({
				constraint: c.constraint,
				table: c.table,
				retryable: result.ok ? false : result.retryable,
				message: result.ok ? '(unexpectedly succeeded)' : result.message
			});
		}
		refusals = rows;
		refusalsDone = true;
	}

	onMount(() => {
		void runPrepare();
		void runRefusals();
	});
</script>

<svelte:head><title>maps-media harness</title></svelte:head>

<main class="harness" data-testid="maps-media">
	<p class="harness-note">
		Dev harness: the REAL <code>prepareMapsPhoto</code> and the REAL
		<code>mapsTransports</code> over fixtures built in this browser. No network, no bucket, no
		session.
	</p>

	<section>
		<h2>What happens to a picked photo</h2>
		<p class="hint">
			A photo stored in a format only its author's phone can draw is not a photo that saved; it is a
			broken image every later reader gets, and nothing reports it. So the decision is taken at the
			picker, on the device that can still decode the file.
		</p>
		{#if !prepareDone}
			<p class="hint" data-testid="maps-media-prepare-pending">Running the fixtures…</p>
		{:else}
			<ul class="rows" data-testid="maps-media-prepare">
				{#each prepared as row (row.key)}
					<li data-case={row.key} data-outcome={row.outcome}>
						<p class="case">{row.key}</p>
						<p class="about">{row.about}</p>
						<p class="src" data-testid="maps-media-source">{row.source}</p>
						<p class="outcome"><span class="tag" data-tag={row.outcome}>{row.outcome}</span> {row.detail}</p>
						{#if row.bytes}<p class="src">stored as: {row.bytes}</p>{/if}
						{#if row.caveat}
							<p class="caveat" data-testid="maps-media-caveat">Fixture caveat: {row.caveat}</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2>What a unique-constraint refusal is classified as</h2>
		<p class="hint">
			SQLSTATE 23505 is on the shared transient whitelist because the case it was found in was a
			race. Two of this feature's unique indexes are rules, and answer the same way on every
			attempt. Nothing on any real surface renders the retryable flag, which is why it is rendered
			here.
		</p>
		{#if !refusalsDone}
			<p class="hint">Running…</p>
		{:else}
			<ul class="rows" data-testid="maps-media-refusals">
				{#each refusals as row (row.constraint)}
					<li data-constraint={row.constraint} data-retryable={row.retryable}>
						<p class="case">{row.constraint} <span class="src">on {row.table}</span></p>
						<p class="outcome">
							<span class="tag" data-tag={row.retryable ? 'retryable' : 'refused'}>
								{row.retryable ? 'retryable' : 'permanent'}
							</span>
							<span data-testid="maps-media-refusal-message">{row.message}</span>
						</p>
						{#if MAPS_PERMANENT_UNIQUE[row.constraint]}
							<p class="src">named in MAPS_PERMANENT_UNIQUE</p>
						{:else}
							<p class="src">not a named rule: the shared whitelist decides</p>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>

<style>
	.harness {
		padding: 0 1rem 3rem;
		max-width: 52rem;
		margin: 0 auto;
	}
	.harness-note,
	.hint,
	.src,
	.about,
	.caveat {
		/* --text-2 and not --dim: --dim measures 4.46:1 on --bg1 and 4.24 on
		   --bg2, both under the 4.5 bar (CLAUDE.md's own measurement). */
		color: var(--text-2);
		font-size: 0.8rem;
		line-height: 1.5;
	}
	.harness-note {
		padding: 0.6rem 0;
	}
	h2 {
		font-family: var(--font-mono);
		font-size: 0.9rem;
		letter-spacing: 0.06em;
		margin: 1.6rem 0 0.4rem;
	}
	.rows {
		list-style: none;
		margin: 0.8rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.7rem;
	}
	.rows li {
		border: 1px solid var(--boundary);
		border-radius: var(--radius-2, 4px);
		padding: 0.7rem 0.8rem;
		/* min-width: 0 so a long fixture string cannot push the page wider than
		   the viewport at 375px -- a grid child's automatic minimum is its
		   min-content. */
		min-width: 0;
	}
	.rows p {
		margin: 0 0 0.3rem;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.case {
		font-family: var(--font-mono);
		font-size: 0.82rem;
		color: var(--text-1);
	}
	.outcome {
		color: var(--text-1);
		font-size: 0.85rem;
	}
	.caveat {
		border-left: 2px solid var(--amber);
		padding-left: 0.5rem;
	}
	.tag {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 0.68rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		padding: 0.1rem 0.4rem;
		border-radius: 2px;
		border: 1px solid currentColor;
		margin-right: 0.3rem;
	}
	/* Colour is never the only signal: the word inside the tag says the same
	   thing the hue does, on every row. */
	.tag[data-tag='kept'] {
		color: var(--teal);
	}
	.tag[data-tag='converted'] {
		color: var(--green);
	}
	.tag[data-tag='refused'] {
		color: var(--amber);
	}
	.tag[data-tag='retryable'] {
		color: var(--cyan);
	}
	.tag[data-tag='error'] {
		color: var(--crimson);
	}
</style>
