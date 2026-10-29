<script lang="ts">
	import AdminSubNav from '$lib/shell/AdminSubNav.svelte';
	import PageHeader from '$lib/shell/PageHeader.svelte';
	import AnimatedLogo from '$lib/brand/AnimatedLogo.svelte';
	import ProfileMenu from '$lib/ProfileMenu.svelte';
	import VersionBadge from '$lib/VersionBadge.svelte';
	import AvatarHoldsConsole from '$lib/AvatarHoldsConsole.svelte';
	import { createAvatarModerationTransports } from '$lib/avatar-moderation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	/* The real transports, on the browser client. Each RPC re-checks is_admin(). */
	const transports = $derived(createAvatarModerationTransports(data.supabase));
</script>

<svelte:head><title>Profile pictures · IDEA</title></svelte:head>

<div class="app-header">
	<a class="wordmark logo-mark" href="/" aria-label="IDEA home"><AnimatedLogo width={104} /></a>
	<div class="header-right">
		<a class="btn secondary" href="/dashboard#panel-pictures">&lsaquo; Admin console</a>
		<ProfileMenu />
	</div>
</div>
<AdminSubNav current="avatars" />

<main class="admin-page">
	<PageHeader eyebrow="IDEA Admin" title="Profile pictures" meta="Turn off a picture that should not be on the site, and turn it back on when it is sorted out." />

	<AvatarHoldsConsole {transports} />

	<footer class="page-footer"><VersionBadge app="portal" /></footer>
</main>

<style>
	.admin-page {
		max-width: 48rem;
		margin: 0 auto;
		padding: 0 1.2rem 3rem;
	}
	.page-footer {
		margin-top: 1.4rem;
		display: flex;
		justify-content: center;
	}
</style>
