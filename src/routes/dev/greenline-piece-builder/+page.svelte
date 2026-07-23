<script lang="ts">
	import PieceChainBuilder from '$lib/greenline/piece-builder/PieceChainBuilder.svelte';

	/**
	 * Harness for the v3 piece-chain builder. Nothing is stubbed: the component
	 * runs the real compiler (`diagnoseChain`) and the real export, and the
	 * document persists to localStorage exactly as it would anywhere else.
	 * `window.__glPieceBuilder` drives it from the console.
	 */
</script>

<svelte:head>
	<title>GREENLINE piece-chain builder (dev)</title>
</svelte:head>

<PieceChainBuilder />
