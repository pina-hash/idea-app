<script lang="ts">
	import { onMount } from 'svelte';
	import AvatarHoldsConsole from '$lib/AvatarHoldsConsole.svelte';
	import { createMemoryAvatarModeration } from '$lib/avatar-moderation';

	/**
	 * `/admin/avatars` as an admin sees it, with one picture already turned off
	 * (Ben, with a reason) and two accounts that can be turned off (Ana, Cal).
	 * The page chrome is the admin page's own header width and measure.
	 */
	const transports = createMemoryAvatarModeration({
		accounts: ['ana@boscotech.net', 'ben@boscotech.net', 'cal@boscotech.net'],
		held: [
			{
				email: 'ben@boscotech.net',
				name: 'Ben Ortiz',
				hiddenAt: '2026-10-15T20:40:00Z',
				hiddenBy: 'apina@boscotech.edu',
				reason: 'Not school appropriate.',
				hadPicture: true
			}
		]
	});
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});
</script>

<svelte:head><title>dev // profile pictures</title></svelte:head>

<main class="admin-page" data-ready={ready ? 'true' : undefined}>
	<section class="hero">
		<div class="eyebrow">Admin console</div>
		<h1>Profile pictures</h1>
	</section>
	<AvatarHoldsConsole {transports} />
</main>

<style>
	.admin-page {
		max-width: 48rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
</style>
