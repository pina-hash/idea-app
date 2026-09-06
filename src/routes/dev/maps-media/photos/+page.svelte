<script lang="ts">
	import MapsItemCard from '$lib/maps/viewer/MapsItemCard.svelte';
	import type { MapsPhoto } from '$lib/maps/media';
	import type { MapsItemType, MapsNode } from '$lib/maps/maps';

	/**
	 * FOUR CARDS, ONE PER STATE, MOUNTING THE REAL `MapsItemCard` -- the same
	 * component `/maps` mounts, not a copy of its markup.
	 *
	 * WHAT DIFFERS BETWEEN THE CARDS IS TWO FIELDS AND NOTHING ELSE: the photo
	 * list and the base URL. Everything else on every card is identical, so
	 * anything that moves on screen is the rendering rather than the fixture.
	 *
	 *   PRESENT  a photo whose object the loopback fixture route answers with
	 *            real PNG bytes. `mapsPhotoUrl` built that URL -- the harness
	 *            substitutes nothing.
	 *   ABSENT   no photos. The card renders no photo region at all: no list,
	 *            no placeholder, no gap. A card with nothing to show says
	 *            nothing, which is the ordinary case for most of the map.
	 *   REFUSED  `supabaseUrl` is empty, so `mapsPhotoUrl` answers empty and NO
	 *            REQUEST IS MADE. This is the shipped "no configured project"
	 *            path, judged in the browser without asking anybody, which is
	 *            why it can be named without telling a stranger anything.
	 *   FAILED   a photo whose object the fixture route 404s. The request WAS
	 *            made and produced no picture. That is one rendering for
	 *            several causes on purpose -- a swept object, a row naming
	 *            bytes that are gone, and (if the public endpoint turns out to
	 *            consult RLS after 0186) a photo this caller may not read all
	 *            land here, and the page must not distinguish them.
	 */

	/** Where `mapsPhotoUrl` is pointed. See `../o/[...path]/+server.ts`. */
	const BASE = '/dev/maps-media/o';

	const NODE: MapsNode = {
		id: 'a0000000-0000-4000-8000-000000000001',
		parent_id: null,
		kind: 'unit',
		name: 'Tool Chest A',
		subtype: 'cabinet',
		description: null,
		outline: null,
		position_x_in: null,
		position_y_in: null,
		rotation_deg: null,
		elevation_order: null,
		elevation_h_in: null,
		elevation_w_in: null,
		status: 'published',
		published_at: '2026-09-01T00:00:00Z',
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-01T00:00:00Z'
	};

	const TYPE: MapsItemType = {
		id: 'b0000000-0000-4000-8000-000000000001',
		name: 'Hex key set',
		aliases: ['Allen wrench'],
		tags: ['fastening'],
		category: 'Hand tools',
		brand: 'Bondhus',
		model: null,
		part_number: null,
		description: null,
		status: 'published',
		published_at: '2026-09-01T00:00:00Z',
		created_at: '2026-09-01T00:00:00Z',
		updated_at: '2026-09-01T00:00:00Z'
	};

	/** The photo row shape 0163 projects. Only `storage_key` differs by case. */
	function photo(id: string, key: string): MapsPhoto {
		return {
			id,
			node_id: NODE.id,
			item_type_id: null,
			item_id: null,
			storage_key: key,
			caption: 'The drawer, open',
			sort_order: 0,
			created_at: '2026-09-01T00:00:00Z',
			updated_at: '2026-09-01T00:00:00Z'
		};
	}

	const CASES: {
		key: string;
		heading: string;
		about: string;
		photos: MapsPhoto[];
		supabaseUrl: string;
	}[] = [
		{
			key: 'present',
			heading: 'Present',
			about: 'A key, and the bytes arrive.',
			photos: [photo('p1', 'node/present-0000-4000-8000-000000000001.png')],
			supabaseUrl: BASE
		},
		{
			key: 'absent',
			heading: 'Absent',
			about: 'Nothing was ever photographed. No region at all.',
			photos: [],
			supabaseUrl: BASE
		},
		{
			key: 'refused',
			heading: 'Refused',
			about: 'No project is configured, so no URL was built and no request was made.',
			photos: [photo('p3', 'node/refused-0000-4000-8000-000000000003.png')],
			supabaseUrl: ''
		},
		{
			key: 'failed',
			heading: 'Failed',
			about: 'The request was made and the object was not there.',
			photos: [photo('p4', 'node/missing-0000-4000-8000-000000000004.png')],
			supabaseUrl: BASE
		}
	];
</script>

<svelte:head><title>Map photo states // dev</title></svelte:head>

<div class="mv-plate harness" data-harness="maps-media-photos">
	<h1>Map photo states</h1>
	<p class="lede">
		The four ways a photo on the PUBLIC map can render. Every card mounts the real
		<code>MapsItemCard</code>; the only fields that differ between them are the photo list and the
		base URL <code>mapsPhotoUrl</code> is given.
	</p>

	<ul class="legend">
		<li><b>Present</b> the object answered with bytes that decode.</li>
		<li><b>Absent</b> the thing has no photos. No region, no placeholder.</li>
		<li><b>Refused</b> judged here, with no request made.</li>
		<li><b>Failed</b> the request was made and produced no picture.</li>
	</ul>

	<ul class="cases" data-testid="maps-photo-cases">
		{#each CASES as c (c.key)}
			<li data-case={c.key}>
				<p class="about"><b>{c.heading}</b> {c.about}</p>
				<MapsItemCard
					heading={c.heading}
					node={NODE}
					itemType={TYPE}
					photos={c.photos}
					supabaseUrl={c.supabaseUrl}
					nodeHref="/maps"
				/>
			</li>
		{/each}
	</ul>
</div>

<style>
	/*
	 * THE VIEWER'S OWN TOKENS, COPIED FROM `MapsViewer.svelte`'s `.mv-root`
	 * BLOCK, because the card reads them and this harness does not mount the
	 * viewer around it. They are stated here rather than aliased to the portal
	 * accents so a contrast reading taken on this page is a reading of the
	 * ground the card really sits on.
	 */
	.mv-plate {
		--mv-mark: var(--gold);
		--mv-accent-ink: var(--cyan);
		--mv-boundary: var(--boundary);
		padding: var(--space-5) var(--space-4);
		max-width: 74rem;
		margin: 0 auto;
	}
	h1 {
		font-family: var(--font-display);
		color: var(--mv-mark);
		margin: 0 0 var(--space-2);
	}
	.lede,
	.about {
		color: var(--text-2);
		max-width: 62ch;
	}
	.legend {
		list-style: none;
		margin: 0 0 var(--space-5);
		padding: 0;
		display: grid;
		gap: var(--space-1);
		color: var(--text-2);
	}
	.legend b {
		font-family: var(--font-mono);
		color: var(--text-1);
	}
	.cases {
		list-style: none;
		margin: 0;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(min(18rem, 100%), 1fr));
		gap: var(--space-4);
	}
	.cases > li {
		min-width: 0;
	}
	.about {
		margin: 0 0 var(--space-2);
		font-size: 0.875rem;
	}
	.about b {
		font-family: var(--font-mono);
		color: var(--text-1);
	}
</style>
