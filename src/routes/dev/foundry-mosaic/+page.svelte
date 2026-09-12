<script lang="ts">
	/**
	 * THE MOSAIC HARNESS PAGE. It mounts the REAL `FoundryGallery`, not a copy.
	 *
	 * Selection is local state rather than the URL, so a click can be driven
	 * without a router round trip. Everything else -- the component, its
	 * styles, its clamp, its measurement -- is the shipping path.
	 *
	 * THE PLAY COUNTS EXIST SO THE NAME PLATE'S SECOND HALF IS DRIVEABLE.
	 * The plate carries a count only while a play RANKING is in force, so the
	 * sort control has to be pressable against real numbers or that branch is
	 * never on screen. One app is left at zero deliberately: `playCountLabel`
	 * renders nothing for zero, and that absence is only provable with a real
	 * zero beside real counts.
	 */
	import '$lib/foundry/forge.css';
	import FoundryGallery from '$lib/foundry/FoundryGallery.svelte';
	import type { FoundryPlayCounts } from '$lib/foundry/telemetry';
	import type { FoundryApp } from '$lib/foundry/transports';

	let { data } = $props();

	let slug = $state<string | null>(null);

	const playCounts: FoundryPlayCounts = $derived(
		Object.fromEntries(
			data.apps.map((a, i) => [
				a.id,
				{ plays: i === 2 ? 0 : (11 - i) * 7, plays7d: i === 2 ? 0 : 11 - i }
			])
		)
	);

	/**
	 * THE DETAIL ROW, BUILT FROM THE SAME SUMMARY THE LIST RENDERS, so opening
	 * a card cannot show something the card disagrees with. The fields a
	 * summary does not carry are the fixture's, and `versions` is empty: the
	 * detail pane is here so the SELECTED ring has something to be selected
	 * against, not to drive a launch.
	 */
	const selected = $derived.by<FoundryApp | null>(() => {
		const row = data.apps.find((a) => a.slug === slug);
		if (!row) return null;
		return {
			...row,
			description: 'A fixture app, for measuring the gallery mosaic.',
			build_notes: 'Written by hand for this harness.',
			owner: '30000000-0000-4000-8000-000000000001',
			created_at: '2026-09-01T12:00:00Z',
			versions: []
		};
	});

	/**
	 * THE HARNESS'S OWN `coverUrl`, which is what the route injects on the real
	 * surface too -- the component never learns the bucket layout. A fixture
	 * path maps onto the byte route beside this one; anything else is answered
	 * NULL, which is the same answer `foundryCoverUrl` gives for a stored value
	 * that is not a storage key, and is what puts `.fg-cover-bad` on screen.
	 */
	function coverUrl(path: string): string | null {
		if (!path.startsWith('fixture/')) return null;
		return `/dev/foundry-mosaic/cover/${path.slice('fixture/'.length)}`;
	}
</script>

<svelte:head><title>Foundry mosaic harness</title></svelte:head>

<div class="fg-root harness" data-harness="foundry-mosaic">
	<h1>Foundry gallery mosaic</h1>
	<p>
		The real <code>FoundryGallery</code>, against covers of deliberately different shapes. Four
		ordinary ones, two pathological ones the clamp exists for, one modern tall phone, one
		cover path that is not a key, one cover whose request fails, and two apps with no cover
		at all.
	</p>
	<p class="hnote">
		Selected: <code data-testid="mosaic-selected">{slug ?? '(none)'}</code>
		<button type="button" class="hbtn" data-testid="mosaic-deselect" onclick={() => (slug = null)}>
			deselect
		</button>
	</p>

	<FoundryGallery
		apps={data.apps}
		{selected}
		{coverUrl}
		{playCounts}
		onSelect={(s) => (slug = s)}
	/>
</div>

<style>
	.harness {
		padding: var(--space-4, 1rem);
	}

	h1 {
		font-family: var(--font-display);
		margin: 0 0 0.5rem;
	}

	p {
		max-width: 60ch;
		color: var(--text-2, var(--dim));
	}

	.hnote {
		font-family: var(--font-mono);
		font-size: 0.8rem;
	}

	.hbtn {
		font-family: var(--font-mono);
		font-size: 0.75rem;
		background: var(--surface-2, var(--bg2));
		color: var(--text-1, var(--white));
		border: 1px solid var(--boundary);
		border-radius: var(--radius-sm, 6px);
		padding: 0.35rem 0.6rem;
		min-height: 44px;
		cursor: pointer;
	}
</style>
