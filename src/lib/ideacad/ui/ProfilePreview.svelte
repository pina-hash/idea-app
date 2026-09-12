<script lang="ts">
	/**
	 * The body's 2D profile beside its station table: the same points
	 * `LatheGeometry` revolves, drawn as a polyline with a dot per station.
	 *
	 * IT IS DERIVED, NOT A SECOND MODEL. `profilePolyline` reads the stations
	 * handed in; a preview that built its own idea of the profile would draw a
	 * picture of a body nobody is going to get, which is the failure mode of
	 * every preview in this repository that stopped reading the payload it
	 * previews.
	 */
	import type { Station } from '../blade/tree';
	import { profilePolyline } from './feature-model';

	let { stations, width = 120, height = 150 }: { stations: Station[]; width?: number; height?: number } = $props();
	const drawn = $derived(profilePolyline(stations, width, height));
</script>

<figure class="profile">
	<svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={`Body profile, ${stations.length} stations`}>
		<!-- The axis of revolution, so a reader can see which edge is the centre. -->
		<line x1="6" y1="4" x2="6" y2={height - 4} class="axis" />
		<polyline points={drawn.points} class="line" />
		{#each drawn.dots as dot, i (i)}<circle cx={dot.x} cy={dot.y} r="3" class="dot" />{/each}
	</svg>
	<figcaption>Profile, revolved about the left edge</figcaption>
</figure>

<style>
	.profile {
		margin: 0.75rem 0 0;
	}
	svg {
		max-width: 100%;
		height: auto;
		background: var(--surface-0);
		border: 1px solid var(--hairline);
		border-radius: var(--radius-control);
	}
	.axis {
		stroke: var(--boundary);
		stroke-width: 1;
		stroke-dasharray: 3 3;
	}
	.line {
		fill: none;
		stroke: var(--green);
		stroke-width: 2;
	}
	.dot {
		fill: var(--green);
	}
	figcaption {
		font: 12px 'Share Tech Mono', monospace;
		color: var(--text-2);
		padding-top: 0.3rem;
	}
</style>
