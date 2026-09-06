<script lang="ts">
	import EntryBanner from '$lib/tournaments/EntryBanner.svelte';
	import EntryChip from '$lib/tournaments/EntryChip.svelte';
	import { thumbnailState } from '$lib/tournaments/thumbnail';
	import '$lib/tournaments/tournaments-theme.css';
	import { thumbFixtures, type ThumbFixture } from './fixtures';

	/**
	 * Four thumbnail states, in the two REAL components that render one, at the
	 * two sizes they render one at.
	 *
	 * Built at module scope with no `$effect` at all, which `ssr = false` is
	 * what makes possible: the component only ever runs in a browser, so
	 * `location` is there, and an effect that wrote the state it also read would
	 * be exactly the shape CLAUDE.md's Svelte 5 section warns about.
	 *
	 * `data-thumbs-settled` marks the fixtures being BUILT, not any image having
	 * loaded or failed. A spec waits on this and then retries its own
	 * assertion: the `failed` tile appears when the element's own error event
	 * fires, so a flag that waited for that would be the harness deciding the
	 * result before the spec could read it.
	 */
	const fixtures: ThumbFixture[] = thumbFixtures(location.origin);
	const settled = true;

	/**
	 * The state BEFORE the browser has had its say -- `failed` is not reachable
	 * from a pure function and never can be. Printed beside each row so a
	 * reader can see that `refused` is decided here while `failed` is decided
	 * by the element, which is the whole shape of the module.
	 */
	const decided = (f: ThumbFixture) => thumbnailState(f.entry.thumbnail_url);
</script>

<svelte:head><title>Tournament thumbnails // dev</title></svelte:head>

<div class="tnm-root harness" data-thumbs-settled={settled ? '1' : '0'}>
	<h1>Tournament thumbnail states</h1>
	<p class="lede">
		Four states, four paints, one box. Nothing on a row moves when a state changes: the width,
		the height and the radius all live on <code>.thumb</code>, and only the fill, the ink, the
		border style and the glyph differ. Compare the paint, not the markup.
	</p>

	<section>
		<h2>EntryChip (1.5rem box)</h2>
		<div class="chips">
			{#each fixtures as f (f.key)}
				<span class="cell" data-thumb-case={f.key} data-thumb-decided={decided(f)}>
					<EntryChip entry={f.entry} />
				</span>
			{/each}
		</div>
	</section>

	<section>
		<h2>EntryBanner (large box)</h2>
		<div class="banners">
			{#each fixtures as f (f.key)}
				<div class="cell" data-thumb-case={f.key} data-thumb-decided={decided(f)}>
					<EntryBanner entry={f.entry} size="lg" />
				</div>
			{/each}
		</div>
	</section>

	<section>
		<h2>What each fixture is</h2>
		<dl>
			{#each fixtures as f (f.key)}
				<dt>{f.key} <span class="expect">expects {f.expect}</span></dt>
				<dd>
					<p>{f.about}</p>
					<p class="url">
						thumbnail_url: {f.entry.thumbnail_url === null
							? '(null)'
							: f.entry.thumbnail_url}
					</p>
				</dd>
			{/each}
		</dl>
	</section>
</div>

<style>
	.harness {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 68rem;
	}
	h1 {
		font-family: 'Rajdhani', sans-serif;
		margin: 0;
	}
	h2 {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.9rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		margin: 0 0 0.6rem;
	}
	.lede,
	.url {
		font-family: 'Rajdhani', sans-serif;
		margin: 0;
	}
	.url {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.75rem;
		word-break: break-all;
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: center;
	}
	.banners {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	dl {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}
	dt {
		font-family: 'Share Tech Mono', monospace;
		font-size: 0.85rem;
	}
	.expect {
		opacity: 0.7;
	}
	dd {
		margin: 0.2rem 0 0 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
</style>
