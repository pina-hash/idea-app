<script lang="ts">
	/**
	 * The track's geometric accent mark: an ORIGINAL horizontal interlock of an
	 * outlined triangle, circle, and square (blue / red / ink strokes). It is
	 * inspired by that shape vocabulary but is deliberately its own composition;
	 * it is NOT the FIRST icon, must never be swapped for it, and must never be
	 * recolored to imitate it.
	 */
	let { height = 22 }: { height?: number } = $props();
	const width = $derived(Math.round(height * (64 / 30)));
</script>

<svg
	viewBox="0 0 64 30"
	{width}
	{height}
	fill="none"
	stroke-width="2.6"
	stroke-linejoin="round"
	stroke-linecap="round"
	aria-hidden="true"
>
	<path d="M12.5 5.5L22.5 24H2.5z" stroke="#0066b3" />
	<circle cx="31" cy="15" r="9.8" stroke="#ed1c24" />
	<path d="M42 5.5h19v19H42z" stroke="#231f20" />
</svg>
